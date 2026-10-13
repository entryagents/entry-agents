import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { SITE_URL } from "@/lib/site";

const title = "Entry Agents Guide for Beginners";
const description =
  "A simple beginner's guide to Entry Agents: what it does, how to start a Workspace, how to prompt an AI coding agent, how GitHub and credits work, and how to get useful results.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/guide" },
  openGraph: {
    url: "/guide",
    title: "Entry Agents Guide for Beginners",
    description,
  },
  twitter: { title, description },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: title,
  description,
  url: `${SITE_URL}/guide`,
  totalTime: "PT10M",
  step: [
    {
      "@type": "HowToStep",
      name: "Sign in",
      text: "Sign in with Vercel, Google, or GitHub.",
    },
    {
      "@type": "HowToStep",
      name: "Start a Workspace",
      text: "Start from an idea, uploaded files, or an optional GitHub repository.",
    },
    {
      "@type": "HowToStep",
      name: "Describe the task",
      text: "Tell Entry what you want built or changed, including the result you expect.",
    },
    {
      "@type": "HowToStep",
      name: "Review the work",
      text: "Read the explanation, inspect the changes, and ask for fixes or tests.",
    },
  ],
};

const faqs = [
  [
    "Do I need a GitHub repository?",
    "No. You can start from a blank Workspace or upload files. GitHub is optional when you want repository delivery.",
  ],
  [
    "What does Entry actually do?",
    "Entry can understand a project, edit files, run shell commands, research, build software, run tests, and explain what changed.",
  ],
  [
    "What do credits pay for?",
    "Credits pay for model usage through Entry Gateway. Entry does not add a separate Workspace or sandbox charge.",
  ],
  [
    "Can I ask for changes after the first result?",
    "Yes. Treat the session like a conversation with a coding teammate. Ask it to inspect, revise, test, explain, or undo work.",
  ],
];

