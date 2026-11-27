"use client";

import { ChevronRight, Hourglass } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { SableCollapse } from "@/components/sable-chat/collapse";
import "@/components/tool-call/agent-row.css";
import { ConversationFileSummaryPanel } from "./conversation-file-summary-panel";
import { SableExploreRun } from "./sable-explore-run";
import { foldKey, useFold } from "./sable-fold-store";
import { SableTiles } from "./sable-tiles";
import {
  buildAssistantTurnFlow,
  type GroupedWorkRow,
  type ShowFlowChunk,
  type StepsFlowChunk,
  type TextFlowChunk,
  type TurnFileChanges,
  type TurnLiveInfo,
  type WorkItem,
} from "./sable-turn-grouping";
import { plural, shortDuration, useHeld, useTick } from "./timeline-util";

const TITLE_HOLD_MS = 900;
const SWAP_OUT_MS = 80;
const QUIET_LINGER_MS = 450;

function isReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** True while `on`, and for `ms` after it turns off (1:1 Sable `useLinger`). */
function useLinger(on: boolean, ms: number): boolean {
  const [held, setHeld] = useState(on);
  useEffect(() => {
    if (on) {
      setHeld(true);
      return;
    }
    const timer = window.setTimeout(() => setHeld(false), ms);
    return () => window.clearTimeout(timer);
  }, [on, ms]);
  return on || held;
}

