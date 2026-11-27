import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { SITE_URL } from "@/lib/site";

const title = "AI Coding Agent Architecture";
const description =
  "How Entry Agents differs from local IDE copilots: execution lifecycle, per-session Linux VM isolation, server-checkpointed durability, and credential boundaries.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/ai-coding-agent",
  },
  openGraph: {
    url: "/ai-coding-agent",
    title: "Entry Agents — AI coding agent architecture and isolation",
    description,
  },
  twitter: {
    title: "Entry Agents — AI coding agent architecture and isolation",
    description,
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "Entry Agents — AI coding agent architecture",
  description,
  url: `${SITE_URL}/ai-coding-agent`,
  about: {
    "@type": "SoftwareApplication",
    name: "Entry Agents",
    applicationCategory: "DeveloperApplication",
  },
};

const COMPARISON_ROWS = [
  {
    dimension: "Where code runs",
    localCopilot: "Shares your laptop CPU, local ports, and dirty working tree",
    entryCloud:
      "Dedicated isolated Ubuntu 24.04 VM provisioned per session on its own git branch",
  },
  {
    dimension: "Closing your laptop",
    localCopilot: "Kills the active turn, shell command, and dev server",
    entryCloud:
      "Server-checkpointed workflow completes tests and reconciles diffs across devices",
  },
  {
    dimension: "Parallel changes",
    localCopilot: "Sequential edits fighting over one local filesystem",
    entryCloud:
      "Wave 0 locks interface contracts; parallel builders edit disjoint files without conflicts",
  },
  {
    dimension: "Live previews",
    localCopilot:
      "Localhost only — requires manual tunneling to share or check on mobile",
    entryCloud:
      "Built-in HTTPS port proxy inside the workspace for instant desktop and mobile verification",
  },
  {
    dimension: "Onboarding setup",
    localCopilot:
      "Install Node, Python, databases, and repo dependencies manually",
    entryCloud:
      "Zero local setup — open from any browser, start blank or attach a GitHub repo",
  },
] as const;

const EXECUTION_STAGES = [
  {
    step: "01",
    name: "Provision & checkout",
    detail:
      "Opening a session attaches or boots a private Linux VM, mounts uploaded files or checks out your repository branch via ephemeral credentials, and restores cached dependencies.",
  },
  {
    step: "02",
    name: "Tool loop or Team Wave",
    detail:
      "The agent reads files, runs shell commands, executes tests, and inspects live port output. Multi-module tasks split into dependency waves with locked contracts and non-overlapping file claims.",
  },
  {
    step: "03",
    name: "Durable checkpointing",
    detail:
      "Every step persists on the server workflow runtime rather than a fragile browser socket, so page reloads, network drops, and phone handoffs pick up at the exact live step.",
  },
  {
    step: "04",
    name: "Diff review & delivery",
    detail:
      "Finished turns emit structured file diffs, passing check output, and live preview URLs. Git commits, branch pushes, and pull requests stay explicit and optional.",
  },
] as const;

const BOUNDARIES = [
  {
    title: "Per-session network isolation",
    body: "Each workspace VM runs isolated with east-west tenant traffic blocked so one session cannot reach another session or internal host metadata endpoints.",
  },
  {
    title: "Ephemeral Git credentials",
    body: "Repository clone and fetch tokens are passed through short-lived askpass helpers cleaned up right after execution — never embedded in git remotes, logs, or persisted sandbox state.",
  },
  {
    title: "Scoped secret injection",
    body: "Third-party API keys saved in Settings → Secrets are injected at runtime by variable reference ($KEY_NAME) so raw credentials never enter your prompt history.",
  },
  {
    title: "Automatic idle suspend",
    body: "Inactive VMs suspend automatically after your last command and wake cleanly with filesystem state intact when you return.",
  },
] as const;

