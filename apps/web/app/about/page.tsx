import type { Metadata } from "next";
import { ArrowRight, Layers, ShieldCheck, Terminal } from "lucide-react";
import Link from "next/link";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { SITE_URL } from "@/lib/site";

const title = "About Entry Agents";
const description =
  "Entry Agents builds cloud engineering workspaces with isolated Linux containers, live multi-agent coordination, and durable workflow execution.";

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

const PRINCIPLES = [
  {
    icon: Terminal,
    title: "Real execution over static snippets",
    body: "Every session gets an isolated Linux container with filesystem access, shell commands, package installs, diffs, and live desktop and mobile app previews.",
  },
  {
    icon: ShieldCheck,
    title: "Durable server-side runs",
    body: "Agent turns run on server-side workflow checkpoints instead of depending on an open browser tab, so closing your laptop or losing signal does not discard progress.",
  },
  {
    icon: Layers,
    title: "Transparent model pricing",
    body: "Model usage is billed directly against plan credits with published token rates and prompt caching, with no separate container surcharge.",
  },
] as const;

export default function AboutPage() {
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

        <p className="font-mono text-xs text-(--l-fg-3)">About</p>
        <h1 className="mt-3 max-w-3xl text-balance text-3xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
          Cloud workspaces built for autonomous engineering
        </h1>
        <p className="mt-5 max-w-[64ch] text-pretty text-base leading-relaxed text-(--l-fg-2) sm:text-lg">
          Entry Agents gives developers a private browser workspace where AI
          coding agents can read repositories, edit files, run tests, preview
          interfaces, and optionally deliver work through Git branches and pull
          requests.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-(--l-btn-bg) px-4 text-sm font-medium text-(--l-btn-fg) transition-opacity duration-150 hover:opacity-90"
          >
            <span>Start a workspace</span>
            <ArrowRight className="size-4" strokeWidth={1.5} />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center rounded-lg border border-(--l-border) bg-(--l-surface) px-4 text-sm font-medium text-(--l-fg-2) transition-[border-color,color] duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg)"
          >
            View pricing
          </Link>
        </div>

        <section className="mt-16 grid gap-4 border-t border-(--l-border) pt-12 md:grid-cols-3">
          {PRINCIPLES.map((item) => (
            <article
              key={item.title}
              className="min-w-0 rounded-2xl border border-(--l-border) bg-(--l-surface) p-6"
            >
              <item.icon
                className="size-4 text-(--l-accent)"
                strokeWidth={1.5}
              />
              <h2 className="mt-3 text-lg font-semibold tracking-tight">
                {item.title}
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-(--l-fg-2)">
                {item.body}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-12 rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">
            How sessions work
          </h2>
          <p className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-(--l-fg-2)">
            You can open a blank Linux workspace, upload reference files, or
            connect an existing GitHub repository. Simple changes run in a
            single-agent loop, while larger cross-module work can spawn inline
            agent teams that coordinate file edits and verification inside the
            same conversation.
          </p>
          <div className="mt-6 flex flex-wrap gap-4 border-t border-(--l-border) pt-5 text-sm">
            <Link
              href="/ai-coding-agent"
              className="text-(--l-fg-2) underline underline-offset-4 transition-colors hover:text-(--l-fg)"
            >
              AI coding agent overview
            </Link>
            <Link
              href="/guide"
              className="text-(--l-fg-2) underline underline-offset-4 transition-colors hover:text-(--l-fg)"
            >
              Beginner guide
            </Link>
            <Link
              href="/model"
              className="text-(--l-fg-2) underline underline-offset-4 transition-colors hover:text-(--l-fg)"
            >
              Supported models
            </Link>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
