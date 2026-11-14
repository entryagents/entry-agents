"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

type SessionId = "oauth" | "cache" | "reconnect" | "plugins";
type InspectorTab = "changes" | "team";

type ToolRow = {
  readonly kind: "agent" | "board" | "edit" | "bash";
  readonly label: string;
  readonly arg: string;
  readonly meta: string;
};

type DiffLine = {
  readonly type: "ctx" | "add" | "del";
  readonly oldNum?: number;
  readonly newNum?: number;
  readonly text: string;
};

type TeamAgentRow = {
  readonly role: string;
  readonly task: string;
  readonly tokens: string;
  readonly duration: string;
};

type TeamChecklistRow = {
  readonly id: string;
  readonly title: string;
  readonly role: string;
};

type WorkspaceSession = {
  readonly id: SessionId;
  readonly title: string;
  readonly branch: string;
  readonly age: string;
  readonly prompt: string;
  readonly tools: readonly ToolRow[];
  readonly response: string;
  readonly files: readonly string[];
  readonly diffFile: string;
  readonly diffStats: {
    readonly additions: number;
    readonly deletions: number;
  };
  readonly diffLines: readonly DiffLine[];
  readonly teamAgents: readonly TeamAgentRow[];
  readonly teamTasks: readonly TeamChecklistRow[];
  readonly model: string;
  readonly effort: string;
};

