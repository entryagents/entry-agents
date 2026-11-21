"use client";

import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
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

export interface UserMessageRewindProps {
  messageId: string;
  disabled: boolean;
  isRewinding?: boolean;
  onRewind: (messageId: string) => void | Promise<void>;
  onPopoverOpenChange?: (open: boolean) => void;
}

/**
 * 1:1 port of Sable's `User.tsx` inline Rewind Popover, replacing jarring
 * `window.confirm` browser dialogs with a calm anchored confirmation.
 */
export function UserMessageRewind({
  messageId,
  disabled,
  isRewinding = false,
  onRewind,
  onPopoverOpenChange,
}: UserMessageRewindProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onPopoverOpenChange?.(next);
  };

  const handleConfirm = async () => {
    if (disabled) return;
    handleOpenChange(false);
    await onRewind(messageId);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(event) => event.stopPropagation()}
              disabled={disabled}
              aria-label="Rewind to here"
              className="rounded p-1 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {isRewinding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Undo2 className="h-3.5 w-3.5" />
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Rewind to here</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-[288px] p-3.5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-[13.5px] font-semibold text-foreground">
          Rewind to here
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          The conversation goes back to just before this message. Everything
          after it is removed.
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
            className="h-7 gap-1.5 px-2.5 text-xs"
            disabled={disabled}
            onClick={() => void handleConfirm()}
          >
            <Undo2 className="h-3 w-3" />
            Rewind
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
