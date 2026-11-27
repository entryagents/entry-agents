import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { SITE_URL } from "@/lib/site";
import { GuideJumpNav, type GuideJumpSection } from "./guide-jump-nav";
import { PromptRecipeCard } from "./prompt-recipe-card";

const title = "Entry Agents Builder Guide";
const description =
  "Hands-on playbook for shipping software in Entry Agents: 2-minute quickstart, copy-ready prompt recipes, workspace controls, secret bindings, and turn-saving habits.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "Entry Agents guide",
    "AI coding agent prompts",
    "Team Wave workflow",
    "how to use Entry Agents",
  ],
  alternates: { canonical: "/guide" },
  openGraph: { url: "/guide", title, description },
  twitter: { title, description },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: title,
  description,
  url: `${SITE_URL}/guide`,
  totalTime: "PT5M",
  step: [
    {
      "@type": "HowToStep",
      name: "Open a workspace",
      text: "Sign in at /login and start from a blank workspace, uploaded files, or a GitHub repository.",
    },
    {
      "@type": "HowToStep",
      name: "Give a verifiable prompt",
      text: "State the outcome, target routes or files, boundaries not to break, and the check command Entry should run.",
    },
    {
      "@type": "HowToStep",
      name: "Inspect diffs and live preview",
      text: "Review line-by-line changes in the Diff tab, test the live port preview, then commit or open a PR.",
    },
  ],
};

const GUIDE_SECTIONS: readonly GuideJumpSection[] = [
  { id: "quickstart", label: "First 2 minutes" },
  { id: "recipes", label: "Prompt recipes" },
  { id: "controls", label: "Workspace controls" },
  { id: "habits", label: "Turn-saving habits" },
];

const QUICKSTART_MODES = [
  {
    title: "Start from zero",
    steps:
      "Open Chats → New chat → Blank workspace. Describe the app you want, let Entry scaffold and run the dev server, and inspect the live preview URL directly.",
  },
  {
    title: "Bring a GitHub repo",
    steps:
      "Connect GitHub in Settings → Accounts, pick your repository when starting a session, and Entry checks out an isolated branch ready for verified PRs.",
  },
  {
    title: "Upload specs or assets",
    steps:
      "Drop screenshots, CSVs, or zip archives straight into the composer. Entry mounts them in your workspace so the agent can inspect exact pixels or schemas.",
  },
] as const;

const PROMPT_RECIPES = [
  {
    title: "Build a feature with responsive proof",
    whenToUse: "Starting a new screen, flow, or standalone app",
    prompt: `Build a mobile-first invoice tracker with line-item math, paid/pending filters, and a print view.
Check 375px and 1440px viewports in headless Chrome with zero horizontal overflow, and run typecheck before finishing.`,
  },
  {
    title: "Run a parallel Team Wave refactor",
    whenToUse: "Changes spanning schema, API routes, and UI components",
    prompt: `Use a Team Wave to add webhook signature verification end to end:
Scout existing webhook handlers and lock shared payload schema types first.
Update route validation and database migration in disjoint files in parallel.
Run unit tests and summarize every changed file.`,
  },
  {
    title: "Reproduce and fix a bug with regression coverage",
    whenToUse: "Tracking down a broken form, API 500, or flaky state bug",
    prompt: `Submitting the settings form drops custom headers after page refresh.
Reproduce the bug first, trace the network and server handler, apply the minimal fix, and add a test confirming persistence.`,
  },
  {
    title: "Resolve PR review threads",
    whenToUse: "Iterating on an open GitHub pull request",
    prompt: `Read every unresolved review comment on PR #142 and apply the requested fixes without changing unrelated behavior.
Run pnpm check and tests in the workspace, then push clean commits to the same branch.`,
  },
] as const;

const WORKSPACE_CONTROLS = [
  {
    control: "Diff inspector",
    purpose:
      "Inspect every added and deleted line per file before committing or pushing.",
  },
  {
    control: "Live port preview",
    purpose:
      "Open running dev servers inside the workspace over HTTPS to verify desktop and mobile layouts.",
  },
  {
    control: "Fork turn",
    purpose:
      "Branch a conversation at any past assistant reply to try an alternative architecture without losing your current thread.",
  },
  {
    control: "Model & effort picker",
    purpose:
      "Switch models and reasoning depth mid-chat inside any session, or compare live rates on /model.",
  },
  {
    control: "Secrets ($KEY_NAME)",
    purpose:
      "Store private API keys once under Settings → Secrets and reference them by variable name instead of pasting keys into prompts.",
  },
  {
    control: "Custom MCP servers",
    purpose:
      "Attach remote HTTP/SSE or sandbox stdio endpoints in Settings → MCP Servers to expose internal APIs to the agent.",
  },
] as const;

