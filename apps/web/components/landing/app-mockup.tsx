"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

type ScenarioId = "team" | "diff" | "plugins" | "durable";

type ScenarioTraceRow = {
  readonly actor: string;
  readonly tag: string;
  readonly detail: string;
  readonly duration: string;
};

type ScenarioTaskRow = {
  readonly id: string;
  readonly label: string;
  readonly owner: string;
  readonly done: boolean;
};

type Scenario = {
  readonly id: ScenarioId;
  readonly title: string;
  readonly tag: string;
  readonly repo: string;
  readonly branch: string;
  readonly elapsed: string;
  readonly prompt: string;
  readonly summary: string;
  readonly trace: readonly ScenarioTraceRow[];
  readonly tasks?: readonly ScenarioTaskRow[];
  readonly diffLines?: readonly {
    readonly type: "ctx" | "add" | "del";
    readonly text: string;
  }[];
  readonly files: readonly string[];
  readonly footerModel: string;
  readonly footerTokens: string;
};

const SCENARIOS: readonly Scenario[] = [
  {
    id: "team",
    title: "Multi-Agent Team",
    tag: "4 agents synced",
    repo: "entry-agents",
    branch: "feat/oauth-team",
    elapsed: "42s",
    prompt:
      "Design, implement, and review Better Auth + GitHub App repo access.",
    summary:
      "Architect mapped the auth boundary onto the shared Team Board, Explorer traced existing OAuth callbacks, Executor shipped the route + migration, and Reviewer verified token scoping.",
    trace: [
      {
        actor: "architect",
        tag: "team_board.plan_tasks",
        detail: "3 coordinated tasks posted to shared board",
        duration: "0.8s",
      },
      {
        actor: "explorer",
        tag: "team_board.post",
        detail: "Mapped Better Auth session & callback contracts",
        duration: "1.4s",
      },
      {
        actor: "executor",
        tag: "write + db:generate",
        detail: "Implemented OAuth callback + verified typecheck",
        duration: "6.2s",
      },
      {
        actor: "reviewer",
        tag: "team_board.post",
        detail: "Approved: zero leaked secrets, tests passing",
        duration: "2.1s",
      },
    ],
    tasks: [
      {
        id: "T-01",
        label: "Trace OAuth & installation callback boundary",
        owner: "explorer",
        done: true,
      },
      {
        id: "T-02",
        label: "Implement scoped GitHub App token persistence",
        owner: "executor",
        done: true,
      },
      {
        id: "T-03",
        label: "Audit token redaction & verify regression suite",
        owner: "reviewer",
        done: true,
      },
    ],
    files: [
      "lib/auth/config.ts",
      "app/api/github/callback/route.ts",
      "lib/db/migrations/0074.sql",
    ],
    footerModel: "Claude Opus 4.6",
    footerTokens: "18.4k in · 2.1k out",
  },
  {
    id: "diff",
    title: "Live Diff & PR",
    tag: "PR #142 ready",
    repo: "entry-agents",
    branch: "feat/stream-cache",
    elapsed: "31s",
    prompt: "Optimize prompt prefix caching and open a clean diff for review.",
    summary:
      "Stabilized static prompt ordering and tool schemas for deterministic KV cache hits across turns. Typecheck, lint, and isolated tests pass cleanly.",
    trace: [
      {
        actor: "executor",
        tag: "edit",
        detail: "packages/agent/system-prompt.ts",
        duration: "0.6s",
      },
      {
        actor: "executor",
        tag: "bash",
        detail: "pnpm typecheck && bun test cache.test.ts",
        duration: "4.4s",
      },
      {
        actor: "system",
        tag: "git.auto_commit",
        detail: "Committed 3 files & synced PR #142",
        duration: "1.1s",
      },
    ],
    diffLines: [
      { type: "ctx", text: "  const basePrompt = buildStaticSystemPrompt();" },
      { type: "del", text: "- const stamp = new Date().toISOString();" },
      {
        type: "add",
        text: "+ // Dynamic session metadata isolated to tail block",
      },
      {
        type: "add",
        text: "+ const cacheKey = resolvePromptCacheKey(modelId);",
      },
    ],
    files: ["packages/agent/system-prompt.ts", "packages/agent/open-agent.ts"],
    footerModel: "DeepSeek V3.2",
    footerTokens: "94% cache hit · 11.2k",
  },
  {
    id: "plugins",
    title: "Plugins & Vault",
    tag: "3 hooks active",
    repo: "entry-agents",
    branch: "feat/vault-hooks",
    elapsed: "19s",
    prompt: "/ship Verify quality gates and run deploy preview check.",
    summary:
      "Plugin `verification-gate` enforced typecheck before completion while `security-auditor` redacted sensitive environment output before persistence.",
    trace: [
      {
        actor: "plugin:cmd",
        tag: "/ship expanded",
        detail: "Injected release checklist from pr-ship-checklist",
        duration: "0.1s",
      },
      {
        actor: "plugin:hook",
        tag: "afterToolExecute",
        detail: "security-auditor scrubbed API_KEY -> [REDACTED]",
        duration: "0.2s",
      },
      {
        actor: "vault",
        tag: "AES-256-GCM",
        detail: "Injected DEPLOY_HOOK at sandbox exec boundary only",
        duration: "0.3s",
      },
    ],
    files: ["packages/agent/plugins/engine.ts", "lib/plugins/encryption.ts"],
    footerModel: "GPT-5 Codex",
    footerTokens: "Hooks: 3 · Redacted: 1",
  },
  {
    id: "durable",
    title: "Durable Loop",
    tag: "Resumed mid-run",
    repo: "entry-agents",
    branch: "fix/migration-step",
    elapsed: "1m 08s",
    prompt: "Run the full workspace migration even if my laptop sleeps.",
    summary:
      "Client disconnected during step 2; Workflow SDK checkpointed tool state in Postgres + Redis stream, completed step 3 in background, and replayed seamlessly on reconnect.",
    trace: [
      {
        actor: "step:01",
        tag: "convertMessages",
        detail: "Checkpointed input envelope + attachments",
        duration: "0.3s",
      },
      {
        actor: "step:02",
        tag: "runAgentStep",
        detail: "Client offline 14s — loop continued autonomously",
        duration: "38.0s",
      },
      {
        actor: "stream",
        tag: "resumable.replay",
        detail: "Client reconnected at offset 412 · zero lost tokens",
        duration: "0.2s",
      },
      {
        actor: "step:03",
        tag: "refreshDiffCache",
        detail: "Usage metered & diff snapshot cached",
        duration: "0.9s",
      },
    ],
    files: ["app/workflows/chat.ts", "app/api/chat/[chatId]/stream/route.ts"],
    footerModel: "Claude Sonnet 4.6",
    footerTokens: "Durable · 0 lost chunks",
  },
];

