import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";

const title = "Terms of Service";
const description =
  "Terms governing account access, cloud workspace usage, credit billing, and acceptable conduct on Entry Agents.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    url: "/terms",
    title: "Terms of Service | Entry Agents",
    description,
  },
  twitter: {
    title: "Terms of Service | Entry Agents",
    description,
  },
};

const SECTIONS = [
  {
    heading: "1. Accounts and workspace access",
    body: "You are responsible for activity initiated through your authenticated Entry Agents account and any connected GitHub, Vercel, or third-party integrations you authorize inside your sessions.",
  },
  {
    heading: "2. Subscriptions, credits, and usage limits",
    body: "Entry Agents offers a free tier with $1 trial credit as well as paid subscription plans (Plus, Entry, Pro, and Max) that allocate compute credits billed according to published model token rates. Usage exceeding active plan windows or credit balances may be paused until replenished or renewed.",
  },
  {
    heading: "3. Code ownership and output review",
    body: "You retain ownership of code, prompts, and files you bring into or produce with Entry Agents. Because AI-generated edits and shell commands execute in live environments, you are responsible for reviewing diffs, tests, and pull requests before deploying to production.",
  },
  {
    heading: "4. Acceptable use of cloud containers",
    body: "You may not use Entry Agents sandboxes for unauthorized network scanning, credential abuse, denial-of-service traffic, cryptocurrency mining, or bypassing platform rate and credit safeguards. We may suspend workspaces or accounts that violate container safety rules.",
  },
  {
    heading: "5. Service availability",
    body: "We work to keep durable workflows and cloud sandboxes available and recoverable, but ephemeral container filesystems expire after inactivity and are not a substitute for backing up committed work in Git.",
  },
] as const;

export default function TermsPage() {
  return (
    <div className="landing min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg)">
      <LandingNav showSignIn />
      <main className="mx-auto max-w-[1080px] px-4 pb-24 pt-24 sm:px-6 sm:pt-32 md:pt-36">
        <p className="font-mono text-xs text-(--l-fg-3)">Legal</p>
        <h1 className="mt-3 max-w-3xl text-balance text-3xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-4 max-w-[64ch] text-pretty text-base leading-relaxed text-(--l-fg-2)">
          These terms describe the baseline rules for using Entry Agents
          workspaces, subscription credits, and connected developer tools.
        </p>

        <div className="mt-12 space-y-4 border-t border-(--l-border) pt-10">
          {SECTIONS.map((section) => (
            <section
              key={section.heading}
              className="rounded-2xl border border-(--l-border) bg-(--l-surface) p-6"
            >
              <h2 className="text-lg font-semibold tracking-tight">
                {section.heading}
              </h2>
              <p className="mt-2.5 max-w-[72ch] text-sm leading-relaxed text-(--l-fg-2)">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-4 text-sm">
          <Link
            href="/privacy"
            className="text-(--l-fg-2) underline underline-offset-4 transition-colors hover:text-(--l-fg)"
          >
            Privacy Policy
          </Link>
          <Link
            href="/pricing"
            className="text-(--l-fg-2) underline underline-offset-4 transition-colors hover:text-(--l-fg)"
          >
            Pricing &amp; Plans
          </Link>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
