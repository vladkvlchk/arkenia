import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/shared/ui";

export const metadata: Metadata = {
  title: "Careers — Arkenia",
  description: "Open roles at Arkenia. Every role appears here — there is no hidden pipeline.",
};

interface OpenRole {
  slug: string;
  title: string;
  team: string;
  location: string;
  /** ISO date the role was published. */
  posted: string;
}

/** Publish roles here when hiring begins — the page renders them as a ledger. */
const OPEN_ROLES: OpenRole[] = [];

const CONTACT = "hello@arkenia.xyz";

const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: "Small on purpose",
    body: "More people means more coordination, not more care. We add a person when the work demands another pair of hands — never to look bigger.",
  },
  {
    title: "Everything on the ledger",
    body: "The product moves other people's money, so the defaults are honesty: public contracts, refundable deposits, no fine print. Hiring works the same way — a role is on this page, or it does not exist.",
  },
  {
    title: "Slow is a feature",
    body: "We ship carefully and read everything twice. If that sounds tedious, we are not your team. If it sounds like respect, we would like to hear from you.",
  },
];

export default function CareersPage() {
  return (
    <Container className="py-16 sm:py-20">
      {/* Editorial opener */}
      <div className="max-w-[62ch]">
        <div className="t-overline">Careers</div>
        <h1 className="mt-4 font-serif text-4xl leading-[1.1] tracking-[-0.01em] text-ink">
          Few hands, careful work.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          Arkenia is built by a deliberately small team. Every open role is published on this
          page the day it exists — dated, scoped, and honest about the work.
        </p>
      </div>

      {/* Open roles ledger */}
      <section className="mt-16 max-w-3xl">
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
          <div className="t-overline">Open roles</div>
          <span className="font-mono text-2xl leading-none text-ink" aria-hidden>
            {OPEN_ROLES.length}
          </span>
          <span className="sr-only">{OPEN_ROLES.length} open roles</span>
        </div>

        {OPEN_ROLES.length === 0 ? (
          <div className="relative border-b border-line">
            {/* Unwritten paper — the same quiet lattice the campaign ledger uses for unfilled
                cells — fills the empty side of the page. */}
            <div
              aria-hidden
              className="absolute inset-y-4 right-0 hidden w-2/5 sm:block"
              style={{
                backgroundImage:
                  "radial-gradient(hsl(var(--line-strong) / 0.55) 1px, transparent 1px)",
                backgroundSize: "12px 12px",
              }}
            />
            <div className="relative max-w-[44ch] py-14">
              <p className="font-serif text-xl text-ink">Nothing is open right now.</p>
              <p className="mt-2 text-[13px] leading-5 text-ink-muted">
                We hire rarely and announce it here first. No evergreen postings, no talent
                pools — an empty page means exactly what it says.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-line border-b border-line">
            {OPEN_ROLES.map((role) => (
              <li key={role.slug}>
                <a
                  href={`mailto:${CONTACT}?subject=${encodeURIComponent(`Role: ${role.title}`)}`}
                  className="group flex items-baseline justify-between gap-4 py-5"
                >
                  <div className="min-w-0">
                    <span className="text-[15px] font-semibold text-ink group-hover:underline group-hover:underline-offset-4">
                      {role.title}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink-muted">
                      {role.team} · {role.location}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-ink-subtle">
                    {role.posted}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <a
            href={`mailto:${CONTACT}?subject=${encodeURIComponent("Introduction")}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-ink px-4 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-surface-2"
          >
            Introduce yourself
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
          <p className="text-xs text-ink-subtle">
            Speculative notes are welcome and read by a human — {CONTACT}
          </p>
        </div>
      </section>

      {/* How we work */}
      <section className="mt-16 max-w-3xl sm:mt-20">
        <div className="t-overline">How we work</div>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="grid gap-2 py-6 sm:grid-cols-[200px_1fr] sm:gap-8">
              <dt className="text-[15px] font-semibold text-ink">{p.title}</dt>
              <dd className="max-w-[58ch] text-sm leading-6 text-ink-muted">{p.body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Container>
  );
}
