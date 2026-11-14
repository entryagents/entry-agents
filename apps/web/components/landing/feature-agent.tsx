"use client";

import { useEffect, useState } from "react";

type RoleKey = "architect" | "explorer" | "executor" | "reviewer";

const ROLES: readonly {
  readonly id: RoleKey;
  readonly label: string;
  readonly scope: string;
  readonly claimedFile: string;
  readonly steps: readonly {
    readonly action: string;
    readonly target: string;
    readonly duration: string;
  }[];
  readonly note: string;
}[] = [
  {
    id: "architect",
    label: "Architect",
    scope: "plan & boundaries",
    claimedFile: "routes/session.ts",
    steps: [
      {
        action: "inspect",
        target: "workspace repository layout",
        duration: "0.3s",
      },
      {
        action: "lock",
        target: "split edits across 3 non-conflicting files",
        duration: "0.5s",
      },
      {
        action: "post",
        target: "inline team task plan",
        duration: "0.4s",
      },
    ],
    note: "Posted plan & assigned non-overlapping file ownership inline",
  },
  {
    id: "explorer",
    label: "Explorer",
    scope: "fast discovery",
    claimedFile: "auth/config.ts",
    steps: [
      { action: "find", target: "app/api/**/route.ts", duration: "0.3s" },
      {
        action: "trace",
        target: "session middleware & token validation",
        duration: "0.5s",
      },
      {
        action: "hand off",
        target: "exact line references to executor",
        duration: "0.3s",
      },
    ],
    note: "Mapped 4 integration files so executor edits cleanly on first pass",
  },
  {
    id: "executor",
    label: "Executor",
    scope: "code & test",
    claimedFile: "api/callback.ts",
    steps: [
      {
        action: "edit",
        target: "app/api/github/callback/route.ts",
        duration: "1.1s",
      },
      {
        action: "edit",
        target: "lib/github/installations.ts",
        duration: "0.8s",
      },
      {
        action: "test",
        target: "pnpm typecheck && bun test",
        duration: "2.4s",
      },
    ],
    note: "Applied scoped changes and confirmed all unit tests pass",
  },
  {
    id: "reviewer",
    label: "Reviewer",
    scope: "verification gate",
    claimedFile: "callback.test.ts",
    steps: [
      { action: "diff", target: "git diff --stat main", duration: "0.3s" },
      {
        action: "audit",
        target: "error paths & state token expiry",
        duration: "0.5s",
      },
      {
        action: "approve",
        target: "all team tasks marked verified",
        duration: "0.4s",
      },
    ],
    note: "Verified zero file conflicts, edge cases, and clean test status",
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
    <div className="flex min-h-[288px] flex-col justify-between bg-(--l-code-bg) px-4 py-4 font-mono text-xs sm:px-5">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-(--l-panel-border) pb-3">
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
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
                  className={`shrink-0 cursor-pointer rounded px-2 py-1 text-xs transition-colors duration-150 ${
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
          <span className="truncate text-[11px] text-(--l-panel-fg-4)">
            {role.scope} · {role.claimedFile}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {role.steps.map((step, i) => (
            <div
              key={`${role.id}-${step.action}-${i}`}
              className="flex items-center justify-between gap-3 py-0.5 text-[11px]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="text-(--l-panel-fg-2)">›</span>
                <span className="w-16 shrink-0 text-(--l-panel-fg)">
                  {step.action}
                </span>
                <span className="truncate text-(--l-panel-fg-3)">
                  {step.target}
                </span>
              </div>
              <span className="shrink-0 tabular-nums text-(--l-panel-fg-4)">
                {step.duration}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-(--l-panel-border) pt-3 font-sans text-xs leading-relaxed text-(--l-panel-fg-2)">
        {role.note}
      </div>
    </div>
  );
}
