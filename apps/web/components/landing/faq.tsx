import { SITE_URL } from "@/lib/site";

const faqs: readonly { question: string; answer: string }[] = [
  {
    question: "What is Entry Agents?",
    answer:
      "Entry Agents is a cloud platform for autonomous AI agents that build software, investigate issues, run tests, and coordinate across repositories. Every session runs in a private Workspace with filesystem, outbound network, and containerized runtime access.",
  },
  {
    question: "How does an Entry Agents session work?",
    answer:
      "Each session provisions an isolated cloud worktree. Start from a blank workspace, attach a GitHub repository, or ask the agent team to implement a feature. Specialized subagents plan the architecture, execute changes, verify test suites, and create git commits for review.",
  },
  {
    question: "Which AI models does Entry Agents support?",
    answer:
      "Entry Agents routes through Entry Gateway, supporting frontier models from Anthropic, OpenAI, and Google with usage tracking and observability.",
  },
  {
    question: "Do I need to install anything to use Entry Agents?",
    answer:
      "No. Entry Agents runs entirely in cloud sandboxes. Sign in and start working immediately without requiring local toolchains, Docker daemons, or dependencies on your machine.",
  },
  {
    question: "How does Entry Agents keep code safe?",
    answer:
      "Every session runs in an isolated workspace with ephemeral containers. Repositories connect through encrypted OAuth scopes. Agents only touch the files and branches you explicitly authorize.",
  },
  {
    question: "What does Entry Agents cost?",
    answer:
      "Usage is credit-based for model tokens. Subscriptions include monthly compute credits and direct observability over every run.",
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
      <div className="mx-auto max-w-[1320px] md:border-t md:border-(--l-border)">
        <div className="grid gap-10 px-6 py-16 sm:px-10 md:py-24 lg:grid-cols-[minmax(240px,340px)_1fr]">
          <div>
            <h2 className="text-balance text-2xl font-semibold tracking-tighter sm:text-3xl md:text-4xl">
              Questions,
              <br />
              answered.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-(--l-fg-2)">
              Architecture, sandboxing, and session execution. More on the{" "}
              <a
                href={`${SITE_URL}/pricing`}
                className="underline underline-offset-4 transition-colors hover:text-(--l-fg) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)"
              >
                pricing
              </a>{" "}
              and{" "}
              <a
                href={`${SITE_URL}/model`}
                className="underline underline-offset-4 transition-colors hover:text-(--l-fg) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)"
              >
                model
              </a>{" "}
              pages.
            </p>
          </div>

          <div className="border-t border-(--l-border-subtle)">
            {faqs.map((f) => (
              <details
                key={f.question}
                className="group border-b border-(--l-border-subtle)"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-sm font-medium text-(--l-fg) marker:hidden [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)">
                  {f.question}
                  <span
                    aria-hidden="true"
                    className="text-(--l-fg-3) transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-5 pr-8 text-sm leading-relaxed text-(--l-fg-2)">
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
