import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Swords,
  Cpu,
  Users,
  History,
  Volume2,
  VolumeX,
  ChevronRight,
  Zap,
  MessageSquare,
} from "lucide-react";
import { Card, GoldButton, GhostButton, PageShell } from "@/components/site/Primitives";
import { VsComputer } from "@/components/site/VsComputer";
import { QuickMatch } from "@/components/site/QuickMatch";
import { InteractiveBoard, type BoardCell } from "@/components/site/InteractiveBoard";
import {
  useBoardSettings,
  BOARD_THEMES,
  BOARD_THEME_LABELS,
  BOARD_THEME_ORDER,
  PIECE_THEME_LABELS,
  PIECE_THEME_ORDER,
  DEFAULT_SETTINGS,
  type BoardTheme,
  type PieceTheme,
} from "@/hooks/useBoardSettings";
import { PieceGlyph } from "@/lib/chess/pieceThemes";

export const Route = createFileRoute("/play/")({
  head: () => ({
    meta: [
      { title: "Play Chess — ChessOx" },
      { name: "description", content: "Play live chess against friends or the ChessOx engine." },
    ],
  }),
  component: Play,
});

const MODES = [
  {
    id: "quick",
    icon: Zap,
    title: "Quick Match",
    sub: "Ranked · auto-paired",
    href: null,
    tab: "quick" as const,
    gold: true,
  },
  {
    id: "friend",
    icon: Swords,
    title: "Friend Challenge",
    sub: "Private match · share a link",
    href: "/play/friend" as const,
    tab: null,
    gold: false,
  },
  {
    id: "bot",
    icon: Cpu,
    title: "Vs Computer",
    sub: "Five difficulty levels",
    href: null,
    tab: "bot" as const,
    gold: false,
  },
  {
    id: "history",
    icon: History,
    title: "Game History",
    sub: "Review your past matches",
    href: "/play/history" as const,
    tab: null,
    gold: false,
  },
  {
    id: "room",
    icon: MessageSquare,
    title: "Public Room",
    sub: "Community chat · find opponents",
    href: "/room" as const,
    tab: null,
    gold: false,
  },
];

// Static preview board (starting position subset)
const PREVIEW_BOARD: BoardCell[][] = (() => {
  const empty = (): BoardCell[][] => Array.from({ length: 8 }, () => Array(8).fill(null));
  const b = empty();
  const place = (
    r: number,
    c: number,
    color: "w" | "b",
    type: "k" | "q" | "r" | "b" | "n" | "p",
  ) => {
    b[r][c] = { square: `${"abcdefgh"[c]}${8 - r}` as never, type, color };
  };
  [0, 7].forEach((c) => {
    place(0, c, "b", "r");
    place(7, c, "w", "r");
  });
  [1, 6].forEach((c) => {
    place(0, c, "b", "n");
    place(7, c, "w", "n");
  });
  [2, 5].forEach((c) => {
    place(0, c, "b", "b");
    place(7, c, "w", "b");
  });
  place(0, 3, "b", "q");
  place(0, 4, "b", "k");
  place(7, 3, "w", "q");
  place(7, 4, "w", "k");
  for (let c = 0; c < 8; c++) {
    place(1, c, "b", "p");
    place(6, c, "w", "p");
  }
  return b;
})();

