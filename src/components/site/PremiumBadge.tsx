import { Crown } from "lucide-react";

type PremiumBadgeProps = {
  premiumActive?: boolean;
  premiumExpiresAt?: string | null;
  className?: string;
};

export function PremiumBadge({
  premiumActive,
  premiumExpiresAt,
  className = "",
}: PremiumBadgeProps) {
  if (!premiumActive) return null;

  if (premiumExpiresAt && new Date(premiumExpiresAt).getTime() < Date.now()) {
    return null;
  }

  return (
    <span title="Premium Member">
      <Crown
        className={`inline-block h-3.5 w-3.5 text-gold fill-gold/20 -translate-y-0.5 ml-1 ${className}`}
      />
    </span>
  );
}
