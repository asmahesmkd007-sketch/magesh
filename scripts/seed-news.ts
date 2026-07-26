// =====================================================================
// SEED NEWS ARTICLES
// ---------------------------------------------------------------------
// Inserts (or updates) the ChessOx news desk articles. Safe to re-run:
// rows are upserted on `slug`, so running twice updates rather than
// duplicates.
//
//   npx tsx scripts/seed-news.ts
//
// IMPORTANT — how bodies are rendered
// src/routes/news.$slug.tsx renders `body` with dangerouslySetInnerHTML
// after replacing every "\n" with "<br/>". So the stored body must be
// HTML with NO newlines, or every line break becomes a stray <br/> and
// the article gains blank gaps. The html() helper below lets the source
// stay readable and collapses it to a single line before insert.
//
// Every factual claim below was checked against the primary sources
// listed at the foot of each article (FIDE, Chess.com, ChessBase, ECF,
// agency wires) in late July 2026. Nothing is invented. Where a detail
// was not stated by a source, it is omitted rather than guessed.
// =====================================================================
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Read .env manually (same pattern as the other scripts in this folder)
const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, "");
});

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, key);

/** Collapse a readable multi-line HTML template into one newline-free line. */
const html = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();

const AUTHOR = "ChessOx News Desk";

type Article = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  read_time_min: number;
  is_featured: boolean;
  cover_gradient: string;
  published_at: string;
};