const HABITS = [
  {
    title: "Name the verification command in your prompt",
    body: "Telling Entry to run typecheck, bun test, or a headless browser check catches regressions inside the same turn instead of after you open the PR.",
  },
  {
    title: "Attach screenshots for UI tweaks",
    body: "One pasted screenshot communicates layout bugs faster than three paragraphs of CSS description.",
  },
  {
    title: "Tune reasoning effort per task",
    body: "Raise reasoning effort for debugging and multi-file edits, then dial it down for quick copy passes. Compare live rates on Models.",
  },
  {
    title: "Close the tab on long runs",
    body: "Long test suites and migrations keep running on server checkpoints. Check back from desktop or mobile when you are ready to review the diff.",
  },
] as const;

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
      <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
        {heading}
      </h2>
      <div className="mt-6 space-y-5 text-sm leading-relaxed text-(--l-fg-2) sm:text-base">
        {children}
      </div>
    </section>
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
        <p className="font-mono text-xs text-(--l-fg-3)">Playbook</p>
        <h1 className="mt-3 max-w-3xl font-display text-balance text-3xl font-semibold leading-[1.04] tracking-[-0.035em] sm:text-5xl">
          Entry Agents builder guide
        </h1>
        <p className="mt-4 max-w-[62ch] text-pretty text-base leading-relaxed text-(--l-fg-2) sm:text-lg">
          A practical reference for going from first prompt to verified branch —
          copyable prompt recipes, workspace controls, and habits that get more
          out of every turn. Looking for{" "}
          <Link
            href="/ai-coding-agent"
            className="font-medium text-(--l-fg) underline decoration-(--l-border) underline-offset-4 hover:decoration-(--l-fg)"
          >
            system architecture
          </Link>
          ,{" "}
          <Link
            href="/model"
            className="font-medium text-(--l-fg) underline decoration-(--l-border) underline-offset-4 hover:decoration-(--l-fg)"
          >
            model rates
          </Link>
          , or{" "}
          <Link
            href="/pricing"
            className="font-medium text-(--l-fg) underline decoration-(--l-border) underline-offset-4 hover:decoration-(--l-fg)"
          >
            plans
          </Link>
          ? Jump straight there.
        </p>

        <GuideJumpNav sections={GUIDE_SECTIONS} />

        <div className="mt-12 space-y-14">
          <Section id="quickstart" title="First two minutes">
            <p>
              Sign in at{" "}
              <Link
                href="/login"
                className="font-medium text-(--l-fg) underline decoration-(--l-border) underline-offset-4 hover:decoration-(--l-fg)"
              >
                /login
              </Link>{" "}
              with Vercel, GitHub, or Google, then pick whichever starting path
              matches your task:
            </p>
            <div className="overflow-hidden rounded-xl border border-(--l-border) bg-(--l-surface)">
              <div className="grid divide-y divide-(--l-border) md:grid-cols-3 md:divide-x md:divide-y-0">
                {QUICKSTART_MODES.map((mode) => (
                  <div key={mode.title} className="p-5">
                    <h3 className="text-sm font-semibold text-(--l-fg)">
                      {mode.title}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-(--l-fg-2) sm:text-[13px]">
                      {mode.steps}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section id="recipes" title="Copy-ready prompt recipes">
            <p>
              Prompts that specify the target outcome, boundaries, and proof
              checks finish in fewer turns. Copy and adapt any pattern below:
            </p>
            <div className="space-y-4">
              {PROMPT_RECIPES.map((recipe) => (
                <PromptRecipeCard key={recipe.title} {...recipe} />
              ))}
            </div>
          </Section>

          <Section id="controls" title="Workspace controls & secrets">
            <div className="overflow-hidden rounded-xl border border-(--l-border) bg-(--l-surface)">
              <dl className="divide-y divide-(--l-border)">
                {WORKSPACE_CONTROLS.map((item) => (
                  <div
                    key={item.control}
                    className="grid gap-1.5 px-4 py-3.5 sm:grid-cols-[200px_1fr] sm:gap-6 sm:px-5"
                  >
                    <dt className="text-xs font-semibold text-(--l-fg) sm:text-sm">
                      {item.control}
                    </dt>
                    <dd className="text-xs leading-relaxed text-(--l-fg-2) sm:text-sm">
                      {item.purpose}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Section>

          <Section id="habits" title="Habits that save turns">
            <div className="grid gap-4 sm:grid-cols-2">
              {HABITS.map((habit) => (
                <div
                  key={habit.title}
                  className="rounded-xl border border-(--l-border) bg-(--l-surface) p-5"
                >
                  <h3 className="text-sm font-semibold text-(--l-fg)">
                    {habit.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-(--l-fg-2) sm:text-[13px]">
                    {habit.body}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <section className="mt-16 flex flex-col items-start justify-between gap-4 rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight text-(--l-fg)">
              Open your first workspace
            </h2>
            <p className="mt-1 text-sm text-(--l-fg-2)">
              Start free with a blank Ubuntu VM or connect an existing GitHub
              repo.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-(--l-btn-bg) px-4 text-xs font-medium text-(--l-btn-fg) transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
            >
              <span>Start building</span>
              <ArrowRight className="size-3.5" strokeWidth={1.5} />
            </Link>
            <Link
              href="/chats"
              className="inline-flex h-10 items-center rounded-xl border border-(--l-border) bg-(--l-surface-2) px-4 text-xs font-medium text-(--l-fg-2) transition-colors hover:text-(--l-fg)"
            >
              Open chats
            </Link>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
