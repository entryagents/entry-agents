"use client";

import "./until.css";
import { AnimatePresence, motion } from "motion/react";
import { memo, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { UntilEndNotice, UntilState } from "@/lib/until/types";

const rise = {
  initial: { opacity: 0, y: 10, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: {
    opacity: 0,
    y: 4,
    transition: { duration: 0.14, ease: [0.5, 0, 0.9, 0.4] as const },
  },
  transition: { type: "spring" as const, stiffness: 460, damping: 36 },
};

type ArcState = "ahead" | "failed" | "now" | "pass";

function Rounds({
  rounds,
  round,
  green,
}: {
  rounds: number;
  round: number;
  green: boolean;
}) {
  const c = 9;
  const r = 7;
  const state = (i: number): ArcState =>
    green
      ? "pass"
      : i < round - 1
        ? "failed"
        : i === round - 1
          ? "now"
          : "ahead";

  const arcs =
    rounds <= 1
      ? [<circle key={0} cx={c} cy={c} r={r} data-s={state(0)} />]
      : Array.from({ length: rounds }, (_, i) => {
          const gap = Math.min(30, 150 / rounds);
          const a0 = ((-90 + (i * 360) / rounds + gap / 2) * Math.PI) / 180;
          const a1 =
            ((-90 + ((i + 1) * 360) / rounds - gap / 2) * Math.PI) / 180;
          const p = (a: number) =>
            `${(c + r * Math.cos(a)).toFixed(3)} ${(c + r * Math.sin(a)).toFixed(3)}`;
          return (
            <path
              key={i}
              d={`M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`}
              data-s={state(i)}
              style={green ? { transitionDelay: `${i * 45}ms` } : undefined}
            />
          );
        });

  return (
    <motion.svg
      className="us-ring"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      animate={{ rotate: green ? 30 : 0 }}
      transition={{
        type: "spring",
        stiffness: 420,
        damping: 34,
        delay: green ? 0.12 : 0,
      }}
    >
      {arcs}
    </motion.svg>
  );
}

function CheckClock({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  const ms = now - since;
  if (ms < 2000) return null;
  const s = Math.floor(ms / 1000);
  return <> · {s}s</>;
}

interface UntilStripProps {
  until: UntilState | null;
  ended: UntilEndNotice | null;
  onCheckNow: () => void;
  onStop: () => void;
}

/**
 * Until green strip above the composer, ported 1:1 from Sable's `UntilStrip.tsx`.
 */
export const UntilStrip = memo(function UntilStrip({
  until,
  ended,
  onCheckNow,
  onStop,
}: UntilStripProps) {
  const green = ended?.end === "passed";
  const shown = until ?? ended?.state ?? null;

  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div key="until" className="us-slot" {...rise}>
          <section
            className="us"
            data-phase={ended ? "ended" : shown.phase}
            data-green={green || undefined}
            aria-live="polite"
          >
            <div className="us-mark">
              <Rounds
                rounds={shown.rounds}
                round={ended?.end === "passed" ? shown.rounds : shown.round}
                green={green}
              />
            </div>

            {ended ? (
              <span key="end" className="us-label us-end truncate">
                {ended.text}
              </span>
            ) : shown.phase === "checking" ? (
              <span key="checking" className="us-label truncate">
                <span>Checking</span>{" "}
                <span className="us-cmd">{shown.check}</span>
              </span>
            ) : (
              <span key="until" className="us-label truncate">
                Until <span className="us-cmd">{shown.check}</span> passes
              </span>
            )}

            {!ended && (
              <span className="us-meta">
                Round {shown.round} of {shown.rounds}
                {shown.failing ? ` · ${shown.failing} failing` : ""}
                {shown.phase === "checking" && shown.since ? (
                  <CheckClock since={shown.since} />
                ) : null}
                {shown.phase === "paused" ? " · paused" : ""}
              </span>
            )}

            {!ended && (
              <span className="us-actions">
                {shown.phase === "paused" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={onCheckNow}
                  >
                    Check now
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={onStop}
                  aria-label={`Stop until ${shown.check} passes`}
                >
                  Stop
                </Button>
              </span>
            )}
          </section>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