/** Fades an old live title out before fading the new one in (1:1 Sable `useSwap`). */
function useSwap(value: string): [string, boolean] {
  const [shown, setShown] = useState(value);
  const [out, setOut] = useState(false);

  useEffect(() => {
    if (value === shown) {
      setOut(false);
      return;
    }
    if (isReducedMotion()) {
      setShown(value);
      return;
    }
    setOut(true);
    const timer = window.setTimeout(() => {
      setShown(value);
      setOut(false);
    }, SWAP_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [value, shown]);

  return [shown, out];
}

type LineMode = "live" | "run" | "total";

interface WorkRunTiming {
  startMs: number;
  endMs?: number;
}

function RunLine({
  run,
  spanMs,
  open,
  onToggle,
  landed,
}: {
  run: StepsFlowChunk;
  spanMs: number | null;
  open: boolean;
  onToggle?: () => void;
  landed: boolean;
}) {
  const took = spanMs && spanMs >= 1000 ? shortDuration(spanMs) : "";
  const label = run.thoughtOnly
    ? took
      ? `Thought for ${took}`
      : "Thought"
    : took
      ? `Worked ${took}`
      : "Worked";

  return (
    <div className="sable-work-head" data-landed={landed ? "" : undefined}>
      <button
        type="button"
        className="sable-work-line"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="sable-work-label tabular-nums">{label}</span>
        {run.stepCount > 0 && (
          <span className="sable-work-time tabular-nums">
            {plural(run.stepCount, "step")}
          </span>
        )}
        <ChevronRight
          size={10}
          strokeWidth={1.75}
          className="sable-row-caret"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

function TotalLine({
  thoughtOnly,
  totalSteps,
  durationMs,
  open,
  onToggle,
  landed,
}: {
  thoughtOnly: boolean;
  totalSteps: number;
  durationMs: number | null;
  changes: TurnFileChanges;
  open: boolean;
  onToggle?: () => void;
  landed: boolean;
}) {
  const took =
    durationMs && durationMs >= 1000 ? shortDuration(durationMs) : "";
  const label = thoughtOnly
    ? took
      ? `Thought for ${took}`
      : "Thought"
    : took
      ? `Worked ${took}`
      : "Worked";

  return (
    <div className="sable-work-head" data-landed={landed ? "" : undefined}>
      <button
        type="button"
        className="sable-work-line"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="sable-work-label tabular-nums">{label}</span>
        {totalSteps > 0 && (
          <span className="sable-work-time tabular-nums">
            {plural(totalSteps, "step")}
          </span>
        )}
        <ChevronRight
          size={10}
          strokeWidth={1.75}
          className="sable-row-caret"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

function LiveLine({
  live,
  fallbackActivity,
  startedAtMs,
  open,
  onToggle,
}: {
  live: TurnLiveInfo;
  fallbackActivity?: string | null;
  startedAtMs: number | null;
  open: boolean;
  onToggle?: () => void;
}) {
  const now = useTick(true);
  const quiet = useLinger(live.quiet, QUIET_LINGER_MS);
  const rawTitle =
    live.title === "Working" && fallbackActivity?.trim()
      ? fallbackActivity.trim()
      : live.title;
  const held = useHeld(rawTitle, TITLE_HOLD_MS);
  const [title, out] = useSwap(held);
  const elapsed = startedAtMs && now > startedAtMs ? now - startedAtMs : 0;
  const tiles = useMemo(() => <SableTiles size={12} />, []);

  return (
    <div
      className="sable-work-head"
      data-live=""
      data-quiet={quiet ? "" : undefined}
      role="status"
      aria-live="off"
    >
      <button
        type="button"
        className="sable-work-line sable-work-live"
        aria-expanded={onToggle ? open : undefined}
        data-static={!onToggle ? "" : undefined}
        tabIndex={onToggle && !quiet ? undefined : -1}
        onClick={onToggle}
      >
        {live.waiting ? (
          <span className="sable-work-ind sable-work-wait-icon">
            <Hourglass size={13} strokeWidth={1.6} aria-hidden="true" />
          </span>
        ) : (
          <span className="sable-work-ind">{tiles}</span>
        )}
        {live.waiting ? (
          <span className="sable-work-label sable-work-waiting">
            Waiting for you
          </span>
        ) : (
          <span
            className="sable-work-label sable-work-live-title shimmer truncate"
            data-out={out ? "" : undefined}
          >
            {title}
          </span>
        )}
        {elapsed >= 1000 && (
          <span className="sable-work-time tabular-nums">
            {shortDuration(elapsed)}
          </span>
        )}
        {live.stepCount > 0 && (
          <span className="sable-work-time tabular-nums">
            {plural(live.stepCount, "step")}
          </span>
        )}
        {onToggle && (
          <ChevronRight
            size={10}
            strokeWidth={1.75}
            className="sable-row-caret"
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  );
}

function WorkHead({
  mode,
  run,
  runSpanMs,
  live,
  fallbackActivity,
  liveStartedAtMs,
  thoughtOnly,
  totalSteps,
  durationMs,
  changes,
  open,
  onToggle,
}: {
  mode: LineMode;
  run: StepsFlowChunk | null;
  runSpanMs: number | null;
  live?: TurnLiveInfo;
  fallbackActivity?: string | null;
  liveStartedAtMs: number | null;
  thoughtOnly: boolean;
  totalSteps: number;
  durationMs: number | null;
  changes: TurnFileChanges;
  open: boolean;
  onToggle?: () => void;
}) {
  const [landed, setLanded] = useState(false);
  const prevModeRef = useRef(mode);

  useLayoutEffect(() => {
    const before = prevModeRef.current;
    prevModeRef.current = mode;
    if (before === mode || mode === "live" || isReducedMotion()) {
      return;
    }
    setLanded(true);
    const timer = window.setTimeout(() => setLanded(false), 700);
    return () => window.clearTimeout(timer);
  }, [mode]);

  let content: ReactNode = null;
  if (mode === "live" && live) {
    content = (
      <LiveLine
        live={live}
        fallbackActivity={fallbackActivity}
        startedAtMs={liveStartedAtMs}
        open={open}
        onToggle={run ? onToggle : undefined}
      />
    );
  } else if (mode === "total") {
    content = (
      <TotalLine
        thoughtOnly={thoughtOnly}
        totalSteps={totalSteps}
        durationMs={durationMs}
        changes={changes}
        open={open}
        onToggle={onToggle}
        landed={landed}
      />
    );
  } else if (run) {
    content = (
      <RunLine
        run={run}
        spanMs={runSpanMs}
        open={open}
        onToggle={onToggle}
        landed={landed}
      />
    );
  }

  if (!content) return null;
  return (
    <div
      className="sable-tl-work"
      data-live={mode === "live" ? "" : undefined}
      data-open={open ? "" : undefined}
    >
      {content}
    </div>
  );
}

const StepsList = memo(function StepsList({
  rows,
  open,
  nest,
  renderWorkItem,
}: {
  rows: readonly GroupedWorkRow[];
  open: boolean;
  nest: boolean;
  renderWorkItem: (item: WorkItem) => ReactNode;
}) {
  return (
    <SableCollapse
      open={open}
      className={`sable-tl-steps${nest ? " sable-nest" : ""}`}
    >
      <div className="sable-story">
        {rows.map((row) => {
          if (row.kind === "explore-run") {
            return (
              <SableExploreRun
                key={row.key}
                items={row.items}
                renderTool={renderWorkItem}
              />
            );
          }
          const isAgent =
            row.item.kind === "tool" && row.item.part.type === "tool-task";
          return (
            <div
              key={row.key}
              className="sable-tl-sub"
              data-k={isAgent ? "agent" : undefined}
            >
              {renderWorkItem(row.item)}
            </div>
          );
        })}
      </div>
    </SableCollapse>
  );
});

const RunPiece = memo(function RunPiece({
  messageId,
  run,
  runSpanMs,
  head,
  live,
  settled,
  turnOpen,
  multi,
  nest,
  liveInfo,
  fallbackActivity,
  liveStartedAtMs,
  activeApprovalId,
  thoughtOnly,
  totalSteps,
  durationMs,
  changes,
  onToggleTurn,
  renderWorkItem,
}: {
  messageId: string;
  run: StepsFlowChunk | null;
  runSpanMs: number | null;
  head: boolean;
  live: boolean;
  settled: boolean;
  turnOpen: boolean;
  multi: boolean;
  nest: boolean;
  liveInfo?: TurnLiveInfo;
  fallbackActivity?: string | null;
  liveStartedAtMs: number | null;
  activeApprovalId: string | null;
  thoughtOnly: boolean;
  totalSteps: number;
  durationMs: number | null;
  changes: TurnFileChanges;
  onToggleTurn: () => void;
  renderWorkItem: (item: WorkItem) => ReactNode;
}) {
  const [runOpen, setRunOpen] = useFold(
    foldKey(messageId, run?.key ?? "empty-live", "run"),
    false,
  );
  const toggleRun = useCallback(
    () => setRunOpen(!runOpen),
    [setRunOpen, runOpen],
  );

  // If a run contains an inline approval button (not handled by the composer's activeApprovalId bar),
  // force it open so the user can act on it.
  const hasInlineApproval = Boolean(
    run?.hasApprovalRequested &&
    run.approvalIds.some((id) => id !== activeApprovalId),
  );

  const total = head && settled;
  const bare = settled && !multi;
  const stepsOpen =
    hasInlineApproval || (settled ? turnOpen && (bare || runOpen) : runOpen);
  const inside = nest && multi;
  const mode: LineMode = total ? "total" : live ? "live" : "run";

  return (
    <SableCollapse
      open={head || !settled || turnOpen || hasInlineApproval}
      className={`sable-tl-fold sable-fold-run${inside && !head ? " sable-nest" : ""}`}
    >
      <div className="sable-seg-work">
        {!(bare && nest && !head) && (
          <WorkHead
            mode={mode}
            run={run}
            runSpanMs={runSpanMs}
            live={liveInfo}
            fallbackActivity={fallbackActivity}
            liveStartedAtMs={liveStartedAtMs}
            thoughtOnly={thoughtOnly}
            totalSteps={totalSteps}
            durationMs={durationMs}
            changes={changes}
            open={total ? turnOpen : stepsOpen}
            onToggle={total ? onToggleTurn : run ? toggleRun : undefined}
          />
        )}
        {head && run && (
          <SableCollapse
            open={turnOpen && multi}
            className="sable-tl-fold sable-fold-run sable-nest"
          >
            <WorkHead
              mode="run"
              run={run}
              runSpanMs={runSpanMs}
              liveStartedAtMs={null}
              thoughtOnly={thoughtOnly}
              totalSteps={totalSteps}
              durationMs={durationMs}
              changes={changes}
              open={stepsOpen}
              onToggle={toggleRun}
            />
          </SableCollapse>
        )}
        {run && (
          <StepsList
            rows={run.rows}
            open={stepsOpen}
            nest={inside}
            renderWorkItem={renderWorkItem}
          />
        )}
      </div>
    </SableCollapse>
  );
});

export interface SableTurnViewProps {
  message: WebAgentUIMessage;
  isStreaming: boolean;
  durationMs: number | null;
  startedAt: string | null;
  activeApprovalId?: string | null;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  workspaceStatusMessage?: string | null;
  isAwaitingInput?: boolean;
  renderTextChunk: (chunk: TextFlowChunk) => ReactNode;
  renderShowChunk: (chunk: ShowFlowChunk) => ReactNode;
  renderWorkItem: (item: WorkItem) => ReactNode;
  footer?: ReactNode;
}

/**
 * Ported 1:1 from Leonxlnx/sable `src/features/timeline/TurnView.tsx`.
 * Renders an assistant turn as checkpoints while running (closed checkpoint summary + note,
 * live checkpoint line with Tiles + shimmer at bottom, all folded by default), then smoothly
 * gathers all runs and intermediate notes behind one `TotalLine` when settled.
 */
export const SableTurnView = memo(function SableTurnView({
  message,
  isStreaming,
  durationMs,
  startedAt,
  activeApprovalId = null,
  cwd,
  onOpenFile,
  workspaceStatusMessage = null,
  isAwaitingInput = false,
  renderTextChunk,
  renderShowChunk,
  renderWorkItem,
  footer,
}: SableTurnViewProps) {
  const turnFlow = useMemo(
    () => buildAssistantTurnFlow(message, isStreaming),
    [message, isStreaming],
  );

  const [wanted, setWanted] = useFold(foldKey(message.id, "turn"), false);
  const settled = !isStreaming;
  const open = settled && turnFlow.headAt >= 0 && wanted;

  // Keep pieces aligned to column edge while collapsing at turn end; indent one level when reopened.
  const [flat, setFlat] = useState(isStreaming);
  if (flat && open) {
    setFlat(false);
  }
  const nest = settled && !flat;
  const toggleTurn = useCallback(() => setWanted(!wanted), [setWanted, wanted]);

  // Track live checkpoint run start/end wall timestamps during streaming so closed
  // checkpoints show real elapsed seconds (e.g. "Worked 14s · 3 steps").
  const runTimingsRef = useRef(new Map<string, WorkRunTiming>());
  const turnStartFallbackRef = useRef<number | null>(null);
  if (isStreaming && turnStartFallbackRef.current === null) {
    const parsed = startedAt ? Date.parse(startedAt) : Number.NaN;
    turnStartFallbackRef.current = Number.isFinite(parsed)
      ? parsed
      : Date.now();
  }

  const parsedStartedAtMs = useMemo(() => {
    if (!startedAt) return null;
    const parsed = Date.parse(startedAt);
    return Number.isFinite(parsed) ? parsed : null;
  }, [startedAt]);

  const effectiveTurnStartMs =
    parsedStartedAtMs ?? turnStartFallbackRef.current;

  useEffect(() => {
    const timings = runTimingsRef.current;
    const now = Date.now();
    const lastIdx = turnFlow.flow.length - 1;
    turnFlow.flow.forEach((chunk, idx) => {
      if (chunk.kind !== "steps") return;
      const existing = timings.get(chunk.key);
      if (!existing) {
        const startMs =
          idx === 0 && effectiveTurnStartMs ? effectiveTurnStartMs : now;
        timings.set(chunk.key, {
          startMs,
          endMs: isStreaming && idx === lastIdx ? undefined : now,
        });
      } else if ((!isStreaming || idx < lastIdx) && !existing.endMs) {
        existing.endMs = now;
      }
    });
  }, [turnFlow.flow, isStreaming, effectiveTurnStartMs]);

  const effectiveDurationMs = useMemo(() => {
    if (durationMs != null && durationMs > 0) return durationMs;
    if (settled && effectiveTurnStartMs) {
      const timings = runTimingsRef.current;
      let maxEnd = 0;
      for (const timing of timings.values()) {
        if (timing.endMs && timing.endMs > maxEnd) maxEnd = timing.endMs;
      }
      if (maxEnd > effectiveTurnStartMs) {
        return maxEnd - effectiveTurnStartMs;
      }
    }
    return durationMs;
  }, [durationMs, settled, effectiveTurnStartMs]);

  const effectiveLive = useMemo<TurnLiveInfo>(
    () => ({
      ...turnFlow.live,
      waiting: turnFlow.live.waiting || Boolean(isAwaitingInput),
    }),
    [turnFlow.live, isAwaitingInput],
  );

  // Stop notices (billing safeguard, spend cap, timeout, turnError)
  const stopNotice = message.metadata?.windowExhausted
    ? "You've hit your usage limit"
    : message.metadata?.creditExhausted
      ? "You're out of credit"
      : message.metadata?.turnSpendCapped
        ? "Turn spend cap reached"
        : message.metadata?.turnTimedOut
          ? "Turn duration limit reached"
          : !isStreaming && message.metadata?.turnError
            ? message.metadata.turnError
            : null;

  const flow = turnFlow.flow;
  const shown = isStreaming || open;
  const pieces: ReactNode[] = [];
  let ord = 0;

  const reportedStepCount = message.metadata?.stepBreakdown?.length;
  const displayTotalSteps =
    typeof reportedStepCount === "number" && reportedStepCount > 0
      ? reportedStepCount
      : turnFlow.totalSteps;

  for (let i = 0; i < flow.length; i++) {
    const chunk = flow[i];

    // If a note came before the first run, render the settled TotalLine right before it.
    if (i === turnFlow.headAt && chunk.kind !== "steps") {
      pieces.push(
        <SableCollapse
          key="turn-fold-line"
          open={settled}
          className="sable-tl-fold sable-fold-line"
        >
          <div className="sable-seg-work">
            <WorkHead
              mode="total"
              run={null}
              runSpanMs={null}
              liveStartedAtMs={null}
              thoughtOnly={turnFlow.thoughtOnly}
              totalSteps={displayTotalSteps}
              durationMs={effectiveDurationMs}
              changes={turnFlow.changes}
              open={open}
              onToggle={toggleTurn}
            />
          </div>
        </SableCollapse>,
      );
    }

    if (chunk.kind === "show") {
      pieces.push(
        <div key={chunk.key} className="min-w-0 w-full py-1">
          {renderShowChunk(chunk)}
        </div>,
      );
      continue;
    }

    if (chunk.kind === "text") {
      pieces.push(
        <SableCollapse
          key={chunk.key}
          open={!chunk.isNote || shown}
          className={`sable-tl-fold sable-fold-text${chunk.isNote && nest ? " sable-nest" : ""}${chunk.isTail ? " sable-fold-tail" : ""}`}
        >
          <div
            data-answer={chunk.isAnswer ? "" : undefined}
            data-mid={!chunk.isAnswer ? "" : undefined}
          >
            {renderTextChunk(chunk)}
          </div>
        </SableCollapse>,
      );
      continue;
    }

    const head = i === turnFlow.headAt;
    const isLiveRun = isStreaming && i === flow.length - 1;
    const timing = runTimingsRef.current.get(chunk.key);
    const runSpanMs =
      timing && timing.endMs && timing.endMs > timing.startMs
        ? timing.endMs - timing.startMs
        : null;
    const liveStartMs = timing?.startMs ?? effectiveTurnStartMs;

    pieces.push(
      <RunPiece
        key={`w${ord++}`}
        messageId={message.id}
        run={chunk}
        runSpanMs={runSpanMs}
        head={head}
        live={isLiveRun}
        settled={settled}
        turnOpen={open}
        multi={turnFlow.multi}
        nest={nest}
        liveInfo={isLiveRun ? effectiveLive : undefined}
        fallbackActivity={isLiveRun ? workspaceStatusMessage : null}
        liveStartedAtMs={isLiveRun ? liveStartMs : null}
        activeApprovalId={activeApprovalId}
        thoughtOnly={turnFlow.thoughtOnly}
        totalSteps={displayTotalSteps}
        durationMs={effectiveDurationMs}
        changes={turnFlow.changes}
        onToggleTurn={toggleTurn}
        renderWorkItem={renderWorkItem}
      />,
    );
  }

  // While streaming, if nothing has started yet or the newest chunk is prose/show,
  // place the live line at the end (quiet while writing prose, visible when waiting/starting).
  if (
    isStreaming &&
    (flow.length === 0 || flow[flow.length - 1].kind !== "steps")
  ) {
    pieces.push(
      <RunPiece
        key={`w${ord}`}
        messageId={message.id}
        run={null}
        runSpanMs={null}
        head={false}
        live={true}
        settled={false}
        turnOpen={false}
        multi={turnFlow.multi}
        nest={false}
        liveInfo={effectiveLive}
        fallbackActivity={workspaceStatusMessage}
        liveStartedAtMs={effectiveTurnStartMs}
        activeApprovalId={activeApprovalId}
        thoughtOnly={turnFlow.thoughtOnly}
        totalSteps={displayTotalSteps}
        durationMs={effectiveDurationMs}
        changes={turnFlow.changes}
        onToggleTurn={toggleTurn}
        renderWorkItem={renderWorkItem}
      />,
    );
  }

  return (
    <section className="sable-tg" data-state={isStreaming ? "running" : "done"}>
      {pieces}

      {footer}

      {stopNotice && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {stopNotice}
        </p>
      )}

      {turnFlow.changes.files > 0 && (
        <ConversationFileSummaryPanel
          changes={turnFlow.changes}
          files={turnFlow.changedFileDetails}
          cwd={cwd}
          onOpenFile={onOpenFile}
        />
      )}
    </section>
  );
});