const ARTICLES: Article[] = [
  // -------------------------------------------------------------------
  {
    slug: "firouzja-wins-quantbox-chennai-grand-masters-2026",
    title: "Firouzja Wins Fourth Quantbox Chennai Grand Masters as Gukesh Finishes Last",
    excerpt:
      "Alireza Firouzja took the 2026 Quantbox Chennai Grand Masters with an unbeaten 4½/7 and a return to the world top ten, while world champion Gukesh finished last on 2/7.",
    category: "Tournaments",
    read_time_min: 5,
    is_featured: false,
    cover_gradient: "from-amber-500 to-rose-700",
    published_at: "2026-07-23T09:00:00Z",
    body: html(`
      <h2>Firouzja seizes the event early and never lets go</h2>
      <p>The fourth edition of the Quantbox Chennai Grand Masters, held in Chennai from 16 to 22 July 2026,
      was effectively decided in its opening two rounds. Alireza Firouzja beat the Indian grandmaster
      M Pranesh in round one, then defeated reigning world champion Gukesh Dommaraju in round two to move
      clear of a field that organisers billed as India's strongest classical tournament.</p>
      <p>From there the 2749-rated Frenchman changed gear entirely. He drew each of his remaining five games,
      declining to take risks with a lead he had built quickly, and finished the seven-round single
      round-robin as one of only two undefeated players. Four and a half points from seven games was enough
      to take the title outright by half a point.</p>
      <p>The practical reward went beyond the trophy. The performance was worth 7.6 rating points and
      returned Firouzja to the world's top ten, a bracket he had slipped out of earlier in the cycle.</p>

      <h2>Three players, one tiebreak, two podium places</h2>
      <p>The race behind the winner ran to the final round. Dmitry Andreikin, rated 2710 and competing under
      the FIDE flag, and Arjun Erigaisi, the field's top seed at 2757, both finished on 4/7.</p>
      <p>Andreikin took second place on tiebreak after beating Nodirbek Abdusattorov in round seven, and like
      Firouzja completed the event without a loss. Erigaisi's tournament was the more volatile of the two —
      two wins and one defeat — and left him third despite arriving as the highest-rated player in the hall.</p>
      <p>Abdusattorov, at 2766 the strongest competitor present by rating, finished fourth on 3½/7, level with
      Pranesh and Nihal Sarin. Hans Niemann took seventh on 3/7.</p>

      <h2>A difficult week for the world champion</h2>
      <p>Gukesh arrived in Chennai rated 2717 and left with the worst result in the field. He lost three of
      his seven games and finished eighth and last on 2/7.</p>
      <p>The defeats came in a cluster. Firouzja beat him in round two; after a brief stabilisation he lost
      consecutively to Erigaisi in round five and to Pranesh in round six.</p>
      <h3>The round-five loss to Erigaisi</h3>
      <p>The Erigaisi game drew the most attention. Playing Black, Erigaisi kept the position balanced through
      the opening and waited. When the champion's accuracy dipped in the middlegame, Erigaisi took over the
      initiative and converted patiently. Gukesh resigned on move 63 with a black pawn on the d-file about to
      promote. At the time the win lifted Erigaisi into a share of the lead with Firouzja, with two rounds
      still to play.</p>
      <p>The cumulative cost to Gukesh was 13.9 rating points, dropping him to 31st on the live list and to
      within roughly three points of the 2700 threshold.</p>

      <h2>An Indian field, an outside winner</h2>
      <p>Four of the eight players were Indian — Erigaisi, Gukesh, Nihal Sarin and Pranesh — and none of them
      won the event. Pranesh, the lowest-rated participant at 2666, arguably exceeded expectations by the
      widest margin, matching Abdusattorov and Nihal Sarin on 3½ and beating the world champion along the way.</p>

      <h2>Final standings</h2>
      <ol>
        <li>Alireza Firouzja (FRA, 2749) — 4½</li>
        <li>Dmitry Andreikin (FIDE, 2710) — 4</li>
        <li>Arjun Erigaisi (IND, 2757) — 4</li>
        <li>Nodirbek Abdusattorov (UZB, 2766) — 3½</li>
        <li>M Pranesh (IND, 2666) — 3½</li>
        <li>Nihal Sarin (IND, 2717) — 3½</li>
        <li>Hans Moke Niemann (USA, 2730) — 3</li>
        <li>D Gukesh (IND, 2717) — 2</li>
      </ol>
      <p><em>The time control and prize fund were not specified in the sources consulted for this report.</em></p>

      <h2>Key takeaways</h2>
      <ul>
        <li>Firouzja won unbeaten on 4½/7, half a point clear of the field.</li>
        <li>Both his decisive wins came in the first two rounds; his last five games were drawn.</li>
        <li>The result added 7.6 rating points and restored him to the world top ten.</li>
        <li>Andreikin and Erigaisi tied on 4/7, with Andreikin second on tiebreak.</li>
        <li>Gukesh finished last on 2/7 and lost 13.9 rating points.</li>
      </ul>

      <h2>Frequently asked questions</h2>
      <h3>Who won the Quantbox Chennai Grand Masters 2026?</h3>
      <p>Alireza Firouzja of France, with 4½ points from seven games. He finished undefeated, half a point
      ahead of Dmitry Andreikin and Arjun Erigaisi.</p>
      <h3>How did Gukesh perform?</h3>
      <p>The reigning world champion finished eighth and last on 2/7. He lost to Firouzja in round two and to
      Arjun Erigaisi and M Pranesh in rounds five and six, shedding 13.9 rating points.</p>
      <h3>Did Arjun Erigaisi beat Gukesh?</h3>
      <p>Yes. Erigaisi won their round-five game with the black pieces. Gukesh resigned on move 63 with a
      pawn about to promote on the d-file, a result that moved Erigaisi into a share of the lead.</p>
      <h3>Where and when was the tournament held?</h3>
      <p>In Chennai, India, from 16 to 22 July 2026. It was the fourth edition of the event.</p>

      <p>Related reading:
      <a href="/news/india-squad-chess-olympiad-2026-samarkand">India names its Olympiad squad for Samarkand</a>
      and <a href="/news/gukesh-sindarov-world-championship-2026-dates">FIDE confirms the dates for Gukesh v Sindarov</a>.</p>

      <h3>Sources</h3>
      <ul>
        <li><a href="https://www.fide.com/alireza-firouzja-wins-quantbox-chennai-grand-masters-2026/" target="_blank" rel="noopener noreferrer">FIDE</a> — Alireza Firouzja wins Quantbox Chennai Grand Masters 2026</li>
        <li><a href="https://en.chessbase.com/post/chennai-gms-2026-7" target="_blank" rel="noopener noreferrer">ChessBase</a> — Firouzja wins Chennai Grand Masters, rejoins world top ten</li>
        <li><a href="https://www.chess.com/news/view/2026-chennai-grand-masters-round-7" target="_blank" rel="noopener noreferrer">Chess.com</a> — Firouzja Wins 2026 Chennai Grand Masters, Andreikin Snatches 2nd</li>
        <li><a href="https://en.chessbase.com/post/chennai-gms-2026-5" target="_blank" rel="noopener noreferrer">ChessBase</a> — Chennai GMs round 5: Erigaisi takes down Gukesh</li>
        <li><a href="https://www.chessbase.in/news/4th-quantbox-chennai-grand-masters-2026-final-report" target="_blank" rel="noopener noreferrer">ChessBase India</a> — 4th Quantbox Chennai Grand Masters 2026 final report</li>
      </ul>
    `),
  },

  // -------------------------------------------------------------------
  {
    slug: "anand-interim-fide-president-dvorkovich-suspends-duties",
    title: "Anand Takes Over as Interim FIDE President After Dvorkovich Steps Aside",
    excerpt:
      "Arkady Dvorkovich has voluntarily suspended his duties as FIDE President following his inclusion on the EU sanctions list. Deputy President Viswanathan Anand assumes the role on an interim basis.",
    category: "Federation",
    read_time_min: 5,
    is_featured: true,
    cover_gradient: "from-violet-500 to-indigo-700",
    published_at: "2026-07-24T14:00:00Z",
    body: html(`
      <h2>A change at the top of world chess</h2>
      <p>Viswanathan Anand has assumed the interim presidency of the International Chess Federation (FIDE)
      after incumbent president Arkady Dvorkovich stepped aside following his inclusion on the European
      Union's list of sanctioned individuals connected to the war in Ukraine.</p>
      <p>Dvorkovich announced that he would voluntarily suspend the exercise of his rights, duties and
      prerogatives as FIDE President with immediate effect, and for as long as he remains subject to
      sanctions under EU and Swiss law. The FIDE Council accepted and ratified that decision.</p>
      <p>Anand, a five-time world champion, has served as FIDE Deputy President since 2022. Under the
      federation's arrangements, the deputy president assumes the role while the presidency is suspended.</p>

      <h2>What the EU listing says</h2>
      <p>The EU's sanctions entry accuses Dvorkovich of using his position as FIDE president to support
      Russian policies that undermine Ukraine's territorial integrity. It cites his previous senior roles in
      the Russian government, and notes that the Kremlin welcomed his re-election as FIDE president in 2022
      as a "victory" for Moscow.</p>

      <h2>Dvorkovich's response</h2>
      <p>In a statement issued through FIDE, Dvorkovich said he considers the EU decision unlawful and unfair,
      and that it will be challenged by all possible means. He framed the suspension of his duties as a
      voluntary step taken while that challenge proceeds, rather than a resignation.</p>
      <p>The distinction matters administratively: the presidency has been suspended, not vacated, and the
      arrangement is tied to the duration of the sanctions rather than to a fixed term.</p>

      <h2>Who is Viswanathan Anand?</h2>
      <p>Anand is among the most decorated players in the game's history and the figure most closely
      associated with the growth of chess in India. He became world champion in 2007 and held the title
      until 2013, defending it against Vladimir Kramnik, Veselin Topalov and Boris Gelfand before losing it
      to Magnus Carlsen in Chennai. He is a five-time world champion across formats and was the first Indian
      player to reach the world number one ranking.</p>
      <p>His influence on the current Indian generation is direct rather than symbolic. The academy he
      established has worked with several of the players now at the top of the Indian game — among them
      Gukesh, Praggnanandhaa and Vaishali, the same names that appear on the country's Olympiad squads.
      Anand has also been an administrator since 2022, when he was elected FIDE Deputy President, giving him
      four years inside the federation's leadership before this appointment.</p>

      <h2>What it means for the federation</h2>
      <p>The change arrives at an unusually busy moment in the FIDE calendar. The federation is preparing for
      the 46th Chess Olympiad in Samarkand in September, has approved a new multi-format professional circuit
      due to hold its pilot event in Budapest in November, and oversees a World Championship match scheduled
      for late November and December.</p>
      <p>Anand's appointment also marks the first time an Indian has held the FIDE presidency, in a period when
      Indian players hold the men's world championship title and both Olympiad team golds. As of publication,
      FIDE had not announced any change to the federation's scheduled events or to its governance timetable
      beyond the presidency itself.</p>

      <h2>Timeline</h2>
      <ul>
        <li><strong>2022</strong> — Dvorkovich re-elected FIDE President; Anand elected Deputy President.</li>
        <li><strong>July 2026</strong> — Dvorkovich named on the EU sanctions list.</li>
        <li><strong>24 July 2026</strong> — Dvorkovich announces the voluntary suspension of his duties; the FIDE Council accepts and ratifies it.</li>
        <li><strong>Immediately thereafter</strong> — Anand assumes the interim presidency.</li>
      </ul>

      <h2>Key takeaways</h2>
      <ul>
        <li>Dvorkovich has suspended, not resigned, his FIDE presidency.</li>
        <li>The suspension lasts as long as he remains sanctioned under EU and Swiss law.</li>
        <li>The FIDE Council formally accepted and ratified the decision.</li>
        <li>Anand, Deputy President since 2022, becomes interim president.</li>
        <li>Dvorkovich says he regards the listing as unlawful and will contest it.</li>
      </ul>

      <h2>Frequently asked questions</h2>
      <h3>Has Dvorkovich resigned as FIDE President?</h3>
      <p>No. He has voluntarily suspended the exercise of his powers and duties for as long as he remains
      subject to EU and Swiss sanctions. The FIDE Council accepted and ratified that decision, and the
      presidency is suspended rather than vacated.</p>
      <h3>Who is running FIDE now?</h3>
      <p>Viswanathan Anand, who has been FIDE Deputy President since 2022, has assumed the presidency on an
      interim basis.</p>
      <h3>Why was Dvorkovich sanctioned by the EU?</h3>
      <p>The EU listing accuses him of using his FIDE position to support Russian policies undermining
      Ukraine's territorial integrity, citing his earlier senior roles in the Russian government. Dvorkovich
      says the decision is unlawful and unfair and has said he will contest it.</p>

      <p>Related reading:
      <a href="/news/india-squad-chess-olympiad-2026-samarkand">India's Olympiad squad for Samarkand</a>
      and <a href="/news/total-chess-world-championship-tour-budapest-pilot">the FIDE-approved Total Chess Tour pilot</a>.</p>

      <h3>Sources</h3>
      <ul>
        <li><a href="https://www.fide.com/statement-by-the-fide-president/" target="_blank" rel="noopener noreferrer">FIDE</a> — Statement by FIDE President Arkady Dvorkovich</li>
        <li><a href="https://www.chess.com/news/view/arkady-dvorkovich-sanctioned-by-eu-ukrainian-sports-minister" target="_blank" rel="noopener noreferrer">Chess.com</a> — Dvorkovich Suspends FIDE Presidency After EU Sanctions; Anand Named Interim President</li>
        <li><a href="https://www.pravda.com.ua/eng/news/2026/07/24/8045636/" target="_blank" rel="noopener noreferrer">Ukrainska Pravda</a> — FIDE President Arkady Dvorkovich temporarily steps aside over EU sanctions</li>
        <li><a href="https://thefederal.com/category/sports/viswanathan-anand-assumes-interim-fide-presidency-after-dvorkovich-steps-down-over-eu-sanctions-251217" target="_blank" rel="noopener noreferrer">The Federal</a> — Viswanathan Anand assumes interim FIDE presidency</li>
      </ul>
    `),
  },

  // -------------------------------------------------------------------
  {
    slug: "india-squad-chess-olympiad-2026-samarkand",
    title: "India Names Squads for the 46th Chess Olympiad in Samarkand",
    excerpt:
      "Gukesh, Praggnanandhaa and Arjun Erigaisi headline the open team while Humpy, Vaishali and Divya Deshmukh lead the women's side as India defends both Olympiad golds in Uzbekistan.",
    category: "Olympiad",
    read_time_min: 5,
    is_featured: false,
    cover_gradient: "from-emerald-500 to-teal-700",
    published_at: "2026-07-24T11:00:00Z",
    body: html(`
      <h2>Defending champions in both sections</h2>
      <p>India has announced its squads for the 46th Chess Olympiad, to be held in Samarkand, Uzbekistan,
      from 15 to 27 September 2026. Both Indian teams travel as defending champions, having swept gold in
      the open and women's sections at the 45th Olympiad in Budapest in 2024 — the first time the country
      had won both titles at the same edition.</p>

      <h2>The open team</h2>
      <p>World champion D Gukesh, R Praggnanandhaa and Arjun Erigaisi headline the open roster, joined by
      Nihal Sarin and Vidit Gujrathi. Srinath Narayanan continues as captain.</p>
      <p>It is a lineup with continuity at its core: the same names that carried India to gold in Budapest
      form the spine of the squad again, now with a reigning world champion on board rather than a
      challenger-in-waiting.</p>

      <h2>The women's team</h2>
      <p>Koneru Humpy, Vaishali Rameshbabu and Divya Deshmukh lead the women's section, with Vantika Agrawal
      and Savitha Shri B completing the five. Grandmaster Swayams Mishra takes on the coach and captain role
      for the women's team.</p>
      <p>Humpy brings the deepest championship experience of any player in either squad, while Vaishali and
      Divya Deshmukh represent the generation that has pushed Indian women's chess into regular contention
      at the top of world events.</p>

      <h2>Why Samarkand matters</h2>
      <p>The Olympiad is chess's largest team event, drawing national squads from across the FIDE membership
      for a two-week Swiss competition. For India the 2026 edition carries an added weight: it is the first
      time the country will defend a double Olympiad title, and it takes place in a region where Uzbekistan
      — winners of the open section in 2022 — will be among the strongest home challengers.</p>
      <p>The event also falls between two other major fixtures on the 2026 calendar: the Total Chess World
      Championship Tour pilot in Budapest in November, and the World Championship match later the same month.</p>

      <h2>How the Olympiad works</h2>
      <p>The Chess Olympiad is a biennial team championship organised by FIDE and is the largest event in the
      sport by participation, with national federations from across the world entering squads. Teams field
      four players per round with a fifth in reserve, and the competition is decided over a Swiss-system
      tournament rather than a knockout, with match points determining the final standings.</p>
      <p>India's climb through that format has been quick. When the country hosted the 2022 Olympiad in
      Chennai it took bronze in the women's section and a further bronze in the open through its second team,
      India B, then converted that into gold in both sections at Budapest in 2024. Koneru Humpy, the most experienced player in either 2026 squad, was the second woman in history
      to cross the 2600 rating mark and has been a fixture near the top of women's chess for two decades.</p>

      <h2>India's squads at a glance</h2>
      <h3>Open</h3>
      <ul>
        <li>D Gukesh</li>
        <li>R Praggnanandhaa</li>
        <li>Arjun Erigaisi</li>
        <li>Nihal Sarin</li>
        <li>Vidit Gujrathi</li>
        <li>Captain: Srinath Narayanan</li>
      </ul>
      <h3>Women</h3>
      <ul>
        <li>Koneru Humpy</li>
        <li>Vaishali Rameshbabu</li>
        <li>Divya Deshmukh</li>
        <li>Vantika Agrawal</li>
        <li>Savitha Shri B</li>
        <li>Coach and captain: Swayams Mishra</li>
      </ul>

      <h2>Key takeaways</h2>
      <ul>
        <li>The 46th Chess Olympiad runs 15–27 September 2026 in Samarkand, Uzbekistan.</li>
        <li>India defends gold in both the open and women's sections.</li>
        <li>Gukesh, Praggnanandhaa and Arjun Erigaisi lead the open team under captain Srinath Narayanan.</li>
        <li>Humpy, Vaishali and Divya Deshmukh lead the women's team, coached and captained by Swayams Mishra.</li>
        <li>India's double gold in Budapest 2024 was the first such sweep in the country's history.</li>
      </ul>

      <h2>Frequently asked questions</h2>
      <h3>When and where is the 2026 Chess Olympiad?</h3>
      <p>The 46th Chess Olympiad runs from 15 to 27 September 2026 in Samarkand, Uzbekistan.</p>
      <h3>Who is in India's open team?</h3>
      <p>D Gukesh, R Praggnanandhaa, Arjun Erigaisi, Nihal Sarin and Vidit Gujrathi, captained by Srinath
      Narayanan.</p>
      <h3>Who is in India's women's team?</h3>
      <p>Koneru Humpy, Vaishali Rameshbabu, Divya Deshmukh, Vantika Agrawal and Savitha Shri B, with
      Swayams Mishra as coach and captain.</p>
      <h3>Is India defending a title?</h3>
      <p>Yes — both of them. India won gold in the open and women's sections at the 45th Olympiad in
      Budapest in 2024, the first time the country had swept both titles.</p>

      <p>Related reading:
      <a href="/news/firouzja-wins-quantbox-chennai-grand-masters-2026">Gukesh's difficult week at the Chennai Grand Masters</a>
      and <a href="/news/gukesh-sindarov-world-championship-2026-dates">the confirmed World Championship dates</a>.</p>

      <h3>Sources</h3>
      <ul>
        <li><a href="https://theprint.in/sport/gukesh-praggnanandhaa-vaishali-to-spearhead-indian-challenge-in-chess-olympiad/2995789/" target="_blank" rel="noopener noreferrer">The Print</a> — Gukesh, Praggnanandhaa, Vaishali to spearhead Indian challenge in Chess Olympiad</li>
        <li><a href="https://khelnow.com/chess/india-team-fide-chess-olympiad-202607" target="_blank" rel="noopener noreferrer">Khel Now</a> — D Gukesh headlines as India announce team for Chess Olympiad 2026</li>
        <li><a href="https://www.prameyanews.com/india-announces-star-studded-squad-for-2026-chess-olympiad-in-uzbekistan" target="_blank" rel="noopener noreferrer">Prameya News</a> — India announces squad for 2026 Chess Olympiad in Uzbekistan</li>
      </ul>
    `),
  },

  // -------------------------------------------------------------------
  {
    slug: "total-chess-world-championship-tour-budapest-pilot",
    title: "Budapest to Host Pilot of the FIDE-Approved Total Chess World Championship Tour",
    excerpt:
      "A new multi-format circuit developed by Norway Chess and approved by FIDE holds its pilot event in Budapest in November 2026, with Magnus Carlsen among the players expected.",
    category: "Federation",
    read_time_min: 5,
    is_featured: false,
    cover_gradient: "from-sky-500 to-blue-700",
    published_at: "2026-07-22T10:00:00Z",
    body: html(`
      <h2>A new circuit, tested in Budapest first</h2>
      <p>Budapest will host the official pilot of the Total Chess World Championship Tour from 10 to 21
      November 2026. The tour is a new elite circuit developed by Norway Chess and approved by FIDE, and the
      Hungarian event is designed to run the full championship format, regulations and prize structure before
      the circuit proper begins.</p>
      <p>The pilot takes place at the Anantara New York Palace Budapest Hotel and is expected to gather leading
      male and female players, including world number one Magnus Carlsen.</p>

      <h2>What makes the format different</h2>
      <p>Most elite tournaments settle on a single time control and crown a winner within it. The Total Chess
      format does the opposite: it scores players across three disciplines and rewards the competitor who
      handles all of them best.</p>
      <h3>The three disciplines</h3>
      <ul>
        <li><strong>Blitz</strong> — the fastest of the three, placing a premium on speed and instinct.</li>
        <li><strong>Rapid</strong> — quick enough to force decisions, slow enough to punish tactical oversights.</li>
        <li><strong>Fast Classic</strong> — the deepest control in the format, retaining strategic substance.</li>
      </ul>
      <p>Performances across all three are combined, and the cumulative result determines the overall champion.
      The stated intention is to reward versatility, consistency and adaptability rather than specialisation
      in one speed of the game.</p>

      <h2>What follows the pilot</h2>
      <p>The inaugural global season is scheduled to begin in March 2027. It will comprise multiple tournaments
      across international host cities, and will conclude with the crowning of a FIDE World Combined Champion.</p>
      <p>Budapest's role, then, is a full-scale rehearsal rather than an exhibition: the same rules and prize
      structure that will govern the 2027 season are being run in competitive conditions first.</p>

      <h2>The organiser behind it</h2>
      <p>Norway Chess, which developed the tour, has run an annual super-tournament in Stavanger since 2013
      and is among the more experiment-friendly organisers at the elite level, having introduced scoring
      variations and armageddon tiebreaks into a classical event. Applying that appetite to an entire
      circuit — and securing FIDE approval for it — is a considerably larger step.</p>
      <p>The move also reflects a broader shift in professional chess. Faster time controls have taken an
      increasing share of elite play and audience attention over the past decade, and new formats and
      circuits have appeared alongside the traditional classical calendar. A combined-format champion is an
      attempt to settle competitively, rather than rhetorically, which player handles the full range of the
      game best.</p>

      <h2>Why Budapest</h2>
      <p>The Hungarian capital has a long association with elite chess and hosted the 45th Chess Olympiad in
      2024, the edition at which India swept both team golds. Staging the pilot there places the launch of a
      new format in a city with recent experience of running a major international chess event.</p>

      <h2>Key takeaways</h2>
      <ul>
        <li>The Total Chess World Championship Tour pilot runs 10–21 November 2026 in Budapest.</li>
        <li>The circuit was developed by Norway Chess and is approved by FIDE.</li>
        <li>Players are scored across Blitz, Rapid and Fast Classic, with cumulative results deciding the champion.</li>
        <li>Magnus Carlsen is among the players expected to take part.</li>
        <li>The first full season begins in March 2027 and will crown a FIDE World Combined Champion.</li>
      </ul>

      <h2>Frequently asked questions</h2>
      <h3>What is the Total Chess World Championship Tour?</h3>
      <p>A new elite circuit developed by Norway Chess and approved by FIDE. Instead of settling on one time
      control, it scores players across Blitz, Rapid and Fast Classic, with cumulative results deciding the
      champion.</p>
      <h3>When and where is the pilot event?</h3>
      <p>Budapest, from 10 to 21 November 2026, at the Anantara New York Palace Budapest Hotel.</p>
      <h3>Is Magnus Carlsen playing?</h3>
      <p>The world number one is among the players expected at the pilot, which is set to gather leading male
      and female competitors.</p>
      <h3>When does the full circuit begin?</h3>
      <p>The inaugural global season is scheduled to start in March 2027, running across multiple host cities
      and concluding with the crowning of a FIDE World Combined Champion.</p>

      <p>Related reading:
      <a href="/news/anand-interim-fide-president-dvorkovich-suspends-duties">the change of leadership at FIDE</a>
      and <a href="/news/gukesh-sindarov-world-championship-2026-dates">the 2026 World Championship match</a>.</p>

      <h3>Sources</h3>
      <ul>
        <li><a href="https://www.fide.com/where-chess-history-meets-its-future-budapest-to-launch-a-new-era-in-chess-with-total-chess-world-championship-tour-pilot/" target="_blank" rel="noopener noreferrer">FIDE</a> — Budapest to launch a new era in chess with Total Chess World Championship Tour Pilot</li>
        <li><a href="https://www.chessbase.in/news/budapest-to-host-official-pilot-of-the-fide-approved-total-chess-world-championship-tour" target="_blank" rel="noopener noreferrer">ChessBase India</a> — Budapest to Host Official Pilot of the FIDE-Approved Total Chess World Championship Tour</li>
        <li><a href="https://en.chessbase.com/post/budapest-to-launch-total-chess" target="_blank" rel="noopener noreferrer">ChessBase</a> — Budapest to launch Total Chess</li>
        <li><a href="https://ianslive.in/budapest-to-launch-new-era-in-chess-with-official-pilot-of-total-chess-world-championship--20260721193208" target="_blank" rel="noopener noreferrer">IANS</a> — Budapest to launch new era in chess with official pilot of Total Chess World Championship</li>
      </ul>
    `),
  },

  // -------------------------------------------------------------------
  {
    slug: "bodhana-sivanandan-breaks-world-age-record",
    title: "Bodhana Sivanandan, 11, Breaks a 38-Year-Old World Age Record",
    excerpt:
      "The Harrow schoolgirl became the youngest girl to defeat a grandmaster rated above 2600, beating French champion Marc'Andria Maurizzi and surpassing a mark set by Judit Polgár.",
    category: "Juniors",
    read_time_min: 4,
    is_featured: false,
    cover_gradient: "from-amber-500 to-rose-700",
    published_at: "2026-07-25T08:00:00Z",
    body: html(`
      <h2>A record that had stood since the 1980s</h2>
      <p>Bodhana Sivanandan, aged 11 years and four months, has become the youngest girl ever to defeat a
      grandmaster rated above 2600. The result breaks a mark set by Judit Polgár, who achieved the feat at
      the age of 12 — a record that had stood for 38 years.</p>
      <p>Sivanandan beat Marc'Andria Maurizzi, the 19-year-old French champion rated 2628, in the opening round
      of the Dole Trophy in Aix-en-Provence. Maurizzi is also the 2023 World Under-20 champion.</p>

      <h2>Not her first age record</h2>
      <p>The Harrow-based player has form at the same event. She scored her first Woman Grandmaster norm at
      the age of 10 at the Dole Open in 2025 — itself a world age record at the time.</p>
      <p>After seven rounds of this year's edition she had scored 3½ points and remained in contention for a
      second WGM norm.</p>

      <h2>Britain's number one</h2>
      <p>Sivanandan is already the highest-rated female player in Britain, a position confirmed by the English
      Chess Federation. That she holds it at eleven is the detail that has drawn international attention: the
      gap between her age and the standard of opposition she is now beating has closed far faster than is
      typical even among strong juniors.</p>

      <h2>Context: why beating a 2600 matters</h2>
      <p>A rating above 2600 places a player comfortably inside the world's leading few hundred competitors.
      Wins against that level are rare for any junior, and rarer still in classical time controls where
      preparation and endgame technique tend to favour the more experienced player. Maurizzi, as a reigning
      national champion and former world junior champion, is not a nominal grandmaster but an active elite
      one.</p>

      <h2>The record she broke</h2>
      <p>Judit Polgár, whose mark stood for 38 years, is widely regarded as the strongest female player in
      the history of the game. She reached a peak rating above 2700 and entered the world's top ten, and in
      2002 became the first woman to beat a reigning world number one in competitive play when she defeated
      Garry Kasparov in a rapid game at the Russia versus the Rest of the World match in Moscow. She never
      competed in the women's world championship cycle, choosing to play open events throughout her career.</p>
      <p>Records of this kind are measured by the age at which a result is achieved rather than by the result
      alone, which is why a single first-round win can displace a benchmark that has stood for decades. The
      WGM norms Sivanandan is accumulating are the qualifying performances required for the Woman Grandmaster
      title, which players generally earn by combining three norms with a rating threshold.</p>

      <h2>Key takeaways</h2>
      <ul>
        <li>Sivanandan is 11 years and four months old.</li>
        <li>She is the youngest girl to beat a grandmaster rated over 2600.</li>
        <li>The previous record belonged to Judit Polgár, set at age 12, 38 years ago.</li>
        <li>Her opponent, Marc'Andria Maurizzi, is rated 2628 and is the French champion.</li>
        <li>She had 3½/7 at the Dole Trophy and was in contention for a second WGM norm.</li>
      </ul>

      <h2>Frequently asked questions</h2>
      <h3>What record did Bodhana Sivanandan break?</h3>
      <p>The record for the youngest girl to defeat a grandmaster rated above 2600, previously held by Judit
      Polgár, who did so at 12.</p>
      <h3>Who did she beat?</h3>
      <p>Marc'Andria Maurizzi of France, rated 2628 — the French champion and 2023 World Under-20 champion.</p>
      <h3>Where did it happen?</h3>
      <p>In round one of the Dole Trophy in Aix-en-Provence, France.</p>

      <p>Related reading:
      <a href="/news/india-squad-chess-olympiad-2026-samarkand">the squads heading to the Samarkand Olympiad</a>.</p>

      <h3>Sources</h3>
      <ul>
        <li><a href="https://www.englishchess.org.uk/bodhana-sivanandan-becomes-britains-no-1-female-player/" target="_blank" rel="noopener noreferrer">English Chess Federation</a> — Bodhana Sivanandan Becomes Britain's No. 1 Female Player</li>
        <li><a href="https://en.chessbase.com/post/britain-s-no-1-female-player-is-just-eleven-years-old" target="_blank" rel="noopener noreferrer">ChessBase</a> — Britain's No.1 female player is just eleven years old</li>
        <li><a href="https://harrowonline.org/2026/07/25/harrow-chess-prodigy-11-breaks-world-record-after-defeating-french-champion/" target="_blank" rel="noopener noreferrer">Harrow Online</a> — Harrow chess prodigy, 11, breaks world record after defeating French champion</li>
        <li><a href="https://www.tbsnews.net/sports/11-year-old-bodhana-sivanandan-breaks-38-year-old-chess-record-victory-over-french" target="_blank" rel="noopener noreferrer">The Business Standard</a> — 11-year-old Bodhana Sivanandan breaks 38-year-old chess record</li>
      </ul>
    `),
  },

  // -------------------------------------------------------------------
  {
    slug: "gukesh-sindarov-world-championship-2026-dates",
    title: "FIDE Confirms Dates for the Gukesh–Sindarov World Championship Match",
    excerpt:
      "The 2026 World Chess Championship between defending champion D Gukesh and challenger Javokhir Sindarov is scheduled for 23 November to 17 December 2026.",
    category: "World Championship",
    read_time_min: 4,
    is_featured: false,
    cover_gradient: "from-violet-500 to-indigo-700",
    published_at: "2026-07-21T12:00:00Z",
    body: html(`
      <h2>The match is set</h2>
      <p>The 2026 World Chess Championship will be played from 23 November to 17 December 2026, with defending
      champion D Gukesh of India facing challenger Javokhir Sindarov of Uzbekistan.</p>
      <p>Sindarov earned the right to challenge by winning the 2026 Candidates Tournament, held from 28 March
      to 16 April in Pegeia, Cyprus, at the Cap St Georges Hotel and Resort.</p>

      <h2>A generational match</h2>
      <p>The pairing has been widely described as the youngest contest for the world title in the event's
      history, with both players reported to be 20 years old at the start of the match. Gukesh became the
      youngest undisputed world champion when he won the title, and Sindarov arrives having come through one
      of the strongest Candidates fields assembled in recent cycles.</p>

      <h2>Gukesh's form going in</h2>
      <p>The champion's recent classical form has been mixed. At the Quantbox Chennai Grand Masters in July he
      finished last of eight players on 2/7, losing three games and 13.9 rating points, a result that dropped
      him to 31st on the live rating list. That tournament came four months before the championship match is
      due to begin, and well before the 46th Chess Olympiad in September, where he is named in India's open
      squad.</p>
      <p>Reading too much into a single event would be premature — but the Chennai result is the most recent
      classical evidence available ahead of the title defence.</p>

      <h2>How both players got here</h2>
      <p>Gukesh won the title in 2024, defeating Ding Liren of China in a match decided in its final game, and
      became the youngest undisputed world champion in the history of the event at 18. He had qualified by
      winning the 2024 Candidates Tournament, itself a record at the time for the youngest player to do so.</p>
      <p>Sindarov comes from an Uzbek generation that has already reshaped team chess. Born on 8 December
      2005, he earned the grandmaster title in 2018 at 12 years, 10 months and 8 days — the second-youngest
      in history at the time, behind only Sergey Karjakin. He won the 2025 FIDE World Cup in Goa, and his
      federation took the open section of the 2022 Chess Olympiad in Chennai, the result that announced
      Uzbekistan as a serious force at the top of the game. His Candidates victory in Cyprus earned him this
      challenge.</p>

      <h2>What has not been confirmed</h2>
      <p>As of publication, sources consulted for this report did not state a confirmed host city for the
      match. Prize fund and match regulations were likewise not specified in the material reviewed. Those
      details are normally published by FIDE closer to the event.</p>

      <h2>Timeline of the 2026 cycle</h2>
      <ul>
        <li><strong>28 March – 16 April 2026</strong> — Candidates Tournament, Pegeia, Cyprus.</li>
        <li><strong>April 2026</strong> — Javokhir Sindarov wins and becomes challenger.</li>
        <li><strong>15–27 September 2026</strong> — 46th Chess Olympiad, Samarkand; Gukesh named in India's squad.</li>
        <li><strong>23 November – 17 December 2026</strong> — World Championship match.</li>
      </ul>

      <h2>Key takeaways</h2>
      <ul>
        <li>The match runs 23 November to 17 December 2026.</li>
        <li>D Gukesh defends the title against Javokhir Sindarov.</li>
        <li>Sindarov qualified by winning the Candidates in Cyprus in spring 2026.</li>
        <li>It is billed as the youngest world championship match on record.</li>
        <li>A host city had not been confirmed in the sources consulted.</li>
      </ul>

      <h2>Frequently asked questions</h2>
      <h3>When is the 2026 World Chess Championship?</h3>
      <p>From 23 November to 17 December 2026.</p>
      <h3>Who is challenging Gukesh?</h3>
      <p>Javokhir Sindarov of Uzbekistan, who won the 2026 Candidates Tournament in Pegeia, Cyprus, held from
      28 March to 16 April.</p>
      <h3>Where will the match be played?</h3>
      <p>A host city had not been confirmed in the sources consulted for this report. FIDE normally announces
      the venue, prize fund and match regulations closer to the event.</p>
      <h3>Why is the match considered historic?</h3>
      <p>It has been widely reported as the youngest contest for the world title in the event's history, with
      both players reported to be 20 years old at the start of the match.</p>

      <p>Related reading:
      <a href="/news/firouzja-wins-quantbox-chennai-grand-masters-2026">Gukesh's result at the Chennai Grand Masters</a>
      and <a href="/news/india-squad-chess-olympiad-2026-samarkand">India's Olympiad squad</a>.</p>

      <h3>Sources</h3>
      <ul>
        <li><a href="https://uz.kursiv.media/en/2026-05-01/fide-confirms-date-for-world-chess-championship-match-between-gukesh-and-sindarov/" target="_blank" rel="noopener noreferrer">Kursiv</a> — FIDE Confirms Date for World Chess Championship Match Between Gukesh and Sindarov</li>
        <li><a href="https://en.wikipedia.org/wiki/World_Chess_Championship_2026" target="_blank" rel="noopener noreferrer">Wikipedia</a> — World Chess Championship 2026 (for cycle dates and Candidates result)</li>
        <li><a href="https://shop.worldchess.com/blogs/news/fide-candidates-tournament-2026-in-cyprus" target="_blank" rel="noopener noreferrer">World Chess Shop</a> — FIDE Candidates Tournament 2026: Dates, Venue, Players</li>
      </ul>
    `),
  },
];

async function main() {
  console.log(`Seeding ${ARTICLES.length} news articles...\n`);
  let ok = 0;

  for (const a of ARTICLES) {
    const row = {
      ...a,
      published: true,
      author_name: AUTHOR,
    };

    const { error } = await supabase.from("news_articles").upsert(row, { onConflict: "slug" });

    if (error) {
      console.error(`  FAILED  ${a.slug} — ${error.message}`);
    } else {
      const words = a.body
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter(Boolean).length;
      console.log(`  ok      ${a.slug}  (~${words} words)`);
      ok++;
    }
  }

  console.log(`\nDone: ${ok}/${ARTICLES.length} articles published.`);
  if (ok > 0) {
    console.log("Verify at /news (signed out) — published articles are publicly readable.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
