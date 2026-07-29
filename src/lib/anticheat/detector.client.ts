// =====================================================================
// ANTI-CHEAT — client-side detector
// ---------------------------------------------------------------------
// Observes browser signals during live games and reports them in
// batches. Three hard rules:
//   1. Record, don't judge. Nothing here blocks input, bans, or even
//      warns the player — events are evidence for server-side scoring
//      and human review.
//   2. Never cost a frame. All listeners are passive; periodic checks
//      run through requestIdleCallback; reporting is batched and
//      fire-and-forget; a transport failure is swallowed (events are
//      persisted to localStorage and retried next session).
//   3. Degrade silently. Every probe is wrapped so an exotic browser
//      missing an API just skips that probe — the game never notices.
// =====================================================================

import { ANTICHEAT_CONFIG } from "./config";
import type { BrowserEventType, ClientEventBatch, ClientEventReport } from "./types";
import { isBrowserEventType } from "./types";

const CFG = ANTICHEAT_CONFIG.client;

type Meta = Record<string, string | number | boolean>;
type FlushTransport = (batch: ClientEventBatch) => Promise<void>;

type QueueEntry = { type: BrowserEventType; count: number; firstAt: number; meta?: Meta };

interface TabMessage {
  kind: "ping" | "pong";
  tabId: string;
  gameId: string | null;
  isPlayer: boolean;
}

function idle(cb: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => cb(), { timeout: 2_000 });
  } else {
    setTimeout(cb, 250);
  }
}

/** Wrap a probe so a hostile/exotic environment can never break gameplay. */
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    /* detection is best-effort by design */
  }
}

export class AntiCheatDetector {
  private transport: FlushTransport;
  private sessionId: string;
  private gameId: string | null = null;
  private isPlayer = false;
  private running = false;

  private queue = new Map<string, QueueEntry>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  private cleanups: Array<() => void> = [];
  private channel: BroadcastChannel | null = null;
  private tabId = Math.random().toString(36).slice(2);

  // visibility churn tracking
  private visibilityToggles: number[] = [];
  // devtools size heuristic (report once per open, not per resize)
  private devtoolsOpen = false;
  private devtoolsDebounce: ReturnType<typeof setTimeout> | null = null;
  // timer integrity heartbeat
  private lastBeat = 0;
  private clockOffsetBaseline: number | null = null;
  private clockSkewReported = false;
  // interaction/reaction tracking
  private lastPointerActivity = 0;
  private lastOpponentMoveAt = 0;
  private clickTimes: number[] = [];
  private macroReported = false;
  // one-shot session flags
  private multiTabReported = false;
  private integrityReported = new Set<string>();
  private integrityTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(transport: FlushTransport) {
    this.transport = transport;
    this.sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ── lifecycle ───────────────────────────────────────────────────────

  start(): void {
    if (this.running || typeof window === "undefined" || !ANTICHEAT_CONFIG.enabled) return;
    this.running = true;
    // Idle is measured from when monitoring began, not from the page's
    // time origin — otherwise a long-loaded tab looks idle on move one.
    this.lastPointerActivity = performance.now();

    safely(() => this.restorePending());
    safely(() => this.detectNavigationKind());
    safely(() => this.watchVisibility());
    safely(() => this.watchFocus());
    safely(() => this.watchDevtools());
    safely(() => this.watchKeyboardShortcuts());
    safely(() => this.watchTabs());
    safely(() => this.watchDomInjection());
    safely(() => this.watchPointer());
    safely(() => this.watchHistory());
    safely(() => this.startHeartbeat());
    safely(() => this.scheduleIntegritySweep());
    safely(() => this.watchUnload());

    this.flushTimer = setInterval(() => this.flush(), CFG.flushIntervalMs);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const c of this.cleanups.splice(0)) safely(c);
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    safely(() => this.channel?.close());
    this.channel = null;
    void this.flush();
  }

  /** Bind the detector to the game currently on screen. */
  setGame(gameId: string | null, isPlayer: boolean): void {
    this.gameId = gameId;
    this.isPlayer = isPlayer;
    if (gameId && isPlayer) safely(() => this.pingOtherTabs());
  }

  // ── public signals from the game page ───────────────────────────────

  /** The opponent's move just became visible to this player. */
  noteOpponentMove(): void {
    this.lastOpponentMoveAt = performance.now();
  }

