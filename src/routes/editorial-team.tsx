// =====================================================================
// EDITORIAL TEAM — author page for ChessOx reporting
// ---------------------------------------------------------------------
// Referenced as `author` by the NewsArticle schema on every news page and
// linked from each article byline. Describes how the desk actually works:
// no invented staff names, credentials or awards.
// =====================================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, Card } from "@/components/site/Primitives";
import {
  seo,
  breadcrumbLd,
  editorialTeamLd,
  webPageLd,
  EDITORIAL_TEAM,
  CONTACT_EMAIL,
} from "@/lib/seo";

export const Route = createFileRoute("/editorial-team")({
  head: () =>
    seo({
      title: "Editorial Team & Standards — ChessOx",
      description:
        "Who writes ChessOx chess news, which sources we use, how results and ratings are verified before publication, and how to request a correction.",
      keywords: ["chess news", "editorial standards", "chess journalism"],
      path: EDITORIAL_TEAM.path,
      jsonLd: [
        editorialTeamLd(),
        webPageLd({
          name: "Editorial Team & Standards — ChessOx",
          description:
            "The ChessOx editorial team, its sourcing and verification standards, and its corrections policy.",
          path: EDITORIAL_TEAM.path,
          primaryTopic: "Editorial standards",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Editorial Team", path: EDITORIAL_TEAM.path },
        ]),
      ],
    }),
  component: EditorialTeamPage,
});

const STANDARDS = [
  [
    "Primary sources first",
    "Results, standings, ratings and dates are taken from FIDE, national federations such as the AICF, official tournament sites, and established chess media including Chess.com and ChessBase. Where those sources disagree, we say so.",
  ],
  [
    "Every figure is checked",
    "Player names, tournament names, venues, dates, ratings, scores and standings are verified against a source before an article is published. Numbers we cannot confirm are left out rather than estimated.",
  ],
  [
    "Nothing is invented",
    "We do not publish invented quotations, made-up statistics, unverified rumours, or claims about features and events that do not exist. Where a detail is unknown — a venue, a prize fund — the article states that it has not been confirmed.",
  ],
  [
    "Reporting is separated from opinion",
    "News reports describe what happened. Where an article contains analysis or judgement, it is written so a reader can tell the difference.",
  ],
  [
    "Sources are cited and linked",
    "Each report ends with the sources it was built from, linked to the original publication so readers can check the reporting for themselves.",
  ],
  [
    "Corrections are made openly",
    "If we get something wrong we correct it and update the article. Corrections can be requested at any time using the contact address below.",
  ],
];

function EditorialTeamPage() {
  return (
    <PageShell
      eyebrow="About our journalism"
      title="Editorial Team & Standards"
      subtitle="How ChessOx reports on competitive chess, and how to hold us to it."
    >
      <div className="mx-auto max-w-3xl space-y-10">
        <section>
          <h2 className="mb-3 font-display text-2xl text-gold">{EDITORIAL_TEAM.name}</h2>
          <p className="leading-relaxed text-ivory/85">
            Chess news on ChessOx is written and edited by the ChessOx editorial team. The desk
            covers elite competitive chess — world championship cycles, the Chess Olympiad,
            classical and rapid super-tournaments, federation decisions, rating movements and the
            results of leading junior players.
          </p>
          <p className="mt-4 leading-relaxed text-ivory/85">
            Articles are published under a team byline rather than an individual one, because
            reporting, fact-checking and editing are handled collectively. Every article names the
            sources it was built from.
          </p>
        </section>

        <section>
          <h2 className="mb-5 font-display text-2xl text-gold">Our standards</h2>
          <div className="space-y-3">
            {STANDARDS.map(([title, detail]) => (
              <div key={title} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <h3 className="font-medium text-gold">{title}</h3>
                <p className="mt-0.5 text-sm text-ivory/80">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl text-gold">Corrections and contact</h2>
          <Card className="p-6">
            <p className="text-sm leading-relaxed text-ivory/85">
              If you spot a factual error in a ChessOx article — a wrong score, rating, date, name
              or standing — tell us and we will check it and correct the article where you are
              right. Email <span className="text-gold">{CONTACT_EMAIL}</span> with a link to the
              article and the detail you believe is wrong.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-ivory/85">
              The same address handles press enquiries and requests for clarification. Our{" "}
              <Link to="/community-policy" className="text-gold hover:underline">
                Community Policy
              </Link>{" "}
              and{" "}
              <Link to="/contact-grievance-policy" className="text-gold hover:underline">
                Contact &amp; Grievance Policy
              </Link>{" "}
              set out how complaints are escalated if you are not satisfied with the response.
            </p>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl text-gold">Read our reporting</h2>
          <p className="text-sm leading-relaxed text-ivory/85">
            Browse the latest{" "}
            <Link to="/news" className="text-gold hover:underline">
              chess news
            </Link>
            , or read the reference guides in{" "}
            <Link to="/about-chess" className="text-gold hover:underline">
              our complete chess guide
            </Link>{" "}
            and the{" "}
            <Link to="/learn" className="text-gold hover:underline">
              beginner's guide to playing chess
            </Link>
            .
          </p>
        </section>
      </div>
    </PageShell>
  );
}
