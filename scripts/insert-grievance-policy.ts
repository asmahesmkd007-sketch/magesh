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
## Contact & Grievance Policy — How to Reach Us · SLAs · Escalation · Grievance Officer

**Version 1.0 | Effective: June 2026**  
*IT Act 2000 | IT Rules 2021 | Consumer Protection Act 2019 | PDPP Act 2023*  
Operated by Phoenix Brothers | Tamil Nadu, India | chessox.com

---

## At a Glance

| Topic | Summary |
| :--- | :--- |
| **Two contact emails** | \`contact@chessox.com\` (general) and \`help@chessox.com\` (support & escalation) |
| **Response commitment** | All emails acknowledged within 48 hours, 7 days a week. |
| **Resolution SLAs** | Login/account: 48h. Billing: 5 days. Bugs: ack 24h. Security: 12h. |
| **Grievance Officer** | Mandatory under IT Rules 2021. Contact: \`help@chessox.com\`. Resolution: 30 days. |
| **3-tier escalation** | Tier 1: \`contact@chessox.com\`. Tier 2: \`help@chessox.com\`. Tier 3: Consumer Forum / CDRC. |
| **Consumer rights** | National Consumer Helpline: 1800-11-4000. CDRC under Consumer Protection Act 2019. |
| **Data / privacy complaints** | Email \`contact@chessox.com\`. Escalate to Data Protection Board of India (DPDP Act 2023). |
| **Language & hours** | English primary; Tamil support on request. Email 24/7; processing Mon-Fri 10 AM–6 PM IST. |

> 🎯 **Our Commitment:** Chess OX is committed to resolving every genuine concern raised by users promptly, fairly, and transparently.

---

## 1 - Contact Information

**📧 \`contact@chessox.com\` (General Contact)**  
Use for: General enquiries, billing & refunds, privacy/data requests, fair play reports, policy questions, tournament enquiries, legal notices, partnership & press.

**🛠️ \`help@chessox.com\` (Support and Escalation)**  
Use for: Account access/login issues, wallet queries, technical problems, escalation of unresolved issues, Grievance Officer complaints, fair play appeals, account suspension queries, urgent security issues.

### Company & Operational Details

| Company Name | Phoenix Brothers |
| :--- | :--- |
| **Platform** | Chessox.com |
| **Registered Office** | Tamil Nadu, India |
| **Operating Hours** | Email received 24/7. Processed Monday to Friday, 10:00 AM – 6:00 PM IST (excluding public holidays) |
| **Language** | English (primary). Tamil support available on request — state your preference in email. |

---

## Section 2 - Issue Categories & Response Commitments (SLA)

| Category | Issue Types | First Response | Target Resolution | Contact |
| :--- | :--- | :--- | :--- | :--- |
| **Account and Login** | Password reset, email verification, recovery, profile issues | Within 48h | 24-48h | \`help@chessox.com\` |
| **Billing and Payments** | Wallet charges, billing errors, duplicate payments | Within 24h | 3-5 business days | \`contact@chessox.com\` |
| **Refund Requests** | 7-day refund, billing error refund, tournament entry refund | Within 48h | 5-7 business days after approval | \`contact@chessox.com\` |
| **Technical / Platform Bugs** | Game errors, feature not working, display issues | Within 24h | Acknowledged with fix timeline | \`help@chessox.com\` |
| **Security and Account Safety** | Compromise, unauthorised access | Within 12h | Priority — immediate action | \`help@chessox.com\` |
| **Fair Play Reports** | Suspected cheating, engine use, collusion | Within 24h | Investigation: 7-21 days | \`contact@chessox.com\` |
| **Privacy and Data** | Access, correction, deletion, DPDP requests | Within 48h | Within 30 days | \`contact@chessox.com\` |
| **Tournament Issues** | Registration, pairings, results, prizes | Within 48h | 3-5 business days | \`contact@chessox.com\` |
| **Grievance / Formal Complaint** | Unresolved Tier 1, policy disputes | Within 48h | Within 30 days | \`help@chessox.com\` |
| **General Enquiry** | Feedback, suggestions, partnership, press | Within 48h | Best effort | \`contact@chessox.com\` |

*SLA Commitment: Maximum targets. Security issues urgent, high-volume periods may extend timelines with notification.*

---

## Section 3 - How to Contact Us Effectively
Always include Chess OX username, registered email, clear description, date of issue.

- **Billing/Refund:** transaction ID, amount, supporting evidence → \`contact@chessox.com\` subject \`Billing Enquiry - [username]\`.
- **Security urgent:** \`help@chessox.com\` subject \`URGENT - Account Security - [username]\`.
- **Privacy/Data (DPDP Act):** \`Data Request - [type] - [username]\` to \`contact@chessox.com\`, include proof of identity.
- **Fair Play reports:** in-game Report button or email \`contact@chessox.com\` with game ID & opponent.
- **Tournament:** \`Tournament - [name] - [username]\`, add URGENT for live issues.

---

## Section 4 - Three-Tier Escalation Process
- **TIER 1 Standard Support:** \`contact@chessox.com\` or \`help@chessox.com\`. Follow SLAs. Most issues resolved here.
- **TIER 2 Grievance Officer:** \`help@chessox.com\`, subject \`Grievance - [username] - [Tier 1 ref]\`. Acknowledged 48h, resolved within 30 days.
- **TIER 3 External:** Consumer Helpline 1800-11-4000, CDRC, or Data Protection Board of India (for privacy).

---

## Section 5 - Designated Grievance Officer (IT Rules 2021)
**Organisation:** Phoenix Brothers | **Platform:** Chessox.com | **Email:** \`help@chessox.com\` (Subject: \`Grievance - [username] - [issue]\`)  
**Address:** Tamil Nadu, India | **Availability:** Mon-Fri 10 AM–6 PM IST | **Acknowledgment:** 48h | **Resolution:** 30 days.

The Grievance Officer handles unresolved billing, account suspension appeals, fair play appeals, privacy complaints, and any formal complaint. Tier 1 must be attempted first (except security/legal emergencies).

- **Submission requirements:** full name, username, registered email, Tier 1 reference (or explanation), issue description, desired resolution, supporting docs.
- **Extensions:** complex cases up to +15 calendar days with prior notice.

---

## Section 6 - External Escalation and Consumer Rights

| External Body | Jurisdiction / Use Case | Contact / Access |
| :--- | :--- | :--- |
| **National Consumer Helpline** | Billing, service quality, refunds (Consumer Protection Act 2019) | 1800-11-4000 (toll-free) |
| **Consumer Online Resource (CORE)** | Online filing of consumer complaints | consumerhelpline.gov.in |
| **District/State/NCDRC** | Claims up to Rs 50 lakh / up to Rs 2 cr / above Rs 2 cr | edaakhil.nic.in / ncdrc.nic.in |
| **Data Protection Board of India** | Privacy complaints under DPDP Act 2023 | meity.gov.in (when operational) |
| **Courts of Chennai, Tamil Nadu** | Legal proceedings under Indian law | Exclusive jurisdiction per Terms |

*E-Daakhil Portal: edaakhil.nic.in – recommended first step before approaching CDRC physically.*

---

## Section 7 - Legal Notices & Special Enquiries
- **Legal Notices:** \`contact@chessox.com\`, subject \`Legal Notice - [subject]\`. Acknowledged 48h, response 14 days.
- **Media/Press:** \`contact@chessox.com\` subject \`Press - [publication] - [topic]\`. Response within 3 business days.
- **Partnership:** \`contact@chessox.com\` subject \`Partnership - [type]\`.
- **Accessibility requests:** \`help@chessox.com\` stating requirement.
- **Minor Users (13-17):** Parents email \`help@chessox.com\` subject \`Parent - Account Issue - [child's username]\` with proof. Under 13: urgent account closure.

---

## Section 8 - User Conduct in Communications
**Expected:** Respectful, accurate, constructive.  
**Unacceptable:** abusive/threatening language, false info, duplicate spamming. Chess OX may limit support access for persistent misconduct. Communications recorded & retained min. 2 years for compliance.

---

## Section 9 - Policy Governance and Updates
- **Updates:** Material changes (Grievance Officer details, escalation) notified 14 days in advance via email & platform notice.
- **Governing law:** Republic of India; exclusive jurisdiction: Courts of Chennai, Tamil Nadu.

---

## Complete Contact Directory

| Purpose | Email / Contact | Subject Line to Use |
| :--- | :--- | :--- |
| General enquiries | \`contact@chessox.com\` | \`General - [topic] - [username]\` |
| Billing and refund requests | \`contact@chessox.com\` | \`Billing Enquiry - [username]\` |
| Refund request | \`contact@chessox.com\` | \`Refund Request - [username]\` |
| Fair play report | \`contact@chessox.com\` | \`Fair Play Report - [opponent]\` |
| Privacy / data request | \`contact@chessox.com\` | \`Data Request - [type] - [username]\` |
| Grievance / formal complaint | \`help@chessox.com\` | \`Grievance - [username] - [issue]\` |
| Account / technical support | \`help@chessox.com\` | As per issue (e.g., Account Help) |
| Legal notice | \`contact@chessox.com\` | \`Legal Notice - [subject matter]\` |

<br>

*Chess OX Contact & Grievance Policy | Version 1.0 | Effective: June 2026*  
*Phoenix Brothers | Tamil Nadu, India | contact@chessox.com | help@chessox.com | chessox.com*  
*Governed by laws of India | Jurisdiction: Courts of Chennai, Tamil Nadu | Compliant with IT Act 2000, IT Rules 2021, Consumer Protection Act 2019, DPDP Act 2023.*`;

async function main() {
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from("policies")
      .select("id, version")
      .eq("policy_type", "grievance")
      .order("version", { ascending: false })
      .limit(1);

    let nextVersion = 1;
    if (existing && existing.length > 0) {
      nextVersion = existing[0].version + 1;

      // Update all to unpublished first
      await supabase
        .from("policies")
        .update({ is_published: false })
        .eq("policy_type", "grievance");
    }

    const { error: insertErr } = await supabase.from("policies").insert({
      policy_type: "grievance",
      title: "Contact & Grievance Policy",
      content: content,
      version: nextVersion,
      is_published: true,
    });

    if (insertErr) {
      console.error("Failed to insert policy:", insertErr);
      process.exit(1);
    }

    console.log("Successfully published Grievance Policy to DB!");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
