"use client";

import { formatTokens } from "@entry-agents/shared";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Clock,
  GitBranch,
  MessageSquare,
  PauseCircle,
  ShieldAlert,
  ShieldCheck,
  Square,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  deriveAgentHubRoster,
  deriveTeamFeed,
  isLiveStatus,
  summarizeAgentHub,
  type AgentHubEntry,
  type TeamFeedEntry,
  type TeamFeedTask,
} from "@/lib/agent-hub/derive-roster";
import type { ModelOption } from "@/lib/model-options";
import { TEAM_ROLE_IDS } from "@/lib/team/role-models-store";
import { cn } from "@/lib/utils";
import { StatusBadge, SUBAGENT_TYPE_META, SubagentIcon } from "./agent-status";

export type TeamPaneTab = "board" | "members" | "graph";
type BoardFilter = "all" | "challenge" | "contract" | "debate";

export interface TeamPaneProps {
  messages: unknown;
  defaultModelId?: string | null;
  teamRoleModels: Record<string, string>;
  onUpdateRoleModel: (role: string, modelId: string | null) => void;
  modelOptions: ModelOption[];
  isFreeTierLocked?: boolean;
  freePlanModelId?: string | null;
  freeTierAllowedModelIds?: string[];
  onSelectMember?: (
    subagentId: string,
    title?: string,
    subagentType?: string,
  ) => void;
  onInsertMention?: (text: string) => void;
  onStopRun?: () => void;
  onClose?: () => void;
  initialTab?: TeamPaneTab;
  className?: string;
}

const ENTRY_KIND_META: Record<
  TeamFeedEntry["kind"],
  { label: string; className: string }
