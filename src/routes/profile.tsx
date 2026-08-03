import { createFileRoute, Link } from "@tanstack/react-router";
import {
  PageShell,
  Card,
  GoldButton,
  GhostButton,
  SectionTitle,
} from "@/components/site/Primitives";
import {
  Camera,
  Coins,
  Crown,
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  Loader2,
  MapPin,
  Minus,
  Play,
  Timer,
  Trophy,
  Twitter,
  X,
  Youtube,
  Zap,
  Shield,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LazyRatingProgressChart } from "@/components/profile/LazyRatingProgressChart";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PremiumBadge } from "@/components/site/PremiumBadge";
import { UserAvatar } from "@/components/site/UserAvatar";
import { FriendButton } from "@/components/friends/FriendButton";
import { toast } from "sonner";
import type { Profile } from "@/hooks/useAuth";
import { getSeasonHistoryForUser, type SeasonHistoryForUser } from "@/lib/api/seasonsClient";
import { noindexSeo } from "@/lib/seo";

const SEASON_REWARD_LABEL: Record<string, string> = {
  champion: "🏆 Champion",
  top_10: "🥈 Top 10",
  top_100: "🥉 Top 100",
};

export const Route = createFileRoute("/profile")({
  head: () =>
    noindexSeo(
      "Your Chess Profile — ChessOx",
      "Your ChessOx profile: chess ratings, game stats, achievements and account details.",
      "noindex, nofollow",
    ),
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  component: ProfilePage,
});

type Rating = {
  time_class: string;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
};

type Game = {
  id: string;
  white_id: string | null;
  black_id: string | null;
  white_username: string | null;
  black_username: string | null;
  white_rating: number | null;
  black_rating: number | null;
  result: string;
  time_class: string;
  time_control: string;
  moves_count: number;
  end_reason: string | null;
  created_at: string;
  ended_at: string | null;
};

type RatingHistoryRow = { new_rating: number; created_at: string; time_class: string };

type TournamentEntry = {
  tournament_id: string;
  score: number | null;
  rank: number | null;
  joined_at: string;
  tournament: {
    name: string;
    entry_fee_coins: number;
    time_control: string;
    status: string;
    ends_at: string | null;
    prize_1st: number | null;
    prize_2nd: number | null;
    prize_3rd: number | null;
  } | null;
};

type Outcome = "win" | "loss" | "draw";

function outcomeOf(g: Game, uid: string): Outcome {
  if (g.result === "draw") return "draw";
  const iWasWhite = g.white_id === uid;
  if (g.result === "white") return iWasWhite ? "win" : "loss";
  return iWasWhite ? "loss" : "win";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtDuration(a: string, b: string): string {
  const secs = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function OutcomeIcon({ o }: { o: Outcome }) {
  if (o === "win") return <Crown className="h-4 w-4 text-gold" />;
  if (o === "loss") return <X className="h-4 w-4 text-rose-400" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

// ── Image processing + upload (same logic as settings.tsx) ─────────────

function processImage(file: File, targetW: number, targetH: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not available"));
        return;
      }
      const aspect = targetW / targetH;
      const imgAspect = img.width / img.height;
      let sx = 0,
        sy = 0,
        sw = img.width,
        sh = img.height;
      if (imgAspect > aspect) {
        sw = img.height * aspect;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / aspect;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Conversion failed"))),
        "image/jpeg",
        0.9,
      );
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });
}

