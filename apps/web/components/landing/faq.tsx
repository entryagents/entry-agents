import { Plus } from "lucide-react";
import Link from "next/link";

const faqs: readonly { question: string; answer: string }[] = [
  {
    question: "What is Entry Agents",
    answer:
      "Entry Agents is a cloud coding workspace where every session runs inside an isolated Ubuntu environment with git branches, terminal, live port previews, connected tools, and durable background execution.",
  },
  {
    question: "How is Team Mode different from single-agent mode",
    answer:
      "Routine tasks execute directly in a fast single-agent loop so focused fixes finish immediately. For broad multi-file builds, Team Mode coordinates specialists with non-overlapping file edits visibly inside the same chat.",
  },
  {
    question: "How do credits and plans work",
    answer:
      "Plans include monthly AI credits with zero per-token markup, billed at provider model rates. Start free with a $1 trial credit, or move to Plus ($3/mo) or Builder ($10/mo) for higher allowances and dedicated VMs.",
  },
  {
    question: "What happens if I lose internet or close my browser mid-turn",
    answer:
      "All work runs on durable server checkpoints. If you drop signal, close your laptop, or open the session on your phone, Entry finishes the turn on the server and reconciles every message and diff when you return.",
  },
  {
    question: "Which tools and workplace apps can the agent use",
    answer:
      "Beyond native GitHub repositories and Vercel previews, you can connect Gmail, Slack, Notion, Linear, Google Calendar, Google Drive, Jira, Figma, and custom MCP tools from Settings → Connections.",
  },
  {
    question: "Do I need a GitHub repository to start",
    answer:
      "No. You can start with a blank cloud workspace or uploaded files, build and preview an application directly, and optionally connect a repository later to commit and open pull requests.",
  },
];

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: f.answer,
    },
  })),
};

export function LandingFaq() {
  return (
    <section aria-label="Frequently asked questions">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <div className="grid gap-10 border-t border-(--l-border) py-16 sm:py-24 lg:grid-cols-[minmax(240px,360px)_1fr]">
          <div className="min-w-0">
            <h2 className="font-display text-balance text-3xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-4xl">
              Frequently asked questions
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-(--l-fg-2)">
              How workspaces run in the cloud, how credits are billed, and how
              sessions survive disconnect. See{" "}
              <Link
                href="/pricing"
                className="underline decoration-(--l-border) underline-offset-4 transition-colors hover:text-(--l-fg)"
              >
                pricing
              </Link>{" "}
              and{" "}
              <Link
                href="/model"
                className="underline decoration-(--l-border) underline-offset-4 transition-colors hover:text-(--l-fg)"
              >
                models
              </Link>{" "}
              for live rates.
            </p>
          </div>

          <div className="min-w-0 divide-y divide-(--l-border-subtle) border-y border-(--l-border-subtle)">
            {faqs.map((f, index) => (
              <details
                key={f.question}
                open={index === 0}
                className="group py-5"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-(--l-fg) marker:content-none [&::-webkit-details-marker]:hidden">
                  <span>{f.question}</span>
                  <Plus
                    aria-hidden="true"
                    className="size-4 shrink-0 text-(--l-fg-3) transition-transform duration-150 group-open:rotate-45"
                    strokeWidth={1.5}
                  />
                </summary>
                <p className="mt-3 pr-8 text-sm leading-relaxed text-(--l-fg-2)">
                  {f.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
