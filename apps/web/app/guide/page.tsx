import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { SITE_URL } from "@/lib/site";
import { GuideJumpNav, type GuideJumpSection } from "./guide-jump-nav";

const title = "Entry Agents Complete Builder Guide";
const description =
  "Learn Entry Agents from scratch: signing in, starting with or without GitHub, using Direct or Team Wave mode inside chat, connecting workplace apps, understanding 99% prompt caching and $5–$40 plans, and reviewing live previews and diffs.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "Entry Agents guide",
    "AI coding agent tutorial",
    "multi-agent team workflow",
    "how to use Entry Agents",
    "cloud coding workspace",
  ],
  alternates: { canonical: "/guide" },
  openGraph: { url: "/guide", title, description },
  twitter: { title, description },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "HowTo",
      name: title,
      description,
      url: `${SITE_URL}/guide`,
      totalTime: "PT15M",
      step: [
        {
          "@type": "HowToStep",
          name: "Sign in",
          text: "Open Entry and sign in with your Vercel, GitHub, or Google account.",
        },
        {
          "@type": "HowToStep",
          name: "Open a session",
          text: "Start with a blank cloud workspace, upload files, or select a connected GitHub repository.",
        },
        {
          "@type": "HowToStep",
          name: "Prompt in Direct or Team Wave mode",
          text: "Describe the goal, target files or screens, constraints, and how Entry should verify checks.",
        },
        {
          "@type": "HowToStep",
          name: "Review live diffs and preview",
          text: "Inspect file diffs, open the live desktop or mobile preview, and push commits when ready.",
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Do I need GitHub to use Entry Agents",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. You can build and preview apps inside a blank workspace or upload files, then optionally connect GitHub later.",
          },
        },
        {
          "@type": "Question",
          name: "How do Team Waves work inside the main chat",
          acceptedAnswer: {
            "@type": "Answer",
            text: "For broad features spanning multiple files, Entry can split work into dependency waves directly inside your chat turn: Wave 0 maps files and locks interface contracts, parallel builders modify disjoint files, and a reviewer verifies tests.",
          },
        },
        {
          "@type": "Question",
          name: "How do plans and 99% prompt caching work",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Paid plans range from $5/mo Plus ($10 credit) and $13/mo Goat ($50 credit, 3.8x) to $20/mo Pro ($100) and $40/mo Max ($180) with zero per-token markup, while prompt caching cuts repeated context costs by up to 99%.",
          },
        },
      ],
    },
  ],
};

const GUIDE_SECTIONS: readonly GuideJumpSection[] = [
  { id: "first-project", index: "01", label: "Start from zero" },
  { id: "direct-vs-team", index: "02", label: "Direct & Team Waves" },
  { id: "prompting", index: "03", label: "Prompt patterns" },
  { id: "navigation", index: "04", label: "Pages & settings" },
  { id: "session", index: "05", label: "Inside a session" },
  { id: "connections", index: "06", label: "Connected stack & MCP" },
  { id: "credits", index: "07", label: "Plans & 99% caching" },
  { id: "glossary", index: "08", label: "Glossary" },
];

function CodePrompt({ children }: { readonly children: string }) {
  return (
    <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-(--l-border) bg-(--l-code-bg) p-4 font-mono text-xs leading-relaxed text-(--l-panel-fg) sm:p-5 sm:text-sm">
      <code>{children}</code>
    </pre>
  );
}

function Section({
  id,
  title: heading,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-(--l-border) pt-12"
    >
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {heading}
      </h2>
      <div className="mt-5 space-y-5 text-sm leading-relaxed text-(--l-fg-2) sm:text-base">
        {children}
      </div>
    </section>
  );
}

function PageLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Link
      className="font-medium text-(--l-fg) underline underline-offset-4 transition-colors duration-150 hover:opacity-80"
      href={href}
    >
      {children}
    </Link>
  );
}

