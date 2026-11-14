"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const STEPS = [
  { label: "convert messages & prompt prefix", ms: 450 },
  { label: "run durable agent loop", ms: 1300 },
  { label: "execute plugin redaction & gates", ms: 400 },
  { label: "persist messages + checkpoints", ms: 450 },
  { label: "meter usage + refresh diff cache", ms: 400 },
  { label: "auto-commit & push branch", ms: 600 },
] as const;

export function FeatureWorkflow() {
  const [active, setActive] = useState(2);
  const [dropped, setDropped] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleFrom = useCallback(
    (step: number) => {
      clear();
      setActive(step);

      if (step >= STEPS.length) {
        timerRef.current = setTimeout(() => {
          setDropped(false);
          scheduleFrom(0);
        }, 2200);
        return;
      }

      timerRef.current = setTimeout(
        () => scheduleFrom(step + 1),
        STEPS[step]!.ms,
      );
    },
    [clear],
  );

  useEffect(() => {
    scheduleFrom(0);
    return clear;
  }, [scheduleFrom, clear]);

  const simulateDrop = () => {
    const frozenStep = Math.min(Math.max(active, 1), STEPS.length - 1);
    clear();
    setDropped(true);
    setActive(frozenStep);
    timerRef.current = setTimeout(() => {
      setDropped(false);
      scheduleFrom(frozenStep + 1);
    }, 1500);
  };

  const progressRatio = Math.min(1, Math.max(0, active / STEPS.length));
  const done = active >= STEPS.length;

  return (
    <div className="flex h-[300px] flex-col justify-between bg-(--l-code-bg) px-5 py-4">
      <div>
        <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-(--l-panel-fg-3)">workflow</span>
            <span className="text-(--l-panel-fg-2)">chat.ts</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                dropped
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-(--l-panel-surface) text-(--l-panel-fg-3)"
              }`}
            >
              {dropped ? "reconnecting..." : "durable"}
            </span>
          </div>

          <button
            type="button"
            onClick={simulateDrop}
            className="rounded border border-(--l-panel-border) bg-(--l-panel) px-2 py-0.5 text-[10px] text-(--l-panel-fg-2) transition-[border-color,transform] hover:border-(--l-fg-4) active:scale-[0.97] cursor-pointer"
          >
            Simulate disconnect
          </button>
        </div>

        {/* GPU checkpoint progress track */}
        <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-(--l-panel-fg-5)">
          <motion.div
            className="h-full origin-left bg-(--l-accent)"
            animate={{ scaleX: progressRatio }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          />
        </div>

        <div className="mt-4 space-y-1.5">
          {STEPS.map((step, i) => {
            const isDone = i < active;
            const isActive = i === active;

            return (
              <div
                key={step.label}
                className="flex items-center justify-between gap-2 font-mono text-[11px] leading-relaxed transition-opacity duration-200"
                style={{ opacity: isActive ? 1 : isDone ? 0.65 : 0.22 }}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="inline-flex size-1.5 shrink-0 rounded-full transition-colors duration-200"
                    style={{
                      backgroundColor: isActive
                        ? "var(--l-accent)"
                        : isDone
                          ? "var(--l-panel-fg-2)"
                          : "var(--l-panel-fg-5)",
                    }}
                  />
                  <span className="truncate text-(--l-panel-fg-2)">
                    {step.label}
                  </span>
                </div>
                <span className="shrink-0 text-[10px] text-(--l-panel-fg-4)">
                  {isDone
                    ? `${(step.ms / 1000).toFixed(1)}s`
                    : isActive && dropped
                      ? "checkpointed"
                      : isActive
                        ? "running"
                        : "queued"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-(--l-panel-border) pt-2 font-mono text-[10px] text-(--l-panel-fg-3)">
        <span>
          {dropped
            ? "client disconnected · agent step kept running server-side"
            : done
              ? `complete · ${STEPS.length} checkpoints persisted`
              : `step ${Math.min(active + 1, STEPS.length)}/${STEPS.length} · stream offset persisted`}
        </span>
      </div>
    </div>
  );
}