  /** This player just committed a move (click/tap confirmed). */
  noteOwnMoveCommitted(): void {
    if (!this.isPlayer) return;
    const now = performance.now();
    if (this.lastOpponentMoveAt > 0) {
      const reaction = now - this.lastOpponentMoveAt;
      if (reaction >= 0 && reaction < CFG.instantReactionMs) {
        this.record("instant_reaction", { reactionMs: Math.round(reaction) });
        // Instant AND untouched-by-human beforehand → likely assisted.
        if (now - this.lastPointerActivity > CFG.idleBeforeReplyMs) {
          this.record("suspicious_idle", { reactionMs: Math.round(reaction) });
        }
      }
      this.lastOpponentMoveAt = 0;
    }
  }

  /** Realtime channel status changed for the active game. */
  noteConnection(status: "dropped" | "restored"): void {
    this.record(status === "dropped" ? "connection_drop" : "connection_restore");
  }

  // ── recording & transport ───────────────────────────────────────────

  record(type: BrowserEventType, meta?: Meta): void {
    if (!this.running || !isBrowserEventType(type)) return;
    const key = `${type}:${this.gameId ?? ""}`;
    const existing = this.queue.get(key);
    if (existing) {
      existing.count += 1;
      if (meta) existing.meta = meta; // keep the latest context
    } else {
      this.queue.set(key, { type, count: 1, firstAt: Date.now(), meta });
    }
    if (this.queue.size >= CFG.flushMaxEvents) void this.flush();
  }