export function AppMockup() {
  const [activeId, setActiveId] = useState<ScenarioId>("team");
  const active = SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0];

  return (
    <div
      className="overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-panel) ring-1 ring-(--l-panel-border)"
      style={{ boxShadow: "var(--l-window-shadow)" }}
    >
      {/* Top Window Chrome */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--l-panel-border) px-3 py-2 lg:px-4">
        <div className="flex min-w-0 items-center gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-(--l-panel-fg-3)">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="size-3.5"
              aria-hidden="true"
            >
              <rect
                x="1"
                y="1"
                width="5"
                height="5"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <rect
                x="1"
                y="10"
                width="5"
                height="5"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <rect
                x="10"
                y="1"
                width="5"
                height="5"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <rect
                x="10"
                y="10"
                width="5"
                height="5"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </div>
          <span className="font-medium text-(--l-panel-fg)">{active.repo}</span>
          <span className="hidden text-(--l-panel-fg-4) sm:inline">/</span>
          <span className="hidden truncate font-mono text-[10px] text-(--l-panel-fg-2) sm:inline">
            {active.branch}
          </span>
          <span className="hidden text-(--l-panel-fg-4) sm:inline">/</span>
          <span className="hidden truncate text-(--l-panel-fg-2) sm:inline">
            {active.title}
          </span>
          <span className="size-1.5 rounded-full bg-(--l-accent)" />
        </div>

        {/* Mobile scenario switcher */}
        <div className="flex items-center gap-1 sm:hidden">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={`rounded px-2 py-0.5 font-mono text-[10px] transition-colors ${
                s.id === activeId
                  ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                  : "text-(--l-panel-fg-3)"
              }`}
            >
              {s.title.split(" ")[0]}
            </button>
          ))}
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <span className="rounded-full border border-(--l-panel-border) bg-(--l-panel-surface) px-2 py-0.5 font-mono text-[10px] text-(--l-panel-fg-2)">
            {active.tag}
          </span>
          <span className="font-mono text-[10px] text-(--l-panel-fg-3)">
            {active.elapsed}
          </span>
        </div>
      </div>

      <div className="flex">
        {/* Left Navigation Rail */}
        <div className="hidden w-52 shrink-0 border-r border-(--l-panel-border) sm:block">
          <div className="p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-(--l-panel-fg-4)">
                Control Plane
              </span>
              <span className="font-mono text-[10px] text-(--l-panel-fg-4)">
                ⌘K
              </span>
            </div>
            <div className="space-y-1">
              {SCENARIOS.map((s) => {
                const isSelected = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    className="relative flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-(--l-panel-surface) cursor-pointer"
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="mockup-scenario-indicator"
                        transition={{
                          type: "spring",
                          duration: 0.35,
                          bounce: 0.15,
                        }}
                        className="absolute inset-0 rounded-lg bg-(--l-panel-active) ring-1 ring-inset ring-(--l-panel-border)"
                      />
                    )}
                    <div className="relative flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-[11px] ${
                          isSelected
                            ? "font-medium text-(--l-panel-fg)"
                            : "text-(--l-panel-fg-3)"
                        }`}
                      >
                        {s.title}
                      </span>
                      <span className="shrink-0 font-mono text-[9px] text-(--l-panel-fg-4)">
                        {s.elapsed}
                      </span>
                    </div>
                    <span className="relative mt-0.5 truncate font-mono text-[9px] text-(--l-panel-fg-4)">
                      {s.branch}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Workspace Canvas */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-[340px] flex-1 overflow-hidden sm:min-h-[430px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.id}
                initial={{ opacity: 0, transform: "translateY(6px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                exit={{ opacity: 0, transform: "translateY(-4px)" }}
                transition={{ duration: 0.2, ease: EASE_OUT_QUINT }}
                className="mx-auto max-w-2xl space-y-4 px-3 py-4 sm:px-5 sm:py-6"
              >
                {/* Prompt Bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[88%] rounded-2xl border border-(--l-panel-border) bg-(--l-panel-surface) px-3.5 py-2 sm:max-w-[82%] sm:px-4 sm:py-2.5">
                    <p className="text-[12px] leading-relaxed text-(--l-panel-fg)">
                      {active.prompt}
                    </p>
                  </div>
                </div>

                {/* Coordinated Execution Trace */}
                <div className="space-y-1.5 rounded-xl border border-(--l-panel-border) bg-(--l-panel-surface) p-2.5 sm:p-3">
                  <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-(--l-panel-fg-4)">
                    <span>EXECUTION TRACE</span>
                    <span>{active.trace.length} EVENTS</span>
                  </div>
                  {active.trace.map((row, idx) => (
                    <motion.div
                      key={`${active.id}-${row.actor}-${idx}`}
                      initial={{ opacity: 0, transform: "translateX(-4px)" }}
                      animate={{ opacity: 1, transform: "translateX(0px)" }}
                      transition={{
                        duration: 0.22,
                        delay: idx * 0.04,
                        ease: EASE_OUT_QUINT,
                      }}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-(--l-panel-border) bg-(--l-panel) px-2.5 py-1.5 font-mono text-[10px]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded bg-(--l-panel-surface) px-1.5 py-0.5 text-[9px] text-(--l-panel-fg)">
                          {row.actor}
                        </span>
                        <span className="shrink-0 text-(--l-panel-fg-2)">
                          {row.tag}
                        </span>
                        <span className="truncate text-(--l-panel-fg-3)">
                          {row.detail}
                        </span>
                      </div>
                      <span className="shrink-0 text-[9px] text-(--l-panel-fg-4)">
                        {row.duration}
                      </span>
                    </motion.div>
                  ))}
                </div>

                {/* Scenario-specific artifact (Team tasks OR Unified Diff) */}
                {active.tasks && (
                  <div className="space-y-1 rounded-xl border border-(--l-panel-border) bg-(--l-panel-surface) p-2.5 font-mono text-[10px]">
                    <div className="mb-1 text-[9px] uppercase tracking-wider text-(--l-panel-fg-4)">
                      Shared Team Board · {active.tasks.length}/
                      {active.tasks.length} complete
                    </div>
                    {active.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between gap-2 py-0.5"
                      >
                        <span className="truncate text-(--l-panel-fg-2)">
                          [x] {task.id} {task.label}
                        </span>
                        <span className="shrink-0 text-[9px] text-(--l-panel-fg-4)">
                          @{task.owner}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {active.diffLines && (
                  <div className="overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-code-bg) p-2.5 font-mono text-[10px] leading-relaxed">
                    {active.diffLines.map((line, idx) => (
                      <div
                        key={idx}
                        className={
                          line.type === "add"
                            ? "text-emerald-500/90"
                            : line.type === "del"
                              ? "text-rose-400/90"
                              : "text-(--l-panel-fg-3)"
                        }
                      >
                        {line.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Assistant Summary + Files */}
                <p className="text-[12px] leading-[1.65] text-(--l-panel-fg-2)">
                  {active.summary}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {active.files.map((name) => (
                    <span
                      key={name}
                      className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-(--l-panel-border) bg-(--l-panel-surface) px-2 py-0.5 font-mono text-[10px] text-(--l-panel-fg-2)"
                    >
                      <span className="size-1 rounded-full bg-(--l-accent)" />
                      {name}
                    </span>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom Composer Telemetry */}
          <div className="px-3 pb-3 pt-1 sm:px-5 sm:pb-4">
            <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-(--l-panel-border) bg-(--l-panel-surface)">
              <div className="px-3.5 py-2 sm:px-4">
                <span className="text-[11px] text-(--l-panel-fg-4) sm:text-[12px]">
                  Type / for skills &amp; plugins, or coordinate your team...
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-(--l-panel-border) px-3 py-1.5">
                <div className="flex items-center gap-2.5 font-mono text-[10px]">
                  <span className="text-(--l-panel-fg-2)">
                    {active.footerModel}
                  </span>
                  <span className="h-2.5 w-px bg-(--l-panel-border)" />
                  <span className="text-(--l-panel-fg-4)">
                    {active.footerTokens}
                  </span>
                </div>
                <div className="flex size-6 items-center justify-center rounded-full bg-(--l-btn-bg)">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="size-3 text-(--l-btn-fg)"
                    aria-hidden="true"
                  >
                    <path d="M8 12V4M8 4l-3 3M8 4l3 3" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
