import { useEffect, useState } from "react";
import { initials } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const SIZE_MAP = {
  xs: { wrapper: "h-7 w-7", text: "text-[10px]" },
  sm: { wrapper: "h-8 w-8", text: "text-xs" },
  md: { wrapper: "h-11 w-11", text: "text-sm" },
  lg: { wrapper: "h-16 w-16", text: "text-xl" },
  xl: { wrapper: "h-28 w-28", text: "text-5xl" },
} as const;

interface UserAvatarProps {
  avatarUrl?: string | null;
  displayName?: string | null;
  size?: keyof typeof SIZE_MAP;
  /** Extra classes applied to the root element */
  className?: string;
  /** Shape override — default is rounded-full; pass "rounded-2xl" for profile page */
  shape?: string;
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export function extractAvatarStoragePath(url?: string | null): string | null {
  if (!url || !url.trim()) return null;
  const clean = url.trim();

  // Match /object/public/avatars/<path> or /object/sign/avatars/<path>
  const match = clean.match(/\/object\/(?:public|sign)\/avatars\/(.+)$/);
  if (match && match[1]) {
    return match[1].split("?")[0];
  }

  // If it's a relative path like "userId/timestamp.jpg" or "avatars/userId/timestamp.jpg"
  if (
    !clean.startsWith("http://") &&
    !clean.startsWith("https://") &&
    !clean.startsWith("data:") &&
    !clean.startsWith("blob:") &&
    !clean.startsWith("/")
  ) {
    return clean.replace(/^avatars\//, "");
  }

  return null;
}

export function useResolvedAvatarUrl(avatarUrl?: string | null): string | null {
  const [resolved, setResolved] = useState<string | null>(() => {
    if (!avatarUrl || !avatarUrl.trim()) return null;
    const path = extractAvatarStoragePath(avatarUrl);
    if (path) {
      const cached = signedUrlCache.get(path);
      if (cached && cached.expiresAt > Date.now()) return cached.url;
    }
    return avatarUrl.trim();
  });

  useEffect(() => {
    if (!avatarUrl || !avatarUrl.trim()) {
      setResolved(null);
      return;
    }
    const clean = avatarUrl.trim();
    const path = extractAvatarStoragePath(clean);

    if (!path) {
      setResolved(clean);
      return;
    }

    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      setResolved(cached.url);
      return;
    }

    let isMounted = true;
    supabase.storage
      .from("avatars")
      .createSignedUrl(path, 86400)
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (data?.signedUrl) {
          signedUrlCache.set(path, {
            url: data.signedUrl,
            expiresAt: Date.now() + 86400 * 1000 - 60000,
          });
          setResolved(data.signedUrl);
        } else {
          const publicUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
          setResolved(publicUrl || clean);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setResolved(clean);
      });

    return () => {
      isMounted = false;
    };
  }, [avatarUrl]);

  return resolved;
}

export function UserAvatar({
  avatarUrl,
  displayName,
  size = "md",
  className = "",
  shape = "rounded-full",
}: UserAvatarProps) {
  const { wrapper, text } = SIZE_MAP[size];
  const [hasError, setHasError] = useState(false);
  const primaryUrl = useResolvedAvatarUrl(avatarUrl);

  useEffect(() => {
    setHasError(false);
  }, [primaryUrl]);

  if (primaryUrl && !hasError) {
    return (
      <img
        src={primaryUrl}
        alt={displayName ?? "Player avatar"}
        className={`${wrapper} ${shape} object-cover ${className}`}
        draggable={false}
        referrerPolicy="no-referrer"
        onError={(e) => {
          console.warn("[UserAvatar] Image load error:", { displayName, avatarUrl, primaryUrl, e });
          setHasError(true);
        }}
      />
    );
  }

  return (
    <div
      className={`${wrapper} ${shape} grid place-items-center gradient-gold font-display ${text} text-[#0B0D10] ${className}`}
    >
      {initials(displayName)}
    </div>
  );
}
