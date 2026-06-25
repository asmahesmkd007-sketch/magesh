export type Course = {
  slug: string;
  title: string;
  instructor: string;
  level: string;
  lessonCount: number;
  duration: string;
  blurb: string;
  gradient: string;
  chapters: { title: string; length: string }[];
};

export const COURSES: Course[] = [
  {
    slug: "sicilian-mastery",
    title: "Sicilian Mastery",
    instructor: "GM Viswanathan Anand",
    level: "Intermediate",
    lessonCount: 24,
    duration: "5h 12m",
    blurb: "A complete journey through the most aggressive defense in chess, from Najdorf fire to endgame finesse.",
    gradient: "from-amber-500/30 to-rose-700/30",
    chapters: [
      { title: "Introduction to the Sicilian", length: "12m" },
      { title: "The Najdorf Variation", length: "24m" },
      { title: "Sicilian Dragon Fire", length: "32m" },
      { title: "Scheveningen Subtleties", length: "28m" },
      { title: "Sveshnikov Symphony", length: "22m" },
      { title: "The Rossolimo Weapon", length: "19m" },
      { title: "Anti-Sicilian Antidotes", length: "26m" },
      { title: "Sicilian Endgames", length: "30m" },
    ],
  },
  {
    slug: "indian-endgame",
    title: "The Indian Endgame",
    instructor: "GM Pentala Harikrishna",
    level: "Advanced",
    lessonCount: 18,
    duration: "4h 05m",
    blurb: "Convert small edges like a champion — rook endings, fortress detection, and the art of zugzwang.",
    gradient: "from-emerald-500/30 to-teal-700/30",
    chapters: [
      { title: "Endgame Principles Reborn", length: "15m" },
      { title: "King Activity & Opposition", length: "21m" },
      { title: "Rook Endings: Lucena & Philidor", length: "28m" },
      { title: "Minor Piece Battles", length: "24m" },
      { title: "Pawn Race Calculus", length: "18m" },
      { title: "Fortresses & Drawing Zones", length: "20m" },
      { title: "Zugzwang Masterpieces", length: "22m" },
      { title: "Practical Endgame Decisions", length: "25m" },
    ],
  },
  {
    slug: "opening-principles",
    title: "Opening Principles",
    instructor: "IM Tania Sachdev",
    level: "Beginner",
    lessonCount: 12,
    duration: "2h 40m",
    blurb: "Develop fast, castle early, and fight for the centre — the timeless foundations of every strong opening.",
    gradient: "from-sky-500/30 to-indigo-700/30",
    chapters: [
      { title: "Why Openings Matter", length: "10m" },
      { title: "Control the Centre", length: "14m" },
      { title: "Develop with Purpose", length: "16m" },
      { title: "King Safety & Castling", length: "13m" },
      { title: "Common Opening Traps", length: "18m" },
      { title: "Building Your First Repertoire", length: "20m" },
      { title: "Punishing Early Mistakes", length: "15m" },
      { title: "From Opening to Middlegame", length: "17m" },
    ],
  },
  {
    slug: "kings-indian-royal",
    title: "King's Indian Royal",
    instructor: "GM Gukesh Dommaraju",
    level: "Advanced",
    lessonCount: 22,
    duration: "4h 50m",
    blurb: "The most ambitious kingside attack in chess — pawn storms, piece sacrifices, and dark-square domination.",
    gradient: "from-fuchsia-500/30 to-violet-700/30",
    chapters: [
      { title: "The KID Philosophy", length: "14m" },
      { title: "Classical Main Lines", length: "26m" },
      { title: "The Mar del Plata Attack", length: "30m" },
      { title: "Fianchetto Systems", length: "22m" },
      { title: "Sämisch Counterplay", length: "24m" },
      { title: "Four Pawns Defused", length: "20m" },
      { title: "Exchange Variation Truths", length: "18m" },
      { title: "Model Attacking Games", length: "28m" },
    ],
  },
  {
    slug: "caro-kann-clarity",
    title: "Caro-Kann Clarity",
    instructor: "GM Praggnanandhaa R",
    level: "Intermediate",
    lessonCount: 16,
    duration: "3h 30m",
    blurb: "A rock-solid reply to 1.e4 with healthy structures, clear plans, and venom hidden in quiet positions.",
    gradient: "from-orange-500/30 to-red-700/30",
    chapters: [
      { title: "Caro-Kann Foundations", length: "12m" },
      { title: "Classical: The Bf5 System", length: "22m" },
      { title: "Advance Variation Plans", length: "24m" },
      { title: "Exchange & Panov Structures", length: "20m" },
      { title: "Two Knights Sidelines", length: "16m" },
      { title: "Typical Middlegame Plans", length: "21m" },
      { title: "Caro-Kann Endgames", length: "18m" },
      { title: "Repertoire Wrap-Up", length: "15m" },
    ],
  },
  {
    slug: "tactical-bootcamp",
    title: "Tactical Bootcamp",
    instructor: "GM Vidit Gujrathi",
    level: "All Levels",
    lessonCount: 30,
    duration: "6h 15m",
    blurb: "Forks, pins, skewers, and sacrifices — a daily training regimen to sharpen your calculation.",
    gradient: "from-yellow-500/30 to-amber-700/30",
    chapters: [
      { title: "The Tactical Eye", length: "12m" },
      { title: "Forks & Double Attacks", length: "18m" },
      { title: "Pins & Skewers", length: "17m" },
      { title: "Discovered Attacks", length: "19m" },
      { title: "Removing the Defender", length: "16m" },
      { title: "Back Rank Patterns", length: "14m" },
      { title: "Sacrifice Calculation", length: "25m" },
      { title: "Mating Net Construction", length: "22m" },
    ],
  },
];

export function getCourse(slug: string): Course | undefined {
  return COURSES.find((c) => c.slug === slug);
}
