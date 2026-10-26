"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const steps = [
  { label: "convert messages", ms: 700 },
  { label: "run agent loop", ms: 1800 },
  { label: "persist messages", ms: 500 },
  { label: "record usage", ms: 400 },
  { label: "refresh diff cache", ms: 600 },
  { label: "auto-commit + push", ms: 800 },
] as const;

export function FeatureWorkflow() {
  const [active, setActive] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const tick = useCallback((step: number) => {
    setActive(step);

    if (step >= steps.length) {
      timerRef.current = setTimeout(() => {
        setActive(-1);
        timerRef.current = setTimeout(() => tick(0), 600);
      }, 2000);
      return;
    }

    timerRef.current = setTimeout(() => tick(step + 1), steps[step]!.ms);
  }, []);

  useEffect(() => {
    timerRef.current = setTimeout(() => tick(0), 500);
    return clear;
  }, [tick, clear]);

  const done = active >= steps.length;

  return (
    <div className="flex h-[280px] flex-col bg-(--l-code-bg)">
      <div className="flex-1 px-5 py-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-(--l-panel-fg-3)">Durable workflow</span>
          <span className="text-(--l-panel-fg-4)">/</span>
          <span className="text-(--l-panel-fg-2)">session-orchestrator</span>
        </div>

        <div className="mt-5 space-y-[2px]">
          {steps.map((step, i) => {
            const isDone = i < active;
            const isActive = i === active;

            return (
              <div
                key={step.label}
                className="flex items-center gap-2.5 text-xs leading-[1.7] transition-opacity duration-300"
                style={{ opacity: isActive ? 1 : isDone ? 0.65 : 0.18 }}
              >
                <span
                  className="inline-flex size-1 shrink-0 rounded-full transition-colors duration-300"
                  style={{
                    backgroundColor: isActive
                      ? "var(--l-accent)"
                      : isDone
                        ? "var(--color-success)"
                        : "var(--l-panel-fg-5)",
                  }}
                />
                <code className="font-mono text-(--l-panel-fg-2)">{step.label}</code>
                {isDone && (
                  <span className="text-[10px] tabular-nums text-(--l-panel-fg-4)">
                    {(step.ms / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div
          className="mt-5 flex items-center gap-3 text-xs text-(--l-panel-fg-3) transition-opacity duration-500"
          style={{ opacity: done ? 1 : 0 }}
        >
          <span className="text-(--color-success)">{steps.length} steps completed</span>
          <span className="h-3 w-px bg-(--l-panel-border)" />
          <span>Resumable checkpoint</span>
        </div>
      </div>
    </div>
  );
}
