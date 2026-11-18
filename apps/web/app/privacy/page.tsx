import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";

const title = "Privacy Policy";
const description =
  "How Entry Agents handles account credentials, workspace files, connected app permissions, and billing data.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    url: "/privacy",
    title: "Privacy Policy | Entry Agents",
    description,
  },
  twitter: {
    title: "Privacy Policy | Entry Agents",
    description,
  },
};

const SECTIONS = [
  {
    heading: "1. Account and authentication data",
    body: "Entry Agents authenticates users via Vercel, Google, or GitHub OAuth. We store your basic profile identifiers (such as name, email address, username, and avatar URL) to provision your account and maintain active sessions.",
  },
  {
    heading: "2. Workspaces, repositories, and chat history",
    body: "Prompts, assistant messages, session metadata, and tool checkpoints are stored so durable agent runs can resume across reconnects and device switches. Repository tokens and connected third-party OAuth integrations are scoped to actions you explicitly initiate inside your workspace.",
  },
  {
    heading: "3. Connected apps and API credentials",
    body: "Optional integrations such as GitHub, Vercel, or app connections managed in Settings are used only when your sessions invoke those tools. Bound environment keys and sandbox tokens are injected into isolated containers rather than shared across user accounts.",
  },
  {
    heading: "4. Usage metrics and billing records",
    body: "We record token consumption, tool execution metadata, and credit ledger entries to calculate plan balances and enforce usage limits. Payment checkout and subscription renewals are processed through our billing provider (Bachs), and Entry Agents does not store raw payment card numbers.",
  },
  {
    heading: "5. Retention and workspace lifecycle",
    body: "Inactive cloud sandboxes hibernate automatically and expired container filesystems are discarded. You may disconnect linked integrations or close sessions from your workspace settings at any time.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <div className="landing min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg)">
      <LandingNav showSignIn />
      <main className="mx-auto max-w-[1080px] px-4 pb-24 pt-24 sm:px-6 sm:pt-32 md:pt-36">
        <p className="font-mono text-xs text-(--l-fg-3)">Legal</p>
        <h1 className="mt-3 max-w-3xl text-balance text-3xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-4 max-w-[64ch] text-pretty text-base leading-relaxed text-(--l-fg-2)">
          This page summarizes how Entry Agents collects, stores, and isolates
          information when you use our cloud coding workspaces.
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
            href="/terms"
            className="text-(--l-fg-2) underline underline-offset-4 transition-colors hover:text-(--l-fg)"
          >
            Terms of Service
          </Link>
          <Link
            href="/about"
            className="text-(--l-fg-2) underline underline-offset-4 transition-colors hover:text-(--l-fg)"
          >
            About Entry Agents
          </Link>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
