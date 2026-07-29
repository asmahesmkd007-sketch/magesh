import { Link } from "@tanstack/react-router";
import { Crown, Swords, Trophy } from "lucide-react";

import { Card } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { ViewerCount } from "@/components/spectator/ViewerCount";
import { rungById } from "@/lib/ranking/tiers";
import { TIME_CLASS_LABEL, estimateDelaySeconds, formatDelay } from "@/lib/spectator/delay";
import { countryFlag } from "@/lib/spectator/flags";
import type { LiveMatchPlayer, LiveMatchSummary } from "@/lib/spectator/types";

/**
 * A match as it appears in the /watch grid: who is playing, how strong
 * they are, what is at stake, and how many people are already watching.
 *
 * There is deliberately no board preview. These rows come from
 * list_live_games(), which reads a position-free view — a thumbnail
 * would need the live fen, which is exactly what spectators are not
 * given. The card sells the match on its players instead.
 */
export function LiveMatchCard({ game }: { game: LiveMatchSummary }) {
  const delay = estimateDelaySeconds({
    isRated: game.is_rated,
    isTournamentFinal: game.tournament?.is_final,
  });
  const moveNumber = Math.floor(game.moves_count / 2) + 1;

  return (
    <Card className="group relative overflow-hidden p-0 transition duration-200 hover:border-gold/40">
      <Link to="/watch/$id" params={{ id: game.id }} className="block p-5">
        {/* Header: format, stakes, audience */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="royal-chip text-[11px]">{TIME_CLASS_LABEL[game.time_class]}</span>
          <span className="text-[11px] text-muted-foreground">{game.time_control}</span>
          {game.is_rated ? (
            <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-gold">
              Ranked
            </span>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Casual
            </span>
          )}
          {game.tournament && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald/30 bg-emerald/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald">
              <Trophy className="h-3 w-3" aria-hidden />
              {game.tournament.is_final ? "Final" : `Round ${game.tournament.round}`}
            </span>
          )}
          <ViewerCount count={game.viewers} className="ml-auto" compact />
        </div>

        {/* Players */}
        <div className="space-y-2.5">
          <PlayerRow player={game.white} color="w" />
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <Swords className="h-3.5 w-3.5 text-gold/50" aria-hidden />
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <PlayerRow player={game.black} color="b" />
        </div>

        {/* Footer: where the game is, and the delay it will be shown at */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/5 pt-3 text-[11px] text-muted-foreground">
          <span>Move {moveNumber}</span>
          {game.opening && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{game.opening}</span>
            </>
          )}
          <span className="ml-auto text-gold/70">
            {delay > 0 ? `${formatDelay(delay)} delay` : "Live"}
          </span>
        </div>
      </Link>
    </Card>
  );
}

function PlayerRow({ player, color }: { player: LiveMatchPlayer; color: "w" | "b" }) {
  const flag = countryFlag(player.country);
  const rung = rungById(player.rung_id);

  return (
    <div className="flex items-center gap-3">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full border ${
          color === "w" ? "border-white/40 bg-ivory" : "border-white/20 bg-charcoal"
        }`}
        aria-label={color === "w" ? "White" : "Black"}
      />
      <UserAvatar avatarUrl={player.avatar_url} displayName={player.username} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-sm text-foreground">
          {player.title && (
            <span className="shrink-0 text-[10px] font-semibold text-gold">{player.title}</span>
          )}
          <span className="truncate">{player.username ?? "Unknown"}</span>
          {flag && (
            <span className="shrink-0" aria-hidden>
              {flag}
            </span>
          )}
        </div>
        {rung && (
          <div className={`flex items-center gap-1.5 text-[11px] ${rung.tier.text}`}>
            <span>{rung.label}</span>
            {player.season_points != null && (
              <span className="text-muted-foreground">
                · {player.season_points.toLocaleString()} SP
              </span>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-stat text-sm text-gradient-gold">{player.rating ?? "—"}</div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Elo</div>
      </div>
      {(player.rating ?? 0) >= 2200 && (
        <Crown className="h-3.5 w-3.5 shrink-0 text-gold/60" aria-hidden />
      )}
    </div>
  );
}
