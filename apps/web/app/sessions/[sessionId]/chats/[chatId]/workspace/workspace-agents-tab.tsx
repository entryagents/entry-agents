"use client";

import { useMemo } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { TeamWorkspace } from "@/components/team/team-workspace";
import {
  deriveAgentHubRoster,
  isLiveStatus,
} from "@/lib/agent-hub/derive-roster";
import type { ModelOption } from "@/lib/model-options";

export function useLiveAgentCount(messages: WebAgentUIMessage[]): number {
  return useMemo(() => {
    const roster = deriveAgentHubRoster(messages);
    let live = 0;
    for (const entry of roster) {
      if (isLiveStatus(entry.status)) live += 1;
    }
    return live;
  }, [messages]);
}

interface WorkspaceAgentsTabProps {
  messages: WebAgentUIMessage[];
  isParentStreaming: boolean;
  defaultModelId: string;
  teamRoleModels: Record<string, string>;
  onUpdateRoleModel: (role: string, modelId: string | null) => void;
  modelOptions: ModelOption[];
  isFreeTierLocked: boolean;
  freePlanModelId: string;
  freeTierAllowedModelIds: string[];
  onSelectSubagent: (toolCallId: string) => void;
  onStopRun: () => void;
}

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
}: WorkspaceAgentsTabProps) {
  const liveCount = useLiveAgentCount(messages);

  return (
    <div className="rail-col">
      <div className="rail-bar">
        <span>{liveCount > 0 ? `${liveCount} running` : "Agent team"}</span>
      </div>
      <div className="rail-scroll">
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
          onSelectSubagent={onSelectSubagent}
          onStopRun={onStopRun}
          onClose={() => {}}
          className="h-full"
        />
      </div>
    </div>
  );
}
