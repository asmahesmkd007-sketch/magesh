import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Read .env manually
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
});

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(url, key);

const content = `# ♞ CHESS OX · Fair Play & Anti‑Cheating Policy
**Version 1.0 | Effective: June 2026**  
*Zero Tolerance – Protecting Integrity of Every Game*  
\`contact@chessox.com\` | \`help@chessox.com\`

---

## ♟️ Our Commitment to Fair Play
Chess is a game of pure intellect, strategy, and skill. At Chess OX, every player deserves a level playing field. Cheating — engine assistance, collusion, or manipulation — betrays the community. This policy sets clear rules, detection methods, sanctions, and appeals. **Zero tolerance applies**: engine assistance, match fixing, and collusion are treated as serious violations regardless of stakes or intent.

---

## Article 1 – Scope & Application
**1.1 Who it applies to:** Every registered user (all game modes).  
**1.2 What it covers:** Rated/unrated games, all tournaments, puzzles, leaderboard activities, and off-platform conduct affecting integrity.  
**1.3 Relationship:** This policy prevails over other policies on fair play matters.

---

## Article 2 – Prohibited Conduct (Complete List)
- **2.1 Engine & Computer assistance:** Running any chess engine (Stockfish, Leela, etc.), AI tools, browser extensions, second device analysis, or streaming to accomplice.
- **2.2 External resources:** Opening books, databases, endgame tablebases, internet search, physical notes during a live game.
- **2.3 Third‑party assistance:** Help from stronger players, voice/video calls, allowing others to play on your account, remote desktop.
- **2.4 Collusion & match fixing:** Pre‑arranged results, deliberately losing, manipulating tournament standings, accepting compensation.
- **2.5 Rating manipulation:** Sandbagging (losing to lower rating), rating farming, win trading, abusing provisional rating.
- **2.6 Disconnection & time manipulation:** Deliberate disconnects to avoid loss, exploiting grace period, VPN lag manipulation, clock running down intentionally.
- **2.7 Platform exploitation:** Bugs/glitches, automated scripts, manipulating developer tools, altering game data.

> ✅ **What is NOT cheating:** Studying openings/endgames before/after games, engine analysis after completion, coach preparation between rounds, using memorised opening prep.

---

## Article 3 – Detection Methods
- **3.1 Move correlation:** Comparison with top engine suggestions across multiple depths; unusual correlation flags review.
- **3.2 Move time analysis:** Abnormal timing patterns (consistent duration regardless of complexity) suggest engine use.
- **3.3 Behavioural patterns:** Sudden rating jumps, near‑engine accuracy streaks, win‑rate anomalies.
- **3.4 Statistical analysis:** Probability models calibrated against human games at all rating levels.
- **3.5 Connectivity & device analysis:** Multi‑account detection, abnormal disconnect patterns, automated interactions.
- **3.6 Community reports:** In‑game report button or email; reports trigger priority review but always independently verified.
- **3.7 FIDE referral:** Confirmed cases from FIDE‑rated events may be referred to FIDE Fair Play Commission.

---

## Article 4 – Investigation Process
- **Stage 1 – Automated flagging:** System flags suspicious games/accounts (player not notified).
- **Stage 2 – Fair Play Committee review:** ≥2 members independently review engine scores, time analysis, history, etc.
- **Stage 3 – Consensus decision:** No finding, Warning, or Confirmed Cheating.
- **Stage 4 – Notification:** Email to player with finding, affected games, sanctions, and appeal rights.
- **Stage 5 – Sanctions applied** (Article 5).
- **Stage 6 – Appeals window** (14 days).

⏱️ *Timeline: Review within 7 days (complex up to 21 days); decision notification within 48h.*

---

## Article 5 – Sanctions & Penalties

| Violation | First Offence | Second Offence | Third+ Offence |
| :--- | :--- | :--- | :--- |
| **Engine/AI assistance (tournament)** | Disqualification + 60‑day ban + rating correction | Permanent ban | Permanent ban |
| **Engine/AI assistance (casual game)** | 30‑day ban + rating correction | 90‑day ban + rating correction | Permanent ban |
| **Collusion / match fixing** | Disqualification + 90‑day ban | Permanent ban | Permanent ban |
| **Third‑party assistance (human)** | Disqualification + 30‑day ban | 60‑day ban | Permanent ban |
| **Sandbagging (proven)** | Rating correction + formal warning | 30‑day ban + rating correction | 90‑day ban |
| **Rating farming / win trading** | Rating correction + 30‑day ban | 90‑day ban | Permanent ban |
| **Deliberate disconnection (pattern)** | Formal warning + game forfeits | 14‑day ban | 60‑day ban |
| **Platform / technical exploitation** | 14‑day ban + reversal of results | 60‑day ban | Permanent ban |
| **False / malicious cheating report** | Formal warning | 14‑day ban | 60‑day ban |
| **Multi‑account (same tournament)** | Disqualification of all accounts | 60‑day ban | Permanent ban |

**5.1 Automatic consequences:** Forfeiture of affected games, rating correction, prize forfeiture, permanent record on account.  
**5.2 Tournament specific:** Disqualification, standings adjustment, prize recovery.  
**5.3 Permanent ban criteria:** Second engine offence, collusion in prize tournament, threatening staff, egregious conduct.  
**5.4 Enhanced monitoring:** 6 months after any non‑permanent ban.

---

## Article 6 – Appeals Process
**Right to appeal:** Within 14 days of sanction notification. Submit to \`help@chessox.com\` with subject: \`Fair Play Appeal - [username] - [reference number]\`. Include username, reference, finding disputed, explanation, supporting evidence.

📢 **Appeals Panel:** Two senior staff not involved in original decision. Review data + new evidence. Outcomes: (a) Appeal Upheld → reversal, sanctions removed; (b) Partially Upheld → sanction reduced; (c) Dismissed → finding confirmed. Decision within 14 days of submission. Sanctions remain in effect during appeal; fully reversed if upheld.

*External rights: Players retain right to approach consumer forums/courts under Indian law, but technical findings remain proprietary.*

---

## Article 7 – Reporting Suspected Cheating
**How to report:** In‑game Report button (flag icon) OR email \`contact@chessox.com\` with subject "Fair Play Report". Include username, game ID, date, description.  
**Confidentiality:** Reporter never disclosed.  
**False reports:** Sanctions apply (see penalty table).  
**Collusion evidence:** Send to \`contact@chessox.com\` marked URGENT.

---

## Article 8 – Special Rules for Tournaments
- **Heightened standards:** All tournament games automatically reviewed. Prize distribution may be paused up to 30 days.
- **Live intervention:** Player may be removed mid‑tournament if evidence conclusive.
- **Prize withholding:** Pending investigation.
- **Account security responsibility:** You are liable for activity on your account even if unauthorised access occurs.

---

## Article 9 – Player Responsibilities & Best Practices
- **Best practices:** Use strong password, close chess software before games, report cheating via official channels (never public accusations), keep environment clean.
- **Shared devices:** You are responsible for engines running on shared devices.
- **Coaching:** Pre‑game and post‑game allowed; coaching during live games is cheating.

---

## Article 10 – Policy Updates & Governing Law
- **Updates:** Material changes notified 14 days in advance. Continued use = acceptance.
- **Governing law:** Laws of India, exclusive jurisdiction Chennai.
- **Contact:** For fair play concerns: \`contact@chessox.com\` (reports, enquiries) and \`help@chessox.com\` (appeals).

---

## 📞 Fair Play Contact Points

| Purpose | Contact |
| :--- | :--- |
| Report suspected cheating (game) | In-game Report button or \`contact@chessox.com\` |
| Collusion / match fixing evidence | \`contact@chessox.com\` — mark URGENT |
| Fair play appeals | \`help@chessox.com\` — subject: Fair Play Appeal |
| General fair play questions | \`contact@chessox.com\` |
| Tournament fair play (live event) | \`contact@chessox.com\` — mark URGENT TOURNAMENT |

> ⚖️ **Zero Tolerance – Final Word:** Chess OX is dedicated to protecting the integrity of chess. Every player deserves a fair opponent. Help us by playing honestly, securing your account, and reporting genuine concerns through official channels.

<br>

*Chess OX Fair Play & Anti‑Cheating Policy | Version 1.0 | Effective June 2026*  
*Phoenix Brothers | Tamil Nadu, India | contact@chessox.com | chessox.com*`;

async function main() {
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('policies')
      .select('id, version')
      .eq('policy_type', 'fair-play')
      .order('version', { ascending: false })
      .limit(1);

    let nextVersion = 1;
    if (existing && existing.length > 0) {
      nextVersion = existing[0].version + 1;
      
      // Update all to unpublished first
      await supabase
        .from('policies')
        .update({ is_published: false })
        .eq('policy_type', 'fair-play');
    }

    const { error: insertErr } = await supabase
      .from('policies')
      .insert({
        policy_type: 'fair-play',
        title: 'Fair Play & Anti-Cheating Policy',
        content: content,
        version: nextVersion,
        is_published: true
      });

    if (insertErr) {
      console.error("Failed to insert policy:", insertErr);
      process.exit(1);
    }
    
    console.log("Successfully published Fair Play Policy to DB!");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