async function uploadImage(
  bucket: "avatars" | "banners",
  userId: string,
  file: File,
  w: number,
  h: number,
): Promise<string> {
  const blob = await processImage(file, w, h);
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// ── ProfilePage ──────────────────────────────────────────────────────

function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const { id: viewedId } = Route.useSearch();
  const { profile: ownProfile, loading: ownProfileLoading, setProfile } = useProfile(user?.id);

  const isOwnProfile = !viewedId || viewedId === user?.id;
  const targetUid = isOwnProfile ? (user?.id ?? "") : (viewedId ?? "");

  // Load another user's profile when viewedId differs from current user
  const [otherProfile, setOtherProfile] = useState<Profile | null>(null);
  const [otherProfileLoading, setOtherProfileLoading] = useState(false);

  useEffect(() => {
    if (isOwnProfile || !viewedId) return;
    setOtherProfileLoading(true);
    (supabase as any)
      .from("profiles")
      .select("*")
      .eq("id", viewedId)
      .single()
      .then(({ data }: { data: Profile | null }) => {
        setOtherProfile(data);
        setOtherProfileLoading(false);
      });
  }, [viewedId, isOwnProfile]);

  const profile = isOwnProfile ? ownProfile : otherProfile;
  const profileLoading = isOwnProfile ? ownProfileLoading : otherProfileLoading;

  useEffect(() => {
    if (!targetUid) return;
    getSeasonHistoryForUser(targetUid)
      .then(setSeasonHistory)
      .catch(() => setSeasonHistory(null));
  }, [targetUid]);

  const [ratings, setRatings] = useState<Rating[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [history, setHistory] = useState<RatingHistoryRow[]>([]);
  const [tournamentHistory, setTournamentHistory] = useState<TournamentEntry[]>([]);
  const [seasonHistory, setSeasonHistory] = useState<SeasonHistoryForUser | null>(null);
  const [puzzleStats, setPuzzleStats] = useState<any>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [userClan, setUserClan] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);

  // Inline upload state (only used when isOwnProfile)
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!targetUid) return;
    setDataLoading(true);
    Promise.all([
      (supabase as any).from("ratings").select("*").eq("user_id", targetUid),
      (supabase as any)
        .from("games")
        .select(
          "id,white_id,black_id,white_username,black_username,white_rating,black_rating,result,time_class,time_control,moves_count,end_reason,created_at,ended_at",
        )
        .or(`white_id.eq.${targetUid},black_id.eq.${targetUid}`)
        .not("ended_at", "is", null)
        .in("result", ["white", "black", "draw"])
        .order("ended_at", { ascending: false })
        .limit(100),
      (supabase as any)
        .from("rating_history" as never)
        .select("new_rating,created_at,time_class")
        .eq("user_id", targetUid)
        .order("created_at", { ascending: true })
        .limit(200),
      (supabase as any)
        .from("tournament_entries")
        .select(
          "tournament_id,score,rank,joined_at,tournament:tournaments(name,entry_fee_coins,time_control,status,ends_at,prize_1st,prize_2nd,prize_3rd)",
        )
        .eq("user_id", targetUid)
        .order("joined_at", { ascending: false })
        .limit(30),
      (supabase as any)
        .from("user_puzzle_stats")
        .select("*")
        .eq("user_id", targetUid)
        .maybeSingle(),
      (supabase as any)
        .from("community_follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", targetUid),
      (supabase as any)
        .from("community_follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", targetUid),
      (supabase as any)
        .from("clan_members")
        .select("role, clans(name, tag, slug)")
        .eq("user_id", targetUid)
        .maybeSingle(),
    ]).then(([r, g, h, t, p, followers, following, clanData]) => {
      setRatings((r.data as unknown as Rating[]) ?? []);
      setGames((g.data as unknown as Game[]) ?? []);
      setHistory((h.data as unknown as RatingHistoryRow[]) ?? []);
      setTournamentHistory((t.data as unknown as TournamentEntry[]) ?? []);
      setPuzzleStats(p.data ?? null);
      setFollowersCount(followers.count ?? 0);
      setFollowingCount(following.count ?? 0);
      setUserClan(clanData.data ?? null);
      setDataLoading(false);
    });
  }, [targetUid]);

  const ratingByClass = (cls: string) => ratings.find((r) => r.time_class === cls)?.rating ?? 100;

  const totals = useMemo(
    () =>
      ratings.reduce(
        (acc, r) => ({
          games: acc.games + (r.games_played ?? 0),
          wins: acc.wins + (r.wins ?? 0),
          losses: acc.losses + (r.losses ?? 0),
          draws: acc.draws + (r.draws ?? 0),
        }),
        { games: 0, wins: 0, losses: 0, draws: 0 },
      ),
    [ratings],
  );

  const winRate = totals.games > 0 ? Math.round((totals.wins / totals.games) * 100) : 0;

  const chartData = useMemo(() => {
    const preferred = (["rapid", "blitz", "bullet", "classical"] as const).find((c) =>
      history.some((h) => h.time_class === c),
    );
    const series = history.filter((h) => h.time_class === preferred);
    if (series.length >= 2)
      return series.map((h) => ({ day: fmtDate(h.created_at), rating: h.new_rating }));
    const base = ratingByClass("rapid");
    return [
      { day: "Start", rating: base },
      { day: "Now", rating: base },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, ratings]);

  const uid = targetUid;
  const bestWins = useMemo(
    () =>
      games
        .filter((g) => outcomeOf(g, uid) === "win")
        .map((g) => ({ g, oppRating: (g.white_id === uid ? g.black_rating : g.white_rating) ?? 0 }))
        .sort((a, b) => b.oppRating - a.oppRating)
        .slice(0, 3),
    [games, uid],
  );
  const longestGames = useMemo(
    () => [...games].sort((a, b) => b.moves_count - a.moves_count).slice(0, 3),
    [games],
  );
  const fastestWins = useMemo(
    () =>
      games
        .filter((g) => outcomeOf(g, uid) === "win" && g.moves_count > 0)
        .sort((a, b) => a.moves_count - b.moves_count)
        .slice(0, 3),
    [games, uid],
  );
  const oppName = (g: Game) =>
    (g.white_id === uid ? g.black_username : g.white_username) ?? "Anonymous";
  const oppId = (g: Game) => (g.white_id === uid ? g.black_id : g.white_id);

  // ── Image upload handlers (inline, same bucket logic as settings) ──
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5 MB)");
      return;
    }
    setUploadingAvatar(true);
    try {
      const url = await uploadImage("avatars", user.id, file, 400, 400);
      const { error, data } = await (supabase as any)
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", user.id)
        .select()
        .single();
      if (error) throw error;
      setProfile(data as Profile | null);
      toast.success("Profile photo updated");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10 MB)");
      return;
    }
    setUploadingBanner(true);
    try {
      const url = await uploadImage("banners", user.id, file, 1500, 500);
      const { error, data } = await (supabase as any)
        .from("profiles")
        .update({ banner_url: url })
        .eq("id", user.id)
        .select()
        .single();
      if (error) throw error;
      setProfile(data as Profile | null);
      toast.success("Cover photo updated");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
    }
  }

  // A centred spinner used to cover the whole page for the duration of the
  // profile fetch (~320 ms round trip), so nothing about the page existed
  // until it landed. This mirrors the real layout instead, so the structure
  // paints immediately and only the values fill in.
  if (authLoading || profileLoading) {
    return (
      <PageShell>
        <Card className="overflow-hidden">
          <div className="h-32 w-full animate-pulse bg-white/[0.04] sm:h-40" />
          <div className="p-6">
            <div className="flex items-end gap-4">
              <div className="-mt-16 h-24 w-24 shrink-0 animate-pulse rounded-full border-4 border-background bg-white/[0.06]" />
              <div className="flex-1 space-y-2 pb-1">
                <div className="h-6 w-48 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-4 w-32 animate-pulse rounded bg-white/[0.04]" />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {["a", "b", "c", "d"].map((k) => (
                <div key={k} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
                  <div className="mt-2 h-7 w-12 animate-pulse rounded bg-white/[0.06]" />
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="mt-8 p-6">
          <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-4 h-60 w-full animate-pulse rounded-lg bg-white/[0.03]" />
        </Card>
      </PageShell>
    );
  }

  if (!user) {
    return (
      <PageShell eyebrow="Royal Court" title="Sign in to view profiles">
        <Link to="/auth">
          <GoldButton>Sign in</GoldButton>
        </Link>
      </PageShell>
    );
  }

  if (!profile) {
    return (
      <PageShell eyebrow="Royal Court" title="Profile not found">
        <Card className="p-8 text-center text-muted-foreground">
          This player profile could not be found.
        </Card>
      </PageShell>
    );
  }

  const socialLinks = [
    profile.website && {
      href: profile.website,
      icon: <Globe className="h-4 w-4" />,
      label: "Website",
    },
    profile.youtube_url && {
      href: profile.youtube_url,
      icon: <Youtube className="h-4 w-4 text-rose-500" />,
      label: "YouTube",
    },
    profile.instagram_url && {
      href: profile.instagram_url,
      icon: <Instagram className="h-4 w-4 text-pink-500" />,
      label: "Instagram",
    },
    profile.facebook_url && {
      href: profile.facebook_url,
      icon: <Facebook className="h-4 w-4 text-blue-500" />,
      label: "Facebook",
    },
    profile.twitter_url && {
      href: profile.twitter_url,
      icon: <Twitter className="h-4 w-4 text-sky-400" />,
      label: "X / Twitter",
    },
  ].filter(Boolean) as { href: string; icon: React.ReactNode; label: string }[];

  return (
    <PageShell>
      <Card className="overflow-hidden">
        {/* ── Banner ── */}
        <div className="relative h-44 md:h-56 group">
          {profile.banner_url ? (
            <img
              src={profile.banner_url}
              alt="Profile banner"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-amber-500/40 via-rose-700/30 to-violet-700/30">
              <div className="absolute inset-0 mandala-bg opacity-60" />
            </div>
          )}

          {/* Banner upload overlay — own profile only */}
          {isOwnProfile && (
            <>
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
              >
                {uploadingBanner ? (
                  <Loader2 className="h-7 w-7 animate-spin text-white" />
                ) : (
                  <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-white backdrop-blur-sm">
                    <Camera className="h-4 w-4" />
                    <span className="text-sm font-medium">Change cover photo</span>
                  </div>
                )}
              </button>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleBannerChange}
              />
            </>
          )}
        </div>

        {/* ── Profile header below banner ── */}
        <div className="relative -mt-14 px-6 pb-6 md:px-8">
          <div className="flex flex-wrap items-end gap-5">
            {/* Avatar */}
            <div className="relative group/av">
              <UserAvatar
                avatarUrl={profile.avatar_url}
                displayName={profile.full_name}
                size="xl"
                shape="rounded-full"
                className="ring-4 ring-background"
              />
              {/* Avatar upload overlay — own profile only */}
              {isOwnProfile && (
                <>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover/av:opacity-100"
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    ) : (
                      <Camera className="h-5 w-5 text-white" />
                    )}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </>
              )}
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-3xl md:text-4xl flex flex-wrap items-center gap-2">
                {profile.full_name}
                <PremiumBadge
                  className="h-6 w-6"
                  premiumActive={profile.premium_active}
                  premiumExpiresAt={profile.premium_expires_at}
                />
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {profile.country ?? "India"}
                </span>
                <span>· @{profile.username}</span>
                <span>
                  · Joined{" "}
                  {new Date(profile.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {profile.title && (
                  <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs text-gold">
                    {profile.title}
                  </span>
                )}
                {profile.premium_tier !== "free" && (
                  <span className="rounded-full bg-emerald/15 px-2 py-0.5 text-xs uppercase tracking-widest text-emerald">
                    {profile.premium_tier}
                  </span>
                )}
                {userClan?.clans && (
                  <Link
                    to="/clan/$slug"
                    params={{ slug: userClan.clans.slug }}
                    className="hover:opacity-80 transition-opacity"
                  >
                    <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-xs font-medium text-gold flex items-center gap-1.5 shadow-[0_0_10px_rgba(212,175,55,0.2)]">
                      <Shield className="h-3 w-3" />
                      {userClan.clans.name} [{userClan.clans.tag}]
                    </span>
                  </Link>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 hover:text-white cursor-pointer transition-colors">
                  <span className="font-bold text-white">{followersCount}</span>
                  <span className="text-muted-foreground">Followers</span>
                </div>
                <div className="flex items-center gap-1.5 hover:text-white cursor-pointer transition-colors">
                  <span className="font-bold text-white">{followingCount}</span>
                  <span className="text-muted-foreground">Following</span>
                </div>
              </div>
              {profile.bio && (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{profile.bio}</p>
              )}
              {/* Social links */}
              {socialLinks.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {socialLinks.map(({ href, icon, label }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-gold/30 hover:text-gold"
                    >
                      {icon}
                      <span>{label}</span>
                      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {isOwnProfile ? (
                <>
                  <Link to="/settings">
                    <GoldButton>Edit Profile</GoldButton>
                  </Link>
                  <Link to="/play/history">
                    <GhostButton>Full History</GhostButton>
                  </Link>
                </>
              ) : (
                <GhostButton>Challenge</GhostButton>
              )}
            </div>
          </div>

          {/* Rating chips */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5 text-gold" /> IQ Rating
              </div>
              <div className="font-display text-2xl text-gradient-gold">
                {(profile as any).iq_rating ?? 100}
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                Puzzle
              </div>
              <div className="font-display text-2xl text-gradient-gold">
                {puzzleStats?.puzzle_rating ?? 100}
              </div>
            </div>
            {(["rapid", "blitz", "bullet", "classical"] as const).map((cls) => (
              <div key={cls} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{cls}</div>
                <div className="font-display text-2xl text-gradient-gold">{ratingByClass(cls)}</div>
              </div>
            ))}
          </div>

          {/* Stats chips */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-7">
            {(
              [
                ["Total Games", totals.games, "text-foreground"],
                ["Wins", totals.wins, "text-emerald"],
                ["Losses", totals.losses, "text-rose-400"],
                ["Draws", totals.draws, "text-muted-foreground"],
                ["Win Rate", `${winRate}%`, "text-gold"],
                ["Puzzles Solved", puzzleStats?.total_solved ?? 0, "text-sky-400"],
                ["Win Streak", puzzleStats?.current_streak ?? 0, "text-amber-400"],
              ] as const
            ).map(([label, value, cls]) => (
              <div key={label} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  {label}
                </div>
                <div className={`font-display text-2xl ${cls}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Rating progress chart */}
      <Card className="mt-8 p-6">
        <SectionTitle kicker="Form" title="Rating Progress" />
        <div className="h-60">
          <LazyRatingProgressChart data={chartData} />
        </div>
        {history.length < 2 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Play rated games to start charting your rating progress.
          </p>
        )}
      </Card>

      {/* Highlights */}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-gold" />
            <h3 className="font-display text-lg">Best Wins</h3>
          </div>
          {bestWins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No wins yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {bestWins.map(({ g, oppRating }) => (
                <li key={g.id} className="flex items-center justify-between">
                  <Link to="/game/$id/review" params={{ id: g.id }} className="hover:text-gold">
                    vs {oppName(g)}
                  </Link>
                  <span className="text-xs text-gold">{oppRating || "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Timer className="h-4 w-4 text-gold" />
            <h3 className="font-display text-lg">Longest Games</h3>
          </div>
          {longestGames.length === 0 ? (
            <p className="text-sm text-muted-foreground">No games yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {longestGames.map((g) => (
                <li key={g.id} className="flex items-center justify-between">
                  <Link to="/game/$id/review" params={{ id: g.id }} className="hover:text-gold">
                    vs {oppName(g)}
                  </Link>
                  <span className="text-xs text-muted-foreground">{g.moves_count} moves</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-gold" />
            <h3 className="font-display text-lg">Fastest Wins</h3>
          </div>
          {fastestWins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No wins yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {fastestWins.map((g) => (
                <li key={g.id} className="flex items-center justify-between">
                  <Link to="/game/$id/review" params={{ id: g.id }} className="hover:text-gold">
                    vs {oppName(g)}
                  </Link>
                  <span className="text-xs text-muted-foreground">{g.moves_count} moves</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Recent matches */}
      <Card className="mt-8 p-6">
        <SectionTitle
          kicker="History"
          title="Recent Matches"
          action={
            <Link to="/play/history" className="text-sm text-gold hover:underline">
              View all
            </Link>
          }
        />
        {dataLoading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : games.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No games yet.{" "}
            <Link to="/play" className="text-gold">
              Play your first
            </Link>
            .
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {games.slice(0, 10).map((g) => {
              const o = outcomeOf(g, uid);
              return (
                <div key={g.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <OutcomeIcon o={o} />
                    <div>
                      <div className="flex items-center gap-1.5">
                        vs {oppName(g)}
                        <FriendButton
                          targetUserId={oppId(g)}
                          targetName={oppName(g)}
                          className="h-5 w-5"
                          compact
                        />
                      </div>
                      <div className="text-[11px] text-muted-foreground capitalize">
                        {g.time_class} · {g.ended_at ? fmtDate(g.ended_at) : ""}
                        {g.ended_at && ` · ${fmtDuration(g.created_at, g.ended_at)}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                        o === "win"
                          ? "bg-gold/10 text-gold"
                          : o === "loss"
                            ? "bg-rose-500/10 text-rose-400"
                            : "bg-white/5 text-muted-foreground"
                      }`}
                    >
                      {o}
                    </span>
                    <Link
                      to="/game/$id/review"
                      params={{ id: g.id }}
                      className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs transition hover:border-gold/40 hover:text-gold"
                    >
                      <Play className="h-3 w-3" /> Replay
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Tournament History */}
      <Card className="mt-8 p-6">
        <SectionTitle
          kicker="Tournaments"
          title="Tournament History"
          action={
            <Link to="/tournaments" className="text-sm text-gold hover:underline">
              Browse
            </Link>
          }
        />
        {dataLoading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : tournamentHistory.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No tournaments yet.{" "}
            <Link to="/tournaments" className="text-gold">
              Join one
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="pb-3 text-left">Tournament</th>
                  <th className="pb-3 text-center">Entry</th>
                  <th className="pb-3 text-center">Position</th>
                  <th className="pb-3 text-center">Rounds</th>
                  <th className="pb-3 text-center">W/L</th>
                  <th className="pb-3 text-center">Prize</th>
                  <th className="pb-3 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tournamentHistory.map((te) => {
                  const t = te.tournament;
                  const rank = te.rank;
                  const rankLabel =
                    rank === 1
                      ? "🥇 1st"
                      : rank === 2
                        ? "🥈 2nd"
                        : rank === 3
                          ? "🥉 3rd"
                          : rank === 4
                            ? "🏅 4th"
                            : "—";
                  const prizeAmts = t ? [t.prize_1st, t.prize_2nd, t.prize_3rd] : [];
                  const prizeWon = rank && rank <= 3 ? (prizeAmts[rank - 1] ?? 0) : 0;
                  return (
                    <tr key={te.tournament_id}>
                      <td className="py-3">
                        <Link
                          to="/tournament/$id"
                          params={{ id: te.tournament_id }}
                          className="hover:text-gold"
                        >
                          <div className="font-display">{t?.name ?? "—"}</div>
                          <div className="text-[11px] text-muted-foreground">{t?.time_control}</div>
                        </Link>
                      </td>
                      <td className="py-3 text-center">
                        <span className="flex items-center justify-center gap-1 text-gold">
                          <Coins className="h-3 w-3" /> {t?.entry_fee_coins ?? 0}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={
                            rank && rank <= 3 ? "text-gold font-display" : "text-muted-foreground"
                          }
                        >
                          {rankLabel}
                        </span>
                      </td>
                      <td className="py-3 text-center text-muted-foreground">—</td>
                      <td className="py-3 text-center text-muted-foreground">—</td>
                      <td className="py-3 text-center">
                        {prizeWon > 0 ? (
                          <span className="flex items-center justify-center gap-1 text-gold">
                            <Coins className="h-3 w-3" /> {prizeWon}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right text-xs text-muted-foreground">
                        {fmtDate(te.joined_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Season History */}
      <Card className="mt-8 p-6">
        <SectionTitle
          kicker="Seasons"
          title="Season History"
          action={
            <Link to="/seasons" className="text-sm text-gold hover:underline">
              Browse
            </Link>
          }
        />
        {dataLoading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : !seasonHistory || seasonHistory.seasons.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No seasons played yet.{" "}
            <Link to="/seasons" className="text-gold">
              View current season
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Current Rank", value: seasonHistory.current_season_rank ?? "—" },
                {
                  label: "Season IQ",
                  value: (seasonHistory.current_season_iq ?? 0).toLocaleString(),
                },
                { label: "Current Tier", value: seasonHistory.current_tier ?? "—" },
                {
                  label: "Career Highest IQ",
                  value: `${(seasonHistory.career_highest_iq ?? seasonHistory.best_iq_level ?? 0).toLocaleString()}${
                    seasonHistory.career_highest_iq_season
                      ? ` · S${seasonHistory.career_highest_iq_season}`
                      : ""
                  }`,
                },
                {
                  label: "Career Best Rank",
                  value: seasonHistory.career_best_rank
                    ? `#${seasonHistory.career_best_rank}${
                        seasonHistory.career_best_rank_season
                          ? ` · S${seasonHistory.career_best_rank_season}`
                          : ""
                      }`
                    : (seasonHistory.best_rank_ever ?? "—"),
                },
                {
                  label: "Best Season",
                  value: seasonHistory.best_season_number
                    ? `Season ${seasonHistory.best_season_number}`
                    : "—",
                },
                { label: "Seasons Played", value: seasonHistory.seasons_played },
                { label: "Seasons Won", value: seasonHistory.seasons_won },
                { label: "Top 10 Finishes", value: seasonHistory.top_10_finishes },
                { label: "Top 100 Finishes", value: seasonHistory.top_100_finishes },
                { label: "Best Rating", value: seasonHistory.best_rating ?? "—" },
                { label: "Season Badges", value: seasonHistory.season_badges?.length ?? 0 },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-center"
                >
                  <div className="font-display text-xl text-gold">{s.value}</div>
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5 text-xs uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="pb-3 text-left">Season</th>
                    <th className="pb-3 text-center">Final Rank</th>
                    <th className="pb-3 text-center">IQ Level</th>
                    <th className="pb-3 text-center">Rating</th>
                    <th className="pb-3 text-right">Reward</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {seasonHistory.seasons.map((s) => (
                    <tr key={s.season_id}>
                      <td className="py-3">
                        <div className="font-display">
                          Season {s.season_number}
                          {s.season_name ? ` — ${s.season_name}` : ""}
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={
                            s.final_rank && s.final_rank <= 3
                              ? "text-gold font-display"
                              : "text-muted-foreground"
                          }
                        >
                          {s.final_rank ? `#${s.final_rank}` : "—"}
                        </span>
                      </td>
                      <td className="py-3 text-center text-muted-foreground">{s.iq_level}</td>
                      <td className="py-3 text-center text-muted-foreground">{s.rating_points}</td>
                      <td className="py-3 text-right text-xs">
                        {s.rewards.length > 0
                          ? s.rewards.map((r) => SEASON_REWARD_LABEL[r] ?? r).join(", ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </PageShell>
  );
}
