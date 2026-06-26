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
  PIECE_SETS,
  type BoardTheme,
  type PieceTheme,
} from "@/hooks/useBoardSettings";

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

const BOARD_THEME_LABELS: Record<BoardTheme, string> = {
  royal: "Royal (Default)",
  forest: "Forest",
  ocean: "Ocean",
  midnight: "Midnight",
  ivory: "Ivory",
};

const PIECE_THEME_LABELS: Record<PieceTheme, string> = {
  unicode: "Unicode",
  classic: "Classic",
  outlined: "Outlined",
};

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

  const colors = BOARD_THEMES[settings.boardTheme];
  const pieces = PIECE_SETS[settings.pieceTheme];

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
            className={`rounded-full border px-5 py-2 text-sm capitalize transition ${
              tab === t
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
                className={`flex cursor-pointer flex-col gap-4 p-6 transition hover:scale-[1.02] hover:shadow-xl ${
                  m.gold ? "border border-gold/30 bg-gold/[0.04]" : ""
                }`}
              >
                <span
                  className={`grid h-12 w-12 place-items-center rounded-2xl ${m.gold ? "gradient-gold text-background" : "bg-white/5 text-gold"}`}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <div>
                  <div className="font-display text-lg">{m.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{m.sub}</div>
                </div>
                <div className="mt-auto flex items-center gap-1 text-xs text-gold">
                  {m.gold ? "Play now" : "Open"} <ChevronRight className="h-3 w-3" />
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
          <QuickMatch />
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
              <div className="mb-4 text-xs uppercase tracking-[0.22em] text-gold/80">
                Board Theme
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateSettings({ boardTheme: t })}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                      settings.boardTheme === t
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-white/10 hover:border-gold/30"
                    }`}
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-sm border border-white/10"
                      style={{ background: BOARD_THEMES[t].light }}
                    />
                    <span
                      className="h-4 w-4 shrink-0 rounded-sm border border-white/10"
                      style={{ background: BOARD_THEMES[t].dark }}
                    />
                    <span className="truncate">{BOARD_THEME_LABELS[t]}</span>
                  </button>
                ))}
              </div>
            </Card>

            {/* Piece Theme */}
            <Card className="p-6">
              <div className="mb-4 text-xs uppercase tracking-[0.22em] text-gold/80">
                Piece Theme
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PIECE_SETS) as PieceTheme[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateSettings({ pieceTheme: t })}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition ${
                      settings.pieceTheme === t
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-white/10 hover:border-gold/30"
                    }`}
                  >
                    <span className="font-chess text-xl">{PIECE_SETS[t].wk}</span>
                    <span>{PIECE_THEME_LABELS[t]}</span>
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
            <div className="mb-4 text-xs uppercase tracking-[0.22em] text-gold/80">
              Visual Preview
            </div>
            <InteractiveBoard
              board={PREVIEW_BOARD}
              orientation="w"
              disabled
              colors={colors}
              pieces={pieces}
            />
            <div className="mt-4 flex justify-center gap-3">
              <GoldButton
                onClick={() =>
                  updateSettings({
                    boardTheme: "royal",
                    pieceTheme: "unicode",
                    soundEnabled: true,
                    showCoords: true,
                    autoFlip: false,
                  })
                }
              >
                Reset to Defaults
              </GoldButton>
              <GhostButton onClick={() => setTab("modes")}>Done</GhostButton>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
