import { initials } from "@/hooks/useAuth";

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

export function UserAvatar({
  avatarUrl,
  displayName,
  size = "md",
  className = "",
  shape = "rounded-full",
}: UserAvatarProps) {
  const { wrapper, text } = SIZE_MAP[size];

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName ?? "Player avatar"}
        className={`${wrapper} ${shape} object-cover ${className}`}
        draggable={false}
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
