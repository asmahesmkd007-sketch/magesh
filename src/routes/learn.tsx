import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { PageShell, Card } from "@/components/site/Primitives";
import { ChevronDown, ChevronUp } from "lucide-react";
import { YouTubeTopicVideo } from "@/components/site/YouTubeTopicVideo";

export const Route = createFileRoute("/learn")({
  head: () => ({ meta: [{ title: "How To Use — ChessOx" }] }),
  component: HowToUse,
});

function Accordion({ question, answer }: { question: string; answer: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gold/15 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-sm font-medium text-foreground">{question}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gold shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gold shrink-0" />
        )}
      </button>
      {open && (
        <div className="border-t border-gold/10 px-5 py-4 text-sm text-muted-foreground leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}

function PieceCard({ name, description }: { name: string; description: string }) {
  return (
    <div className="rounded-xl border border-gold/15 bg-white/[0.02] p-5">
      <h4 className="font-medium text-gold text-sm mb-2">{name}</h4>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function TipBox({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-sm text-gold/90">
      <span className="text-base shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  );
}
function StepHeader({ num, title }: { num: number; title: string }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full gradient-gold text-background font-display text-lg font-bold">
        {num}
      </div>
      <h2 className="text-2xl tracking-tight text-gradient-gold mt-1">{title}</h2>
    </div>
  );
}

function HowToUse() {
  return (
    <PageShell
      eyebrow="How To Use"
      title="How to Play Chess: 7 Rules To Get You Started"
      subtitle="Learning how to play chess will be really easy with our step by step guide."
    >
      <div className="max-w-4xl mx-auto space-y-14">
        {/* Article meta */}
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
            <span className="text-gold font-medium">CHESScom</span>
            <span>·</span>
            <span>Updated: Mar 31, 2026, 7:43 AM</span>
            <span>·</span>
            <span>1,095</span>
            <span>·</span>
            <span className="rounded-full border border-gold/25 bg-gold/10 px-3 py-0.5 text-xs text-gold">
              For Beginners
            </span>
          </div>
          <p className="text-foreground leading-relaxed">
            It's never too late to learn how to play chess—the most popular game in the world!
            Learning the rules of chess is easy:
          </p>
          <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
            {[
              "Set Up The Chess Board",
              "Learn To Move The Pieces",
              "Discover The Special Rules",
              "Learn Who Makes The First Move",
              "Check Out The Rules On How To Win",
              "Study The Basic Strategies",
              "Practice Playing Lots Of Games",
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="h-5 w-5 rounded-full bg-gold/10 border border-gold/25 text-gold text-[10px] flex items-center justify-center shrink-0 font-bold">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
        </Card>

        {/* Step 1 */}
        <section id="setup">
          <StepHeader num={1} title="How To Setup The Chessboard" />
          <Card className="p-6 space-y-4">
            <p className="text-foreground leading-relaxed">
              At the beginning of the game the chessboard is laid out so that each player has the
              white (or light) color square in the bottom right-hand side.
            </p>
            <YouTubeTopicVideo
              topic="How To Setup The Chessboard"
              keywords={["chess board setup", "beginners"]}
              category="chess"
            />
            <p className="text-muted-foreground leading-relaxed text-sm">
              The chess pieces are then arranged the same way each time. The second row (or rank) is
              filled with pawns. The rooks go in the corners, then the knights next to them,
              followed by the bishops, and finally the queen, who always goes on her own matching
              color (white queen on white, black queen on black), and the king on the remaining
              square.
            </p>

            <p className="text-muted-foreground text-sm">
              Set up the pieces at the beginning of the game will be really easy.
            </p>
            <TipBox icon="??" text="Recommended Tool ? Train your vision of the board" />
          </Card>
        </section>

        {/* Step 2 */}
        <section id="pieces">
          <StepHeader num={2} title="How The Chess Pieces Move" />
          <Card className="p-6 space-y-5">
            <p className="text-muted-foreground leading-relaxed text-sm">
              Each of the 6 different kinds of pieces moves differently. Pieces cannot move through
              other pieces (though the knight can jump over other pieces), and can never move onto a
              square with one of their own pieces. However, they can be moved to take the place of
              an opponent's piece which is then captured. Pieces are generally moved into positions
              where they can capture other pieces (by landing on their square and then replacing
              them), defend their own pieces in case of capture, or control important squares in the
              game.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <PieceCard
                name="How to Move the King in Chess"
                description='The king is the most important piece, but is one of the weakest. The king can only move one square in any direction - up, down, to the sides, and diagonally. The king may never move himself into check (where he could be captured). When the king is attacked by another piece this is called "check".'
              />
              <PieceCard
                name="How To Move The Queen In Chess"
                description="The queen is the most powerful piece. She can move in any one straight direction - forward, backward, sideways, or diagonally - as far as possible as long as she does not move through any of her own pieces. And, like with all pieces, if the queen captures an opponent's piece her move is over. Notice how the white queen captures the black queen and then the black king is forced to move."
              />
              <PieceCard
                name="How To Move The Rook In Chess"
                description="The rook may move as far as it wants, but only forward, backward, and to the sides. The rooks are particularly powerful pieces when they are protecting each other and working together!"
              />
              <PieceCard
                name="How To Move The Bishop In Chess"
                description="The bishop may move as far as it wants, but only diagonally. Each bishop starts on one color (light or dark) and must always stay on that color. Bishops work well together because they cover up each other's weaknesses."
              />
              <PieceCard
                name="How To Move The Knight In Chess"
                description='Knights move in a very different way from the other pieces – going two squares in one direction, and then one more move at a 90-degree angle, just like the shape of an "L". Knights are also the only pieces that can move over other pieces.'
              />
              <PieceCard
                name="How To Move The Pawn In Chess"
                description="Pawns are unusual because they move and capture in different ways: they move forward but capture diagonally. Pawns can only move forward one square at a time, except for their very first move where they can move forward two squares. Pawns can only capture one square diagonally in front of them. They can never move or capture backward. If there is another piece directly in front of a pawn he cannot move past or capture that piece."
              />
            </div>
            <TipBox icon="??" text="Recommended Tool ? Solitaire Chess (capture all your pieces)" />
          </Card>
        </section>

        {/* Step 3 */}
        <section id="special-rules">
          <StepHeader num={3} title="Discover The Special Rules Of Chess" />
          <Card className="p-6 space-y-8">
            <p className="text-muted-foreground text-sm leading-relaxed">
              There are a few special rules in chess that may not seem logical at first. They were
              created to make the game more fun and interesting.
            </p>

            {/* Pawn Promotion */}
            <div>
              <h3 className="text-lg text-gold mb-3">How To Promote A Pawn In Chess</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pawns have another special ability and that is that if a pawn reaches the other side
                of the board it can become any other chess piece (called promotion) excluding a king
                (or pawn, for that matter).
              </p>
              <YouTubeTopicVideo
                topic="How To Promote A Pawn In Chess"
                keywords={["pawn promotion", "chess rules"]}
                category="chess"
              />
              <p className="text-sm text-muted-foreground leading-relaxed mt-3">
                A pawn may be promoted to a knight, bishop, rook, or queen. A common misconception
                is that pawns may only be exchanged for a piece that has been captured. That is NOT
                true. A pawn is usually promoted to a queen. Only pawns may be promoted.
              </p>
            </div>

            {/* En Passant */}
            <div>
              <h3 className="text-lg text-gold mb-3">How To Do "En Passant" In Chess</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The last rule about pawns is called "en passant," which is French for "in passing".
                If a pawn moves out two squares on its first move, and by doing so lands to the side
                of an opponent's pawn (effectively jumping past the other pawn's ability to capture
                it), that other pawn has the option of capturing the first pawn as it passes by.
              </p>
              <YouTubeTopicVideo
                topic="How To Do En Passant In Chess"
                keywords={["en passant", "chess rules", "special moves"]}
                category="chess"
              />
              <p className="text-sm text-muted-foreground leading-relaxed mt-3">
                This special move must be done immediately after the first pawn has moved past,
                otherwise the option to capture it is no longer available. Click through the example
                below to better understand this odd, but important rule.
              </p>
            </div>

            {/* Castling */}
            <div>
              <h3 className="text-lg text-gold mb-3">How To Castle In Chess</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                One other special chess rule is called castling. This move allows you to do two
                important things all in one move: get your king to safety (hopefully), and get your
                rook out of the corner and into the game. On a player's turn he may move his king
                two squares over to one side and then move the rook from that side's corner to right
                next to the king on the opposite side. (See the example below.) However, in order to
                castle, the following conditions must be met:
              </p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {[
                  "it must be that king's very first move",
                  "it must be that rook's very first move",
                  "there cannot be any pieces between the king and rook to move",
                  "the king may not be in check or pass through check",
                ].map((rule, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-gold mt-0.5 shrink-0">•</span>
                    {rule}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground leading-relaxed mt-4">
                Notice that when you castle one direction the king is closer to the side of the
                board. That is called castling "kingside". Castling to the other side, through where
                the queen sat, is called castling "queenside". Regardless of which side, the king
                always moves only two squares when castling.
              </p>
              <YouTubeTopicVideo
                topic="How To Castle In Chess"
                keywords={["castling", "chess rules", "special moves"]}
                category="chess"
              />
            </div>
          </Card>
        </section>

        {/* Step 4 */}
        <section id="first-move">
          <StepHeader num={4} title="Find Out Who Makes The First Move In Chess" />
          <Card className="p-6">
            <p className="text-foreground leading-relaxed">
              The player with the white pieces always moves first. Therefore, players generally
              decide who will get to be white by chance or luck such as flipping a coin or having
              one player guess the color of the hidden pawn in the other player's hand. White then
              makes a move, followed by black, then white again, then black, and so on until the end
              of the game. Being able to move first is a tiny advantage that gives the white player
              an opportunity to attack right away.
            </p>
          </Card>
        </section>

        {/* Step 5 */}
        <section id="winning">
          <StepHeader num={5} title="Review The Rules Of How To Win A Game Of Chess" />
          <Card className="p-6 space-y-8">
            <p className="text-muted-foreground text-sm">
              There are several ways to end a game of chess: by checkmate, with a draw, by
              resignation, by forfeit on time...
            </p>

            {/* Checkmate */}
            <div>
              <h3 className="text-lg text-gold mb-3">How To Checkmate In Chess</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The purpose of the game is to checkmate the opponent's king. This happens when the
                king is put into check and cannot get out of check.
              </p>
              <YouTubeTopicVideo
                topic="How To Checkmate In Chess"
                keywords={["checkmate", "chess rules", "win"]}
                category="chess"
              />
              <p className="text-sm text-muted-foreground leading-relaxed mt-4">
                There are only three ways a king can get out of check:
              </p>
              <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                {[
                  "move out of the way (though he cannot castle!)",
                  "block the check with another piece or",
                  "capture the piece threatening the king.",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-gold mt-0.5 shrink-0">•</span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground leading-relaxed mt-4">
                If a king cannot escape checkmate then the game is over. Customarily the king is not
                captured or removed from the board, the game is simply declared over.
              </p>

              <p className="text-sm text-muted-foreground leading-relaxed mt-4">
                Checkmate can happen in the early stages of the game if one of the players does not
                act carefully. Below, you will find an example of the Fools mate, a checkmate that
                happens in just 2 moves.
              </p>
              <YouTubeTopicVideo
                topic="Fool's Mate Checkmate In 2 Moves"
                keywords={["fools mate", "fastest checkmate"]}
                category="chess"
              />
            </div>

            {/* Draw */}
            <div>
              <h3 className="text-lg text-gold mb-3">How To Draw A Chess Game</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Occasionally chess games do not end with a winner, but with a draw. There are 5
                reasons why a chess game may end in a draw:
              </p>
              <ol className="mt-4 space-y-4 text-sm text-muted-foreground">
                <li className="flex items-start gap-3">
                  <span className="text-gold font-bold shrink-0">1.</span>
                  <div>
                    The position reaches a stalemate where it is one player's turn to move, but his
                    king is NOT in check and yet he does not have another legal move:
                    <div className="mt-3 rounded-xl border border-gold/10 bg-black/20 py-6 flex items-center justify-center text-gold/40 text-xs text-center px-4">
                      [Diagram: Chess Stalemate]
                    </div>
                    <p className="mt-2 text-xs text-gold/70">
                      With the move Qc7, black is not threatened and can't move. The game is
                      declared a draw by stalemate.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-gold font-bold shrink-0">2.</span>
                  <span>The players may simply agree to a draw and stop playing</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-gold font-bold shrink-0">3.</span>
                  <span>
                    There are not enough pieces on the board to force a checkmate (example: a king
                    and a bishop vs. a king)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-gold font-bold shrink-0">4.</span>
                  <span>
                    A player declares a draw if the same exact position is repeated three times
                    (though not necessarily three times in a row)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-gold font-bold shrink-0">5.</span>
                  <span>
                    Fifty consecutive moves have been played where neither player has moved a pawn
                    or captured a piece
                  </span>
                </li>
              </ol>
            </div>
          </Card>
        </section>

        {/* Step 6 */}
        <section id="strategies">
          <StepHeader num={6} title="Study Basic Chess Strategies" />
          <Card className="p-6 space-y-5">
            <p className="text-muted-foreground text-sm">
              There are four simple things that every chess player should know:
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Protect King */}
              <div className="rounded-xl border border-gold/15 bg-white/[0.02] p-5">
                <h3 className="text-sm font-medium text-gold mb-2">Protect Your King</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Get your king to the corner of the board where he is usually safer. Don't put off
                  castling. You should usually castle as quickly as possible. Remember, it doesn't
                  matter how close you are to checkmating your opponent if your own king is
                  checkmated first!
                </p>
              </div>

              {/* Piece Values */}
              <div className="rounded-xl border border-gold/15 bg-white/[0.02] p-5">
                <h3 className="text-sm font-medium text-gold mb-2">Don't Give Pieces Away</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                  Don't carelessly lose your pieces! Each piece is valuable and you can't win a game
                  without pieces to checkmate. There is an easy system that most players use to keep
                  track of the relative value of each chess piece. How much are the chess pieces
                  worth?
                </p>
                <div className="space-y-1.5 text-sm">
                  {[
                    ["A pawn is worth", "1"],
                    ["A knight is worth", "3"],
                    ["A bishop is worth", "3"],
                    ["A rook is worth", "5"],
                    ["A queen is worth", "9"],
                    ["The king is infinitely valuable", "8"],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-muted-foreground">
                      <span>{label}</span>
                      <span className="text-gold font-display">{val}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  At the end of the game, these points don't mean anything—it is simply a system you
                  can use to make decisions while playing, helping you know when to capture,
                  exchange, or make other moves.
                </p>
              </div>

              {/* Control Center */}
              <div className="rounded-xl border border-gold/15 bg-white/[0.02] p-5">
                <h3 className="text-sm font-medium text-gold mb-2">
                  Control The Center Of The Chessboard
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  You should try and control the center of the board with your pieces and pawns. If
                  you control the center, you will have more room to move your pieces and will make
                  it harder for your opponent to find good squares for his pieces. In the example
                  above white makes good moves to control the center while black plays bad moves.
                </p>
              </div>

              {/* Use All Pieces */}
              <div className="rounded-xl border border-gold/15 bg-white/[0.02] p-5">
                <h3 className="text-sm font-medium text-gold mb-2">Use All Of Your Chess Pieces</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  In the example above white got all of his pieces in the game! Your pieces don't do
                  any good when they are sitting back on the first row. Try and develop all of your
                  pieces so that you have more to use when you attack the king. Using one or two
                  pieces to attack will not work against any decent opponent.
                </p>
              </div>
            </div>
            <TipBox icon="??" text="Recommended Article ? 10 Common Mistakes Among Beginners" />
          </Card>
        </section>

        {/* Step 7 */}
        <section id="practice">
          <StepHeader num={7} title="Practice By Playing Lots Of Games" />
          <Card className="p-6 space-y-4">
            <p className="text-foreground leading-relaxed">
              The most important thing you can do to get better at chess is to play lots of chess!
              It doesn't matter if you play at home with friends or family, or play online, you have
              to play the game a lot to improve. These days it's easy to find a game of chess
              online!
            </p>
            <YouTubeTopicVideo
              topic="How to play chess online for beginners"
              keywords={["play chess online", "beginners"]}
              category="chess"
            />
          </Card>
        </section>

        {/* Chess Variants */}
        <section id="variants">
          <h2 className="text-2xl tracking-tight text-gradient-gold mb-6">
            How To Play Chess Variants
          </h2>
          <Card className="p-6 space-y-6">
            <p className="text-muted-foreground text-sm leading-relaxed">
              While most people play standard chess rules, some people like to play chess with
              changes to the rules. These are called "chess variants". Each variant has its own
              rules:
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  name: "Chess960",
                  desc: "In Chess960 (Fischer Random), the initial position of the pieces is set at random. Pawns keep their normal initial position but the rest of the pieces are arranged randomly.",
                },
                {
                  name: "King Of The Hill",
                  desc: 'In this format, the goal is to get your king to the center of the board or "top of the hill."',
                },
                {
                  name: "Bughouse",
                  desc: "This format is played in pairs. When one player captures a piece from the opponent, this piece will become available to his or her teammate. For example: If I play as White and my teammate, who is Black, takes a white knight from her opponent, in my turn I will have a knight that I can put on any free square on my board. I can do so in any of my future turns.",
                },
                {
                  name: "Crazyhouse",
                  desc: "This is a very exciting format since it allows you to use the pieces you take from your opponent. That is, if I play as White and I take a black pawn from my opponent, that pawn will turn into a white pawn that I can put on the board as part of my army. I can do so in any of my future turns.",
                },
                {
                  name: "3-Check",
                  desc: "In this format, the first player who checks the opponent's king three times, wins.",
                },
              ].map((v) => (
                <div key={v.name} className="rounded-xl border border-gold/15 bg-white/[0.02] p-4">
                  <h4 className="text-sm font-medium text-gold mb-2">{v.name}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{v.desc}</p>
                </div>
              ))}
            </div>
            <YouTubeTopicVideo
              topic="Amazing Chess Variants Explained"
              keywords={["chess variants", "crazyhouse", "bughouse", "chess960"]}
              category="chess"
            />
            <TipBox icon="??" text="Recommended Article ? 5 Amazing Chess Variants" />
          </Card>
        </section>

        {/* Chess960 deep-dive */}
        <section id="chess960">
          <h2 className="text-2xl tracking-tight text-gradient-gold mb-6">How To Play Chess960</h2>
          <Card className="p-6 space-y-4">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Chess960 follows all the rules of standard chess, except for the starting position of
              pieces on the back rank, which are placed randomly in one of 960 possible positions.
              Castling is done just like in standard chess, with the King and Rook landing on their
              normal castled squares (g1 and f1, or c1 and d1). 960 plays just like standard chess,
              but with more variety in the opening.
            </p>
            <YouTubeTopicVideo
              topic="How To Play Chess960 Fischer Random"
              keywords={["chess960", "fischer random"]}
              category="chess"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TipBox icon="??" text="Recommended Tool ? Play Chess960 vs the Computer" />
              <TipBox icon="??" text="Recommended Tool ? Play Chess960 with Friends" />
            </div>
          </Card>
        </section>

        {/* Tournament Rules */}
        <section id="tournament-rules">
          <h2 className="text-2xl tracking-tight text-gradient-gold mb-6">
            How To Play With Chess Tournament Rules
          </h2>
          <Card className="p-6 space-y-6">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Many tournaments follow a set of common, similar rules. These rules do not necessarily
              apply to play at home or online, but you may want to practice with them anyway.
            </p>
            <div className="space-y-5">
              <div>
                <h4 className="text-sm font-medium text-gold mb-2">Touch-move</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  If a player touches one of their own pieces they must move that piece as long as
                  it is a legal move. If a player touches an opponent's piece, they must capture
                  that piece. A player who wishes to touch a piece only to adjust it on the board
                  must first announce the intention, usually by saying "adjust".
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gold mb-2">Clocks and Timers</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Most tournaments use timers to regulate the time spent on each game, not on each
                  move. Each player gets the same amount of time to use for their entire game and
                  can decide how to spend that time. Once a player makes a move they then touch a
                  button or hit a lever to start the opponent's clock. If a player runs out of time
                  and the opponent calls the time, then the player who ran out of time loses the
                  game (unless the opponent does not have enough pieces to checkmate, in which case
                  it is a draw).
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* FAQs */}
        <section id="faq">
          <h2 className="text-2xl tracking-tight text-gradient-gold mb-6">
            Frequently Asked Chess Questions (FAQs)
          </h2>
          <Card className="p-5 mb-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Maybe all this information can overwhelm you a little bit. That is why we put at your
              disposal these frequent questions that usually occur in those people who are beginning
              to enter the world of chess. We hope they're useful to you!
            </p>
          </Card>
          <div className="space-y-2">
            <Accordion
              question="How Do I Get Better At Chess?"
              answer={
                <div className="space-y-3">
                  <p>
                    Knowing the rules and basic strategies is only the beginning - there is so much
                    to learn in chess that you can never learn it all in a lifetime! To improve you
                    need to do three things:
                  </p>
                  <ul className="space-y-2">
                    <li>
                      <strong className="text-gold">Play lots of chess</strong> — Just keep playing!
                      Play as much as possible. You should learn from each game – those you win and
                      those you lose.
                    </li>
                    <li>
                      <strong className="text-gold">Study with chess lessons</strong> — If you
                      really want to improve quickly then you should do some online chess lessons.
                      You can find online chess lessons here.
                    </li>
                    <li>
                      <strong className="text-gold">Have fun</strong> — Don't get discouraged if you
                      don't win all of your games right away. Everyone loses – even world champions.
                      As long as you continue to have fun and learn from the games you lose then you
                      can enjoy chess forever!
                    </li>
                  </ul>
                  <TipBox icon="??" text="Recommended Article ? 7 Tips to Get Better at Chess" />
                </div>
              }
            />
            <Accordion
              question="What Is The Best First Move In Chess?"
              answer="While there is no one agreed-upon best move in chess, it's important to try to control the center right away. This usually results in most players playing one of their central pawns (in front of king or queen) forward two squares with either 1. d4 or 1. e4. Some other players prefer 1. c4 or 1. Nf3. Most other moves are not as good. Bobby Fischer believed that moving the king-pawn 1. e4 was best."
            />
            <Accordion
              question="Which Color Starts In Chess?"
              answer="The player with the white pieces always moves first."
            />
            <Accordion
              question="Can A Pawn Move Backwards?"
              answer="Pawns cannot move backward. However, when a pawn gets to the other side of the board you must promote it to another piece (such as a queen). Then it moves just like that piece and can move backward."
            />
            <Accordion
              question="Can You Move More Than One Piece At A Time In Chess?"
              answer="You can only move one chess piece at a time when it is your turn to move - with one exception! When you castle, you move both the king and the rook in one move."
            />
            <Accordion
              question="Which Is The Most Important Chess Piece?"
              answer="The king is the most important chess piece. If you lose the king, you lose the game. But the queen is the most powerful chess piece."
            />
            <Accordion
              question="When Was Chess Invented?"
              answer={
                <div className="space-y-3">
                  <p>
                    The origins of chess are not exactly clear, though most believe it evolved from
                    earlier chess-like games played in India almost two thousand years ago. The game
                    of chess we know today has been around since the 15th century where it became
                    popular in Europe.
                  </p>
                  <TipBox
                    icon="??"
                    text="Recommended Article ? The 10 Most Important Moments in Chess History"
                  />
                </div>
              }
            />
            <Accordion
              question="What Was The Longest Game In Chess History?"
              answer={
                <div className="space-y-3">
                  <p>
                    The longest tournament chess game (in terms of moves) ever to be played was
                    Nikolic vs. Arsovic in 1989 and played in Belgrade, Serbia.
                  </p>
                  <div className="rounded-lg border border-gold/15 bg-black/20 p-4 font-mono text-xs text-muted-foreground space-y-1">
                    <p>Ivan Nikolic vs. Goran Arsovic</p>
                    <p>1/2-1/2 17 Feb 1989 ECO: E95</p>
                  </div>
                  <TipBox icon="??" text="The Longest Chess Games in History (article)" />
                </div>
              }
            />
            <Accordion
              question="What Is Chess Notation?"
              answer={
                <div className="space-y-3">
                  <p>
                    Notation was invented so that we could analyze chess games after playing them.
                    Thanks to it, we can register the whole game in writing and reproduce it as many
                    times as we want. We must only write down our moves and our opponent's moves
                    correctly.
                  </p>
                  <p className="text-xs text-gold/70">
                    Chess notation will allow you to store all your games...
                  </p>
                  <p>
                    Each square has a coordinate and each piece is represented by an initial (N for
                    knight, B for bishop, Q for queen, R for rook, and K for king).
                  </p>
                  <TipBox
                    icon="??"
                    text="Recommended Article ? Chess Notation - The Language of The Game"
                  />
                </div>
              }
            />
            <Accordion
              question="What Is The Goal Of Chess?"
              answer={
                <div className="space-y-3">
                  <p>
                    Chess is a game played between two opponents on opposite sides of a board
                    containing 64 squares of alternating colors. Each player has 16 pieces: 1 king,
                    1 queen, 2 rooks, 2 bishops, 2 knights, and 8 pawns.
                  </p>
                  <p>
                    The goal of the game is to checkmate the other king. Checkmate happens when the
                    king is in a position to be captured (in check) and cannot escape from capture.
                  </p>
                </div>
              }
            />
          </div>
        </section>

        {/* Sign-up CTA */}
        <section id="cta">
          <Card className="p-8 text-center space-y-5 corner-ornaments">
            <p className="text-lg text-foreground">
              Ready to start playing chess? Sign up for free at{" "}
              <span className="text-gold font-medium">chessox.com</span> and start enjoying the
              game!
            </p>
            <div>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center gap-2 rounded-xl gradient-gold px-8 py-3 text-sm font-medium text-background shadow-gold-glow transition duration-200 hover:brightness-110"
              >
                Sign up - it's free!
              </Link>
            </div>
          </Card>
        </section>

        {/* More from CHESScom */}
        <section id="more-articles">
          <h2 className="text-xl tracking-tight text-gradient-gold mb-4">More from CHESScom</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gold/15 bg-white/[0.02] p-5 hover:border-gold/30 transition-colors cursor-default">
              <p className="text-sm text-foreground">
                chessox.com Broadcast Schedule: Live Chess Streams on Twitch &amp; YouTube
              </p>
            </div>
            <div className="rounded-xl border border-gold/15 bg-white/[0.02] p-5 hover:border-gold/30 transition-colors cursor-default">
              <p className="text-sm text-foreground">
                Ratings, Prizes, And More This Month At chessox.com
              </p>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
