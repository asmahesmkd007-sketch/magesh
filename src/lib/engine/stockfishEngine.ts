// =====================================================================
// Stockfish engine controller
// ---------------------------------------------------------------------
// Owns the Stockfish WASM worker and exposes a typed, event-driven API:
//
//   const engine = getSharedEngine();
//   engine.setOptions({ multiPv: 3, hash: 64 });
//   engine.search({ fen, infinite: true });          // live analysis
//   const r = await engine.evaluate({ fen, depth }); // batch (game review)
//   engine.stop();
//
// UCI has no request ids, so correctness here comes from strict search
// serialization: at most one `go` is in flight; a new request queues and
// is started when the previous search acknowledges `stop` via `bestmove`.
// The worker is spawned lazily on first use and can be disposed/restarted
// after a crash. All scores are reported from the side to move (UCI
// convention) — callers convert perspective via scoreForWhite().
// =====================================================================
import { logger } from "@/lib/logger";
import { parseBestMove, parseInfoLine, type UciBestMove, type UciInfoLine } from "./uci";

export type EngineStatus = "unloaded" | "loading" | "ready" | "searching" | "error";

export type EngineOptions = {
  /** Number of candidate lines to report (UCI MultiPV), 1–5. */
  multiPv: number;
  /** Worker threads — honoured only by the multi-threaded build. */
  threads: number;
  /** Transposition table size in MB. */
  hash: number;
};

export type SearchRequest = {
  fen: string;
  /** Fixed depth target; omit with `infinite` for endless analysis. */
  depth?: number;
  /** Fixed time budget in ms (alternative to depth). */
  movetimeMs?: number;
  infinite?: boolean;
};

export type SearchSnapshot = {
  fen: string;
  /** Best-first candidate lines, indexed by MultiPV rank (0 = best). */
  lines: UciInfoLine[];
  bestMove: UciBestMove | null;
  /** True once the search has ended (bestmove received). */
  done: boolean;
};

type Listener = () => void;

export const ENGINE_LIMITS = {
  multiPv: { min: 1, max: 5 },
  threads: { min: 1, max: Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1) },
  hash: { min: 16, max: 512 },
  depth: { min: 6, max: 30 },
} as const;

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  multiPv: 3,
  threads: Math.min(4, ENGINE_LIMITS.threads.max),
  hash: 64,
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v)));

export function clampEngineOptions(opts: Partial<EngineOptions>): Partial<EngineOptions> {
  const out: Partial<EngineOptions> = {};
  if (opts.multiPv !== undefined)
    out.multiPv = clamp(opts.multiPv, ENGINE_LIMITS.multiPv.min, ENGINE_LIMITS.multiPv.max);
  if (opts.threads !== undefined)
    out.threads = clamp(opts.threads, ENGINE_LIMITS.threads.min, ENGINE_LIMITS.threads.max);
  if (opts.hash !== undefined)
    out.hash = clamp(opts.hash, ENGINE_LIMITS.hash.min, ENGINE_LIMITS.hash.max);
  return out;
}

/**
 * True when the page is cross-origin isolated, which unlocks
 * SharedArrayBuffer and therefore the multi-threaded engine build.
 */
export function supportsThreads(): boolean {
  return typeof globalThis.crossOriginIsolated === "boolean" && globalThis.crossOriginIsolated;
}

function enginePath(): string {
  return supportsThreads() ? "/engine/stockfish-18-lite.js" : "/engine/stockfish-18-lite-single.js";
}

export class StockfishEngine {
  private worker: Worker | null = null;
  private status_: EngineStatus = "unloaded";
  private options: EngineOptions = { ...DEFAULT_ENGINE_OPTIONS };
  private optionsDirty = true;

  /** The search currently executing inside the engine (one at a time). */
  private active: {
    request: SearchRequest;
    snapshot: SearchSnapshot;
    resolve?: (s: SearchSnapshot) => void;
    reject?: (e: Error) => void;
  } | null = null;
  /** The most recent request received while another search was running. */
  private queued: {
    request: SearchRequest;
    resolve?: (s: SearchSnapshot) => void;
    reject?: (e: Error) => void;
  } | null = null;
  /** Set when `stop` was sent and we are draining the active search. */
  private stopping = false;

  private initPromise: Promise<void> | null = null;
  private initResolve: (() => void) | null = null;

  private listeners = new Set<Listener>();
  private latest: SearchSnapshot | null = null;

  // ── Public surface ─────────────────────────────────────────────────

  get status(): EngineStatus {
    return this.status_;
  }

  get currentOptions(): EngineOptions {
    return { ...this.options };
  }

