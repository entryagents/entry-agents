"use client";

import {
  Bot,
  ChevronDown,
  Folder,
  GitCompare,
  Globe,
  ListChecks,
  MoreHorizontal,
  PieChart,
  Terminal as TerminalIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RAIL_TABS, railTabShortcut, type RailTabId } from "./rail-tabs";

const TAB = 28;
const TAB_GAP = 2;
const COUNT_ROOM = 20;
const CARET = 14;

/** The selected tab's name opens and closes with the same spring as Sable's panel. */
const LABEL_SPRING = {
  type: "spring",
  stiffness: 520,
  damping: 40,
  mass: 0.7,
} as const;

const PRIMARY = RAIL_TABS.filter((t) => !t.more);

let measureCtx: CanvasRenderingContext2D | null | undefined;

function textWidth(text: string, el: HTMLElement | null): number {
  if (typeof document === "undefined") return text.length * 7.5;
  if (measureCtx === undefined) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx || !el) return text.length * 7.5;
  const cs = getComputedStyle(el);
  measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return measureCtx.measureText(text).width;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function useRowLayout(ref: React.RefObject<HTMLElement | null>): {
  fit: number;
  labels: boolean;
} {
  const [key, setKey] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const font = el.querySelector<HTMLElement>(".rail-tab");
    const longest = Math.ceil(
      Math.max(...RAIL_TABS.map((t) => textWidth(t.label, font))),
    );
    const decide = (w: number) => {
      const tabW =
        typeof window !== "undefined" && window.innerWidth < 768 ? 32 : TAB;
      const fit = clamp(
        Math.floor((w - tabW - CARET - COUNT_ROOM) / (tabW + TAB_GAP)),
        1,
        PRIMARY.length,
      );
      const labels =
        w >= fit * (tabW + TAB_GAP) + tabW + CARET + COUNT_ROOM + longest + 9;
      setKey(`${fit}|${labels ? 1 : 0}`);
    };
    decide(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => {
      if (entry) decide(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  if (!key) return { fit: PRIMARY.length, labels: false };
  return { fit: Number(key[0]), labels: key.endsWith("1") };
}

function TabIcon({ id, size = 16 }: { id: RailTabId; size?: number }) {
  const props = { width: size, height: size, strokeWidth: 1.5 };
  switch (id) {
    case "review":
      return <GitCompare {...props} />;
    case "files":
      return <Folder {...props} />;
    case "preview":
      return <Globe {...props} />;
    case "terminal":
      return <TerminalIcon {...props} />;
    case "tasks":
      return <ListChecks {...props} />;
    case "context":
      return <PieChart {...props} />;
    case "agents":
      return <Bot {...props} />;
  }
}

function TabFace({
  id,
  label,
  named,
  count,
  liveDot,
}: {
  id: RailTabId;
  label: string;
  named: boolean;
  count?: number;
  liveDot?: boolean;
}) {
  return (
    <>
      <span className="relative inline-flex shrink-0 items-center justify-center">
        <TabIcon id={id} size={16} />
        {liveDot ? (
          <span
            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500"
            aria-hidden
          />
        ) : null}
      </span>
      <AnimatePresence initial={false}>
        {named && (
          <motion.span
            key="label"
            className="rail-tab-label"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={LABEL_SPRING}
          >
            <span>{label}</span>
          </motion.span>
        )}
      </AnimatePresence>
      {count ? (
        <span className="rail-tab-count">{count > 999 ? "999+" : count}</span>
      ) : null}
    </>
  );
}

export function WorkspaceRailTabs({
  tab,
  counts,
  isPreviewLive,
  onPick,
}: {
  tab: RailTabId;
  counts: Partial<Record<RailTabId, number>>;
  isPreviewLive?: boolean;
  onPick: (t: RailTabId) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const { fit, labels } = useRowLayout(row);
  const shown = PRIMARY.slice(0, fit);
  const inRow = shown.some((t) => t.id === tab);
  const rest = RAIL_TABS.filter((t) => !shown.includes(t));
  const current = RAIL_TABS.find((t) => t.id === tab) ?? RAIL_TABS[0];

  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    let x = 0;
    let next: { x: number; w: number } | null = null;
    for (const btn of el.querySelectorAll<HTMLElement>(".rail-tab")) {
      const labelEl = btn.querySelector<HTMLElement>(".rail-tab-label");
      const on = btn.dataset.on != null;
      const base =
        btn.getBoundingClientRect().width -
        (labelEl ? labelEl.getBoundingClientRect().width : 0);
      const name =
        on && labelEl?.firstElementChild
          ? labelEl.firstElementChild.getBoundingClientRect().width
          : 0;
      if (on) next = { x, w: base + name };
      x += base + name + TAB_GAP;
    }
    setPill((was) =>
      was &&
      next &&
      Math.abs(was.x - next.x) < 0.05 &&
      Math.abs(was.w - next.w) < 0.05
        ? was
        : next,
    );
  }, [tab, labels, fit, counts, isPreviewLive]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key !== "ArrowRight" &&
      e.key !== "ArrowLeft" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    const i = RAIL_TABS.findIndex((t) => t.id === tab);
    const n = RAIL_TABS.length;
    const next =
      RAIL_TABS[
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? n - 1
            : (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n
      ].id;
    onPick(next);
    requestAnimationFrame(() => {
      row.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
    });
  };

  return (
    <div
      className="rail-tabs"
      ref={row}
      role="tablist"
      aria-label="Workspace tabs"
      onKeyDown={onKey}
    >
      {pill ? (
        <motion.span
          className="rail-tabs-pill"
          aria-hidden
          initial={false}
          animate={{ x: pill.x, width: pill.w }}
          transition={LABEL_SPRING}
        />
      ) : null}

      <div className="rail-tablist" role="tablist" aria-label="Panel">
        {shown.map((t) => {
          const active = t.id === tab;
          const count = counts[t.id];
          const shortcut = railTabShortcut(t.id);
          return (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="tab"
                  data-tab={t.id}
                  aria-selected={active}
                  aria-controls={`rail-pane-${t.id}`}
                  aria-label={count ? `${t.label}, ${count}` : t.label}
                  tabIndex={active || (!inRow && t === shown[0]) ? 0 : -1}
                  className="rail-tab"
                  data-on={active || undefined}
                  onClick={() => onPick(t.id)}
                >
                  <TabFace
                    id={t.id}
                    label={t.label}
                    named={active && labels}
                    count={count}
                    liveDot={t.id === "preview" && Boolean(isPreviewLive)}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t.label}
                {shortcut ? ` · ${shortcut}` : ""}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rail-tab rail-more"
            data-tab={inRow ? "more" : current.id}
            data-on={!inRow || undefined}
            aria-label={inRow ? "More tabs" : `${current.label}, more tabs`}
            title={
              inRow
                ? "More tabs"
                : `${current.label} · ${railTabShortcut(current.id)}`
            }
          >
            {inRow ? (
              <MoreHorizontal size={16} strokeWidth={1.5} />
            ) : (
              <>
                <TabFace
                  id={current.id}
                  label={current.label}
                  named={labels}
                  count={counts[current.id]}
                  liveDot={current.id === "preview" && Boolean(isPreviewLive)}
                />
                <ChevronDown
                  size={11}
                  strokeWidth={2}
                  className="rail-more-caret"
                />
              </>
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-52 text-xs">
          {rest.map((t) => {
            const count = counts[t.id];
            const shortcut = railTabShortcut(t.id);
            return (
              <DropdownMenuItem
                key={t.id}
                onSelect={() => onPick(t.id)}
                className="flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <TabIcon id={t.id} size={14} />
                  <span className={t.id === tab ? "font-semibold" : undefined}>
                    {t.label}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                  {count ? <span>{count}</span> : null}
                  {shortcut ? <kbd>{shortcut}</kbd> : null}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
