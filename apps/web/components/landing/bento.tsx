"use client";

import { motion } from "motion/react";
import Link from "next/link";

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

type BentoItem = {
  readonly id: string;
  readonly title: string;
  readonly tag: string;
  readonly body: string;
};

const items: readonly BentoItem[] = [
  {
    id: "001",
    title: "Coordinated Agent Team",
    tag: "MULTI-AGENT",
    body: "Delegate to Architect, Explorer, Executor, Reviewer, and Design subagents sharing a structured Team Board for handoffs and task checklists.",
  },
  {
    id: "002",
    title: "Plugin SDK & Hooks",
    tag: "EXTENSIBLE",
    body: "Intercept tool execution, inject context, register custom /commands, and enforce automated verification gates before responses finish.",
  },
  {
    id: "003",
    title: "Durable Workflows",
    tag: "RESUMABLE",
    body: "Every turn runs as a checkpointed Workflow SDK pipeline that survives tab closes, disconnects, and sandbox restarts without losing state.",
  },
  {
    id: "004",
    title: "Cloud Workspaces",
    tag: "SANDBOXED",
    body: "Isolated machines per session with terminal, filesystem, diff inspection, auto-hibernate snapshots, and direct git branch management.",
  },
  {
    id: "005",
    title: "Unified Models & MCP",
    tag: "OPEN PROTOCOL",
    body: "Switch models mid-session without disrupting running work, and connect external stdio or HTTP MCP servers to extend agent capabilities.",
  },
  {
    id: "006",
    title: "Zero-Trust Secret Vault",
    tag: "AES-256-GCM",
    body: "Encrypt personal API keys and plugin secrets at rest with automatic output redaction — injected only inside sandbox execution boundaries.",
  },
];

function Mark({ index }: { readonly index: number }) {
  if (index === 0) {
    return (
      <div className="relative h-6 w-8" aria-hidden="true">
        <span className="absolute left-0 top-0 size-2 border border-(--l-fg-4) transition-colors group-hover:border-(--l-accent)" />
        <span className="absolute right-0 top-0 size-2 border border-(--l-fg-4)" />
        <span className="absolute bottom-0 left-1/2 size-2 -translate-x-1/2 border border-(--l-fg-4)" />
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="flex items-center gap-1" aria-hidden="true">
        <span className="size-2 border border-(--l-fg-4)" />
        <span className="h-px w-3 bg-(--l-fg-4)" />
        <span className="size-2 border border-(--l-fg-4) transition-colors group-hover:border-(--l-accent)" />
      </div>
    );
  }
  if (index === 2) {
    return (
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="h-px w-4 bg-(--l-fg-4)" />
        <span className="h-px w-6 bg-(--l-fg-4) transition-colors group-hover:bg-(--l-accent)" />
        <span className="h-px w-3 bg-(--l-fg-4)" />
      </div>
    );
  }
  if (index === 3) {
    return (
      <div className="grid grid-cols-2 gap-1" aria-hidden="true">
        <span className="size-2 border border-(--l-fg-4)" />
        <span className="size-2 border border-(--l-fg-4) transition-colors group-hover:border-(--l-accent)" />
        <span className="size-2 border border-(--l-fg-4)" />
        <span className="size-2 border border-(--l-fg-4)" />
      </div>
    );
  }
  if (index === 4) {
    return (
      <div className="flex flex-col gap-1" aria-hidden="true">
        <span className="h-1 w-8 border border-(--l-fg-4)" />
        <span className="h-1 w-6 border border-(--l-fg-4) transition-colors group-hover:border-(--l-accent)" />
        <span className="h-1 w-4 border border-(--l-fg-4)" />
      </div>
    );
  }
  return (
    <div
      className="flex size-6 items-center justify-center border border-(--l-fg-4)"
      aria-hidden="true"
    >
      <span className="size-2 bg-(--l-fg-4) transition-colors group-hover:bg-(--l-accent)" />
    </div>
  );
}

export function LandingBento() {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] border-t border-(--l-border-subtle)">
        <div className="grid gap-6 border-b border-(--l-border) px-6 py-14 pb-10 sm:gap-10 sm:px-10 md:grid-cols-2 md:gap-0 md:py-24 md:pb-14">
          <div>
            <h2 className="text-balance text-3xl font-semibold leading-[1.05] tracking-tighter sm:text-4xl md:text-6xl">
              Infrastructure
              <br />
              that ships.
            </h2>
          </div>
          <div className="md:pl-10">
            <p className="max-w-md text-balance text-base leading-relaxed text-(--l-fg-2)">
              Built for real engineering workflows: specialized subagent teams,
              typed lifecycle plugins, encrypted secrets, and cloud sandboxes
              connected end-to-end.
            </p>
            <div className="mt-6">
              <Link
                href="/login"
                className="inline-flex min-h-9 items-center rounded-md bg-(--l-fg) px-4 text-sm font-medium text-(--l-bg) transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.97]"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, transform: "translateY(10px)" }}
              whileInView={{ opacity: 1, transform: "translateY(0px)" }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{
                duration: 0.35,
                delay: (index % 3) * 0.05,
                ease: EASE_OUT_QUINT,
              }}
              className="group flex h-full flex-col border-b border-(--l-border) px-6 py-8 transition-colors hover:bg-(--l-surface-3) md:border-r md:px-9 md:py-9 lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-child(n+4)]:border-b-0"
            >
              <div className="flex items-center justify-between font-mono text-[11px] text-(--l-fg-4)">
                <span>{item.id}</span>
                <span>{item.tag}</span>
              </div>
              <div className="mt-7 flex h-10 items-center">
                <Mark index={index} />
              </div>
              <h3 className="mt-6 text-balance text-xl font-semibold tracking-tight sm:text-2xl">
                {item.title}
              </h3>
              <p className="mt-3 flex-1 text-pretty text-sm leading-relaxed text-(--l-fg-2)">
                {item.body}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
