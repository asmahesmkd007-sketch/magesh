// =====================================================================
// POLICY FALLBACK CONTENT
// ---------------------------------------------------------------------
// The policy pages read their text from the `policies` table. When that
// read returns nothing — the row has not been published yet, or the
// request is anonymous and RLS blocks it — the page used to render
// "This policy has not been published yet", which is a dead end for
// visitors and a hard blocker for ad-network and app-store reviews.
//
// These documents are the baseline shown in that case. A published row
// in the database ALWAYS wins: this is a fallback, never an override,
// so the admin policy editor keeps working exactly as before.
//
// Text is written in the same lightweight markdown the ContentRenderer
// already understands (#/##/### headings, - lists, **bold**), so the
// pages render with their existing styling and no new components.
//
// NOTE FOR MAINTAINERS: these describe how ChessOx actually operates
// today. They are not a substitute for review by a qualified lawyer in
// your jurisdiction before launch, and they intentionally state no
// company registration number, registered office or governing court —
// add those through the admin policy editor once confirmed.
// =====================================================================
import type { PolicyType } from "@/lib/api/policyClient";

export const POLICY_CONTACT_EMAIL = "contact@chessox.com";

/** Shown under the title on fallback documents so the date is never fabricated. */
export const POLICY_FALLBACK_NOTE =
  "This is the current operating policy for ChessOx. If anything here is unclear, or you need a clarification in writing, email " +
  POLICY_CONTACT_EMAIL +
  " and we will respond.";

type FallbackPolicy = { title: string; content: string };

