import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { loadSettingsOnce } from "@/lib/settings/settings-sync";

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  bio: string | null;
  country: string | null;
  state: string | null;
  district: string | null;
  favorite_opening: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  title: string | null;
  premium_tier: "free" | "gold" | "platinum" | "maharaja";
  premium_active: boolean;
  premium_expires_at: string | null;
  subscription_status: string;
  website: string | null;
  youtube_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on mount with the restored session.
    // Relying on it alone avoids a race where a separate getSession() call briefly
    // sets loading=false with session=null before INITIAL_SESSION fires.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
      if (s && (_event === "SIGNED_IN" || _event === "INITIAL_SESSION")) {
        loadSettingsOnce().catch(console.error);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export function useProfile(userId?: string | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
      .then(async ({ data }) => {
        let prof = data as Profile | null;
        
        if (prof) {
          // Shim for local dev if migration hasn't run yet
          if (!(prof as any).full_name && (prof as any).display_name) {
            prof.full_name = (prof as any).display_name;
          }

          let needsUpdate = false;
          let newFullName = prof.full_name;
          let newUsername = prof.username;

          if (!newFullName || newFullName.toLowerCase().startsWith("player")) {
            // Get email prefix if possible
            const { data: userData } = await supabase.auth.getUser();
            const email = userData.user?.email || "";
            newFullName = email.split('@')[0] || "User";
            needsUpdate = true;
          }
          
          if (!newUsername || newUsername.toLowerCase().startsWith("player")) {
            const { generateUsername } = await import("@/lib/utils/profile");
            newUsername = generateUsername(newFullName);
            needsUpdate = true;
          }

          if (needsUpdate) {
            let { error } = await supabase
              .from("profiles")
              .update({ full_name: newFullName, username: newUsername })
              .eq("id", userId);
            
            // Fallback for unmigrated local database
            if (error && error.message.includes("full_name")) {
              const fallback = await supabase
                .from("profiles")
                .update({ display_name: newFullName, username: newUsername } as any)
                .eq("id", userId);
              error = fallback.error;
            }
            
            if (!error) {
              prof = { ...prof, full_name: newFullName, username: newUsername };
            }
          }
        }
        
        setProfile(prof);
        setLoading(false);
      });
  }, [userId]);

  return { profile, loading, setProfile };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
