"use client";

import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderGit2,
  GitFork,
  PanelLeft,
  Paperclip,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EntryMark } from "@/components/entry-mark";
import { WorkspaceInspectorPane } from "./workspace-inspector-pane";
import {
  type InspectorTab,
  PREVIEW_SCENARIOS,
  type ScenarioId,
  SIDEBAR_CHATS,
  SIDEBAR_PROJECTS,
  USAGE_WINDOWS,
} from "./workspace-preview-data";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function AppMockup() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("resend");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("diff");
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobilePane, setMobilePane] = useState<"chat" | "inspector">("chat");

  const scenario = PREVIEW_SCENARIOS[scenarioId];

  const handleSelectScenario = (nextId: ScenarioId) => {
    setScenarioId(nextId);
    setStepsExpanded(false);
    setCopied(false);
  };

  const openInspectorTab = (tab: InspectorTab) => {
    setInspectorTab(tab);
    setMobilePane("inspector");
  };

  const handleCopy = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const ringCircumference = 40.84;
  const ringOffset = ringCircumference * (1 - scenario.contextPct / 100);

  return (
    <div
      aria-label="Interactive Entry workspace preview"
      className="min-w-0 rounded-[20px] border border-(--l-border) bg-(--l-surface)/55 p-1.5 shadow-(--l-window-shadow) backdrop-blur-md"
    >
      <div className="min-w-0 overflow-hidden rounded-[14px] border border-(--l-panel-border) bg-(--l-panel)">
        <div className="grid min-w-0 md:grid-cols-[minmax(0,1fr)_336px] lg:grid-cols-[232px_minmax(0,1fr)_364px]">
          {/* Left Sidebar — 1:1 mirror of the PR #324 Entry sidebar */}
          <aside
            aria-label="Workspace sidebar preview"
            className="hidden min-w-0 flex-col border-r border-(--l-panel-border) bg-(--l-surface) lg:flex"
          >
            {/* Header */}
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-(--l-panel-border) px-3">
              <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-tight text-(--l-panel-fg)">
                <EntryMark className="size-4 shrink-0" />
                <span>Entry</span>
              </span>
              <div className="flex items-center gap-1 text-(--l-panel-fg-3)">
                <span className="inline-flex size-6 items-center justify-center rounded-md">
                  <Plus className="size-3.5" strokeWidth={1.6} />
                </span>
                <span className="inline-flex size-6 items-center justify-center rounded-md">
                  <PanelLeft className="size-3.5" strokeWidth={1.5} />
                </span>
              </div>
            </div>

            {/* Projects & Chats */}
            <div className="flex-1 space-y-4 overflow-hidden px-2 py-2.5">
              {/* Projects */}
              <div>
                <div className="flex h-7 items-center justify-between px-2 text-[11px] font-medium text-(--l-panel-fg-3)">
                  <span>Projects</span>
                  <span className="font-mono text-[10px] tabular-nums opacity-70">
                    {SIDEBAR_PROJECTS.length}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {SIDEBAR_PROJECTS.map((project) => (
                    <div key={project.name}>
                      <div className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-(--l-panel-fg)">
                        {project.expanded ? (
                          <ChevronDown
                            className="size-3 shrink-0 text-(--l-panel-fg-3)"
                            strokeWidth={1.75}
                          />
                        ) : (
                          <ChevronRight
                            className="size-3 shrink-0 text-(--l-panel-fg-3)"
                            strokeWidth={1.75}
                          />
                        )}
                        {project.expanded ? (
                          <FolderGit2
                            className="size-3.5 shrink-0 text-(--l-panel-fg-2)"
                            strokeWidth={1.5}
                          />
                        ) : (
                          <Folder
                            className="size-3.5 shrink-0 text-(--l-panel-fg-3)"
                            strokeWidth={1.5}
                          />
                        )}
                        <span className="truncate">{project.name}</span>
                      </div>

                      {project.expanded && project.chats.length > 0 && (
                        <div className="ml-[13px] mt-0.5 space-y-0.5 border-l border-(--l-panel-border) pl-2">
                          {project.chats.map((chat) => {
                            const active = chat.id === scenarioId;
                            return (
                              <button
                                key={chat.id}
                                type="button"
                                onClick={() => handleSelectScenario(chat.id)}
                                className={`flex h-7 w-full cursor-pointer items-center rounded-md px-2 text-left text-[12px] transition-colors duration-150 ${
                                  active
                                    ? "bg-(--l-panel-active) font-medium text-(--l-panel-fg)"
                                    : "text-(--l-panel-fg-2) hover:bg-(--l-panel-surface) hover:text-(--l-panel-fg)"
                                }`}
                              >
                                <span className="truncate">{chat.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Chats */}
              <div>
                <div className="flex h-7 items-center justify-between px-2 text-[11px] font-medium text-(--l-panel-fg-3)">
                  <span>Chats</span>
                </div>
                <div className="space-y-0.5">
                  {SIDEBAR_CHATS.map((chat) => {
                    const active = chat.id === scenarioId;
                    const interactive = Boolean(chat.id);
                    return (
                      <button
                        key={chat.title}
                        type="button"
                        disabled={!interactive}
                        onClick={() => {
                          if (chat.id) handleSelectScenario(chat.id);
                        }}
                        className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition-colors duration-150 ${
                          interactive ? "cursor-pointer" : "cursor-default"
                        } ${
                          active
                            ? "bg-(--l-panel-active) font-medium text-(--l-panel-fg)"
                            : interactive
                              ? "text-(--l-panel-fg-2) hover:bg-(--l-panel-surface) hover:text-(--l-panel-fg)"
                              : "text-(--l-panel-fg-3)"
                        }`}
                      >
                        {chat.unread && !active && (
                          <span className="size-1.5 shrink-0 rounded-full bg-(--l-accent)" />
                        )}
                        <span className="truncate">{chat.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* PR #324 Horizontal Usage Card */}
            <div className="border-t border-(--l-panel-border) p-2.5">
              <div className="rounded-lg border border-(--l-panel-border) bg-(--l-panel) px-2.5 py-2">
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="font-medium text-(--l-panel-fg)">
                    Builder
                  </span>
                  <span className="font-mono text-[11px] font-medium tabular-nums text-(--l-panel-fg-2)">
                    $21.40 left
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {USAGE_WINDOWS.map((win) => (
                    <div
                      key={win.label}
                      className="grid grid-cols-[24px_1fr_28px] items-center gap-2 text-[10px] tabular-nums"
                    >
                      <span className="text-(--l-panel-fg-3)">{win.label}</span>
                      <div className="h-[3px] w-full overflow-hidden rounded-full bg-(--l-panel-border)">
                        <div
                          className="h-full rounded-full bg-(--l-panel-fg)/75"
                          style={{ width: `${win.pct}%` }}
                        />
                      </div>
                      <span className="text-right font-mono text-(--l-panel-fg-3)">
                        {win.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

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
                    onClick={() => setMobilePane("inspector")}
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
              <AnimatePresence mode="wait">
                <motion.div
                  key={scenario.id}
                  initial={{ opacity: 0, transform: "translateY(4px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  exit={{ opacity: 0, transform: "translateY(-4px)" }}
                  transition={{ duration: 0.16, ease: EASE_OUT }}
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
                        onClick={() => setStepsExpanded((prev) => !prev)}
                        className="inline-flex cursor-pointer items-center gap-1.5 text-xs tabular-nums text-(--l-panel-fg-3) transition-colors hover:text-(--l-panel-fg)"
                      >
                        {stepsExpanded ? (
                          <ChevronDown className="size-3.5" strokeWidth={1.5} />
                        ) : (
                          <ChevronRight
                            className="size-3.5"
                            strokeWidth={1.5}
                          />
                        )}
                        <span>{scenario.workedLabel}</span>
                      </button>

                      {stepsExpanded && (
                        <div className="mt-2 space-y-1 border-l border-(--l-panel-border) pl-3 font-mono text-[11px] tabular-nums">
                          {scenario.steps.map((step) => (
                            <div
                              key={step.id}
                              className="flex items-center justify-between gap-3 py-0.5 text-(--l-panel-fg-2)"
                            >
                              <span className="min-w-0 truncate">
                                <span className="text-(--l-accent)">
                                  {step.tool}
                                </span>{" "}
                                <span>{step.detail}</span>
                              </span>
                              <span className="shrink-0 text-(--l-panel-fg-4)">
                                {step.duration}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

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
              onSelectTab={setInspectorTab}
              scenario={scenario}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
