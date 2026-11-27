"use client";

import {
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  GitFork,
  Loader2,
  Paperclip,
  Play,
  ShieldCheck,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { type MouseEvent, useEffect, useState } from "react";
import { EntryMark } from "@/components/entry-mark";
import { WorkspaceInspectorPane } from "./workspace-inspector-pane";
import {
  type InspectorTab,
  PREVIEW_SCENARIOS,
  type ScenarioId,
} from "./workspace-preview-data";
import { WorkspaceSidebarPreview } from "./workspace-sidebar-preview";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const DEMO_SCENARIOS: readonly ScenarioId[] = ["resend", "oauth"];

type DemoStage = 0 | 1 | 2;

export function AppMockup() {
  const prefersReduced = useReducedMotion() ?? false;
  const [scenarioId, setScenarioId] = useState<ScenarioId>("resend");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("diff");
  const [demoStage, setDemoStage] = useState<DemoStage>(prefersReduced ? 2 : 0);
  const [autoPlay, setAutoPlay] = useState(!prefersReduced);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobilePane, setMobilePane] = useState<"chat" | "inspector">("chat");

  // Subtle monochrome pointer hairline spotlight on desktop hover (zero React re-renders)
  const pointerX = useMotionValue(540);
  const pointerY = useMotionValue(120);
  const pointerBg = useMotionTemplate`radial-gradient(520px circle at ${pointerX}px ${pointerY}px, rgba(186, 230, 253, 0.14), transparent 65%)`;

  const scenario = PREVIEW_SCENARIOS[scenarioId];

  // Self-playing live desktop agent demo:
  // Stage 0: initial 2 steps done, step 3 running, partial diff visible
  // Stage 1: step 3 done, step 4 running, full diff streams in
  // Stage 2: turn complete -> reply + file summary appear -> inspector slides to Preview
  // Then cycles cleanly between DeepSeek V4.1 Flash 1017 & GLM 5.3 Flash scenarios
  useEffect(() => {
    if (prefersReduced) {
      setDemoStage(2);
      setAutoPlay(false);
      return;
    }
    if (!autoPlay) return;

    setDemoStage(0);
    setInspectorTab("diff");
    setStepsExpanded(false);

    const t1 = window.setTimeout(() => {
      setDemoStage(1);
    }, 1400);

    const t2 = window.setTimeout(() => {
      setDemoStage(2);
      setInspectorTab("preview");
    }, 2800);

    const t3 = window.setTimeout(() => {
      setScenarioId((current) => {
        const idx = DEMO_SCENARIOS.indexOf(current);
        return DEMO_SCENARIOS[(idx + 1) % DEMO_SCENARIOS.length] ?? "resend";
      });
    }, 6600);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [autoPlay, prefersReduced, scenarioId]);

  const stopAutoPlayAndSettle = () => {
    if (autoPlay) {
      setAutoPlay(false);
    }
    setDemoStage(2);
  };

  const handleSelectScenario = (nextId: ScenarioId) => {
    setAutoPlay(false);
    setScenarioId(nextId);
    setDemoStage(2);
    setInspectorTab("diff");
    setStepsExpanded(false);
    setCopied(false);
  };

  const handleSelectInspectorTab = (tab: InspectorTab) => {
    stopAutoPlayAndSettle();
    setInspectorTab(tab);
  };

  const openInspectorTab = (tab: InspectorTab) => {
    stopAutoPlayAndSettle();
    setInspectorTab(tab);
    setMobilePane("inspector");
  };

  const handleToggleAutoPlay = () => {
    if (autoPlay) {
      stopAutoPlayAndSettle();
      return;
    }
    setStepsExpanded(false);
    setDemoStage(0);
    setInspectorTab("diff");
    setAutoPlay(true);
  };

  const handleCopy = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set(event.clientX - rect.left);
    pointerY.set(event.clientY - rect.top);
  };

  const isRunning = autoPlay && demoStage < 2;
  const visibleStepCount =
    demoStage === 0 ? 3 : demoStage === 1 ? 4 : scenario.steps.length;
  const visibleDiffCount =
    demoStage === 0
      ? Math.min(8, scenario.diffLines.length)
      : scenario.diffLines.length;

  const ringCircumference = 40.84;
  const ringOffset = ringCircumference * (1 - scenario.contextPct / 100);

  return (
    <div
      aria-label="Interactive Entry workspace preview"
      onMouseMove={handleMouseMove}
      className="group/bezel relative min-w-0 rounded-[20px] border border-(--l-border) bg-(--l-surface)/55 p-1.5 shadow-(--l-window-shadow) backdrop-blur-md"
    >
      {/* Subtle desktop cursor hairline illumination */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden rounded-[20px] opacity-0 transition-opacity duration-300 group-hover/bezel:opacity-100 md:block"
        style={{ background: pointerBg }}
      />

      <div className="relative min-w-0 overflow-hidden rounded-[14px] border border-(--l-panel-border) bg-(--l-panel)">
        <div className="grid min-w-0 md:grid-cols-[minmax(0,1fr)_336px] lg:grid-cols-[232px_minmax(0,1fr)_364px]">
          <WorkspaceSidebarPreview
            activeScenarioId={scenarioId}
            isStreamingActive={isRunning}
            onSelectScenario={handleSelectScenario}
          />

          {/* Center Pane — Authentic Entry Chat */}
          <div
            className={`min-w-0 flex-col border-(--l-panel-border) bg-(--l-panel) md:flex md:border-r ${
              mobilePane === "chat" ? "flex" : "hidden md:flex"
            }`}
          >
            {/* Chat header */}
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-(--l-panel-border) px-3.5 sm:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex size-4 shrink-0 items-center justify-center lg:hidden">
                  <EntryMark className="size-4" />
                </span>
                <span className="truncate text-xs font-medium text-(--l-panel-fg) sm:text-[13px]">
                  {scenario.title}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {!prefersReduced && (
                  <button
                    type="button"
                    onClick={handleToggleAutoPlay}
                    className="hidden cursor-pointer items-center gap-1.5 rounded-md border border-(--l-panel-border) bg-(--l-panel-surface) px-2 py-0.5 text-[11px] font-medium text-(--l-panel-fg-2) transition-colors hover:text-(--l-panel-fg) sm:inline-flex"
                    title={
                      autoPlay
                        ? "Pause live workspace playback"
                        : "Replay live workspace run"
                    }
                  >
                    {autoPlay ? (
                      <>
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        <span>Live</span>
                      </>
                    ) : (
                      <>
                        <Play className="size-2.5" strokeWidth={1.8} />
                        <span>Replay</span>
                      </>
                    )}
                  </button>
                )}

                <div className="inline-flex rounded-md border border-(--l-panel-border) bg-(--l-panel-surface) p-0.5 text-[11px] md:hidden">
                  <button
                    type="button"
                    onClick={() => setMobilePane("chat")}
                    className="cursor-pointer rounded-xs bg-(--l-panel-active) px-2 py-0.5 font-medium text-(--l-panel-fg)"
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => openInspectorTab(inspectorTab)}
                    className="cursor-pointer rounded-xs px-2 py-0.5 text-(--l-panel-fg-3)"
                  >
                    Workspace
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => openInspectorTab("context")}
                  className="hidden cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium tabular-nums text-(--l-panel-fg-3) transition-colors hover:bg-(--l-panel-surface) hover:text-(--l-panel-fg) sm:inline-flex"
                  title="Inspect session context"
                >
                  <svg
                    viewBox="0 0 18 18"
                    className="size-3.5 -rotate-90"
                    aria-hidden="true"
                  >
                    <circle
                      cx="9"
                      cy="9"
                      r="6.5"
                      fill="none"
                      stroke="var(--l-panel-border)"
                      strokeWidth="2.2"
                    />
                    <circle
                      cx="9"
                      cy="9"
                      r="6.5"
                      fill="none"
                      stroke="var(--l-panel-fg)"
                      strokeWidth="2.2"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>{scenario.contextPct}%</span>
                </button>
              </div>
            </div>

            {/* Chat messages */}
            <div className="flex flex-1 flex-col justify-between gap-5 p-4 sm:p-5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={scenario.id}
                  initial={{ opacity: 0, transform: "translateY(4px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  exit={{ opacity: 0, transform: "translateY(-4px)" }}
                  transition={{ duration: 0.18, ease: EASE_OUT }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between rounded-lg border border-(--l-panel-border) bg-(--l-panel-surface) px-3 py-2 text-[11px] text-(--l-panel-fg-3)">
                    <span className="tabular-nums">{scenario.prevSteps}</span>
                    <span className="font-mono text-(--l-panel-fg-2)">
                      {scenario.branch}
                    </span>
                  </div>

                  <div className="flex justify-end">
                    <div className="max-w-[90%] rounded-2xl border border-(--l-panel-border) bg-(--l-panel-surface) px-3.5 py-2.5 text-[13px] leading-relaxed text-(--l-panel-fg) sm:max-w-[84%]">
                      {scenario.prompt}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          stopAutoPlayAndSettle();
                          setStepsExpanded((prev) => !prev);
                        }}
                        className="inline-flex cursor-pointer items-center gap-1.5 text-xs tabular-nums text-(--l-panel-fg-3) transition-colors hover:text-(--l-panel-fg)"
                      >
                        {isRunning ? (
                          <Loader2
                            className="size-3.5 animate-spin text-(--l-accent)"
                            strokeWidth={1.6}
                          />
                        ) : stepsExpanded ? (
                          <ChevronDown className="size-3.5" strokeWidth={1.5} />
                        ) : (
                          <ChevronRight
                            className="size-3.5"
                            strokeWidth={1.5}
                          />
                        )}
                        <span>
                          {isRunning
                            ? `Working · step ${visibleStepCount} of ${scenario.steps.length}`
                            : scenario.workedLabel}
                        </span>
                      </button>

                      {(isRunning || stepsExpanded) && (
                        <div className="mt-2 space-y-1 border-l border-(--l-panel-border) pl-3 font-mono text-[11px] tabular-nums">
                          {scenario.steps
                            .slice(0, visibleStepCount)
                            .map((step, index) => {
                              const stepActive =
                                isRunning && index === visibleStepCount - 1;
                              return (
                                <motion.div
                                  key={step.id}
                                  initial={
                                    isRunning && index >= 2
                                      ? {
                                          opacity: 0,
                                          transform: "translateY(3px)",
                                        }
                                      : false
                                  }
                                  animate={{
                                    opacity: 1,
                                    transform: "translateY(0px)",
                                  }}
                                  transition={{
                                    duration: 0.16,
                                    ease: EASE_OUT,
                                  }}
                                  className="flex items-center justify-between gap-3 py-0.5 text-(--l-panel-fg-2)"
                                >
                                  <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                                    {stepActive ? (
                                      <Loader2
                                        className="size-3 shrink-0 animate-spin text-(--l-accent)"
                                        strokeWidth={1.6}
                                      />
                                    ) : (
                                      <CheckCircle2
                                        className="size-3 shrink-0 text-emerald-500"
                                        strokeWidth={1.6}
                                      />
                                    )}
                                    <span className="text-(--l-accent)">
                                      {step.tool}
                                    </span>
                                    <span className="truncate">
                                      {step.detail}
                                    </span>
                                  </span>
                                  <span className="shrink-0 text-(--l-panel-fg-4)">
                                    {stepActive ? "running" : step.duration}
                                  </span>
                                </motion.div>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {!isRunning && (
                      <motion.div
                        initial={
                          prefersReduced
                            ? false
                            : { opacity: 0, transform: "translateY(4px)" }
                        }
                        animate={{ opacity: 1, transform: "translateY(0px)" }}
                        transition={{ duration: 0.22, ease: EASE_OUT }}
                        className="space-y-3"
                      >
                        <p className="text-[13.5px] leading-relaxed text-(--l-panel-fg)">
                          {scenario.replyBeforeCode}
                          <code className="rounded bg-(--l-panel-surface) px-1 py-0.5 font-mono text-[12px]">
                            {scenario.replyCode}
                          </code>
                          {scenario.replyAfterCode}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-(--l-panel-fg-3)">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={handleCopy}
                              className="inline-flex cursor-pointer items-center gap-1 text-(--l-panel-fg-2) transition-colors hover:text-(--l-panel-fg)"
                            >
                              {copied ? (
                                <Check
                                  className="size-3 text-emerald-500"
                                  strokeWidth={1.75}
                                />
                              ) : (
                                <Copy className="size-3" strokeWidth={1.5} />
                              )}
                              <span>{copied ? "Copied" : "Copy"}</span>
                            </button>
                            <span className="inline-flex items-center gap-1 text-(--l-panel-fg-2)">
                              <GitFork className="size-3" strokeWidth={1.5} />
                              <span>Fork</span>
                            </span>
                          </div>
                          <div className="font-mono text-[11px] tabular-nums text-(--l-panel-fg-3)">
                            {scenario.timestamp} · {scenario.model} ·{" "}
                            {scenario.cost}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openInspectorTab("diff")}
                          className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-(--l-panel-border) bg-(--l-panel-surface) px-3 py-2 text-left text-xs transition-colors hover:border-(--l-fg-5)"
                        >
                          <span className="inline-flex items-center gap-2">
                            <ChevronRight
                              className="size-3.5 text-(--l-panel-fg-3)"
                              strokeWidth={1.5}
                            />
                            <span className="font-medium text-(--l-panel-fg)">
                              {scenario.filesChangedCount} files changed
                            </span>
                            <span className="font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                              +{scenario.totalAdded}
                            </span>
                            <span className="font-mono text-[11px] tabular-nums text-rose-600 dark:text-rose-400">
                              -{scenario.totalRemoved}
                            </span>
                          </span>
                          <span className="text-[11px] text-(--l-panel-fg-3)">
                            Inspect diff
                          </span>
                        </button>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="rounded-xl border border-(--l-panel-border) bg-(--l-surface) px-3.5 py-2.5">
                <div className="text-xs text-(--l-panel-fg-3)">
                  Follow up on {scenario.prTag} or open another branch...
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-(--l-panel-fg-2)">
                    <Paperclip
                      className="size-3.5 text-(--l-panel-fg-3)"
                      strokeWidth={1.5}
                    />
                    <span className="font-medium text-(--l-panel-fg)">
                      {scenario.modelFull}
                    </span>
                    <span className="text-(--l-panel-fg-3)">
                      {scenario.effort}
                    </span>
                    <span className="hidden items-center gap-1 text-(--l-panel-fg-3) sm:inline-flex">
                      <ShieldCheck className="size-3" strokeWidth={1.5} />
                      <span>Full access</span>
                    </span>
                  </div>
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-(--l-btn-bg) text-(--l-btn-fg)">
                    <ArrowUp className="size-3.5" strokeWidth={1.75} />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Pane — Workspace Inspector */}
          <div
            className={`min-w-0 flex-col md:flex ${
              mobilePane === "inspector" ? "flex" : "hidden md:flex"
            }`}
          >
            <div className="flex h-10 items-center justify-between border-b border-(--l-panel-border) px-3.5 md:hidden">
              <span className="text-xs font-medium text-(--l-panel-fg)">
                Workspace inspector
              </span>
              <button
                type="button"
                onClick={() => setMobilePane("chat")}
                className="cursor-pointer rounded-md border border-(--l-panel-border) px-2 py-0.5 text-[11px] font-medium text-(--l-panel-fg-2)"
              >
                Back to chat
              </button>
            </div>
            <WorkspaceInspectorPane
              activeTab={inspectorTab}
              onSelectTab={handleSelectInspectorTab}
              scenario={scenario}
              visibleDiffCount={visibleDiffCount}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
