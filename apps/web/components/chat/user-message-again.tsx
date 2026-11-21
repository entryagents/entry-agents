"use client";

import { useState } from "react";
import { Loader2, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface UserMessageAgainProps {
  messageId: string;
  isLast: boolean;
  disabled: boolean;
  isEditing?: boolean;
  isRetrying?: boolean;
  onEditAndSendAgain?: (messageId: string) => void | Promise<void>;
  onRetry?: (messageId: string) => void | Promise<void>;
  onPopoverOpenChange?: (open: boolean) => void;
}

/**
 * 1:1 port of Sable's `Again.tsx`:
 * - Edit and send again: instant on the latest user message, inline Popover
 *   confirmation on older turns (since rewinding discards later turns).
 * - Retry: instant 1-click resend on the latest user message.
 */
export function UserMessageAgain({
  messageId,
  isLast,
  disabled,
  isEditing = false,
  isRetrying = false,
  onEditAndSendAgain,
  onRetry,
  onPopoverOpenChange,
}: UserMessageAgainProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onPopoverOpenChange?.(next);
  };

  const handleConfirmEdit = async () => {
    if (disabled || !onEditAndSendAgain) return;
    handleOpenChange(false);
    await onEditAndSendAgain(messageId);
  };

  if (!onEditAndSendAgain && !(isLast && onRetry)) {
    return null;
  }

  return (
    <>
      {onEditAndSendAgain &&
        (isLast ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void onEditAndSendAgain(messageId);
                }}
                disabled={disabled}
                aria-label="Edit and send again"
                className="rounded p-1 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                {isEditing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Pencil className="h-3.5 w-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Edit and send again</TooltipContent>
          </Tooltip>
        ) : (
          <Popover open={open} onOpenChange={handleOpenChange}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={(event) => event.stopPropagation()}
                    disabled={disabled}
                    aria-label="Edit and send again"
                    className="rounded p-1 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                  >
                    {isEditing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" />
                    )}
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">Edit and send again</TooltipContent>
            </Tooltip>
            <PopoverContent
              align="end"
              side="bottom"
              className="w-[288px] p-3.5"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="text-[13.5px] font-semibold text-foreground">
                Edit and send again
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                The message returns to the composer. Everything after it is
                removed from the conversation.
              </p>
              <div className="mt-3 flex justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  disabled={disabled}
                  onClick={() => void handleConfirmEdit()}
                >
                  Rewind and edit
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ))}

      {isLast && onRetry && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onRetry(messageId);
              }}
              disabled={disabled}
              aria-label="Retry"
              className="rounded p-1 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {isRetrying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Retry</TooltipContent>
        </Tooltip>
      )}
    </>
  );
}
