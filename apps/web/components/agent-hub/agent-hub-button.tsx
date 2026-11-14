"use client";

import { formatTokens } from "@entry-agents/shared";
import { Network, Share2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  deriveAgentHubRoster,
  deriveTeamFeed,
  summarizeAgentHub,
} from "@/lib/agent-hub/derive-roster";
import { cn } from "@/lib/utils";
import { AgentInspector } from "./agent-inspector";
import { AgentRoster } from "./agent-roster";
import { TeamBoardView } from "./team-board-view";

type HubTab = "inspector" | "board";

/**
 * Agent Team Hub: live roster + inspector + shared Team Board for this chat.
 *
 * Read-only view over persisted messages so it reconstructs cleanly after refresh
 * or reconnect. Desktop renders a roster | inspector/board split; mobile uses a
 * bottom sheet with Back navigation.
 * Shortcut: Alt+A or Ctrl+Shift+A toggles the hub; custom event
 * `entry:toggle-agent-hub` opens it from the Command Palette.
 */
export function AgentHubButton({
  messages,
  onStopRun,
}: {
  messages: unknown;
  onStopRun?: () => void;
}) {
  const isMobile = useIsMobile();
  const roster = useMemo(() => deriveAgentHubRoster(messages), [messages]);
  const totals = useMemo(() => summarizeAgentHub(roster), [roster]);
  const teamFeed = useMemo(() => deriveTeamFeed(messages), [messages]);

  const hasContent =
    roster.length > 0 ||
    teamFeed.entries.length > 0 ||
    teamFeed.tasks.length > 0;

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HubTab>("inspector");
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.altKey && e.code === "KeyA") ||
        (e.ctrlKey && e.shiftKey && e.code === "KeyA")
      ) {
        if (hasContent) {
          e.preventDefault();
          setOpen((prev) => !prev);
        }
      }
    };

    const handleCustomOpen = () => {
      if (hasContent) {
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("entry:toggle-agent-hub", handleCustomOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("entry:toggle-agent-hub", handleCustomOpen);
    };
  }, [hasContent]);

  if (!hasContent) return null;

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
    roster.length === 0 &&
    (teamFeed.entries.length > 0 || teamFeed.tasks.length > 0)
      ? "board"
      : activeTab;

  const select = (id: string) => {
    setSelectedId(id);
    setActiveTab("inspector");
    if (isMobile) {
      setMobileShowDetail(true);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 rounded-md border-border/70 px-2 text-xs active:scale-[0.97] transition-transform"
          aria-label={`Team hub, ${totals.live} running of ${totals.total} subagents`}
        >
          <Network className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="hidden sm:inline font-medium">Team</span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {totals.live > 0
              ? `${totals.live}/${totals.total}`
              : totals.total > 0
                ? totals.total
                : teamFeed.entries.length}
          </span>
          {totals.live > 0 && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/25" />
          )}
        </Button>
      </SheetTrigger>
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
              <Network className="h-4 w-4 text-primary" />
              <span>Agent Team Hub</span>
              <kbd className="hidden rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
                Alt+A
              </kbd>
            </SheetTitle>

            <div className="inline-flex rounded-md border border-border/70 bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("inspector")}
                disabled={roster.length === 0}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors disabled:opacity-40",
                  effectiveTab === "inspector"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Users className="size-3.5" />
                <span>Agents ({totals.total})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("board");
                  if (isMobile) setMobileShowDetail(true);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors",
                  effectiveTab === "board"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Share2 className="size-3.5" />
                <span>
                  Team Board ({teamFeed.entries.length + teamFeed.tasks.length})
                </span>
              </button>
            </div>
          </div>
          <SheetDescription className="mt-1 font-mono text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {totals.live} active
            </span>{" "}
            · <span>{totals.total} subagents</span> ·{" "}
            <span>{teamFeed.tasks.length} team tasks</span> ·{" "}
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
          {effectiveTab === "board" ? (
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