export default function AiCodingAgentPage() {
  return (
    <div className="landing min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg)">
      <LandingNav showSignIn />
      <main className="mx-auto max-w-[1040px] px-4 pb-24 pt-24 sm:px-6 sm:pt-32 md:pt-36">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />

        <p className="font-mono text-xs text-(--l-fg-3)">Architecture</p>
        <h1 className="mt-3 max-w-3xl font-display text-balance text-3xl font-semibold leading-[1.04] tracking-[-0.035em] sm:text-5xl">
          How Entry runs coding agents in the cloud
        </h1>
        <p className="mt-4 max-w-[64ch] text-pretty text-base leading-relaxed text-(--l-fg-2) sm:text-lg">
          A technical look at how cloud workspaces compare to local IDE
          copilots, how a turn executes end to end, and how each session stays
          isolated.
        </p>

        {/* Cloud Agent vs Local IDE Copilot Comparison */}
        <section className="mt-14 border-t border-(--l-border) pt-12">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            Cloud workspace vs local IDE copilot
          </h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-(--l-border) bg-(--l-surface)">
            <table className="w-full min-w-[600px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-(--l-border) text-xs text-(--l-fg-3)">
                  <th className="w-[22%] px-5 py-3.5 font-medium">Dimension</th>
                  <th className="w-[38%] px-5 py-3.5 font-medium">
                    Local IDE copilot
                  </th>
                  <th className="w-[40%] px-5 py-3.5 font-medium text-(--l-fg)">
                    Entry cloud agent
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--l-border)">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.dimension}>
                    <td className="px-5 py-4 align-top text-xs font-semibold text-(--l-fg) sm:text-sm">
                      {row.dimension}
                    </td>
                    <td className="px-5 py-4 align-top text-xs leading-relaxed text-(--l-fg-3) sm:text-sm">
                      {row.localCopilot}
                    </td>
                    <td className="bg-(--l-panel) px-5 py-4 align-top text-xs leading-relaxed text-(--l-fg) sm:text-sm">
                      {row.entryCloud}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Turn Execution Lifecycle */}
        <section className="mt-16 border-t border-(--l-border) pt-12">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            Turn execution lifecycle
          </h2>
          <div className="mt-6 overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-surface)">
            <ol className="divide-y divide-(--l-border)">
              {EXECUTION_STAGES.map((stage) => (
                <li
                  key={stage.step}
                  className="grid gap-2 px-5 py-5 sm:grid-cols-[220px_1fr] sm:gap-6 sm:px-6"
                >
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-mono text-xs tabular-nums text-(--l-accent)">
                      {stage.step}
                    </span>
                    <span className="text-sm font-semibold text-(--l-fg)">
                      {stage.name}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-(--l-fg-2) sm:text-sm">
                    {stage.detail}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Isolation & Security Boundaries */}
        <section className="mt-16 border-t border-(--l-border) pt-12">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            Isolation &amp; credential boundaries
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {BOUNDARIES.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-(--l-border) bg-(--l-surface) p-5"
              >
                <h3 className="text-sm font-semibold text-(--l-fg)">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-(--l-fg-2) sm:text-[13px]">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-(--l-border) pt-10">
          <div className="flex flex-wrap gap-5 text-sm">
            <Link
              href="/guide"
              className="text-(--l-fg-2) underline decoration-(--l-border) underline-offset-4 hover:text-(--l-fg)"
            >
              Builder guide &amp; prompt recipes
            </Link>
            <Link
              href="/model"
              className="text-(--l-fg-2) underline decoration-(--l-border) underline-offset-4 hover:text-(--l-fg)"
            >
              Live model catalog
            </Link>
            <Link
              href="/pricing"
              className="text-(--l-fg-2) underline decoration-(--l-border) underline-offset-4 hover:text-(--l-fg)"
            >
              Plans &amp; credits
            </Link>
          </div>
          <Link
            href="/login"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-(--l-btn-bg) px-4 text-xs font-medium text-(--l-btn-fg) transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
          >
            <span>Launch a workspace</span>
            <ArrowRight className="size-3.5" strokeWidth={1.5} />
          </Link>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
