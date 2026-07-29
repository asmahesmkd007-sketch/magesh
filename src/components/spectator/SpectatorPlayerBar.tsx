import { Link } from "@tanstack/react-router";

import { CapturedPieces } from "@/components/site/CapturedPieces";
import type { BoardCell } from "@/components/site/InteractiveBoard";
import { ClockTime } from "@/components/site/ClockTime";
import { UserAvatar } from "@/components/site/UserAvatar";
import { rungById } from "@/lib/ranking/tiers";
import { countryFlag } from "@/lib/spectator/flags";
import type { SpectatorPlayer } from "@/lib/spectator/types";

/**
 * One player's line above/below the spectator board: identity, standing,
 * captures and clock.
 *
 * The clock shown is the DELAYED clock — it is reconstructed from the
 * last released ply of that colour, so it matches the position on the
 * board rather than the players' real remaining time. `active` still
 * ticks it down, because the side to move in the delayed position was
 * genuinely burning time then.
 */
export function SpectatorPlayerBar({
  player,
  color,
  active,
  board,
  isWinner,
  className = "",
}: {
  player: SpectatorPlayer;
  color: "w" | "b";
  active: boolean;
  board: BoardCell[][];
  isWinner?: boolean;
  className?: string;
}) {
  const flag = countryFlag(player.country);
  const rung = rungById(player.rung_id);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span
        className={`h-3 w-3 shrink-0 rounded-full border ${
          color === "w" ? "border-white/40 bg-ivory" : "border-white/20 bg-charcoal"
        }`}
        aria-label={color === "w" ? "White" : "Black"}
      />

      <UserAvatar avatarUrl={player.avatar_url} displayName={player.username} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          {player.title && (
            <span className="text-[10px] font-semibold text-gold">{player.title}</span>
          )}
          {player.username && player.id ? (
            <Link
              to="/profile"
              search={{ id: player.id }}
              className="truncate text-foreground transition-colors hover:text-gold"
            >
              {player.username}
            </Link>
          ) : (
            <span className="truncate text-muted-foreground">{player.username ?? "Unknown"}</span>
          )}
          {flag && <span aria-hidden>{flag}</span>}
          {isWinner && <span className="text-xs text-gold">👑</span>}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
          <span className="text-muted-foreground">{player.rating ?? "—"} Elo</span>
          {rung && (
            <>
              <span className="text-muted-foreground" aria-hidden>
                ·
              </span>
              <span className={rung.tier.text}>{rung.label}</span>
            </>
          )}
          {player.season_points != null && (
            <>
              <span className="text-muted-foreground" aria-hidden>
                ·
              </span>
              <span className="text-muted-foreground">
                {player.season_points.toLocaleString()} SP
              </span>
            </>
          )}
        </div>

        <CapturedPieces board={board} player={color} className="mt-1" />
      </div>

      <div
        className={`shrink-0 rounded-xl border px-3 py-1.5 font-stat text-lg tabular-nums transition-colors ${
          active
            ? "border-gold/40 bg-gold/10 text-gold"
            : "border-white/10 bg-white/[0.03] text-muted-foreground"
        }`}
      >
        <ClockTime ms={player.time_ms} active={active} />
      </div>
    </div>
  );
}
