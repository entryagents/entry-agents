"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SITE_URL } from "@/lib/site";

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

const faqs: readonly { question: string; answer: string }[] = [
  {
    question: "What is Entry Agents?",
    answer:
      "Entry Agents is a cloud platform for autonomous AI software engineering. A main agent coordinates specialized Architect, Explorer, Executor, Reviewer, and Design subagents inside a private cloud Workspace with filesystem, terminal, MCP, and git integration.",
  },
  {
    question: "How does the multi-agent team work together?",
    answer:
      "Subagents coordinate through a persistent shared Team Board where architectural plans, file discoveries, task checklists, and verification status are posted cleanly. You can inspect every subagent's reasoning, tool calls, and token usage live inside the Agent Team Hub.",
  },
  {
    question: "Can I extend Entry with plugins and custom /commands?",
    answer:
      "Yes. Built-in and custom plugins hook into context assembly, tool execution boundaries (with secret/PII redaction), permission rules, and custom composer slash commands — configurable securely per user in Settings → Plugins.",
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
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section aria-label="Frequently asked questions">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <div className="mx-auto max-w-[1320px] md:border-t md:border-(--l-border)">
        <div className="grid gap-10 px-6 py-16 sm:px-10 md:py-24 lg:grid-cols-[minmax(240px,340px)_1fr]">
          <div>
            <div className="font-mono text-xs uppercase tracking-widest text-(--l-fg-3)">
              FAQ
            </div>
            <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tighter sm:text-3xl md:text-4xl">
              Questions,
              <br />
              answered.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-(--l-fg-2)">
              What Entry Agents is, how the agent team works, and how plugins
              and sandboxes stay secure. More on the{" "}
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
                model
              </a>{" "}
              pages.
            </p>
          </div>

          <div className="border-t border-(--l-border-subtle)">
            {faqs.map((f, index) => {
              const isOpen = openIndex === index;
              return (
                <div
                  key={f.question}
                  className="border-b border-(--l-border-subtle)"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left text-sm font-medium text-(--l-fg) transition-colors hover:text-(--l-fg-2)"
                  >
                    <span>{f.question}</span>
                    <motion.span
                      aria-hidden="true"
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ duration: 0.18, ease: EASE_OUT_QUINT }}
                      className="shrink-0 font-mono text-base text-(--l-fg-3)"
                    >
                      +
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: EASE_OUT_QUINT }}
                        className="overflow-hidden"
                      >
                        <p className="pb-5 pr-8 text-sm leading-relaxed text-(--l-fg-2)">
                          {f.answer}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
