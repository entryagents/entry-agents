"use client";

import "./navigator.css";
import {
  memo,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WebAgentUIMessage } from "@/app/types";
import {
  extractUserNavMarks,
  type NavMark,
  nearest,
  stepTarget,
  type Tick,
  ticksOf,
} from "./nav-model";

const LAND = 18;
const FAR = 1.5;
const GLIDE = 220;
const SHOW = 2;
const HIDE = 1.8;
const HIT = 8;
const READ = 0.42;
const IN_FLIGHT = 650;
const BAND_QUIET = 140;
const BAND_MS = 500;
const SETTLE_MS = 150;

interface Geo {
  ys: Float64Array;
  sH: number;
  cH: number;
  track: number;
}

const NO_GEO: Geo = { ys: new Float64Array(0), sH: 0, cH: 0, track: 0 };

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function landingOffset(sc: HTMLElement, el: HTMLElement): number {
  const y =
    el.getBoundingClientRect().top -
    sc.getBoundingClientRect().top +
    sc.scrollTop;
  return Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, y - LAND));
}

interface ChatNavigatorProps {
  messages: WebAgentUIMessage[];
  scrollerRef: RefObject<HTMLDivElement | null>;
  isAtBottom?: boolean;
}

/**
 * Conversation minimap along the right edge of the chat scroller, ported 1:1
 * from Sable's `Navigator.tsx`. Shows one tick per user message, a quiet viewport
 * band, hover preview, click/drag scrubbing, and Alt+Up / Alt+Down stepping.
 */
