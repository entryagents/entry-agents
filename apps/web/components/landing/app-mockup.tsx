"use client";

import { useEffect, useRef, useState } from "react";

type AgentTask = {
  readonly role: string;
  readonly status: "done" | "running" | "idle";
  readonly summary: string;
};

type FakeSession = {
  readonly title: string;
  readonly repo: string;
  readonly branch: string;
  readonly prompt: string;
  readonly agentSummary: string;
  readonly tasks: readonly AgentTask[];
  readonly toolCount: number;
  readonly testsPassed: number;
  readonly elapsed: string;
  readonly files: readonly string[];
  readonly terminalLogs: readonly string[];
};

const sessions: readonly FakeSession[] = [
  {
    title: "Multi-agent orchestration",
    repo: "entry-agents",
    branch: "feat/multi-agent",
    prompt: "Implement parallel subagent coordination with isolated git worktrees",
    agentSummary:
      "Decomposed work across 3 subagents. Architect defined communication schemas, Executor wrote isolated worktrees, and QA verified tests pass clean.",
    tasks: [
      { role: "Architect", status: "done", summary: "Plan isolated worktree protocol" },
      { role: "Executor", status: "done", summary: "Implement subagent runner" },
      { role: "Verifier", status: "done", summary: "Run test suite: 47/47 passing" },
    ],
    toolCount: 18,
    testsPassed: 47,
    elapsed: "42s",
    files: [
      "lib/agents/orchestrator.ts",
      "lib/sandbox/worktree.ts",
      "app/api/chat/route.ts",
    ],
    terminalLogs: [
      "✓ git worktree add .worktrees/agent-exec feat/multi-agent",
      "✓ subagent-1: schema contracts generated",
      "✓ subagent-2: runtime execution loop wired",
      "✓ pnpm test: 47 passed (0 failures)",
    ],
  },
  {
    title: "Edge API migration",
    repo: "entry-agents",
    branch: "feat/edge-runtime",
    prompt: "Refactor chat streaming endpoints for edge runtime execution",
    agentSummary:
      "Migrated chat routes to edge runtime. Replaced Node-only streams with Web Streams API and verified zero regressions across the CI suite.",
    tasks: [
      { role: "Analyzer", status: "done", summary: "Scan routes for Node APIs" },
      { role: "Executor", status: "done", summary: "Convert to Web Streams API" },
      { role: "Verifier", status: "done", summary: "Typecheck & integration suite" },
    ],
    toolCount: 11,
    testsPassed: 38,
    elapsed: "1m 12s",
    files: [
      "app/api/chat/route.ts",
      "app/api/chat/[chatId]/stream/route.ts",
    ],
    terminalLogs: [
      "✓ exported const runtime = 'edge'",
      "✓ replaced node:stream with ReadableStream",
      "✓ typecheck clean in 1.4s",
    ],
  },
  {
    title: "Automated test recovery",
    repo: "entry-agents",
    branch: "fix/flaky-tests",
    prompt: "Diagnose and resolve intermittent websocket timeouts in sandbox tests",
    agentSummary:
      "Isolated the race condition in the sandbox connection handshake. Added heartbeat retry logic and verified 50 consecutive runs with zero failures.",
    tasks: [
      { role: "Investigator", status: "done", summary: "Reproduce handshake timeout" },
      { role: "Executor", status: "done", summary: "Implement exponential backoff" },
      { role: "Verifier", status: "done", summary: "50-run stress test passed" },
    ],
    toolCount: 16,
    testsPassed: 52,
    elapsed: "54s",
    files: [
      "lib/sandbox/client.ts",
      "lib/sandbox/heartbeat.ts",
      "tests/e2e/sandbox.test.ts",
    ],
    terminalLogs: [
      "✓ isolated race condition in handshake ACK",
      "✓ added jittered retry backoff (3 attempts)",
      "✓ stress test: 50/50 passes",
    ],
  },
];

function useTypewriter(text: string, active: boolean, speed = 12) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setDisplayed(text);
      indexRef.current = text.length;
      return;
    }
    setDisplayed("");
    indexRef.current = 0;
    const id = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current >= text.length) {
        setDisplayed(text);
        clearInterval(id);
      } else {
        setDisplayed(text.slice(0, indexRef.current));
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);

  return displayed;
}

