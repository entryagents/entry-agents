"use client";

import "./agents.css";
import { Check, Loader2, Square, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { SubagentIcon, useNow } from "@/components/team/subagent-helpers";
import { ModelsTab } from "@/components/team/team-workspace";
import {
  deriveAgentHubRoster,
  isLiveStatus,
  type AgentHubEntry,
} from "@/lib/agent-hub/derive-roster";
import type { ModelOption } from "@/lib/model-options";
import { WorkspaceAgentDetail } from "./workspace-agent-detail";

export interface WorkspaceAgentsTabProps {
  messages: WebAgentUIMessage[];
  isParentStreaming: boolean;
  defaultModelId: string;
  teamRoleModels: Record<string, string>;
  onUpdateRoleModel: (role: string, modelId: string | null) => void;
  modelOptions: ModelOption[];
  isFreeTierLocked: boolean;
  freePlanModelId: string;
  freeTierAllowedModelIds: string[];
  onSelectSubagent: (
    toolCallId: string,
    title?: string,
    subagentType?: string,
  ) => void;
  onStopRun: () => void;
  onClosePanel?: () => void;
}

type AgentsSubView = "agents" | "models";

function shortDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function promptFirstLine(text: string): string {
  const line = text.trim().split("\n")[0]?.trim() || "";
  return line.length > 72 ? `${line.slice(0, 69)}...` : line;
}

function userPromptBeforeMessage(
  messages: WebAgentUIMessage[],
  assistantMessageId: string,
): { key: string; label: string } {
  const idx = messages.findIndex((m) => m.id === assistantMessageId);
  if (idx > 0) {
    for (let i = idx - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === "user") {
        const text = m.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(" ")
          .trim();
        return {
          key: m.id,
          label: promptFirstLine(text) || "Earlier",
        };
      }
    }
  }
  return { key: "earlier", label: "Earlier" };
}

function revealToolInConversation(
  toolCallId: string,
  onClosePanel?: () => void,
) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(max-width: 1023px)").matches && onClosePanel) {
    onClosePanel();
  }
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-tool-call-id="${CSS.escape(toolCallId)}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add(
      "ring-2",
      "ring-foreground/25",
      "bg-muted/40",
      "rounded-lg",
    );
    window.setTimeout(() => {
      el.classList.remove(
        "ring-2",
        "ring-foreground/25",
        "bg-muted/40",
        "rounded-lg",
      );
    }, 1500);
  });
}

function liveActivityText(entry: AgentHubEntry): string {
  if (entry.status === "awaiting-approval") {
    return "Needs your approval";
  }
  if (entry.pending?.name) {
    return `Running ${entry.pending.name}`;
  }
  if (entry.streamedText) {
    const lastLine = entry.streamedText.trim().split("\n").at(-1)?.trim();
    if (lastLine) return lastLine.slice(0, 120);
  }
  return "Starting";
}

function outcomeWord(status: AgentHubEntry["status"]): string {
  if (status === "denied") return "Denied";
  if (status === "failed") return "Failed";
  return "";
}

/**
 * Unified Work Panel Agents tab:
 * - Default view ports Sable's 1:1 `AgentsTab` (two-tier live cards + aligned done rows
 *   + collapsible `AgentDetail` + "Show in conversation").
 * - Sub-views keep Entry's Team Board and Per-Role Models accessible without a second drawer.
 */
