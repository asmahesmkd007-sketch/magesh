// =====================================================================
// THE COMPLETE CHESS ENCYCLOPEDIA
// ---------------------------------------------------------------------
// The full "About Chess" reference content, rendered as an interactive
// long-form page: hero, table of contents, 26 numbered sections,
// interactive board, quiz, searchable glossary, FAQ, and rules.
// All copy in this file is the canonical submitted content and must be
// preserved verbatim — do not summarize, shorten, or reorder it.
// =====================================================================
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Search } from "lucide-react";
import { Card, GoldButton } from "@/components/site/Primitives";

// ---------------------------------------------------------------- helpers
function Section({
  num,
  title,
  id,
  children,
}: {
  num: string;
  title: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-10 border-t border-white/5">
      <div className="mb-1 flex items-center gap-2 text-gold">
        <span className="text-sm">◆</span>
        <span className="text-sm tracking-[0.3em]">{num}</span>
      </div>
      <h2 className="font-display text-3xl md:text-4xl mb-5">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="mb-4 leading-relaxed text-ivory/85">{children}</p>;
}

function InfoCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <Card className="p-5">
      <div className="mb-2 text-2xl">{icon}</div>
      <h3 className="mb-1.5 font-display text-lg text-gold">{title}</h3>
      <p className="text-sm leading-relaxed text-ivory/80">{body}</p>
    </Card>
  );
}

