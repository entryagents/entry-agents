"use client";

import {
  CheckCircle2,
  GitBranch,
  Globe,
  Laptop,
  Monitor,
  RotateCcw,
  Server,
  Smartphone,
  Terminal,
  WifiOff,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import { useEffect, useRef, useState } from "react";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type StoryStageId = "vm" | "continuity" | "waves";

const STORY_CHAPTERS: readonly {
  readonly id: StoryStageId;
  readonly icon: typeof Terminal;
  readonly title: string;
  readonly body: string;
  readonly metric: string;
}[] = [
  {
    id: "vm",
    icon: Terminal,
    title: "An Ubuntu machine behind every chat",
    body: "Each project boots an isolated Linux environment with its own filesystem, background dev servers, real git branches, and live HTTPS port previews. Idle machines suspend automatically when you step away.",
    metric: "ubuntu-24.04 · 2 vCPU · 8 GiB",
  },
  {
    id: "continuity",
    icon: Server,
    title: "Runs that finish after you close the tab",
    body: "Agent turns execute on durable server checkpoints instead of a fragile browser socket. Shut your laptop on the train or switch to your phone — Entry finishes the test suite and reconciles every diff when you come back.",
    metric: "18 / 18 tests verified offline",
  },
  {
    id: "waves",
    icon: GitBranch,
    title: "Solo speed for small fixes. Parallel waves for big builds.",
    body: "Targeted changes finish straight through in one fast pass. Broad features lock shared contracts first and fan out disjoint file edits across parallel builders inside the same thread.",
    metric: "Disjoint file locks · zero merge conflicts",
  },
];

const TERMINAL_LINES = [
  { kind: "cmd", text: "$ pnpm dev --port 3000 &" },
  { kind: "ok", text: "Server ready in 1.4s · persisted across turns" },
  { kind: "cmd", text: "$ bun test lib/email" },
  { kind: "ok", text: "12 pass · 0 fail in 340ms" },
  {
    kind: "url",
    text: "Exposed port 3000 at https://preview-3000.entryagents.app",
  },
] as const;

const CONTINUITY_PHASES = [
  {
    id: "offline",
    icon: WifiOff,
    title: "Laptop closes mid-turn",
    detail: "Browser disconnects while running integration tests",
    badge: "Offline",
    progress: 34,
  },
  {
    id: "server",
    icon: Server,
    title: "Cloud workflow keeps executing",
    detail: "Server checkpoints persist every edit, test pass, and commit",
    badge: "18 / 18 green",
    progress: 72,
  },
  {
    id: "mobile",
    icon: Smartphone,
    title: "Reconciled when you return",
    detail: "Open from desktop or phone to inspect PR #324 (+248 -19)",
    badge: "Synced",
    progress: 100,
  },
] as const;

function StoryChapterTrigger({
  chapter,
  active,
  onSelect,
  onBecameVisible,
}: {
  readonly chapter: (typeof STORY_CHAPTERS)[number];
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly onBecameVisible: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { margin: "-35% 0px -45% 0px" });

  useEffect(() => {
    if (inView) {
      onBecameVisible();
    }
  }, [inView, onBecameVisible]);

  const Icon = chapter.icon;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={`group relative w-full cursor-pointer rounded-2xl border p-6 text-left transition-[border-color,background-color] duration-200 ${
          active
            ? "border-(--l-fg-4) bg-(--l-surface)"
            : "border-(--l-border) bg-transparent hover:border-(--l-fg-5) hover:bg-(--l-surface)/40"
        }`}
      >
        {active && (
          <motion.span
            layoutId="story-active-rail"
            transition={{ type: "spring", duration: 0.42, bounce: 0.14 }}
            className="absolute inset-y-4 left-0 w-[2.5px] rounded-full bg-(--l-accent)"
          />
        )}
        <div className="flex items-center gap-2.5 text-xs font-mono text-(--l-fg-3)">
          <span
            className={`grid size-7 place-items-center rounded-lg border transition-colors ${
              active
                ? "border-(--l-accent)/50 bg-(--l-accent)/10 text-(--l-accent)"
                : "border-(--l-border) bg-(--l-surface) text-(--l-fg-3)"
            }`}
          >
            <Icon className="size-3.5" strokeWidth={1.5} />
          </span>
          <span>{chapter.metric}</span>
        </div>

        <h2 className="mt-4 font-display text-balance text-2xl font-semibold leading-[1.08] tracking-[-0.03em] text-(--l-fg) sm:text-[1.75rem]">
          {chapter.title}
        </h2>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-(--l-fg-2) sm:text-[15px]">
          {chapter.body}
        </p>
      </button>

      {/* Mobile inline interactive stage directly under its chapter */}
      <div className="mt-4 lg:hidden">
        {chapter.id === "vm" && <UbuntuStagePanel />}
        {chapter.id === "continuity" && <ContinuityStagePanel />}
        {chapter.id === "waves" && <WavesStagePanel />}
      </div>
    </div>
  );
}

