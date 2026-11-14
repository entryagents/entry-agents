"use client";

import { useEffect, useState } from "react";

const STAGES = [
  {
    state: "provisioning",
    description: "Cloning repository into an isolated container.",
    snapshot: "—",
    cost: "$0.02/m",
  },
  {
    state: "active",
    description: "Filesystem, terminal, and git ready for the agent.",
    snapshot: "—",
    cost: "$0.02/m",
  },
  {
    state: "hibernating",
    description: "Capturing copy-on-write snapshot after idle timeout.",
    snapshot: "syncing...",
    cost: "$0.01/m",
  },
  {
    state: "hibernated",
    description: "Zero compute billed · full disk state preserved.",
    snapshot: "snap_a1b2c3",
    cost: "$0.00",
  },
  {
    state: "restoring",
    description: "Waking from snapshot on next prompt.",
    snapshot: "snap_a1b2c3",
    cost: "$0.02/m",
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
    <div className="flex h-[290px] flex-col justify-between bg-(--l-code-bg) px-5 py-4 font-mono text-xs">
      <div>
        <div className="flex items-center justify-between text-[11px] text-(--l-panel-fg-3)">
          <span>sandbox</span>
          <span className="tabular-nums text-(--l-panel-fg-4)">
            {idx + 1} / {STAGES.length}
          </span>
        </div>

        <div className="mt-4 flex gap-1">
          {STAGES.map((stage, i) => (
            <button
              key={stage.state}
              type="button"
              aria-label={`Select ${stage.state} stage`}
              onClick={() => {
                setManual(true);
                setIdx(i);
              }}
              className="flex-1 py-1 cursor-pointer"
            >
              <div className="h-0.5 overflow-hidden bg-(--l-panel-fg-5)">
                <div
                  className="h-full transition-colors duration-300"
                  style={{
                    backgroundColor:
                      i <= idx ? "var(--l-panel-fg)" : "transparent",
                  }}
                />
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6">
          <div className="text-base font-semibold text-(--l-panel-fg)">
            {entry.state}
          </div>
          <div className="mt-1 font-sans text-xs leading-relaxed text-(--l-panel-fg-2)">
            {entry.description}
          </div>
        </div>
      </div>

      <div className="flex gap-8 border-t border-(--l-panel-border) pt-3 text-[11px] tabular-nums">
        <div>
          <div className="text-(--l-panel-fg-3)">branch</div>
          <div className="mt-0.5 text-(--l-panel-fg-2)">feat/github-oauth</div>
        </div>
        <div>
          <div className="text-(--l-panel-fg-3)">snapshot</div>
          <div className="mt-0.5 text-(--l-panel-fg-2)">{entry.snapshot}</div>
        </div>
        <div>
          <div className="text-(--l-panel-fg-3)">compute</div>
          <div className="mt-0.5 text-(--l-panel-fg-2)">{entry.cost}</div>
        </div>
      </div>
    </div>
  );
}
