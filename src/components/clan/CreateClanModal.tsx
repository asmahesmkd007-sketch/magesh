import { useState, useRef } from "react";
import { X, Loader2, Image as ImageIcon, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  onClose: () => void;
  onSuccess: (clan: any) => void;
}

export function CreateClanModal({ onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    tag: "",
    description: "",
    country: "International",
    language: "English",
    privacy: "public",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // 5MB limit check
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo must be less than 5MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name || formData.name.length < 3 || formData.name.length > 32) {
      toast.error("Clan name must be between 3 and 32 characters.");
      return;
    }
    if (!formData.tag || formData.tag.length < 2 || formData.tag.length > 5 || !/^[A-Z0-9]+$/.test(formData.tag)) {
      toast.error("Clan tag must be 2-5 uppercase letters or numbers.");
      return;
    }
    if (!user) {
      toast.error("You must be logged in to create a clan.");
      return;
    }

    setLoading(true);
    let finalLogoUrl = "";

    try {
      if (logoFile) {
        const ext = logoFile.name.split('.').pop() || 'jpg';
        const path = `${user.id}/clan_logo_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, logoFile, {
          upsert: true,
        });
        if (uploadError) throw uploadError;
        
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
        finalLogoUrl = urlData.publicUrl;
      }
      
      // Call RPC
      const { data: clanId, error } = await supabase.rpc("clan_create", {
        p_name: formData.name,
        p_tag: formData.tag,
        p_description: formData.description,
        p_country: formData.country,
        p_language: formData.language,
        p_privacy: formData.privacy,
        p_logo_url: finalLogoUrl,
        p_banner_url: "", // omitted per requirements
      });

      if (error) {
        throw error;
      }

      if (clanId) {
        const { data } = await supabase.from("clans").select("*").eq("id", clanId).single();
        if (data) {
          onSuccess(data);
          toast.success("Clan created successfully!");
          onClose();
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to create clan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#0B0D10] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 p-4">
          <h2 className="font-display text-xl">Found a New Clan</h2>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Clan Name</label>
              <input
                required
                minLength={3}
                maxLength={32}
                className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none focus:border-gold/50"
                placeholder="e.g. Chess Warriors"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Clan Tag</label>
              <input
                required
                minLength={2}
                maxLength={5}
                className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none focus:border-gold/50 uppercase"
                placeholder="e.g. WAR"
                value={formData.tag}
                onChange={(e) => setFormData(prev => ({...prev, tag: e.target.value.toUpperCase()}))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Description</label>
            <textarea
              rows={3}
              className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none focus:border-gold/50 resize-none"
              placeholder="Tell others what your clan is about..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Country</label>
              <input
                className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none focus:border-gold/50"
                placeholder="International"
                value={formData.country}
                onChange={(e) => setFormData(prev => ({...prev, country: e.target.value}))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Language</label>
              <input
                className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none focus:border-gold/50"
                placeholder="English"
                value={formData.language}
                onChange={(e) => setFormData(prev => ({...prev, language: e.target.value}))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Privacy Setting</label>
            <select
              className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm outline-none focus:border-gold/50"
              value={formData.privacy}
              onChange={(e) => setFormData(prev => ({...prev, privacy: e.target.value}))}
            >
              <option value="public">Public (Anyone can join)</option>
              <option value="private">Private (Request to join)</option>
              <option value="invite_only">Invite Only (Cannot request to join)</option>
            </select>
          </div>
          
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-display text-gold flex items-center gap-2">
              <ImageIcon className="h-4 w-4" /> Branding
            </h3>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Logo (Max 5MB)</label>
              
              <div className="flex items-center gap-4">
                <div 
                  className="h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-black/50 flex-shrink-0 cursor-pointer flex items-center justify-center hover:border-gold/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
                  ) : (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-2">Upload a square image for best results.</p>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="text-xs text-white file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:text-white hover:file:bg-white/20 cursor-pointer outline-none"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div className="pt-4 border-t border-white/5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-black hover:bg-gold/90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Founding..." : "Found Clan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
