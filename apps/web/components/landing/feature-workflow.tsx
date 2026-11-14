"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { label: "claimActiveStream", ms: 400 },
  { label: "runAgentStep", ms: 1300 },
  { label: "runPostTurnPluginsStep", ms: 450 },
  { label: "persistFinalAssistantMessage", ms: 450 },
  { label: "recordWorkflowUsage", ms: 400 },
  { label: "refreshDiffCache", ms: 500 },
] as const;

export function FeatureWorkflow() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const run = (step: number) => {
      if (cancelled) return;
      setActive(step);

      if (step >= STEPS.length) {
        timeout = setTimeout(() => run(0), 2200);
        return;
      }

      timeout = setTimeout(() => run(step + 1), STEPS[step]!.ms);
    };

    timeout = setTimeout(() => run(0), 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  const done = active >= STEPS.length;

  return (
    <div className="flex h-[290px] flex-col justify-between bg-(--l-code-bg) px-5 py-4 font-mono text-xs">
      <div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-(--l-panel-fg-3)">workflow · chat.ts</span>
          <span className="text-(--l-panel-fg-3)">durable</span>
        </div>

        <div className="mt-4 space-y-2">
          {STEPS.map((step, i) => {
            const isDone = i < active;
            const isActive = i === active;

            return (
              <div
                key={step.label}
                className="flex items-center justify-between gap-2.5 leading-relaxed transition-opacity duration-200"
                style={{ opacity: isActive ? 1 : isDone ? 0.65 : 0.22 }}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="inline-flex size-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        isDone || isActive
                          ? "var(--l-panel-fg)"
                          : "var(--l-panel-fg-5)",
                    }}
                  />
                  <span className="truncate text-(--l-panel-fg-2)">
                    {step.label}
                  </span>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-(--l-panel-fg-4)">
                  {isDone
                    ? `${(step.ms / 1000).toFixed(1)}s`
                    : isActive
                      ? "running"
                      : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-(--l-panel-border) pt-3 text-[11px] tabular-nums text-(--l-panel-fg-2)">
        {done
          ? `complete · ${STEPS.length}/${STEPS.length} steps persisted`
          : `step ${Math.min(active + 1, STEPS.length)}/${STEPS.length} · stream resumable`}
      </div>
    </div>
  );
}
