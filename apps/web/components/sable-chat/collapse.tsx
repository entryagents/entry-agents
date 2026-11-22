"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "./collapse.css";

/**
 * Ported verbatim from Sable `src/components/Collapse.tsx`.
 * Reveals its children with an animated height. Children are mounted only while open
 * (or closing), so collapsed details cost nothing. The first render never animates:
 * a transcript loaded from history appears in its final shape. Once fully open it stops
 * clipping (`data-settled`), so rings, shadows and labels can reach past its edges.
 */
export function SableCollapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  const [settled, setSettled] = useState(open);
  const first = useRef(true);
  const el = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSettled(false);
    if (open) {
      setMounted(true);
      // The closed shape has to exist before the open one replaces it, or nothing would move.
      void el.current?.offsetHeight;
      setShown(true);
      const t = window.setTimeout(() => setSettled(true), 450);
      return () => window.clearTimeout(t);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), 700);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!mounted && !open) return null;
  return (
    <div
      ref={el}
      className={`sable-collapse ${className ?? ""}`}
      data-open={shown && open ? "" : undefined}
      data-settled={settled && open ? "" : undefined}
      onTransitionEnd={(e) => {
        if (
          e.target !== e.currentTarget ||
          e.propertyName !== "grid-template-rows"
        ) {
          return;
        }
        if (open) setSettled(true);
        else setMounted(false);
      }}
    >
      <div className="sable-collapse-inner">
        {mounted || open ? children : null}
      </div>
    </div>
  );
}
