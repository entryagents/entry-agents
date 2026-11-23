"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

export type ApprovalButtonsProps = {
  approvalId: string;
  onApprove?: (id: string) => void;
  onDeny?: (id: string, reason?: string) => void;
};

export function ApprovalButtons({
  approvalId,
  onApprove,
  onDeny,
}: ApprovalButtonsProps) {
  const [decision, setDecision] = useState<"approved" | "denied" | null>(null);

  if (decision) {
    return (
      <div className="mt-2 flex items-center gap-1.5 pl-5 text-[12px] text-muted-foreground">
        {decision === "approved" ? (
          <>
            <Check className="size-3.5" strokeWidth={1.75} />
            <span>Approved — resuming…</span>
          </>
        ) : (
          <>
            <X className="size-3.5" strokeWidth={1.75} />
            <span>Denied</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2 pl-5">
      <button
        type="button"
        onClick={() => {
          setDecision("approved");
          onApprove?.(approvalId);
        }}
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-foreground px-2.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90"
      >
        <Check className="size-3.5" strokeWidth={1.75} />
        Allow
      </button>
      <button
        type="button"
        onClick={() => {
          setDecision("denied");
          onDeny?.(approvalId);
        }}
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
      >
        <X className="size-3.5" strokeWidth={1.75} />
        Deny
      </button>
    </div>
  );
}