const WORKSPACE_SESSIONS: readonly WorkspaceSession[] = [
  {
    id: "oauth",
    title: "GitHub App OAuth callback",
    branch: "feat/github-oauth",
    age: "2m",
    prompt:
      "Wire GitHub App installation callback into Better Auth and verify token scoping.",
    tools: [
      {
        kind: "agent",
        label: "Architect Subagent",
        arg: "Mapped callback boundary & 3 team tasks",
        meta: "1.2s",
      },
      {
        kind: "agent",
        label: "Explorer Subagent",
        arg: "lib/auth/config.ts, app/api/github/**",
        meta: "1.8s",
      },
      {
        kind: "edit",
        label: "Edit",
        arg: "apps/web/app/api/github/callback/route.ts",
        meta: "+34 −6",
      },
      {
        kind: "bash",
        label: "Bash",
        arg: "pnpm typecheck && bun test github-callback.test.ts",
        meta: "3.4s",
      },
      {
        kind: "board",
        label: "Team Board",
        arg: "Reviewer approved token redaction & state check",
        meta: "3/3 done",
      },
    ],
    response:
      "Connected the GitHub App installation callback to the session store, scoped installation tokens per repository, and verified all 14 callback tests pass.",
    files: [
      "app/api/github/callback/route.ts",
      "lib/auth/config.ts",
      "lib/github/installations.ts",
    ],
    diffFile: "app/api/github/callback/route.ts",
    diffStats: { additions: 34, deletions: 6 },
    diffLines: [
      {
        type: "ctx",
        oldNum: 41,
        newNum: 41,
        text: "  const session = await getServerSession(request);",
      },
      {
        type: "del",
        oldNum: 42,
        text: "  if (!installationId) return NextResponse.redirect('/');",
      },
      {
        type: "add",
        newNum: 42,
        text: "  const verified = await verifyInstallationState(stateCookie, state);",
      },
      {
        type: "add",
        newNum: 43,
        text: "  if (!verified || !installationId) {",
      },
      {
        type: "add",
        newNum: 44,
        text: "    return NextResponse.redirect(new URL('/settings/connections', request.url));",
      },
      {
        type: "add",
        newNum: 45,
        text: "  }",
      },
      {
        type: "ctx",
        oldNum: 43,
        newNum: 46,
        text: "  await linkGithubInstallation(session.user.id, installationId);",
      },
    ],
    teamAgents: [
      {
        role: "Architect",
        task: "Callback state & token scope contract",
        tokens: "4.2k",
        duration: "1.2s",
      },
      {
        role: "Explorer",
        task: "Locate auth config & installation helpers",
        tokens: "3.8k",
        duration: "1.8s",
      },
      {
        role: "Executor",
        task: "Implement route handler & unit tests",
        tokens: "8.1k",
        duration: "4.0s",
      },
      {
        role: "Reviewer",
        task: "Verify CSRF state & secret redaction",
        tokens: "2.9k",
        duration: "1.5s",
      },
    ],
    teamTasks: [
      {
        id: "T-1",
        title: "Verify state cookie before linking installation",
        role: "Architect",
      },
      {
        id: "T-2",
        title: "Persist installation ID on user connection row",
        role: "Executor",
      },
      {
        id: "T-3",
        title: "Confirm token never enters client response",
        role: "Reviewer",
      },
    ],
    model: "Claude Opus 4.6",
    effort: "high",
  },
  {
    id: "cache",
    title: "Split prompt cache prefix",
    branch: "perf/prompt-cache",
    age: "18m",
    prompt:
      "Separate static system instructions from volatile branch metadata so turns hit the provider prefix cache.",
    tools: [
      {
        kind: "agent",
        label: "Explorer Subagent",
        arg: "packages/agent/system-prompt.ts",
        meta: "1.1s",
      },
      {
        kind: "edit",
        label: "Edit",
        arg: "packages/agent/system-prompt.ts",
        meta: "+28 −14",
      },
      {
        kind: "edit",
        label: "Edit",
        arg: "packages/agent/open-agent.ts",
        meta: "+19 −5",
      },
      {
        kind: "bash",
        label: "Bash",
        arg: "bun test packages/agent/prompt-cache.test.ts",
        meta: "1.9s",
      },
    ],
    response:
      "Isolated dynamic git branch and sandbox status into the trailing system block while keeping the core prompt byte-identical across turns.",
    files: ["packages/agent/system-prompt.ts", "packages/agent/open-agent.ts"],
    diffFile: "packages/agent/system-prompt.ts",
    diffStats: { additions: 28, deletions: 14 },
    diffLines: [
      {
        type: "ctx",
        oldNum: 88,
        newNum: 88,
        text: "export function buildSystemPromptBlocks(opts: PromptOptions) {",
      },
      {
        type: "del",
        oldNum: 89,
        text: "  return STATIC_INSTRUCTIONS + '\\nBranch: ' + opts.branch;",
      },
      {
        type: "add",
        newNum: 89,
        text: "  return {",
      },
      {
        type: "add",
        newNum: 90,
        text: "    stablePrefix: STATIC_INSTRUCTIONS,",
      },
      {
        type: "add",
        newNum: 91,
        text: "    dynamicTail: formatRuntimeContext(opts),",
      },
      {
        type: "add",
        newNum: 92,
        text: "  };",
      },
      {
        type: "ctx",
        oldNum: 90,
        newNum: 93,
        text: "}",
      },
    ],
    teamAgents: [
      {
        role: "Explorer",
        task: "Audit volatile fields in system prompt builder",
        tokens: "3.1k",
        duration: "1.1s",
      },
      {
        role: "Executor",
        task: "Split stablePrefix & dynamicTail blocks",
        tokens: "6.4k",
        duration: "2.8s",
      },
    ],
    teamTasks: [
      {
        id: "T-1",
        title: "Keep tool definitions deterministically sorted",
        role: "Explorer",
      },
      {
        id: "T-2",
        title: "Attach cache_control breakpoint to stable prefix",
        role: "Executor",
      },
    ],
    model: "DeepSeek V3.2",
    effort: "medium",
  },
  {
    id: "reconnect",
    title: "Durable stream reconnect",
    branch: "fix/stream-resume",
    age: "1h",
    prompt:
      "Ensure reloading a chat mid-turn resumes the active workflow stream without duplicating tool rows.",
    tools: [
      {
        kind: "agent",
        label: "Explorer Subagent",
        arg: "app/workflows/chat.ts, app/api/chat/[chatId]/stream/route.ts",
        meta: "1.5s",
      },
      {
        kind: "edit",
        label: "Edit",
        arg: "apps/web/app/workflows/chat-post-finish.ts",
        meta: "+22 −4",
      },
      {
        kind: "bash",
        label: "Bash",
        arg: "bun test apps/web/app/workflows/chat.test.ts",
        meta: "2.7s",
      },
    ],
    response:
      "Checkpointed assistant tool results after each workflow step and guarded final stream cleanup with compare-and-set ownership.",
    files: [
      "app/workflows/chat-post-finish.ts",
      "app/api/chat/[chatId]/stream/route.ts",
    ],
    diffFile: "app/workflows/chat-post-finish.ts",
    diffStats: { additions: 22, deletions: 4 },
    diffLines: [
      {
        type: "ctx",
        oldNum: 230,
        newNum: 230,
        text: "  const dedupedMessage = dedupeMessageReasoning(message);",
      },
      {
        type: "del",
        oldNum: 231,
        text: "  await upsertChatMessage(dedupedMessage);",
      },
      {
        type: "add",
        newNum: 231,
        text: "  await upsertChatMessageAndClearActiveStream(",
      },
      {
        type: "add",
        newNum: 232,
        text: "    { id: dedupedMessage.id, chatId, role: 'assistant', parts: sanitized },",
      },
      {
        type: "add",
        newNum: 233,
        text: "    workflowRunId,",
      },
      {
        type: "add",
        newNum: 234,
        text: "    { finalizeStatus: 'completed' },",
      },
      {
        type: "add",
        newNum: 235,
        text: "  );",
      },
    ],
    teamAgents: [
      {
        role: "Explorer",
        task: "Trace activeStreamId ownership across reload",
        tokens: "4.0k",
        duration: "1.5s",
      },
      {
        role: "Executor",
        task: "Atomic message upsert + stream pointer clear",
        tokens: "7.2k",
        duration: "3.1s",
      },
    ],
    teamTasks: [
      {
        id: "T-1",
        title: "Persist mid-turn tool checkpoints per step",
        role: "Executor",
      },
      {
        id: "T-2",
        title: "Guard activeStreamId clear on workflowRunId",
        role: "Executor",
      },
    ],
    model: "Claude Sonnet 4.6",
    effort: "high",
  },
  {
    id: "plugins",
    title: "Secret redaction hook",
    branch: "feat/plugin-hooks",
    age: "4h",
    prompt:
      "/verify Run the security-auditor plugin and confirm runtime secrets are scrubbed from tool output.",
    tools: [
      {
        kind: "board",
        label: "Plugin Hook",
        arg: "security-auditor · tool.execute.after",
        meta: "active",
      },
      {
        kind: "edit",
        label: "Edit",
        arg: "packages/agent/plugins/engine.ts",
        meta: "+41 −3",
      },
      {
        kind: "bash",
        label: "Bash",
        arg: "bun test packages/agent/plugins/engine.test.ts",
        meta: "1.4s",
      },
    ],
    response:
      "Verified that `tool.execute.after` scrubs matching token patterns and AES-256-GCM vault values before tool outputs are persisted or streamed.",
    files: ["packages/agent/plugins/engine.ts", "lib/plugins/encryption.ts"],
    diffFile: "packages/agent/plugins/engine.ts",
    diffStats: { additions: 41, deletions: 3 },
    diffLines: [
      {
        type: "ctx",
        oldNum: 112,
        newNum: 112,
        text: "  let nextOutput = rawOutput;",
      },
      {
        type: "add",
        newNum: 113,
        text: "  for (const pattern of compiledRedactionPatterns) {",
      },
      {
        type: "add",
        newNum: 114,
        text: "    nextOutput = nextOutput.replace(pattern.regex, pattern.replacement);",
      },
      {
        type: "add",
        newNum: 115,
        text: "  }",
      },
      {
        type: "ctx",
        oldNum: 113,
        newNum: 116,
        text: "  return nextOutput;",
      },
    ],
    teamAgents: [
      {
        role: "Executor",
        task: "Compile regex redaction rules in plugin runner",
        tokens: "5.1k",
        duration: "2.0s",
      },
      {
        role: "Reviewer",
        task: "Verify secret values never enter transcript",
        tokens: "2.4k",
        duration: "1.1s",
      },
    ],
    teamTasks: [
      {
        id: "T-1",
        title: "Apply regex replacement on tool.execute.after",
        role: "Executor",
      },
      {
        id: "T-2",
        title: "Record plugin trigger telemetry post-turn",
        role: "Reviewer",
      },
    ],
    model: "GPT-5 Codex",
    effort: "high",
  },
];

