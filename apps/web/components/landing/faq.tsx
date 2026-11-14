import { SITE_URL } from "@/lib/site";

const faqs: readonly { question: string; answer: string }[] = [
  {
    question: "What is Entry Agents?",
    answer:
      "Entry Agents is a cloud coding platform where each session runs inside an isolated Linux workspace with git, terminal, live preview, invocable /skills, and on-demand specialist subagents.",
  },
  {
    question: "Does Entry always run 5 agents on every prompt?",
    answer:
      "No. By default, Entry executes directly in a fast single-agent loop so everyday edits, questions, and bug fixes happen immediately. Specialist subagents (/architect, /explorer, /executor, /reviewer, /design) are dispatched only when you invoke them or when a large multi-file task benefits from parallel work.",
  },
  {
    question: "How do /skills work?",
    answer:
      "Entry ships with 17 built-in skills — including /unslop, /frontend-design, /code-review, /plan-mode, and /composio — and lets you install GitHub skill repositories in one click from Settings → Skills. Type / in the chat composer to invoke any skill.",
  },
  {
    question: "What happens if I lose internet or close my browser mid-turn?",
    answer:
      "Every turn executes on durable server checkpoints. If you toggle off mobile data, lose Wi-Fi, or switch devices, the agent finishes its work in the cloud and automatically syncs the conversation as soon as you reconnect.",
  },
  {
    question: "Which apps and integrations can the agent use?",
    answer:
      "In addition to native GitHub and Vercel integrations, you can connect Gmail, Slack, Notion, Linear, Google Calendar, Google Drive, Jira, Figma, and Discord from Settings → Connections.",
  },
  {
    question: "Which AI models are supported?",
    answer:
      "Entry supports Anthropic Claude, OpenAI GPT, Google Gemini, DeepSeek, and xAI Grok models with automatic prompt prefix caching and mid-session model switching.",
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
