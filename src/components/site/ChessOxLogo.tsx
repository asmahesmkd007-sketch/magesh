/**
 * ChessOx brand mark — inline SVG so it renders immediately with no file-load dependency.
 * Gold chess queen piece with crescent-arc frame on a dark circle.
 */
export function ChessOxIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cxGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F6D94C" />
          <stop offset="100%" stopColor="#C49510" />
        </linearGradient>
      </defs>

      {/* Dark circular background */}
      <circle cx="50" cy="50" r="50" fill="#0B0D10" />

      {/* Left crescent arc */}
      <path d="M26,16 Q5,32 5,50 Q5,68 26,84 Q14,68 15,50 Q14,32 26,16Z" fill="url(#cxGold)" />

      {/* Right crescent arc */}
      <path d="M74,16 Q95,32 95,50 Q95,68 74,84 Q86,68 85,50 Q86,32 74,16Z" fill="url(#cxGold)" />

      {/* Crown — top center ball */}
      <circle cx="50" cy="14" r="5.5" fill="url(#cxGold)" />

      {/* Crown — side balls */}
      <circle cx="35" cy="20" r="4.5" fill="url(#cxGold)" />
      <circle cx="65" cy="20" r="4.5" fill="url(#cxGold)" />

      {/* Crown body */}
      <path d="M30,25 L27,42 L73,42 L70,25 L64,34 L50,10 L36,34Z" fill="url(#cxGold)" />

      {/* Queen piece body */}
      <path
        d="M27,42 C25,48 24,53 25,57 C22,60 21,65 22,69 C20,71 20,76 22,78 L78,78 C80,76 80,71 78,69 C79,65 78,60 75,57 C76,53 75,48 73,42Z"
        fill="url(#cxGold)"
      />

      {/* Base platform */}
      <rect x="17" y="78" width="66" height="9" rx="4.5" fill="url(#cxGold)" />
    </svg>
  );
}
