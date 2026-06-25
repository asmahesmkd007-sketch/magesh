import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { useEffect, useState } from "react";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — ChessOx" }] }),
  component: Settings,
});

const TABS = ["Profile", "Security", "Notifications", "Privacy", "Appearance"] as const;

function Settings() {
  const [tab, setTab] = useState<typeof TABS[number]>("Profile");
  const { user, loading } = useAuth();
  const { profile, loading: pLoading, setProfile } = useProfile(user?.id);
  const [form, setForm] = useState({ display_name: "", username: "", country: "India", bio: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) setForm({ display_name: profile.display_name, username: profile.username, country: profile.country ?? "India", bio: profile.bio ?? "" });
  }, [profile]);

  if (loading || pLoading) {
    return <PageShell><div className="grid place-items-center py-32"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div></PageShell>;
  }
  if (!user || !profile) {
    return (
      <PageShell eyebrow="Configure" title="Sign in to access settings">
        <Link to="/auth"><GoldButton>Sign in</GoldButton></Link>
      </PageShell>
    );
  }

  async function saveProfile() {
    setSaving(true);
    const { error, data } = await supabase
      .from("profiles")
      .update({ display_name: form.display_name, username: form.username, country: form.country, bio: form.bio })
      .eq("id", user!.id)
      .select()
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setProfile(data as any);
    toast.success("Profile saved");
  }

  async function changePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast.error(error.message); else toast.success("Password updated");
  }

  return (
    <PageShell eyebrow="Configure" title="Settings">
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <Card className="p-3">
          <ul className="space-y-1">
            {TABS.map(t => (
              <li key={t}>
                <button onClick={() => setTab(t)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${tab===t ? "bg-gold/10 text-gold" : "text-muted-foreground hover:bg-white/5"}`}>{t}</button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          {tab === "Profile" && (
            <div className="space-y-5">
              <Field label="Display Name" value={form.display_name} onChange={(v) => setForm({ ...form, display_name: v })} />
              <Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} />
              <Field label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
              <Field label="Bio" value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} textarea />
              <GoldButton onClick={saveProfile} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</GoldButton>
            </div>
          )}
          {tab === "Security" && <SecurityTab email={user.email ?? ""} onChange={changePassword} />}
          {tab === "Notifications" && (
            <div className="space-y-3">
              {["Tournament reminders", "Friend requests", "Club announcements", "Puzzle streak alerts", "Newsletter"].map(n => (
                <div key={n} className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm">
                  <span>{n}</span><Toggle defaultOn={n !== "Newsletter"} />
                </div>
              ))}
            </div>
          )}
          {tab === "Privacy" && (
            <div className="space-y-3">
              {["Show profile to public","Show rating history","Allow direct challenges","Show online status"].map(n => (
                <div key={n} className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm">
                  <span>{n}</span><Toggle defaultOn />
                </div>
              ))}
            </div>
          )}
          {tab === "Appearance" && (
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-sm">Board Theme</div>
                <div className="grid grid-cols-4 gap-3">
                  {["Rosewood","Marble","Brass","Emerald"].map((b, i) => (
                    <button key={b} className={`rounded-lg border p-3 text-xs ${i===0 ? "border-gold ring-2 ring-gold/30" : "border-white/10"}`}>
                      <div className="aspect-square overflow-hidden rounded-md">
                        <div className="grid h-full grid-cols-4 grid-rows-4">
                          {Array.from({length:16}).map((_,k) => <div key={k} className={(k+Math.floor(k/4))%2===0 ? "bg-[#E8D5B0]" : "bg-[#8B5A2B]"} />)}
                        </div>
                      </div>
                      <div className="mt-2">{b}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm">
                <span>Royal sound effects</span><Toggle defaultOn />
              </div>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function SecurityTab({ email, onChange }: { email: string; onChange: (pw: string) => Promise<void> }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-5">
      <Field label="Email" value={email} onChange={() => {}} />
      <Field label="New Password" value={pw} onChange={setPw} placeholder="••••••••" type="password" />
      <GoldButton
        disabled={busy || pw.length < 8}
        onClick={async () => { setBusy(true); await onChange(pw); setBusy(false); setPw(""); }}
      >
        {busy ? "Updating..." : "Update Password"}
      </GoldButton>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, textarea, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean; type?: string }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-24 w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40" />
      )}
    </label>
  );
}

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button onClick={() => setOn(!on)} className={`relative h-6 w-11 rounded-full transition-colors ${on ? "gradient-gold" : "bg-white/10"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