  private drain(): ClientEventReport[] {
    const events = [...this.queue.values()].slice(0, CFG.maxEventsPerBatch).map((e) => ({
      type: e.type,
      count: e.count,
      firstAt: e.firstAt,
      meta: e.meta,
    }));
    this.queue.clear();
    return events;
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.size === 0) return;
    this.flushing = true;
    const events = this.drain();
    try {
      await this.transport({ gameId: this.gameId, sessionId: this.sessionId, events });
    } catch {
      // Transport failed (offline, server hiccup) — stash for next session.
      safely(() => this.persistPending(events));
    } finally {
      this.flushing = false;
    }
  }

  private persistPending(events: ClientEventReport[]): void {
    const raw = localStorage.getItem(CFG.pendingStorageKey);
    const prior: ClientEventReport[] = raw ? (JSON.parse(raw) as ClientEventReport[]) : [];
    const merged = [...prior, ...events].slice(-CFG.maxEventsPerBatch);
    localStorage.setItem(CFG.pendingStorageKey, JSON.stringify(merged));
  }

  private restorePending(): void {
    const raw = localStorage.getItem(CFG.pendingStorageKey);
    if (!raw) return;
    localStorage.removeItem(CFG.pendingStorageKey);
    const prior = JSON.parse(raw) as ClientEventReport[];
    for (const e of prior) {
      if (!isBrowserEventType(e.type) || typeof e.count !== "number") continue;
      const key = `${e.type}:restored`;
      const existing = this.queue.get(key);
      if (existing) existing.count += Math.max(1, Math.floor(e.count));
      else
        this.queue.set(key, {
          type: e.type,
          count: Math.max(1, Math.floor(e.count)),
          firstAt: typeof e.firstAt === "number" ? e.firstAt : Date.now(),
          meta: e.meta,
        });
    }
  }

  // ── probes ──────────────────────────────────────────────────────────

  private on<K extends keyof WindowEventMap>(
    target: Window | Document,
    type: K | string,
    handler: (ev: Event) => void,
    options?: AddEventListenerOptions,
  ): void {
    const wrapped = (ev: Event) => safely(() => handler(ev));
    target.addEventListener(type as string, wrapped, { passive: true, ...options });
    this.cleanups.push(() => target.removeEventListener(type as string, wrapped, options));
  }

  /** Refresh / back-forward arrival while a game may be running. */
  private detectNavigationKind(): void {
    const nav = performance.getEntriesByType?.("navigation")?.[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (!nav) return;
    if (nav.type === "reload") this.record("page_refresh");
    if (nav.type === "back_forward") this.record("back_navigation");
  }

  private watchVisibility(): void {
    this.on(document, "visibilitychange", () => {
      const now = Date.now();
      this.visibilityToggles.push(now);
      const cutoff = now - CFG.visibilityChurnWindowMs;
      this.visibilityToggles = this.visibilityToggles.filter((t) => t >= cutoff);
      if (document.visibilityState === "hidden") {
        this.record("tab_switch");
        // Losing visibility can outlive the tab — opportunistic flush.
        void this.flush();
      }
      if (this.visibilityToggles.length >= CFG.visibilityChurnThreshold) {
        this.visibilityToggles = [];
        this.record("excessive_visibility_toggle", {
          toggles: CFG.visibilityChurnThreshold,
          windowMs: CFG.visibilityChurnWindowMs,
        });
      }
    });
  }

  private watchFocus(): void {
    this.on(window, "blur", () => this.record("focus_loss"));
  }

  private watchDevtools(): void {
    const check = () => {
      const opened =
        Math.abs(window.outerWidth - window.innerWidth) > CFG.devtoolsSizeDelta ||
        Math.abs(window.outerHeight - window.innerHeight) > CFG.devtoolsSizeDelta;
      if (opened && !this.devtoolsOpen) {
        this.devtoolsOpen = true;
        this.record("devtools_open", {
          dw: window.outerWidth - window.innerWidth,
          dh: window.outerHeight - window.innerHeight,
        });
      } else if (!opened) {
        this.devtoolsOpen = false;
      }
    };
    this.on(window, "resize", () => {
      if (this.devtoolsDebounce) clearTimeout(this.devtoolsDebounce);
      this.devtoolsDebounce = setTimeout(() => safely(check), CFG.devtoolsCheckDebounceMs);
    });
    this.cleanups.push(() => {
      if (this.devtoolsDebounce) clearTimeout(this.devtoolsDebounce);
    });
    idle(check);
  }

  private watchKeyboardShortcuts(): void {
    this.on(window, "keydown", (ev) => {
      const e = ev as KeyboardEvent;
      const combo =
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["I", "J", "C", "i", "j", "c"].includes(e.key));
      if (combo) this.record("devtools_shortcut", { key: e.key });
    });
  }

  /** Multi-tab detection over BroadcastChannel. */
  private watchTabs(): void {
    if (typeof BroadcastChannel === "undefined") return;
    this.channel = new BroadcastChannel(CFG.broadcastChannel);
    this.channel.onmessage = (ev: MessageEvent<TabMessage>) => {
      safely(() => {
        const msg = ev.data;
        if (!msg || msg.tabId === this.tabId) return;
        if (msg.kind === "ping") {
          this.channel?.postMessage({
            kind: "pong",
            tabId: this.tabId,
            gameId: this.gameId,
            isPlayer: this.isPlayer,
          } satisfies TabMessage);
          return;
        }
        // pong from another live ChessOX tab
        if (msg.kind === "pong") {
          if (this.gameId && this.isPlayer && msg.gameId === this.gameId) {
            this.record("multiple_tabs_same_game", { otherTab: msg.tabId });
          } else if (!this.multiTabReported) {
            this.multiTabReported = true;
            this.record("multiple_tabs");
          }
        }
      });
    };
    this.cleanups.push(() => {
      if (this.channel) this.channel.onmessage = null;
    });
  }

  private pingOtherTabs(): void {
    this.channel?.postMessage({
      kind: "ping",
      tabId: this.tabId,
      gameId: this.gameId,
      isPlayer: this.isPlayer,
    } satisfies TabMessage);
  }

  /** Foreign script/iframe injected after load (assistance overlays). */
  private watchDomInjection(): void {
    if (typeof MutationObserver === "undefined") return;
    const origin = window.location.origin;
    const observer = new MutationObserver((mutations) => {
      safely(() => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            const tag = node.tagName;
            if (tag === "SCRIPT") {
              const src = (node as HTMLScriptElement).src;
              if (src && !src.startsWith(origin)) {
                this.record("dom_injection", { tag: "script", src: src.slice(0, 120) });
              }
            } else if (tag === "IFRAME") {
              const src = (node as HTMLIFrameElement).src ?? "";
              if (!src.startsWith(origin)) {
                this.record("dom_injection", { tag: "iframe", src: src.slice(0, 120) });
              }
            }
          }
        }
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    this.cleanups.push(() => observer.disconnect());
  }

  /** Pointer activity + synthetic-input + macro cadence detection. */
  private watchPointer(): void {
    this.on(
      window,
      "pointerdown",
      (ev) => {
        const e = ev as PointerEvent;
        const now = performance.now();
        if (e.isTrusted === false) {
          this.record("untrusted_input", { x: Math.round(e.clientX), y: Math.round(e.clientY) });
          return;
        }
        this.lastPointerActivity = now;
        // Macro cadence: N consecutive clicks whose intervals differ by
        // less than the jitter floor — humans cannot do this.
        this.clickTimes.push(now);
        if (this.clickTimes.length > CFG.macroClickRun) this.clickTimes.shift();
        if (this.clickTimes.length === CFG.macroClickRun && !this.macroReported) {
          const gaps: number[] = [];
          for (let i = 1; i < this.clickTimes.length; i++) {
            gaps.push(this.clickTimes[i] - this.clickTimes[i - 1]);
          }
          const min = Math.min(...gaps);
          const max = Math.max(...gaps);
          if (max - min <= CFG.macroClickJitterMs && min > 10) {
            this.macroReported = true;
            this.record("macro_pattern", {
              clicks: CFG.macroClickRun,
              spreadMs: Math.round(max - min),
              meanGapMs: Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length),
            });
          }
        }
      },
      { capture: true },
    );
    this.on(window, "pointermove", () => {
      this.lastPointerActivity = performance.now();
    });
    this.on(window, "keydown", () => {
      this.lastPointerActivity = performance.now();
    });
  }

  private watchHistory(): void {
    this.on(window, "popstate", () => {
      if (this.gameId && this.isPlayer) this.record("back_navigation");
    });
  }

  /** Timer throttling + wall-clock manipulation heartbeat. */
  private startHeartbeat(): void {
    this.lastBeat = performance.now();
    this.clockOffsetBaseline = Date.now() - performance.now();
    const beat = setInterval(() => {
      safely(() => {
        const now = performance.now();
        const drift = now - this.lastBeat - CFG.heartbeatIntervalMs;
        this.lastBeat = now;
        // Background tabs are throttled legitimately; only visible ones count.
        if (drift > CFG.heartbeatDriftMs && document.visibilityState === "visible") {
          this.record("timer_anomaly", { driftMs: Math.round(drift) });
        }
        if (this.clockOffsetBaseline !== null && !this.clockSkewReported) {
          const offset = Date.now() - now;
          const skew = Math.abs(offset - this.clockOffsetBaseline);
          if (skew > CFG.clockSkewThresholdMs) {
            this.clockSkewReported = true;
            this.record("clock_skew", { skewMs: Math.round(skew) });
          }
        }
      });
    }, CFG.heartbeatIntervalMs);
    this.cleanups.push(() => clearInterval(beat));
  }

  /** Verify core natives haven't been monkey-patched by console/extension. */
  private scheduleIntegritySweep(): void {
    const sweep = () => {
      if (!this.running) return;
      safely(() => {
        const natives: Array<[string, unknown]> = [
          ["fetch", window.fetch],
          ["setTimeout", window.setTimeout],
          ["setInterval", window.setInterval],
          ["addEventListener", window.addEventListener],
          ["Date.now", Date.now],
          ["performance.now", performance.now],
          ["WebSocket.send", typeof WebSocket !== "undefined" ? WebSocket.prototype.send : null],
        ];
        for (const [name, fn] of natives) {
          if (typeof fn !== "function") continue;
          let src = "";
          try {
            src = Function.prototype.toString.call(fn);
          } catch {
            src = "";
          }
          if (src && !src.includes("[native code]") && !this.integrityReported.has(name)) {
            this.integrityReported.add(name);
            this.record("function_override", { fn: name });
          }
        }
        // console tampering: replaced log/warn/error methods
        for (const method of ["log", "warn", "error"] as const) {
          const fn = console[method];
          let src = "";
          try {
            src = Function.prototype.toString.call(fn);
          } catch {
            src = "";
          }
          const key = `console.${method}`;
          if (src && !src.includes("[native code]") && !this.integrityReported.has(key)) {
            this.integrityReported.add(key);
            this.record("console_tamper", { fn: key });
          }
        }
      });
      if (this.running) {
        this.integrityTimer = setTimeout(() => idle(sweep), CFG.integrityCheckIntervalMs);
      }
    };
    this.cleanups.push(() => {
      if (this.integrityTimer) clearTimeout(this.integrityTimer);
    });
    idle(sweep);
  }

  /** Last-chance persistence when the tab goes away mid-queue. */
  private watchUnload(): void {
    this.on(window, "pagehide", () => {
      if (this.queue.size > 0) {
        const events = this.drain();
        this.persistPending(events);
      }
    });
  }
}
