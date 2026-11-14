import type { PluginManifest } from "./types";

export const BUILTIN_PLUGIN_CATALOG: readonly PluginManifest[] = [
  {
    slug: "verification-gate",
    name: "Verification Gate",
    version: "1.0.0",
    description:
      "Enforces post-edit verification reminders and adds the /verify command to validate types, lint, and tests before concluding.",
    category: "quality",
    source: "builtin",
    hooks: ["session.context", "tool.execute.after", "session.idle"],
    slashCommands: [
      {
        name: "verify",
        description: "Run typecheck, lint, and tests on current changes",
        promptTemplate:
          "Verify all recent changes in the workspace: inspect git_status, run the project's typecheck, lint, and test scripts cleanly, and fix any failures before summarizing.",
      },
    ],
    rules: {
      appendSystemPrompt:
        "[Plugin: Verification Gate] Never declare code complete after edits until relevant verification commands (typecheck, lint, targeted tests) have run cleanly on the final tree.",
      toolNotes: {
        write:
          "[Verification Gate] Remember to verify types and tests once your batch of edits is complete.",
        edit: "[Verification Gate] Remember to verify types and tests once your batch of edits is complete.",
      },
    },
    configFields: [],
  },
  {
    slug: "team-orchestrator",
    name: "Multi-Agent Team Protocol",
    version: "1.0.0",
    description:
      "Coordinates architect, explorer, executor, design, and reviewer teammates via the shared team_board and unlocks /team-plan.",
    category: "agents",
    source: "builtin",
    hooks: ["session.context", "tool.execute.after"],
    slashCommands: [
      {
        name: "team-plan",
        description:
          "Coordinate Architect + Explorer discovery before dispatching teammates",
        promptTemplate:
          "Execute this request as a coordinated Multi-Agent Team: first use the `architect` and `explorer` subagents to map the codebase and post contracts/decisions to `team_board`, then dispatch `executor` (and `design` if UI changes) in parallel where safe, and finish with a `reviewer` audit before reporting back.",
      },
    ],
    rules: {
      appendSystemPrompt:
        "[Plugin: Multi-Agent Team Protocol] For multi-file or cross-subsystem work, post architecture decisions on `team_board`, instruct subagents to read `team_board` first and record handoffs, and always close with a `reviewer` verification pass.",
    },
    configFields: [],
  },
  {
    slug: "security-auditor",
    name: "Security & Secret Guard",
    version: "1.0.0",
    description:
      "Applies extra regex redaction on tool outputs, forces manual review on outbound web fetches, and provides /security-review.",
    category: "security",
    source: "builtin",
    hooks: ["session.context", "tool.execute.after", "permission.evaluate"],
    slashCommands: [
      {
        name: "security-review",
        description: "Audit git diff and touched files for security issues",
        promptTemplate:
          "Perform a strict security audit on the current workspace changes using the `reviewer` subagent: check auth boundaries, input validation, secret leakage, SSRF/injection vectors, and SQL/migration safety.",
        targetAgent: "reviewer",
      },
    ],
    rules: {
      appendSystemPrompt:
        "[Plugin: Security & Secret Guard] Treat all untrusted inputs as hostile, never log or echo credentials/tokens, and enforce strict ownership checks on API routes.",
      requireApprovalTools: ["web_fetch"],
      redactOutputPatterns: [
        "-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----",
        "\\b(?:sk_live|rk_live|ghp|gho|github_pat)_[A-Za-z0-9_]{12,}\\b",
      ],
    },
    configFields: [],
  },
  {
    slug: "pr-ship-checklist",
    name: "PR Readiness Checklist",
    version: "1.0.0",
    description:
      "Adds pre-ship diff hygiene notes after git operations and provides /ship-check to prepare clean PR summaries.",
    category: "git",
    source: "builtin",
    hooks: ["session.context", "tool.execute.after"],
    slashCommands: [
      {
        name: "ship-check",
        description: "Inspect branch diff and prepare a PR readiness summary",
        promptTemplate:
          "Inspect `git_status` and recent diff, verify no debug artifacts or unintended files remain, confirm checks ran cleanly, and produce a crisp PR title + bulleted change summary.",
      },
    ],
    rules: {
      appendSystemPrompt:
        "[Plugin: PR Readiness] Keep diffs tightly scoped to the requested change and avoid leaving stray temporary files or unverified migrations.",
      toolNotes: {
        git_status:
          "[PR Readiness] Confirm untracked scratch files and build artifacts are excluded before committing.",
      },
    },
    configFields: [],
  },
  {
    slug: "context-compactor",
    name: "Precision Compaction",
    version: "1.0.0",
    description:
      "Guides context compaction to preserve critical file paths, test failures, and team decisions across long autonomous sessions.",
    category: "performance",
    source: "builtin",
    hooks: ["session.compaction", "session.context"],
    slashCommands: [
      {
        name: "checkpoint",
        description: "Summarize verified state, open risks, and next actions",
        promptTemplate:
          "Summarize the current session state as a durable engineering checkpoint: files modified (exact paths), verification results, active blockers, and the exact next concrete step.",
      },
    ],
    rules: {
      compactionHint:
        "Preserve all modified file paths, exact compiler/test failure lines, active team_board decisions, and unresolved blockers verbatim when compacting.",
    },
    configFields: [],
  },
] as const;

export function getBuiltinPluginBySlug(
  slug: string,
): PluginManifest | undefined {
  return BUILTIN_PLUGIN_CATALOG.find((plugin) => plugin.slug === slug);
}
