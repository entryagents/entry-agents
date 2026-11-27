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
import { type FormEvent, type MouseEvent, useEffect, useState } from "react";
import { EntryMark } from "@/components/entry-mark";
import { WorkspaceInspectorPane } from "./workspace-inspector-pane";
import {
  type InspectorTab,
  PREVIEW_SCENARIOS,
  type ScenarioId,
} from "./workspace-preview-data";
import { WorkspaceSidebarPreview } from "./workspace-sidebar-preview";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const DEMO_SCENARIOS: readonly ScenarioId[] = ["resend", "oauth", "checkout"];

const QUICK_PROMPTS: readonly {
  readonly id: ScenarioId;
  readonly label: string;
}[] = [
  { id: "resend", label: "Resend emails" },
  { id: "oauth", label: "OAuth callbacks" },
  { id: "checkout", label: "375px audit" },
];

type DemoStage = 0 | 1 | 2;

export function AppMockup() {
  const prefersReduced = useReducedMotion() ?? false;
  const [scenarioId, setScenarioId] = useState<ScenarioId>("resend");
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [composerInput, setComposerInput] = useState("");
  const [runNonce, setRunNonce] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("diff");
  const [demoStage, setDemoStage] = useState<DemoStage>(prefersReduced ? 2 : 0);
  const [autoPlay, setAutoPlay] = useState(!prefersReduced);
  const [elapsedSeconds, setElapsedSeconds] = useState(1);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobilePane, setMobilePane] = useState<"chat" | "inspector">("chat");

  // Subtle monochrome pointer hairline spotlight on desktop hover (zero React re-renders)
  const pointerX = useMotionValue(540);
  const pointerY = useMotionValue(120);
  const pointerBg = useMotionTemplate`radial-gradient(540px circle at ${pointerX}px ${pointerY}px, rgba(186, 230, 253, 0.16), transparent 65%)`;

  const scenario = PREVIEW_SCENARIOS[scenarioId];

  // Live ticking elapsed seconds while a run is actively executing
  useEffect(() => {
    if (prefersReduced || demoStage === 2) return;
    setElapsedSeconds(1);
    const id = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [demoStage, prefersReduced, runNonce, scenarioId]);

  // Self-playing live desktop agent choreography
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
    }, 1250);

    const t2 = window.setTimeout(() => {
      setDemoStage(2);
      setInspectorTab("preview");
    }, 2500);

    const t3 = window.setTimeout(() => {
      setCustomPrompt(null);
      setScenarioId((current) => {
        const idx = DEMO_SCENARIOS.indexOf(current);
        return DEMO_SCENARIOS[(idx + 1) % DEMO_SCENARIOS.length] ?? "resend";
      });
    }, 6400);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [autoPlay, prefersReduced, runNonce, scenarioId]);

  const stopAutoPlayAndSettle = () => {
    if (autoPlay) {
      setAutoPlay(false);
    }
    setDemoStage(2);
  };

  const triggerLiveRun = (nextId: ScenarioId, overridePrompt?: string) => {
    setScenarioId(nextId);
    setCustomPrompt(overridePrompt ?? null);
    setStepsExpanded(false);
    setCopied(false);
    setDemoStage(0);
    setInspectorTab("diff");
    setRunNonce((n) => n + 1);
    setAutoPlay(!prefersReduced);
  };

  const handleSelectScenario = (nextId: ScenarioId) => {
    triggerLiveRun(nextId);
  };

  const handleComposerSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = composerInput.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    const matchedId: ScenarioId =
      lower.includes("auth") ||
      lower.includes("login") ||
      lower.includes("oauth")
        ? "oauth"
        : lower.includes("mobile") ||
            lower.includes("375") ||
            lower.includes("pricing")
          ? "checkout"
          : "resend";
    setComposerInput("");
    triggerLiveRun(matchedId, trimmed);
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
    triggerLiveRun(scenarioId);
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
  const elapsedFormatted = `00:${String(elapsedSeconds).padStart(2, "0")}`;

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

          {/* Center Pane — Authentic Interactive Entry Chat */}
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
                    className="hidden cursor-pointer items-center gap-1.5 rounded-md border border-(--l-panel-border) bg-(--l-panel-surface) px-2 py-0.5 font-mono text-[11px] tabular-nums text-(--l-panel-fg-2) transition-colors hover:text-(--l-panel-fg) sm:inline-flex"
                    title={
                      autoPlay
                        ? "Pause live workspace playback"
                        : "Replay live workspace run"
                    }
                  >
                    {autoPlay ? (
                      <>
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        <span>
                          {isRunning ? `Live · ${elapsedFormatted}` : "Live"}
                        </span>
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

            {/* Live execution progress hairline synced to demoStage */}
            <div className="h-[1.5px] w-full bg-(--l-panel-border)/60">
              <motion.div
                className="h-full bg-(--l-accent)"
                initial={false}
                animate={{
                  width:
                    demoStage === 0 ? "42%" : demoStage === 1 ? "78%" : "100%",
                  opacity: autoPlay ? 1 : 0.35,
                }}
                transition={{ duration: 0.55, ease: EASE_OUT }}
              />
            </div>

            {/* Chat messages */}
            <div className="flex flex-1 flex-col justify-between gap-4 p-4 sm:p-5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${scenario.id}-${runNonce}`}
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
                      {customPrompt ?? scenario.prompt}
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

              {/* Interactive live prompt playground composer */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {QUICK_PROMPTS.map((item) => {
                    const active = item.id === scenarioId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => triggerLiveRun(item.id)}
                        className={`cursor-pointer rounded-lg border px-2 py-0.5 text-[11px] transition-colors duration-150 ${
                          active
                            ? "border-(--l-fg-4) bg-(--l-panel-active) font-medium text-(--l-panel-fg)"
                            : "border-(--l-panel-border) bg-(--l-surface) text-(--l-panel-fg-3) hover:border-(--l-fg-5) hover:text-(--l-panel-fg)"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <form
                  onSubmit={handleComposerSubmit}
                  className="rounded-xl border border-(--l-panel-border) bg-(--l-surface) px-3.5 py-2.5 transition-colors focus-within:border-(--l-fg-4)"
                >
                  <input
                    type="text"
                    value={composerInput}
                    onChange={(event) => setComposerInput(event.target.value)}
                    placeholder={`Try a prompt on ${scenario.branch} and press Enter...`}
                    aria-label="Try an interactive workspace prompt"
                    className="w-full bg-transparent text-xs text-(--l-panel-fg) placeholder:text-(--l-panel-fg-3) focus:outline-none"
                  />
                  <div className="mt-2.5 flex items-center justify-between gap-2">
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
                    <button
                      type="submit"
                      aria-label="Run preview prompt"
                      className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-(--l-btn-bg) text-(--l-btn-fg) transition-[opacity,transform] hover:opacity-90 active:scale-95"
                    >
                      <ArrowUp className="size-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </form>
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
