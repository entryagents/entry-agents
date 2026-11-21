"use client";

import { Loader2, Users } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { Button } from "@/components/ui/button";
import {
  deriveAgentHubRoster,
  isLiveStatus,
} from "@/lib/agent-hub/derive-roster";
import type { ModelOption } from "@/lib/model-options";
import { cn } from "@/lib/utils";

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
  onSelectSubagent?: (
    subagentId: string,
    title: string,
    subagentType?: string,
  ) => void;
  onStopRun?: () => void;
  isAgentsPanelOpen?: boolean;
  onToggleAgentsPanel?: () => void;
  /** @deprecated use isAgentsPanelOpen */
  isDesktopTeamPaneOpen?: boolean;
  /** @deprecated use onToggleAgentsPanel */
  onToggleDesktopTeamPane?: () => void;
}

/**
 * Header button that opens/closes the unified Work Panel Agents tab across
 * both desktop and mobile (eliminating the duplicate standalone Team drawer & Sheet).
 */
export function TeamStatusButton({
  messages,
  isParentStreaming,
  isAgentsPanelOpen,
  onToggleAgentsPanel,
  isDesktopTeamPaneOpen = false,
  onToggleDesktopTeamPane,
}: TeamStatusButtonProps) {
  const roster = useMemo(
    () => deriveAgentHubRoster(messages, { isParentStreaming }),
    [messages, isParentStreaming],
  );
  const runningCount = useMemo(
    () => roster.filter((entry) => isLiveStatus(entry.status)).length,
    [roster],
  );

  const isOpen = isAgentsPanelOpen ?? isDesktopTeamPaneOpen;
  const toggleHandler = onToggleAgentsPanel ?? onToggleDesktopTeamPane;

  useEffect(() => {
    const onCustomToggle = () => {
      toggleHandler?.();
    };
    window.addEventListener("entry:toggle-agent-hub", onCustomToggle);
    return () => {
      window.removeEventListener("entry:toggle-agent-hub", onCustomToggle);
    };
  }, [toggleHandler]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => toggleHandler?.()}
      aria-pressed={isOpen}
      aria-label={
        runningCount > 0
          ? `Agents (${runningCount} running)`
          : roster.length > 0
            ? `Agents (${roster.length})`
            : "Open Agents panel"
      }
      className={cn(
        "h-7 gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground cursor-pointer",
        isOpen && "bg-muted text-foreground",
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
            ? `Agents · ${roster.length}`
            : "Agents"}
      </span>
    </Button>
  );
}
