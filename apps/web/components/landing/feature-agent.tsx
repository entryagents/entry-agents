"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

type RoleKey = "architect" | "explorer" | "executor" | "reviewer";

const ROLES: readonly {
  readonly id: RoleKey;
  readonly label: string;
  readonly scope: string;
  readonly steps: readonly { readonly tool: string; readonly arg: string }[];
  readonly note: string;
}[] = [
  {
    id: "architect",
    label: "Architect",
    scope: "read-only · planner",
    steps: [
      { tool: "dir_list", arg: "packages/agent apps/web" },
      { tool: "read", arg: "packages/agent/plugins/types.ts" },
      { tool: "team_board", arg: "plan_tasks (3 assigned)" },
    ],
    note: "Posted module boundaries & acceptance checklist to Team Board.",
  },
  {
    id: "explorer",
    label: "Explorer",
    scope: "read-only · discovery",
    steps: [
      { tool: "glob", arg: "app/api/**/route.ts" },
      { tool: "grep", arg: "sessionLayoutShell | headerActionsRef" },
      { tool: "team_board", arg: "post 'Header portal mount contract'" },
    ],
    note: "Mapped 4 integration files and handed off line ranges cleanly.",
  },
  {
    id: "executor",
    label: "Executor",
    scope: "workspace write · verify",
    steps: [
      { tool: "write", arg: "components/command-palette.tsx" },
      { tool: "edit", arg: "session-chat-content.tsx" },
      { tool: "bash", arg: "pnpm typecheck && bun test" },
    ],
    note: "Implemented changes; verification-gate confirmed 0 type errors.",
  },
  {
    id: "reviewer",
    label: "Reviewer",
    scope: "read-only · audit",
    steps: [
      { tool: "bash", arg: "git diff --stat" },
      { tool: "read", arg: "lib/plugins/encryption.ts" },
      { tool: "team_board", arg: "update_task T-03 -> completed" },
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
    <div className="flex h-[300px] flex-col justify-between bg-(--l-code-bg) px-5 py-4">
      <div>
        {/* Interactive Role Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--l-panel-border) pb-3">
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
                  className="relative rounded px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer"
                >
                  {active && (
                    <motion.span
                      layoutId="feature-agent-role"
                      transition={{
                        type: "spring",
                        duration: 0.35,
                        bounce: 0.15,
                      }}
                      className="absolute inset-0 rounded bg-(--l-panel-active) ring-1 ring-inset ring-(--l-panel-border)"
                    />
                  )}
                  <span
                    className={`relative ${
                      active ? "text-(--l-panel-fg)" : "text-(--l-panel-fg-3)"
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
          <span className="font-mono text-[10px] text-(--l-panel-fg-4)">
            {role.scope}
          </span>
        </div>

        {/* Active Role Tool Stream */}
        <AnimatePresence mode="wait">
          <motion.div
            key={role.id}
            initial={{ opacity: 0, transform: "translateY(5px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0, transform: "translateY(-4px)" }}
            transition={{ duration: 0.18, ease: EASE_OUT_QUINT }}
            className="mt-4 space-y-2"
          >
            {role.steps.map((step, i) => (
              <motion.div
                key={`${role.id}-${step.tool}-${i}`}
                initial={{ opacity: 0, transform: "translateX(-4px)" }}
                animate={{ opacity: 1, transform: "translateX(0px)" }}
                transition={{
                  duration: 0.2,
                  delay: i * 0.05,
                  ease: EASE_OUT_QUINT,
                }}
                className="flex items-center gap-2.5 rounded border border-(--l-panel-border) bg-(--l-panel) px-2.5 py-1.5 font-mono text-[11px]"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-(--l-accent)" />
                <span className="w-20 shrink-0 text-(--l-panel-fg)">
                  {step.tool}
                </span>
                <span className="truncate text-(--l-panel-fg-3)">
                  {step.arg}
                </span>
              </motion.div>
            ))}

            <div className="pt-2 text-[12px] leading-relaxed text-(--l-panel-fg-2)">
              {role.note}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between border-t border-(--l-panel-border) pt-2 font-mono text-[10px] text-(--l-panel-fg-4)">
        <span>click a role to inspect</span>
        <span>{paused ? "manual" : "auto-cycling"}</span>
      </div>
    </div>
  );
}