export function AppMockup() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"stream" | "terminal">("stream");
  const [justSwitched, setJustSwitched] = useState(false);

  const active = sessions[activeIndex]!;
  const typedSummary = useTypewriter(active.agentSummary, justSwitched);

  const handleSwitch = (index: number) => {
    if (index === activeIndex) return;
    setActiveIndex(index);
    setJustSwitched(true);
  };

  useEffect(() => {
    if (!justSwitched) return;
    const timeout = setTimeout(
      () => setJustSwitched(false),
      active.agentSummary.length * 12 + 150,
    );
    return () => clearTimeout(timeout);
  }, [justSwitched, active.agentSummary.length]);

  return (
    <div
      className="overflow-hidden rounded-lg border border-(--l-panel-border) bg-(--l-panel) ring-1 ring-(--l-panel-border)"
      style={{ boxShadow: "var(--l-window-shadow)" }}
    >
      {/* Workbench top chrome */}
      <div className="flex items-center justify-between border-b border-(--l-panel-border) px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-(--l-panel-fg-3)">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="size-3.5"
              aria-hidden="true"
            >
              <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <rect x="1" y="10" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <rect x="10" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <rect x="10" y="10" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </div>
          <span className="font-medium text-(--l-panel-fg)">{active.repo}</span>
          <span className="hidden sm:inline text-(--l-panel-fg-4)">/</span>
          <span className="hidden sm:inline truncate text-(--l-panel-fg-2)">
            {active.branch}
          </span>
          <span className="hidden sm:inline text-(--l-panel-fg-4)">/</span>
          <span className="hidden sm:inline text-(--l-panel-fg-3)">
            {active.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-(--l-panel-surface) px-2.5 py-0.5 text-[11px] text-(--l-panel-fg-2)">
            <span className="size-1.5 rounded-full bg-(--l-accent) motion-safe:animate-pulse motion-reduce:opacity-80" />
            3 agents live
          </span>
        </div>
      </div>

      <div className="flex">
        {/* Left sidebar: Sessions in sentence case */}
        <div className="hidden w-52 shrink-0 border-r border-(--l-panel-border) sm:block">
          <div className="p-3">
            <div className="mb-2.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-(--l-panel-fg-3)">
                Active sessions
              </span>
              <span className="text-[10px] tabular-nums text-(--l-panel-fg-4)">
                {sessions.length}
              </span>
            </div>
            <div className="space-y-1">
              {sessions.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => handleSwitch(i)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg) active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                    i === activeIndex
                      ? "bg-(--l-panel-active)"
                      : "hover:bg-(--l-panel-surface)"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-xs ${
                        i === activeIndex
                          ? "font-medium text-(--l-panel-fg)"
                          : "text-(--l-panel-fg-3)"
                      }`}
                    >
                      {s.title}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] tabular-nums ${
                      i === activeIndex
                        ? "text-(--l-panel-fg-3)"
                        : "text-(--l-panel-fg-4)"
                    }`}
                  >
                    {s.elapsed}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main session area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Subheader tabs: Stream vs Terminal */}
          <div className="flex items-center justify-between border-b border-(--l-panel-border) px-4 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("stream")}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg) active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                  activeTab === "stream"
                    ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                    : "text-(--l-panel-fg-3) hover:text-(--l-panel-fg)"
                }`}
              >
                Agent coordination
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("terminal")}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg) active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                  activeTab === "terminal"
                    ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                    : "text-(--l-panel-fg-3) hover:text-(--l-panel-fg)"
                }`}
              >
                Terminal verification
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px] tabular-nums text-(--l-panel-fg-3)">
              <span>{active.toolCount} tools</span>
              <span className="text-(--l-panel-fg-4)">·</span>
              <span className="text-(--color-success)">{active.testsPassed} tests passed</span>
            </div>
          </div>

          <div className="min-h-[300px] flex-1 overflow-hidden p-4 sm:min-h-[420px] sm:p-6">
            <div className="mx-auto max-w-2xl space-y-4">
              {/* User instruction bubble */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-lg border border-(--l-panel-border) bg-(--l-panel-surface) px-4 py-3">
                  <p className="text-xs leading-relaxed text-(--l-panel-fg)">
                    {active.prompt}
                  </p>
                </div>
              </div>

              {activeTab === "stream" ? (
                /* Multi-agent coordination view */
                <div className="space-y-4">
                  {/* Subagent team cards */}
                  <div className="grid gap-2 sm:grid-cols-3">
                    {active.tasks.map((task) => (
                      <div
                        key={task.role}
                        className="rounded-md border border-(--l-panel-border) bg-(--l-panel-surface) p-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-(--l-panel-fg)">
                            {task.role}
                          </span>
                          <span className="size-1.5 rounded-full bg-(--color-success)" />
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-(--l-panel-fg-3)">
                          {task.summary}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Streaming agent summary */}
                  <div className="rounded-lg border border-(--l-panel-border) bg-(--l-code-bg) p-4">
                    <p className="text-xs leading-relaxed text-(--l-panel-fg-2)">
                      {typedSummary}
                      {justSwitched &&
                        typedSummary.length < active.agentSummary.length && (
                          <span className="ml-1 inline-block h-3.5 w-[2px] bg-(--l-accent) motion-safe:animate-pulse motion-reduce:opacity-80" />
                        )}
                    </p>
                  </div>

                  {/* Affected files */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {active.files.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1.5 rounded border border-(--l-panel-border) bg-(--l-panel-surface) px-2 py-1 font-mono text-[11px] text-(--l-panel-fg-2)"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          className="size-3 text-(--l-panel-fg-4)"
                          aria-hidden="true"
                        >
                          <path d="M2 1.5A1.5 1.5 0 013.5 0h6.879a1.5 1.5 0 011.06.44l2.122 2.12A1.5 1.5 0 0114 3.622V14.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 14.5v-13z" />
                        </svg>
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                /* Terminal verification view */
                <div className="rounded-lg border border-(--l-panel-border) bg-(--l-code-bg) p-4 text-xs leading-relaxed text-(--l-panel-fg-2)">
                  <div className="space-y-1.5 font-mono">
                    {active.terminalLogs.map((log) => (
                      <div key={log} className="text-(--color-success)">
                        {log}
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 text-[11px] text-(--l-panel-fg-4)">
                    Branch ready for review: <code className="font-mono text-(--l-panel-fg-3)">origin/{active.branch}</code>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Workbench bottom prompt line */}
          <div className="border-t border-(--l-panel-border) px-4 py-3">
            <div className="mx-auto flex max-w-2xl items-center justify-between">
              <span className="text-xs text-(--l-panel-fg-4)">
                All checks passed. Type your next command…
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-(--l-panel-fg-4)">
                  Sandbox ready
                </span>
                <span className="size-2 rounded-full bg-(--color-success)" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