export default function GuidePage() {
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
        <p className="font-mono text-xs text-(--l-fg-3)">Builder guide</p>
        <h1 className="mt-3 max-w-4xl text-balance text-3xl font-semibold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
          The complete Entry Agents guide
        </h1>
        <p className="mt-5 max-w-[66ch] text-pretty text-base leading-relaxed text-(--l-fg-2) sm:text-lg">
          Whether you are shipping your first app with zero local setup or
          orchestrating multi-file refactors across connected tools, this guide
          covers sessions, Direct vs Team Wave mode, app connections, durable
          runs, and plan credits.
        </p>

        <GuideJumpNav sections={GUIDE_SECTIONS} />

        <div className="mt-12 space-y-12">
          <Section id="first-project" title="1. Start from zero in the cloud">
            <p>
              You do not need an existing codebase or local toolchain. Each
              session creates an isolated Linux workspace with its own files,
              package runtime, terminal, editor, diffs, and live app preview.
            </p>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                Open <PageLink href="/login">Sign in</PageLink> and continue
                with Vercel, GitHub, or Google.
              </li>
              <li>
                Head to <PageLink href="/sessions">Sessions</PageLink> and start
                a blank Workspace for a new idea, upload existing files, or
                attach a GitHub repository.
              </li>
              <li>
                Give Entry a concrete outcome and how it should check the work.
                Start with a solid foundation first, inspect the preview and
                diff, then iterate step by step.
              </li>
              <li>
                Feel free to turn off your device, switch networks, or move
                between desktop and phone mid-turn — runs continue on cloud
                checkpoints and sync cleanly when you reconnect.
              </li>
            </ol>
          </Section>

          <Section id="direct-vs-team" title="2. Direct runs vs Team Waves">
            <p>
              Entry chooses the simplest execution model that fits the job, or
              lets you invoke Team coordination directly inside the same chat
              conversation without opening a separate mode page:
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-(--l-border) bg-(--l-surface) p-5">
                <h3 className="text-base font-semibold text-(--l-fg)">
                  Direct execution
                </h3>
                <p className="mt-2 text-sm text-(--l-fg-2)">
                  Best for targeted fixes, single-file updates, UI polish, and
                  questions. One agent executes edits and tests end to end with
                  minimal overhead.
                </p>
              </div>
              <div className="rounded-xl border border-(--l-border) bg-(--l-surface) p-5">
                <h3 className="text-base font-semibold text-(--l-fg)">
                  Team Wave coordination
                </h3>
                <p className="mt-2 text-sm text-(--l-fg-2)">
                  Best when work spans database, API, and UI. Wave 0 scouts the
                  codebase and locks shared interface contracts; Wave 1
                  implements disjoint files in parallel; the verification wave
                  checks types, tests, and diffs right inside your chat
                  timeline.
                </p>
              </div>
            </div>
          </Section>

          <Section id="prompting" title="3. Prompt patterns that ship cleanly">
            <p>
              Clear prompts specify context, target files or screens, boundaries
              not to break, and proof checks.
            </p>
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-base font-semibold text-(--l-fg)">
                  Start a focused project
                </h3>
                <CodePrompt>{`Build a mobile-first invoice tracker for freelance designers.
Include invoice creation, line-item math, paid/pending status filters, and print view.
Check 375px and 1440px viewports in Playwright and run typecheck before finishing.`}</CodePrompt>
              </div>
              <div>
                <h3 className="mb-2 text-base font-semibold text-(--l-fg)">
                  Trigger a coordinated multi-file Team Wave
                </h3>
                <CodePrompt>{`Use a Team Wave to add webhook signature verification end to end:
Wave 0: map existing webhook routes and lock shared payload schema contracts.
Wave 1: implement route validation and database migration in disjoint files.
Wave 2: run unit tests and summarize every touched file.`}</CodePrompt>
              </div>
              <div>
                <h3 className="mb-2 text-base font-semibold text-(--l-fg)">
                  Debug with proof
                </h3>
                <CodePrompt>{`Submitting the settings form drops saved headers after refresh.
Reproduce the bug, inspect network and server route responses, apply the smallest fix, and verify persistence with a test.`}</CodePrompt>
              </div>
            </div>
          </Section>

          <Section id="navigation" title="4. Navigating pages & settings">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-(--l-border) bg-(--l-surface) p-4">
                <h3 className="font-semibold text-(--l-fg)">
                  <PageLink href="/sessions">Sessions</PageLink>
                </h3>
                <p className="mt-1 text-sm">
                  Project dashboard to create workspaces, search conversations,
                  attach repos, or resume active turns from any device.
                </p>
              </div>
              <div className="rounded-xl border border-(--l-border) bg-(--l-surface) p-4">
                <h3 className="font-semibold text-(--l-fg)">
                  <PageLink href="/model">Models</PageLink> &amp;{" "}
                  <PageLink href="/pricing">Pricing</PageLink>
                </h3>
                <p className="mt-1 text-sm">
                  Compare frontier models across Claude, GPT, Gemini, DeepSeek,
                  and Grok with per-token rates and live plan capacity.
                </p>
              </div>
              <div className="rounded-xl border border-(--l-border) bg-(--l-surface) p-4">
                <h3 className="font-semibold text-(--l-fg)">
                  <PageLink href="/settings/connections">
                    Connections, MCP &amp; API Keys
                  </PageLink>
                </h3>
                <p className="mt-1 text-sm">
                  Connect GitHub, Vercel, Gmail, Slack, Linear, Notion, and 500+
                  apps, attach custom MCP tools, or bind private API keys.
                </p>
              </div>
              <div className="rounded-xl border border-(--l-border) bg-(--l-surface) p-4">
                <h3 className="font-semibold text-(--l-fg)">
                  <PageLink href="/settings/skills">Skills</PageLink> &amp;{" "}
                  <PageLink href="/settings/usage">Usage</PageLink>
                </h3>
                <p className="mt-1 text-sm">
                  Configure reusable skills (such as UI polish or workflow
                  rules) and audit token caching savings and credit consumption.
                </p>
              </div>
            </div>
          </Section>

          <Section id="session" title="5. Inside a coding session">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  name: "Main Chat & Inline Waves",
                  desc: "Watch thinking streams while the agent works, inspect individual specialist outputs inline, and pick up right where you scrolled after viewing any file.",
                },
                {
                  name: "Files & Side-by-Side Diffs",
                  desc: "Inspect modified files line by line before committing, or open the built-in code editor for quick manual adjustments.",
                },
                {
                  name: "Live App Preview",
                  desc: "Run the dev server inside the cloud container and test interactive flows at desktop and mobile dimensions.",
                },
                {
                  name: "Git Branches & PRs",
                  desc: "Review diffs, run CI checks inside the sandbox, commit cleanly, and push branches or pull requests back to GitHub.",
                },
              ].map((panel) => (
                <div
                  key={panel.name}
                  className="rounded-xl border border-(--l-border) bg-(--l-surface) p-4"
                >
                  <h3 className="font-semibold text-(--l-fg)">{panel.name}</h3>
                  <p className="mt-1.5 text-sm">{panel.desc}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="connections" title="6. Connected stack, MCP & API keys">
            <p>
              Entry brings external context directly into your coding loop via
              three connected surfaces under Settings:
            </p>
            <ul className="list-disc space-y-2.5 pl-5">
              <li>
                <strong className="text-(--l-fg)">Connected Apps:</strong>{" "}
                Authorize Gmail, Slack, Notion, Linear, Google Calendar, GitHub,
                and Vercel so agents can read tickets, post summaries, and
                trigger deployments directly from chat.
              </li>
              <li>
                <strong className="text-(--l-fg)">Custom MCP Tools:</strong>{" "}
                Attach remote HTTP/SSE or sandbox stdio servers via JSON import
                or quick presets.
              </li>
              <li>
                <strong className="text-(--l-fg)">API Keys:</strong> Bind
                private provider keys (Stripe, Resend, Supabase, OpenAI) via{" "}
                <code className="rounded bg-(--l-surface-2) px-1.5 py-0.5 font-mono text-xs">
                  $KEY_NAME
                </code>{" "}
                or header templates without ever pasting credentials into chat.
              </li>
            </ul>
          </Section>

          <Section id="credits" title="7. Plans, $5–$40 pricing & 99% caching">
            <p>
              Entry charges zero token markup. Every workspace also benefits
              from multi-turn prompt caching that reuses up to 99% of unchanged
              repo and conversation context on subsequent tool calls.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { plan: "Plus", price: "$5/mo", detail: "$10 credit (2.0x)" },
                {
                  plan: "Goat",
                  price: "$13/mo",
                  detail: "$50 credit (3.8x) · $10/5h, $25/7d",
                },
                { plan: "Pro", price: "$20/mo", detail: "$100 credit (5.0x)" },
                { plan: "Max", price: "$40/mo", detail: "$180 credit (4.5x)" },
              ].map((tier) => (
                <div
                  key={tier.plan}
                  className="rounded-xl border border-(--l-border) bg-(--l-surface) p-4 font-mono text-xs tabular-nums"
                >
                  <div className="font-semibold text-(--l-fg)">{tier.plan}</div>
                  <div className="mt-1 text-base font-semibold text-(--l-fg)">
                    {tier.price}
                  </div>
                  <div className="mt-1 text-(--l-fg-3)">{tier.detail}</div>
                </div>
              ))}
            </div>
            <p className="text-sm">
              Free accounts start with a $1 trial credit and no card required.
              See live balances on <PageLink href="/pricing">Pricing</PageLink>{" "}
              and per-model rates on <PageLink href="/model">Models</PageLink>.
            </p>
          </Section>

          <Section id="glossary" title="8. Builder glossary">
            <dl className="grid gap-4 md:grid-cols-2">
              {[
                {
                  term: "Session",
                  def: "A workspace project container along with its chat threads, files, diffs, and git state.",
                },
                {
                  term: "Team Wave",
                  def: "A dependency-ordered group of specialist subtasks executing inline with locked contracts and non-overlapping file claims.",
                },
                {
                  term: "Interface Contract",
                  def: "A schema or API signature published in Wave 0 so parallel Wave 1 builders integrate cleanly without conflicts.",
                },
                {
                  term: "Diff",
                  def: "Line-by-line summary of additions and deletions across workspace files ready to inspect or commit.",
                },
                {
                  term: "MCP Server",
                  def: "External tool endpoint connected cleanly into the agent sandbox toolset.",
                },
                {
                  term: "Durable Run",
                  def: "Server-checkpointed execution that completes even when your browser disconnects or goes offline.",
                },
              ].map((item) => (
                <div
                  key={item.term}
                  className="rounded-xl border border-(--l-border) bg-(--l-surface) p-4"
                >
                  <dt className="font-semibold text-(--l-fg)">{item.term}</dt>
                  <dd className="mt-1 text-sm">{item.def}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>

        <section className="mt-14 rounded-2xl border border-(--l-border) bg-(--l-surface) p-6">
          <h2 className="text-xl font-semibold text-(--l-fg)">
            Ready to build
          </h2>
          <p className="mt-2 text-sm text-(--l-fg-2)">
            Open a blank cloud sandbox or connect your repository in seconds.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-lg bg-(--l-btn-bg) px-4 text-xs font-medium text-(--l-btn-fg) transition-opacity duration-150 hover:opacity-90"
            >
              Sign in and start
            </Link>
            <Link
              href="/sessions"
              className="inline-flex h-9 items-center rounded-lg border border-(--l-border) bg-(--l-surface-2) px-4 text-xs font-medium text-(--l-fg-2) transition-colors hover:text-(--l-fg)"
            >
              Open sessions
            </Link>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
