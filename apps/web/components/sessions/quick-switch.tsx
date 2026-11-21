"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SessionWithUnread } from "@/hooks/use-sessions";
import {
  cycleQuickIndex,
  firstQuickIndex,
  recentOrder,
  recordVisit,
} from "@/lib/sessions/quick-switch";
import { cn } from "@/lib/utils";

const SHOW_AFTER_MS = 140;

let sessionVisits: string[] = [];

function formatShortAge(dateInput: Date | string): string {
  const ts =
    dateInput instanceof Date ? dateInput.getTime() : Date.parse(dateInput);
  if (!Number.isFinite(ts)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/**
 * Global Ctrl+Tab / Ctrl+Shift+Tab MRU session switcher (1:1 Sable `QuickSwitch.tsx`).
 * A quick tap switches immediately to the previous session on Control release;
 * holding Control for 140ms reveals the compact glass MRU list.
 */
export function QuickSwitch({
  sessions,
  activeSessionId,
  onSelectSession,
}: {
  sessions: readonly SessionWithUnread[];
  activeSessionId: string;
  onSelectSession: (session: SessionWithUnread) => void;
}) {
  const [list, setList] = useState<SessionWithUnread[] | null>(null);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const activeIdRef = useRef(activeSessionId);
  activeIdRef.current = activeSessionId;
  const onSelectRef = useRef(onSelectSession);
  onSelectRef.current = onSelectSession;

  const liveRef = useRef<{ list: SessionWithUnread[]; index: number } | null>(
    null,
  );

  useEffect(() => {
    if (activeSessionId) {
      sessionVisits = recordVisit(sessionVisits, activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    let timer = 0;

    const end = (commit: boolean) => {
      const cur = liveRef.current;
      liveRef.current = null;
      window.clearTimeout(timer);
      setList(null);
      setShown(false);
      const target = cur?.list[cur.index];
      if (commit && target && target.id !== activeIdRef.current) {
        onSelectRef.current(target);
      }
    };

    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Tab" && e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const dir: 1 | -1 = e.shiftKey ? -1 : 1;
        const cur = liveRef.current;
        if (cur) {
          cur.index = cycleQuickIndex(cur.index, cur.list.length, dir);
          setIndex(cur.index);
          return;
        }
        if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
          return;
        }
        const candidates = sessionsRef.current.map((s) => ({
          ...s,
          updatedAt:
            s.lastActivityAt instanceof Date
              ? s.lastActivityAt.getTime()
              : Date.parse(String(s.lastActivityAt ?? s.createdAt)) || 0,
        }));
        const next = recentOrder(candidates, sessionVisits, 9);
        const at = firstQuickIndex(
          next.map((s) => s.id),
          activeIdRef.current || null,
          dir,
        );
        if (at < 0) return;
        liveRef.current = { list: next, index: at };
        setList(next);
        setIndex(at);
        timer = window.setTimeout(() => setShown(true), SHOW_AFTER_MS);
      } else if (liveRef.current && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        end(false);
      }
    };

    const onUp = (e: KeyboardEvent) => {
      if (liveRef.current && e.key === "Control") {
        end(true);
      }
    };

    const onBlur = () => {
      if (liveRef.current) end(false);
    };

    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  if (!list || !shown || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="listbox"
      aria-label="Recent sessions"
      className="animate-in fade-in-0 zoom-in-95 duration-100 fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/80 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl"
    >
      {list.map((s, i) => {
        const isSelected = i === index;
        const where = s.repoName
          ? s.branch
            ? `${s.repoName} · ${s.branch}`
            : s.repoName
          : "";
        return (
          <div
            key={s.id}
            role="option"
            aria-selected={isSelected}
            onPointerDown={(e) => {
              e.preventDefault();
              if (liveRef.current) liveRef.current.index = i;
              setIndex(i);
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition-colors",
              isSelected
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                s.hasStreaming
                  ? "animate-pulse bg-emerald-500"
                  : s.hasUnread
                    ? "bg-amber-500"
                    : "bg-muted-foreground/30",
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {s.title || "New session"}
            </span>
            {where && (
              <span className="hidden max-w-[140px] shrink-0 truncate font-mono text-[11px] text-muted-foreground/75 sm:inline">
                {where}
              </span>
            )}
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/65">
              {formatShortAge(s.lastActivityAt ?? s.createdAt)}
            </span>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
