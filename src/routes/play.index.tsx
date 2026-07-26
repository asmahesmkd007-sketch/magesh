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
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/play/")({
  head: () =>
    seo({
      title: "Play Chess Online — Free Multiplayer Chess Game | ChessOx",
      description:
        "Play chess online free: ranked quick match against players worldwide, private chess games with friends, five computer difficulty levels and public chess rooms.",
      keywords: [
        "play chess online",
        "online chess game",
        "multiplayer chess game",
        "chess game online",
        "free online chess",
      ],
      path: "/play",
      jsonLd: [
        webPageLd({
          name: "Play Chess Online — ChessOx",
          description:
            "Ways to play chess online on ChessOx: ranked quick match, friend challenges over a private link, vs computer, local two-player chess and public rooms.",
          path: "/play",
          primaryTopic: "Online chess game",
          about: ["Online chess game", "Multiplayer chess", "Play chess with friends"],
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Play Chess", path: "/play" },
        ]),
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
      eyebrow={tab === "modes" ? "The Arena" : undefined}
      title={tab === "modes" ? "Play Chess" : undefined}
      subtitle={tab === "modes" ? "Choose your battlefield and begin your reign." : undefined}
      compact={true}
      action={
        tab === "modes" ? (
          <div className="flex items-center gap-3">
            <Link
              to="/play/history"
              className="flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm text-muted-foreground transition hover:border-gold/30 hover:text-foreground"
            >
              <History className="h-4 w-4" />
              Game History
            </Link>
            <button
              onClick={() => setTab("settings")}
              className="flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-5 py-2.5 text-sm text-gold transition hover:bg-gold/10 hover:text-gold"
            >
              Board Settings
            </button>
          </div>
        ) : undefined
      }
    >
      {tab === "modes" && (
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
          {MODES.filter((m) => m.id !== "history").map((m, i) => {
            const isWide = i === 0 || i === 3;
            const Icon = m.icon;

            const inner = (
              <Card
                className={`group relative flex h-full cursor-pointer overflow-hidden p-5 md:p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-gold/10 ${
                  m.gold
                    ? "border-gold/40 bg-gradient-to-br from-gold/10 to-background/50"
                    : "border-white/5 bg-white/[0.02] hover:border-gold/30 hover:bg-gold/[0.02]"
                } ${isWide ? "flex-col md:flex-row items-start md:items-center gap-5 md:gap-6" : "flex-col justify-between"}`}
              >
                {/* Subtle glow effect on hover */}
                <div
                  className={`absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${m.gold ? "bg-gradient-to-tr from-gold/10 via-transparent to-transparent" : "bg-gradient-to-tr from-white/5 via-transparent to-transparent"}`}
                />

                {isWide ? (
                  <>
                    <span
                      className={`relative z-10 flex shrink-0 items-center justify-center rounded-2xl md:rounded-3xl shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 ${m.gold ? "h-16 w-16 md:h-20 md:w-20 gradient-gold text-background shadow-gold/20" : "h-14 w-14 md:h-16 md:w-16 bg-gradient-to-br from-white/10 to-white/5 text-gold shadow-black/50 border border-white/5"}`}
                    >
                      <Icon
                        className={m.gold ? "h-8 w-8 md:h-10 md:w-10" : "h-7 w-7 md:h-8 md:w-8"}
                      />
                    </span>
                    <div className="relative z-10 flex-1 w-full mt-3 md:mt-0">
                      <div
                        className={`font-display text-3xl md:text-4xl transition-colors ${m.gold ? "text-gold" : "group-hover:text-gold"}`}
                      >
                        {m.title}
                      </div>
                      <div className="mt-2 text-sm md:text-base text-muted-foreground">{m.sub}</div>
                    </div>
                    <div className="relative z-10 flex shrink-0 items-center gap-2 text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase text-gold opacity-80 transition-all group-hover:opacity-100 group-hover:translate-x-1 mt-4 md:mt-0">
                      {m.gold ? "Play now" : "Open"}{" "}
                      <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <span
                        className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl md:rounded-2xl shadow-lg transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 ${m.gold ? "gradient-gold text-background shadow-gold/20" : "bg-gradient-to-br from-white/10 to-white/5 text-gold shadow-black/50 border border-white/5"}`}
                      >
                        <Icon className="h-6 w-6" />
                      </span>

                      <div className="relative z-10 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-gold opacity-80 transition-all group-hover:opacity-100 group-hover:translate-x-1 mt-2">
                        {m.gold ? "Play now" : "Open"} <ChevronRight className="h-3 w-3" />
                      </div>
                    </div>

                    <div className="relative z-10 mt-8">
                      <div
                        className={`font-display text-2xl md:text-3xl transition-colors ${m.gold ? "text-gold" : "group-hover:text-gold"}`}
                      >
                        {m.title}
                      </div>
                      <div className="mt-1.5 text-xs md:text-sm text-muted-foreground">{m.sub}</div>
                    </div>
                  </>
                )}
              </Card>
            );

            const wrapperClass = isWide ? "md:col-span-2" : "md:col-span-1";

            if (!m.href) {
              return (
                <div key={m.id} className={wrapperClass} onClick={() => setTab(m.tab ?? "bot")}>
                  {inner}
                </div>
              );
            }
            return (
              <Link key={m.id} to={m.href} className={wrapperClass}>
                {inner}
              </Link>
            );
          })}
        </div>
      )}

      {tab === "quick" && (
        <div className="relative w-full py-8 md:py-12 flex items-center justify-center">
          {/* Background Watermark */}
          <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none select-none overflow-hidden">
            <div className="font-display text-[5rem] md:text-[8rem] lg:text-[11rem] leading-none tracking-[0.15em] text-gold text-center whitespace-nowrap">
              CHESS OX
            </div>
          </div>

          <div className="relative z-10 w-full max-w-md">
            <QuickMatch onPlayBot={() => setTab("bot")} />
          </div>
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
                <span className="text-[10px] text-muted-foreground">
                  {BOARD_THEME_ORDER.length} themes
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BOARD_THEME_ORDER.map((t) => (
                  <button
                    key={t}
                    onClick={() => setDraftBoard(t)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                      draftBoard === t
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-white/10 hover:border-gold/30"
                    }`}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 overflow-hidden rounded-sm border border-white/10"
                      aria-hidden
                    >
                      <span
                        className="h-full w-1/2"
                        style={{ background: BOARD_THEMES[t].light }}
                      />
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
                <span className="text-[10px] text-muted-foreground">
                  {PIECE_THEME_ORDER.length} sets
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {PIECE_THEME_ORDER.map((t) => (
                  <button
                    key={t}
                    onClick={() => setDraftPiece(t)}
                    className={`flex flex-col items-center justify-center gap-3 rounded-xl border p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
                      draftPiece === t
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
