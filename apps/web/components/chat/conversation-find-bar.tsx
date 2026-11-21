"use client";

import "./find.css";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WebAgentUIMessage } from "@/app/types";
import {
  type FindCursor,
  type FindMarks,
  type FindSource,
  findHits,
  ordinal,
  startFindCursor,
  stepFindCursor,
  totalOf,
} from "./conversation-find";

const HIGHLIGHT_ALL = "entry-find";
const HIGHLIGHT_AT = "entry-find-at";
const MAX_MARKS = 600;

type HighlightRegistry = {
  set(name: string, h: unknown): void;
  delete(name: string): void;
};

function getHighlightRegistry(): HighlightRegistry | undefined {
  if (typeof CSS === "undefined") return undefined;
  return (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
}

function makeHighlight(ranges: Range[]): unknown {
  const Ctor = (
    window as unknown as { Highlight?: new (...r: Range[]) => unknown }
  ).Highlight;
  if (!Ctor) return null;
  return new Ctor(...ranges);
}

function clearHighlights(): void {
  const reg = getHighlightRegistry();
  reg?.delete(HIGHLIGHT_ALL);
  reg?.delete(HIGHLIGHT_AT);
}

function rangesIn(el: HTMLElement, query: string): Range[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const out: Range[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue ?? "").toLowerCase();
    for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + q.length);
      out.push(range);
    }
  }
  return out;
}

function extractFindSources(
  messages: readonly WebAgentUIMessage[],
): FindSource[] {
  const out: FindSource[] = [];
  for (const m of messages) {
    const text = m.parts
      .filter(
        (p): p is { type: "text"; text: string } =>
          p.type === "text" && typeof p.text === "string",
      )
      .map((p) => p.text)
      .join("\n");
    if (text.trim()) {
      out.push({ id: m.id, text });
    }
  }
  return out;
}

function inOtherSurface(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(
    el?.closest?.(
      '[role="dialog"], [role="menu"], [role="listbox"], .monaco-editor',
    ),
  );
}

/**
 * In-conversation Find bar (`Cmd/Ctrl+F`), ported 1:1 from Sable's `FindBar.tsx`.
 * Highlights all matches via the CSS Custom Highlight API (`::highlight(entry-find)`),
 * centers the active match in the chat scroller, and feeds match ticks to ChatNavigator.
 */
export function ConversationFindBar({
  chatId,
  messages,
  scrollerRef,
  onFindMarksChange,
}: {
  chatId: string;
  messages: readonly WebAgentUIMessage[];
  scrollerRef: RefObject<HTMLDivElement | null>;
  onFindMarksChange?: (marks: FindMarks | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<FindCursor | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const currentItemRef = useRef<string | undefined>(undefined);

  const sources = useMemo(
    () => (open ? extractFindSources(messages) : []),
    [messages, open],
  );
  const q = query.trim();
  const hits = useMemo(
    () => (open && q ? findHits(sources, q) : []),
    [open, q, sources],
  );
  const hitsRef = useRef(hits);
  hitsRef.current = hits;

  useEffect(() => {
    setCursor(startFindCursor(hitsRef.current, currentItemRef.current));
  }, [chatId, q]);

  const currentHit = cursor && hits[cursor.hit] ? hits[cursor.hit] : undefined;
  currentItemRef.current = currentHit?.itemId ?? currentItemRef.current;

  const hitIds = useMemo(() => hits.map((h) => h.itemId), [hits]);
  useEffect(() => {
    onFindMarksChange?.(
      open && q ? { ids: hitIds, current: currentHit?.itemId } : null,
    );
  }, [currentHit?.itemId, hitIds, onFindMarksChange, open, q]);

  useEffect(
    () => () => {
      clearHighlights();
      onFindMarksChange?.(null);
    },
    [onFindMarksChange],
  );

  // Paint highlights via CSS Custom Highlight API and scroll active match into view.
  useEffect(() => {
    if (!open || !q || !currentHit || !cursor) {
      clearHighlights();
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const findRow = (id: string) =>
      scroller.querySelector<HTMLElement>(
        `[data-find-msg-id="${CSS.escape(id)}"]`,
      );

    const row = findRow(currentHit.itemId);
    if (!row) {
      clearHighlights();
      return;
    }

    const ownRanges = rangesIn(row, q);
    const targetRange =
      ownRanges.length > 0
        ? ownRanges[Math.min(cursor.nth, ownRanges.length - 1)]
        : null;

    const reg = getHighlightRegistry();
    if (reg && targetRange) {
      const all: Range[] = [];
      for (const h of hitsRef.current) {
        if (all.length >= MAX_MARKS) break;
        const el = h.itemId === currentHit.itemId ? row : findRow(h.itemId);
        if (el) {
          all.push(...(el === row ? ownRanges : rangesIn(el, q)));
        }
      }
      const allHl = makeHighlight(all.slice(0, MAX_MARKS));
      const atHl = makeHighlight([targetRange]);
      if (allHl) reg.set(HIGHLIGHT_ALL, allHl);
      if (atHl) reg.set(HIGHLIGHT_AT, atHl);
    }

    const rect = targetRange
      ? targetRange.getBoundingClientRect()
      : row.getBoundingClientRect();
    const scRect = scroller.getBoundingClientRect();
    const targetTop =
      rect.top -
      scRect.top +
      scroller.scrollTop -
      Math.max(48, scroller.clientHeight * 0.38);
    const clampedTop = Math.max(
      0,
      Math.min(scroller.scrollHeight - scroller.clientHeight, targetTop),
    );
    scroller.scrollTo({ top: clampedTop, behavior: "smooth" });
  }, [cursor, currentHit, open, q, scrollerRef]);

  const close = useCallback(() => {
    setOpen(false);
    clearHighlights();
    onFindMarksChange?.(null);
    const back = prevFocusRef.current;
    prevFocusRef.current = null;
    if (back && document.contains(back)) {
      back.focus({ preventScroll: true });
    }
  }, [onFindMarksChange]);

  const move = useCallback((dir: 1 | -1) => {
    setCursor((prev) => stepFindCursor(hitsRef.current, prev, dir));
  }, []);

  // Intercept Cmd/Ctrl+F globally for the active chat pane.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        if (inOtherSurface(e.target)) return;
        e.preventDefault();
        if (!open) {
          prevFocusRef.current = document.activeElement as HTMLElement | null;
          setOpen(true);
        }
        window.requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      } else if (open && e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  if (!open) return null;

  const total = totalOf(hits);
  const ord = ordinal(hits, cursor);

  return (
    <div
      role="search"
      aria-label="Find in conversation"
      className="animate-in fade-in-0 slide-in-from-top-1 duration-150 absolute top-2 right-2 left-2 z-30 flex items-center gap-1.5 rounded-xl border border-border/80 bg-popover/95 px-2.5 py-1.5 shadow-lg backdrop-blur-md sm:left-auto sm:right-4 sm:w-[316px]"
    >
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            move(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
        placeholder="Find in chat…"
        aria-label="Find in chat"
        className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
      />
      {q && (
        <span className="shrink-0 px-1 text-[11px] tabular-nums text-muted-foreground">
          {total > 0 ? `${ord}/${total}` : "0/0"}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-0.5 border-l border-border/60 pl-1">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={total === 0}
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={total === 0}
          aria-label="Next match"
          title="Next match (Enter)"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Close find bar"
          title="Close (Esc)"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