> = {
  contract: {
    label: "Contract",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  challenge: {
    label: "Challenge",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  debate: {
    label: "Debate",
    className: "border-border/80 bg-muted/60 text-foreground",
  },
  verification: {
    label: "Verification",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  decision: {
    label: "Decision",
    className: "border-border/80 bg-muted/50 text-foreground",
  },
  handoff: {
    label: "Handoff",
    className: "border-border/80 bg-muted/50 text-foreground",
  },
  finding: {
    label: "Finding",
    className: "border-border/70 bg-muted/40 text-muted-foreground",
  },
  artifact: {
    label: "Artifact",
    className: "border-border/70 bg-muted/40 text-muted-foreground",
  },
  blocker: {
    label: "Blocker",
    className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  },
  question: {
    label: "Question",
    className: "border-border/70 bg-muted/40 text-muted-foreground",
  },
};

function TaskStatusIcon({ status }: { status: TeamFeedTask["status"] }) {
  switch (status) {
    case "completed":
      return (
        <CheckCircle2
          className="size-3.5 shrink-0 text-emerald-500"
          strokeWidth={1.5}
        />
      );
    case "in_progress":
      return (
        <Clock className="size-3.5 shrink-0 text-amber-500" strokeWidth={1.5} />
      );
    case "blocked":
      return (
        <AlertCircle
          className="size-3.5 shrink-0 text-red-500"
          strokeWidth={1.5}
        />
      );
    case "parked":
      return (
        <PauseCircle
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
        />
      );
    default:
      return (
        <Circle
          className="size-3.5 shrink-0 text-muted-foreground/60"
          strokeWidth={1.5}
        />
      );
  }
}

function dispatchMention(
  role: string,
  onInsertMention?: (text: string) => void,
) {
  const cleaned = role.trim().replace(/^@+/, "");
  if (!cleaned || cleaned === "all") return;
  const text = `@${cleaned} `;
  if (onInsertMention) {
    onInsertMention(text);
    return;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("entry:insert-composer-prompt", {
        detail: { text },
      }),
    );
  }
}

function getModelDisplayLabel(
  modelId: string | null | undefined,
  options: ModelOption[],
): string | null {
  if (!modelId) return null;
  const found = options.find((opt) => opt.id === modelId);
  return found?.label ?? modelId;
}

export function TeamPane({
  messages,
  defaultModelId = null,
  teamRoleModels,
  onUpdateRoleModel,
  modelOptions,
  isFreeTierLocked = false,
  freePlanModelId = null,
  freeTierAllowedModelIds = [],
  onSelectMember,
  onInsertMention,
  onStopRun,
  onClose,
  initialTab = "board",
  className,
}: TeamPaneProps) {
  const roster = useMemo(() => deriveAgentHubRoster(messages), [messages]);
  const totals = useMemo(() => summarizeAgentHub(roster), [roster]);
  const teamFeed = useMemo(() => deriveTeamFeed(messages), [messages]);

  const [tab, setTab] = useState<TeamPaneTab>(initialTab);
  const [boardFilter, setBoardFilter] = useState<BoardFilter>("all");
  const [selectedWaveNumber, setSelectedWaveNumber] = useState<number | null>(
    null,
  );

  const selectableModelOptions = useMemo(() => {
    const allowedSet = new Set<string>(freeTierAllowedModelIds);
    if (freePlanModelId) {
      allowedSet.add(freePlanModelId);
    }

    const base = isFreeTierLocked
      ? modelOptions.filter((option) => allowedSet.has(option.id))
      : modelOptions;

    const seenIds = new Set(base.map((option) => option.id));
    const augmented = [...base];
    for (const pinnedId of Object.values(teamRoleModels)) {
      if (!pinnedId || seenIds.has(pinnedId)) continue;
      const match = modelOptions.find((option) => option.id === pinnedId);
      augmented.push(
        match ?? {
          id: pinnedId,
          label: pinnedId,
          shortLabel: pinnedId,
          provider: "entry",
        },
      );
      seenIds.add(pinnedId);
    }
    return augmented;
  }, [
    modelOptions,
    isFreeTierLocked,
    freePlanModelId,
    freeTierAllowedModelIds,
    teamRoleModels,
  ]);

  const defaultModelLabel = useMemo(
    () => getModelDisplayLabel(defaultModelId, modelOptions),
    [defaultModelId, modelOptions],
  );

  const filteredEntries = useMemo(() => {
    if (boardFilter === "all") return teamFeed.entries;
    return teamFeed.entries.filter((entry) => entry.kind === boardFilter);
  }, [teamFeed.entries, boardFilter]);

  const runsByRole = useMemo(() => {
    const map = new Map<string, AgentHubEntry[]>();
    for (const entry of roster) {
      const list = map.get(entry.subagentType) ?? [];
      list.push(entry);
      map.set(entry.subagentType, list);
    }
    return map;
  }, [roster]);

  const worktreeByRole = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of teamFeed.tasks) {
      if (task.worktreeBranch && !map.has(task.assignedRole)) {
        map.set(task.assignedRole, task.worktreeBranch);
      }
    }
    for (const entry of roster) {
      if (entry.worktreeBranch) {
        map.set(entry.subagentType, entry.worktreeBranch);
      }
    }
    return map;
  }, [teamFeed.tasks, roster]);

  const extraRosterRoles = useMemo(() => {
    const known = new Set<string>(TEAM_ROLE_IDS);
    const extras: string[] = [];
    for (const entry of roster) {
      if (!known.has(entry.subagentType)) {
        known.add(entry.subagentType);
        extras.push(entry.subagentType);
      }
    }
    return extras;
  }, [roster]);

  const activeWave = useMemo(() => {
    if (teamFeed.waves.length === 0) return null;
    if (selectedWaveNumber !== null) {
      const match = teamFeed.waves.find((w) => w.wave === selectedWaveNumber);
      if (match) return match;
    }
    return (
      teamFeed.waves.find((w) => w.status === "active") ??
      teamFeed.waves.find((w) => w.status === "blocked") ??
      teamFeed.waves[teamFeed.waves.length - 1] ??
      null
    );
  }, [teamFeed.waves, selectedWaveNumber]);

  const tasksById = useMemo(
    () => new Map(teamFeed.tasks.map((task) => [task.id, task])),
    [teamFeed.tasks],
  );

  const selectedWaveTasks = useMemo(() => {
    if (!activeWave) return [];
    return activeWave.taskIds.flatMap((id) => {
      const task = tasksById.get(id);
      return task ? [task] : [];
    });
  }, [activeWave, tasksById]);

  const settledTaskCount = useMemo(
    () =>
      teamFeed.tasks.filter(
        (t) => t.status === "completed" || t.status === "parked",
      ).length,
    [teamFeed.tasks],
  );

  return (
    <aside
      aria-label="Agent team workspace"
      className={cn(
        "flex h-full min-w-0 flex-col bg-background text-foreground",
        className,
      )}
    >
      {/* Dense 36px tab header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/80 px-2">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setTab("board")}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
              tab === "board"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MessageSquare className="size-3.5" strokeWidth={1.5} />
            <span>Board</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {teamFeed.entries.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("members")}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
              tab === "members"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Users className="size-3.5" strokeWidth={1.5} />
            <span>Members</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {totals.live > 0
                ? `${totals.live}/${roster.length}`
                : roster.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("graph")}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
              tab === "graph"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Workflow className="size-3.5" strokeWidth={1.5} />
            <span>Graph</span>
            {teamFeed.waves.length > 0 && (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {teamFeed.waves.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            /team
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close team pane"
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 hover:text-foreground cursor-pointer"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable panel body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "board" && (
          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "challenge", label: "Challenges" },
                    { id: "contract", label: "Contracts" },
                    { id: "debate", label: "Debates" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setBoardFilter(item.id)}
                    className={cn(
                      "h-6 rounded-md px-2 text-xs font-medium transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
                      boardFilter === item.id
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {filteredEntries.length}
              </span>
            </div>

            {filteredEntries.length === 0 ? (
              <div className="space-y-2 p-4 text-xs leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">
                  {boardFilter === "all"
                    ? "Shared team board is ready"
                    : `No ${boardFilter} entries yet`}
                </p>
                <p>
                  Run <code className="font-mono text-foreground">/team</code>{" "}
                  or tag specialists such as{" "}
                  <button
                    type="button"
                    onClick={() =>
                      dispatchMention("architect", onInsertMention)
                    }
                    className="font-mono text-foreground hover:underline cursor-pointer"
                  >
                    @architect
                  </button>{" "}
                  and{" "}
                  <button
                    type="button"
                    onClick={() => dispatchMention("reviewer", onInsertMention)}
                    className="font-mono text-foreground hover:underline cursor-pointer"
                  >
                    @reviewer
                  </button>{" "}
                  to stream contracts, debates, and handoffs here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/70">
                {filteredEntries.map((entry) => {
                  const kindMeta =
                    ENTRY_KIND_META[entry.kind] ?? ENTRY_KIND_META.finding;
                  const extraMentions = (entry.mentions ?? []).filter(
                    (mention) =>
                      mention !== entry.authorRole &&
                      mention !== entry.targetRole,
                  );

                  return (
                    <div key={entry.id} className="space-y-1.5 px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              dispatchMention(entry.authorRole, onInsertMention)
                            }
                            className="font-mono text-xs font-medium text-foreground hover:underline cursor-pointer"
                          >
                            @{entry.authorRole}
                          </button>
                          {entry.targetRole && (
                            <>
                              <ArrowRight
                                className="size-3 text-muted-foreground"
                                strokeWidth={1.5}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  entry.targetRole &&
                                  dispatchMention(
                                    entry.targetRole,
                                    onInsertMention,
                                  )
                                }
                                className="font-mono text-xs font-medium text-foreground/85 hover:underline cursor-pointer"
                              >
                                @{entry.targetRole}
                              </button>
                            </>
                          )}
                        </div>
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[11px] font-medium",
                            kindMeta.className,
                          )}
                        >
                          {kindMeta.label}
                        </span>
                      </div>

                      <div className="text-xs font-medium text-foreground">
                        {entry.title}
                      </div>

                      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                        {entry.content}
                      </p>

                      {extraMentions.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {extraMentions.map((mention) => (
                            <button
                              key={mention}
                              type="button"
                              onClick={() =>
                                dispatchMention(mention, onInsertMention)
                              }
                              className="rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted cursor-pointer"
                            >
                              @{mention}
                            </button>
                          ))}
                        </div>
                      )}

                      {entry.files && entry.files.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {entry.files.map((file) => (
                            <span
                              key={file}
                              className="max-w-full truncate rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                            >
                              {file}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "members" && (
          <div className="divide-y divide-border/70">
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
              <span>Specialist roles and model pins</span>
              <span className="font-mono text-[11px] tabular-nums">
                {Object.keys(teamRoleModels).length} pinned
              </span>
            </div>

            {TEAM_ROLE_IDS.map((roleId) => {
              const meta = SUBAGENT_TYPE_META[roleId];
              const roleRuns = runsByRole.get(roleId) ?? [];
              const latestRun =
                roleRuns.find((entry) => isLiveStatus(entry.status)) ??
                roleRuns[roleRuns.length - 1] ??
                null;
              const worktreeBranch = worktreeByRole.get(roleId) ?? null;
              const pinnedModelId = teamRoleModels[roleId] ?? "";
              const label = meta?.label ?? roleId;

              return (
                <div key={roleId} className="space-y-2 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <SubagentIcon
                        type={roleId}
                        className="size-4 text-muted-foreground"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground">
                            {label}
                          </span>
                          {roleId === "reviewer" && (
                            <ShieldCheck
                              className="size-3.5 shrink-0 text-muted-foreground"
                              strokeWidth={1.5}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              dispatchMention(roleId, onInsertMention)
                            }
                            className="font-mono text-[11px] text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-foreground cursor-pointer"
                            title={`Tag @${roleId} in composer`}
                          >
                            @{roleId}
                          </button>
                        </div>
                        {meta?.description && (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {meta.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {latestRun ? (
                      <StatusBadge status={latestRun.status} size="sm" />
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        Idle
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Model for ${label}`}
                      value={pinnedModelId}
                      onChange={(event) => {
                        const value = event.target.value.trim();
                        onUpdateRoleModel(roleId, value || null);
                      }}
                      className="h-7 min-w-0 flex-1 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">
                        {defaultModelLabel
                          ? `Default (${defaultModelLabel})`
                          : "Default model"}
                      </option>
                      {selectableModelOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label || option.id}
                        </option>
                      ))}
                    </select>

                    {latestRun && onSelectMember && (
                      <button
                        type="button"
                        onClick={() =>
                          onSelectMember(
                            latestRun.id,
                            latestRun.title,
                            latestRun.subagentType,
                          )
                        }
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border/70 px-2 text-xs font-medium text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted cursor-pointer"
                      >
                        <span>Inspect trace</span>
                        <ArrowUpRight className="size-3" strokeWidth={1.5} />
                      </button>
                    )}
                  </div>

                  {(worktreeBranch || latestRun) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      {latestRun ? (
                        <span className="min-w-0 truncate">
                          {latestRun.title}
                        </span>
                      ) : (
                        <span />
                      )}
                      {worktreeBranch && (
                        <span className="inline-flex shrink-0 items-center gap-1 font-mono">
                          <GitBranch className="size-3" strokeWidth={1.5} />
                          <span className="max-w-[160px] truncate">
                            {worktreeBranch}
                          </span>
                        </span>
                      )}
                    </div>
                  )}

                  {roleRuns.length > 1 && onSelectMember && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {roleRuns.slice(-4).map((run) => (
                        <button
                          key={run.id}
                          type="button"
                          onClick={() =>
                            onSelectMember(run.id, run.title, run.subagentType)
                          }
                          className="rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-foreground cursor-pointer"
                        >
                          #{run.index}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {extraRosterRoles.map((roleId) => {
              const roleRuns = runsByRole.get(roleId) ?? [];
              const latestRun = roleRuns[roleRuns.length - 1];
              if (!latestRun) return null;
              return (
                <div key={roleId} className="space-y-1.5 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium text-foreground">
                      @{roleId}
                    </span>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={latestRun.status} size="sm" />
                      {onSelectMember && (
                        <button
                          type="button"
                          onClick={() =>
                            onSelectMember(
                              latestRun.id,
                              latestRun.title,
                              latestRun.subagentType,
                            )
                          }
                          className="inline-flex h-6 items-center gap-1 rounded border border-border/70 px-1.5 text-[11px] font-medium text-foreground hover:bg-muted cursor-pointer"
                        >
                          <span>Inspect trace</span>
                          <ArrowUpRight className="size-3" strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {latestRun.title}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {tab === "graph" && (
          <div className="flex flex-col">
            {teamFeed.waves.length === 0 ? (
              <div className="space-y-2 p-4 text-xs leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">
                  No execution waves scheduled yet
                </p>
                <p>
                  Wave dependencies appear here when{" "}
                  <code className="font-mono text-foreground">team_board</code>{" "}
                  plans parallel and dependent tasks.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2 border-b border-border/70 px-3 py-2.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Wave scrubber</span>
                    <span className="font-mono text-[11px] tabular-nums">
                      Wave {activeWave?.wave ?? 1}/{teamFeed.waves.length} ·{" "}
                      {settledTaskCount}/{teamFeed.tasks.length} settled
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {teamFeed.waves.map((wave) => {
                      const isSelected = activeWave?.wave === wave.wave;
                      return (
                        <button
                          key={wave.wave}
                          type="button"
                          onClick={() => setSelectedWaveNumber(wave.wave)}
                          className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-xs tabular-nums transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
                            isSelected
                              ? "border-foreground/40 bg-muted text-foreground"
                              : "border-border/70 bg-background text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span>Wave {wave.wave}</span>
                          <span className="text-[11px] opacity-75">
                            {wave.status}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {teamFeed.fileConflicts.length > 0 && (
                  <div className="border-b border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <div className="flex items-center gap-1.5 font-medium">
                      <ShieldAlert
                        className="size-3.5 shrink-0"
                        strokeWidth={1.5}
                      />
                      <span>
                        File overlap across active tasks (
                        {teamFeed.fileConflicts.length})
                      </span>
                    </div>
                    <div className="mt-1 space-y-0.5 font-mono text-[11px]">
                      {teamFeed.fileConflicts.map((conflict) => (
                        <div key={conflict.file} className="truncate">
                          {conflict.file} ({conflict.roles.join(", ")})
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="divide-y divide-border/70">
                  {selectedWaveTasks.map((task) => (
                    <div key={task.id} className="space-y-1.5 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2">
                          <div className="pt-0.5">
                            <TaskStatusIcon status={task.status} />
                          </div>
                          <div className="min-w-0">
                            <div
                              className={cn(
                                "text-xs font-medium text-foreground",
                                task.status === "completed" &&
                                  "text-muted-foreground line-through",
                              )}
                            >
                              {task.title}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  dispatchMention(
                                    task.assignedRole,
                                    onInsertMention,
                                  )
                                }
                                className="font-mono text-[11px] font-medium text-foreground/85 hover:underline cursor-pointer"
                              >
                                @{task.assignedRole}
                              </button>
                              {task.status === "parked" && (
                                <span className="rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  Parked
                                </span>
                              )}
                              {task.dependsOn && task.dependsOn.length > 0 && (
                                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                                  after {task.dependsOn.join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {task.id}
                        </span>
                      </div>

                      {task.worktreeBranch && (
                        <div className="inline-flex items-center gap-1 pl-5 font-mono text-[11px] text-muted-foreground">
                          <GitBranch className="size-3" strokeWidth={1.5} />
                          <span>{task.worktreeBranch}</span>
                        </div>
                      )}

                      {task.files && task.files.length > 0 && (
                        <div className="flex flex-wrap gap-1 pl-5">
                          {task.files.map((file) => (
                            <span
                              key={file}
                              className="max-w-full truncate rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                            >
                              {file}
                            </span>
                          ))}
                        </div>
                      )}

                      {task.verification && (
                        <p className="pl-5 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                          Verified: {task.verification}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Live status footer */}
      {(totals.live > 0 || totals.inputTokens + totals.outputTokens > 0) && (
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border/80 px-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
            <span>{totals.live} active</span>
            {totals.inputTokens + totals.outputTokens > 0 && (
              <span>
                · {formatTokens(totals.inputTokens + totals.outputTokens)} tok
              </span>
            )}
          </div>
          {totals.live > 0 && onStopRun && (
            <button
              type="button"
              onClick={onStopRun}
              className="inline-flex h-6 items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 text-[11px] font-medium text-red-600 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-red-500/20 dark:text-red-400 cursor-pointer"
            >
              <Square className="size-2.5 fill-current" />
              <span>Stop</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
