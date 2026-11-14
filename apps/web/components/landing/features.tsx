"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FeatureAgent } from "./feature-agent";
import { FeatureSandbox } from "./feature-sandbox";
import { FeatureWorkflow } from "./feature-workflow";
import { Stage } from "./stage";
import { Window } from "./window";

function Spotlight({
  title,
  description,
  bullets,
  flip,
  window: windowContent,
}: {
  readonly title: string;
  readonly description: string;
  readonly bullets: readonly string[];
  readonly flip?: boolean;
  readonly window: ReactNode;
}) {
  return (
    <div className="grid items-center gap-8 border-t border-(--l-border) py-14 sm:py-20 lg:grid-cols-12 lg:gap-12">
      <div className={cn("lg:col-span-5", flip ? "lg:order-2" : "lg:order-1")}>
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
          {title}
        </h2>
        <p className="mt-4 max-w-[58ch] text-pretty text-base leading-relaxed text-(--l-fg-2)">
          {description}
        </p>
        <ul className="mt-5 space-y-2.5 sm:mt-6">
          {bullets.map((b) => (
            <li
              key={b}
              className="flex items-start gap-3 text-sm leading-relaxed text-(--l-fg-2) sm:text-base"
            >
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-(--l-fg-3)" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={cn("lg:col-span-7", flip ? "lg:order-1" : "lg:order-2")}>
        <Stage>
          <Window>{windowContent}</Window>
        </Stage>
      </div>
    </div>
  );
}

export function LandingFeatures() {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
        <Spotlight
          title="Specialists that coordinate cleanly"
          description="Delegate architecture, codebase discovery, implementation, and review to focused subagents that share a structured Team Board and clean handoff notes."
          bullets={[
            "Architect, Explorer, Executor, Reviewer, and Design roles",
            "Shared Team Board for task checklists & cross-agent decisions",
            "Inspect any subagent trace live from the session header",
          ]}
          window={<FeatureAgent />}
        />

        <Spotlight
          title="Cloud sandboxes, not local machines"
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
          title="Durable workflows that survive anything"
          description="Agent turns execute as checkpointed workflows with lifecycle plugins and /commands. Close your browser mid-run and reconnect straight back into the live stream."
          bullets={[
            "Resumable step checkpoints with zero lost token output",
            "Plugin hooks for pre/post tool redaction and quality gates",
            "Post-turn metering, diff caching, and optional auto-PR sync",
          ]}
          window={<FeatureWorkflow />}
        />
      </div>
    </section>
  );
}
