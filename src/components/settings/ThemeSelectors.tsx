import { Check } from "lucide-react";
import { PieceGlyph } from "@/lib/chess/pieceThemes";
import {
  BOARD_THEMES,
  BOARD_THEME_LABELS,
  BOARD_THEME_ORDER,
  PIECE_THEME_LABELS,
  PIECE_THEME_ORDER,
  type BoardTheme,
  type PieceTheme,
} from "@/hooks/useBoardSettings";
import { useGameSettings } from "@/hooks/useGameSettings";

/**
 * Premium board + piece theme selectors for the Game Settings tab.
 *
 * These are pure UI over the unified settings store: selecting a card writes
 * `board_theme` / `piece_theme` through `useGameSettings().set`, which persists
 * to localStorage instantly, broadcasts to every mounted board, and mirrors to
 * the `user_settings` table so the choice follows the user across devices.
 * Nothing here is cosmetic-only — the same keys drive live gameplay boards.
 */

const GOLD = "#D4AF37";

// ── Card chrome shared by both selectors ─────────────────────────────
function ThemeCard({
  selected,
  label,
  onSelect,
  children,
}: {
  selected: boolean;
  label: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative flex flex-col items-center gap-2.5 rounded-2xl border p-3 transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.03] ${
        selected
          ? "border-gold bg-gold/10 shadow-[0_8px_28px_-8px_rgba(212,175,55,0.55)]"
          : "border-white/10 bg-white/[0.03] hover:border-gold/40 hover:bg-white/[0.06]"
      }`}
      style={{ backdropFilter: "blur(6px)" }}
    >
      {selected && (
        <span
          className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full shadow-md"
          style={{ background: GOLD }}
        >
          <Check className="h-3 w-3 text-[#24364A]" strokeWidth={3.5} />
        </span>
      )}
      {children}
      <span
        className={`text-center text-xs font-medium leading-tight transition-colors ${
          selected ? "text-gold" : "text-muted-foreground group-hover:text-foreground"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

// ── Miniature 4×4 board preview used on each board card ──────────────
function MiniBoard({ theme }: { theme: BoardTheme }) {
  const c = BOARD_THEMES[theme];
  return (
    <span className="block aspect-square w-full overflow-hidden rounded-lg ring-1 ring-black/20">
      <span className="grid h-full w-full grid-cols-4 grid-rows-4">
        {Array.from({ length: 16 }).map((_, k) => {
          const dark = (k + Math.floor(k / 4)) % 2 === 1;
          return <span key={k} style={{ background: dark ? c.dark : c.light }} />;
        })}
      </span>
    </span>
  );
}

// ── Piece Theme selector ─────────────────────────────────────────────
export function PieceThemeSelector() {
  const { settings, set } = useGameSettings();
  const current = settings.piece_theme;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">Piece Theme</h3>
        <span className="text-[11px] text-muted-foreground">
          {PIECE_THEME_ORDER.length} sets · applies everywhere
        </span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Every set is a locally-drawn vector material — instant switching, no downloads.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {PIECE_THEME_ORDER.map((t: PieceTheme) => (
          <ThemeCard
            key={t}
            selected={current === t}
            label={PIECE_THEME_LABELS[t]}
            onSelect={() => set("piece_theme", t)}
          >
            <span className="grid aspect-square w-full place-items-center rounded-xl bg-gradient-to-br from-[#1b2a3d] to-[#0f1826] ring-1 ring-white/5">
              <span className="h-3/4 w-3/4">
                <PieceGlyph theme={t} color="w" type="n" />
              </span>
            </span>
          </ThemeCard>
        ))}
      </div>
    </div>
  );
}

// ── Full 8×8 live preview board ──────────────────────────────────────
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

// Standard starting position, top (rank 8, black) to bottom (rank 1, white).
type Cell = { color: "w" | "b"; type: "p" | "n" | "b" | "r" | "q" | "k" } | null;
const BACK_RANK = ["r", "n", "b", "q", "k", "b", "n", "r"] as const;
function startingCell(fileIdx: number, rank: number): Cell {
  if (rank === 8) return { color: "b", type: BACK_RANK[fileIdx] };
  if (rank === 7) return { color: "b", type: "p" };
  if (rank === 2) return { color: "w", type: "p" };
  if (rank === 1) return { color: "w", type: BACK_RANK[fileIdx] };
  return null;
}

function PreviewBoard({ board, piece }: { board: BoardTheme; piece: PieceTheme }) {
  const c = BOARD_THEMES[board];
  return (
    <div className="w-full max-w-sm">
      <div className="overflow-hidden rounded-xl shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
        <div className="grid grid-cols-8">
          {RANKS.map((rank, rIdx) =>
            FILES.map((file, fIdx) => {
              const dark = (rIdx + fIdx) % 2 === 1;
              const cell = startingCell(fIdx, rank);
              return (
                <div
                  key={`${file}${rank}`}
                  className="relative aspect-square"
                  style={{ background: dark ? c.dark : c.light }}
                >
                  {rank === 1 && (
                    <span
                      className="absolute bottom-0.5 right-1 text-[9px] font-semibold opacity-70"
                      style={{ color: dark ? c.light : c.dark }}
                    >
                      {file}
                    </span>
                  )}
                  {fIdx === 0 && (
                    <span
                      className="absolute left-1 top-0.5 text-[9px] font-semibold opacity-70"
                      style={{ color: dark ? c.light : c.dark }}
                    >
                      {rank}
                    </span>
                  )}
                  {cell && (
                    <span className="absolute inset-[10%]">
                      <PieceGlyph theme={piece} color={cell.color} type={cell.type} />
                    </span>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Live preview · <span className="text-gold">{BOARD_THEME_LABELS[board]}</span> board ·{" "}
        <span className="text-gold">{PIECE_THEME_LABELS[piece]}</span> pieces
      </p>
    </div>
  );
}

// ── Board Theme selector (cards + live preview panel) ────────────────
export function BoardThemeSelector() {
  const { settings, set } = useGameSettings();
  const board = settings.board_theme;
  const piece = settings.piece_theme;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">Board Theme</h3>
        <span className="text-[11px] text-muted-foreground">
          {BOARD_THEME_ORDER.length} themes · real-time preview
        </span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Pure CSS gradient boards — tournament-grade, zero assets, instant switching.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="grid grid-cols-2 gap-3 self-start sm:grid-cols-3 md:grid-cols-4">
          {BOARD_THEME_ORDER.map((t: BoardTheme) => (
            <ThemeCard
              key={t}
              selected={board === t}
              label={BOARD_THEME_LABELS[t]}
              onSelect={() => set("board_theme", t)}
            >
              <MiniBoard theme={t} />
            </ThemeCard>
          ))}
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <PreviewBoard board={board} piece={piece} />
        </div>
      </div>
    </div>
  );
}
