"use client";

import { formatTokens } from "@entry-agents/shared";
import { Network, Share2, Users, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  deriveAgentHubRoster,
  deriveTeamFeed,
  summarizeAgentHub,
} from "@/lib/agent-hub/derive-roster";
import type { ModelOption } from "@/lib/model-options";
import { cn } from "@/lib/utils";
import { AgentInspector } from "./agent-inspector";
import { AgentRoster } from "./agent-roster";
import { TeamBoardView } from "./team-board-view";
import { TeamPane } from "./team-pane";

type HubTab = "team" | "inspector" | "board";

/**
 * Agent Team Hub trigger + responsive drawer:
 * - On desktop (>= 1024px) when `onToggleDesktopTeamPane` is wired, toggles
 *   the docked right-hand `/team` pane alongside the chat.
 * - On tablet/mobile (< 1024px), opens a `<Sheet>` with `/team` (including
 *   per-role model pins), live Agents Inspector, and Team Board.
 * Shortcut: Alt+A or Ctrl+Shift+A, or `entry:toggle-agent-hub`.
 */
export function AgentHubButton({
  messages,
  onStopRun,
  isDesktopTeamPaneOpen = false,
  onToggleDesktopTeamPane,
  defaultModelId = null,
  teamRoleModels = {},
  onUpdateRoleModel,
  modelOptions = [],
  isFreeTierLocked = false,
  freePlanModelId = null,
  freeTierAllowedModelIds = [],
  onOpenSubagentTab,
}: {
  messages: unknown;
  onStopRun?: () => void;
  isDesktopTeamPaneOpen?: boolean;
  onToggleDesktopTeamPane?: () => void;
  defaultModelId?: string | null;
  teamRoleModels?: Record<string, string>;
  onUpdateRoleModel?: (role: string, modelId: string | null) => void;
  modelOptions?: ModelOption[];
  isFreeTierLocked?: boolean;
  freePlanModelId?: string | null;
  freeTierAllowedModelIds?: string[];
  onOpenSubagentTab?: (
    subagentId: string,
    title?: string,
    subagentType?: string,
  ) => void;
}) {
  const isMobile = useIsMobile();
  const roster = useMemo(() => deriveAgentHubRoster(messages), [messages]);
  const totals = useMemo(() => summarizeAgentHub(roster), [roster]);
  const teamFeed = useMemo(() => deriveTeamFeed(messages), [messages]);

  const hasContent =
    roster.length > 0 ||
    teamFeed.entries.length > 0 ||
    teamFeed.tasks.length > 0;
  const pinnedCount = Object.keys(teamRoleModels).length;

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HubTab>("team");
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  useEffect(() => {
    const isDesktopViewport = () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches;

    const triggerToggle = () => {
      if (isDesktopViewport() && onToggleDesktopTeamPane) {
        setOpen(false);
        onToggleDesktopTeamPane();
        return;
      }
      setOpen((prev) => !prev);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.altKey && e.code === "KeyA") ||
        (e.ctrlKey && e.shiftKey && e.code === "KeyA")
      ) {
        e.preventDefault();
        triggerToggle();
      }
    };

    const handleCustomOpen = () => {
      triggerToggle();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("entry:toggle-agent-hub", handleCustomOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("entry:toggle-agent-hub", handleCustomOpen);
    };
  }, [onToggleDesktopTeamPane]);

  const selected =
    roster.find((entry) => entry.id === selectedId) ??
    roster.find((entry) => entry.status === "running") ??
    roster[roster.length - 1] ??
    null;
  const parent = selected?.parentId
    ? (roster.find((entry) => entry.id === selected.parentId) ?? null)
    : null;
  const kids = selected
    ? roster.filter((entry) => entry.parentId === selected.id)
    : [];

  const effectiveTab: HubTab =
    activeTab === "inspector" && roster.length === 0
      ? "team"
      : activeTab === "board" && !hasContent
        ? "team"
        : activeTab;

  const select = (id: string) => {
    setSelectedId(id);
    setActiveTab("inspector");
    if (isMobile) {
      setMobileShowDetail(true);
    }
  };

  const handleTriggerClick = () => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches &&
      onToggleDesktopTeamPane
    ) {
      setOpen(false);
      onToggleDesktopTeamPane();
      return;
    }
    setOpen((prev) => !prev);
  };

  const badgeCount =
    totals.live > 0
      ? `${totals.live}/${totals.total}`
      : totals.total > 0
        ? String(totals.total)
        : teamFeed.entries.length > 0
          ? String(teamFeed.entries.length)
          : pinnedCount > 0
            ? String(pinnedCount)
            : null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleTriggerClick}
        aria-pressed={isDesktopTeamPaneOpen || open}
        aria-label={
          hasContent
            ? `Team workspace, ${totals.live} active of ${totals.total} subagents`
            : "Open team workspace"
        }
        className={cn(
          "h-7 gap-1.5 rounded-md border-border/70 px-2 text-xs transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
          (isDesktopTeamPaneOpen || open) &&
            "border-border bg-muted text-foreground",
        )}
      >
        <Network className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
        <span className="hidden font-medium sm:inline">Team</span>
        {badgeCount !== null && (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {badgeCount}
          </span>
        )}
        {totals.live > 0 && (
          <span className="size-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/25" />
        )}
      </Button>

      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "flex h-[88dvh] flex-col gap-0 rounded-t-2xl p-0"
            : "flex w-full flex-col gap-0 p-0 sm:max-w-4xl"
        }
      >
        {isMobile && (
          <div className="flex shrink-0 justify-center pt-2 pb-1">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>
        )}

        <SheetHeader className="shrink-0 border-b border-border/80 bg-muted/10 p-4 pr-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2 text-base font-semibold">
              <Network className="size-4 text-primary" strokeWidth={1.5} />
              <span>Team workspace</span>
              <span className="font-mono text-xs font-normal text-muted-foreground">
                /team
              </span>
              <kbd className="hidden rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline-block">
                Alt+A
              </kbd>
            </SheetTitle>

            <div className="inline-flex rounded-md border border-border/70 bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("team");
                  setMobileShowDetail(false);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
                  effectiveTab === "team"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Workflow className="size-3.5" strokeWidth={1.5} />
                <span>Team</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("inspector")}
                disabled={roster.length === 0}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:opacity-40 cursor-pointer",
                  effectiveTab === "inspector"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Users className="size-3.5" strokeWidth={1.5} />
                <span>Agents ({totals.total})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("board");
                  if (isMobile) setMobileShowDetail(true);
                }}
                disabled={!hasContent}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:opacity-40 cursor-pointer",
                  effectiveTab === "board"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Share2 className="size-3.5" strokeWidth={1.5} />
                <span>
                  Board ({teamFeed.entries.length + teamFeed.tasks.length})
                </span>
              </button>
            </div>
          </div>
          <SheetDescription className="mt-1 font-mono text-xs text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">
              {totals.live} active
            </span>{" "}
            · <span className="tabular-nums">{totals.total} subagents</span> ·{" "}
            <span className="tabular-nums">
              {teamFeed.tasks.length} team tasks
            </span>{" "}
            ·{" "}
            <span className="tabular-nums">
              {formatTokens(totals.inputTokens)} in
            </span>{" "}
            /{" "}
            <span className="tabular-nums">
              {formatTokens(totals.outputTokens)} out
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {effectiveTab === "team" ? (
            <TeamPane
              className="w-full"
              messages={messages}
              defaultModelId={defaultModelId}
              teamRoleModels={teamRoleModels}
              onUpdateRoleModel={onUpdateRoleModel ?? (() => {})}
              modelOptions={modelOptions}
              isFreeTierLocked={isFreeTierLocked}
              freePlanModelId={freePlanModelId}
              freeTierAllowedModelIds={freeTierAllowedModelIds}
              onSelectMember={(subagentId, title, subagentType) => {
                setOpen(false);
                onOpenSubagentTab?.(subagentId, title, subagentType);
              }}
              onStopRun={onStopRun}
            />
          ) : effectiveTab === "board" ? (
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <TeamBoardView feed={teamFeed} />
            </div>
          ) : isMobile ? (
            mobileShowDetail && selected ? (
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                <AgentInspector
                  entry={selected}
                  parent={parent}
                  childEntries={kids}
                  onBack={() => setMobileShowDetail(false)}
                  onSelect={select}
                  onStopRun={onStopRun}
                />
              </div>
            ) : (
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                <AgentRoster
                  entries={roster}
                  selectedId={selected?.id ?? null}
                  onSelect={select}
                />
              </div>
            )
          ) : (
            <>
              <div className="h-full w-[280px] shrink-0 overflow-hidden border-r border-border/70">
                <AgentRoster
                  entries={roster}
                  selectedId={selected?.id ?? null}
                  onSelect={select}
                />
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                {selected ? (
                  <AgentInspector
                    entry={selected}
                    parent={parent}
                    childEntries={kids}
                    onSelect={select}
                    onStopRun={onStopRun}
                  />
                ) : (
                  <TeamBoardView feed={teamFeed} />
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
