import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Read .env manually
const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, "");
});

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(url, key);

const content = `# CHESS OX
## Privacy Policy — How We Collect · Use · Store · Protect · Share Your Personal Data

**Version 2.0 | Effective: June 2026**  
*PDPP Act 2023 (India) | IT Act 2000 | Consumer Protection Act 2019*  
Operated by Phoenix Brothers | Tamil Nadu, India | chessox.com

---

## At a Glance

| Topic | Summary |
| :--- | :--- |
| **What we collect** | Name, email, username, IP address, device/browser info, gameplay data |
| **Why we collect it** | To operate your account, run tournaments, process payments, improve platform, send service communications |
| **Who we share it with** | Payment processors, hosting providers, analytics tools, law enforcement when legally required. We never sell your data. |
| **How long we keep it** | Account data: 90 days after deletion. Transaction records: up to 7 years for legal/tax compliance. |
| **Your rights** | Access, correct, erase, restrict, port your data. Opt out of marketing. Withdraw consent. File a complaint. |
| **Minimum age** | 13 years. Parental consent for 13-17. Cash prize features restricted to 18+. |
| **Cookies** | Essential always on. Analytics and marketing only with explicit consent. |
| **Contact** | \`contact@chessox.com\` | Response within 48h | Resolution within 30 days |

> **Legal Basis:** Compliance with India's Digital Personal Data Protection (DPDP) Act, 2023; IT Act 2000 & IT Rules 2011; Consumer Protection Act 2019. EU/UK users also benefit from GDPR-aligned rights.

---

## 1 - Who We Are and How to Contact Us
Chessox.com is operated by Phoenix Brothers, Tamil Nadu, India. We are the Data Fiduciary under DPDP Act 2023.

| Contact Type | Details |
| :--- | :--- |
| **Company Name** | Phoenix Brothers |
| **Platform** | Chessox.com |
| **Registered Address** | Tamil Nadu, India |
| **General Support** | \`help@chessox.com\` |
| **Privacy and Data Requests** | \`contact@chessox.com\` |
| **Grievance Officer** | \`help@chessox.com\` (Response: 48 hours | Resolution: 30 days) |
| **Tournaments** | \`contact@chessox.com\` |
| **Website** | https://www.chessox.com |

**Data Protection Contact:** For all privacy requests (access, correction, deletion, complaints): \`contact@chessox.com\`. Acknowledged within 48h, full response within 30 days. Escalate to Grievance Officer at \`help@chessox.com\` if unresolved.

---

## Section 2 - What Personal Data We Collect
**2.1 Account Registration Data**
Username, email address, hashed password, country (optional), date of birth (age verification).

**2.2 Profile and Gameplay Data**
Chess rating & history, games played, tournament participation, puzzle scores, friends/clan memberships, in-platform messages, chat history, profile picture/bio. Game records (PGN) stored permanently.

**2.3 Transaction Data**
Transaction IDs, billing history, payment dates. We do NOT store full card numbers, CVV, or bank account details.

**2.4 Technical and Device Data**
IP address, browser/OS, device type, screen resolution, referring URL, pages visited, timestamps.

**2.5 Communications Data**
Support emails, survey responses, feedback — retained up to 2 years for quality assurance.

> **Data we do NOT collect:** precise location, biometrics, health data, racial/ethnic origin, political/religious beliefs. No facial recognition. No data selling.

---

## Section 3 - Why We Use Your Data (Legal Bases)

| Purpose | Data Used | Legal Basis |
| :--- | :--- | :--- |
| **Create and manage account** | Registration, profile data | Contract |
| **Provide gameplay & tournaments** | Gameplay, rating data | Contract |
| **Communicate about your account** | Email, account data | Contract / Legal obligation |
| **Detect cheating & fraud** | Gameplay, IP, device data | Legitimate interest / Legal obligation |
| **Platform security & abuse prevention** | IP, technical data | Legitimate interest |
| **Improve platform performance** | Technical, anonymised gameplay | Legitimate interest |
| **Send marketing communications** | Email, name | Consent (opt-in) |
| **Comply with legal obligations** | All relevant data | Legal obligation |
| **Tax & financial record-keeping** | Payment/transaction data | Legal obligation (Income Tax Act) |

---

## Section 4 - Cookies and Tracking Technologies

| Cookie Type | Purpose | Can Be Disabled? |
| :--- | :--- | :--- |
| **Essential / Functional** | Login sessions, authentication, security tokens, language | No (platform won't work) |
| **Analytics** | Usage stats, feature performance, error tracking (anonymised) | Yes – via Cookie Settings |
| **Marketing / Personalisation** | Promotional content preferences (explicit consent) | Yes – Cookie Settings or opt-out |
| **Third-Party** | Payment provider scripts, analytics SDKs | Partially (essential payment scripts cannot be disabled) |

**Managing preferences:** Cookie consent banner on first visit; update via Cookie Settings in footer or browser settings. Consent stored for 12 months.

---

## Section 5 - How Long We Keep Your Data

| Data Category | Retention Period | Reason |
| :--- | :--- | :--- |
| **Account registration data** | Duration of account + 90 days after deletion | Service provision |
| **Game records (PGN)** | Indefinitely (anonymised after deletion) | Platform archive & statistics |
| **Chat and messages** | 2 years | Dispute resolution |
| **Payment transactions** | 7 years | Income Tax Act 1961 (India) |
| **Support communications** | 2 years | Quality assurance |
| **IP and access logs** | 90 days | Security monitoring |
| **Anti-cheat investigation data** | 5 years | Platform integrity |
| **Marketing consent records** | 3 years from last consent | DPDP Act compliance |
| **Deleted account data** | 90 days in backup, then purged | Recovery window |

**Account Deletion:** Within 90 days, identifiable data removed from active systems. Transaction/tax records retained for 7 years as required by law, but not used for marketing.

---

## Section 6 - Who We Share Your Data With

| Recipient | What We Share | Why |
| :--- | :--- | :--- |
| **Payment Processors (Razorpay, UPI)** | Transaction ID, amount | Process payments & prize disbursements |
| **Cloud Hosting Provider** | Encrypted user data, game records | Hosting & data storage |
| **Analytics Provider** | Anonymised usage data, page views | Performance monitoring & improvement |

**6.1 International Data Transfers**
Operated from India. If accessing outside India, data may be transferred to India. Appropriate safeguards (standard contractual clauses) applied for cross-border transfers.

---

## Section 7 - Children's Privacy
- **Minimum age:** 13 years. Users under 13 not permitted; accounts discovered will be suspended and data deleted within 48h.
- **Ages 13-17:** Require verifiable parental consent. Restricted from cash prize tournaments. No marketing profiling without explicit parental consent.
- **Parental access:** Parents/guardians may request access/correction/deletion of child's data via \`contact@chessox.com\` with proof of relationship.

---

## Section 8 - How We Protect Your Data
- **Encryption:** TLS 1.2+ in transit; bcrypt hashing for passwords.
- **Access controls:** Need-to-know basis, confidentiality obligations.
- **Payment security:** PCI-DSS compliant providers; Chess OX never stores card details.
- **Incident response:** Data breach notification within 72 hours to affected users and authority.
- **Your responsibility:** Use strong unique password; enable 2FA; contact \`help@chessox.com\` if compromised.

---

## Section 9 - Your Data Rights (PDPP Act & GDPR aligned)
- **Access** Request summary of data, purposes, third-party recipients. Free of charge within 30 days.
- **Correction** Update inaccurate/incomplete data via Account Settings or \`contact@chessox.com\`.
- **Erasure** Request deletion of personal data; processed within 90 days (subject to legal retention).
- **Restrict processing** While accuracy or lawfulness is disputed.
- **Data portability** Receive your data in structured machine-readable format (JSON/CSV).
- **Withdraw consent** Unsubscribe from marketing, update cookie settings, or email.
- **Object** Object to processing based on legitimate interests.
- **Complain** To Grievance Officer first, then Data Protection Board of India or CDRC.

*EU/UK users: Benefit from GDPR/UK GDPR rights, including right to lodge complaint with ICO or local supervisory authority.*

---

## Section 10 - Marketing Communications
**Consent-based marketing:** Only send promotional emails with explicit opt-in. Opt out anytime via Unsubscribe link, Account Settings, or email \`contact@chessox.com\` (subject "Unsubscribe").

**Transactional communications** (cannot opt out while active): registration, payment receipts, security alerts, policy updates.

---

## Section 11 - Third-Party Links and Services
Links to external sites (social media, payment portals) are subject to their own privacy policies; Chess OX not responsible.

---

## Section 12 - India PDPP Act 2023 Compliance Statement
**Data Fiduciary:** Phoenix Brothers ensures lawfulness, fairness, transparency. **Consent management:** free, specific, informed consent for marketing/cookies. **Data Principal rights:** fully facilitated. **Grievance redressal:** Grievance Officer at \`help@chessox.com\` (ack 48h, resolution 30d). **Data processor obligations:** contractually enforced security measures.

---

## Section 13 - Changes to This Privacy Policy
**Material changes:** email notification + platform notice 14 days in advance. **Minor changes:** website update without advance notice. Previous versions available on request.

---

## Section 14 - Contact Us and How to Complain

| Contact Purpose | Details |
| :--- | :--- |
| **General Privacy Questions** | \`contact@chessox.com\` (response within 48h) |
| **Data Access / Correction / Erasure** | \`contact@chessox.com\` (resolution within 30 days) |
| **Unsubscribe from Marketing** | \`contact@chessox.com\` with subject "Unsubscribe" |
| **Grievance Officer (escalation)** | \`help@chessox.com\` (resolution within 30 days) |
| **Data Breach Report** | \`contact@chessox.com\` (priority response) |
| **Postal Address** | Phoenix Brothers, Tamil Nadu, India |

📌 **Escalation Path:**  
Step 1: \`contact@chessox.com\` (48h response, 30d resolution)  
Step 2: Grievance Officer at \`help@chessox.com\`  
Step 3: Data Protection Board of India (once operational), National Consumer Helpline 1800-11-4000, or CDRC under Consumer Protection Act 2019. EU/UK users may contact local supervisory authority (e.g., ICO).

<br>

*Chess OX Privacy Policy | Version 2.0 | Effective: June 2026*  
*Phoenix Brothers | Tamil Nadu, India | contact@chessox.com | chessox.com*  
*This document reflects compliance with DPDP Act 2023, IT Act 2000, and Consumer Protection Act 2019.*`;

async function main() {
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from("policies")
      .select("id, version")
      .eq("policy_type", "privacy")
      .order("version", { ascending: false })
      .limit(1);

    let nextVersion = 1;
    if (existing && existing.length > 0) {
      nextVersion = existing[0].version + 1;

      // Update all to unpublished first
      await supabase.from("policies").update({ is_published: false }).eq("policy_type", "privacy");
    }

    const { error: insertErr } = await supabase.from("policies").insert({
      policy_type: "privacy",
      title: "Privacy Policy",
      content: content,
      version: nextVersion,
      is_published: true,
    });

    if (insertErr) {
      console.error("Failed to insert policy:", insertErr);
      process.exit(1);
    }

    console.log("Successfully published Privacy Policy to DB!");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
