import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Search, Loader2, X, Crown, Coins, Shield, Ban, Star, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/site/AdminShell";
import { Card } from "@/components/site/Primitives";
import {
  listUsers,
  checkSuperAdmin,
  setUserStatus,
  adjustCoins,
  resetCoins,
  resetRatings,
  grantPremium,
  removePremium,
  setRole,
  setSuperAdmin,
  type AdminUser,
} from "@/lib/api/adminClient";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [{ title: "Admin — Users — ChessOx" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: () => (
    <AdminShell title="User Management">
      <UsersPage />
    </AdminShell>
  ),
});

const STATUS_CLS: Record<string, string> = {
  active: "text-emerald-400",
  banned: "text-rose-400",
  suspended: "text-amber-400",
  muted: "text-sky-400",
};

function UsersPage() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [isSuper, setIsSuper] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      setUsers(await listUsers(q));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load users");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    checkSuperAdmin()
      .then(setIsSuper)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      await load(search);
      setSelected(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search username or display name…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : users.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-right">Coins</th>
                  <th className="px-4 py-3 text-left">Premium</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.username}</div>
                      <div className="text-xs text-muted-foreground">{u.full_name}</div>
                    </td>
                    <td className={`px-4 py-3 capitalize ${STATUS_CLS[u.status] ?? ""}`}>
                      {u.status}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {u.is_super_admin ? "super admin" : (u.role ?? "user")}
                    </td>
                    <td className="px-4 py-3 text-right text-gold">
                      {u.balance.toLocaleString("en-IN")}
                      {u.locked_balance > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          (+{u.locked_balance})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.premium_active ? (
                        <span className="text-gold">{u.premium_tier}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelected(u)}
                        className="rounded-lg border border-white/10 px-2.5 py-1 text-xs hover:border-gold/40 hover:text-gold"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <ManageModal
          user={selected}
          isSuper={isSuper}
          onClose={() => setSelected(null)}
          run={run}
        />
      )}
    </div>
  );
}

function ManageModal({
  user,
  isSuper,
  onClose,
  run,
}: {
  user: AdminUser;
  isSuper: boolean;
  onClose: () => void;
  run: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [coinAmt, setCoinAmt] = useState(100);
  const [premDays, setPremDays] = useState(30);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <Card
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto p-6"
        // stop backdrop close when clicking inside
      >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="font-display text-xl">{user.username}</div>
              <div className="text-xs text-muted-foreground">
                {user.full_name} · {user.is_super_admin ? "super admin" : (user.role ?? "user")} ·{" "}
                {user.status}
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Account status */}
          <Section icon={<Ban className="h-4 w-4" />} title="Account Status">
            <div className="flex flex-wrap gap-2">
              <ActBtn
                onClick={() => run(() => setUserStatus(user.id, "banned"), "User banned")}
                tone="rose"
              >
                Ban
              </ActBtn>
              <ActBtn
                onClick={() => run(() => setUserStatus(user.id, "suspended"), "User suspended")}
                tone="amber"
              >
                Suspend
              </ActBtn>
              <ActBtn
                onClick={() => run(() => setUserStatus(user.id, "muted"), "User muted")}
                tone="sky"
              >
                Mute
              </ActBtn>
              <ActBtn
                onClick={() => run(() => setUserStatus(user.id, "active"), "User restored")}
                tone="emerald"
              >
                Restore
              </ActBtn>
            </div>
          </Section>

          {/* Coins */}
          <Section icon={<Coins className="h-4 w-4" />} title="Coins">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                value={coinAmt}
                onChange={(e) => setCoinAmt(Number(e.target.value))}
                className="w-24 rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-sm"
              />
              <ActBtn
                onClick={() =>
                  run(() => adjustCoins(user.id, Math.abs(coinAmt), "Admin grant"), "Coins granted")
                }
                tone="emerald"
              >
                Grant
              </ActBtn>
              <ActBtn
                onClick={() =>
                  run(
                    () => adjustCoins(user.id, -Math.abs(coinAmt), "Admin deduct"),
                    "Coins removed",
                  )
                }
                tone="rose"
              >
                Remove
              </ActBtn>
              <ActBtn
                onClick={() => run(() => resetCoins(user.id, 100), "Coins reset to 100")}
                tone="muted"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </ActBtn>
            </div>
          </Section>

          {/* Premium */}
          <Section icon={<Crown className="h-4 w-4" />} title="Premium">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                value={premDays}
                onChange={(e) => setPremDays(Number(e.target.value))}
                className="w-20 rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-muted-foreground">days</span>
              <ActBtn
                onClick={() => run(() => grantPremium(user.id, "pro", premDays), "Premium granted")}
                tone="gold"
              >
                Grant Pro
              </ActBtn>
              <ActBtn
                onClick={() => run(() => removePremium(user.id), "Premium removed")}
                tone="rose"
              >
                Remove
              </ActBtn>
            </div>
          </Section>

          {/* Ratings */}
          <Section icon={<Star className="h-4 w-4" />} title="Ratings">
            <ActBtn
              onClick={() => run(() => resetRatings(user.id, 100), "Ratings reset")}
              tone="muted"
            >
              <RotateCcw className="h-3 w-3" /> Reset all ratings to 100
            </ActBtn>
          </Section>

          {/* Roles (super admin only) */}
          {isSuper && (
            <Section icon={<Shield className="h-4 w-4" />} title="Role (Super Admin)">
              <div className="flex flex-wrap gap-2">
                <ActBtn
                  onClick={() => run(() => setRole(user.id, "admin"), "Promoted to admin")}
                  tone="gold"
                >
                  Make Admin
                </ActBtn>
                <ActBtn
                  onClick={() => run(() => setRole(user.id, "moderator"), "Set as moderator")}
                  tone="gold"
                >
                  Make Moderator
                </ActBtn>
                <ActBtn
                  onClick={() => run(() => setRole(user.id, "user"), "Demoted to user")}
                  tone="rose"
                >
                  Remove Admin
                </ActBtn>
                {user.is_super_admin ? (
                  <ActBtn
                    onClick={() => run(() => setSuperAdmin(user.id, false), "Super admin removed")}
                    tone="rose"
                  >
                    Revoke Super Admin
                  </ActBtn>
                ) : (
                  <ActBtn
                    onClick={() =>
                      run(() => setSuperAdmin(user.id, true), "Promoted to super admin")
                    }
                    tone="gold"
                  >
                    Make Super Admin
                  </ActBtn>
                )}
              </div>
            </Section>
          )}
        </div>
      </Card>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 border-t border-white/5 pt-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

const TONES: Record<string, string> = {
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
  gold: "border-gold/30 bg-gold/10 text-gold hover:bg-gold/20",
  muted: "border-white/10 text-muted-foreground hover:text-foreground",
};

function ActBtn({
  onClick,
  tone,
  children,
}: {
  onClick: () => void;
  tone: keyof typeof TONES;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${TONES[tone]}`}
    >
      {children}
    </button>
  );
}
