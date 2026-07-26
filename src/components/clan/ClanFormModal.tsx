import { useMemo, useRef, useState } from "react";
import { X, Loader2, Upload, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  createClan,
  updateClan,
  validateClanInput,
  ClanApiError,
  type CreateClanInput,
} from "@/lib/clanApi";
import { gradientFromSlug } from "@/lib/clan";
import type { Clan, ClanPrivacy } from "@/types/clan";

type Props =
  | {
      mode: "create";
      clan?: undefined;
      onClose: () => void;
      onSaved: (clan: Clan) => void | Promise<void>;
    }
  | { mode: "edit"; clan: Clan; onClose: () => void; onSaved: () => void | Promise<void> };

const PRIVACY_OPTIONS: { value: ClanPrivacy; label: string }[] = [
  { value: "public", label: "Public — anyone can join" },
  { value: "private", label: "Private — request to join" },
  { value: "invite_only", label: "Invite only" },
];

function ImagePicker({
  label,
  preview,
  onPick,
  shape,
}: {
  label: string;
  preview: string | null;
  onPick: (file: File) => void;
  shape: "square" | "wide";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const box = shape === "square" ? "h-20 w-20 rounded-xl" : "h-20 w-full rounded-xl";
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`${box} overflow-hidden border border-dashed border-white/15 bg-black/40 grid place-items-center transition-colors hover:border-gold/50`}
      >
        {preview ? (
          <img src={preview} alt={`${label} preview`} className="h-full w-full object-cover" />
        ) : (
          <Upload className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
        }}
      />
    </div>
  );
}

export function ClanFormModal(props: Props) {
  const { mode, onClose } = props;
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<CreateClanInput>({
    name: mode === "edit" ? props.clan.name : "",
    tag: mode === "edit" ? props.clan.tag : "",
    description: mode === "edit" ? (props.clan.description ?? "") : "",
    country: mode === "edit" ? props.clan.country : "International",
    language: mode === "edit" ? props.clan.language : "English",
    privacy: mode === "edit" ? props.clan.privacy : "public",
    logoFile: null,
    bannerFile: null,
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(
    mode === "edit" ? props.clan.logo_url : null,
  );
  const [bannerPreview, setBannerPreview] = useState<string | null>(
    mode === "edit" ? props.clan.banner_url : null,
  );

  const previewSlug = useMemo(
    () =>
      mode === "edit"
        ? props.clan.slug
        : form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "preview",
    [mode, props, form.name],
  );

  function pickImage(kind: "logo" | "banner", file: File) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      if (kind === "logo") setLogoPreview(url);
      else setBannerPreview(url);
    };
    reader.readAsDataURL(file);
    setForm((f) => (kind === "logo" ? { ...f, logoFile: file } : { ...f, bannerFile: file }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("You must be signed in.");
      return;
    }
    const invalid = validateClanInput(form);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const clan = await createClan(user.id, form);
        toast.success("Clan founded!");
        await props.onSaved(clan);
      } else {
        await updateClan(user.id, props.clan.id, form);
        toast.success("Clan updated");
        await props.onSaved();
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof ClanApiError ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-gold/50 placeholder:text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#0B0D10] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="font-display text-xl text-white">
            {mode === "create" ? "Found a New Clan" : "Edit Clan"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid max-h-[80vh] gap-6 overflow-y-auto p-5 custom-scrollbar md:grid-cols-[1fr_260px]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Clan Name
                </label>
                <input
                  required
                  minLength={3}
                  maxLength={20}
                  className={inputClass}
                  placeholder="e.g. Chess Warriors"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Clan Tag
                </label>
                <input
                  required
                  minLength={3}
                  maxLength={5}
                  disabled={mode === "edit"}
                  className={`${inputClass} uppercase disabled:opacity-50`}
                  placeholder="e.g. WAR"
                  value={form.tag}
                  onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value.toUpperCase() }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Description
              </label>
              <textarea
                rows={3}
                maxLength={500}
                className={`${inputClass} resize-none`}
                placeholder="Tell others what your clan is about..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Country
                </label>
                <input
                  className={inputClass}
                  placeholder="International"
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Language
                </label>
                <input
                  className={inputClass}
                  placeholder="English"
                  value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Privacy
              </label>
              <select
                className={inputClass}
                value={form.privacy}
                onChange={(e) => setForm((f) => ({ ...f, privacy: e.target.value as ClanPrivacy }))}
              >
                {PRIVACY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-4">
              <ImagePicker
                label="Logo"
                shape="square"
                preview={logoPreview}
                onPick={(f) => pickImage("logo", f)}
              />
              <div className="flex-1">
                <ImagePicker
                  label="Banner"
                  shape="wide"
                  preview={bannerPreview}
                  onPick={(f) => pickImage("banner", f)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-white/5 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-gold px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-gold/90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving..." : mode === "create" ? "Found Clan" : "Save Changes"}
              </button>
            </div>
          </form>

          {/* Live preview */}
          <div className="hidden md:block">
            <div className="sticky top-0 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" /> Live Preview
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                <div
                  className={`h-20 bg-cover bg-center ${!bannerPreview ? `bg-gradient-to-br ${gradientFromSlug(previewSlug)}` : ""}`}
                  style={bannerPreview ? { backgroundImage: `url(${bannerPreview})` } : undefined}
                />
                <div className="relative -mt-7 px-4 pb-4">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt=""
                      className="h-14 w-14 rounded-xl object-cover ring-4 ring-[#0B0D10] bg-black"
                    />
                  ) : (
                    <div
                      className={`grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br ${gradientFromSlug(previewSlug)} font-display text-xl text-white ring-4 ring-[#0B0D10]`}
                    >
                      {form.name[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-display text-lg text-white truncate">
                      {form.name || "Clan Name"}
                    </span>
                    {form.tag && (
                      <span className="rounded bg-gold/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gold">
                        [{form.tag}]
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                    {form.description || "Your clan description will appear here."}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>🌍 {form.country || "International"}</span>
                    <span>🗣️ {form.language || "English"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