function ToolIcon({ kind }: { readonly kind: ToolRow["kind"] }) {
  if (kind === "agent") {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className="size-3 shrink-0 text-(--l-panel-fg-3)"
        aria-hidden="true"
      >
        <circle cx="8" cy="5" r="2.2" />
        <path d="M3.5 13c.6-2.2 2.3-3.5 4.5-3.5s3.9 1.3 4.5 3.5" />
      </svg>
    );
  }
  if (kind === "board") {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className="size-3 shrink-0 text-(--l-panel-fg-3)"
        aria-hidden="true"
      >
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
        <path d="M5 6h6M5 9h4" />
      </svg>
    );
  }
  if (kind === "bash") {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className="size-3 shrink-0 text-(--l-panel-fg-3)"
        aria-hidden="true"
      >
        <path d="M4 5.5L7 8l-3 2.5M8.5 10.5H12" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="size-3 shrink-0 text-(--l-panel-fg-3)"
      aria-hidden="true"
    >
      <path d="M9.5 3.5l3 3L5.5 13.5H2.5v-3L9.5 3.5z" />
    </svg>
  );
}

export function AppMockup() {
  const [selectedId, setSelectedId] = useState<SessionId>("oauth");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("changes");
  const session =
    WORKSPACE_SESSIONS.find((s) => s.id === selectedId) ??
    WORKSPACE_SESSIONS[0];

  return (
    <div
      className="overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-panel) ring-1 ring-(--l-panel-border)"
      style={{ boxShadow: "var(--l-window-shadow)" }}
    >
      {/* Workspace Header Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-(--l-panel-border) px-3 py-2 lg:px-4">
        <div className="flex min-w-0 items-center gap-2 text-[11px]">
          <span className="font-medium text-(--l-panel-fg)">
            entryagents/entry-agents
          </span>
          <span className="text-(--l-panel-fg-4)">/</span>
          <span className="truncate font-mono text-[10px] text-(--l-panel-fg-2)">
            {session.branch}
          </span>
        </div>

        {/* Mobile session selector */}
        <div className="flex items-center gap-1 sm:hidden">
          {WORKSPACE_SESSIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                s.id === selectedId
                  ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                  : "text-(--l-panel-fg-3)"
              }`}
            >
              {s.title.split(" ")[0]}
            </button>
          ))}
        </div>

        <div className="hidden items-center gap-3 font-mono text-[10px] text-(--l-panel-fg-3) sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>sandbox active</span>
          </span>
          <span className="text-(--l-panel-fg-4)">·</span>
          <span className="tabular-nums">
            +{session.diffStats.additions} −{session.diffStats.deletions}
          </span>
        </div>
      </div>

      {/* 3-Pane Workspace Body */}
      <div className="flex">
        {/* Left Pane: Sessions List */}
        <div className="hidden w-48 shrink-0 border-r border-(--l-panel-border) sm:block lg:w-52">
          <div className="p-2.5">
            <div className="mb-1.5 flex items-center justify-between px-2 py-1 text-[11px] text-(--l-panel-fg-3)">
              <span className="font-medium">Sessions</span>
              <span className="font-mono text-[10px] text-(--l-panel-fg-4)">
                ⌘K
              </span>
            </div>
            <div className="space-y-0.5">
              {WORKSPACE_SESSIONS.map((s) => {
                const active = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left transition-colors cursor-pointer ${
                      active
                        ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                        : "text-(--l-panel-fg-3) hover:bg-(--l-panel-surface) hover:text-(--l-panel-fg-2)"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-medium">
                        {s.title}
                      </span>
                      <span className="shrink-0 font-mono text-[9px] tabular-nums text-(--l-panel-fg-4)">
                        {s.age}
                      </span>
                    </div>
                    <span className="mt-0.5 truncate font-mono text-[9px] text-(--l-panel-fg-4)">
                      {s.branch}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center Pane: Chat Transcript & Composer */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-[340px] flex-1 overflow-hidden sm:min-h-[410px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={session.id}
                initial={{ opacity: 0, transform: "translateY(4px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                exit={{ opacity: 0, transform: "translateY(-4px)" }}
                transition={{ duration: 0.18, ease: EASE_OUT_QUINT }}
                className="mx-auto max-w-2xl space-y-3.5 px-3.5 py-4 sm:px-5 sm:py-5"
              >
                {/* User Message */}
                <div className="flex justify-end">
                  <div className="max-w-[88%] rounded-2xl border border-(--l-panel-border) bg-(--l-panel-surface) px-3.5 py-2">
                    <p className="text-[12px] leading-relaxed text-(--l-panel-fg)">
                      {session.prompt}
                    </p>
                  </div>
                </div>

                {/* Compact Tool Call Feed (matches Entry's real ToolLayout rows) */}
                <div className="space-y-1 py-0.5">
                  {session.tools.map((tool, idx) => (
                    <div
                      key={`${session.id}-${tool.label}-${idx}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-(--l-panel-surface)"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <ToolIcon kind={tool.kind} />
                        <span className="shrink-0 font-medium text-(--l-panel-fg-2)">
                          {tool.label}
                        </span>
                        <span className="truncate font-mono text-[10px] text-(--l-panel-fg-3)">
                          {tool.arg}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-(--l-panel-fg-4)">
                        {tool.meta}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Assistant Response */}
                <p className="text-[12px] leading-[1.65] text-(--l-panel-fg-2)">
                  {session.response}
                </p>

                {/* Touched Files */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {session.files.map((file) => (
                    <span
                      key={file}
                      className="inline-flex items-center gap-1.5 rounded border border-(--l-panel-border) bg-(--l-panel-surface) px-2 py-0.5 font-mono text-[10px] text-(--l-panel-fg-2)"
                    >
                      {file}
                    </span>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Composer */}
          <div className="px-3.5 pb-3.5 pt-1 sm:px-5 sm:pb-4">
            <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-panel-surface)">
              <div className="px-3.5 py-2">
                <span className="text-[11px] text-(--l-panel-fg-4)">
                  Ask anything, @ to mention files, or / for commands...
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-(--l-panel-border) px-3 py-1.5">
                <div className="flex items-center gap-2 font-mono text-[10px] text-(--l-panel-fg-3)">
                  <span className="text-(--l-panel-fg-2)">{session.model}</span>
                  <span className="text-(--l-panel-fg-4)">·</span>
                  <span>{session.effort}</span>
                </div>
                <div className="flex size-5 items-center justify-center rounded-full bg-(--l-btn-bg)">
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

        {/* Right Pane: Changes & Team Inspector */}
        <div className="hidden w-72 shrink-0 flex-col border-l border-(--l-panel-border) lg:flex">
          <div className="flex items-center justify-between border-b border-(--l-panel-border) px-3 py-2">
            <div className="flex items-center gap-1 rounded-md bg-(--l-panel-surface) p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setInspectorTab("changes")}
                className={`rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                  inspectorTab === "changes"
                    ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                    : "text-(--l-panel-fg-3) hover:text-(--l-panel-fg-2)"
                }`}
              >
                Changes
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab("team")}
                className={`rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                  inspectorTab === "team"
                    ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                    : "text-(--l-panel-fg-3) hover:text-(--l-panel-fg-2)"
                }`}
              >
                Team ({session.teamAgents.length})
              </button>
            </div>
            <span className="font-mono text-[10px] tabular-nums text-(--l-panel-fg-4)">
              {inspectorTab === "changes"
                ? `${session.files.length} files`
                : `${session.teamTasks.length} tasks`}
            </span>
          </div>

          <div className="flex-1 overflow-hidden p-3">
            {inspectorTab === "changes" ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="truncate text-(--l-panel-fg-2)">
                    {session.diffFile}
                  </span>
                  <span className="shrink-0 tabular-nums text-(--l-panel-fg-3)">
                    +{session.diffStats.additions} −
                    {session.diffStats.deletions}
                  </span>
                </div>
                <div className="overflow-hidden rounded-lg border border-(--l-panel-border) bg-(--l-code-bg) py-1.5 font-mono text-[10px] leading-[1.6]">
                  {session.diffLines.map((line, idx) => (
                    <div
                      key={idx}
                      className={`flex px-2 ${
                        line.type === "add"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : line.type === "del"
                            ? "bg-rose-500/10 text-rose-400"
                            : "text-(--l-panel-fg-3)"
                      }`}
                    >
                      <span className="w-5 shrink-0 select-none text-right tabular-nums opacity-45 pr-1.5">
                        {line.newNum ?? line.oldNum ?? ""}
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
                <div className="space-y-1 pt-1">
                  <div className="text-[11px] font-medium text-(--l-panel-fg-3)">
                    Modified in branch
                  </div>
                  {session.files.map((file) => (
                    <div
                      key={file}
                      className="flex items-center justify-between rounded px-1.5 py-1 font-mono text-[10px] text-(--l-panel-fg-3)"
                    >
                      <span className="truncate">{file}</span>
                      <span className="text-(--l-panel-fg-4)">M</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-(--l-panel-fg-3)">
                    Subagents
                  </div>
                  {session.teamAgents.map((agent) => (
                    <div
                      key={agent.role}
                      className="rounded-md border border-(--l-panel-border) bg-(--l-panel-surface) px-2.5 py-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-(--l-panel-fg)">
                          {agent.role}
                        </span>
                        <span className="font-mono text-[9px] tabular-nums text-(--l-panel-fg-4)">
                          {agent.tokens} · {agent.duration}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-(--l-panel-fg-3)">
                        {agent.task}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-medium text-(--l-panel-fg-3)">
                    Team board
                  </div>
                  {session.teamTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-2 rounded px-1.5 py-1 text-[10px]"
                    >
                      <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-(--l-panel-fg-2)">
                          {task.title}
                        </div>
                        <div className="font-mono text-[9px] text-(--l-panel-fg-4)">
                          {task.id} · {task.role}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
