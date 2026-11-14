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
          title="Fast by default. Specialist team when you invoke it."
          description="Everyday edits and bug fixes run directly in a tight single-agent loop with zero orchestration overhead. When you tackle a cross-cutting feature or UI overhaul, invoke /skills or dispatch focused subagents on demand."
          bullets={[
            "Direct single-agent execution for fast everyday coding",
            "Invoke /unslop, /frontend-design, /code-review, or /plan-mode in one keystroke",
            "Dispatch /architect, /explorer, /executor, /reviewer, or /design when needed",
          ]}
          window={<FeatureAgent />}
        />

        <Spotlight
          title="Cloud sandboxes with your entire stack connected"
          description="Every session provisions an isolated Linux workspace with repository checkout, terminal, live dev preview, and 1-click integrations with GitHub, Vercel, Gmail, Slack, Linear, and Notion."
          bullets={[
            "Instant branch isolation with interactive diff & file review",
            "Auto-hibernate on inactivity with instant workspace restore",
            "Connect Gmail, Slack, Notion, Linear, and Calendar from Settings",
          ]}
          flip
          window={<FeatureSandbox />}
        />

        <Spotlight
          title="Durable workflows that never drop a turn"
          description="Agent turns execute on checkpointed server workflows. Toggle off cellular data, lose Wi-Fi, or switch from laptop to phone mid-turn — Entry keeps working and syncs your chat automatically."
          bullets={[
            "Zero lost output across network drops or page reloads",
            "Switch models or reasoning effort mid-run for your next prompt",
            "Automatic diff snapshots and optional PR creation when done",
          ]}
          window={<FeatureWorkflow />}
        />
      </div>
    </section>
  );
}
