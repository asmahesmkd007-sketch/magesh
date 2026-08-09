// X-style three-column shell for all /community pages and public
// profiles: left nav rail, center content, right discovery sidebar.
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BadgeCheck, Bell, Bookmark, Compass, Home, Mail, TrendingUp, User } from "lucide-react";
import { Card } from "@/components/site/Primitives";
import { UserAvatar } from "@/components/site/UserAvatar";
import { useAuth, useProfile } from "@/hooks/useAuth";
import {
  useCommunityActions,
  useLeaderboard,
  useSuggestedUsers,
  useTrendingTags,
} from "@/hooks/useCommunity";
import type { CommunityUserLite } from "@/lib/api/communityClient";

function NavItem({
  to,
  icon: Icon,
  label,
  active,
  onClick,
  disabled,
}: {
  to?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const cls = `flex items-center gap-3 rounded-full px-4 py-2.5 text-[15px] transition ${
    active
      ? "bg-gold/10 font-medium text-gold"
      : disabled
        ? "cursor-default text-muted-foreground/50"
        : "text-foreground hover:bg-white/[0.05]"
  }`;
  if (to && !disabled)
    return (
      <Link to={to as never} className={cls}>
        <Icon className="h-5 w-5" /> <span className="hidden xl:inline">{label}</span>
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={`${cls} w-full`} disabled={disabled}>
      <Icon className="h-5 w-5" />
      <span className="hidden xl:inline">{label}</span>
      {disabled && (
        <span className="ml-auto hidden rounded bg-white/5 px-1.5 text-[9px] xl:inline">SOON</span>
      )}
    </button>
  );
}

function UserRow({ u }: { u: CommunityUserLite }) {
  const { follow, user } = useCommunityActions();
  const isFollowing = !!u.is_following;

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <Link to="/u/$username" params={{ username: u.username }} className="shrink-0">
        <UserAvatar avatarUrl={u.avatar_url} displayName={u.full_name} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          to="/u/$username"
          params={{ username: u.username }}
          className="flex items-center gap-1 truncate text-xs font-medium hover:underline"
        >
          {u.full_name}
          {u.premium_tier && u.premium_tier !== "free" && (
            <BadgeCheck className="h-3 w-3 shrink-0 text-gold" />
          )}
        </Link>
        <div className="truncate text-[11px] text-muted-foreground">
          @{u.username} · {u.metric ?? u.community_score}
        </div>
      </div>
      {user && user.id !== u.id && (
        <button
          type="button"
          onClick={() => follow.mutate(u.id)}
          disabled={follow.isPending}
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
            isFollowing
              ? "border-white/15 bg-white/5 text-muted-foreground hover:border-rose-400/40 hover:text-rose-400"
              : "border-gold/40 text-gold hover:bg-gold/15"
          }`}
        >
          {isFollowing ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}

export function CommunityLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile } = useProfile(user?.id);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: leaders = [] } = useLeaderboard("score", 5);
  const { data: suggested = [] } = useSuggestedUsers(4);
  const { data: tags = [] } = useTrendingTags();

  return (
    <div className="relative min-h-screen pb-28 lg:pb-16">
      <div className="pointer-events-none absolute inset-0 bg-page" />
      <div className="pointer-events-none absolute inset-0 opacity-50 royal-grid" />
      <div className="relative mx-auto flex max-w-7xl gap-6 px-3 pt-6 sm:px-6 lg:px-8">
        {/* left rail */}
        <aside className="sticky top-20 hidden h-fit w-14 shrink-0 md:block xl:w-56">
          <nav className="space-y-1">
            <NavItem to="/community" icon={Home} label="Home" active={pathname === "/community"} />
            <NavItem
              to="/community/explore"
              icon={Compass}
              label="Explore"
              active={pathname.startsWith("/community/explore")}
            />
            <NavItem
              to="/notifications"
              icon={Bell}
              label="Notifications"
              active={pathname.startsWith("/notifications")}
            />
            <NavItem
              to="/chat"
              icon={Mail}
              label="Messages"
              active={pathname.startsWith("/chat")}
            />
            <NavItem
              to="/community/bookmarks"
              icon={Bookmark}
              label="Bookmarks"
              active={pathname.startsWith("/community/bookmarks")}
            />
            {profile && (
              <NavItem
                to={`/u/${profile.username}`}
                icon={User}
                label="Profile"
                active={pathname === `/u/${profile.username}`}
              />
            )}
          </nav>
          {profile && (
            <Link
              to="/u/$username"
              params={{ username: profile.username }}
              className="mt-6 hidden items-center gap-2.5 rounded-full px-3 py-2 hover:bg-white/[0.05] xl:flex"
            >
              <UserAvatar
                avatarUrl={profile.avatar_url}
                displayName={profile.full_name}
                size="sm"
              />
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{profile.full_name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  @{profile.username}
                </div>
              </div>
            </Link>
          )}
        </aside>

        {/* center */}
        <main className="min-w-0 flex-1">{children}</main>

        {/* right sidebar */}
        <aside className="sticky top-20 hidden h-fit w-72 shrink-0 space-y-4 lg:block">
          {leaders.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gold/80">
                <TrendingUp className="h-3.5 w-3.5" /> Top Community Score
              </div>
              {leaders.map((u) => (
                <UserRow key={u.id} u={u} />
              ))}
            </Card>
          )}
          {suggested.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gold/80">
                Who to follow
              </div>
              {suggested.map((u) => (
                <UserRow key={u.id} u={u} />
              ))}
            </Card>
          )}
          {tags.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gold/80">
                Trending topics
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Link
                    key={t.tag}
                    to="/community/explore"
                    search={{ tag: t.tag, q: undefined }}
                    className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-emerald hover:border-emerald/40"
                  >
                    #{t.tag} <span className="text-muted-foreground">({t.count})</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
