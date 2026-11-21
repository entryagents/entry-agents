"use client";

import { Cpu } from "lucide-react";
import { memo, useState } from "react";
import type { ModelOption } from "@/lib/model-options";

function resolveModelLabel(
  modelId: string,
  modelOptions?: ModelOption[],
): string {
  const matched = modelOptions?.find((m) => m.id === modelId);
  if (matched) return matched.shortLabel || matched.label;
  const slash = modelId.lastIndexOf("/");
  return slash >= 0 ? modelId.slice(slash + 1) : modelId;
}

/**
 * Quiet mid-chat model change divider (1:1 Sable `AgentSwitch.tsx`).
 * Shows a centered rule with the newly active model, and offers a 1-click
 * `"Switch back"` action on the most recent switch between turns.
 */
export const AgentSwitchDivider = memo(function AgentSwitchDivider({
  fromModelId,
  toModelId,
  modelOptions,
  isLatest,
  isBusy = false,
  onSwitchBack,
}: {
  fromModelId: string;
  toModelId: string;
  modelOptions?: ModelOption[];
  isLatest: boolean;
  isBusy?: boolean;
  onSwitchBack?: (modelId: string) => void;
}) {
  const [switching, setSwitching] = useState(false);

  const toName = resolveModelLabel(toModelId, modelOptions);
  const fromName = resolveModelLabel(fromModelId, modelOptions);
  const disabled = isBusy || switching;

  const handleBack = () => {
    if (disabled || !onSwitchBack) return;
    setSwitching(true);
    try {
      onSwitchBack(fromModelId);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div
      className="my-3 flex items-center gap-3 select-none"
      data-variant="switch"
      role="separator"
      aria-label={`Switched to ${toName}`}
    >
      <span className="h-px flex-1 bg-border/60" />
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground/75" />
        <span className="truncate">Switched to {toName}</span>
      </span>
      {isLatest && onSwitchBack && (
        <button
          type="button"
          disabled={disabled}
          onClick={handleBack}
          title={`Switch back to ${fromName}`}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          Switch back
        </button>
      )}
      <span className="h-px flex-1 bg-border/60" />
    </div>
  );
});
