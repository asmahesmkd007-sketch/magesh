import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { useEffect, useRef, useState } from "react";
import { useAuth, useProfile, type Profile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/site/UserAvatar";
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Instagram,
  Key,
  Landmark,
  Loader2,
  Lock,
  Shield,
  Smartphone,
  Youtube,
  X,
  XCircle,
  Facebook,
  Twitter,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useBankDetails } from "@/hooks/useBankDetails";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — ChessOx" }] }),
  component: Settings,
});

const TABS = [
  "Profile",
  "Security",
  "Bank Account",
  "Notifications",
  "Privacy",
  "Appearance",
] as const;

// ── Image processing helpers ─────────────────────────────────────────

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

      // Centre-crop to target aspect ratio
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
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas conversion failed"))),
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
  targetW: number,
  targetH: number,
): Promise<string> {
  const blob = await processImage(file, targetW, targetH);
  const ext = "jpg";
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ── Settings page ────────────────────────────────────────────────────

function Settings() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Profile");
  const { user, loading } = useAuth();
  const { profile, loading: pLoading, setProfile } = useProfile(user?.id);
  const { bankAccount, loading: bankLoading, saveBankDetails } = useBankDetails(user?.id);
  const [form, setForm] = useState({
    display_name: "",
    username: "",
    country: "India",
    bio: "",
    website: "",
    youtube_url: "",
    instagram_url: "",
    facebook_url: "",
    twitter_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name,
        username: profile.username,
        country: profile.country ?? "India",
        bio: profile.bio ?? "",
        website: profile.website ?? "",
        youtube_url: profile.youtube_url ?? "",
        instagram_url: profile.instagram_url ?? "",
        facebook_url: profile.facebook_url ?? "",
        twitter_url: profile.twitter_url ?? "",
      });
    }
  }, [profile]);

  if (loading || pLoading) {
    return (
      <PageShell>
        <div className="grid place-items-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </PageShell>
    );
  }
  if (!user || !profile) {
    return (
      <PageShell eyebrow="Configure" title="Sign in to access settings">
        <Link to="/auth">
          <GoldButton>Sign in</GoldButton>
        </Link>
      </PageShell>
    );
  }

  // ── Avatar upload ──
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5 MB)");
      return;
    }

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

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
      setAvatarPreview(null); // use stored URL from profile from now on
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setAvatarPreview(null);
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  // ── Banner upload ──
  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10 MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setBannerPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

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
      setBannerPreview(null);
      toast.success("Cover photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setBannerPreview(null);
    } finally {
      setUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
    }
  }

  // ── Save text fields ──
  async function saveProfile() {
    setSaving(true);
    const { error, data } = await (supabase as any)
      .from("profiles")
      .update({
        display_name: form.display_name,
        username: form.username,
        country: form.country,
        bio: form.bio,
        website: form.website || null,
        youtube_url: form.youtube_url || null,
        instagram_url: form.instagram_url || null,
        facebook_url: form.facebook_url || null,
        twitter_url: form.twitter_url || null,
      })
      .eq("id", user!.id)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setProfile(data as Profile | null);
    toast.success("Profile saved");
  }

  const currentAvatarUrl = avatarPreview ?? profile.avatar_url;
  const currentBannerUrl = bannerPreview ?? profile.banner_url;

  return (
    <PageShell eyebrow="Configure" title="Settings">
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <Card className="p-3">
          <ul className="space-y-1">
            {TABS.map((t) => (
              <li key={t}>
                <button
                  onClick={() => setTab(t)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${tab === t ? "bg-gold/10 text-gold" : "text-muted-foreground hover:bg-white/5"}`}
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          {tab === "Profile" && (
            <div className="space-y-6">
              {/* ── Cover Photo ── */}
              <div>
                <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                  Cover Photo
                </div>
                <div
                  className="relative h-36 w-full cursor-pointer overflow-hidden rounded-xl group"
                  onClick={() => bannerInputRef.current?.click()}
                >
                  {currentBannerUrl ? (
                    <img
                      src={currentBannerUrl}
                      alt="Cover"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-amber-500/40 via-rose-700/30 to-violet-700/30">
                      <div className="absolute inset-0 mandala-bg opacity-60" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    {uploadingBanner ? (
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    ) : (
                      <div className="flex items-center gap-2 text-white">
                        <Camera className="h-5 w-5" />
                        <span className="text-sm font-medium">Change cover photo</span>
                      </div>
                    )}
                  </div>
                </div>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleBannerChange}
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  JPG, PNG or WebP · Max 10 MB · Auto-cropped to 3:1 ratio
                </p>
              </div>

              {/* ── Profile Photo ── */}
              <div>
                <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                  Profile Photo
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <UserAvatar
                      avatarUrl={currentAvatarUrl}
                      displayName={profile.display_name}
                      size="xl"
                      shape="rounded-2xl"
                      className="ring-4 ring-background"
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                      ) : (
                        <Camera className="h-6 w-6 text-white" />
                      )}
                    </button>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Profile picture</p>
                    <p className="mt-0.5 text-xs">
                      Shown on your profile, in games, and everywhere your name appears.
                    </p>
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="mt-2 text-xs text-gold hover:underline"
                    >
                      Choose file
                    </button>
                    <p className="mt-1 text-[11px]">
                      JPG, PNG, WebP or GIF · Max 5 MB · Auto-cropped square
                    </p>
                  </div>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>

              {/* ── Email (read-only) ── */}
              <div>
                <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                  Verified Email
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2 text-sm text-muted-foreground">
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald" />
                  {user.email}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Email address cannot be changed here. Contact support if needed.
                </p>
              </div>

              <div className="royal-divider" />

              {/* ── Basic info ── */}
              <Field
                label="Display Name"
                value={form.display_name}
                onChange={(v) => setForm({ ...form, display_name: v })}
                placeholder="Your name shown publicly"
              />
              <Field
                label="Username"
                value={form.username}
                onChange={(v) => setForm({ ...form, username: v })}
                placeholder="@username"
              />
              <Field
                label="Country"
                value={form.country}
                onChange={(v) => setForm({ ...form, country: v })}
                placeholder="India"
              />
              <Field
                label="Bio"
                value={form.bio}
                onChange={(v) => setForm({ ...form, bio: v })}
                textarea
                placeholder="Tell the world a little about yourself…"
              />

              <div className="royal-divider" />

              {/* ── Social Links ── */}
              <div>
                <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
                  Social Links
                </div>
                <div className="space-y-3">
                  <SocialField
                    icon={<Globe className="h-4 w-4" />}
                    label="Website"
                    placeholder="https://yoursite.com"
                    value={form.website}
                    onChange={(v) => setForm({ ...form, website: v })}
                  />
                  <SocialField
                    icon={<Youtube className="h-4 w-4 text-rose-500" />}
                    label="YouTube"
                    placeholder="https://youtube.com/@channel"
                    value={form.youtube_url}
                    onChange={(v) => setForm({ ...form, youtube_url: v })}
                  />
                  <SocialField
                    icon={<Instagram className="h-4 w-4 text-pink-500" />}
                    label="Instagram"
                    placeholder="https://instagram.com/handle"
                    value={form.instagram_url}
                    onChange={(v) => setForm({ ...form, instagram_url: v })}
                  />
                  <SocialField
                    icon={<Facebook className="h-4 w-4 text-blue-500" />}
                    label="Facebook"
                    placeholder="https://facebook.com/page"
                    value={form.facebook_url}
                    onChange={(v) => setForm({ ...form, facebook_url: v })}
                  />
                  <SocialField
                    icon={<Twitter className="h-4 w-4 text-sky-400" />}
                    label="X / Twitter"
                    placeholder="https://x.com/handle"
                    value={form.twitter_url}
                    onChange={(v) => setForm({ ...form, twitter_url: v })}
                  />
                </div>
              </div>

              <GoldButton onClick={saveProfile} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </GoldButton>
            </div>
          )}
          {tab === "Security" && <SecurityTab email={user.email ?? ""} />}
          {tab === "Bank Account" && (
            <BankAccountTab
              userId={user.id}
              bankAccount={bankAccount}
              bankLoading={bankLoading}
              saveBankDetails={saveBankDetails}
            />
          )}
          {tab === "Notifications" && (
            <div className="space-y-3">
              {[
                "Tournament reminders",
                "Friend requests",
                "Club announcements",
                "Puzzle streak alerts",
                "Newsletter",
              ].map((n) => (
                <div
                  key={n}
                  className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm"
                >
                  <span>{n}</span>
                  <Toggle defaultOn={n !== "Newsletter"} />
                </div>
              ))}
            </div>
          )}
          {tab === "Privacy" && (
            <div className="space-y-3">
              {[
                "Show profile to public",
                "Show rating history",
                "Allow direct challenges",
                "Show online status",
              ].map((n) => (
                <div
                  key={n}
                  className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm"
                >
                  <span>{n}</span>
                  <Toggle defaultOn />
                </div>
              ))}
            </div>
          )}
          {tab === "Appearance" && (
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-sm">Board Theme</div>
                <div className="grid grid-cols-4 gap-3">
                  {["Rosewood", "Marble", "Brass", "Emerald"].map((b, i) => (
                    <button
                      key={b}
                      className={`rounded-lg border p-3 text-xs ${i === 0 ? "border-gold ring-2 ring-gold/30" : "border-white/10"}`}
                    >
                      <div className="aspect-square overflow-hidden rounded-md">
                        <div className="grid h-full grid-cols-4 grid-rows-4">
                          {Array.from({ length: 16 }).map((_, k) => (
                            <div
                              key={k}
                              className={
                                (k + Math.floor(k / 4)) % 2 === 0 ? "bg-[#E8D5B0]" : "bg-[#8B5A2B]"
                              }
                            />
                          ))}
                        </div>
                      </div>
                      <div className="mt-2">{b}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/5 p-3 text-sm">
                <span>Royal sound effects</span>
                <Toggle defaultOn />
              </div>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

// ─── Bank Account Tab ────────────────────────────────────────────────────────

type IfscDetails = { BANK: string; BRANCH: string; ADDRESS: string };

function BankAccountTab({
  userId,
  bankAccount,
  bankLoading,
  saveBankDetails,
}: {
  userId: string;
  bankAccount: ReturnType<typeof useBankDetails>["bankAccount"];
  bankLoading: boolean;
  saveBankDetails: ReturnType<typeof useBankDetails>["saveBankDetails"];
}) {
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccount, setConfirmAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [accountType, setAccountType] = useState<"savings" | "current">("savings");
  const [ifscDetails, setIfscDetails] = useState<IfscDetails | null>(null);
  const [isVerifyingIfsc, setIsVerifyingIfsc] = useState(false);
  const [ifscError, setIfscError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const accountsMatch = accountNumber && confirmAccount && accountNumber === confirmAccount;
  const accountsMismatch = confirmAccount.length > 0 && accountNumber !== confirmAccount;
  const canSave = accountName.length > 2 && accountsMatch && ifscDetails !== null && !isSaving;

  useEffect(() => {
    if (bankAccount) {
      setAccountName(bankAccount.account_holder_name);
      setIfsc(bankAccount.ifsc_code);
      setAccountType(bankAccount.account_type);
      setIfscDetails({
        BANK: bankAccount.bank_name,
        BRANCH: bankAccount.branch_name,
        ADDRESS: bankAccount.branch_address,
      });
    }
  }, [bankAccount]);

  useEffect(() => {
    const code = ifsc.trim().toUpperCase();
    if (code.length !== 11) {
      setIfscDetails(null);
      setIfscError("");
      return;
    }
    if (bankAccount && code === bankAccount.ifsc_code) return;

    const id = setTimeout(async () => {
      setIsVerifyingIfsc(true);
      setIfscError("");
      try {
        const res = await fetch(`https://ifsc.razorpay.com/${code}`);
        if (!res.ok) throw new Error("Invalid IFSC");
        setIfscDetails(await res.json());
      } catch {
        setIfscDetails(null);
        setIfscError("Invalid IFSC Code. Please check and try again.");
      } finally {
        setIsVerifyingIfsc(false);
      }
    }, 500);
    return () => clearTimeout(id);
  }, [ifsc, bankAccount]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || !ifscDetails) return;
    setIsSaving(true);
    await saveBankDetails({
      accountHolderName: accountName,
      accountNumber,
      ifscCode: ifsc.toUpperCase(),
      bankName: ifscDetails.BANK,
      branchName: ifscDetails.BRANCH,
      branchAddress: ifscDetails.ADDRESS,
      accountType,
    });
    setIsSaving(false);
  }

  if (bankLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/10">
          <Landmark className="h-4 w-4 text-gold" />
        </span>
        <div>
          <div className="font-display text-lg leading-tight">Bank Account</div>
          <div className="text-xs text-muted-foreground">
            {bankAccount
              ? "Update your bank details for withdrawals"
              : "Add bank details to enable withdrawals"}
          </div>
        </div>
      </div>

      {/* Current account status */}
      {bankAccount && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <div className="text-sm font-medium text-emerald-400">Bank Verified</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {bankAccount.bank_name} · XXXX{bankAccount.account_number_last4}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Account holder name */}
        <div>
          <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
            Account Holder Name
          </div>
          <input
            type="text"
            required
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
            placeholder="As it appears on your bank statement"
          />
        </div>

        {/* Account number */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Account Number
              </span>
              <Lock className="h-3 w-3 text-muted-foreground/40" />
            </div>
            <div className="relative font-mono">
              <input
                type="text"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
                placeholder="Enter account number"
                maxLength={20}
              />
            </div>
            {bankAccount && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Current: ···{bankAccount.account_number_last4} (enter to update)
              </p>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              Re-enter Account Number
            </div>
            <input
              type="text"
              required
              value={confirmAccount}
              onChange={(e) => setConfirmAccount(e.target.value.replace(/\D/g, ""))}
              onPaste={(e) => e.preventDefault()}
              className={`w-full rounded-lg border bg-white/[0.02] px-3 py-2 text-sm outline-none font-mono ${
                accountsMismatch ? "border-rose-500/50" : "border-white/10 focus:border-gold/40"
              }`}
              placeholder="Verify account number"
              maxLength={20}
            />
            {accountsMatch && accountNumber.length > 0 && (
              <div className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Match
              </div>
            )}
            {accountsMismatch && (
              <div className="mt-1 flex items-center gap-1 text-xs text-rose-400">
                <XCircle className="h-3 w-3" /> Do not match
              </div>
            )}
          </div>
        </div>

        {/* IFSC + type */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              IFSC Code
            </div>
            <div className="relative">
              <input
                type="text"
                required
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                className={`w-full uppercase rounded-lg border bg-white/[0.02] px-3 py-2 text-sm outline-none font-mono ${
                  ifscError ? "border-rose-500/50" : "border-white/10 focus:border-gold/40"
                }`}
                placeholder="e.g. SBIN0001234"
                maxLength={11}
              />
              {isVerifyingIfsc && (
                <div className="absolute right-3 top-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            {ifscError && (
              <div className="mt-1 flex items-center gap-1 text-xs text-rose-400">
                <XCircle className="h-3 w-3" /> {ifscError}
              </div>
            )}
            {ifscDetails && !isVerifyingIfsc && (
              <div className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
                <ShieldCheck className="h-3 w-3" /> {ifscDetails.BANK} — {ifscDetails.BRANCH}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              Account Type
            </div>
            <div className="flex gap-5 pt-1.5">
              {(["savings", "current"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="settingsAccountType"
                    value={t}
                    checked={accountType === t}
                    onChange={() => setAccountType(t)}
                    className="accent-gold"
                  />
                  <span className="text-sm capitalize">{t}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-5">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Lock className="h-3 w-3" /> Encrypted with AES-256
          </p>
          <GoldButton type="submit" disabled={!canSave}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : bankAccount ? (
              "Update Bank Details"
            ) : (
              "Save Bank Details"
            )}
          </GoldButton>
        </div>
      </form>

      <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
        <div className="flex items-start gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-2">
            <li>Ensure the account holder name exactly matches your bank records.</li>
            <li>Withdrawals are processed within 2–4 business days after admin approval.</li>
            <li>ChessOx does not charge any fees for withdrawals.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Password helpers ────────────────────────────────────────────────────────

const PASSWORD_REQUIREMENTS = [
  { key: "length", label: "Minimum 8 characters", test: (p: string) => p.length >= 8 },
  { key: "upper", label: "At least one uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower", label: "At least one lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { key: "number", label: "At least one number", test: (p: string) => /\d/.test(p) },
  {
    key: "special",
    label: "At least one special character",
    test: (p: string) => /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/.test(p),
  },
] as const;

function checkPassword(pw: string) {
  return PASSWORD_REQUIREMENTS.map((r) => ({ ...r, passing: r.test(pw) }));
}

function isStrongPassword(pw: string) {
  return PASSWORD_REQUIREMENTS.every((r) => r.test(pw));
}

const STRENGTH_TIERS = [
  { label: "Too weak", color: "bg-destructive", text: "text-destructive" },
  { label: "Weak", color: "bg-orange-500", text: "text-orange-400" },
  { label: "Fair", color: "bg-amber-500", text: "text-amber-400" },
  { label: "Good", color: "bg-lime-500", text: "text-lime-400" },
  { label: "Strong", color: "bg-emerald", text: "text-emerald" },
] as const;

function passwordStrength(pw: string) {
  if (!pw) return 0;
  const met = PASSWORD_REQUIREMENTS.filter((r) => r.test(pw)).length;
  let score = Math.max(0, met - 1);
  if (met === PASSWORD_REQUIREMENTS.length && pw.length >= 12) score = 4;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECS = 60;

type RateLimit = { locked: boolean; retry_after: number; failures: number };
type RpcFn = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

// ─── PasswordField ───────────────────────────────────────────────────────────

function PasswordField({
  label,
  value,
  onChange,
  placeholder = "••••••••",
  error,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`w-full rounded-lg border bg-white/[0.02] px-3 py-2 pr-10 text-sm outline-none transition-colors focus:border-gold/40 ${
            error ? "border-destructive/50 focus:border-destructive/60" : "border-white/10"
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ─── StrengthMeter ───────────────────────────────────────────────────────────

function StrengthMeter({ password }: { password: string }) {
  const score = passwordStrength(password);
  const tier = STRENGTH_TIERS[score];
  return (
    <div className="mt-3">
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < score ? tier.color : "bg-white/10"
            }`}
          />
        ))}
      </div>
      <div className={`mt-1.5 text-xs font-medium ${tier.text}`} role="status" aria-live="polite">
        Password strength: {tier.label}
      </div>
    </div>
  );
}

// ─── SecurityTab ─────────────────────────────────────────────────────────────

function SecurityTab({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!lockoutUntil) return;
    timerRef.current = setInterval(() => {
      const rem = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (rem <= 0) {
        setLockoutUntil(null);
        setAttempts(0);
        setSecondsLeft(0);
        setErrors((e) => ({ ...e, current: "" }));
      } else {
        setSecondsLeft(rem);
      }
    }, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [lockoutUntil]);

  const lockedOut = lockoutUntil !== null && Date.now() < lockoutUntil;
  const checks = checkPassword(next);

  function clearField(field: keyof typeof errors) {
    setErrors((e) => ({ ...e, [field]: "" }));
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!current) e.current = "Current password is required.";
    if (!next) e.next = "New password is required.";
    else if (!isStrongPassword(next)) e.next = "Password does not meet the requirements below.";
    if (!confirm) e.confirm = "Please confirm your new password.";
    else if (next !== confirm) e.confirm = "Passwords do not match.";
    if (current && next && current === next)
      e.next = "New password must differ from your current password.";
    return e;
  }

  async function handleSubmit() {
    if (lockedOut || busy) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setBusy(true);
    try {
      const limit = await checkServerRateLimit();
      if (limit?.locked) {
        const secs = limit.retry_after || LOCKOUT_SECS;
        setLockoutUntil(Date.now() + secs * 1000);
        setSecondsLeft(secs);
        setErrors({ current: `Too many failed attempts. Try again in ${secs}s.` });
        setBusy(false);
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signInErr) {
        await logAttempt(false, "incorrect_current_password");
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_SECS * 1000;
          setLockoutUntil(until);
          setSecondsLeft(LOCKOUT_SECS);
          setErrors({ current: `Too many failed attempts. Try again in ${LOCKOUT_SECS}s.` });
        } else {
          const remaining = MAX_ATTEMPTS - newAttempts;
          setErrors({
            current: `Incorrect password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
          });
        }
        setBusy(false);
        return;
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password: next });
      if (updateErr) {
        await logAttempt(false, "update_failed");
        setErrors({ general: updateErr.message });
        setBusy(false);
        return;
      }

      await logAttempt(true, "password_changed");
      await supabase.auth.signOut({ scope: "others" });
      setCurrent("");
      setNext("");
      setConfirm("");
      setErrors({});
      setAttempts(0);
      setBusy(false);
      toast.success("Password changed. You've been signed out on all other devices.");
    } catch {
      setErrors({ general: "Network error. Please try again." });
      setBusy(false);
    }
  }

  async function logAttempt(success: boolean, reason: string) {
    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
      await (supabase.rpc as unknown as RpcFn)("log_password_change_attempt", {
        p_success: success,
        p_reason: reason,
        p_user_agent: ua,
      });
    } catch {
      /* non-critical */
    }
  }

  async function checkServerRateLimit(): Promise<RateLimit | null> {
    try {
      const { data, error } = await (supabase.rpc as unknown as RpcFn)(
        "check_password_change_rate_limit",
        {},
      );
      if (error || !data) return null;
      return data as RateLimit;
    } catch {
      return null;
    }
  }

  function handleCancel() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setErrors({});
  }

  const isDirty = current !== "" || next !== "" || confirm !== "";

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/10">
            <Lock className="h-4 w-4 text-gold" />
          </span>
          <div>
            <div className="font-display text-lg leading-tight">Password</div>
            <div className="text-xs text-muted-foreground">
              Keep your account secure with a strong, unique password
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              Email
            </div>
            <div className="w-full rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2 text-sm text-muted-foreground">
              {email}
            </div>
          </div>

          <PasswordField
            label="Current Password"
            value={current}
            onChange={(v) => {
              setCurrent(v);
              clearField("current");
            }}
            error={errors.current}
            autoComplete="current-password"
          />

          <div>
            <PasswordField
              label="New Password"
              value={next}
              onChange={(v) => {
                setNext(v);
                clearField("next");
              }}
              error={errors.next}
              autoComplete="new-password"
            />
            {next.length > 0 && <StrengthMeter password={next} />}
            {next.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-3 sm:grid-cols-2">
                {checks.map(({ key, label, passing }) => (
                  <div
                    key={key}
                    className={`flex items-center gap-2 text-xs transition-colors ${passing ? "text-emerald" : "text-muted-foreground"}`}
                  >
                    {passing ? (
                      <Check className="h-3 w-3 shrink-0" />
                    ) : (
                      <X className="h-3 w-3 shrink-0" />
                    )}
                    {label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <PasswordField
            label="Confirm New Password"
            value={confirm}
            onChange={(v) => {
              setConfirm(v);
              clearField("confirm");
            }}
            error={errors.confirm}
            autoComplete="new-password"
          />

          {errors.general && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errors.general}
            </div>
          )}

          {lockedOut && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Account temporarily locked. Try again in{" "}
              <span className="font-mono font-semibold">{secondsLeft}s</span>.
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <GoldButton onClick={handleSubmit} disabled={busy || lockedOut}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Updating…
                </>
              ) : (
                "Change Password"
              )}
            </GoldButton>
            {isDirty && !busy && (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="royal-divider" />

      <div>
        <div className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">
          Advanced Security
        </div>
        <div className="space-y-2.5">
          {[
            {
              icon: Shield,
              title: "Two-Factor Authentication",
              desc: "Require a code from your authenticator app at every sign-in.",
            },
            {
              icon: Smartphone,
              title: "Active Sessions",
              desc: "View and revoke access from other devices and browsers.",
            },
            {
              icon: Key,
              title: "Passkeys",
              desc: "Sign in without a password using biometrics or a security key.",
            },
            {
              icon: FileText,
              title: "Security Activity Log",
              desc: "Review recent sign-ins, password changes, and security events.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3.5"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-sm">{title}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-gold/20 bg-gold/5 px-3 py-0.5 text-xs text-gold/60">
                Coming Soon
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-24 w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-gold/40"
        />
      )}
    </label>
  );
}

function SocialField({
  icon,
  label,
  placeholder,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-0.5 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
      </div>
    </div>
  );
}

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      onClick={() => setOn(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? "gradient-gold" : "bg-white/10"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}