export const ChatNavigator = memo(function ChatNavigator({
  messages,
  scrollerRef,
  isAtBottom = false,
}: ChatNavigatorProps) {
  const marks = useMemo(() => extractUserNavMarks(messages), [messages]);
  const marksRef = useRef<NavMark[]>(marks);
  marksRef.current = marks;

  const trackRef = useRef<HTMLDivElement>(null);
  const travelRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);

  const [geo, setGeo] = useState<Geo>(NO_GEO);
  const geoRef = useRef<Geo>(NO_GEO);
  geoRef.current = geo;

  const [shown, setShown] = useState(false);
  const shownRef = useRef(false);
  shownRef.current = shown;

  const [held, setHeld] = useState(false);
  const [lit, setLit] = useState<number>(-1);
  const flightRef = useRef<{ target: number; until: number } | null>(null);

  const measure = useCallback(() => {
    const sc = scrollerRef.current;
    const tr = trackRef.current;
    if (!sc || !tr) return;

    const sH = sc.scrollHeight;
    const cH = sc.clientHeight;
    const track = tr.clientHeight;
    if (cH <= 0 || track <= 0) return;

    const ratio = sH / cH;
    const nextShown = shownRef.current ? ratio >= HIDE : ratio >= SHOW;
    if (nextShown !== shownRef.current) {
      setShown(nextShown);
    }

    const currentMarks = marksRef.current;
    const ys = new Float64Array(currentMarks.length);
    const scRect = sc.getBoundingClientRect();

    for (let i = 0; i < currentMarks.length; i++) {
      const m = currentMarks[i];
      if (!m) continue;
      const el = sc.querySelector<HTMLElement>(
        `[data-nav-msg-id="${CSS.escape(m.id)}"]`,
      );
      if (el) {
        const y = el.getBoundingClientRect().top - scRect.top + sc.scrollTop;
        ys[i] = Math.max(0, y);
      } else {
        ys[i] = i > 0 ? (ys[i - 1] ?? 0) : 0;
      }
    }

    setGeo((prev) => {
      const sameLen = prev.ys.length === ys.length;
      const samePos =
        sameLen && prev.ys.every((v, i) => Math.abs(v - (ys[i] ?? 0)) < 1);
      if (
        samePos &&
        Math.abs(prev.sH - sH) < 2 &&
        Math.abs(prev.cH - cH) < 1 &&
        Math.abs(prev.track - track) < 1
      ) {
        return prev;
      }
      return { ys, sH, cH, track };
    });
  }, [scrollerRef]);

  // Measure on mount, message changes, resize, and DOM mutations.
  useEffect(() => {
    measure();
  }, [marks, measure]);

  useEffect(() => {
    const sc = scrollerRef.current;
    const tr = trackRef.current;
    if (!sc || !tr) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        measure();
      }, SETTLE_MS);
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(sc);
    ro.observe(tr);
    if (sc.firstElementChild) {
      ro.observe(sc.firstElementChild);
    }

    const mo = new MutationObserver(schedule);
    mo.observe(sc, { childList: true, subtree: true });

    return () => {
      if (timer) clearTimeout(timer);
      ro.disconnect();
      mo.disconnect();
    };
  }, [scrollerRef, measure]);

  // Update the viewport band position on scroll (quiet + periodic throttle).
  const syncBand = useCallback(() => {
    const sc = scrollerRef.current;
    const travel = travelRef.current;
    const band = bandRef.current;
    const { sH, cH, track } = geoRef.current;
    if (!sc || !travel || !band || sH <= 0 || track <= 0) return;

    const k = track / sH;
    const bandH = Math.max(14, Math.min(track, cH * k));
    const maxScroll = Math.max(1, sH - cH);
    const travelH = Math.max(0, track - bandH);
    const frac = Math.max(0, Math.min(1, sc.scrollTop / maxScroll));

    travel.style.height = `${travelH}px`;
    band.style.height = `${bandH}px`;
    band.style.transform = `translateY(${frac * travelH}px)`;
  }, [scrollerRef]);

  useEffect(() => {
    syncBand();
  }, [geo, syncBand]);

  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;

    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTick = 0;

    const onScroll = () => {
      const now = Date.now();
      if (now - lastTick >= BAND_MS) {
        lastTick = now;
        syncBand();
      }
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        quietTimer = null;
        lastTick = Date.now();
        syncBand();
      }, BAND_QUIET);
    };

    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (quietTimer) clearTimeout(quietTimer);
      sc.removeEventListener("scroll", onScroll);
    };
  }, [scrollerRef, syncBand]);

  const jumpToMark = useCallback(
    (index: number) => {
      const sc = scrollerRef.current;
      const currentMarks = marksRef.current;
      if (!sc) return;

      let targetTop: number;
      if (index >= currentMarks.length) {
        targetTop = Math.max(0, sc.scrollHeight - sc.clientHeight);
      } else {
        const m = currentMarks[index];
        if (!m) return;
        const el = sc.querySelector<HTMLElement>(
          `[data-nav-msg-id="${CSS.escape(m.id)}"]`,
        );
        targetTop = el
          ? landingOffset(sc, el)
          : Math.max(0, (geoRef.current.ys[index] ?? 0) - LAND);
      }

      flightRef.current = { target: targetTop, until: Date.now() + IN_FLIGHT };
      const dist = Math.abs(targetTop - sc.scrollTop);
      if (prefersReducedMotion()) {
        sc.scrollTop = targetTop;
        syncBand();
        return;
      }

      if (dist > sc.clientHeight * FAR) {
        const dir = targetTop > sc.scrollTop ? -1 : 1;
        sc.scrollTop = Math.max(0, targetTop + dir * GLIDE);
      }
      sc.scrollTo({ top: targetTop, behavior: "smooth" });
    },
    [scrollerRef, syncBand],
  );

  // Alt+Up / Alt+Down stepping between user messages.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const sc = scrollerRef.current;
      if (!sc || marksRef.current.length === 0) return;

      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      const flight = flightRef.current;
      const baseTop =
        flight && Date.now() < flight.until ? flight.target : sc.scrollTop;
      const line = baseTop + sc.clientHeight * READ;
      const next = stepTarget(geoRef.current.ys, line, baseTop, dir);
      if (next >= 0) {
        jumpToMark(next);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [scrollerRef, jumpToMark]);

  const indexAtPointer = useCallback((clientY: number): number => {
    const tr = trackRef.current;
    const { ys, sH, track } = geoRef.current;
    if (!tr || sH <= 0 || track <= 0 || ys.length === 0) return -1;
    const rect = tr.getBoundingClientRect();
    const yOnTrack = Math.max(0, Math.min(track, clientY - rect.top));
    const k = track / sH;
    return nearest(ys, yOnTrack / k, HIT / k);
  }, []);

  const scrubToPointer = useCallback(
    (clientY: number) => {
      const sc = scrollerRef.current;
      const tr = trackRef.current;
      if (!sc || !tr) return;
      const rect = tr.getBoundingClientRect();
      const frac = Math.max(
        0,
        Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)),
      );
      sc.scrollTop = frac * Math.max(0, sc.scrollHeight - sc.clientHeight);
      syncBand();
    },
    [scrollerRef, syncBand],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setHeld(true);
    const idx = indexAtPointer(e.clientY);
    if (idx >= 0) {
      setLit(idx);
      jumpToMark(idx);
    } else {
      scrubToPointer(e.clientY);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (held) {
      scrubToPointer(e.clientY);
    }
    const idx = indexAtPointer(e.clientY);
    setLit(idx);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setHeld(false);
  };

  const onPointerLeave = () => {
    if (!held) setLit(-1);
  };

  const k = geo.sH > 0 && geo.track > 0 ? geo.track / geo.sH : 0;
  const ticks = useMemo<Tick[]>(() => {
    if (k <= 0 || geo.ys.length === 0) return [];
    return ticksOf(
      geo.ys,
      (i) => {
        const m = marks[i];
        if (!m) return "msg";
        if (m.waiting) return "wait";
        if (m.files > 0) return "files";
        return "msg";
      },
      k,
    );
  }, [geo.ys, k, marks]);

  const litMark = lit >= 0 ? marks[lit] : undefined;
  const litY = lit >= 0 && k > 0 ? (geo.ys[lit] ?? 0) * k : 0;

  return (
    <>
      <div
        ref={trackRef}
        className="sable-nav"
        data-show={shown ? "" : undefined}
        data-held={held ? "" : undefined}
        data-end={isAtBottom ? "" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        aria-label="Conversation minimap"
      >
        <div ref={travelRef} className="sable-nav-travel">
          <div ref={bandRef} className="sable-nav-band" />
        </div>

        <div className="sable-nav-ticks">
          {ticks
            .filter((t) => t.kind !== "wait")
            .map((t, i) => (
              <span
                key={`t-${i}`}
                className="sable-nav-tick"
                data-files={t.kind === "files" ? "" : undefined}
                style={{ transform: `translateY(${t.y}px)` }}
              />
            ))}
        </div>

        <div className="sable-nav-waits">
          {ticks
            .filter((t) => t.kind === "wait")
            .map((t, i) => (
              <span
                key={`w-${i}`}
                className="sable-nav-tick"
                style={{ transform: `translateY(${t.y}px)` }}
              />
            ))}
        </div>

        {litMark && (
          <span
            className="sable-nav-lit"
            style={{ transform: `translateY(${litY}px)` }}
          />
        )}
      </div>

      {shown && litMark && (
        <div
          className="sable-nav-peek"
          style={{ transform: `translateY(${litY}px)` }}
        >
          <div className="sable-nav-peek-text">{litMark.preview}</div>
          <div className="sable-nav-peek-meta">
            <span>Turn {litMark.turn}</span>
            {litMark.files > 0 && (
              <span>
                {" · "}
                {litMark.files} {litMark.files === 1 ? "file" : "files"} changed
              </span>
            )}
            {litMark.waiting && (
              <span className="sable-nav-peek-wait"> · Waiting on you</span>
            )}
          </div>
        </div>
      )}
    </>
  );
});
