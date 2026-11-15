"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FeatureAgent } from "./feature-agent";
import { FeatureSandbox } from "./feature-sandbox";
import { FeatureWorkflow } from "./feature-workflow";
import { Stage } from "./stage";
import { Window } from "./window";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

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
    <div className="grid items-center gap-8 border-t border-(--l-border) py-12 sm:py-20 lg:grid-cols-12 lg:gap-12">
      <motion.div
        initial={{ opacity: 0, transform: "translateY(12px)" }}
        whileInView={{ opacity: 1, transform: "translateY(0px)" }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 0.36, ease: EASE_OUT }}
        className={cn(
          "min-w-0 lg:col-span-5",
          flip ? "lg:order-2" : "lg:order-1",
        )}
      >
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
          {title}
        </h2>
        <p className="mt-4 max-w-[58ch] text-pretty text-base leading-relaxed text-(--l-fg-2)">
          {description}
        </p>
        <ul className="mt-6 space-y-3">
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
      </motion.div>

      <motion.div
        initial={{ opacity: 0, transform: "translateY(14px) scale(0.98)" }}
        whileInView={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.4, delay: 0.05, ease: EASE_OUT }}
        className={cn(
          "min-w-0 lg:col-span-7",
          flip ? "lg:order-1" : "lg:order-2",
        )}
      >
        <Stage>
          <Window>{windowContent}</Window>
        </Stage>
      </motion.div>
    </div>
  );
}

export function LandingFeatures() {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
        <Spotlight
          title="Fast alone. Coordinated inline when a feature spans the codebase"
          description="Routine changes execute straight through in a fast single-agent loop with zero overhead. When work requires parallel discovery, implementation, and review, Entry runs specialists visibly inside the same chat turn."
          bullets={[
            "Direct single-agent path for everyday fixes and refactors",
            "Live in-chat Team timeline with non-overlapping file ownership",
            "Inspect any individual specialist transcript without losing your place",
          ]}
          window={<FeatureAgent />}
        />

        <Spotlight
          title="Isolated Linux workspaces connected to your entire stack"
          description="Every session provisions a clean cloud container checked out to your branch with shell, code editor, live app preview, and one-click connections to GitHub, Vercel, Gmail, Slack, Linear, and Notion."
          bullets={[
            "Live side-by-side diffs, branch commits, and one-click pull requests",
            "Automatic idle snapshots so your files and dependencies stay ready",
            "Read tickets, inspect threads, and post updates through Settings → Connections",
          ]}
          flip
          window={<FeatureSandbox />}
        />

        <Spotlight
          title="Durable cloud runs that finish even when your connection drops"
          description="Every prompt executes on server-side checkpoints. Toggle off cellular data, close your laptop, or pick up from your phone mid-turn and your session catches up cleanly the moment you reconnect."
          bullets={[
            "Zero lost output across network interruptions or browser reloads",
            "Switch models or reasoning depth between turns inside the same workspace",
            "Every code edit and command result persists directly to session history",
          ]}
          window={<FeatureWorkflow />}
        />
      </div>
    </section>
  );
}
