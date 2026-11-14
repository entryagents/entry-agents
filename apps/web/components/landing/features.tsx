"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FeatureAgent } from "./feature-agent";
import { FeatureSandbox } from "./feature-sandbox";
import { FeatureWorkflow } from "./feature-workflow";
import { Stage, type StageTone } from "./stage";
import { Window } from "./window";

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

function Spotlight({
  indexTag,
  tone,
  title,
  description,
  bullets,
  flip,
  window: windowContent,
}: {
  readonly indexTag: string;
  readonly tone: StageTone;
  readonly title: string;
  readonly description: string;
  readonly bullets: readonly string[];
  readonly flip?: boolean;
  readonly window: ReactNode;
}) {
  return (
    <div className="grid items-center md:grid-cols-2">
      <motion.div
        initial={{ opacity: 0, transform: "translateY(12px)" }}
        whileInView={{ opacity: 1, transform: "translateY(0px)" }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
        className={cn(
          "px-6 py-16 sm:px-10 md:py-20 lg:py-24",
          flip ? "order-1 md:order-2" : "order-1 md:order-1",
        )}
      >
        <div className="mb-3 font-mono text-[11px] uppercase tracking-widest text-(--l-fg-4)">
          {indexTag}
        </div>
        <h2 className="text-balance text-2xl font-semibold tracking-tighter sm:text-3xl md:text-4xl">
          {title}
        </h2>
        <p className="mt-4 text-balance text-base leading-relaxed text-(--l-fg-2) sm:mt-5 sm:text-lg">
          {description}
        </p>
        <ul className="mt-5 space-y-3 sm:mt-6">
          {bullets.map((b) => (
            <li
              key={b}
              className="flex items-center gap-3 text-(--l-fg-2) sm:text-base"
            >
              <span className="h-1.5 w-1.5 shrink-0 bg-(--l-accent)" />
              {b}
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, transform: "translateY(14px)" }}
        whileInView={{ opacity: 1, transform: "translateY(0px)" }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.45, delay: 0.06, ease: EASE_OUT_QUINT }}
        className={flip ? "order-2 -mr-px md:order-1" : "order-2 md:order-2"}
      >
        <Stage tone={tone}>
          <div className="mx-auto w-full max-w-[1160px]">
            <Window>{windowContent}</Window>
          </div>
        </Stage>
      </motion.div>
    </div>
  );
}

export function LandingFeatures() {
  return (
    <section>
      <div className="relative mx-auto max-w-[1320px] overflow-hidden">
        <div
          className="absolute left-1/2 top-0 hidden h-full w-px md:block"
          style={{ backgroundColor: "var(--l-border)" }}
        />
        <div>
          <Spotlight
            indexTag="01 // Multi-Agent Team"
            tone="slate"
            title="Specialists that coordinate cleanly."
            description="Delegate architecture, codebase discovery, implementation, and security review to focused subagents that share a structured Team Board and clean handoff notes."
            bullets={[
              "Architect, Explorer, Executor, Reviewer, and Design roles",
              "Shared Team Board for task checklists & cross-agent decisions",
              "Inspect any subagent trace live from the Agent Team Hub",
            ]}
            window={<FeatureAgent />}
          />

          <Spotlight
            indexTag="02 // Cloud Sandboxes"
            tone="ash"
            title="Cloud sandboxes, not local machines."
            description="Every session provisions an isolated Workspace with repository checkout, terminal, live dev preview, and encrypted runtime secrets — hibernating automatically when idle."
            bullets={[
              "Instant branch isolation with interactive diff & file review",
              "Auto-hibernate on inactivity with deterministic restore",
              "Scoped GitHub & API secret injection without token leakage",
            ]}
            flip
            window={<FeatureSandbox />}
          />

          <Spotlight
            indexTag="03 // Durable Runtime & Plugins"
            tone="iron"
            title="Durable workflows that survive anything."
            description="Agent turns execute as checkpointed workflows with custom lifecycle plugins and /commands. Close your browser mid-run and reconnect straight back into the live stream."
            bullets={[
              "Resumable step checkpoints with zero lost token output",
              "Plugin hooks for pre/post tool redaction and quality gates",
              "Post-turn metering, diff caching, and optional auto-PR sync",
            ]}
            window={<FeatureWorkflow />}
          />
        </div>
      </div>
    </section>
  );
}
