"use client";

import {
  ChevronDown,
  Cloud,
  FolderPlus,
  Loader2,
  PanelLeft,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { EntryMark } from "@/components/entry-mark";
import {
  type ScenarioId,
  SIDEBAR_CHATS,
  SIDEBAR_PROJECTS,
  USAGE_WINDOWS,
} from "./workspace-preview-data";

interface WorkspaceSidebarPreviewProps {
  readonly activeScenarioId: ScenarioId;
  readonly isStreamingActive: boolean;
  readonly onSelectScenario: (id: ScenarioId) => void;
}

export function WorkspaceSidebarPreview({
  activeScenarioId,
  isStreamingActive,
  onSelectScenario,
}: WorkspaceSidebarPreviewProps) {
  const [expandedProjects, setExpandedProjects] = useState<
    Record<string, boolean>
  >(() =>
    Object.fromEntries(
      SIDEBAR_PROJECTS.map((project) => [
        project.name,
        project.defaultExpanded,
      ]),
    ),
  );

  const toggleProject = (name: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [name]: !(prev[name] ?? false),
    }));
  };

  return (
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

      {/* Projects & Chats — 1:1 mirror of the Entry sidebar */}
      <div className="flex-1 space-y-4 overflow-hidden px-2 py-2.5">
        {/* Projects */}
        <div>
          <div className="mb-1 flex h-7 items-center justify-between px-1.5 text-[11.5px] font-medium text-(--l-panel-fg-3)">
            <span className="inline-flex items-center gap-1">
              <span>Projects</span>
              <ChevronDown className="size-3 opacity-70" strokeWidth={1.6} />
            </span>
            <FolderPlus className="size-3.5 opacity-75" strokeWidth={1.5} />
          </div>

          <div className="space-y-1">
            {SIDEBAR_PROJECTS.map((project) => {
              const isExpanded = expandedProjects[project.name] ?? false;
              const containsActive = project.chats.some(
                (chat) => chat.id === activeScenarioId,
              );

              return (
                <div key={project.name}>
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleProject(project.name)}
                    className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-[12px] transition-colors duration-150 hover:bg-(--l-panel-surface)"
                  >
                    <Cloud
                      className={`size-3.5 shrink-0 ${
                        containsActive || isExpanded
                          ? "text-(--l-panel-fg-2)"
                          : "text-(--l-panel-fg-3)"
                      }`}
                      strokeWidth={1.5}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate ${
                        containsActive || isExpanded
                          ? "text-(--l-panel-fg-2)"
                          : "text-(--l-panel-fg-3)"
                      }`}
                    >
                      {project.name}
                    </span>
                  </button>

                  {isExpanded && project.chats.length > 0 && (
                    <div className="mt-0.5 space-y-0.5 pl-3.5">
                      {project.chats.map((chat) => {
                        const active = chat.id === activeScenarioId;
                        const interactive = Boolean(chat.id);
                        return (
                          <button
                            key={chat.title}
                            type="button"
                            disabled={!interactive}
                            onClick={() => {
                              if (chat.id) onSelectScenario(chat.id);
                            }}
                            className={`flex h-7 w-full items-center gap-1.5 rounded-xl border px-2 text-left text-[12px] transition-[background-color,border-color,color] duration-150 ${
                              interactive ? "cursor-pointer" : "cursor-default"
                            } ${
                              active
                                ? "border-(--l-panel-border) bg-(--l-panel-active) font-medium text-(--l-panel-fg)"
                                : interactive
                                  ? "border-transparent text-(--l-panel-fg-2) hover:bg-(--l-panel-surface) hover:text-(--l-panel-fg)"
                                  : "border-transparent text-(--l-panel-fg-3)"
                            }`}
                          >
                            {active && isStreamingActive && (
                              <Loader2
                                className="size-3 shrink-0 animate-spin text-(--l-panel-fg-3)"
                                strokeWidth={1.6}
                              />
                            )}
                            <span className="min-w-0 flex-1 truncate">
                              {chat.title}
                            </span>
                            {chat.unread && !active ? (
                              <span
                                className="mr-0.5 size-2 shrink-0 rounded-full bg-blue-500 ring-4 ring-blue-500/20"
                                aria-label="Unread activity"
                              />
                            ) : (
                              <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-(--l-panel-fg-3)">
                                {chat.age}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Standalone Chats */}
        <div>
          <div className="mb-0.5 flex h-6 items-center px-2 text-[11px] font-medium text-(--l-panel-fg-3)">
            <span>Chats</span>
          </div>
          <div className="space-y-0.5">
            {SIDEBAR_CHATS.map((chat) => (
              <div
                key={chat.title}
                className="flex h-7 items-center gap-1.5 rounded-xl px-2 text-[12px] text-(--l-panel-fg-3)"
              >
                <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-(--l-panel-fg-3)">
                  {chat.age}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PR #324 Horizontal Usage Card */}
      <div className="border-t border-(--l-panel-border) p-2.5">
        <div className="rounded-lg border border-(--l-panel-border) bg-(--l-panel) px-2.5 py-2">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="font-medium text-(--l-panel-fg)">Builder</span>
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
  );
}
