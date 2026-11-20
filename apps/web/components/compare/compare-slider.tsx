"use client";

import "./compare.css";
import { MoveHorizontal } from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
} from "react";

const SWEEP = {
  type: "spring",
  stiffness: 380,
  damping: 40,
  mass: 1.8,
} as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * 12px 4x4 ordered Bayer dither seam mask, ported 1:1 from Sable's CompareView.tsx.
 */
const SEAM = (() => {
  const bayer = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  let cells = "";
  for (let x = 0; x < 12; x++) {
    const keep = 1 - (x + 0.5) / 12;
    for (let y = 0; y < 4; y++) {
      const row = bayer[y];
      if (row && ((row[x % 4] ?? 0) + 0.5) / 16 < keep) {
        cells += `M${x} ${y}h1v1h-1z`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="4" shape-rendering="crispEdges"><path d="${cells}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

interface CompareSliderProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  mode?: "iframe" | "image";
}

/**
 * Before & After Visual Compare Slider, ported 1:1 from Sable's `CompareView.tsx`.
 * Sweeps from all-before to 50/50 on mount, supports pointer drag, ArrowLeft/ArrowRight,
 * and Space to flip between sides.
 */
export function CompareSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = "Before",
  afterLabel = "After",
  mode = "iframe",
}: CompareSliderProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const pos = useMotionValue(1);

  const clipX = useTransform(pos, (p) => `${(p - 1) * 100}%`);
  const innerX = useTransform(pos, (p) => `${(1 - p) * 100}%`);
  const divLeft = useTransform(pos, (p) => `${p * 100}%`);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      pos.set(0.5);
      return;
    }
    pos.set(1);
    const ctrl = animate(pos, 0.5, SWEEP);
    return () => ctrl.stop();
  }, [beforeUrl, afterUrl, pos]);

  const setFromClientX = (clientX: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    pos.set(clamp((clientX - rect.left) / rect.width, 0, 1));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setFromClientX(e.clientX);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setFromClientX(e.clientX);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.03;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      pos.set(clamp(pos.get() - step, 0, 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      pos.set(clamp(pos.get() + step, 0, 1));
    } else if (e.key === " ") {
      e.preventDefault();
      const target = pos.get() > 0.5 ? 0 : 1;
      animate(pos, target, { type: "spring", stiffness: 460, damping: 38 });
    }
  };

  return (
    <div
      ref={stageRef}
      className="cmp-stage"
      role="slider"
      tabIndex={0}
      aria-label="Before and after comparison"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos.get() * 100)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {/* After layer underneath */}
      <div className="cmp-layer">
        {mode === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={afterUrl}
            alt={afterLabel}
            className="cmp-frame object-cover"
          />
        ) : (
          /* oxlint-disable react/iframe-missing-sandbox -- cross-origin sandbox/Vercel preview requires allow-same-origin alongside allow-scripts for SPA storage */
          <iframe
            src={afterUrl}
            title={afterLabel}
            className="cmp-frame"
            sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
          />
          /* oxlint-enable react/iframe-missing-sandbox */
        )}
      </div>

      {/* Before layer clipped by dual opposite translation */}
      <motion.div
        className="cmp-clip"
        style={{
          x: clipX,
          maskImage: SEAM,
          WebkitMaskImage: SEAM,
          maskRepeat: "repeat-y",
          WebkitMaskRepeat: "repeat-y",
          maskPosition: "right top",
          WebkitMaskPosition: "right top",
        }}
      >
        <motion.div className="cmp-inner" style={{ x: innerX }}>
          {mode === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={beforeUrl}
              alt={beforeLabel}
              className="cmp-frame object-cover"
            />
          ) : (
            /* oxlint-disable react/iframe-missing-sandbox -- cross-origin sandbox/Vercel preview requires allow-same-origin alongside allow-scripts for SPA storage */
            <iframe
              src={beforeUrl}
              title={beforeLabel}
              className="cmp-frame"
              sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
            />
            /* oxlint-enable react/iframe-missing-sandbox */
          )}
        </motion.div>
      </motion.div>

      <motion.div className="cmp-divider" style={{ left: divLeft }}>
        <div className="cmp-handle" aria-hidden="true">
          <MoveHorizontal size={14} strokeWidth={1.8} />
        </div>
      </motion.div>

      <span className="cmp-tag cmp-tag-before">{beforeLabel}</span>
      <span className="cmp-tag cmp-tag-after">{afterLabel}</span>
    </div>
  );
}
