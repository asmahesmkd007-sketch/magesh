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

const content = `# ♟️ CHESS OX · Refund Policy
**Version 2.0 | Effective: June 2026**  
Operated by Phoenix Brothers | Tamil Nadu, India  
\`contact@chessox.com\` | \`help@chessox.com\` | \`chessox.com\`

---

## 📋 At a Glance

- ✅ **7-Day Guarantee**: Full refund within 7 days of FIRST-EVER deposit if wallet features not substantially used.
- 🧾 **Billing errors**: Full refund for duplicate charges, incorrect amounts, or charges after confirmed cancellation.
- ⛔ **After 7 days**: No refund for change of mind, forgotten cancellations, or partial month use.
- ⏱️ **Processing time**: Approved refunds processed in 5-7 business days. Bank may take 3-5 extra days.
- 📧 **How to request**: Email \`contact@chessox.com\` with transaction ID. Response within 48h.
- 🎟️ **Tournament fees**: Non-refundable once tournament starts. Full refund if Chess OX cancels.
- ⚖️ **Chargebacks**: Raise issues with us first. Fraudulent chargebacks may result in account suspension.
- 🇮🇳 **Consumer rights**: Indian users may contact NCDRC helpline \`1800-11-4000\` if unresolved.

> 🎯 **Our Commitment:** Chess OX aims to resolve all refund requests fairly and promptly. Please contact us before initiating a chargeback.

---

## 1. Scope of This Policy
Applies to all payments on Chessox.com (Phoenix Brothers, Tamil Nadu). Covers tournament entry fees, wallet deposits, and other transactions. Governed by Indian law including Consumer Protection Act, 2019.

- **Covers**: tournament fees, deposits, promotional plans.
- **Does not cover**: game result disputes, ratings, account suspension, or non-billing technical issues.

---

## 3. Billing Error Refunds
Full refund for any verified billing error, subject to 30-day reporting window.

| Billing Error Type | Description | Refund |
| :--- | :--- | :--- |
| **Duplicate charge** | Two or more charges for same transaction | Full refund of duplicate amount(s) |
| **Incorrect amount charged** | Amount doesn’t match displayed price | Difference refunded |
| **Payment processed but access not granted** | Debited but features not activated | Full refund or access granted |
| **Technical platform error** | Verified Chess OX error caused incorrect charge | Full refund of incorrect amount |

**How to report:** Email \`contact@chessox.com\` with 'Billing Error Report', include username, transaction ID, date/amount, error description, supporting evidence. Acknowledged within 24h, investigation within 5 business days, refund 5-7 business days after confirmation.

**Reporting window:** Within 30 calendar days of erroneous charge. Reports after 30 days reviewed at discretion.

---

## 4. Non-Refundable Situations
- Cancellation after 7-day window (no billing error)
- Change of mind after 7 days
- Dissatisfaction with accurately described features
- Device/internet/software issues on your side
- Account suspension due to policy violation
- Tournament entry fees after tournament commenced

**Change of mind:** Review features before depositing; no refund outside 7-day guarantee.  
**Account violations (cheating/harassment):** no refund for remaining wallet balance.  
**Feature dissatisfaction:** 'coming soon' features not grounds for refund.  
**Significant feature removal without notice?** contact us, reviewed individually.

---

## 5. Tournament Entry Fee Refunds

| Situation | Refund Status | How to Claim |
| :--- | :--- | :--- |
| **Chess OX cancels tournament before start** | Full refund | Automatic within 7 business days |
| **Chess OX postpones tournament** | Full refund or transfer to rescheduled event | Contact \`contact@chessox.com\` |
| **Player withdraws 24+ hours before start** | Entry fee credit for future tournament | Email \`contact@chessox.com\` |
| **Player withdraws less than 24hrs before** | No refund | N/A |
| **Tournament starts - player does not join** | No refund | N/A |
| **Tournament cancelled mid-event** | Prorated refund based on rounds completed | Automatic within 7 business days |
| **Billing error on entry fee** | Full refund | Email \`contact@chessox.com\` with transaction ID |

**Entry fee credits:** Valid for 90 days, non-transferable, no cash value.  
**Free tournament events:** no refunds; if incorrectly charged, contact immediately.

---

## 6. How to Request a Refund
1. **Prepare your information:** Chess OX username, Transaction ID (from payment email or Account Settings > Billing History), date/amount, reason for refund, supporting evidence.
2. **Email \`contact@chessox.com\`** from registered email address. Subject: \`Refund Request - [your username]\`. Include all details.
3. Receive acknowledgement within 48 hours with reference number.
4. Investigation period (standard 3 business days, billing errors up to 5 days).
5. Refund decision sent via email with approval/decline explanation.
6. Refund processed within 5-7 business days after decision to original payment method. Bank may add 3-5 days.

⚠️ **Required for all requests:** username | transaction ID | date & amount | reason | supporting evidence | registered email sent to \`contact@chessox.com\`

---

## 7. Refund Timelines

| Stage | Timeline |
| :--- | :--- |
| Acknowledgement of request | Within 48 hours |
| Standard refund investigation | Within 3 business days |
| Billing error investigation | Within 5 business days |
| Refund decision | Included in investigation completion |
| Processing by Chess OX | 5-7 business days after approval |
| Credit reflected by bank | Additional 3-5 business days |
| **Maximum total (approx)** | **15-18 business days** |

💳 **Refunds returned to original payment method.** If original method inactive, contact us before requesting.

---

## 8. Chargebacks & Payment Disputes
**Contact us first!** Email \`contact@chessox.com\` before chargeback. Our billing team resolves within 3-5 business days faster than banks. Legitimate billing concerns = no account impact.

**Fraudulent chargebacks:** permanently suspend account, contest chargeback, pursue recovery. A chargeback does not entitle you to retain access.

**Legitimate chargebacks:** If we don't respond within timelines, you may contact timelines, you may contact your bank. We cooperate fully and no account suspension for valid chargeback due to our failure.

---

## 9. Escalation & Consumer Rights
**Internal escalation:** Reply to decision email with \`Refund Escalation - [username]\` or email \`help@chessox.com\` with reference number. Senior team review within 7 business days.

**Consumer Protection Act, 2019:** Nothing in this policy restricts your rights. Unresolved dispute? Contact National Consumer Helpline: \`1800-11-4000\` (Mon-Sat 9:30 AM - 5:30 PM IST) or file complaint at \`consumerhelpline.gov.in\`. Approach Consumer Disputes Redressal Commission (District/State/National) based on claim value.

**GST refunds:** GST component refunded, revised invoice/credit note provided upon request.

📌 **Escalation Path:**
1️⃣ \`contact@chessox.com\` → 48h response, 5-7 biz days resolution.  
2️⃣ \`help@chessox.com\` (senior review) → 7 business days.  
3️⃣ National Consumer Helpline: \`1800-11-4000\` / \`consumerhelpline.gov.in\`  
4️⃣ Consumer Disputes Redressal Commission (CDRC) under CP Act 2019.  

---

## 10. Contact Information

| Purpose | Contact |
| :--- | :--- |
| Refund requests & billing error reports | \`contact@chessox.com\` |
| Escalation & senior review | \`help@chessox.com\` |
| General account support | \`help@chessox.com\` |
| Tournament entry fee refunds | \`contact@chessox.com\` |
| GST invoice & documentation | \`contact@chessox.com\` |

**Postal address:** Phoenix Brothers, Tamil Nadu, India  
**Platform:** https://www.chessox.com  

<br>

*Chess OX Refund Policy | Version 2.0 | Effective: June 2026*  
*Phoenix Brothers | Tamil Nadu, India | Compliant with Consumer Protection Act, 2019 of India.*`;

async function main() {
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('policies')
      .select('id, version')
      .eq('policy_type', 'refund')
      .order('version', { ascending: false })
      .limit(1);

    let nextVersion = 1;
    if (existing && existing.length > 0) {
      nextVersion = existing[0].version + 1;
      
      // Update all to unpublished first
      await supabase
        .from('policies')
        .update({ is_published: false })
        .eq('policy_type', 'refund');
    }

    const { error: insertErr } = await supabase
      .from('policies')
      .insert({
        policy_type: 'refund',
        title: 'Refund Policy',
        content: content,
        version: nextVersion,
        is_published: true
      });

    if (insertErr) {
      console.error("Failed to insert policy:", insertErr);
      process.exit(1);
    }
    
    console.log("Successfully published Refund Policy to DB!");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
