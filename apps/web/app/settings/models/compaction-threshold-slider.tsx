"use client";

import { useEffect, useRef, useState } from "react";

const MIN_PCT = 5;
const MAX_PCT = 98;
const DEFAULT_PCT = 95;

export function CompactionThresholdSlider() {
  const [percent, setPercent] = useState<number>(DEFAULT_PCT);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/settings/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { compactionThreshold?: number } | null) => {
        if (!active || !data) return;
        const val = data.compactionThreshold;
        if (typeof val === "number" && val >= MIN_PCT && val <= MAX_PCT) {
          setPercent(val);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const persist = async (next: number) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compactionThreshold: next }),
      });
      if (res.ok) {
        setSavedNotice(true);
        window.setTimeout(() => setSavedNotice(false), 1500);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (next: number, immediate = false) => {
    const clamped = Math.min(MAX_PCT, Math.max(MIN_PCT, Math.round(next)));
    setPercent(clamped);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (immediate) {
      void persist(clamped);
    } else {
      saveTimerRef.current = setTimeout(() => {
        void persist(clamped);
      }, 250);
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
        <div className="flex shrink-0 items-center gap-2">
          {savedNotice && (
            <span className="text-[11px] text-muted-foreground">Saved</span>
          )}
          <span className="font-mono text-sm font-medium text-foreground tabular-nums">
            {percent}%
          </span>
        </div>
      </div>

      <div className="space-y-1.5 pt-1">
        <input
          type="range"
          min={MIN_PCT}
          max={MAX_PCT}
          step={1}
          value={percent}
          disabled={saving}
          aria-label="Context compaction threshold percentage"
          onChange={(e) => handleChange(Number.parseInt(e.target.value, 10))}
          onPointerUp={() => handleChange(percent, true)}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>{MIN_PCT}%</span>
          <button
            type="button"
            onClick={() => handleChange(DEFAULT_PCT, true)}
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
