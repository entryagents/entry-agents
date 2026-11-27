"use client";

import {
  CheckCircle2,
  ExternalLink,
  FileDiff,
  Gauge,
  GitBranch,
  Globe,
  RefreshCw,
} from "lucide-react";
import type { InspectorTab, PreviewScenario } from "./workspace-preview-data";

interface WorkspaceInspectorPaneProps {
  readonly activeTab: InspectorTab;
  readonly onSelectTab: (tab: InspectorTab) => void;
  readonly scenario: PreviewScenario;
}

export function WorkspaceInspectorPane({
  activeTab,
  onSelectTab,
  scenario,
}: WorkspaceInspectorPaneProps) {
  const tabs: readonly {
    readonly id: InspectorTab;
    readonly label: string;
    readonly badge?: string;
  }[] = [
    { id: "diff", label: "Diff", badge: String(scenario.filesChangedCount) },
    { id: "preview", label: "Preview" },
    { id: "context", label: "Context" },
  ];

  return (
    <div className="flex min-h-[470px] min-w-0 flex-col bg-(--l-panel) lg:min-h-0">
      {/* Rail tab bar matching Entry workspace inspector */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-(--l-panel-border) px-3">
        <div
          role="tablist"
          aria-label="Workspace inspector"
          className="flex items-center gap-1"
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectTab(tab.id)}
                className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150 ${
                  active
                    ? "bg-(--l-panel-active) text-(--l-panel-fg)"
                    : "text-(--l-panel-fg-3) hover:bg-(--l-panel-surface) hover:text-(--l-panel-fg)"
                }`}
              >
                {tab.id === "diff" && (
                  <FileDiff className="size-3.5 shrink-0" strokeWidth={1.5} />
                )}
                {tab.id === "preview" && (
                  <Globe className="size-3.5 shrink-0" strokeWidth={1.5} />
                )}
                {tab.id === "context" && (
                  <Gauge className="size-3.5 shrink-0" strokeWidth={1.5} />
                )}
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="font-mono text-[11px] tabular-nums text-(--l-panel-fg-3)">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <span className="hidden shrink-0 items-center gap-1 font-mono text-[11px] tabular-nums text-(--l-panel-fg-3) xl:inline-flex">
          <GitBranch className="size-3 shrink-0" strokeWidth={1.5} />
          <span>{scenario.prTag}</span>
        </span>
      </div>

      {/* Tab Body */}
      <div className="flex flex-1 flex-col overflow-hidden p-3.5">
        {activeTab === "diff" && <DiffTabContent scenario={scenario} />}
        {activeTab === "preview" && <PreviewTabContent scenario={scenario} />}
        {activeTab === "context" && <ContextTabContent scenario={scenario} />}
      </div>
    </div>
  );
}

function DiffTabContent({ scenario }: { readonly scenario: PreviewScenario }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-mono text-(--l-panel-fg-2)">
          {scenario.activeDiffPath}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">
            +{scenario.totalAdded}
          </span>{" "}
          <span className="text-rose-600 dark:text-rose-400">
            -{scenario.totalRemoved}
          </span>
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-(--l-panel-border) bg-(--l-code-bg) py-2 font-mono text-[11px] leading-[1.55] tabular-nums">
        {scenario.diffLines.map((line, index) => {
          const isAdd = line.kind === "add";
          const isDel = line.kind === "del";
          return (
            <div
              key={`${line.lineNo}-${index}`}
              className={`flex items-baseline gap-2.5 px-2.5 ${
                isAdd
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : isDel
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                    : "text-(--l-panel-fg-3)"
              }`}
            >
              <span className="w-5 shrink-0 select-none text-right text-[10px] opacity-55">
                {line.lineNo}
              </span>
              <span className="w-2.5 shrink-0 select-none">
                {isAdd ? "+" : isDel ? "-" : " "}
              </span>
              <span className="whitespace-pre">{line.text}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-auto space-y-1 border-t border-(--l-panel-border) pt-3">
        {scenario.diffFiles.map((file) => (
          <div
            key={file.path}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-(--l-panel-surface)"
          >
            <span className="min-w-0 truncate font-mono text-(--l-panel-fg-2)">
              {file.path}
            </span>
            <span className="shrink-0 font-mono tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">
                +{file.added}
              </span>
              {file.removed > 0 && (
                <span className="ml-1.5 text-rose-600 dark:text-rose-400">
                  -{file.removed}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewTabContent({
  scenario,
}: {
  readonly scenario: PreviewScenario;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-(--l-panel-border) bg-(--l-panel-surface) px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
          <span className="truncate font-mono text-[11px] text-(--l-panel-fg-2)">
            {scenario.previewUrl}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-(--l-panel-fg-3)">
          <span className="font-mono text-[10px] tabular-nums text-emerald-600 dark:text-emerald-400">
            200 OK
          </span>
          <ExternalLink className="size-3" strokeWidth={1.5} />
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between rounded-lg border border-(--l-panel-border) bg-(--l-surface) p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-(--l-panel-border) pb-3">
            <div className="text-xs font-semibold text-(--l-panel-fg)">
              Entry Agents
            </div>
            <span className="font-mono text-[10px] text-(--l-panel-fg-3)">
              {scenario.previewTag}
            </span>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="text-sm font-semibold tracking-tight text-(--l-panel-fg)">
              {scenario.previewHeading}
            </div>
            <p className="text-xs leading-relaxed text-(--l-panel-fg-2)">
              {scenario.previewBody}
            </p>
          </div>

          <div className="pt-1">
            <span className="inline-flex h-7 items-center rounded-md bg-(--l-btn-bg) px-3 text-[11px] font-medium text-(--l-btn-fg)">
              {scenario.previewCta}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-(--l-panel-border) pt-3 text-[11px] text-(--l-panel-fg-3)">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2
              className="size-3.5 text-emerald-500"
              strokeWidth={1.5}
            />
            <span>{scenario.previewMeta}</span>
          </span>
          <span className="font-mono tabular-nums">
            {scenario.previewLatency}
          </span>
        </div>
      </div>
    </div>
  );
}

function ContextTabContent({
  scenario,
}: {
  readonly scenario: PreviewScenario;
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const fillRatio = scenario.contextPct / 100;
  const dashOffset = circumference * (1 - fillRatio);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-(--l-panel-fg)">
          {scenario.modelFull}
        </span>
        <RefreshCw
          className="size-3.5 text-(--l-panel-fg-3)"
          strokeWidth={1.5}
        />
      </div>

      <div className="rounded-xl border border-(--l-panel-border) bg-(--l-panel-surface) p-4">
        <div className="flex items-center gap-4">
          <svg
            viewBox="0 0 84 84"
            className="size-[74px] shrink-0 -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="42"
              cy="42"
              r={radius}
              fill="none"
              stroke="var(--l-panel-border)"
              strokeWidth="6.5"
            />
            <circle
              cx="42"
              cy="42"
              r={radius}
              fill="none"
              stroke="var(--l-panel-fg)"
              strokeWidth="6.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="min-w-0">
            <div className="text-2xl font-semibold tracking-tight tabular-nums text-(--l-panel-fg)">
              {scenario.contextPct}
              <span className="text-sm font-normal text-(--l-panel-fg-3)">
                %
              </span>
            </div>
            <div className="mt-0.5 text-xs font-medium tabular-nums text-(--l-panel-fg-2)">
              {scenario.contextUsed}
            </div>
            <div className="text-[11px] tabular-nums text-(--l-panel-fg-3)">
              {scenario.contextLeft}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-1.5 border-t border-(--l-panel-border) pt-3 text-[11px] tabular-nums">
          <div className="flex items-center justify-between text-(--l-panel-fg-2)">
            <span>Autocompact buffer</span>
            <span className="font-mono text-(--l-panel-fg-3)">20.0k · 2%</span>
          </div>
          <div className="flex items-center justify-between text-(--l-panel-fg-2)">
            <span>Free space</span>
            <span className="font-mono text-(--l-panel-fg-3)">
              {scenario.contextFreePct}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-auto">
        <div className="mb-2 text-xs font-medium text-(--l-panel-fg-2)">
          This session
        </div>
        <div className="grid grid-cols-3 gap-2">
          {scenario.contextStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-(--l-panel-border) bg-(--l-panel-surface) px-2.5 py-2"
            >
              <div className="text-xs font-semibold tabular-nums text-(--l-panel-fg)">
                {stat.value}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-(--l-panel-fg-3)">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
