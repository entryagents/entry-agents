"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "entry:compaction-threshold-pct";
const MIN_PCT = 5;
const MAX_PCT = 98;
const DEFAULT_PCT = 95;

export function CompactionThresholdSlider() {
  const [percent, setPercent] = useState<number>(DEFAULT_PCT);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = Number.parseInt(saved, 10);
        if (Number.isFinite(parsed) && parsed >= MIN_PCT && parsed <= MAX_PCT) {
          setPercent(parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleChange = (next: number) => {
    const clamped = Math.min(MAX_PCT, Math.max(MIN_PCT, next));
    setPercent(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // ignore storage errors
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-foreground">
            Context compaction threshold
          </h2>
          <p className="text-xs text-muted-foreground">
            Automatically compact conversation history when context usage
            reaches this percentage of the model&apos;s window. Default is 95%.
          </p>
        </div>
        <span className="shrink-0 font-mono text-sm font-medium text-foreground tabular-nums">
          {percent}%
        </span>
      </div>

      <div className="space-y-1.5 pt-1">
        <input
          type="range"
          min={MIN_PCT}
          max={MAX_PCT}
          step={1}
          value={percent}
          aria-label="Context compaction threshold percentage"
          onChange={(e) => handleChange(Number.parseInt(e.target.value, 10))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>{MIN_PCT}%</span>
          <button
            type="button"
            onClick={() => handleChange(DEFAULT_PCT)}
            className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
          >
            Reset to {DEFAULT_PCT}%
          </button>
          <span>{MAX_PCT}%</span>
        </div>
      </div>
    </section>
  );
}