function Play() {
  const [tab, setTab] = useState<"modes" | "quick" | "bot" | "settings">("modes");
  const { settings, updateSettings } = useBoardSettings();

  // Draft appearance — lets the user preview a board/piece theme before committing
  // it. Apply persists (localStorage + profile); Reset restores factory defaults.
  const [draftBoard, setDraftBoard] = useState<BoardTheme>(settings.boardTheme);
  const [draftPiece, setDraftPiece] = useState<PieceTheme>(settings.pieceTheme);
  const dirty = draftBoard !== settings.boardTheme || draftPiece !== settings.pieceTheme;

  const applyThemes = () => updateSettings({ boardTheme: draftBoard, pieceTheme: draftPiece });
  const resetThemes = () => {
    setDraftBoard(DEFAULT_SETTINGS.boardTheme);
    setDraftPiece(DEFAULT_SETTINGS.pieceTheme);
    updateSettings({
      boardTheme: DEFAULT_SETTINGS.boardTheme,
      pieceTheme: DEFAULT_SETTINGS.pieceTheme,
    });
  };

  return (
    <PageShell
      eyebrow="The Arena"
      title="Play Chess"
      subtitle="Choose your battlefield and begin your reign."
    >
      {/* Tab bar */}
      <div className="mb-8 flex flex-wrap gap-2">
        {(["modes", "quick", "bot", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-5 py-2 text-sm capitalize transition ${tab === t
                ? "border-gold bg-gold/10 text-gold"
                : "border-white/10 text-muted-foreground hover:border-gold/30"
              }`}
          >
            {t === "modes"
              ? "Play Modes"
              : t === "quick"
                ? "Quick Match"
                : t === "bot"
                  ? "Vs Computer"
                  : "Board Settings"}
          </button>
        ))}
        <Link
          to="/room"
          className="rounded-full border border-white/10 px-5 py-2 text-sm text-muted-foreground transition hover:border-gold/30 hover:text-foreground"
        >
          Public Room
        </Link>
      </div>

      {tab === "modes" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {MODES.map((m) => {
            const Icon = m.icon;
            const inner = (
              <Card
                className={`group relative flex h-full cursor-pointer flex-col overflow-hidden p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-gold/10 ${m.gold
                    ? "border-gold/40 bg-gradient-to-b from-gold/10 to-background/50"
                    : "border-white/5 bg-white/[0.02] hover:border-gold/30 hover:bg-gold/[0.02]"
                  }`}
              >
                {/* Subtle glow effect on hover */}
                <div className={`absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${m.gold ? "bg-gradient-to-tr from-gold/10 via-transparent to-transparent" : "bg-gradient-to-tr from-gold/5 via-transparent to-transparent"}`} />

                <span
                  className={`relative z-10 grid h-14 w-14 place-items-center rounded-2xl shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 ${m.gold ? "gradient-gold text-background shadow-gold/20" : "bg-gradient-to-br from-white/10 to-white/5 text-gold shadow-black/50 border border-white/5"}`}
                >
                  <Icon className="h-7 w-7" />
                </span>

                <div className="relative z-10 mt-6">
                  <div className={`font-display text-xl transition-colors ${m.gold ? "text-gold" : "group-hover:text-gold"}`}>{m.title}</div>
                  <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.sub}</div>
                </div>

                <div className="relative z-10 mt-auto pt-6 flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase text-gold opacity-80 transition-all group-hover:opacity-100">
                  {m.gold ? "Play now" : "Open"} <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </div>
              </Card>
            );
            if (!m.href) {
              return (
                <div key={m.id} onClick={() => setTab(m.tab ?? "bot")}>
                  {inner}
                </div>
              );
            }
            return (
              <Link key={m.id} to={m.href}>
                {inner}
              </Link>
            );
          })}
        </div>
      )}

      {tab === "quick" && (
        <div className="mx-auto max-w-md">
          <QuickMatch onPlayBot={() => setTab("bot")} />
        </div>
      )}

      {tab === "bot" && (
        <div>
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => setTab("modes")}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to modes
            </button>
          </div>
          <VsComputer />
        </div>
      )}

      {tab === "settings" && (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-8">
            {/* Board Theme */}
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.22em] text-gold/80">
                  Appearance · Board Themes
                </div>
                <span className="text-[10px] text-muted-foreground">{BOARD_THEME_ORDER.length} themes</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BOARD_THEME_ORDER.map((t) => (
                  <button
                    key={t}
                    onClick={() => setDraftBoard(t)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${draftBoard === t
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-white/10 hover:border-gold/30"
                      }`}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 overflow-hidden rounded-sm border border-white/10"
                      aria-hidden
                    >
                      <span className="h-full w-1/2" style={{ background: BOARD_THEMES[t].light }} />
                      <span className="h-full w-1/2" style={{ background: BOARD_THEMES[t].dark }} />
                    </span>
                    <span className="truncate">{BOARD_THEME_LABELS[t]}</span>
                  </button>
                ))}
              </div>
            </Card>

            {/* Piece Theme */}
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.22em] text-gold/80">
                  Appearance · Piece Themes
                </div>
                <span className="text-[10px] text-muted-foreground">{PIECE_THEME_ORDER.length} sets</span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {PIECE_THEME_ORDER.map((t) => (
                  <button
                    key={t}
                    onClick={() => setDraftPiece(t)}
                    className={`flex flex-col items-center justify-center gap-3 rounded-xl border p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-lg ${draftPiece === t
                        ? "border-gold bg-gold/10 text-gold shadow-gold/10"
                        : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-gold/30 hover:bg-gold/[0.02]"
                      }`}
                  >
                    <span className="h-12 w-12 drop-shadow-md">
                      <PieceGlyph theme={t} color="w" type="n" />
                    </span>
                    <span className="truncate text-xs font-medium">{PIECE_THEME_LABELS[t]}</span>
                  </button>
                ))}
              </div>
            </Card>

            {/* Sound & Visual */}
            <Card className="p-6">
              <div className="mb-4 text-xs uppercase tracking-[0.22em] text-gold/80">Options</div>
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center justify-between">
                  <div className="flex items-center gap-3 text-sm">
                    {settings.soundEnabled ? (
                      <Volume2 className="h-4 w-4 text-gold" />
                    ) : (
                      <VolumeX className="h-4 w-4 text-muted-foreground" />
                    )}
                    Sound effects
                  </div>
                  <button
                    onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
                    className={`relative h-6 w-11 rounded-full transition ${settings.soundEnabled ? "gradient-gold" : "bg-white/10"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${settings.soundEnabled ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`}
                    />
                  </button>
                </label>
                <label className="flex cursor-pointer items-center justify-between">
                  <span className="text-sm">Show coordinates</span>
                  <button
                    onClick={() => updateSettings({ showCoords: !settings.showCoords })}
                    className={`relative h-6 w-11 rounded-full transition ${settings.showCoords ? "gradient-gold" : "bg-white/10"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${settings.showCoords ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`}
                    />
                  </button>
                </label>
                <label className="flex cursor-pointer items-center justify-between">
                  <span className="text-sm">Auto-flip board (local play)</span>
                  <button
                    onClick={() => updateSettings({ autoFlip: !settings.autoFlip })}
                    className={`relative h-6 w-11 rounded-full transition ${settings.autoFlip ? "gradient-gold" : "bg-white/10"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${settings.autoFlip ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`}
                    />
                  </button>
                </label>
              </div>
            </Card>
          </div>

          {/* Live Preview */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.22em] text-gold/80">Visual Preview</div>
              <div className="text-[11px] text-muted-foreground">
                {BOARD_THEME_LABELS[draftBoard]} · {PIECE_THEME_LABELS[draftPiece]}
                {dirty && <span className="ml-2 text-gold">● unsaved</span>}
              </div>
            </div>
            <InteractiveBoard
              board={PREVIEW_BOARD}
              orientation="w"
              disabled
              colors={BOARD_THEMES[draftBoard]}
              pieceTheme={draftPiece}
              showCoords={settings.showCoords}
            />
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <GoldButton
                onClick={applyThemes}
                disabled={!dirty}
                className={!dirty ? "opacity-40 pointer-events-none" : ""}
              >
                Apply Theme
              </GoldButton>
              <GhostButton onClick={resetThemes}>Reset to Default</GhostButton>
              <GhostButton onClick={() => setTab("modes")}>Done</GhostButton>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
