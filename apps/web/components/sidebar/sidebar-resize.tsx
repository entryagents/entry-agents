"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useSidebar } from "@/components/ui/sidebar";

const WIDTH_KEY = "entry.sidebar.w";
export const SIDE_DEFAULT_W = 264;
export const SIDE_MIN_W = 216;
export const SIDE_MAX_W = 460;
/** What the stage keeps beside the sidebar, whatever was chosen in a wider window. */
const STAGE_KEEPS = 620;

export const clampSideWidth = (w: number, max = SIDE_MAX_W) =>
  Math.round(Math.max(SIDE_MIN_W, Math.min(Math.max(SIDE_MIN_W, max), w)));

function readWidth(): number | null {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    const v = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(v) && v > 0 ? clampSideWidth(v) : null;
  } catch {
    return null;
  }
}

function saveWidth(w: number | null) {
  try {
    if (w === null) localStorage.removeItem(WIDTH_KEY);
    else localStorage.setItem(WIDTH_KEY, String(w));
  } catch {
    // private mode
  }
}

function getWrapper(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]');
}

/** The chosen width goes on the wrapper once; it yields in a narrow window. */
function applyWidth(w: number | null) {
  const wrapper = getWrapper();
  if (!wrapper) return;
  if (w === null) {
    wrapper.style.removeProperty("--sidebar-width");
    return;
  }
  wrapper.style.setProperty(
    "--sidebar-width",
    `min(${w}px, max(${SIDE_MIN_W}px, calc(100vw - ${STAGE_KEEPS}px)))`,
  );
}

/**
 * Drag the sidebar's right edge to resize it (216 to 460 px), double-click or
 * Enter for the default, arrows to step, Home and End for the ends.
 */
export function SidebarResize() {
  const { state, isMobile } = useSidebar();
  const [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState<number>(
    () => readWidth() ?? SIDE_DEFAULT_W,
  );

  useLayoutEffect(() => {
    const saved = readWidth();
    if (saved !== null) applyWidth(saved);
  }, []);

  // A drag that ends outside the window, or an unmount mid-drag, must not leave the cursor behind.
  useEffect(
    () => () => {
      delete document.documentElement.dataset.sideResizing;
    },
    [],
  );

  const commit = useCallback((w: number | null) => {
    applyWidth(w);
    saveWidth(w);
    setWidth(w ?? SIDE_DEFAULT_W);
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const el = e.currentTarget;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // a pointer that is already gone: the drag still ends on its own events
      }
      const startX = e.clientX;
      const startW = width;
      const max = Math.min(SIDE_MAX_W, window.innerWidth - STAGE_KEEPS);
      let w = startW;
      let moved = false;
      setDragging(true);
      document.documentElement.dataset.sideResizing = "";

      const move = (ev: globalThis.PointerEvent) => {
        const next = clampSideWidth(startW + (ev.clientX - startX), max);
        if (next === w && moved) return;
        moved = true;
        w = next;
        applyWidth(w);
        setWidth(w);
      };
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (moved) saveWidth(clampSideWidth(w));
        delete document.documentElement.dataset.sideResizing;
        setDragging(false);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    },
    [width],
  );

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 48 : 16;
    let next: number | null;
    if (e.key === "ArrowLeft") next = clampSideWidth(width - step);
    else if (e.key === "ArrowRight") next = clampSideWidth(width + step);
    else if (e.key === "Home") next = SIDE_MIN_W;
    else if (e.key === "End") next = SIDE_MAX_W;
    else if (e.key === "Enter") next = null;
    else return;
    e.preventDefault();
    commit(next);
  };

  if (isMobile || state === "collapsed") return null;

  return (
    <div
      className="side-resize"
      data-dragging={dragging || undefined}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDE_MIN_W}
      aria-valuemax={SIDE_MAX_W}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => commit(null)}
      onKeyDown={onKeyDown}
    />
  );
}