export function WorkspaceAgentsTab({
  messages,
  isParentStreaming,
  defaultModelId,
  teamRoleModels,
  onUpdateRoleModel,
  modelOptions,
  isFreeTierLocked,
  freePlanModelId,
  freeTierAllowedModelIds,
  onSelectSubagent,
  onStopRun,
  onClosePanel,
}: WorkspaceAgentsTabProps) {
  const [subView, setSubView] = useState<AgentsSubView>("agents");
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const roster = useMemo(
    () => deriveAgentHubRoster(messages, { isParentStreaming }),
    [messages, isParentStreaming],
  );

  const { running, doneEntries, doneGroups, multiGroup } = useMemo(() => {
    const live: AgentHubEntry[] = [];
    const done: AgentHubEntry[] = [];
    for (const entry of roster) {
      if (isLiveStatus(entry.status)) live.push(entry);
      else done.push(entry);
    }
    const groupsMap = new Map<
      string,
      { key: string; label: string; entries: AgentHubEntry[] }
    >();
    // Show newest finished items first within groups, matching Sable's descending order
    for (let i = done.length - 1; i >= 0; i -= 1) {
      const entry = done[i]!;
      const groupInfo = userPromptBeforeMessage(messages, entry.messageId);
      const existing = groupsMap.get(groupInfo.key);
      if (existing) {
        existing.entries.push(entry);
      } else {
        groupsMap.set(groupInfo.key, {
          key: groupInfo.key,
          label: groupInfo.label,
          entries: [entry],
        });
      }
    }
    const groups = [...groupsMap.values()];
    const hasMulti =
      groups.length > 1 && groups.some((g) => g.entries.length > 1);
    return {
      running: live,
      doneEntries: done,
      doneGroups: groups,
      multiGroup: hasMulti,
    };
  }, [roster, messages]);

  const now = useNow(running.length > 0);

  // Remember open cards while keeping default collapsed
  const toggleOpen = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleReveal = useCallback(
    (entry: AgentHubEntry) => {
      revealToolInConversation(entry.id, onClosePanel);
    },
    [onClosePanel],
  );

  const handleOpenThread = useCallback(
    (entry: AgentHubEntry) => {
      onSelectSubagent(entry.id, entry.title, entry.subagentType);
    },
    [onSelectSubagent],
  );

  const statusMeta =
    running.length > 0
      ? `${running.length} running`
      : doneEntries.length > 0
        ? `${doneEntries.length} done`
        : "";

  return (
    <div className="rail-col">
      <div className="rail-bar">
        <span className="rail-bar-title">Agents</span>
        {statusMeta && <span className="rail-bar-meta">{statusMeta}</span>}
        <div className="agx-bar-tools">
          {running.length > 0 && (
            <button
              type="button"
              className="agx-stop-btn"
              onClick={onStopRun}
              aria-label="Stop running agents"
            >
              <Square size={9} className="fill-current" aria-hidden="true" />
              <span>Stop</span>
            </button>
          )}
          <div
            className="agx-seg-tabs"
            role="tablist"
            aria-label="Agents views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subView === "agents"}
              data-active={subView === "agents" ? "true" : undefined}
              className="agx-seg-btn"
              onClick={() => setSubView("agents")}
            >
              Agents
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subView === "models"}
              data-active={subView === "models" ? "true" : undefined}
              className="agx-seg-btn"
              onClick={() => setSubView("models")}
            >
              Models
            </button>
          </div>
        </div>
      </div>

      {subView === "models" && (
        <div className="rail-scroll">
          <ModelsTab
            defaultModelId={defaultModelId}
            teamRoleModels={teamRoleModels}
            onUpdateRoleModel={onUpdateRoleModel}
            modelOptions={modelOptions}
            isFreeTierLocked={isFreeTierLocked}
            freePlanModelId={freePlanModelId}
            freeTierAllowedModelIds={freeTierAllowedModelIds}
          />
        </div>
      )}

      {subView === "agents" && roster.length === 0 && (
        <div className="rail-scroll">
          <p className="rail-empty">No agents in this session yet.</p>
        </div>
      )}

      {subView === "agents" && roster.length > 0 && (
        <div className="rail-scroll">
          <div className="agx-list" role="list" aria-label="Agents">
            {running.map((entry) => {
              const isOpen = openIds.has(entry.id);
              const awaiting = entry.status === "awaiting-approval";
              const elapsedMs = entry.startedAt
                ? Math.max(0, now - entry.startedAt)
                : 0;
              return (
                <div
                  key={entry.id}
                  role="listitem"
                  className="agx-card"
                  data-open={isOpen || undefined}
                >
                  <button
                    type="button"
                    className="agx-card-btn"
                    aria-expanded={isOpen}
                    onClick={() => toggleOpen(entry.id)}
                  >
                    <span className="agx-line">
                      <span className="agx-mark" aria-hidden="true">
                        {awaiting ? (
                          <span className="agx-wait-dot" />
                        ) : (
                          <Loader2
                            size={12}
                            strokeWidth={1.8}
                            className="animate-spin text-foreground/80"
                          />
                        )}
                      </span>
                      <span className="agx-title truncate">{entry.title}</span>
                      {elapsedMs >= 1000 && (
                        <span className="agx-time">
                          {shortDuration(elapsedMs)}
                        </span>
                      )}
                    </span>
                    <span className="agx-sub">
                      <span
                        className={
                          awaiting ? "agx-now agx-now-wait" : "agx-now"
                        }
                      >
                        <span className={awaiting ? undefined : "shimmer"}>
                          {liveActivityText(entry)}
                        </span>
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <WorkspaceAgentDetail
                      entry={entry}
                      messages={messages}
                      isParentStreaming={isParentStreaming}
                      live
                      onRevealInConversation={handleReveal}
                      onOpenFullThread={handleOpenThread}
                    />
                  )}
                </div>
              );
            })}

            {!multiGroup && running.length > 0 && doneEntries.length > 0 && (
              <div role="listitem" className="agx-head">
                <span className="agx-head-label truncate">Done</span>
              </div>
            )}

            {doneGroups.map((group) => (
              <div key={group.key} className="contents">
                {multiGroup && (
                  <div role="listitem" className="agx-head">
                    <span className="agx-head-label truncate">
                      {group.label}
                    </span>
                  </div>
                )}
                {group.entries.map((entry) => {
                  const isOpen = openIds.has(entry.id);
                  const failed =
                    entry.status === "failed" || entry.status === "denied";
                  const word = outcomeWord(entry.status);
                  const durationMs =
                    entry.startedAt != null && entry.completedAt != null
                      ? Math.max(0, entry.completedAt - entry.startedAt)
                      : 0;
                  return (
                    <div
                      key={entry.id}
                      role="listitem"
                      className="agx-row"
                      data-outcome={failed ? "failed" : "done"}
                      data-open={isOpen || undefined}
                    >
                      <button
                        type="button"
                        className="agx-row-btn"
                        aria-expanded={isOpen}
                        onClick={() => toggleOpen(entry.id)}
                      >
                        <span className="agx-mark" aria-hidden="true">
                          {failed ? (
                            <X size={11} strokeWidth={2.2} />
                          ) : entry.subagentType !== "agent" ? (
                            <SubagentIcon
                              subagentType={entry.subagentType}
                              className="size-3"
                            />
                          ) : (
                            <Check size={11} strokeWidth={2} />
                          )}
                        </span>
                        <span className="agx-title truncate">
                          {entry.title}
                        </span>
                        <span className="agx-meta">
                          {word ? (
                            <span className="agx-outcome">{word}</span>
                          ) : durationMs >= 1000 ? (
                            <span className="agx-dur">
                              {shortDuration(durationMs)}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      {isOpen && (
                        <WorkspaceAgentDetail
                          entry={entry}
                          messages={messages}
                          isParentStreaming={isParentStreaming}
                          live={false}
                          onRevealInConversation={handleReveal}
                          onOpenFullThread={handleOpenThread}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
