"use client";

import {
  CheckCircle2,
  FileCode2,
  GitBranch,
  Terminal,
  Users,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type SessionId = "oauth" | "direct" | "reconnect" | "integrations";
type InspectorTab = "changes" | "branch";

type InlineAgentEntry = {
  readonly role: string;
  readonly summary: string;
  readonly file: string;
  readonly duration: string;
};

type DirectStepEntry = {
  readonly kind: "edit" | "bash" | "plug";
  readonly label: string;
  readonly arg: string;
  readonly meta: string;
};

type DiffLine = {
  readonly type: "ctx" | "add" | "del";
  readonly lineNum?: number;
  readonly text: string;
};

type BranchFileRow = {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
};

type WorkspaceSession = {
  readonly id: SessionId;
  readonly title: string;
  readonly branch: string;
  readonly age: string;
  readonly modeLabel: string;
  readonly prompt: string;
  readonly inlineTeam: readonly InlineAgentEntry[] | null;
  readonly directSteps: readonly DirectStepEntry[];
  readonly response: string;
  readonly diffFile: string;
  readonly diffStats: {
    readonly additions: number;
    readonly deletions: number;
  };
  readonly diffLines: readonly DiffLine[];
  readonly branchFiles: readonly BranchFileRow[];
  readonly prCheckSummary: string;
  readonly model: string;
  readonly effort: string;
};

const WORKSPACE_SESSIONS: readonly WorkspaceSession[] = [
  {
    id: "oauth",
    title: "GitHub OAuth & PR checks",
    branch: "feat/github-oauth",
    age: "2m",
    modeLabel: "Team mode inline",
    prompt:
      "Wire GitHub App installation callback into session storage and verify token scoping across API routes.",
    inlineTeam: [
      {
        role: "Architect",
        summary:
          "Defined callback state contract & locked 3 non-overlapping files",
        file: "oauth-contract.ts",
        duration: "1.2s",
      },
      {
        role: "Explorer",
        summary: "Mapped auth handlers & session lookup helpers",
        file: "lib/auth/config.ts",
        duration: "1.6s",
      },
      {
        role: "Executor",
        summary:
          "Implemented verified callback route & installation persistence",
        file: "api/github/callback/route.ts",
        duration: "3.4s",
      },
      {
        role: "Reviewer",
        summary: "Verified CSRF cookie check, token redaction & 14 tests",
        file: "callback.test.ts",
        duration: "1.5s",
      },
    ],
    directSteps: [
      {
        kind: "bash",
        label: "Test suite",
        arg: "pnpm typecheck && bun test github-callback.test.ts",
        meta: "14/14 passed",
      },
    ],
    response:
      "Connected the GitHub App installation callback cleanly, scoped tokens per repository, and verified all 14 callback tests in the sandbox.",
    diffFile: "app/api/github/callback/route.ts",
    diffStats: { additions: 34, deletions: 6 },
    diffLines: [
      {
        type: "ctx",
        lineNum: 41,
        text: "  const session = await getServerSession(request);",
      },
      {
        type: "del",
        lineNum: 42,
        text: "  if (!installationId) return NextResponse.redirect('/');",
      },
      {
        type: "add",
        lineNum: 42,
        text: "  const verified = await verifyInstallationState(stateCookie, state);",
      },
      {
        type: "add",
        lineNum: 43,
        text: "  if (!verified || !installationId) {",
      },
      {
        type: "add",
        lineNum: 44,
        text: "    return NextResponse.redirect(new URL('/settings/connections', request.url));",
      },
      {
        type: "add",
        lineNum: 45,
        text: "  }",
      },
      {
        type: "ctx",
        lineNum: 46,
        text: "  await linkGithubInstallation(session.user.id, installationId);",
      },
    ],
    branchFiles: [
      { path: "app/api/github/callback/route.ts", additions: 22, deletions: 4 },
      { path: "lib/github/installations.ts", additions: 8, deletions: 2 },
      { path: "lib/github/callback.test.ts", additions: 4, deletions: 0 },
    ],
    prCheckSummary: "Typecheck & 14 callback tests green",
    model: "Claude Opus 4.6",
    effort: "high",
  },
  {
    id: "direct",
    title: "Fix retry backoff guard",
    branch: "fix/retry-backoff",
    age: "14m",
    modeLabel: "Direct agent",
    prompt:
      "Cap exponential retry delay in the transport client at 15s and add jitter bounds.",
    inlineTeam: null,
    directSteps: [
      {
        kind: "edit",
        label: "Edit file",
        arg: "apps/web/lib/abortable-chat-transport.ts",
        meta: "+12 −3",
      },
      {
        kind: "bash",
        label: "Verify",
        arg: "bun test apps/web/lib/chat/friendly-error.test.ts",
        meta: "18/18 passed",
      },
    ],
    response:
      "Updated the backoff curve to clamp jittered delays at 15s directly without spinning up extra agents.",
    diffFile: "lib/abortable-chat-transport.ts",
    diffStats: { additions: 12, deletions: 3 },
    diffLines: [
      {
        type: "ctx",
        lineNum: 108,
        text: "export function computeRetryDelayMs(attempt: number): number {",
      },
      {
        type: "del",
        lineNum: 109,
        text: "  return 1000 * 2 ** attempt;",
      },
      {
        type: "add",
        lineNum: 109,
        text: "  const capped = Math.min(15_000, 1000 * 2 ** Math.min(attempt, 5));",
      },
      {
        type: "add",
        lineNum: 110,
        text: "  const jitter = Math.round(capped * 0.15 * Math.random());",
      },
      {
        type: "add",
        lineNum: 111,
        text: "  return capped + jitter;",
      },
      {
        type: "ctx",
        lineNum: 112,
        text: "}",
      },
    ],
    branchFiles: [
      { path: "lib/abortable-chat-transport.ts", additions: 12, deletions: 3 },
    ],
    prCheckSummary: "Single-agent pass · 18/18 green",
    model: "Claude Sonnet 4.6",
    effort: "medium",
  },
  {
    id: "reconnect",
    title: "Offline-proof mobile run",
    branch: "fix/stream-resume",
    age: "1h",
    modeLabel: "Durable resume",
    prompt:
      "Ensure losing cellular signal mid-turn resumes live server progress without duplicate messages.",
    inlineTeam: null,
    directSteps: [
      {
        kind: "edit",
        label: "Edit file",
        arg: "apps/web/app/api/chat/[chatId]/stream/route.ts",
        meta: "+22 −4",
      },
      {
        kind: "bash",
        label: "Verify",
        arg: "bun test apps/web/app/workflows/chat.test.ts",
        meta: "29/29 passed",
      },
    ],
    response:
      "Server checkpoints persisted each tool step while offline and reattached seamlessly when the browser came back online.",
    diffFile: "app/api/chat/[chatId]/stream/route.ts",
    diffStats: { additions: 22, deletions: 4 },
    diffLines: [
      {
        type: "ctx",
        lineNum: 142,
        text: "  const streamResult = await attachDurableStream(runId, startIndex);",
      },
      {
        type: "del",
        lineNum: 143,
        text: "  return createEmptyResponse();",
      },
      {
        type: "add",
        lineNum: 143,
        text: "  if (streamResult.status === 'active') {",
      },
      {
        type: "add",
        lineNum: 144,
        text: "    return createUIMessageStreamResponse({ stream: streamResult.stream });",
      },
      {
        type: "add",
        lineNum: 145,
        text: "  }",
      },
    ],
    branchFiles: [
      {
        path: "app/api/chat/[chatId]/stream/route.ts",
        additions: 22,
        deletions: 4,
      },
    ],
    prCheckSummary: "Reconnect tests 29/29 passing",
    model: "Claude Sonnet 4.6",
    effort: "high",
  },
  {
    id: "integrations",
    title: "Linear issue to PR",
    branch: "feat/linear-triage",
    age: "3h",
    modeLabel: "Connected apps",
    prompt:
      "Fetch bug ENG-418 from Linear, reproduce the failing webhook signature check, and post the PR link to #engineering in Slack.",
    inlineTeam: [
      {
        role: "Explorer",
        summary: "Read Linear issue ENG-418 & located webhook verifier",
        file: "lib/webhooks/verify.ts",
        duration: "1.4s",
      },
      {
        role: "Executor",
        summary: "Patched raw-body HMAC verification & added replay test",
        file: "verify.test.ts",
        duration: "2.9s",
      },
    ],
    directSteps: [
      {
        kind: "plug",
        label: "Connected",
        arg: "Linear · GitHub · Slack #engineering",
        meta: "synced",
      },
    ],
    response:
      "Fixed the raw-body HMAC check for ENG-418, opened PR #142, and posted verification notes to Slack.",
    diffFile: "lib/webhooks/verify.ts",
    diffStats: { additions: 19, deletions: 7 },
    diffLines: [
      {
        type: "del",
        lineNum: 28,
        text: "  const payload = JSON.stringify(await request.json());",
      },
      {
        type: "add",
        lineNum: 28,
        text: "  const rawPayload = await request.text();",
      },
      {
        type: "ctx",
        lineNum: 29,
        text: "  return timingSafeVerify(rawPayload, signatureHeader);",
      },
    ],
    branchFiles: [
      { path: "lib/webhooks/verify.ts", additions: 11, deletions: 5 },
      { path: "lib/webhooks/verify.test.ts", additions: 8, deletions: 2 },
    ],
    prCheckSummary: "PR #142 open · Linear ENG-418 updated",
    model: "GPT-5.2",
    effort: "high",
  },
];

function StepIcon({ kind }: { readonly kind: DirectStepEntry["kind"] }) {
  if (kind === "bash") {
    return (
      <Terminal
        className="size-3.5 shrink-0 text-(--l-panel-fg-3)"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    );
  }
  if (kind === "plug") {
    return (
      <GitBranch
        className="size-3.5 shrink-0 text-(--l-panel-fg-3)"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    );
  }
  return (
    <FileCode2
      className="size-3.5 shrink-0 text-(--l-panel-fg-3)"
      strokeWidth={1.5}
      aria-hidden="true"
    />
  );
}

export function AppMockup() {
  const [selectedId, setSelectedId] = useState<SessionId>("oauth");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("changes");
  const [mobilePane, setMobilePane] = useState<"chat" | "changes" | "branch">(
    "chat",
  );
  const session =
    WORKSPACE_SESSIONS.find((s) => s.id === selectedId) ??
    WORKSPACE_SESSIONS[0];

  return (
    <div
      className="min-w-0 w-full overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-panel) ring-1 ring-(--l-panel-border)"
      style={{ boxShadow: "var(--l-window-shadow)" }}
    >
      {/* Workspace top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--l-panel-border) px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="truncate font-medium text-(--l-panel-fg)">
            acme-labs/web-platform
          </span>
          <span className="text-(--l-panel-fg-4)">/</span>
          <span className="truncate font-mono text-xs text-(--l-panel-fg-2)">
            {session.branch}
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs text-(--l-panel-fg-3)">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>{session.modeLabel}</span>
          </span>
          <span className="text-(--l-panel-fg-4)">·</span>
          <span className="tabular-nums">
            +{session.diffStats.additions} −{session.diffStats.deletions}
          </span>
        </div>
      </div>

      {/* Mobile & tablet switcher */}
      <div className="flex min-w-0 flex-col gap-2 border-b border-(--l-panel-border) bg-(--l-panel-surface) px-3 py-2 lg:hidden">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1 sm:hidden">
          {WORKSPACE_SESSIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                s.id === selectedId
                  ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                  : "text-(--l-panel-fg-3) hover:text-(--l-panel-fg-2)"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-lg border border-(--l-panel-border) bg-(--l-panel) p-1 text-xs">
            <button
              type="button"
              onClick={() => setMobilePane("chat")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors duration-150 ${
                mobilePane === "chat"
                  ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                  : "text-(--l-panel-fg-3)"
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setMobilePane("changes")}
              className={`rounded-md px-2.5 py-1 font-medium tabular-nums transition-colors duration-150 ${
                mobilePane === "changes"
                  ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                  : "text-(--l-panel-fg-3)"
              }`}
            >
              Diff +{session.diffStats.additions} −{session.diffStats.deletions}
            </button>
            <button
              type="button"
              onClick={() => setMobilePane("branch")}
              className={`rounded-md px-2.5 py-1 font-medium tabular-nums transition-colors duration-150 ${
                mobilePane === "branch"
                  ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                  : "text-(--l-panel-fg-3)"
              }`}
            >
              Files ({session.branchFiles.length})
            </button>
          </div>
          <span className="hidden font-mono text-xs text-(--l-panel-fg-3) sm:inline">
            {session.model}
          </span>
        </div>
      </div>

      {/* 3-pane workspace layout */}
      <div className="flex min-w-0">
        {/* Left pane: sessions */}
        <div className="hidden w-52 shrink-0 border-r border-(--l-panel-border) sm:block lg:w-56">
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between px-2 py-1 text-xs text-(--l-panel-fg-3)">
              <span className="font-medium">Chats</span>
              <span className="rounded border border-(--l-panel-border) px-1 py-0.5 font-mono text-[10px] text-(--l-panel-fg-4)">
                ⌘K
              </span>
            </div>
            <div className="space-y-1">
              {WORKSPACE_SESSIONS.map((s) => {
                const active = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`flex w-full cursor-pointer flex-col rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ${
                      active
                        ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                        : "text-(--l-panel-fg-3) hover:bg-(--l-panel-surface) hover:text-(--l-panel-fg-2)"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">
                        {s.title}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-(--l-panel-fg-4)">
                        {s.age}
                      </span>
                    </div>
                    <span className="mt-0.5 truncate font-mono text-[11px] text-(--l-panel-fg-4)">
                      {s.branch}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center pane: live chat + inline team coordination */}
        <div
          className={`min-w-0 flex-1 flex-col ${
            mobilePane === "chat" ? "flex" : "hidden lg:flex"
          }`}
        >
          <div className="min-h-[340px] min-w-0 flex-1 overflow-hidden sm:min-h-[416px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={session.id}
                initial={{ opacity: 0, transform: "translateY(4px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                exit={{ opacity: 0, transform: "translateY(-4px)" }}
                transition={{ duration: 0.16, ease: EASE_OUT }}
                className="mx-auto min-w-0 max-w-2xl space-y-4 px-4 py-4 sm:px-5 sm:py-5"
              >
                {/* Prompt bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[92%] rounded-xl border border-(--l-panel-border) bg-(--l-panel-surface) px-3.5 py-2.5">
                    <p className="text-xs leading-relaxed text-(--l-panel-fg)">
                      {session.prompt}
                    </p>
                  </div>
                </div>

                {/* Live in-chat Team timeline card (when team mode runs in the turn) */}
                {session.inlineTeam && (
                  <div className="min-w-0 overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-panel-surface)">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--l-panel-border) px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 font-medium text-(--l-panel-fg)">
                        <Users
                          className="size-3.5 text-(--l-accent)"
                          strokeWidth={1.5}
                        />
                        <span>Team execution inline</span>
                      </div>
                      <span className="font-mono text-[11px] tabular-nums text-(--l-panel-fg-3)">
                        {session.inlineTeam.length} specialists · 0 conflicts
                      </span>
                    </div>
                    <div className="divide-y divide-(--l-panel-border)">
                      {session.inlineTeam.map((agent) => (
                        <div
                          key={agent.role}
                          className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <CheckCircle2
                              className="size-3.5 shrink-0 text-emerald-500"
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                            <span className="w-16 shrink-0 font-medium text-(--l-panel-fg)">
                              {agent.role}
                            </span>
                            <span className="truncate text-(--l-panel-fg-2)">
                              {agent.summary}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-(--l-panel-fg-4)">
                            <span className="hidden sm:inline">
                              {agent.file}
                            </span>
                            <span className="tabular-nums">
                              {agent.duration}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Direct tool steps */}
                <div className="space-y-1">
                  {session.directSteps.map((step) => (
                    <div
                      key={`${session.id}-${step.label}-${step.arg}`}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs transition-colors duration-150 hover:bg-(--l-panel-surface)"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <StepIcon kind={step.kind} />
                        <span className="shrink-0 font-medium text-(--l-panel-fg-2)">
                          {step.label}
                        </span>
                        <span className="truncate font-mono text-[11px] text-(--l-panel-fg-3)">
                          {step.arg}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-(--l-panel-fg-4)">
                        {step.meta}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Synthesized assistant summary */}
                <p className="text-xs leading-relaxed text-(--l-panel-fg-2)">
                  {session.response}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Composer bar */}
          <div className="px-4 pb-4 pt-1 sm:px-5">
            <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-panel-surface)">
              <div className="px-3.5 py-2.5">
                <span className="text-xs text-(--l-panel-fg-4)">
                  Describe what to build, or ask a team of specialists to
                  collaborate
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-(--l-panel-border) px-3 py-1.5">
                <div className="flex items-center gap-2 font-mono text-[11px] text-(--l-panel-fg-3)">
                  <span className="text-(--l-panel-fg-2)">{session.model}</span>
                  <span className="text-(--l-panel-fg-4)">·</span>
                  <span>{session.effort}</span>
                </div>
                <div className="flex size-5 items-center justify-center rounded-md bg-(--l-btn-bg)">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="size-2.5 text-(--l-btn-fg)"
                    aria-hidden="true"
                  >
                    <path d="M8 12V4M8 4l-3 3M8 4l3 3" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right pane: diff & branch changes */}
        <div
          className={`min-w-0 w-full shrink-0 flex-col border-(--l-panel-border) lg:flex lg:w-80 lg:border-l ${
            mobilePane === "chat" ? "hidden" : "flex"
          }`}
        >
          <div className="hidden items-center justify-between border-b border-(--l-panel-border) px-3 py-2 lg:flex">
            <div className="flex items-center gap-1 rounded-md bg-(--l-panel-surface) p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setInspectorTab("changes")}
                className={`cursor-pointer rounded px-2 py-0.5 font-medium transition-colors duration-150 ${
                  inspectorTab === "changes"
                    ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                    : "text-(--l-panel-fg-3) hover:text-(--l-panel-fg-2)"
                }`}
              >
                Diff
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab("branch")}
                className={`cursor-pointer rounded px-2 py-0.5 font-medium transition-colors duration-150 ${
                  inspectorTab === "branch"
                    ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                    : "text-(--l-panel-fg-3) hover:text-(--l-panel-fg-2)"
                }`}
              >
                Files ({session.branchFiles.length})
              </button>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-(--l-panel-fg-4)">
              +{session.diffStats.additions} −{session.diffStats.deletions}
            </span>
          </div>

          <div className="min-w-0 flex-1 overflow-hidden p-3.5">
            {mobilePane === "changes" ||
            (mobilePane === "chat" && inspectorTab === "changes") ? (
              <div className="min-w-0 space-y-3">
                <div className="flex min-w-0 items-center justify-between gap-2 font-mono text-[11px]">
                  <span className="truncate text-(--l-panel-fg-2)">
                    {session.diffFile}
                  </span>
                  <span className="shrink-0 tabular-nums text-(--l-panel-fg-3)">
                    +{session.diffStats.additions} −
                    {session.diffStats.deletions}
                  </span>
                </div>
                <div className="min-w-0 max-w-full overflow-x-auto rounded-lg border border-(--l-panel-border) bg-(--l-code-bg) py-1.5 font-mono text-[11px] leading-[1.6]">
                  {session.diffLines.map((line, idx) => (
                    <div
                      key={idx}
                      className={`flex px-2 ${
                        line.type === "add"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : line.type === "del"
                            ? "bg-rose-500/10 text-rose-500"
                            : "text-(--l-panel-fg-3)"
                      }`}
                    >
                      <span className="w-6 shrink-0 select-none pr-1.5 text-right tabular-nums opacity-45">
                        {line.lineNum ?? ""}
                      </span>
                      <span className="w-3 shrink-0 select-none opacity-70">
                        {line.type === "add"
                          ? "+"
                          : line.type === "del"
                            ? "−"
                            : " "}
                      </span>
                      <span className="truncate">{line.text}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-(--l-panel-border) bg-(--l-panel-surface) px-3 py-2 text-xs text-(--l-panel-fg-2)">
                  {session.prCheckSummary}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-medium text-(--l-panel-fg-3)">
                  Changed on branch
                </div>
                <div className="space-y-1">
                  {session.branchFiles.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center justify-between gap-2 rounded-md border border-(--l-panel-border) bg-(--l-panel-surface) px-2.5 py-2 font-mono text-[11px]"
                    >
                      <span className="truncate text-(--l-panel-fg-2)">
                        {file.path}
                      </span>
                      <span className="shrink-0 tabular-nums text-(--l-panel-fg-4)">
                        +{file.additions} −{file.deletions}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-(--l-panel-border) pt-3 text-xs text-(--l-panel-fg-3)">
                  {session.prCheckSummary}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
