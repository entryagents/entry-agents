"use client";

import { Loader2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  deriveAgentHubRoster,
  isLiveStatus,
} from "@/lib/agent-hub/derive-roster";
import type { ModelOption } from "@/lib/model-options";
import { cn } from "@/lib/utils";
import { TeamWorkspace } from "./team-workspace";

export interface TeamStatusButtonProps {
  messages: WebAgentUIMessage[];
  isParentStreaming?: boolean;
  defaultModelId?: string | null;
  teamRoleModels?: Record<string, string>;
  onUpdateRoleModel?: (role: string, modelId: string | null) => void;
  modelOptions?: ModelOption[];
  isFreeTierLocked?: boolean;
  freePlanModelId?: string | null;
  freeTierAllowedModelIds?: string[];
  onSelectSubagent: (
    subagentId: string,
    title: string,
    subagentType?: string,
  ) => void;
  onStopRun?: () => void;
  isDesktopTeamPaneOpen?: boolean;
  onToggleDesktopTeamPane?: () => void;
}

export function TeamStatusButton({
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
  isDesktopTeamPaneOpen = false,
  onToggleDesktopTeamPane,
}: TeamStatusButtonProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const roster = useMemo(
    () => deriveAgentHubRoster(messages, { isParentStreaming }),
    [messages, isParentStreaming],
  );
  const runningCount = useMemo(
    () => roster.filter((entry) => isLiveStatus(entry.status)).length,
    [roster],
  );

  useEffect(() => {
    const onCustomToggle = () => {
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(min-width: 1024px)").matches &&
        onToggleDesktopTeamPane
      ) {
        onToggleDesktopTeamPane();
      } else {
        setMobileOpen((prev) => !prev);
      }
    };
    window.addEventListener("entry:toggle-agent-hub", onCustomToggle);
    return () => {
      window.removeEventListener("entry:toggle-agent-hub", onCustomToggle);
    };
  }, [onToggleDesktopTeamPane]);

  const handleClick = () => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches &&
      onToggleDesktopTeamPane
    ) {
      onToggleDesktopTeamPane();
      return;
    }
    setMobileOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleClick}
        aria-pressed={isDesktopTeamPaneOpen || mobileOpen}
        className={cn(
          "h-7 gap-1.5 rounded-md border border-border/70 px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground",
          (isDesktopTeamPaneOpen || mobileOpen) &&
            "border-border bg-muted text-foreground",
        )}
      >
        {runningCount > 0 ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
        ) : (
          <Users className="size-3.5" strokeWidth={1.5} />
        )}
        <span className="font-mono tabular-nums">
          {runningCount > 0
            ? `${runningCount} running`
            : roster.length > 0
              ? `Team · ${roster.length}`
              : "Team"}
        </span>
      </Button>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex w-full max-w-sm flex-col p-0 sm:max-w-md"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Team workspace</SheetTitle>
            <SheetDescription>
              Inspect running subagents, team board, and per-role models.
            </SheetDescription>
          </SheetHeader>
          <TeamWorkspace
            messages={messages}
            isParentStreaming={isParentStreaming}
            defaultModelId={defaultModelId}
            teamRoleModels={teamRoleModels}
            onUpdateRoleModel={onUpdateRoleModel}
            modelOptions={modelOptions}
            isFreeTierLocked={isFreeTierLocked}
            freePlanModelId={freePlanModelId}
            freeTierAllowedModelIds={freeTierAllowedModelIds}
            onSelectSubagent={(subagentId, title, subagentType) => {
              setMobileOpen(false);
              onSelectSubagent(subagentId, title, subagentType);
            }}
            onStopRun={onStopRun}
            onClose={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
