"use client";

import { useState } from "react";
import { CheckIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReasoningEffortLevel } from "@/lib/model-reasoning";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ReasoningEffortSelectorProps {
  value: string | null;
  defaultEffort?: string | null;
  /**
   * The actual levels this specific model accepts (value + label pairs),
   * from the gateway model metadata / lib/model-reasoning.ts.
   */
  levels: ReasoningEffortLevel[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Compact effort picker shown next to ModelSelectorCompact only when the
 * currently selected model supports reasoning effort. Renders only the
 * gateway's actual reasoning levels (no hardcoded "Auto").
 */
export function ReasoningEffortSelector({
  value,
  defaultEffort,
  levels,
  onChange,
  disabled = false,
}: ReasoningEffortSelectorProps) {
  const [open, setOpen] = useState(false);

  if (levels.length === 0) {
    return null;
  }

  const effectiveValue =
    (value && levels.some((l) => l.value === value) ? value : null) ??
    (defaultEffort && levels.some((l) => l.value === defaultEffort)
      ? defaultEffort
      : null) ??
    levels[0]?.value ??
    null;

  const selected = effectiveValue
    ? levels.find((level) => level.value === effectiveValue)
    : undefined;
  const displayLabel = selected?.label ?? levels[0]?.label ?? "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title="Reasoning effort"
          aria-label="Reasoning effort"
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-300 disabled:pointer-events-none disabled:opacity-60"
        >
          <span className="max-w-[80px] truncate">{displayLabel}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-1" align="start">
        {levels.map((level) => (
          <button
            key={level.value}
            type="button"
            onClick={() => {
              onChange(level.value);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
            )}
          >
            <CheckIcon
              className={cn(
                "size-3.5 shrink-0",
                effectiveValue === level.value ? "opacity-100" : "opacity-0",
              )}
            />
            {level.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
