"use client";

import { useEffect, useState } from "react";

type RoleKey = "architect" | "explorer" | "executor" | "reviewer";

const ROLES: readonly {
  readonly id: RoleKey;
  readonly label: string;
  readonly scope: string;
  readonly steps: readonly {
    readonly tool: string;
    readonly arg: string;
    readonly duration: string;
  }[];
  readonly note: string;
}[] = [
  {
    id: "architect",
    label: "architect",
    scope: "read-only · planner",
    steps: [
      {
        tool: "dir_list",
        arg: "packages/agent apps/web",
        duration: "0.2s",
      },
      {
        tool: "read",
        arg: "packages/agent/plugins/types.ts",
        duration: "0.4s",
      },
      {
        tool: "team_board",
        arg: "plan_tasks (3 assigned)",
        duration: "0.6s",
      },
    ],
    note: "Posted module boundaries & task checklist to Team Board.",
  },
  {
    id: "explorer",
    label: "explorer",
    scope: "read-only · discovery",
    steps: [
      { tool: "glob", arg: "app/api/**/route.ts", duration: "0.3s" },
      {
        tool: "grep",
        arg: "sessionLayoutShell | headerActionsRef",
        duration: "0.5s",
      },
      {
        tool: "team_board",
        arg: "post 'Header portal mount contract'",
        duration: "0.4s",
      },
    ],
    note: "Mapped 4 integration files and handed off line ranges cleanly.",
  },
  {
    id: "executor",
    label: "executor",
    scope: "workspace write · verify",
    steps: [
      {
        tool: "write",
        arg: "components/command-palette.tsx",
        duration: "1.1s",
      },
      {
        tool: "edit",
        arg: "session-chat-content.tsx",
        duration: "0.8s",
      },
      {
        tool: "bash",
        arg: "pnpm typecheck && bun test",
        duration: "3.2s",
      },
    ],
    note: "Implemented changes; verification-gate confirmed 0 type errors.",
  },
  {
    id: "reviewer",
    label: "reviewer",
    scope: "read-only · audit",
    steps: [
      { tool: "bash", arg: "git diff --stat", duration: "0.3s" },
      { tool: "read", arg: "lib/plugins/encryption.ts", duration: "0.4s" },
      {
        tool: "team_board",
        arg: "update_task T-03 -> completed",
        duration: "0.5s",
      },
    ],
    note: "Approved: AES-256-GCM key isolation & regression tests verified.",
  },
];

export function FeatureAgent() {
  const [roleIdx, setRoleIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setRoleIdx((prev) => (prev + 1) % ROLES.length);
    }, 3600);
    return () => clearInterval(id);
  }, [paused]);

  const role = ROLES[roleIdx] ?? ROLES[0];

  return (
    <div className="flex h-[290px] flex-col justify-between bg-(--l-code-bg) px-5 py-4 font-mono text-[11px]">
      <div>
        <div className="flex items-center justify-between gap-2 border-b border-(--l-panel-border) pb-2.5">
          <div className="flex items-center gap-1">
            {ROLES.map((item, i) => {
              const active = i === roleIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setPaused(true);
                    setRoleIdx(i);
                  }}
                  className={`rounded px-2 py-0.5 transition-colors cursor-pointer ${
                    active
                      ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                      : "text-(--l-panel-fg-3) hover:text-(--l-panel-fg-2)"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <span className="text-[10px] text-(--l-panel-fg-4)">
            {role.scope}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {role.steps.map((step, i) => (
            <div
              key={`${role.id}-${step.tool}-${i}`}
              className="flex items-center justify-between gap-3 py-0.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="text-(--l-panel-fg-2)">▸</span>
                <span className="w-20 shrink-0 text-(--l-panel-fg)">
                  {step.tool}
                </span>
                <span className="truncate text-(--l-panel-fg-3)">
                  {step.arg}
                </span>
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-(--l-panel-fg-4)">
                {step.duration}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-(--l-panel-border) pt-3 font-sans text-[12px] leading-relaxed text-(--l-panel-fg-2)">
        {role.note}
      </div>
    </div>
  );
}
