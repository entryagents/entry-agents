import { SITE_URL } from "@/lib/site";

const faqs: readonly { question: string; answer: string }[] = [
  {
    question: "What is Entry Agents?",
    answer:
      "Entry Agents is a cloud platform for autonomous software engineering. A main agent coordinates specialized Architect, Explorer, Executor, Reviewer, and Design subagents inside an isolated cloud Workspace with filesystem, terminal, MCP, and git integration.",
  },
  {
    question: "How does the multi-agent team work together?",
    answer:
      "Subagents coordinate through a shared Team Board where architectural plans, file discoveries, task checklists, and verification status are posted cleanly. You can inspect every subagent's reasoning, tool calls, and token usage live from the session header.",
  },
  {
    question: "Can I extend Entry with plugins and custom /commands?",
    answer:
      "Yes. Built-in and custom plugins hook into context assembly, tool execution boundaries (with secret/PII redaction), permission rules, and composer slash commands — configurable per user in Settings → Plugins.",
  },
  {
    question: "How does Entry handle disconnects and long-running tasks?",
    answer:
      "Every turn runs on durable Workflow SDK checkpoints backed by Redis streams and Postgres. You can close your laptop or switch devices mid-run and reconnect straight back into the live execution stream with zero lost output.",
  },
  {
    question: "How does Entry Agents keep my code and API keys safe?",
    answer:
      "Each session runs inside its own isolated Workspace boundary. OAuth tokens and personal API secrets are encrypted with AES-256-GCM at rest, injected only at tool execution time, and automatically scrubbed from tool output logs.",
  },
  {
    question: "Which AI models and MCP servers does Entry Agents support?",
    answer:
      "Entry supports Claude, GPT, Gemini, DeepSeek, and gateway models with mid-session switching, alongside user-configured stdio and HTTP MCP servers available to your agent inside the sandbox.",
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
          <div>
            <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Frequently asked questions
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-(--l-fg-2)">
              How Entry Agents works, how the specialist agent team coordinates,
              and how sandboxes and runtime secrets stay isolated. See{" "}
              <a
                href={`${SITE_URL}/pricing`}
                className="underline underline-offset-4 hover:text-(--l-fg)"
              >
                pricing
              </a>{" "}
              and{" "}
              <a
                href={`${SITE_URL}/model`}
                className="underline underline-offset-4 hover:text-(--l-fg)"
              >
                models
              </a>{" "}
              for token rates.
            </p>
          </div>

          <div className="divide-y divide-(--l-border-subtle) border-y border-(--l-border-subtle)">
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
                    className="font-mono text-xs text-(--l-fg-3) transition-transform group-open:rotate-45"
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
