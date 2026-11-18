import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Layers,
  Plug,
  ShieldCheck,
  Terminal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { ToolkitPresetIcon } from "@/components/toolkit-icons";
import { SITE_URL } from "@/lib/site";

const title = "AI Coding Agent & Cloud Engineering Workspaces";
const description =
  "Entry Agents runs single-agent edits or dependency-wave multi-agent teams inside isolated Linux workspaces connected to GitHub, Vercel, Gmail, Slack, and Linear, with offline-durable checkpoints and up to 99% prompt caching.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/ai-coding-agent",
  },
  openGraph: {
    url: "/ai-coding-agent",
    title: "Entry Agents — Cloud engineering workspaces and AI coding teams",
    description,
  },
  twitter: {
    title: "Entry Agents — Cloud engineering workspaces and AI coding teams",
    description,
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Entry Agents — Cloud engineering workspaces and AI coding teams",
  description,
  url: `${SITE_URL}/ai-coding-agent`,
  about: {
    "@type": "SoftwareApplication",
    name: "Entry Agents",
    applicationCategory: "DeveloperApplication",
  },
};

const CAPABILITY_PILLARS = [
  {
    icon: Users,
    title: "Direct or Team Wave execution",
    body: "Simple bugs and small edits finish straight through in a fast single-agent loop. When tasks cross packages or modules, Team mode schedules dependency waves inline: Wave 0 locks interfaces and file claims, parallel builders edit disjoint files, and reviewers run final verification.",
  },
  {
    icon: Terminal,
    title: "Isolated Cloud Linux workspace",
    body: "Every session boots an isolated container with repository checkout, persistent dependencies, integrated shell, code editor, side-by-side diffs, and live desktop and mobile app previews without setting up anything locally.",
  },
  {
    icon: ShieldCheck,
    title: "Offline-durable execution",
    body: "Turns run on server-side workflow checkpoints rather than fragile browser connections. If your Wi-Fi drops, your laptop sleeps, or you switch to your phone mid-turn, output resumes and reconciles automatically.",
  },
] as const;

const CONNECTED_TOOLS = [
  { slug: "github", label: "GitHub" },
  { slug: "vercel", label: "Vercel" },
  { slug: "gmail", label: "Gmail" },
  { slug: "slack", label: "Slack" },
  { slug: "linear", label: "Linear" },
  { slug: "notion", label: "Notion" },
  { slug: "googlecalendar", label: "Google Calendar" },
  { slug: "figma", label: "Figma" },
  { slug: "jira", label: "Jira" },
] as const;

const ENGINEERING_WORKFLOWS = [
  "Map an unfamiliar repository and trace end-to-end request lifecycles",
  "Implement multi-file features with locked interface contracts across specialists",
  "Reproduce failing tests inside the sandbox and inspect live diffs before committing",
  "Read bug reports from Gmail or Linear and open verified pull requests with PR previews",
  "Switch frontier models or reasoning depth between turns inside the same room",
  "Preview responsive web apps directly across 375px mobile and 1440px desktop viewports",
] as const;

export default function AiCodingAgentPage() {
  return (
    <div className="landing min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg)">
      <LandingNav showSignIn />
      <main className="mx-auto max-w-[1080px] px-4 pb-24 pt-24 sm:px-6 sm:pt-32 md:pt-36">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />

        <p className="font-mono text-xs text-(--l-fg-3)">Entry Agents</p>
        <h1 className="mt-3 max-w-4xl text-balance text-3xl font-semibold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
          An engineering workspace built for single runs and live agent teams
        </h1>
        <p className="mt-5 max-w-[64ch] text-pretty text-base leading-relaxed text-(--l-fg-2) sm:text-lg">
          Give Entry a repository, uploaded files, or a blank container. It
          reads code, installs packages, runs tests, inspects live app previews,
          connects with your team stack, and commits verified branches from any
          device.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-(--l-btn-bg) px-4 text-sm font-medium text-(--l-btn-fg) transition-opacity duration-150 hover:opacity-90"
          >
            <span>Start building</span>
            <ArrowRight className="size-4" strokeWidth={1.5} />
          </Link>
          <Link
            href="/guide"
            className="inline-flex h-10 items-center rounded-lg border border-(--l-border) bg-(--l-surface) px-4 text-sm font-medium text-(--l-fg-2) transition-[border-color,color] duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg)"
          >
            Read the builder guide
          </Link>
        </div>

        {/* Core Architecture Pillars */}
        <section className="mt-16 grid gap-4 border-t border-(--l-border) pt-12 md:grid-cols-3">
          {CAPABILITY_PILLARS.map((pillar) => (
            <article
              key={pillar.title}
              className="min-w-0 rounded-2xl border border-(--l-border) bg-(--l-surface) p-6"
            >
              <pillar.icon
                className="size-4 text-(--l-accent)"
                strokeWidth={1.5}
              />
              <h2 className="mt-3 text-lg font-semibold tracking-tight">
                {pillar.title}
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-(--l-fg-2)">
                {pillar.body}
              </p>
            </article>
          ))}
        </section>

        {/* Connected Stack + Economics */}
        <section className="mt-12 grid gap-4 lg:grid-cols-12">
          <div className="min-w-0 rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 lg:col-span-7">
            <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
              <span className="inline-flex items-center gap-2 font-medium text-(--l-fg-2)">
                <Plug className="size-4 text-(--l-accent)" strokeWidth={1.5} />
                <span>Connected apps &amp; MCP tools</span>
              </span>
              <Link
                href="/settings/connections"
                className="underline underline-offset-4 hover:text-(--l-fg)"
              >
                Open connections
              </Link>
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">
              Act across your codebase and workplace tools together
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-(--l-fg-2)">
              Authorize OAuth apps or custom MCP endpoints once in Settings so
              agents can pull issues, check customer threads, push commits, and
              notify teammates without copy-pasting context.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {CONNECTED_TOOLS.map((tool) => (
                <span
                  key={tool.slug}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-(--l-border) bg-(--l-surface-2) px-2.5 py-1.5 font-mono text-xs text-(--l-fg-2)"
                >
                  <ToolkitPresetIcon slug={tool.slug} className="size-3.5" />
                  <span>{tool.label}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                <span className="inline-flex items-center gap-2 font-medium text-(--l-fg-2)">
                  <Layers
                    className="size-4 text-(--l-accent)"
                    strokeWidth={1.5}
                  />
                  <span>Caching &amp; plans</span>
                </span>
                <span className="font-mono tabular-nums">Zero markup</span>
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight">
                Up to 99% prompt caching and $5–$40 builder plans
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-(--l-fg-2)">
                Start with $1 free trial credit, then scale across Plus ($5/mo
                for $10 credit), Entry ($13/mo for $50 credit, 3.8x), Pro
                ($20/mo for $100), and Max ($40/mo for $180).
              </p>
            </div>
            <div className="mt-5 border-t border-(--l-border) pt-4 font-mono text-xs text-(--l-fg-3) tabular-nums">
              Claude · GPT · Gemini · DeepSeek · Grok
            </div>
          </div>
        </section>

        {/* Concrete Engineering Outcomes */}
        <section className="mt-16 border-t border-(--l-border) pt-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            What agents ship cleanly in a session
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {ENGINEERING_WORKFLOWS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 rounded-xl border border-(--l-border) bg-(--l-surface) p-4 text-sm leading-relaxed text-(--l-fg-2)"
              >
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-emerald-500"
                  strokeWidth={1.5}
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
