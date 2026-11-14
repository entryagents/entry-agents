"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

const STAGES = [
  {
    state: "provisioning",
    label: "Provision",
    description: "Cloning feat/oauth-team into an isolated container boundary.",
    snapshot: "—",
    cost: "$0.02/m",
    progress: 0.2,
  },
  {
    state: "active",
    label: "Active",
    description: "Filesystem, terminal, MCP bridge, and live preview online.",
    snapshot: "—",
    cost: "$0.02/m",
    progress: 0.45,
  },
  {
    state: "hibernating",
    label: "Hibernate",
    description: "Capturing copy-on-write snapshot before idle sleep.",
    snapshot: "syncing...",
    cost: "$0.01/m",
    progress: 0.65,
  },
  {
    state: "hibernated",
    label: "Snapshot",
    description: "Zero compute billed · volume bytes preserved durably.",
    snapshot: "snap_a1b2c3",
    cost: "$0.00",
    progress: 0.85,
  },
  {
    state: "restoring",
    label: "Restore",
    description: "Reattaching branch volume on next prompt with full state.",
    snapshot: "snap_a1b2c3",
    cost: "$0.02/m",
    progress: 1,
  },
] as const;

export function FeatureSandbox() {
  const [idx, setIdx] = useState(1);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (manual) return;
    const id = setInterval(() => {
      setIdx((prev) => (prev + 1) % STAGES.length);
    }, 2400);
    return () => clearInterval(id);
  }, [manual]);

  const entry = STAGES[idx] ?? STAGES[0];

  return (
    <div className="flex h-[300px] flex-col justify-between bg-(--l-code-bg) px-5 py-4">
      <div>
        <div className="flex items-center justify-between font-mono text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-(--l-panel-fg-3)">sandbox</span>
            <span className="text-(--l-panel-fg-2)">feat/oauth-team</span>
          </div>
          <span className="rounded border border-(--l-panel-border) bg-(--l-panel) px-1.5 py-0.5 text-[10px] text-(--l-panel-fg-2)">
            {entry.state}
          </span>
        </div>

        {/* Interactive Stage Scrubber */}
        <div className="mt-4 flex gap-1">
          {STAGES.map((stage, i) => (
            <button
              key={stage.state}
              type="button"
              onClick={() => {
                setManual(true);
                setIdx(i);
              }}
              className="group flex flex-1 flex-col items-start gap-1.5 py-1 text-left cursor-pointer"
            >
              <div className="h-1 w-full overflow-hidden rounded-full bg-(--l-panel-fg-5)">
                <div
                  className="h-full transition-colors duration-200"
                  style={{
                    backgroundColor:
                      i <= idx ? "var(--l-accent)" : "transparent",
                  }}
                />
              </div>
              <span
                className={`font-mono text-[9px] transition-colors ${
                  i === idx
                    ? "text-(--l-panel-fg)"
                    : "text-(--l-panel-fg-4) group-hover:text-(--l-panel-fg-2)"
                }`}
              >
                {stage.label}
              </span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={entry.state}
            initial={{ opacity: 0, transform: "translateY(4px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0, transform: "translateY(-4px)" }}
            transition={{ duration: 0.18, ease: EASE_OUT_QUINT }}
            className="mt-5 rounded-lg border border-(--l-panel-border) bg-(--l-panel) p-3.5"
          >
            <div className="font-mono text-[13px] font-medium text-(--l-panel-fg)">
              {entry.state}
            </div>
            <div className="mt-1 text-[12px] leading-relaxed text-(--l-panel-fg-2)">
              {entry.description}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between border-t border-(--l-panel-border) pt-3 font-mono text-[10px]">
        <div className="flex gap-6">
          <div>
            <div className="text-(--l-panel-fg-4)">branch</div>
            <div className="mt-0.5 text-(--l-panel-fg-2)">feat/oauth-team</div>
          </div>
          <div>
            <div className="text-(--l-panel-fg-4)">snapshot</div>
            <div className="mt-0.5 text-(--l-panel-fg-2)">{entry.snapshot}</div>
          </div>
          <div>
            <div className="text-(--l-panel-fg-4)">compute</div>
            <div className="mt-0.5 text-(--l-panel-fg-2)">{entry.cost}</div>
          </div>
        </div>
        <span className="text-(--l-panel-fg-4)">
          {manual ? "manual" : "auto"}
        </span>
      </div>
    </div>
  );
}
