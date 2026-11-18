import Link from "next/link";

const faqs: readonly { question: string; answer: string }[] = [
  {
    question: "What is Entry Agents",
    answer:
      "Entry Agents is a cloud software engineering workspace where every session runs inside an isolated Linux environment with git branches, terminal, live preview, connected workplace apps, and wave-coordinated specialist multi-agent teams.",
  },
  {
    question: "How is Team Mode different from single-agent mode",
    answer:
      "By default, Entry executes directly in a fast single-agent loop so focused fixes finish immediately. For broad multi-file builds, Team Mode coordinates dependency waves visibly inside your main chat: Wave 0 locks interface contracts, parallel builders edit disjoint files, and reviewers verify tests and diffs.",
  },
  {
    question: "What do plans cost and how does 99% prompt caching work",
    answer:
      "Paid plans start at $5/mo (Plus, $10 credit) and go up to $13/mo Entry ($50 credit, 3.8x value), $20/mo Pro ($100 credit), and $40/mo Max ($180 credit) with zero per-token markup. Prompt caching reuses repository context and workspace history across turns, cutting repeat token costs by up to 99%.",
  },
  {
    question: "What happens if I lose internet or close my browser mid-turn",
    answer:
      "All work runs on durable cloud checkpoints. If you drop cellular signal, close your laptop, or open the session on your phone, Entry finishes the turn on the server and automatically reconciles every message and file diff when you reconnect.",
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
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
        <div className="grid gap-10 border-t border-(--l-border) py-16 md:py-24 lg:grid-cols-[minmax(240px,360px)_1fr]">
          <div className="min-w-0">
            <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Frequently asked questions
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-(--l-fg-2)">
              How workspaces run in the cloud, how inline team mode coordinates,
              and how usage pricing works. See{" "}
              <Link
                href="/pricing"
                className="underline underline-offset-4 hover:text-(--l-fg)"
              >
                pricing
              </Link>{" "}
              and{" "}
              <Link
                href="/model"
                className="underline underline-offset-4 hover:text-(--l-fg)"
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
                  <span
                    aria-hidden="true"
                    className="font-mono text-xs text-(--l-fg-3) transition-transform duration-150 group-open:rotate-45"
                  >
                    +
                  </span>
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