  /** Latest snapshot of the running/most recent search (for UIs). */
  get snapshot(): SearchSnapshot | null {
    return this.latest;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Engine build actually in use (threaded builds need COOP/COEP). */
  get threaded(): boolean {
    return supportsThreads();
  }

  setOptions(opts: Partial<EngineOptions>): void {
    const clamped = clampEngineOptions(opts);
    const next = { ...this.options, ...clamped };
    if (
      next.multiPv === this.options.multiPv &&
      next.threads === this.options.threads &&
      next.hash === this.options.hash
    )
      return;
    this.options = next;
    this.optionsDirty = true;
    // Options apply before the next `go`; restart a live infinite search
    // so MultiPV changes take effect immediately.
    if (this.active && this.active.request.infinite && !this.stopping) {
      this.search(this.active.request);
    }
    this.emit();
  }

  /**
   * Start (or replace) a live search. Any running search is stopped and
   * the new one begins as soon as the engine acknowledges. Fire-and-listen:
   * consume progress via subscribe() + snapshot.
   */
  search(request: SearchRequest): void {
    void this.enqueue(request);
  }

  /**
   * Evaluate a position to a fixed depth/time and resolve with the final
   * snapshot. Used by the game analyzer. Rejects if superseded by a newer
   * request or if the engine dies.
   */
  evaluate(request: SearchRequest): Promise<SearchSnapshot> {
    if (request.infinite) throw new Error("evaluate() requires a bounded search");
    return this.enqueue(request);
  }

  /** Stop the current search (its final snapshot remains readable). */
  stop(): void {
    if (this.worker && this.active && !this.stopping) {
      this.stopping = true;
      this.post("stop");
    }
    // Drop anything waiting behind the active search.
    if (this.queued) {
      this.queued.reject?.(new Error("superseded"));
      this.queued = null;
    }
  }

  /** Terminate the worker entirely (e.g. leaving the analysis page). */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.status_ = "unloaded";
    this.initPromise = null;
    this.initResolve = null;
    this.stopping = false;
    const err = new Error("engine disposed");
    this.active?.reject?.(err);
    this.queued?.reject?.(err);
    this.active = null;
    this.queued = null;
    this.emit();
  }

  // ── Internals ──────────────────────────────────────────────────────

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private post(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  private ensureWorker(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.status_ = "loading";
    this.emit();

    this.initPromise = new Promise<void>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(enginePath());
      } catch (e) {
        this.status_ = "error";
        this.emit();
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      this.worker = worker;
      this.initResolve = resolve;

      worker.onmessage = (e: MessageEvent) => {
        const line = typeof e.data === "string" ? e.data : "";
        if (line) this.onLine(line);
      };
      worker.onerror = (e) => {
        logger.error("stockfish worker error", { message: e.message });
        this.status_ = "error";
        const err = new Error(`engine failed: ${e.message || "worker error"}`);
        this.active?.reject?.(err);
        this.queued?.reject?.(err);
        this.active = null;
        this.queued = null;
        this.emit();
        reject(err);
      };

      worker.postMessage("uci");
    });
    return this.initPromise;
  }

  private onLine(line: string): void {
    if (line === "uciok") {
      this.status_ = "ready";
      this.optionsDirty = true;
      this.initResolve?.();
      this.initResolve = null;
      this.emit();
      return;
    }

    if (line.startsWith("bestmove")) {
      const best = parseBestMove(line);
      const finished = this.active;
      this.active = null;
      this.stopping = false;
      if (finished) {
        finished.snapshot.bestMove = best;
        finished.snapshot.done = true;
        this.latest = { ...finished.snapshot };
        finished.resolve?.(this.latest);
      }
      this.status_ = "ready";
      this.emit();
      // Start whatever queued up while this search was running.
      if (this.queued) {
        const q = this.queued;
        this.queued = null;
        void this.begin(q.request, q.resolve, q.reject);
      }
      return;
    }

    const info = parseInfoLine(line);
    if (info && this.active && !this.stopping) {
      const lines = this.active.snapshot.lines.slice();
      lines[info.multipv - 1] = info;
      this.active.snapshot = { ...this.active.snapshot, lines };
      this.latest = this.active.snapshot;
      this.emit();
    }
  }

  private enqueue(request: SearchRequest): Promise<SearchSnapshot> {
    return new Promise<SearchSnapshot>((resolve, reject) => {
      if (this.active) {
        // Replace any previously queued request — only the newest matters.
        this.queued?.reject?.(new Error("superseded"));
        this.queued = { request, resolve, reject };
        if (!this.stopping) {
          this.stopping = true;
          this.post("stop");
        }
      } else {
        void this.begin(request, resolve, reject);
      }
    });
  }

  private async begin(
    request: SearchRequest,
    resolve?: (s: SearchSnapshot) => void,
    reject?: (e: Error) => void,
  ): Promise<void> {
    try {
      await this.ensureWorker();
    } catch (e) {
      reject?.(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    if (this.optionsDirty) {
      this.post(`setoption name MultiPV value ${this.options.multiPv}`);
      if (this.threaded) this.post(`setoption name Threads value ${this.options.threads}`);
      this.post(`setoption name Hash value ${this.options.hash}`);
      this.optionsDirty = false;
    }

    this.active = {
      request,
      snapshot: { fen: request.fen, lines: [], bestMove: null, done: false },
      resolve,
      reject,
    };
    this.latest = this.active.snapshot;
    this.status_ = "searching";

    this.post(`position fen ${request.fen}`);
    if (request.infinite) {
      this.post("go infinite");
    } else if (request.movetimeMs) {
      this.post(`go movetime ${Math.max(50, Math.round(request.movetimeMs))}`);
    } else {
      const depth = clamp(request.depth ?? 18, 1, 99);
      this.post(`go depth ${depth}`);
    }
    this.emit();
  }
}

// ── Shared instance ──────────────────────────────────────────────────
// The WASM engine costs ~7 MB + init time; one instance serves the whole
// app. Components subscribe rather than owning their own copy.
let shared: StockfishEngine | null = null;

export function getSharedEngine(): StockfishEngine {
  if (!shared) shared = new StockfishEngine();
  return shared;
}