function Accordion({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div>
          <div className="font-medium text-ivory">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gold transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4 text-sm leading-relaxed text-ivory/80">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- TOC
const TOC = [
  "What Is Chess?",
  "Why Chess Matters",
  "The Chessboard",
  "Chess Pieces",
  "How to Set Up the Board",
  "How Pieces Move",
  "Check & Checkmate",
  "Special Rules",
  "How a Game Ends",
  "Time Controls",
  "Chess Notation",
  "Chess Openings",
  "Strategy & Tactics",
  "Ratings & Elo",
  "FIDE Titles",
  "Competitions",
  "History of Chess",
  "World Champions",
  "Chess Variants",
  "Chess & AI",
  "How to Start Playing",
  "Test Your Knowledge",
  "Glossary",
  "FAQ",
  "Game Rules",
  "About Us",
];
const sid = (n: number) => `section-${String(n).padStart(2, "0")}`;

// ---------------------------------------------------------------- board
function InteractiveCoordinateBoard() {
  const [hover, setHover] = useState<string | null>(null);
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  return (
    <div className="mx-auto my-6 max-w-md">
      <div className="grid grid-cols-8 overflow-hidden rounded-xl border border-gold/20">
        {Array.from({ length: 64 }, (_, i) => {
          const rank = 8 - Math.floor(i / 8);
          const file = files[i % 8];
          const sq = `${file}${rank}`;
          const light = (Math.floor(i / 8) + i) % 2 === 0;
          return (
            <div
              key={sq}
              onMouseEnter={() => setHover(sq)}
              onMouseLeave={() => setHover(null)}
              className={`grid aspect-square place-items-center text-[10px] transition ${
                light ? "bg-[#e9d8b4]" : "bg-[#8a6d3b]"
              } ${hover === sq ? "!bg-gold text-black font-bold text-xs" : "text-black/40"}`}
            >
              {hover === sq ? sq : ""}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-8 text-center text-xs text-muted-foreground">
        {files.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Hover any square to see its coordinate
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- pieces
const PIECES = [
  {
    glyph: "♙",
    name: "The Pawn",
    tag: "Most Numerous • Value: 1 Point",
    chip: ["Pawn", "1"],
    body: [
      "The pawn is the most common piece on the board, with each player starting with eight of them arranged on the second rank. Though individually the least powerful piece, pawns form the foundation of every chess position. The arrangement of pawns — called the pawn structure — determines the fundamental character of the position.",
      "Pawns move forward only — they can never move backward. On its first move, a pawn may advance either one or two squares forward. Unlike every other piece, the pawn does not capture in the same direction it moves: it captures diagonally, one square forward to either side.",
      "When a pawn reaches the opposite end of the board, it must immediately be promoted to any other piece except a king. Almost universally, players promote to a queen. The famous Tarrasch proverb states: 'Pawns are the soul of chess.'",
    ],
  },
  {
    glyph: "♘",
    name: "The Knight",
    tag: "The Jumping Piece • Value: 3 Points",
    chip: ["Knight", "3"],
    body: [],
  },
  {
    glyph: "♗",
    name: "The Bishop",
    tag: "The Diagonal Mover • Value: 3 Points",
    chip: ["Bishop", "3"],
    body: [],
  },
  {
    glyph: "♖",
    name: "The Rook",
    tag: "The Tower of Power • Value: 5 Points",
    chip: ["Rook", "5"],
    body: [],
  },
  {
    glyph: "♕",
    name: "The Queen",
    tag: "The Most Powerful Piece • Value: 9 Points",
    chip: ["Queen", "9"],
    body: [],
  },
  {
    glyph: "♔",
    name: "The King",
    tag: "The Most Important Piece • Value: Infinite",
    chip: ["King", "∞"],
    body: [],
  },
];

// ---------------------------------------------------------------- quiz
const QUIZ: { q: string; options: string[]; answer: number }[] = [
  { q: "How many squares are on a chessboard?", options: ["32", "48", "64", "81"], answer: 2 },
  {
    q: "Which piece is the only one that can jump over other pieces?",
    options: ["Bishop", "Knight", "Rook", "Queen"],
    answer: 1,
  },
  { q: "What is the point value of a queen?", options: ["5", "7", "9", "12"], answer: 2 },
  {
    q: "Which special move involves the king and a rook moving in the same turn?",
    options: ["En passant", "Promotion", "Castling", "Zwischenzug"],
    answer: 2,
  },
  {
    q: "What does the Persian phrase 'shah mat' mean?",
    options: ["The king is dead", "The king is helpless", "Attack the king", "The king escapes"],
    answer: 1,
  },
  {
    q: "What happens when a stalemate occurs?",
    options: ["White wins", "Black wins", "The game is a draw", "The game restarts"],
    answer: 2,
  },
  {
    q: "Which opening begins 1.e4 c5?",
    options: ["Ruy Lopez", "French Defense", "Sicilian Defense", "Queen's Gambit"],
    answer: 2,
  },
  {
    q: "Who was the first official World Chess Champion in 1886?",
    options: ["Emanuel Lasker", "Wilhelm Steinitz", "Paul Morphy", "José Raúl Capablanca"],
    answer: 1,
  },
  {
    q: "What is the highest Elo rating ever recorded (Magnus Carlsen's peak)?",
    options: ["2780", "2812", "2882", "2914"],
    answer: 2,
  },
  {
    q: "In which country did chess originate as chaturanga?",
    options: ["Persia", "China", "Egypt", "India"],
    answer: 3,
  },
];

function Quiz() {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const q = QUIZ[idx];

  function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.answer) setScore((s) => s + 1);
  }
  function next() {
    if (idx + 1 >= QUIZ.length) setDone(true);
    else {
      setIdx((n) => n + 1);
      setPicked(null);
    }
  }
  if (done)
    return (
      <Card className="p-6 text-center">
        <div className="font-display text-3xl text-gradient-gold">
          {score} / {QUIZ.length}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Quiz complete!</p>
        <button
          onClick={() => {
            setIdx(0);
            setScore(0);
            setPicked(null);
            setDone(false);
          }}
          className="mt-4 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold hover:bg-gold/20"
        >
          Try Again
        </button>
      </Card>
    );
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Question {idx + 1} / {QUIZ.length}
        </span>
        <span>Score: {score}</span>
      </div>
      <h3 className="mb-4 font-display text-xl">{q.q}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {q.options.map((o, i) => {
          const letter = "ABCD"[i];
          let cls = "border-white/10 hover:border-gold/40";
          if (picked !== null) {
            if (i === q.answer) cls = "border-emerald-400/60 bg-emerald-400/10 text-emerald-300";
            else if (i === picked) cls = "border-rose-400/60 bg-rose-400/10 text-rose-300";
            else cls = "border-white/5 opacity-60";
          }
          return (
            <button
              key={i}
              onClick={() => pick(i)}
              className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition ${cls}`}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/5 text-xs text-gold">
                {letter}
              </span>
              {o}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <button
          onClick={next}
          className="mt-4 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold hover:bg-gold/20"
        >
          {idx + 1 >= QUIZ.length ? "See Result" : "Next Question →"}
        </button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- glossary
type GlossCat = "History" | "Openings" | "Rules" | "Strategy" | "Tactics" | "Titles";
const GLOSSARY: { term: string; cat: GlossCat; def: string }[] = [
  {
    term: "Algebraic Notation",
    cat: "Rules",
    def: "The standard system for recording chess moves using file letters (a-h) and rank numbers (1-8).",
  },
  {
    term: "Back Rank Mate",
    cat: "Tactics",
    def: "Checkmate delivered along the opponent's first rank when their king is trapped behind its own pawns.",
  },
  {
    term: "Bad Bishop",
    cat: "Strategy",
    def: "A bishop blocked by its own pawns on its color, severely limiting its mobility.",
  },
  {
    term: "Blitz Chess",
    cat: "Rules",
    def: "Fast time control, typically 3-10 minutes per player for the entire game.",
  },
  {
    term: "Blunder",
    cat: "Strategy",
    def: "A serious mistake that significantly worsens a player's position, often losing material or the game.",
  },
  {
    term: "Bullet Chess",
    cat: "Rules",
    def: "Ultra-fast time control of 1-2 minutes per player, decided largely by reflex and pattern recognition.",
  },
  {
    term: "Candidates Tournament",
    cat: "History",
    def: "FIDE tournament that determines the challenger for the World Chess Championship.",
  },
  {
    term: "Castling",
    cat: "Rules",
    def: "A special move where the king moves two squares toward a rook, and the rook jumps over to the other side.",
  },
  {
    term: "Check",
    cat: "Rules",
    def: "A position where a king is under direct attack and must immediately respond.",
  },
  {
    term: "Checkmate",
    cat: "Rules",
    def: "A position where a king is in check with no legal escape — the game ends immediately.",
  },
  {
    term: "Classical Chess",
    cat: "Rules",
    def: "Long time control, typically 60-120+ minutes per player. Used in the World Championship.",
  },
  {
    term: "Discovered Attack",
    cat: "Tactics",
    def: "An attack revealed when a piece moves out of the way of another attacking piece.",
  },
  {
    term: "Double Check",
    cat: "Tactics",
    def: "Check from two pieces simultaneously — the only response is to move the king.",
  },
  {
    term: "Draw",
    cat: "Rules",
    def: "A tied game with no winner. Can occur via stalemate, agreement, repetition, or insufficient material.",
  },
  {
    term: "En Passant",
    cat: "Rules",
    def: "Special pawn capture allowed against a pawn that just advanced two squares past it.",
  },
  {
    term: "Endgame",
    cat: "Strategy",
    def: "The final phase of a chess game, characterized by few pieces and an active king.",
  },
  {
    term: "FIDE",
    cat: "History",
    def: "The Federation Internationale des Echecs — the international governing body of chess.",
  },
  {
    term: "Fianchetto",
    cat: "Openings",
    def: "Developing a bishop to the long diagonal (b2/g2 for White, b7/g7 for Black).",
  },
  {
    term: "Fork",
    cat: "Tactics",
    def: "A single piece attacking two or more enemy pieces simultaneously.",
  },
  {
    term: "Gambit",
    cat: "Openings",
    def: "An opening where a player sacrifices material — usually a pawn — for development or attack.",
  },
  {
    term: "Grandmaster",
    cat: "Titles",
    def: "The highest regular FIDE title, requiring a 2500 rating and three GM norms.",
  },
  {
    term: "Hypermodern",
    cat: "Strategy",
    def: "An opening philosophy that controls the center with pieces from a distance rather than occupying it with pawns.",
  },
  {
    term: "Increment",
    cat: "Rules",
    def: "Extra seconds added to a player's clock after every move.",
  },
  {
    term: "International Master",
    cat: "Titles",
    def: "FIDE title (IM) requiring a 2400 rating and three IM norms.",
  },
  {
    term: "King Safety",
    cat: "Strategy",
    def: "The protection of the king from attack, usually achieved by castling and maintaining the pawn shield.",
  },
  {
    term: "Luft",
    cat: "Strategy",
    def: "German for 'air' — a square created for the king to escape back rank threats.",
  },
  {
    term: "Middlegame",
    cat: "Strategy",
    def: "The complex middle phase of a chess game between the opening and endgame.",
  },
  {
    term: "Opposition",
    cat: "Strategy",
    def: "An endgame technique where kings face each other with one square between them — the player NOT to move has the advantage.",
  },
  {
    term: "Outpost",
    cat: "Strategy",
    def: "A square (usually in enemy territory) where a piece cannot be attacked by an enemy pawn.",
  },
  {
    term: "Passed Pawn",
    cat: "Strategy",
    def: "A pawn with no enemy pawns on its file or adjacent files that can stop it from promoting.",
  },
  {
    term: "Pawn Structure",
    cat: "Strategy",
    def: "The arrangement of pawns on the board, which determines the strategic character of a position.",
  },
  {
    term: "Pin",
    cat: "Tactics",
    def: "A piece is pinned when moving it would expose a more valuable piece behind it to attack.",
  },
  {
    term: "Promotion",
    cat: "Rules",
    def: "When a pawn reaches the opposite end of the board, it must be promoted to another piece (except king).",
  },
  {
    term: "Rapid Chess",
    cat: "Rules",
    def: "Time control of 10-60 minutes per player. The most common tournament format.",
  },
  {
    term: "Resign",
    cat: "Rules",
    def: "Voluntarily giving up the game when the position is hopeless.",
  },
  {
    term: "Skewer",
    cat: "Tactics",
    def: "An attack on a valuable piece that forces it to move, exposing a less valuable piece behind it.",
  },
  {
    term: "Smothered Mate",
    cat: "Tactics",
    def: "Checkmate where a knight delivers mate against a king completely surrounded by its own pieces.",
  },
  {
    term: "Stalemate",
    cat: "Rules",
    def: "A draw where the player to move has no legal moves and is not in check.",
  },
  {
    term: "Tactics",
    cat: "Tactics",
    def: "Short forcing sequences that win material or deliver checkmate.",
  },
  {
    term: "Tempo",
    cat: "Strategy",
    def: "A unit of time in chess equivalent to one move. Losing a tempo means wasting a move.",
  },
  {
    term: "Threefold Repetition",
    cat: "Rules",
    def: "If the same position occurs three times, either player may claim a draw.",
  },
  {
    term: "Underpromotion",
    cat: "Rules",
    def: "Promoting a pawn to a piece other than a queen — usually a knight for tactical reasons.",
  },
  {
    term: "Zugzwang",
    cat: "Strategy",
    def: "A position where any move worsens the player’s situation. Common in endgames.",
  },
  {
    term: "Zwischenzug",
    cat: "Tactics",
    def: "An ‘in-between move’ inserted before an expected response, improving the position first.",
  },
];

function Glossary() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"All" | GlossCat>("All");
  const cats: ("All" | GlossCat)[] = [
    "All",
    "History",
    "Openings",
    "Rules",
    "Strategy",
    "Tactics",
    "Titles",
  ];
  const shown = useMemo(
    () =>
      GLOSSARY.filter(
        (g) =>
          (cat === "All" || g.cat === cat) &&
          (g.term + " " + g.def).toLowerCase().includes(query.toLowerCase()),
      ),
    [query, cat],
  );
  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chess terms..."
          className="w-full rounded-xl border border-white/10 bg-transparent py-2.5 pl-10 pr-3 text-sm outline-none focus:border-gold/40"
        />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full border px-3 py-1 text-xs ${
              cat === c
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-white/10 text-muted-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((g) => (
          <Card key={g.term} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-medium text-ivory">{g.term}</h4>
              <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] text-gold">
                {g.cat}
              </span>
            </div>
            <p className="mt-1 text-sm text-ivory/75">{g.def}</p>
          </Card>
        ))}
        {shown.length === 0 && (
          <p className="text-sm text-muted-foreground">No terms match your search.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- champions
const CHAMPIONS = [
  {
    n: 1,
    flag: "🇦🇹🇺🇸",
    name: "Wilhelm Steinitz",
    reign: "1886–1894 · 8 years",
    bio: "The Father of Modern Chess. Steinitz invented positional theory and was the first to scientifically explain why moves are good. He won the first official championship match by defeating Johannes Zukertort 10–5.",
  },
  {
    n: 2,
    flag: "🇩🇪",
    name: "Emanuel Lasker",
    reign: "1894–1921 · 27 years",
    bio: "Holds the record for longest reign as World Champion — 27 years. A mathematician and philosopher close friends with Albert Einstein, Lasker was a master of practical, psychological chess.",
  },
  {
    n: 3,
    flag: "🇨🇺",
    name: "José Raúl Capablanca",
    reign: "1921–1927 · 6 years",
    bio: "The 'Chess Machine' from Cuba was perhaps the most naturally gifted player in history. He went three years without losing a single game and his endgame technique is still used as a teaching model.",
  },
  {
    n: 4,
    flag: "🇷🇺🇫🇷",
    name: "Alexander Alekhine",
    reign: "1927–1935, 1937–1946 · 17 years",
    bio: "Defeated Capablanca in a major upset in 1927 with ferocious attacking play and devastating preparation. The only World Champion to die while holding the title.",
  },
  {
    n: 5,
    flag: "🇳🇱",
    name: "Max Euwe",
    reign: "1935–1937 · 2 years",
    bio: "A Dutch mathematics professor who upset Alekhine in 1935 in one of the greatest shocks in championship history. Remains the only Dutch World Champion.",
  },
  {
    n: 6,
    flag: "🇷🇺",
    name: "Mikhail Botvinnik",
    reign: "1948–1963 · 13 years",
    bio: "The patriarch of Soviet chess. Won the first FIDE World Championship in 1948 and shaped Soviet chess methodology for generations through iron discipline and systematic preparation.",
  },
  {
    n: 7,
    flag: "🇷🇺",
    name: "Vasily Smyslov",
    reign: "1957–1958 · 1 year",
    bio: "A supremely harmonious player who developed each piece to its ideal square with effortless elegance. Competed at the highest level for six decades.",
  },
  {
    n: 8,
    flag: "🇱🇻",
    name: "Mikhail Tal",
    reign: "1960–1961 · 1 year",
    bio: "The 'Magician from Riga' — the most exciting World Champion in history. Sacrificed material recklessly, creating positions of such complexity that opponents and even computers struggled to defend.",
  },
  {
    n: 9,
    flag: "🇦🇲",
    name: "Tigran Petrosian",
    reign: "1963–1969 · 6 years",
    bio: "Known as 'Iron Tigran,' Petrosian was the greatest defensive player in chess history. His style was built on prophylaxis — preventing the opponent's plans before they began.",
  },
  {
    n: 10,
    flag: "🇷🇺",
    name: "Boris Spassky",
    reign: "1969–1972 · 3 years",
    bio: "A universal champion comfortable in any type of position. Remembered for his sportsmanship in the 'Match of the Century' against Bobby Fischer.",
  },
  {
    n: 11,
    flag: "🇺🇸",
    name: "Bobby Fischer",
    reign: "1972–1975 · 3 years",
    bio: "The most controversial and arguably most talented chess player ever. Crushed Spassky 12.5–8.5 to become the first American World Champion, then disappeared from competitive chess for nearly 20 years.",
  },
  {
    n: 12,
    flag: "🇷🇺",
    name: "Anatoly Karpov",
    reign: "1975–1985 · 10 years",
    bio: "Won the title by default when Fischer refused to play, then proved himself worthy by dominating chess for a decade. His matches against Kasparov are the greatest rivalry in chess history.",
  },
  {
    n: 13,
    flag: "🇦🇿",
    name: "Garry Kasparov",
    reign: "1985–2000 · 15 years",
    bio: "Many consider Kasparov the greatest chess player in history. Held the world number one ranking for 225 consecutive months and his 1997 match against Deep Blue marked a turning point in human-AI competition.",
  },
  {
    n: 14,
    flag: "🇷🇺",
    name: "Vladimir Kramnik",
    reign: "2000–2007 · 7 years",
    bio: "Ended Kasparov's 15-year reign with the famous Berlin Defense. Known for his deep positional understanding and flawless endgame technique.",
  },
  {
    n: 15,
    flag: "🇮🇳",
    name: "Viswanathan Anand",
    reign: "2000, 2007–2013 · 5 titles",
    bio: "The first Indian World Chess Champion, nicknamed 'The Tiger of Madras.' Has won the World Championship in all three formats — match, tournament, and knockout.",
  },
  {
    n: 16,
    flag: "🇳🇴",
    name: "Magnus Carlsen",
    reign: "2013–2023 · 10 years",
    bio: "Widely considered the greatest endgame player in history. His peak rating of 2882 is the highest ever recorded. Won five consecutive World Championship titles before voluntarily declining to defend in 2023.",
  },
  {
    n: 17,
    flag: "🇨🇳",
    name: "Ding Liren",
    reign: "2023–2024 · 1 year",
    bio: "Made history as the first Chinese World Chess Champion when he defeated Ian Nepomniachtchi in 2023 in a dramatic match that went to tiebreaks.",
  },
  {
    n: 18,
    flag: "🇮🇳",
    name: "Gukesh Dommaraju",
    reign: "2024–Present · Current",
    bio: "At just 18 years old, Gukesh became the youngest undisputed World Chess Champion ever, defeating Ding Liren in Singapore in December 2024.",
  },
];

// ---------------------------------------------------------------- FAQ
const FAQ: { q: string; a: string }[] = [
  {
    q: "What is chess?",
    a: "Chess is a two-player, turn-based strategy board game played on an 8x8 grid of 64 squares. Each player begins with 16 pieces and the objective is to checkmate the opponent’s king. Chess contains no luck or hidden information; the outcome depends entirely on the players’ decisions.",
  },
  {
    q: "How do you play chess for beginners?",
    a: "Start by learning how each of the six pieces moves, set up the board with a light square on each player's right, and play with the goal of checkmating the opponent's king. Follow the three opening principles — control the center, develop your pieces, castle your king — and improve by playing games and solving puzzles daily.",
  },
  {
    q: "Who invented chess?",
    a: "Chess evolved from the ancient Indian game chaturanga, played during the Gupta Empire around the 4th–6th centuries AD. It spread to Persia as shatranj, then through the Islamic world into Europe, where the modern rules were established around 1475. No single person invented chess — it developed over more than 1,500 years.",
  },
  {
    q: "How long does a chess game last?",
    a: "It depends on the time control. Bullet games last under 2 minutes per player, blitz games 3–10 minutes, rapid games 10–60 minutes, and classical games can last several hours. A typical casual game runs 30–60 moves; correspondence games can take days per move.",
  },
  {
    q: "What is checkmate in chess?",
    a: "Checkmate is the position where a king is in check and has no legal move to escape. The game ends immediately and the player delivering checkmate wins. The word comes from the Persian 'shah mat' — 'the king is helpless.'",
  },
  {
    q: "What is the best first move in chess?",
    a: "The most popular and principled first moves are 1.e4 and 1.d4, both of which stake a claim in the center and open lines for the pieces. 1.c4 (the English) and 1.Nf3 are also excellent. For beginners, 1.e4 is usually recommended for its open, instructive positions.",
  },
  {
    q: "Who is the greatest chess player of all time?",
    a: "It is debated. Garry Kasparov held the world number one ranking for 225 consecutive months, while Magnus Carlsen achieved the highest rating ever recorded (2882) and held the title for a decade. Bobby Fischer and José Raúl Capablanca are also frequently named among the greatest.",
  },
  {
    q: "Who is the current World Chess Champion?",
    a: "Gukesh Dommaraju of India, who became the youngest undisputed World Chess Champion in history in December 2024 at age 18 by defeating Ding Liren in Singapore.",
  },
  {
    q: "What is the fastest checkmate in chess?",
    a: "Fool's Mate — checkmate in just two moves (1.f3 e5 2.g4 Qh4#). It requires White to make two serious mistakes. The better-known Scholar's Mate delivers mate on move 4 by targeting the f7 square.",
  },
  {
    q: "Is chess a sport?",
    a: "Yes. Chess is recognized as a sport by the International Olympic Committee and by more than 100 countries. It is played competitively worldwide, including at the Chess Olympiad featuring teams from 195+ countries.",
  },
];

// ---------------------------------------------------------------- rules
const RULES: { icon: string; title: string; subtitle: string; body: string }[] = [
  {
    icon: "♔",
    title: "Rule 1 — Introduction",
    subtitle: "Nature of the game • Conduct • Contest types",
    body: "Chess is played between two opponents who move their pieces alternately on a square board called a chessboard. The player with the white pieces commences the game. A player is said to 'have the move' when the opponent's move has been made. Players must conduct themselves with sportsmanship; it is forbidden to distract or annoy the opponent in any manner.",
  },
  {
    icon: "♖",
    title: "Rule 2 — The Chessboard and Its Arrangement",
    subtitle: "64 squares • Color requirements • Orientation",
    body: "The chessboard is composed of an 8×8 grid of 64 equal squares alternately light ('white') and dark ('black'). The board is placed between the players so that the near corner square to the right of each player is light.",
  },
  {
    icon: "♙",
    title: "Rule 3 — The Chessmen and Their Arrangement",
    subtitle: "16 pieces per side • Starting positions",
    body: "At the beginning of the game each player has 16 pieces: one king, one queen, two rooks, two bishops, two knights, and eight pawns. White's pieces occupy the first rank (rooks on a1/h1, knights on b1/g1, bishops on c1/f1, queen on d1, king on e1) with pawns on the second rank; Black's mirror them on the eighth and seventh ranks.",
  },
  {
    icon: "♘",
    title: "Rule 4 — Conduct of the Game",
    subtitle: "Alternating turns • White moves first • Completing a move",
    body: "The player with the white pieces makes the first move, after which the players move alternately, one move at a time. A player may not skip a turn. A move is completed when the piece has been released on its new square and any captured piece removed from the board.",
  },
  {
    icon: "♗",
    title: "Rule 5 — Definition of the Move",
    subtitle: "Transfer • Capture • Castling • En passant • Promotion",
    body: "A move is the transfer of a piece from one square to another square which is either vacant or occupied by an enemy piece. Capturing means removing the enemy piece from the board and placing the capturing piece on its square. Castling, en passant, and pawn promotion are the three special moves, each governed by its own conditions described in this guide.",
  },
  {
    icon: "♕",
    title: "Rule 6 — Moves of the Individual Chessmen",
    subtitle: "King • Queen • Rook • Bishop • Knight • Pawn",
    body: "The king moves one square in any direction. The queen moves any number of squares along a rank, file, or diagonal. The rook moves along ranks and files; the bishop along diagonals. The knight moves in an 'L' shape — two squares in one direction plus one perpendicular — and is the only piece that jumps. Pawns move forward one square (two from the start) and capture diagonally.",
  },
  {
    icon: "⚒",
    title: "Rules 7–9 — Completing a Move, Touch-Move & Illegal Positions",
    subtitle: "Determination • Touch-move • Illegal position correction",
    body: "In formal play, a player who deliberately touches one of their own pieces must move it if a legal move exists; touching an opponent's piece obliges its capture if legal ('touch-move'). If an illegal move or position is discovered, the position immediately before the irregularity is reinstated and the game continues from there.",
  },
  {
    icon: "⚔",
    title: "Rules 10–12 — Check, Won Game & Draw",
    subtitle: "Check • Checkmate • Resignation • Stalemate • All draw conditions",
    body: "A king is in check when attacked by an enemy piece; check must be addressed immediately. The game is won by checkmating the opponent's king, by the opponent's resignation, or by time forfeit. The game is drawn by stalemate, mutual agreement, threefold repetition, the fifty-move rule, or insufficient mating material.",
  },
];

// ---------------------------------------------------------------- page
export function ChessEncyclopedia() {
  return (
    <div className="mx-auto max-w-4xl">
      {/* ---- hero ---- */}
      <div className="rounded-2xl border border-gold/20 bg-gradient-to-b from-gold/10 to-transparent p-6 md:p-10 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 text-xs text-gold">
          ♟ The Complete Chess Encyclopedia
        </div>
        <div className="mb-4 text-xs text-muted-foreground">
          ~25 min read • Last updated 2025 • Free Complete Guide — No Sign Up Needed
        </div>
        {/* h2 — the hosting page (PageShell) already provides the single h1. */}
        <h2 className="font-display text-4xl md:text-6xl leading-tight">
          Chess: The <span className="text-gradient-gold">Complete Encyclopedia</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-ivory/85">
          Chess is a two-player strategy board game played on a 64-square board, where each player
          commands 16 pieces with the goal of trapping the opponent’s king. It is one of the oldest,
          most studied, and most popular games in human history — with over 800 million active
          players worldwide.
        </p>
        <div className="mx-auto mt-6 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["800M+", "Players"],
            ["1,500+", "Years of History"],
            ["10¹²⁰", "Possible Games"],
            ["195", "Countries Play"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3">
              <div className="font-display text-xl text-gold">{v}</div>
              <div className="text-[11px] text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href={`#${sid(1)}`}
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm text-ivory hover:bg-white/5"
          >
            📖 Start Reading ↓
          </a>
          <Link to="/play">
            <GoldButton>▶ Play Chess Now</GoldButton>
          </Link>
        </div>
      </div>

      {/* ---- table of contents ---- */}
      <Card className="mt-6 p-6">
        <h2 className="mb-4 font-display text-xl text-gold">On This Page</h2>
        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {TOC.map((t, i) => (
            <a
              key={t}
              href={`#${sid(i + 1)}`}
              className="flex items-baseline gap-2 rounded-lg px-2 py-1 text-sm text-ivory/80 hover:bg-white/5 hover:text-gold"
            >
              <span className="text-xs text-gold/70">{String(i + 1).padStart(2, "0")}</span>
              {t}
            </a>
          ))}
        </div>
      </Card>

      {/* ---- 01 ---- */}
      <Section num="01" title="What Is Chess?" id={sid(1)}>
        <P>
          Chess is a two-player, turn-based strategy board game played on a square board divided
          into 64 squares arranged in an 8×8 grid. Each player begins with 16 pieces: one king, one
          queen, two rooks, two bishops, two knights, and eight pawns. The objective is to place the
          opponent’s king in checkmate — a position where the king is under attack and has no legal
          move to escape. Chess contains no element of luck or hidden information; the outcome
          depends entirely on the decisions of both players.
        </P>
        <P>
          Chess is one of the most played games in human history. According to FIDE — the
          International Chess Federation — over 800 million people play chess worldwide. It is
          recognized as a sport in more than 100 countries and is practiced competitively at all
          levels, from school clubs to the Olympic Chess Olympiad. Online platforms have brought the
          game to hundreds of millions of digital players, making it one of the fastest-growing
          online sports of the 21st century.
        </P>
        <P>
          What makes chess special among all board games is the sheer depth of its strategy. The
          number of possible chess games is estimated at 10 to the power of 120 — a number larger
          than the atoms in the observable universe. This means no two chess games need ever be
          exactly alike. Masters spend decades studying the game and still encounter entirely new
          positions. Chess combines logic, pattern recognition, memory, creativity, and
          psychological pressure.
        </P>
        <P>
          Research has consistently shown that learning chess improves concentration,
          problem-solving ability, and mathematical thinking in children. Many countries have
          introduced chess as part of their school curriculum. Beyond education, chess creates a
          universal language — a game that needs no translation, played across cultures and
          connecting people of all ages on the same 64-square playing field.
        </P>
        <blockquote className="rounded-xl border border-gold/20 bg-gold/5 p-4 text-ivory/85">
          ♟ The number of possible chess games is greater than the number of atoms in the observable
          universe.
        </blockquote>
      </Section>

      {/* ---- 02 ---- */}
      <Section num="02" title="Why Chess Matters — Benefits and Importance" id={sid(2)}>
        <P>
          Chess is far more than entertainment. It is a tool for cognitive development, a
          competitive sport, a form of art, and a historical artifact.
        </P>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard
            icon="🧠"
            title="Boosts Intelligence"
            body="Multiple studies show chess players score higher on spatial reasoning and problem-solving tests. Learning chess trains the brain to think several steps ahead."
          />
          <InfoCard
            icon="📚"
            title="Improves Academic Performance"
            body="Students who study chess show measurable gains in reading comprehension and mathematics. Armenia has made chess a compulsory school subject."
          />
          <InfoCard
            icon="🎯"
            title="Develops Focus & Patience"
            body="A single chess game can last hours, requiring sustained concentration and calm under pressure. These skills transfer directly to academic and professional life."
          />
          <InfoCard
            icon="🌐"
            title="Universal Language"
            body="Chess needs no translation. A player from India can sit across from a player from Norway and communicate entirely through moves."
          />
          <InfoCard
            icon="🏆"
            title="Competitive Sport"
            body="Chess is recognized by the IOC as a sport. The Chess Olympiad features teams from 195+ countries — more than almost any global sporting event."
          />
          <InfoCard
            icon="🤖"
            title="Foundation of AI Research"
            body="Chess was one of the first domains used to test AI. Deep Blue defeating Garry Kasparov in 1997 was a landmark moment in machine learning history."
          />
        </div>
      </Section>

      {/* ---- 03 ---- */}
      <Section num="03" title="The Chessboard — Understanding the Playing Field" id={sid(3)}>
        <P>
          The chessboard is an 8×8 grid containing exactly 64 squares, alternating between light and
          dark colors. The columns are called files (labeled a–h) and the rows are called ranks
          (numbered 1–8). Every square has a unique coordinate — for example, ‘e4’ refers to the
          square on the e-file and the 4th rank.
        </P>
        <P>
          The board must always be placed so that each player has a light square in the bottom-right
          corner. The center four squares — d4, d5, e4, and e5 — are the most strategically
          important area. Controlling these squares in the opening is a fundamental principle of
          chess strategy.
        </P>
        <P>
          The board is also divided into the kingside (files e–h) and the queenside (files a–d).
          Understanding the geography of the chessboard is the first essential step to understanding
          everything that happens on it.
        </P>
        <InteractiveCoordinateBoard />
      </Section>

      {/* ---- 04 ---- */}
      <Section num="04" title="Chess Pieces — All 6 Types Explained" id={sid(4)}>
        <P>
          Each player begins with exactly 16 chess pieces. Each type moves in a completely different
          way, has a different value, and plays a different strategic role throughout the game.
        </P>
        <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {PIECES.map((p) => (
            <div
              key={p.name}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center"
            >
              <div className="text-3xl">{p.glyph}</div>
              <div className="mt-1 text-xs text-ivory/80">{p.chip[0]}</div>
              <div className="text-sm font-medium text-gold">{p.chip[1]}</div>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {PIECES.map((p) => (
            <Card key={p.name} className="p-5">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{p.glyph}</span>
                <div>
                  <h3 className="font-display text-xl">{p.name}</h3>
                  <div className="text-xs uppercase tracking-wide text-gold/80">{p.tag}</div>
                </div>
              </div>
              {p.body.map((b, i) => (
                <p key={i} className="mt-3 text-sm leading-relaxed text-ivory/80">
                  {b}
                </p>
              ))}
            </Card>
          ))}
        </div>
      </Section>

      {/* ---- 05 ---- */}
      <Section num="05" title="How to Set Up a Chess Board — Step by Step" id={sid(5)}>
        <P>
          Setting up a chess board correctly is the very first skill every beginner must learn.
          Follow these steps exactly.
        </P>
        <ol className="space-y-3">
          {[
            [
              "Orient the board",
              "Place the board so each player has a LIGHT square in the bottom-right corner. Easy to remember: 'Light on right.'",
            ],
            [
              "Place the rooks",
              "White rooks on a1 and h1; Black rooks on a8 and h8. The rooks go in the four corners.",
            ],
            [
              "Place the knights",
              "White knights on b1 and g1; Black knights on b8 and g8. Each knight goes immediately next to a rook.",
            ],
            [
              "Place the bishops",
              "White bishops on c1 and f1; Black bishops on c8 and f8. The bishops go next to each knight.",
            ],
            [
              "Place the queens",
              "Queen on her own color. White queen on d1 (light square); Black queen on d8 (dark square). The most common beginner mistake.",
            ],
            [
              "Place the kings",
              "King on the remaining center square — White king on e1, Black king on e8. The kings face each other directly.",
            ],
            [
              "Place the pawns",
              "White’s eight pawns fill the second rank (a2–h2). Black’s eight pawns fill the seventh rank (a7–h7).",
            ],
          ].map(([t, d], i) => (
            <li
              key={t}
              className="flex gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold/10 font-display text-gold">
                {i + 1}
              </span>
              <div>
                <div className="font-medium text-ivory">{t}</div>
                <div className="mt-0.5 text-sm text-ivory/75">{d}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-xl border border-gold/20 bg-gold/5 p-4 text-sm text-ivory/85">
          💡 Memory trick: From left to right on White's first rank: Rook · Knight · Bishop · Queen
          · King · Bishop · Knight · Rook.
        </div>
      </Section>

      {/* ---- 06 ---- */}
      <Section num="06" title="How Chess Pieces Move" id={sid(6)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoCard
            icon="♙"
            title="Pawn"
            body="Forward 1 square always. Forward 2 squares on first move only. Captures diagonally forward 1 square. Cannot move backward. Special: en passant capture."
          />
          <InfoCard
            icon="♘"
            title="Knight"
            body="Moves in an 'L': 2 squares in one direction + 1 square perpendicular. From the center, reaches up to 8 squares. The ONLY piece that jumps over others."
          />
          <InfoCard
            icon="♗"
            title="Bishop"
            body="Moves diagonally any number of squares. Always stays on the same color square it started on. From the center, reaches up to 13 squares."
          />
          <InfoCard
            icon="♖"
            title="Rook"
            body="Moves horizontally or vertically any number of squares. From any square it always reaches exactly 14 squares. Participates in castling."
          />
          <InfoCard
            icon="♕"
            title="Queen"
            body="Combines rook + bishop. Moves in any of 8 directions any number of squares. From the center, can reach up to 27 squares — more than any other piece."
          />
          <InfoCard
            icon="♔"
            title="King"
            body="Moves exactly 1 square in any direction. Can never move into check. Participates in castling. Cannot be captured — the game ends if it is checkmated."
          />
        </div>
      </Section>

      {/* ---- 07 ---- */}
      <Section num="07" title="Check, Checkmate, and Stalemate" id={sid(7)}>
        <h3 className="mb-2 font-display text-xl text-gold">Check</h3>
        <P>
          Check is the condition where a player's king is under direct attack by one or more enemy
          pieces. When your king is in check, you must immediately resolve the situation. There are
          exactly three ways to get out of check: move the king to a safe square, block the attack
          with one of your own pieces, or capture the attacking piece. If none of these is possible,
          it is checkmate.
        </P>
        <P>
          It is illegal to make a move that leaves your own king in check. A player can also be in
          check from two pieces simultaneously — a 'double check' — where the only legal response is
          to move the king.
        </P>
        <h3 className="mb-2 font-display text-xl text-gold">Checkmate</h3>
        <P>
          Checkmate — often shortened to 'mate' — is the ultimate goal of chess. It occurs when a
          player's king is in check AND there is no legal move to escape. The word comes from the
          Persian phrase 'shah mat,' meaning 'the king is helpless.' When checkmate occurs, the game
          ends immediately.
        </P>
        <P>
          Famous checkmate patterns include Scholar's Mate (mate on move 4 targeting f7), Fool's
          Mate (the fastest possible mate in 2 moves), Smothered Mate (knight delivers mate while
          the king is surrounded by its own pieces), and the Arabian Mate (rook and knight in the
          corner).
        </P>
        <h3 className="mb-2 font-display text-xl text-gold">Stalemate</h3>
        <P>
          Stalemate occurs when the player whose turn it is has NO legal move AND their king is NOT
          in check. The result is always a draw — even if one player has an enormous material
          advantage. Stalemate has saved countless players who were losing badly. For the stronger
          side, avoiding stalemate is an important technical skill.
        </P>
      </Section>

      {/* ---- 08 ---- */}
      <Section num="08" title="The Three Special Rules in Chess" id={sid(8)}>
        <P>
          Chess has three special rules that apply only in specific situations: castling, en
          passant, and pawn promotion.
        </P>
        <h3 className="mb-2 font-display text-xl text-gold">Castling</h3>
        <P>
          Castling is a special move involving the king and one rook — the only time in chess where
          two pieces move in the same turn. The king moves two squares toward a rook, and the rook
          then jumps over the king to the square on the other side. Castling kingside is called
          'castling short'; castling queenside is 'castling long.'
        </P>
        <P>
          Castling is legal only when ALL of the following are true: (1) neither the king nor the
          rook involved has previously moved; (2) there are no pieces between them; (3) the king is
          not currently in check; (4) the king does not pass through or land on an attacked square.
          The rook is allowed to be under attack or pass through an attacked square — only the
          king's path matters.
        </P>
        <h3 className="mb-2 font-display text-xl text-gold">En Passant</h3>
        <P>
          En passant is French for 'in passing.' When a pawn moves two squares from its starting
          position and lands beside an enemy pawn, the enemy pawn may capture it as if it had only
          moved one square. The capturing pawn moves diagonally to the square the moving pawn
          skipped. This is only legal on the VERY NEXT MOVE — miss it, and the right is permanently
          lost. It is the only chess move where the captured piece does not occupy the destination
          square.
        </P>
        <h3 className="mb-2 font-display text-xl text-gold">Pawn Promotion</h3>
        <P>
          When a pawn reaches the opposite end of the board — rank 8 for White, rank 1 for Black —
          it MUST immediately be replaced by another piece (king excluded). Almost universally,
          players promote to a queen ('queening'). Occasionally, underpromoting to a knight is
          correct — typically when queening would cause stalemate or when a knight delivers
          immediate checkmate.
        </P>
      </Section>

      {/* ---- 09 ---- */}
      <Section num="09" title="How Does a Chess Game End?" id={sid(9)}>
        <P>A chess game can end in three ways: a win for White, a win for Black, or a draw.</P>
        <h3 className="mb-3 font-display text-xl text-gold">Wins</h3>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <InfoCard
            icon="♚"
            title="Checkmate"
            body="The opponent's king is in check with no legal escape. The game ends immediately."
          />
          <InfoCard
            icon="🏳"
            title="Resignation"
            body="A player gives up when the position is hopeless. Most professional games end in resignation."
          />
          <InfoCard
            icon="⏱"
            title="Time Forfeit"
            body="In timed games, if your clock runs out you lose — unless the opponent lacks the material to mate."
          />
        </div>
        <h3 className="mb-3 font-display text-xl text-gold">Draws</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard
            icon="🤝"
            title="Stalemate"
            body="The player to move has no legal moves and is not in check. Immediate draw."
          />
          <InfoCard
            icon="🤝"
            title="Mutual Agreement"
            body="Both players agree to a draw at any point — common in equal positions."
          />
          <InfoCard
            icon="🔁"
            title="Threefold Repetition"
            body="If the same position occurs three times, either player may claim a draw."
          />
          <InfoCard
            icon="5️⃣0️⃣"
            title="Fifty-Move Rule"
            body="If 50 consecutive moves pass with no pawn move or capture, either player may claim a draw."
          />
          <InfoCard
            icon="♞"
            title="Insufficient Material"
            body="If neither player has enough pieces to deliver mate (e.g. K vs K), the game is drawn immediately."
          />
        </div>
      </Section>

      {/* ---- 10 ---- */}
      <Section num="10" title="Chess Time Controls — Bullet, Blitz, Rapid, Classical" id={sid(10)}>
        <P>
          In competitive chess, every player has a limited amount of time to make all their moves.
          Different time limits create entirely different styles of chess — from calm, deep
          classical games lasting hours to frantic bullet games decided in under two minutes.
        </P>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard
            icon="✉️"
            title="Correspondence"
            body="Days per move. Online/postal play. Deep calculation."
          />
          <InfoCard
            icon="🏛"
            title="Classical"
            body="60–120+ min each. Used in World Championships."
          />
          <InfoCard icon="⏲" title="Rapid" body="10–60 min each. Most common tournament format." />
          <InfoCard icon="⚡" title="Blitz" body="3–10 min each. Most popular online format." />
          <InfoCard icon="🚀" title="Bullet" body="1–2 min each. Ultra-fast, reflex-based." />
          <InfoCard icon="🔥" title="Hyperbullet" body="Under 60 seconds. Chaos chess." />
        </div>
        <P>
          <span className="mt-4 block">
            Most modern time controls include an increment — extra seconds added to your clock after
            every move. For example, '5+3' means each player starts with 5 minutes and gains 3
            seconds per move. Increments prevent games from ending purely on time when both players
            are still making good moves.
          </span>
        </P>
      </Section>

      {/* ---- 11 ---- */}
      <Section num="11" title="Chess Notation — How Moves Are Recorded" id={sid(11)}>
        <P>
          Chess notation is the system used to record chess moves, allowing games to be written
          down, shared, studied, and replayed. The standard system used worldwide today is algebraic
          notation, adopted officially by FIDE in 1976.
        </P>
        <P>
          Each piece is represented by a capital letter: K = King, Q = Queen, R = Rook, B = Bishop,
          N = Knight. Pawns have no letter — a pawn move is simply the destination square (e.g.
          'e4'). Captures use 'x' (e.g. 'Nxe5'). Check is '+' and checkmate is '#'.
        </P>
        <P>Example (Ruy Lopez opening): 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6</P>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left">
                <th className="px-4 py-2 font-medium text-gold">Symbol</th>
                <th className="px-4 py-2 font-medium text-gold">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["K", "King"],
                ["Q", "Queen"],
                ["R", "Rook"],
                ["B", "Bishop"],
                ["N", "Knight"],
                ["x", "Capture"],
                ["+", "Check"],
                ["#", "Checkmate"],
                ["O-O", "Castle Kingside"],
                ["O-O-O", "Castle Queenside"],
                ["=", "Promotion (e.g., e8=Q)"],
                ["!", "Good move"],
                ["!!", "Brilliant move"],
                ["?", "Mistake"],
                ["??", "Blunder"],
                ["!?", "Interesting / risky"],
                ["?!", "Dubious"],
              ].map(([s, m]) => (
                <tr key={s} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-1.5 font-mono text-gold/90">{s}</td>
                  <td className="px-4 py-1.5 text-ivory/85">{m}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---- 12 ---- */}
      <Section num="12" title="Chess Openings — The First Moves of a Game" id={sid(12)}>
        <P>
          The opening is the first phase of a chess game, typically lasting the first 10–20 moves.
          Despite the complexity of opening theory, all good openings follow the same basic
          principles.
        </P>
        <h3 className="mb-3 font-display text-xl text-gold">Three Core Opening Principles</h3>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            [
              "PRINCIPLE 01",
              "Control the Center",
              "Pawns and pieces in or near the central squares (d4, d5, e4, e5) control more of the board.",
            ],
            [
              "PRINCIPLE 02",
              "Develop Your Pieces",
              "Get your knights and bishops off their starting squares quickly. Undeveloped pieces are sleeping.",
            ],
            [
              "PRINCIPLE 03",
              "Castle Your King",
              "After developing, castle to safety. A king stuck in the center is a constant target.",
            ],
          ].map(([tag, t, d]) => (
            <Card key={t} className="p-5">
              <div className="text-[10px] tracking-[0.25em] text-gold/70">{tag}</div>
              <h4 className="mt-1 font-display text-lg text-gold">{t}</h4>
              <p className="mt-1.5 text-sm text-ivory/80">{d}</p>
            </Card>
          ))}
        </div>
        <h3 className="mb-3 font-display text-xl text-gold">Most Popular Openings</h3>
        <div className="space-y-3">
          {[
            [
              "Italian Game",
              "1.e4 e5 2.Nf3 Nc6 3.Bc4",
              "One of the oldest openings, dating to the 16th century. White places the bishop on c4 to target the f7 pawn — a classic attacking approach.",
            ],
            [
              "Ruy Lopez (Spanish Opening)",
              "1.e4 e5 2.Nf3 Nc6 3.Bb5",
              "One of the most studied openings at all levels. White pins the knight defending e5, creating long-term pressure. Used by almost every World Champion.",
            ],
            [
              "Sicilian Defense",
              "1.e4 c5",
              "The most popular chess opening at club and professional level. Black fights for the center asymmetrically, creating imbalanced positions full of tactical possibilities.",
            ],
            [
              "Queen's Gambit",
              "1.d4 d5 2.c4",
              "White offers a pawn to gain central control. Not truly a gambit because Black cannot safely keep the pawn. Made famous by the Netflix series of the same name.",
            ],
            [
              "King's Indian Defense",
              "1.d4 Nf6 2.c4 g6",
              "A popular counter-attacking defense. Black allows White to build a large center and then immediately attacks it. Favored by Kasparov and Fischer.",
            ],
            [
              "French Defense",
              "1.e4 e6",
              "A solid, strategic defense. Black builds a strong pawn structure but can end up with a cramped position. Produces long, positional battles.",
            ],
          ].map(([name, moves, d]) => (
            <Card key={name} className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="font-display text-lg">{name}</h4>
                <code className="rounded-md bg-black/40 px-2 py-0.5 font-mono text-xs text-gold">
                  {moves}
                </code>
              </div>
              <p className="mt-1.5 text-sm text-ivory/80">{d}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ---- 13 ---- */}
      <Section num="13" title="Chess Strategy — How Masters Think" id={sid(13)}>
        <h3 className="mb-2 font-display text-xl text-gold">Middlegame Strategy</h3>
        <P>
          The pawn structure determines what plans are available. Locked structures favor knights
          and slow positional maneuvering; open structures favor bishops and rooks. Identifying the
          correct plan from the structure is the master skill of middlegame chess.
        </P>
        <P>
          Piece activity and outposts are the building blocks of strong positions. An outpost is a
          square in enemy territory where your piece cannot be attacked by an enemy pawn — knights
          placed on outposts are devastating because they cannot be dislodged.
        </P>
        <P>
          King safety governs the middlegame. Once both kings have castled, attacks are organized
          around opening lines toward the enemy king. Pawn storms, piece sacrifices to open the
          king's position, and infiltrating squares near the king are the most common attacking
          themes.
        </P>
        <P>
          Material is not everything. The 'exchange sacrifice' — giving up a rook for a minor piece
          — is a classic positional sacrifice that wins long-term compensation in the form of pawn
          structure, square control, or attacking chances.
        </P>
        <h3 className="mb-2 font-display text-xl text-gold">Endgame Principles</h3>
        <P>
          The endgame begins when most pieces have been exchanged. The king transforms from hunted
          target to active fighting piece — getting the king into the center is often the single
          most important endgame move.
        </P>
        <P>
          Rook endgames center on two iconic positions: the Lucena (a winning technique for the side
          with the extra pawn) and the Philidor (the standard drawing technique for the defender).
          Mastering these two positions is essential for any serious chess player.
        </P>
        <h3 className="mb-2 font-display text-xl text-gold">Tactics</h3>
        <P>
          Tactics are short sequences of moves that win material or deliver checkmate. Even the best
          strategic plans are meaningless if a player overlooks a one-move tactic.
        </P>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard
            icon="⚡"
            title="Fork"
            body="One piece attacks two enemy pieces simultaneously. The opponent can only save one — the other is lost."
          />
          <InfoCard
            icon="📌"
            title="Pin"
            body="A piece is pinned when moving it would expose a more valuable piece behind it. Absolute pins (against the king) are especially powerful."
          />
          <InfoCard
            icon="🔱"
            title="Skewer"
            body="Like a reverse pin. A valuable piece is attacked, and when it moves, a less valuable piece behind it is captured."
          />
          <InfoCard
            icon="🔍"
            title="Discovered Attack"
            body="A piece moves, revealing an attack from another piece behind it. The moved piece can also attack — called a double attack."
          />
          <InfoCard
            icon="⚔"
            title="Zwischenzug"
            body="A German word meaning 'in-between move.' A surprising intermediate move improves the position before the obvious recapture."
          />
          <InfoCard
            icon="🎯"
            title="Deflection"
            body="A piece is forced away from defending a critical square or another piece. The defender is 'deflected' from its duty."
          />
        </div>
      </Section>

      {/* ---- 14 ---- */}
      <Section num="14" title="Chess Ratings — How Player Strength Is Measured" id={sid(14)}>
        <P>
          Chess ratings are numerical representations of a player's relative skill. The most widely
          used system is the Elo rating, developed by Hungarian-American physicist Arpad Elo in the
          1960s and adopted by FIDE in 1970. A player rated 200 points above their opponent is
          expected to win roughly 76% of games.
        </P>
        <div className="space-y-2">
          {[
            ["🌿", "Beginner", "Just learning the pieces and rules.", "Under 800"],
            ["📗", "Novice", "Understands basic tactics but misses pieces often.", "800–1000"],
            ["📘", "Intermediate", "Plays full games without major blunders.", "1000–1200"],
            [
              "📙",
              "Club Player",
              "Studies openings, understands positional concepts.",
              "1200–1500",
            ],
            ["📚", "Advanced", "Calculates multi-move combinations reliably.", "1500–1800"],
            ["💎", "Expert", "Strong tournament player with deep opening knowledge.", "1800–2000"],
            [
              "👑",
              "Candidate Master",
              "Near-master level, very strong tactically and positionally.",
              "2000–2200",
            ],
            [
              "🏆",
              "FIDE Master",
              "International-level player with formal FIDE title.",
              "2200–2300",
            ],
            [
              "⭐",
              "International Master",
              "Elite professional player. One step from Grandmaster.",
              "2300–2500",
            ],
            [
              "🌟",
              "Grandmaster",
              "The highest regular title in chess. Fewer than 2,000 GMs exist worldwide.",
              "2500+",
            ],
            [
              "🔮",
              "Super Grandmaster",
              "World-elite level. Magnus Carlsen peaked at 2882 — the highest rating ever.",
              "2700+",
            ],
          ].map(([icon, t, d, r]) => (
            <div
              key={t}
              className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
            >
              <span className="text-xl">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ivory">{t}</div>
                <div className="text-xs text-ivory/70">{d}</div>
              </div>
              <span className="shrink-0 rounded-full bg-gold/10 px-3 py-1 text-xs text-gold">
                {r}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- 15 ---- */}
      <Section num="15" title="FIDE Titles — From Candidate Master to Grandmaster" id={sid(15)}>
        <P>
          FIDE awards official chess titles to players who achieve specific performance thresholds
          in international tournaments. These titles are permanent — once earned, a chess title is
          never taken away.
        </P>
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              [
                "Open Titles",
                [
                  ["Candidate Master", "CM", "2200"],
                  ["FIDE Master", "FM", "2300"],
                  ["International Master", "IM", "2400"],
                  ["Grandmaster", "GM", "2500"],
                ],
              ],
              [
                "Women's Titles",
                [
                  ["Woman Candidate Master", "WCM", "2000"],
                  ["Woman FIDE Master", "WFM", "2100"],
                  ["Woman International Master", "WIM", "2200"],
                  ["Woman Grandmaster", "WGM", "2300"],
                ],
              ],
            ] as [string, string[][]][]
          ).map(([group, rows]) => (
            <div key={group}>
              <h3 className="mb-2 font-display text-lg text-gold">{group}</h3>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5 text-left">
                      <th className="px-4 py-2 font-medium text-gold">Title</th>
                      <th className="px-4 py-2 font-medium text-gold">Abbr</th>
                      <th className="px-4 py-2 font-medium text-gold">Min Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([t, a, r]) => (
                      <tr key={a} className="border-b border-white/5 last:border-0">
                        <td className="px-4 py-1.5 text-ivory/85">{t}</td>
                        <td className="px-4 py-1.5 font-mono text-gold/90">{a}</td>
                        <td className="px-4 py-1.5 text-ivory/85">{r}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <P>
          <span className="mt-4 block">
            The Grandmaster title is the highest awarded by FIDE. To earn it, a player must achieve
            a rating of at least 2500 AND score three 'GM norms' — performances at a specific level
            against other titled players. As of 2025, fewer than 2,000 Grandmasters exist worldwide
            out of hundreds of millions of chess players.
          </span>
        </P>
      </Section>

      {/* ---- 16 ---- */}
      <Section num="16" title="Chess Competitions — How Tournaments Work" id={sid(16)}>
        <P>
          Chess competitions range from local club tournaments to the World Chess Championship — the
          most prestigious event in chess, held every two years between the reigning champion and a
          challenger.
        </P>
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <InfoCard
            icon="🔁"
            title="Round Robin"
            body="Every player plays every other player. The most accurate format for determining the strongest player."
          />
          <InfoCard
            icon="🇨🇭"
            title="Swiss System"
            body="Players with similar scores are paired each round. Allows large tournaments (100+) to finish in few rounds."
          />
          <InfoCard
            icon="🥊"
            title="Knockout / Match"
            body="Players compete head-to-head; loser is eliminated. Used in World Championship cycles."
          />
          <InfoCard
            icon="🏟"
            title="Arena"
            body="Players can start new games immediately after finishing. Popular online."
          />
        </div>
        <ul className="list-disc space-y-1.5 pl-6 text-ivory/85">
          <li>World Chess Championship (classical, every 2 years)</li>
          <li>Candidates Tournament (selects the World Championship challenger)</li>
          <li>Chess Olympiad (team event, every 2 years)</li>
          <li>Grand Chess Tour (elite round-robin circuit)</li>
          <li>World Rapid and Blitz Championship</li>
          <li>National Championships (every country holds its own)</li>
        </ul>
      </Section>

      {/* ---- 17 ---- */}
      <Section
        num="17"
        title="The Complete History of Chess — From Ancient India to Today"
        id={sid(17)}
      >
        <div className="space-y-6 border-l-2 border-gold/20 pl-6">
          {[
            [
              "Origins: Chaturanga in Ancient India",
              "The origins of chess can be traced back to ancient India, where a game called chaturanga was played during the Gupta Empire, roughly between the 4th and 6th centuries AD. The word 'chaturanga' is Sanskrit for 'four divisions of the military' — infantry, cavalry, elephants, and chariots — corresponding to the four piece types. Chaturanga was already remarkably similar to modern chess: different pieces had different powers, and the fate of the king determined the outcome.",
            ],
            [
              "The Persian Evolution: Shatranj",
              "Chaturanga spread westward to Persia around the 6th century AD and evolved into shatranj. The raja became the ‘shah’ (king — the source of the word ‘chess’), and the phrase ‘shah mat’ — ‘the king is helpless’ — became the word ‘checkmate.’ Shatranj became enormously popular in the Islamic Golden Age, with masters like al-Suli and al-Lajlaj writing the first opening theory.",
            ],
            [
              "Chess Arrives in Europe",
              "Chess entered Europe via the Moorish conquest of Spain, through Sicily and Italy, and possibly through Byzantine routes. By the 10th and 11th centuries it was widespread throughout medieval Europe. The pieces were reinterpreted to reflect feudal society: the vizier became a queen, the elephant a bishop, and the chariot a castle (rook). Chess was considered one of the seven skills required of a knight.",
            ],
            [
              "The Revolutionary 15th-Century Rule Changes",
              "The most dramatic transformation in chess history occurred around 1475 in Spain or Portugal. The queen — formerly the weakest piece — gained the ability to move any number of squares in any direction, instantly becoming the most powerful piece. The new game was sometimes called 'Mad Queen Chess' — and within decades it had replaced the old shatranj throughout Europe.",
            ],
            [
              "The Romantic Era: 1600s–1800s",
              "For two centuries chess was dominated by 'Romantic chess' — brilliant sacrifices and aggressive attacks pursued regardless of material cost. The most celebrated figure was Paul Morphy (1837–1884), an American prodigy from New Orleans often considered the greatest natural talent in chess history.",
            ],
            [
              "The Classical Era: Steinitz and Scientific Chess",
              "Wilhelm Steinitz (1836–1900) revolutionized chess by replacing the Romantic attacking style with scientific positional principles. He argued that chess was about accumulating small advantages and only attacking when justified. Steinitz became the first official World Chess Champion in 1886 by defeating Johannes Zukertort.",
            ],
            [
              "The Soviet Chess Empire (1948–1991)",
              "After WWII, chess became a matter of national prestige for the Soviet Union. From 1948 to 1972, every World Chess Champion was a Soviet citizen. The dominant figure was Mikhail Botvinnik, whose students included future champions Anatoly Karpov and Garry Kasparov.",
            ],
            [
              "Bobby Fischer and the Match of the Century",
              "The 1972 World Championship between American Bobby Fischer and Soviet champion Boris Spassky in Reykjavik, Iceland, was one of the most dramatic events in sports history. Played at the height of the Cold War, Fischer won 12.5–8.5, breaking the Soviet monopoly on the world title for the first time in 24 years.",
            ],
            [
              "Karpov, Kasparov, and Deep Blue",
              "Karpov dominated chess from 1975 to 1985 with quiet positional precision. In 1985, the young Garry Kasparov won the title at age 22 and held it for 15 years. In 1997, IBM's Deep Blue defeated Kasparov 3.5–2.5 — the first computer to beat a reigning World Champion in a classical match, a landmark moment for AI.",
            ],
            [
              "The Modern Era: Kramnik, Anand, Carlsen",
              "Vladimir Kramnik ended Kasparov's reign in 2000 using the famous Berlin Defense. Viswanathan Anand of India became champion in 2007, inspiring an entire generation of Indian players. Magnus Carlsen of Norway held the title from 2013 to 2023 with the highest peak rating ever recorded (2882) before voluntarily declining to defend.",
            ],
            [
              "Gukesh — The Youngest World Champion",
              "In December 2024, 18-year-old Gukesh Dommaraju of India became the youngest undisputed World Chess Champion in history, defeating Ding Liren of China in Singapore. His victory represents the rise of a new generation of digital-native chess prodigies and the growing dominance of Indian chess.",
            ],
          ].map(([t, d]) => (
            <div key={t} className="relative">
              <span className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" />
              <h3 className="mb-1.5 font-display text-xl text-gold">{t}</h3>
              <p className="text-sm leading-relaxed text-ivory/80">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- 18 ---- */}
      <Section num="18" title="All World Chess Champions (1886–Present)" id={sid(18)}>
        <P>
          The World Chess Championship has been contested since 1886. Here is every undisputed World
          Chess Champion in history.
        </P>
        <div className="grid gap-3 md:grid-cols-2">
          {CHAMPIONS.map((c) => (
            <Card key={c.n} className="p-4">
              <div className="mb-1 flex items-center gap-2 text-[10px] tracking-[0.2em] text-gold/70">
                CHAMPION <span className="rounded bg-gold/10 px-1.5 py-0.5 text-gold">#{c.n}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span>{c.flag}</span>
                <h3 className="font-display text-lg">{c.name}</h3>
              </div>
              <div className="text-xs text-gold/80">{c.reign}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-ivory/75">{c.bio}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ---- 19 ---- */}
      <Section num="19" title="Chess Variants — Other Ways to Play" id={sid(19)}>
        <P>
          While standard chess is the most widely played form, many fascinating variants exist that
          use different rules, boards, or pieces.
        </P>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard
            icon="🎲"
            title="Chess960 / Fischer Random"
            body="The starting position of the pieces is randomly chosen, eliminating the value of memorized opening theory. Invented by Bobby Fischer to put pure chess creativity back at the center of the game."
          />
          <InfoCard
            icon="👥"
            title="Bughouse"
            body="A 4-player variant played on two boards with partners. Pieces captured by your partner can be placed on your board as your move — creating chaotic, fast-paced fun."
          />
          <InfoCard
            icon="✚"
            title="4-Player Chess"
            body="Played on a special cross-shaped board with four sets of pieces. Players form alliances or fight free-for-all. Each player uses their own clock."
          />
          <InfoCard
            icon="🌀"
            title="Crazyhouse"
            body="Like bughouse but for 2 players. Captured pieces join your army and can be dropped back onto the board as your move. Creates wild tactical positions."
          />
          <InfoCard
            icon="3️⃣"
            title="Three-Check"
            body="The first player to put the opponent's king in check three times wins — regardless of material or checkmate. Forces constant attacking play."
          />
          <InfoCard
            icon="🔄"
            title="Antichess (Losing Chess)"
            body="The goal is reversed: you must lose all your pieces or get stalemated. If you can capture an enemy piece, you MUST. The most counterintuitive chess variant."
          />
        </div>
      </Section>

      {/* ---- 20 ---- */}
      <Section
        num="20"
        title="Chess and Artificial Intelligence — A 70-Year Relationship"
        id={sid(20)}
      >
        <P>
          Chess has been central to the history of AI since the very beginning of the field. In
          1950, mathematician Alan Turing wrote the first chess-playing algorithm — not on a
          computer, but on paper. That same year, Claude Shannon published a landmark paper on how
          computers could be programmed to play chess.
        </P>
        <P>
          The progression from Turing's paper chess to modern engines spans 70 years. By the 1990s,
          Deep Blue's specialized hardware could evaluate hundreds of millions of positions per
          second, and in 1997 it defeated Kasparov. Today, programs like Stockfish play above 3500
          Elo — far beyond any human.
        </P>
        <P>
          In 2017, DeepMind's AlphaZero taught itself chess from scratch using only the rules and
          neural networks trained by self-play. AlphaZero defeated Stockfish and played a dynamic,
          sacrificial style remarkably unlike any previous engine — leading many observers to say
          AlphaZero played chess the way humans dream of playing it.
        </P>
        <P>
          Today, chess engines are not enemies of the sport but essential training tools. Every
          professional player uses engines to analyze games, prepare opening novelties, and study
          endgames. The relationship between human and computer chess is now symbiotic.
        </P>
      </Section>

      {/* ---- 21 ---- */}
      <Section num="21" title="How to Start Playing Chess — Your First Steps" id={sid(21)}>
        <ol className="space-y-3">
          {[
            [
              "Learn the basic rules",
              "You now know them from this guide! Each piece moves differently, you win by checkmate, and you must always get your king to safety. The rules will feel natural after a few games.",
            ],
            [
              "Play your first games online for free",
              "Create an account and play against the computer at the beginner level before challenging real players.",
            ],
            [
              "Learn the three opening principles",
              "Before studying specific openings: control the center, develop your pieces, castle your king. These three principles give you a solid start in every game.",
            ],
            [
              "Solve puzzles every day",
              "Chess puzzles are short exercises where you find the best move. Solving 5–10 puzzles a day is one of the fastest ways to improve.",
            ],
            [
              "Review your games",
              "After every game, spend 5 minutes reviewing your moves. Identify the moment you started to lose — usually a single blunder. Learning to spot your blunders is the fastest path to improvement.",
            ],
            [
              "Join a club or community",
              "Chess is more fun with other people. Find a local club, join an online community, or watch chess content on YouTube and Twitch. Learning from stronger players accelerates improvement dramatically.",
            ],
          ].map(([t, d], i) => (
            <li
              key={t}
              className="flex gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold/10 font-display text-gold">
                {i + 1}
              </span>
              <div>
                <div className="font-medium text-ivory">{t}</div>
                <div className="mt-0.5 text-sm text-ivory/75">{d}</div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* ---- 22 ---- */}
      <Section num="22" title="Test Your Chess Knowledge" id={sid(22)}>
        <Quiz />
      </Section>

      {/* ---- 23 ---- */}
      <Section num="23" title="Chess Glossary — 55 Terms Defined" id={sid(23)}>
        <Glossary />
      </Section>

      {/* ---- 24 ---- */}
      <Section num="24" title="Frequently Asked Questions About Chess" id={sid(24)}>
        <div className="space-y-2">
          {FAQ.map((f, i) => (
            <Accordion key={f.q} title={f.q} defaultOpen={i === 0}>
              {f.a}
            </Accordion>
          ))}
        </div>
      </Section>

      {/* ---- 25 ---- */}
      <Section num="25" title="Official Game Rules" id={sid(25)}>
        <P>
          The following rules govern competitive chess play, based on the official FIDE Laws of
          Chess and used in all CHESS OX tournaments and rated matches.
        </P>
        <div className="space-y-2">
          {RULES.map((r) => (
            <Accordion
              key={r.title}
              title={
                <span className="flex items-center gap-2.5">
                  <span className="text-gold">{r.icon}</span> {r.title}
                </span>
              }
              subtitle={r.subtitle}
            >
              {r.body}
            </Accordion>
          ))}
        </div>
      </Section>

      {/* ---- 26 ---- */}
      <Section num="26" title="About Us" id={sid(26)}>
        <h3 className="mb-2 font-display text-2xl text-gradient-gold">
          Welcome to Our Chess Platform
        </h3>
        <P>
          We are building a modern chess experience designed for players of all skill levels. Our
          platform combines smooth gameplay, intelligent AI, real-time multiplayer, and a visually
          immersive interface to make chess more enjoyable, competitive, and accessible for
          everyone.
        </P>
        <h3 className="mb-2 font-display text-xl text-gold">Who We Are</h3>
        <P>
          We are a passionate team focused on creating a powerful and user-friendly chess platform
          for casual players, learners, and competitive chess enthusiasts. Our goal is to deliver a
          seamless experience with modern design, advanced gameplay systems, and reliable
          performance across all devices.
        </P>
        <h3 className="mb-2 font-display text-xl text-gold">Our Mission</h3>
        <P>Our mission is to improve the online chess experience by providing:</P>
        <ul className="mb-4 list-disc space-y-1.5 pl-6 text-ivory/85">
          <li>Smart and challenging AI opponents</li>
          <li>Real-time online multiplayer gameplay</li>
          <li>Smooth and responsive user experience</li>
          <li>Fair and competitive matches</li>
          <li>Customizable board and gameplay settings</li>
          <li>A platform where players can learn, practice, and compete confidently</li>
        </ul>
        <P>
          We aim to make chess more engaging, strategic, and enjoyable for players around the world.
        </P>
        <h3 className="mb-3 font-display text-xl text-gold">Why Choose Us</h3>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard icon="⚡" title="Fast & Smooth" body="Fast and smooth gameplay performance." />
          <InfoCard
            icon="🤖"
            title="Intelligent AI"
            body="Intelligent AI with multiple difficulty levels."
          />
          <InfoCard
            icon="🌐"
            title="Real-time Multiplayer"
            body="Real-time online matchmaking and rooms."
          />
          <InfoCard
            icon="📱"
            title="Responsive Design"
            body="Responsive design for desktop and mobile devices."
          />
          <InfoCard icon="🎨" title="Modern UI/UX" body="Modern and immersive chess UI/UX." />
          <InfoCard
            icon="⚔"
            title="Accurate Rules"
            body="Accurate official chess rules and move validation."
          />
          <InfoCard
            icon="⚙"
            title="Customizable"
            body="Customizable board themes, timers, and gameplay settings."
          />
          <InfoCard
            icon="🛡"
            title="Stable & Optimized"
            body="Stable and optimized multiplayer experience."
          />
        </div>
        <h3 className="mb-2 font-display text-xl text-gold">Contact Us</h3>
        <P>
          We would love to hear from you. For support, feedback, bug reports, or partnership
          inquiries, feel free to contact us anytime.
        </P>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            ["Email", "contact@chessox.com"],
            ["Support", "contact@chessox.com"],
            ["Instagram", "@phoenixbrothersoff"],
          ].map(([t, v]) => (
            <Card key={t} className="p-4 text-center">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{t}</div>
              <div className="mt-1 text-sm text-gold">{v}</div>
            </Card>
          ))}
        </div>

        <Card className="p-8 text-center">
          <h3 className="font-display text-2xl text-gradient-gold">
            Ready to Play Your First Game?
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ivory/80">
            You now know everything you need to start playing chess. The best way to improve is
            simply to play — every game teaches you something new.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link to="/play">
              <GoldButton>▶ Play on CHESS OX</GoldButton>
            </Link>
            <Link
              to="/play/friend"
              className="rounded-xl border border-white/15 px-5 py-2.5 text-sm text-ivory hover:bg-white/5"
            >
              ▶ Play vs Human
            </Link>
          </div>
        </Card>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="font-medium text-ivory">Privacy Policy</h4>
            <p className="mt-1 text-sm text-ivory/70">
              Your privacy and data security are important to us. We are committed to protecting
              user information and maintaining a safe gaming environment.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-ivory">Terms &amp; Conditions</h4>
            <p className="mt-1 text-sm text-ivory/70">
              By using our platform, users agree to follow fair gameplay practices, community
              guidelines, and platform policies.
            </p>
          </div>
        </div>
        <div className="mt-8 border-t border-white/5 pt-4 text-center text-xs text-muted-foreground">
          <p>© 2026 Your Chess Platform. All Rights Reserved.</p>
          <p className="mt-1">Current Version: v1.0.0</p>
        </div>
      </Section>
    </div>
  );
}