export const POLICY_FALLBACKS: Record<PolicyType, FallbackPolicy> = {
  privacy: {
    title: "Privacy Policy",
    content: `## Who we are

ChessOx is an online chess platform. You can play chess online, solve chess puzzles, learn the game, join tournaments and take part in a chess community. This policy explains what information we collect when you use ChessOx, why we collect it, and the control you have over it.

Questions about this policy, or about your data: **${POLICY_CONTACT_EMAIL}**

## Information we collect

**Information you give us**

- Account details: your email address, username and password. Passwords are stored only as salted hashes — we never see or store your plain password.
- Profile details you choose to add: display name, avatar image, country, state and district.
- Content you create: community posts, comments, chat messages, club (clan) names and descriptions, feedback and support messages.
- Payment-related details, only if you use the wallet: withdrawal requests and the bank details you enter for a payout, plus any identity documents you submit for verification.

**Information created as you play**

- Game records: moves, results, ratings, time controls and opponents.
- Puzzle and training activity, streaks and scores.
- Tournament entries and standings.
- Online/offline presence so friends can see when you are available.

**Information collected automatically**

- Basic technical data needed to serve the site securely, such as your IP address, browser type and device type.
- Cookies and local browser storage, described below.

## How we use your information

We use your information to:

- create and secure your account, and sign you in;
- run chess games fairly, including validating moves on the server and calculating ratings;
- operate puzzles, tournaments, leaderboards, clubs and the community feed;
- detect and act on cheating, abuse and fraud;
- process wallet transactions and withdrawal requests where you have asked for them;
- send you service email such as sign-in codes, password resets and important account notices;
- respond to your support requests and feedback;
- fix bugs and improve how the product works.

We do not sell your personal information.

## Cookies and similar technologies

ChessOx uses cookies and browser local storage for:

- **Essential purposes** — keeping you signed in and keeping your session secure. The site cannot work without these.
- **Preferences** — remembering settings such as your board theme, piece set and sound choices.
- **Advertising** — see the section below.

You can clear or block cookies in your browser settings. If you block essential cookies you will not be able to stay signed in.

## Advertising

ChessOx may show advertising, including ads served by Google.

- Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this or other websites.
- Google's use of advertising cookies enables it and its partners to serve ads to you based on your visit to ChessOx and other sites on the internet.
- You can opt out of personalised advertising by visiting Google Ads Settings at https://www.google.com/settings/ads
- You can opt out of some third-party vendors' use of cookies for personalised advertising at https://www.aboutads.info/choices/

Where required by law, we ask for your consent before setting non-essential advertising cookies.

## Who we share information with

We share information only where it is necessary to run the service:

- **Service providers.** We use Supabase for database hosting, authentication and real-time features, and an email delivery provider to send transactional email such as sign-in codes. These providers process data on our instructions.
- **Advertising and font providers.** Ad partners as described above, and Google Fonts, which serves the site's typefaces.
- **Other players.** Your username, avatar, ratings, game results, leaderboard position and anything you post publicly are visible to other users. Your email address is never shown to other players.
- **Legal reasons.** We may disclose information if we are legally required to, or to protect the rights, safety and property of ChessOx and our users.

## How long we keep information

We keep your account information for as long as your account exists. Game records, ratings and tournament results are kept as part of the competitive history of the platform. Records connected to payments are kept for as long as applicable financial and tax rules require. When you delete your account we remove or anonymise personal information that we are not required to keep.

## Your rights and choices

Depending on where you live, you may have the right to:

- access the personal information we hold about you;
- correct information that is wrong or incomplete;
- ask us to delete your account and personal information;
- object to or restrict certain processing;
- receive a copy of your information in a portable format;
- withdraw consent where our use is based on consent.

Many of these you can do yourself in your account settings. For anything else, email **${POLICY_CONTACT_EMAIL}** and we will act on your request within the time the law allows.

## Children

ChessOx is not directed at children under 13, and we do not knowingly collect personal information from them. If you believe a child under 13 has given us personal information, contact us and we will delete it. Where local law sets a higher age of digital consent, that higher age applies.

## Security

We protect your data with encryption in transit, hashed passwords, row-level access rules on our database, server-side validation of every game move, and rate limiting. No online service can promise perfect security, but we work to keep your account and your data safe, and we will tell you if a breach affects you.

## International transfers

Our service providers may process data in countries other than your own. Where that happens we rely on the safeguards those providers offer for international transfers.

## Changes to this policy

If we change this policy we will update the version and date shown on this page. Significant changes will be announced in the product.

## Contact

For any privacy question or request, email **${POLICY_CONTACT_EMAIL}**.`,
  },

  terms: {
    title: "Terms & Conditions",
    content: `## Agreement

These terms govern your use of ChessOx, an online chess platform for playing chess, solving puzzles, learning the game, entering tournaments and taking part in a chess community. By creating an account or using the site you agree to these terms. If you do not agree, please do not use ChessOx.

Questions: **${POLICY_CONTACT_EMAIL}**

## Your account

- You must give accurate information when you register and keep it up to date.
- You are responsible for everything that happens under your account, and for keeping your password secure.
- One person, one account. Extra accounts used to inflate rating, farm rewards or evade a restriction are not allowed.
- You must be old enough to form a binding contract where you live, and at least 13 years old. Where local law sets a higher age, that age applies.
- Tell us immediately at ${POLICY_CONTACT_EMAIL} if you think someone else is using your account.

## Using ChessOx

You agree not to:

- use chess engines, databases or any outside assistance in games where it is not permitted;
- manipulate results, ratings, leaderboards or tournaments, including sandbagging and result-fixing;
- harass, threaten, impersonate or abuse other players;
- post content that is illegal, hateful, sexually explicit, or that infringes someone else's rights;
- use bots, scrapers or automated tools against the service, or attempt to break, overload or reverse-engineer it;
- attempt to access accounts, data or areas of the platform that are not yours.

Fair play is covered in detail in our Fair Play & Anti-Cheating Policy, and conduct in our Community Policy. Both form part of these terms.

## Your content

You keep ownership of what you post. By posting on ChessOx you give us a non-exclusive, worldwide, royalty-free licence to host, store and display that content so we can operate the service. You are responsible for what you post, and you confirm you have the right to post it. We may remove content that breaks these terms or the law.

## Games, ratings and results

Games are validated on our servers, and the server record is the authoritative result. Ratings, leaderboard positions and tournament standings are calculated by our systems. We may correct ratings and results where a game was affected by cheating, abuse or a technical fault.

## Coins, wallet, premium and payouts

- Some features use in-platform coins and an account wallet. Coins are a virtual item for use inside ChessOx and have no value outside the platform.
- Some tournaments have entry requirements and prizes. The rules shown on a tournament apply to that tournament.
- Premium membership is an optional paid subscription. What each plan includes is shown on the Premium page.
- Withdrawals of eligible balances are covered by our Withdrawal Policy and may require identity verification.
- Refunds are covered by our Refund Policy.

Nothing on ChessOx is an investment, and we make no promise of winnings or earnings.

## Availability and changes

We work to keep ChessOx running, but we do not promise uninterrupted or error-free service. We may add, change, suspend or remove features, and we may carry out maintenance. Where a change materially reduces something you have paid for, we will tell you.

## Suspension and termination

We may restrict, suspend or close an account that breaks these terms, our fair-play rules or the law, or where required to protect other users or the platform. You can stop using ChessOx and close your account at any time. Where an account is closed for a serious breach, related balances and prizes may be withheld.

## Disclaimers and liability

ChessOx is provided "as is" and "as available". To the maximum extent the law allows, we exclude implied warranties, and we are not liable for indirect or consequential loss, lost profits, or loss of data. Nothing in these terms limits liability that cannot be limited by law, including for death or personal injury caused by negligence, or for fraud.

## Third-party services

ChessOx relies on third-party providers for hosting, authentication, email delivery, fonts and advertising. Their terms apply to their own services. Links to outside sites are not endorsements, and we are not responsible for their content.

## Changes to these terms

We may update these terms. The version and date on this page show the current edition, and significant changes will be announced in the product. Continuing to use ChessOx after a change means you accept the updated terms.

## Contact

Questions about these terms: **${POLICY_CONTACT_EMAIL}**.`,
  },

  refund: {
    title: "Refund Policy",
    content: `## Scope

This policy covers payments made to ChessOx for premium membership and for coins or other in-platform items. Withdrawals of balances from your wallet are covered separately by our Withdrawal Policy.

## Digital goods

Coins, premium membership and other in-platform items are digital products that are made available to your account immediately. Once they have been delivered and used they are generally not refundable, except where this policy or the law says otherwise.

## When we will refund

We will refund a payment when:

- you were charged more than once for the same purchase;
- you were charged but the item was never delivered to your account;
- a technical fault on our side stopped you from receiving or using what you bought, and we cannot fix it;
- the law where you live gives you a right to cancel and you exercise it within the applicable period.

## When we will not refund

We normally cannot refund:

- coins or items that have already been spent or consumed;
- entry to a tournament that has already started or finished, unless the tournament was cancelled by us;
- an account closed by us for cheating or a serious breach of our terms;
- a change of mind after a digital item has been delivered and used.

## Cancelled tournaments

If we cancel a tournament before it starts, any entry requirement paid for that tournament is returned to the wallet of every entrant.

## How to request a refund

Email **${POLICY_CONTACT_EMAIL}** with:

- the email address on your ChessOx account;
- the date and amount of the payment;
- what you bought;
- a short description of the problem.

We aim to acknowledge refund requests within 3 working days and to decide them within 14 working days. Approved refunds are returned to the original payment method. The time it then takes to appear depends on your bank or payment provider.

## If you disagree with a decision

If you are not satisfied with the outcome, you can escalate it through our Contact & Grievance Policy.`,
  },

  withdrawal: {
    title: "Withdrawal Policy",
    content: `## Scope

This policy explains how eligible balances are withdrawn from a ChessOx wallet to your own bank account.

## Who can withdraw

To request a withdrawal you must:

- have a ChessOx account in good standing, with no open investigation into cheating or abuse;
- have an eligible balance that meets the minimum withdrawal amount shown on the wallet page;
- complete any identity verification we ask for;
- provide bank details that belong to you. We do not pay to third-party accounts.

Coins and promotional or bonus credit are not withdrawable. Only balances marked as withdrawable in your wallet can be paid out.

## Identity verification

Before a first payout, and at other times where we are required to check, we ask for identity verification. This protects against fraud, account takeover and money laundering. We may hold a withdrawal until verification is complete.

## How a withdrawal works

1. Add and confirm your bank details on the wallet page.
2. Request a withdrawal for an amount at or above the minimum.
3. The amount is held while our team reviews the request.
4. Once approved, the payout is sent to your bank account.

Requests are normally reviewed within 3 to 7 working days. After approval, the time for money to reach your account depends on your bank. You can cancel a request yourself while it is still pending, and the amount returns to your wallet.

## When a withdrawal can be refused or held

We may refuse, reverse or hold a withdrawal where:

- the balance came from cheating, collusion, exploiting a bug or another breach of our terms;
- identity verification is incomplete, or the bank details do not match the verified account holder;
- the account is under investigation, or we are legally required to hold the funds;
- the bank details given are wrong or incomplete.

If we refuse a withdrawal we will tell you why, unless the law prevents us from doing so.

## Fees and taxes

Any fee that applies to a withdrawal is shown before you confirm the request. You are responsible for any tax due on amounts you receive, and we may withhold tax where the law requires it.

## Problems and disputes

If a withdrawal is late, missing or incorrect, email **${POLICY_CONTACT_EMAIL}** with the date and amount of the request. Unresolved matters can be escalated through our Contact & Grievance Policy.`,
  },

  community: {
    title: "Community Policy",
    content: `## Why this policy exists

ChessOx has a community feed, club (clan) spaces, chat rooms and direct messages. This policy sets out what is expected from everyone who takes part, so the platform stays a place people want to play and talk in.

It applies everywhere you can be seen by another user: posts, comments, chat, direct messages, usernames, avatars, club names and descriptions.

## What we expect

- **Be civil.** Disagree about chess, not about people.
- **Play the game, not the person.** No insults after a loss, and no gloating after a win.
- **Respect privacy.** Do not share anyone's personal information, including your own.
- **Keep it relevant.** Community spaces are for chess and the people who play it.
- **Use one identity.** Do not impersonate other players, staff or public figures.

## What is not allowed

- Harassment, bullying, threats or targeted abuse.
- Hate speech or slurs based on race, ethnicity, nationality, religion, gender, sexual orientation, disability or any similar characteristic.
- Sexually explicit content, or any sexual content involving minors — this is reported to the authorities.
- Violent extremism, or encouragement of self-harm.
- Spam, scams, phishing, chain messages and repetitive promotional posting.
- Buying, selling, sharing or advertising accounts, ratings, coins or results.
- Sharing engine analysis to help a player during a live game.
- Content that infringes copyright or other rights.
- Anything illegal where you or the people reading it live.

## Chat and direct messages

Direct messages are private between the people in the conversation, but the same rules apply. We do not read private messages routinely; we do review them when they are reported, to investigate abuse.

## Reporting

Use the report option in the product, or email **${POLICY_CONTACT_EMAIL}**. Tell us the username involved, where it happened and what you saw. Reports are treated confidentially. Deliberately false reports are themselves a breach of this policy.

## What we do about breaches

Depending on how serious it is, and whether it has happened before, we may:

- remove the content;
- issue a warning;
- mute an account in community spaces;
- suspend an account temporarily;
- close an account permanently;
- report the matter to law enforcement.

## Appeals

If you think we got a decision wrong, email **${POLICY_CONTACT_EMAIL}** within 30 days with your username and what happened. A different reviewer will look at it and reply. Further escalation is covered by our Contact & Grievance Policy.`,
  },

  "fair-play": {
    title: "Fair Play & Anti-Cheating Policy",
    content: `## Why fair play matters

Every rating, leaderboard place and tournament result on ChessOx is only worth something if the games behind it were played honestly. This policy explains what fair play means here, how we protect it, and what happens when someone breaks it.

## What counts as cheating

- **Engine assistance.** Using a chess engine, an opening book beyond what a game explicitly allows, an endgame tablebase, or any software that suggests or evaluates moves during a game.
- **Outside help.** Getting move suggestions from another person during a game, or playing on someone else's behalf.
- **Account sharing.** Letting another person play on your account, or playing on theirs. This includes "boosting" an account for someone.
- **Sandbagging.** Deliberately losing games to lower your rating and enter events below your strength.
- **Collusion.** Arranging results with an opponent, or coordinating in a tournament to influence standings.
- **Multiple accounts.** Using extra accounts to farm rating, claim rewards more than once, or evade a restriction.
- **Abusing faults.** Exploiting a bug, or deliberately disconnecting and stalling to manipulate a clock or a result.

## What is allowed

- Using the analysis board, opening explorer, puzzles and courses **outside** of a live game.
- Reviewing a finished game with an engine.
- Playing against the computer at any level — these games are clearly marked and are not rated against other players.
- Discussing chess with anyone, as long as it is not about a game you are currently playing.

## How we detect cheating

Every move in an online game is validated on our servers, so results cannot be forged from a browser. Alongside that we review statistical patterns in play, timing behaviour, account signals and reports from other players. We do not publish the details of our detection methods, because that would help people evade them.

## Reports and investigations

If you suspect cheating, report the player in the product or email **${POLICY_CONTACT_EMAIL}** with the username and the game. Do not accuse other players publicly — let us look at it. Investigations are handled privately, and we do not share the details of an investigation into another player's account with you.

## Consequences

Where we conclude an account has cheated, we may:

- adjust or reset ratings and remove affected results;
- remove tournament placings and any prize connected to them;
- withhold or reverse balances gained through the breach;
- suspend the account, or close it permanently.

Serious or repeated cheating normally means permanent closure. Where a closed account holds a balance obtained by cheating, that balance may be withheld.

## Appeals

If you believe a fair-play decision about your account was wrong, email **${POLICY_CONTACT_EMAIL}** from the address registered to the account, within 30 days. Explain your side; we will re-examine the evidence and reply with an outcome. Appeals are reviewed by someone who was not involved in the original decision. Further escalation is covered by our Contact & Grievance Policy.`,
  },

  grievance: {
    title: "Contact & Grievance Policy",
    content: `## How to reach us

The fastest way to reach ChessOx is by email:

- **General support and account help:** ${POLICY_CONTACT_EMAIL}
- **Privacy and data requests:** ${POLICY_CONTACT_EMAIL}
- **Fair play, abuse and safety reports:** ${POLICY_CONTACT_EMAIL}
- **Payments, wallet and withdrawals:** ${POLICY_CONTACT_EMAIL}

You can also send a report or feedback from inside the product using the Report and Feedback pages.

We answer email in the order it arrives, and we aim to acknowledge every message within 3 working days.

## What to include

So we can help without a round of questions, please include:

- the email address or username on your ChessOx account;
- what happened, and when;
- the game, tournament, payment or player involved;
- what outcome you are looking for.

Never send us your password. We will never ask for it.

## Raising a grievance

If something has gone wrong and normal support has not resolved it, you can raise a formal grievance.

**Step 1 — Support.** Email ${POLICY_CONTACT_EMAIL} describing the problem. Most issues are resolved here. We aim to respond within 3 working days.

**Step 2 — Escalation.** If you are not satisfied with the response, reply asking for the matter to be escalated, and include the original reference. The complaint is reviewed by someone who was not involved in the first decision. We aim to complete this review within 15 working days.

**Step 3 — Final response.** We will send you a written outcome explaining the decision and the reasons for it. If we need longer than 15 working days because the matter is complex, we will tell you why and give you a revised date.

## Timelines at a glance

- Acknowledgement of any message: **3 working days**
- Standard support resolution: **7 working days**
- Escalated grievance decision: **15 working days**
- Fair-play and payment appeals: **30 days** from the decision to lodge

## Records

We keep a record of grievances and how they were resolved so we can spot recurring problems and fix the underlying cause.

## If you are still not satisfied

If our final response does not resolve the matter, you keep every right available to you under the consumer protection and data protection law that applies where you live. Nothing in this policy limits those rights.`,
  },
};

/** Returns the built-in document for a policy type. */
export function getPolicyFallback(type: PolicyType): FallbackPolicy | undefined {
  return POLICY_FALLBACKS[type];
}