export function LandingFeatures() {
  const [activeStage, setActiveStage] = useState<StoryStageId>("vm");
  const [manualLockUntil, setManualLockUntil] = useState(0);

  const handleSelectManual = (id: StoryStageId) => {
    setActiveStage(id);
    setManualLockUntil(Date.now() + 3000);
  };

  const handleScrollActivate = (id: StoryStageId) => {
    if (Date.now() < manualLockUntil) return;
    setActiveStage(id);
  };

  return (
    <section aria-label="Core workspace capabilities">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <div className="border-t border-(--l-border) py-16 sm:py-24">
          <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
            {/* Left column: scroll-tracked & clickable narrative chapters */}
            <div className="min-w-0 space-y-6 lg:col-span-5 lg:space-y-8">
              {STORY_CHAPTERS.map((chapter) => (
                <StoryChapterTrigger
                  key={chapter.id}
                  chapter={chapter}
                  active={activeStage === chapter.id}
                  onSelect={() => handleSelectManual(chapter.id)}
                  onBecameVisible={() => handleScrollActivate(chapter.id)}
                />
              ))}
            </div>

            {/* Right column (Desktop): Sticky live interactive showcase stage */}
            <div className="hidden min-w-0 lg:sticky lg:top-24 lg:col-span-7 lg:block">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeStage}
                  initial={{ opacity: 0, transform: "translateY(8px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  exit={{ opacity: 0, transform: "translateY(-8px)" }}
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                >
                  {activeStage === "vm" && <UbuntuStagePanel />}
                  {activeStage === "continuity" && <ContinuityStagePanel />}
                  {activeStage === "waves" && <WavesStagePanel />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function UbuntuStagePanel() {
  const prefersReduced = useReducedMotion() ?? false;
  const [view, setView] = useState<"console" | "preview">("console");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [visibleLines, setVisibleLines] = useState(
    prefersReduced ? TERMINAL_LINES.length : 3,
  );
  const [userControlled, setUserControlled] = useState(false);

  useEffect(() => {
    if (prefersReduced) {
      setVisibleLines(TERMINAL_LINES.length);
      return;
    }
    if (userControlled) return;

    const timers: number[] = [];
    const runCycle = () => {
      setView("console");
      setDevice("desktop");
      setVisibleLines(3);
      timers.push(window.setTimeout(() => setVisibleLines(4), 900));
      timers.push(window.setTimeout(() => setVisibleLines(5), 1800));
      timers.push(window.setTimeout(() => setView("preview"), 3200));
      timers.push(window.setTimeout(() => setDevice("mobile"), 5000));
      timers.push(window.setTimeout(() => setDevice("desktop"), 6900));
    };

    runCycle();
    const interval = window.setInterval(runCycle, 8400);
    return () => {
      for (const id of timers) window.clearTimeout(id);
      window.clearInterval(interval);
    };
  }, [prefersReduced, userControlled]);

  const handleSelectView = (next: "console" | "preview") => {
    setUserControlled(true);
    setVisibleLines(TERMINAL_LINES.length);
    setView(next);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-panel) shadow-(--l-window-shadow)">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--l-panel-border) bg-(--l-surface) px-4 py-3 text-xs">
        <div
          role="tablist"
          aria-label="Ubuntu workspace view"
          className="inline-flex rounded-lg border border-(--l-panel-border) bg-(--l-panel) p-0.5"
        >
          {(
            [
              { id: "console", label: "Dev server", icon: Terminal },
              { id: "preview", label: "Live preview", icon: Globe },
            ] as const
          ).map((tab) => {
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleSelectView(tab.id)}
                className={`relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  active
                    ? "text-(--l-panel-fg)"
                    : "text-(--l-panel-fg-3) hover:text-(--l-panel-fg)"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="vm-stage-tab"
                    transition={{
                      type: "spring",
                      duration: 0.34,
                      bounce: 0.14,
                    }}
                    className="absolute inset-0 rounded-md bg-(--l-panel-active)"
                  />
                )}
                <tab.icon
                  className="relative z-10 size-3.5"
                  strokeWidth={1.5}
                />
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {view === "preview" ? (
          <div className="inline-flex items-center gap-1 rounded-md border border-(--l-panel-border) bg-(--l-panel) p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setUserControlled(true);
                setDevice("desktop");
              }}
              className={`inline-flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 transition-colors ${
                device === "desktop"
                  ? "bg-(--l-panel-active) font-medium text-(--l-panel-fg)"
                  : "text-(--l-panel-fg-3)"
              }`}
            >
              <Monitor className="size-3" strokeWidth={1.5} />
              <span>1440px</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setUserControlled(true);
                setDevice("mobile");
              }}
              className={`inline-flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 transition-colors ${
                device === "mobile"
                  ? "bg-(--l-panel-active) font-medium text-(--l-panel-fg)"
                  : "text-(--l-panel-fg-3)"
              }`}
            >
              <Smartphone className="size-3" strokeWidth={1.5} />
              <span>375px</span>
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>ubuntu-24.04 · 18ms</span>
          </span>
        )}
      </div>

      <div className="min-h-[340px] p-5 sm:p-6">
        <AnimatePresence mode="wait" initial={false}>
          {view === "console" ? (
            <motion.div
              key="console"
              initial={{ opacity: 0, transform: "translateY(6px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0, transform: "translateY(-6px)" }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="flex h-full flex-col justify-between gap-5"
            >
              <div className="min-h-[212px] space-y-2.5 rounded-xl border border-(--l-panel-border) bg-(--l-code-bg) p-4 font-mono text-xs leading-relaxed">
                {TERMINAL_LINES.slice(0, visibleLines).map((line) => (
                  <motion.div
                    key={line.text}
                    initial={
                      prefersReduced
                        ? false
                        : { opacity: 0, transform: "translateY(4px)" }
                    }
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                    className={
                      line.kind === "cmd"
                        ? "text-(--l-panel-fg-3)"
                        : line.kind === "url"
                          ? "truncate text-(--l-panel-fg-2)"
                          : "text-(--l-panel-fg)"
                    }
                  >
                    {line.kind === "ok" && (
                      <span className="mr-1.5 text-emerald-600 dark:text-emerald-400">
                        ✓
                      </span>
                    )}
                    {line.kind === "url" && (
                      <span className="mr-1.5 text-(--l-accent)">→</span>
                    )}
                    <span>{line.text}</span>
                  </motion.div>
                ))}
                {!prefersReduced && (
                  <div className="flex items-center gap-1.5 pt-1 text-(--l-panel-fg-3)">
                    <span>$</span>
                    <span
                      aria-hidden="true"
                      className="inline-block h-3.5 w-1.5 animate-[pulse_1.1s_steps(2)_infinite] bg-(--l-accent)"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-(--l-panel-fg-3)">
                <span>Isolated network · auto-suspend on idle</span>
                <button
                  type="button"
                  onClick={() => handleSelectView("preview")}
                  className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-(--l-panel-fg) transition-opacity hover:opacity-80"
                >
                  <span>Inspect live preview</span>
                  <Globe className="size-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0, transform: "translateY(6px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0, transform: "translateY(-6px)" }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="flex flex-col items-center justify-center py-2"
            >
              <motion.div
                layout
                transition={{ duration: 0.36, ease: EASE_OUT }}
                className={`w-full rounded-xl border border-(--l-panel-border) bg-(--l-surface) p-5 ${
                  device === "mobile" ? "max-w-[272px]" : "max-w-full"
                }`}
              >
                <div className="flex items-center justify-between border-b border-(--l-panel-border) pb-3">
                  <span className="truncate font-mono text-[11px] text-(--l-panel-fg-2)">
                    https://preview-3000.entryagents.app
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-emerald-600 dark:text-emerald-400">
                    200 OK
                  </span>
                </div>
                <div className="mt-4 space-y-2.5">
                  <div className="text-base font-semibold tracking-tight text-(--l-panel-fg)">
                    Your cloud workspace is ready
                  </div>
                  <p className="text-xs leading-relaxed text-(--l-panel-fg-2)">
                    Preview responsive desktop and mobile viewports directly
                    from the running dev server inside your session.
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                    <span className="inline-flex h-8 items-center rounded-lg bg-(--l-btn-bg) px-3.5 text-xs font-medium text-(--l-btn-fg)">
                      Open workspace
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-(--l-panel-fg-3)">
                      {device === "mobile"
                        ? "375px · 0 overflow"
                        : "1440px · 0 overflow"}
                    </span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ContinuityStagePanel() {
  const prefersReduced = useReducedMotion() ?? false;
  const [activePhase, setActivePhase] = useState(prefersReduced ? 2 : 0);
  const [autoPlay, setAutoPlay] = useState(true);

  useEffect(() => {
    if (prefersReduced) {
      setActivePhase(2);
      return;
    }
    if (!autoPlay) return;

    const timer = window.setInterval(() => {
      setActivePhase((prev) => (prev + 1) % CONTINUITY_PHASES.length);
    }, 2100);
    return () => window.clearInterval(timer);
  }, [autoPlay, prefersReduced]);

  const progressPct = CONTINUITY_PHASES[activePhase]?.progress ?? 100;

  return (
    <div className="overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-panel) shadow-(--l-window-shadow)">
      <div className="flex items-center justify-between gap-2 border-b border-(--l-panel-border) bg-(--l-surface) px-4 py-3 text-xs">
        <span className="inline-flex items-center gap-2 font-medium text-(--l-panel-fg)">
          <Laptop
            className="size-3.5 text-(--l-panel-fg-3)"
            strokeWidth={1.5}
          />
          <span>Server-checkpointed handoff</span>
        </span>
        <button
          type="button"
          onClick={() => {
            setActivePhase(0);
            setAutoPlay(true);
          }}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-(--l-panel-border) bg-(--l-panel) px-2.5 py-1 text-[11px] font-medium text-(--l-panel-fg-2) transition-colors hover:text-(--l-panel-fg)"
        >
          <RotateCcw className="size-3" strokeWidth={1.5} />
          <span>Simulate laptop close</span>
        </button>
      </div>

      {/* Live animated checkpoint completion bar */}
      <div className="h-[2px] w-full bg-(--l-panel-border)">
        <motion.div
          className="h-full bg-(--l-accent)"
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
        />
      </div>

      <div className="min-h-[340px] divide-y divide-(--l-panel-border) p-3">
        {CONTINUITY_PHASES.map((phase, idx) => {
          const reached = idx <= activePhase;
          const current = idx === activePhase;
          const Icon = phase.icon;
          return (
            <button
              key={phase.id}
              type="button"
              onClick={() => {
                setAutoPlay(false);
                setActivePhase(idx);
              }}
              className="relative flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl px-4 py-5 text-left transition-colors duration-200 hover:bg-(--l-panel-surface)/50"
            >
              {current && (
                <motion.span
                  layoutId="continuity-stage-phase"
                  transition={{ type: "spring", duration: 0.4, bounce: 0.14 }}
                  className="absolute inset-0 rounded-xl bg-(--l-panel-surface)"
                />
              )}
              <div className="relative z-10 flex min-w-0 items-start gap-3.5">
                <span
                  className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200 ${
                    current
                      ? "border-(--l-accent)/50 bg-(--l-accent)/10 text-(--l-accent)"
                      : reached
                        ? "border-(--l-panel-border) bg-(--l-surface) text-(--l-panel-fg)"
                        : "border-(--l-panel-border) bg-transparent text-(--l-panel-fg-4)"
                  }`}
                >
                  <Icon className="size-4" strokeWidth={1.5} />
                </span>
                <div className="min-w-0">
                  <div
                    className={`text-sm font-medium ${
                      reached ? "text-(--l-panel-fg)" : "text-(--l-panel-fg-3)"
                    }`}
                  >
                    {phase.title}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-(--l-panel-fg-3)">
                    {phase.detail}
                  </div>
                </div>
              </div>

              <span
                className={`relative z-10 shrink-0 font-mono text-xs tabular-nums transition-opacity duration-200 ${
                  current
                    ? "text-(--l-accent)"
                    : reached
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-(--l-panel-fg-4)"
                }`}
              >
                {phase.badge}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WavesStagePanel() {
  const prefersReduced = useReducedMotion() ?? false;
  const [mode, setMode] = useState<"waves" | "direct">("waves");
  const [userSelected, setUserSelected] = useState(false);

  useEffect(() => {
    if (prefersReduced || userSelected) return;
    const id = window.setInterval(() => {
      setMode((prev) => (prev === "waves" ? "direct" : "waves"));
    }, 5200);
    return () => window.clearInterval(id);
  }, [prefersReduced, userSelected]);

  return (
    <div className="overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-panel) shadow-(--l-window-shadow)">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--l-panel-border) bg-(--l-surface) px-4 py-3">
        <div
          role="tablist"
          aria-label="Execution mode"
          className="inline-flex rounded-lg border border-(--l-panel-border) bg-(--l-panel) p-0.5"
        >
          {(
            [
              { id: "waves", label: "Parallel waves" },
              { id: "direct", label: "Direct pass" },
            ] as const
          ).map((tab) => {
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setUserSelected(true);
                  setMode(tab.id);
                }}
                className={`relative inline-flex h-7 cursor-pointer items-center rounded-md px-3 text-xs font-medium transition-colors ${
                  active
                    ? "text-(--l-panel-fg)"
                    : "text-(--l-panel-fg-3) hover:text-(--l-panel-fg)"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="waves-stage-tab"
                    transition={{
                      type: "spring",
                      duration: 0.34,
                      bounce: 0.14,
                    }}
                    className="absolute inset-0 rounded-md bg-(--l-panel-active)"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <span className="font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
          {mode === "waves" ? "2 builders · 0 conflicts" : "1 pass · 2m 42s"}
        </span>
      </div>

      <div className="h-[1.5px] w-full bg-(--l-panel-border)">
        {!prefersReduced && !userSelected ? (
          <motion.div
            key={mode}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 5.2, ease: "linear" }}
            style={{ transformOrigin: "left" }}
            className="h-full bg-(--l-accent)"
          />
        ) : null}
      </div>

      <div className="flex min-h-[340px] items-center p-5 sm:p-6">
        <AnimatePresence mode="wait" initial={false}>
          {mode === "waves" ? (
            <motion.div
              key="waves"
              initial={{ opacity: 0, transform: "translateY(6px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0, transform: "translateY(-6px)" }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="grid w-full items-center gap-3 xl:grid-cols-[1fr_40px_1.35fr_40px_1fr]"
            >
              <div className="rounded-xl border border-(--l-panel-border) bg-(--l-surface) p-4">
                <div className="font-mono text-[11px] text-(--l-accent)">
                  Scout &amp; contract
                </div>
                <div className="mt-1.5 text-sm font-semibold text-(--l-panel-fg)">
                  Lock shared types
                </div>
                <p className="mt-1 text-xs leading-relaxed text-(--l-panel-fg-3)">
                  Maps touched files and freezes schemas before editing.
                </p>
              </div>

              <svg
                viewBox="0 0 40 80"
                className="hidden h-20 w-10 xl:block"
                aria-hidden="true"
              >
                <path
                  id="wave-in-top"
                  d="M0 40 C18 40, 20 18, 40 18"
                  fill="none"
                  stroke="var(--l-panel-border)"
                  strokeWidth="1.5"
                />
                <path
                  id="wave-in-bot"
                  d="M0 40 C18 40, 20 62, 40 62"
                  fill="none"
                  stroke="var(--l-panel-border)"
                  strokeWidth="1.5"
                />
                <path
                  d="M0 40 C18 40, 20 18, 40 18"
                  fill="none"
                  stroke="var(--l-accent)"
                  strokeWidth="1.5"
                  className="entry-flow-dash"
                />
                <path
                  d="M0 40 C18 40, 20 62, 40 62"
                  fill="none"
                  stroke="var(--l-accent)"
                  strokeWidth="1.5"
                  className="entry-flow-dash"
                />
                {!prefersReduced && (
                  <>
                    <circle r="2.6" fill="var(--l-accent)">
                      <animateMotion dur="1.8s" repeatCount="indefinite">
                        <mpath href="#wave-in-top" />
                      </animateMotion>
                    </circle>
                    <circle r="2.6" fill="var(--l-accent)">
                      <animateMotion
                        dur="1.8s"
                        begin="0.6s"
                        repeatCount="indefinite"
                      >
                        <mpath href="#wave-in-bot" />
                      </animateMotion>
                    </circle>
                  </>
                )}
              </svg>

              <div className="space-y-3">
                <div className="rounded-xl border border-(--l-panel-border) bg-(--l-surface) p-3.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-(--l-panel-fg)">
                      <GitBranch
                        className="size-3.5 shrink-0 text-(--l-accent)"
                        strokeWidth={1.5}
                      />
                      <span className="truncate">
                        api/webhooks/billing/route.ts
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                      +41 -8
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-(--l-panel-fg-3)">
                    Isolated file claim · API validation
                  </div>
                </div>

                <div className="rounded-xl border border-(--l-panel-border) bg-(--l-surface) p-3.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-(--l-panel-fg)">
                      <GitBranch
                        className="size-3.5 shrink-0 text-(--l-accent)"
                        strokeWidth={1.5}
                      />
                      <span className="truncate">lib/email/welcome.tsx</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                      +92 -0
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-(--l-panel-fg-3)">
                    Isolated file claim · UI template
                  </div>
                </div>
              </div>

              <svg
                viewBox="0 0 40 80"
                className="hidden h-20 w-10 xl:block"
                aria-hidden="true"
              >
                <path
                  id="wave-out-top"
                  d="M0 18 C20 18, 22 40, 40 40"
                  fill="none"
                  stroke="var(--l-panel-border)"
                  strokeWidth="1.5"
                />
                <path
                  id="wave-out-bot"
                  d="M0 62 C20 62, 22 40, 40 40"
                  fill="none"
                  stroke="var(--l-panel-border)"
                  strokeWidth="1.5"
                />
                <path
                  d="M0 18 C20 18, 22 40, 40 40"
                  fill="none"
                  stroke="var(--l-accent)"
                  strokeWidth="1.5"
                  className="entry-flow-dash"
                />
                <path
                  d="M0 62 C20 62, 22 40, 40 40"
                  fill="none"
                  stroke="var(--l-accent)"
                  strokeWidth="1.5"
                  className="entry-flow-dash"
                />
                {!prefersReduced && (
                  <>
                    <circle r="2.6" fill="#10b981">
                      <animateMotion
                        dur="1.8s"
                        begin="0.4s"
                        repeatCount="indefinite"
                      >
                        <mpath href="#wave-out-top" />
                      </animateMotion>
                    </circle>
                    <circle r="2.6" fill="#10b981">
                      <animateMotion
                        dur="1.8s"
                        begin="1.0s"
                        repeatCount="indefinite"
                      >
                        <mpath href="#wave-out-bot" />
                      </animateMotion>
                    </circle>
                  </>
                )}
              </svg>

              <div className="rounded-xl border border-(--l-panel-border) bg-(--l-surface) p-4">
                <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" strokeWidth={1.5} />
                  <span>Verified build</span>
                </div>
                <div className="mt-1.5 text-sm font-semibold text-(--l-panel-fg)">
                  Typecheck &amp; 14 tests green
                </div>
                <p className="mt-1 text-xs leading-relaxed text-(--l-panel-fg-3)">
                  Zero merge conflicts across parallel edits before pushing.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="direct"
              initial={{ opacity: 0, transform: "translateY(6px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0, transform: "translateY(-6px)" }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="grid w-full items-center gap-4 sm:grid-cols-3"
            >
              <div className="rounded-xl border border-(--l-panel-border) bg-(--l-surface) p-4">
                <div className="font-mono text-[11px] text-(--l-panel-fg-3)">
                  Inspect
                </div>
                <div className="mt-1.5 text-sm font-semibold text-(--l-panel-fg)">
                  Reproduce failing route
                </div>
                <p className="mt-1 text-xs text-(--l-panel-fg-3)">
                  Traces auth callback origin handling inside the workspace.
                </p>
              </div>

              <div className="rounded-xl border border-(--l-panel-border) bg-(--l-surface) p-4">
                <div className="font-mono text-[11px] text-(--l-accent)">
                  Minimal patch
                </div>
                <div className="mt-1.5 font-mono text-xs font-medium text-(--l-panel-fg)">
                  lib/auth/config.ts
                </div>
                <p className="mt-1 font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                  +18 -6 · regression test added
                </p>
              </div>

              <div className="rounded-xl border border-(--l-panel-border) bg-(--l-surface) p-4">
                <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" strokeWidth={1.5} />
                  <span>Merged · PR #319</span>
                </div>
                <div className="mt-1.5 text-sm font-semibold text-(--l-panel-fg)">
                  Finished in 2m 42s
                </div>
                <p className="mt-1 text-xs text-(--l-panel-fg-3)">
                  Zero extra orchestration overhead on focused fixes.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
