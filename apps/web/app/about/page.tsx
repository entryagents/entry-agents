import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { SITE_URL } from "@/lib/site";

const title = "About Entry Agents";
const description =
  "Why Entry Agents exists: moving software engineering agents out of fragile browser tabs and local laptops into dedicated cloud workspaces.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    url: "/about",
    title: "About Entry Agents",
    description,
  },
  twitter: {
    title: "About Entry Agents",
    description,
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About Entry Agents",
  description,
  url: `${SITE_URL}/about`,
};

const COMMITMENTS = [
  {
    label: "Proof over prose",
    detail:
      "Agents should verify edits with real compilers, tests, diffs, and browser previews before declaring a task finished.",
  },
  {
    label: "No token markup",
    detail:
      "Every credit dollar maps directly to published provider model rates with prompt caching passed through in full.",
  },
  {
    label: "Work that outlives your tab",
    detail:
      "Engineering tasks take minutes, not milliseconds. Execution belongs on durable server infrastructure, not a brittle laptop socket.",
  },
  {
    label: "You own every commit",
    detail:
      "Your code stays in standard Git branches and pull requests with zero proprietary runtime lock-in.",
  },
] as const;

export default function AboutPage() {
  return (
    <div className="landing min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg)">
      <LandingNav showSignIn />
      <main className="mx-auto max-w-[820px] px-4 pb-24 pt-24 sm:px-6 sm:pt-32 md:pt-36">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />

        <p className="font-mono text-xs text-(--l-fg-3)">About</p>
        <h1 className="mt-3 font-display text-balance text-3xl font-semibold leading-[1.04] tracking-[-0.035em] sm:text-5xl">
          Software agents deserve real machines
        </h1>

        <div className="mt-6 space-y-4 text-base leading-relaxed text-(--l-fg-2)">
          <p>
            Most AI coding tools still behave like autocomplete trapped inside a
            single laptop editor or a stateless chat box. The moment a task
            needs package installs, database migrations, browser checks, or a
            five-minute test suite, your local environment becomes the
            bottleneck.
          </p>
          <p>
            We built Entry Agents so anyone — from solo builders starting on a
            blank idea to teams shipping production pull requests — can hand
            real engineering tasks to agents running on dedicated cloud Linux
            machines and return to verified branches from any device.
          </p>
        </div>

        <section className="mt-14 border-t border-(--l-border) pt-10">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">
            What we optimize for
          </h2>
          <dl className="mt-6 divide-y divide-(--l-border) border-y border-(--l-border)">
            {COMMITMENTS.map((item) => (
              <div
                key={item.label}
                className="grid gap-1.5 py-4 sm:grid-cols-[200px_1fr] sm:gap-6"
              >
                <dt className="text-sm font-semibold text-(--l-fg)">
                  {item.label}
                </dt>
                <dd className="text-sm leading-relaxed text-(--l-fg-2)">
                  {item.detail}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12 flex justify-end">
          <Link
            href="/login"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-(--l-btn-bg) px-4 text-xs font-medium text-(--l-btn-fg) transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
          >
            <span>Start building</span>
            <ArrowRight className="size-3.5" strokeWidth={1.5} />
          </Link>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
