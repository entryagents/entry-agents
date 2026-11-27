import { Plus } from "lucide-react";
import Link from "next/link";

const faqs: readonly { question: string; answer: string }[] = [
  {
    question: "What happens if I close my browser or lose signal mid-turn",
    answer:
      "Every turn runs on durable server checkpoints rather than your browser tab. If your laptop sleeps or you switch to your phone, the agent finishes on the server and reconciles every message and file diff when you return.",
  },
  {
    question: "How do credits and usage windows work",
    answer:
      "Model usage is billed directly against your monthly credit allowance at published provider token rates with zero markup. See live plans, credits, and usage windows on Pricing.",
  },
  {
    question: "Do I need a GitHub repository to start",
    answer:
      "No. You can start from a blank Ubuntu workspace or uploaded files, build and preview an application live, and optionally attach a GitHub repository later when you are ready to commit or open a pull request.",
  },
  {
    question: "Which tools and workplace apps can agents connect to",
    answer:
      "Alongside native GitHub repositories and Vercel previews, you can authorize Gmail, Slack, Notion, Linear, Google Calendar, Jira, Figma, and custom MCP servers from Settings → Connections.",
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
            <h2 className="font-display text-balance text-3xl font-semibold leading-[1.06] tracking-[-0.03em] sm:text-4xl">
              Questions, answered
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-(--l-fg-2)">
              Practical details on durability, credits, and connections. For
              hands-on prompt recipes see the{" "}
              <Link
                href="/guide"
                className="underline decoration-(--l-border) underline-offset-4 transition-colors hover:text-(--l-fg)"
              >
                builder guide
              </Link>
              .
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
