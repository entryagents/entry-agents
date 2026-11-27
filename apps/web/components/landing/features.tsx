"use client";

import {
  Check,
  CheckCircle2,
  GitBranch,
  Globe,
  Laptop,
  Server,
  Smartphone,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type CapabilityId = "vm" | "durable" | "waves" | "models";

const CAPABILITIES: readonly {
  readonly id: CapabilityId;
  readonly index: string;
  readonly title: string;
  readonly summary: string;
}[] = [
  {
    id: "vm",
    index: "01",
    title: "Dedicated Ubuntu VM per session",
    summary:
      "Every chat gets a private Linux workspace with its own filesystem, persistent dev servers, real git branches, and live HTTPS previews.",
  },
  {
    id: "durable",
    index: "02",
    title: "Durable runs that outlive your tab",
    summary:
      "Turns execute on server checkpoints. Close your laptop or switch to your phone mid-turn and return to finished tests and clean diffs.",
  },
  {
    id: "waves",
    index: "03",
    title: "Direct loop or parallel Team Waves",
    summary:
      "Focused fixes run straight through in one pass. Cross-module builds split disjoint files across parallel builders inside the same thread.",
  },
  {
    id: "models",
    index: "04",
    title: "Switch frontier models mid-chat",
    summary:
      "Move between Claude Opus 5.5, GPT-5.6, and fast open coding models in the same session with prompt caching and zero token markup.",
  },
];

const VM_SPECS = [
  { label: "Environment", value: "Ubuntu 24.04" },
  { label: "Compute", value: "2 vCPU · 8 GiB" },
  { label: "Preview", value: "Live HTTPS" },
  { label: "Idle policy", value: "Auto-suspend" },
] as const;

const CHECKPOINT_TIMELINE = [
  {
    time: "14:18",
    title: "Step 14 checkpoint persisted",
    detail: "State saved on server before long test suite",
    state: "done" as const,
  },
  {
    time: "14:19",
    title: "Browser disconnected",
    detail: "Laptop closed mid-turn — workflow keeps running",
    state: "offline" as const,
  },
  {
    time: "14:21",
    title: "Steps 15–22 completed on server",
    detail: "18 tests passing · PR #324 pushed to origin",
    state: "active" as const,
  },
  {
    time: "14:24",
    title: "Reconciled on mobile",
    detail: "4 files (+248 -19) and preview synced cleanly",
    state: "done" as const,
  },
] as const;

const MODEL_ROWS = [
  {
    name: "Claude Opus 5.5",
    family: "Anthropic",
    context: "1M ctx",
    role: "Deep architecture & refactors",
    active: true,
  },
  {
    name: "GPT-5.6 Sol",
    family: "OpenAI",
    context: "1.05M ctx",
    role: "Complex debugging & verification",
    active: false,
  },
  {
    name: "Claude Sonnet 5",
    family: "Anthropic",
    context: "1M ctx",
    role: "Fast everyday feature builds",
    active: false,
  },
  {
    name: "DeepSeek V4.1 Flash",
    family: "DeepSeek",
    context: "1M ctx",
    role: "High-allowance starter & iteration",
    active: false,
  },
] as const;

export function LandingFeatures() {
  const [activeId, setActiveId] = useState<CapabilityId>("vm");

  return (
    <section aria-label="Core workspace capabilities">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <div className="border-t border-(--l-border) py-16 sm:py-24">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-xl">
              <h2 className="font-display text-balance text-3xl font-semibold leading-[1.06] tracking-[-0.03em] sm:text-4xl">
                Built for branches that actually ship
              </h2>
              <p className="mt-3 text-pretty text-base leading-relaxed text-(--l-fg-2)">
                Real Linux execution, server-checkpointed runs, and multi-file
                coordination inside one workspace.
              </p>
            </div>
          </div>

          {/* Flush hairline-divided interactive architectural stage */}
          <div className="mt-10 overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-surface)">
            <div className="grid lg:grid-cols-12">
              {/* Left Rail: 4 Interactive Capability Selectors */}
              <div
                role="tablist"
                aria-label="Workspace capabilities"
                className="divide-y divide-(--l-border) lg:col-span-5"
              >
                {CAPABILITIES.map((cap) => {
                  const isSelected = cap.id === activeId;
                  return (
                    <button
                      key={cap.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setActiveId(cap.id)}
                      className={`group relative flex w-full cursor-pointer flex-col px-5 py-5 text-left transition-colors duration-150 sm:px-6 ${
                        isSelected
                          ? "bg-(--l-panel)"
                          : "bg-(--l-surface) hover:bg-(--l-surface-2)"
                      }`}
                    >
                      {isSelected && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 w-0.5 bg-(--l-fg)"
                        />
                      )}
                      <div className="flex items-baseline gap-3">
                        <span
                          className={`font-mono text-xs tabular-nums ${
                            isSelected ? "text-(--l-accent)" : "text-(--l-fg-3)"
                          }`}
                        >
                          {cap.index}
                        </span>
                        <span
                          className={`text-sm font-semibold tracking-tight sm:text-[15px] ${
                            isSelected
                              ? "text-(--l-fg)"
                              : "text-(--l-fg-2) group-hover:text-(--l-fg)"
                          }`}
                        >
                          {cap.title}
                        </span>
                      </div>
                      <p
                        className={`mt-2 pl-7 text-xs leading-relaxed sm:text-[13px] ${
                          isSelected ? "text-(--l-fg-2)" : "text-(--l-fg-3)"
                        }`}
                      >
                        {cap.summary}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Right Stage: Live Visual Telemetry Artifact */}
              <div className="flex min-h-[360px] flex-col justify-center border-t border-(--l-border) bg-(--l-panel) p-5 sm:p-8 lg:col-span-7 lg:border-t-0 lg:border-l">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeId}
                    initial={{ opacity: 0, transform: "translateY(6px)" }}
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    exit={{ opacity: 0, transform: "translateY(-6px)" }}
                    transition={{ duration: 0.18, ease: EASE_OUT }}
                    className="w-full"
                  >
                    {activeId === "vm" && <VmStage />}
                    {activeId === "durable" && <DurableStage />}
                    {activeId === "waves" && <WavesStage />}
                    {activeId === "models" && <ModelsStage />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function VmStage() {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-code-bg)">
        <div className="flex items-center justify-between gap-2 border-b border-(--l-panel-border) px-4 py-2.5 font-mono text-[11px] text-(--l-panel-fg-3)">
          <span className="inline-flex items-center gap-2 text-(--l-panel-fg)">
            <Server className="size-3.5 text-(--l-accent)" strokeWidth={1.5} />
            <span>workspace · ubuntu-24.04</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>Running</span>
          </span>
        </div>

        <div className="space-y-2 px-4 py-4 font-mono text-xs leading-relaxed">
          <div className="text-(--l-panel-fg-3)">
            $ pnpm dev --port 3000 &amp;
          </div>
          <div className="text-(--l-panel-fg)">
            <span className="text-emerald-600 dark:text-emerald-400">✓</span>{" "}
            Next.js ready in 1.4s · persisted in background
          </div>
          <div className="text-(--l-panel-fg-3)">$ bun test lib/email</div>
          <div className="text-(--l-panel-fg)">
            <span className="text-emerald-600 dark:text-emerald-400">✓</span> 12
            pass · 0 fail in 340ms
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-(--l-panel-border) bg-(--l-panel-surface) px-4 py-2.5 text-xs">
          <span className="inline-flex min-w-0 items-center gap-2 font-mono text-[11.5px] text-(--l-panel-fg)">
            <Globe
              className="size-3.5 shrink-0 text-(--l-accent)"
              strokeWidth={1.5}
            />
            <span className="truncate">
              https://preview-3000.entryagents.app
            </span>
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
            200 OK · 18ms
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-panel-border) sm:grid-cols-4">
        {VM_SPECS.map((spec) => (
          <div key={spec.label} className="bg-(--l-surface) px-3.5 py-3">
            <div className="text-[11px] text-(--l-fg-3)">{spec.label}</div>
            <div className="mt-0.5 font-mono text-xs font-medium tabular-nums text-(--l-fg)">
              {spec.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DurableStage() {
  return (
    <div className="overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-surface)">
      <div className="flex items-center justify-between border-b border-(--l-panel-border) px-4 py-3 text-xs">
        <span className="inline-flex items-center gap-2 font-medium text-(--l-panel-fg)">
          <Laptop
            className="size-3.5 text-(--l-panel-fg-3)"
            strokeWidth={1.5}
          />
          <span>Server workflow checkpoint</span>
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-(--l-panel-fg-3)">
          <Smartphone className="size-3.5" strokeWidth={1.5} />
          <span>Cross-device sync</span>
        </span>
      </div>

      <div className="divide-y divide-(--l-panel-border)">
        {CHECKPOINT_TIMELINE.map((item) => (
          <div
            key={item.time}
            className="flex items-start justify-between gap-4 px-4 py-3.5"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${
                  item.state === "active"
                    ? "bg-(--l-accent)"
                    : item.state === "offline"
                      ? "bg-amber-500/80"
                      : "bg-emerald-500"
                }`}
              />
              <div className="min-w-0">
                <div className="text-xs font-medium text-(--l-panel-fg) sm:text-[13px]">
                  {item.title}
                </div>
                <div className="mt-0.5 text-xs text-(--l-panel-fg-3)">
                  {item.detail}
                </div>
              </div>
            </div>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-(--l-panel-fg-3)">
              {item.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WavesStage() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-(--l-panel-border) bg-(--l-surface) px-4 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-(--l-accent)">Wave 0 · Scout</span>
          <span className="font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
            Contract locked
          </span>
        </div>
        <div className="mt-1 text-xs text-(--l-panel-fg-2)">
          Mapped 6 route handlers and locked shared Zod payload types before
          editing.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-(--l-panel-border) bg-(--l-surface) p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-(--l-panel-fg)">
              <GitBranch
                className="size-3.5 text-(--l-accent)"
                strokeWidth={1.5}
              />
              <span>Builder A</span>
            </span>
            <span className="font-mono text-[11px] text-(--l-panel-fg-3)">
              Wave 1
            </span>
          </div>
          <div className="mt-2 rounded-md bg-(--l-code-bg) px-2.5 py-1.5 font-mono text-[11px] text-(--l-panel-fg-2)">
            api/webhooks/billing/route.ts
          </div>
          <div className="mt-2 font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
            +41 -8 · isolated file claim
          </div>
        </div>

        <div className="rounded-xl border border-(--l-panel-border) bg-(--l-surface) p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-(--l-panel-fg)">
              <GitBranch
                className="size-3.5 text-(--l-accent)"
                strokeWidth={1.5}
              />
              <span>Builder B</span>
            </span>
            <span className="font-mono text-[11px] text-(--l-panel-fg-3)">
              Wave 1
            </span>
          </div>
          <div className="mt-2 rounded-md bg-(--l-code-bg) px-2.5 py-1.5 font-mono text-[11px] text-(--l-panel-fg-2)">
            lib/email/templates/welcome.tsx
          </div>
          <div className="mt-2 font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
            +92 -0 · isolated file claim
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-(--l-panel-border) bg-(--l-surface) px-4 py-3 text-xs">
        <span className="inline-flex items-center gap-2 font-medium text-(--l-panel-fg)">
          <CheckCircle2 className="size-4 text-emerald-500" strokeWidth={1.5} />
          <span>Wave 2 · Typecheck and 14 tests verified</span>
        </span>
        <span className="font-mono text-[11px] tabular-nums text-(--l-panel-fg-3)">
          Zero merge conflicts
        </span>
      </div>
    </div>
  );
}

function ModelsStage() {
  return (
    <div className="overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-surface)">
      <div className="flex items-center justify-between border-b border-(--l-panel-border) px-4 py-3 text-xs">
        <span className="font-medium text-(--l-panel-fg)">
          Available inside any session
        </span>
        <span className="font-mono text-[11px] tabular-nums text-(--l-panel-fg-3)">
          Zero markup
        </span>
      </div>

      <div className="divide-y divide-(--l-panel-border)">
        {MODEL_ROWS.map((row) => (
          <div
            key={row.name}
            className={`flex items-center justify-between gap-4 px-4 py-3 ${
              row.active ? "bg-(--l-panel-surface)" : ""
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-(--l-panel-fg) sm:text-[13px]">
                  {row.name}
                </span>
                <span className="text-[11px] text-(--l-panel-fg-3)">
                  {row.family}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-(--l-panel-fg-3)">
                {row.role}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums text-(--l-panel-fg-2)">
              <span>{row.context}</span>
              {row.active && (
                <Check
                  className="size-3.5 text-(--l-accent)"
                  strokeWidth={1.75}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-(--l-panel-border) bg-(--l-code-bg) px-4 py-2.5 text-xs text-(--l-panel-fg-2)">
        <span>Prompt cache hit rate across multi-turn sessions</span>
        <span className="font-mono font-medium tabular-nums text-(--l-panel-fg)">
          90%–99%
        </span>
      </div>
    </div>
  );
}