export default function GuidePage() {
  return (
    <div className="landing min-h-screen bg-(--l-bg) text-(--l-fg)">
      <LandingNav showSignIn />
      <main className="mx-auto max-w-[1040px] px-6 pb-24 pt-32 md:pt-44">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        <p className="font-mono text-xs uppercase tracking-widest text-(--l-fg-3)">
          Entry Agents
        </p>
        <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tighter sm:text-5xl md:text-6xl">
          Entry Agents, explained for beginners.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-(--l-fg-2)">
          Entry is an AI coding agent. You describe what you want to build or
          fix, and it works inside a private cloud Workspace where it can read
          files, write code, run commands, build software, and test the result.
        </p>

        <section className="mt-16 grid gap-5 md:grid-cols-3">
          <div className="rounded-xl border border-(--l-border) p-6">
            <p className="font-mono text-sm text-(--l-fg-3)">01</p>
            <h2 className="mt-3 text-xl font-semibold">
              Give it a starting point
            </h2>
            <p className="mt-3 leading-relaxed text-(--l-fg-2)">
              Start with a plain-language idea, uploaded files, or an optional
              GitHub repository.
            </p>
          </div>
          <div className="rounded-xl border border-(--l-border) p-6">
            <p className="font-mono text-sm text-(--l-fg-3)">02</p>
            <h2 className="mt-3 text-xl font-semibold">Describe the outcome</h2>
            <p className="mt-3 leading-relaxed text-(--l-fg-2)">
              Say what should change, who it is for, and how you will know it
              works.
            </p>
          </div>
          <div className="rounded-xl border border-(--l-border) p-6">
            <p className="font-mono text-sm text-(--l-fg-3)">03</p>
            <h2 className="mt-3 text-xl font-semibold">Review and iterate</h2>
            <p className="mt-3 leading-relaxed text-(--l-fg-2)">
              Ask Entry to test the result, explain decisions, fix errors, or
              make the next change.
            </p>
          </div>
        </section>

        <section className="mt-20 border-t border-(--l-border) pt-12">
          <h2 className="text-3xl font-semibold tracking-tight">
            What happens in a session?
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-2">
            <li>
              <h3 className="text-xl font-semibold">
                1. A private Workspace starts
              </h3>
              <p className="mt-2 leading-relaxed text-(--l-fg-2)">
                Entry creates an isolated environment for the session. It has a
                filesystem, runtime, outbound network access, and the tools
                needed for software work.
              </p>
            </li>
            <li>
              <h3 className="text-xl font-semibold">
                2. The agent investigates
              </h3>
              <p className="mt-2 leading-relaxed text-(--l-fg-2)">
                It can inspect the repository or files, search for relevant
                information, understand the architecture, and identify the work
                required.
              </p>
            </li>
            <li>
              <h3 className="text-xl font-semibold">3. The agent implements</h3>
              <p className="mt-2 leading-relaxed text-(--l-fg-2)">
                It edits files, creates new files, runs commands, installs
                project dependencies when needed, and builds the requested
                feature.
              </p>
            </li>
            <li>
              <h3 className="text-xl font-semibold">4. You steer the result</h3>
              <p className="mt-2 leading-relaxed text-(--l-fg-2)">
                You remain in control. Ask for tests, request a different
                approach, review the diff, or continue with another task in the
                same project.
              </p>
            </li>
          </ol>
        </section>

        <section className="mt-20 border-t border-(--l-border) pt-12">
          <h2 className="text-3xl font-semibold tracking-tight">
            How to write a good first prompt
          </h2>
          <p className="mt-4 max-w-3xl leading-relaxed text-(--l-fg-2)">
            A useful prompt says what you want, where it belongs, and what
            success looks like. You do not need to know the code or use
            technical language.
          </p>
          <div className="mt-6 rounded-xl bg-(--l-fg) p-6 font-mono text-sm leading-relaxed text-(--l-bg)">
            Build a simple landing page for a tutoring service. Use the existing
            project style, make it work on mobile, add a clear booking
            call-to-action, and run the available checks before you finish.
          </div>
          <p className="mt-4 text-(--l-fg-2)">
            For an existing project, include the area to inspect: “Find why the
            checkout form fails on mobile, reproduce it, fix it, and test the
            fix.”
          </p>
        </section>

        <section className="mt-20 grid gap-12 border-t border-(--l-border) pt-12 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">GitHub is optional</h2>
            <p className="mt-3 leading-relaxed text-(--l-fg-2)">
              You can build from a blank Workspace or uploaded files. When you
              connect GitHub, Entry can work with a repository, branch, commits,
              diffs, and optional pull requests. You do not need GitHub to try
              Entry or receive a finished project.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold">
              Credits are for model usage
            </h2>
            <p className="mt-3 leading-relaxed text-(--l-fg-2)">
              Entry uses credits for the AI work it performs. There is no
              separate Workspace or sandbox charge. Entry Gateway is the
              internal service that routes requests to the available models. See the live{" "}
              <Link className="underline" href="/pricing">
                pricing
              </Link>{" "}
              and{" "}
              <Link className="underline" href="/model">
                model catalog
              </Link>{" "}
              for current details.
            </p>
          </div>
        </section>

        <section className="mt-20 border-t border-(--l-border) pt-12">
          <h2 className="text-3xl font-semibold tracking-tight">
            Beginner glossary
          </h2>
          <dl className="mt-8 grid gap-6 md:grid-cols-2">
            <div>
              <dt className="font-semibold">Agent</dt>
              <dd className="mt-1 leading-relaxed text-(--l-fg-2)">
                The AI worker that plans and performs software tasks.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Workspace</dt>
              <dd className="mt-1 leading-relaxed text-(--l-fg-2)">
                The private environment where files, commands, builds, and tests
                run.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Gateway</dt>
              <dd className="mt-1 leading-relaxed text-(--l-fg-2)">
                Entry’s model-routing layer that connects sessions to supported
                AI models.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Session</dt>
              <dd className="mt-1 leading-relaxed text-(--l-fg-2)">
                A project-focused conversation with its own Workspace and
                history.
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-20 border-t border-(--l-border) pt-12">
          <h2 className="text-3xl font-semibold tracking-tight">
            Common questions
          </h2>
          <div className="mt-8 space-y-8">
            {faqs.map(([question, answer]) => (
              <div key={question}>
                <h3 className="text-lg font-semibold">{question}</h3>
                <p className="mt-2 leading-relaxed text-(--l-fg-2)">{answer}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-16 flex flex-wrap gap-4">
          <Link
            className="rounded-md bg-(--l-fg) px-4 py-2 text-sm font-medium text-(--l-bg)"
            href="/get-started"
          >
            Start building
          </Link>
          <Link
            className="rounded-md border border-(--l-border) px-4 py-2 text-sm font-medium"
            href="/ai-coding-agent"
          >
            Learn how Entry works
          </Link>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
