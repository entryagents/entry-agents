"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, ChevronDown, Cpu, Lock, Sparkles } from "lucide-react";
import { type ModelOption, groupByProvider } from "@/lib/model-options";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import type { ReasoningEffortLevel } from "@/lib/model-reasoning";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ProviderIcon,
  getProviderDisplayName,
} from "@/components/provider-icons";

interface ModelSelectorCompactProps {
  value: string;
  modelOptions: ModelOption[];
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** True while a turn is currently running — changing model remains unlocked and applies cleanly to the next prompt. */
  appliesToNextPrompt?: boolean;
  /** Optional integrated reasoning effort controls rendered smoothly inside the popover footer */
  reasoningEffort?: string | null;
  defaultReasoningEffort?: string | null;
  reasoningLevels?: ReasoningEffortLevel[];
  onReasoningEffortChange?: (effort: string) => void;
  onCloseAutoFocus?: () => void;
  /** True when the signed-in user is on the Free plan
   * -- every model not unlocked by the admin in Platform Settings renders
   * locked with an upgrade prompt instead of being selectable. */
  isFreeTierLocked?: boolean;
  /** The primary model ID unlocked by the admin for Free-tier users (or null if none). */
  freePlanModelId?: string | null;
  /** Model IDs unlocked by the admin for Free-tier users. */
  freeTierUnlockedModelIds?: readonly string[];
  /** Called when a Free-tier user clicks "Upgrade" inside the locked-
   * model popup -- typically routes to /pricing. */
  onUpgradeRequired?: () => void;
}

export function ModelSelectorCompact({
  value,
  modelOptions,
  onChange,
  disabled = false,
  appliesToNextPrompt = false,
  reasoningEffort,
  defaultReasoningEffort,
  reasoningLevels = [],
  onReasoningEffortChange,
  onCloseAutoFocus,
  isFreeTierLocked = false,
  freePlanModelId,
  freeTierUnlockedModelIds,
  onUpgradeRequired,
}: ModelSelectorCompactProps) {
  const unlockedModelIds = useMemo(
    () =>
      new Set(
        [freePlanModelId, ...(freeTierUnlockedModelIds ?? [])].filter(
          Boolean,
        ) as string[],
      ),
    [freePlanModelId, freeTierUnlockedModelIds],
  );
  const [open, setOpen] = useState(false);
  const [lockedModel, setLockedModel] = useState<ModelOption | null>(null);
  const [optimisticModelId, setOptimisticModelId] = useState(value);
  const [optimisticEffort, setOptimisticEffort] = useState(reasoningEffort);

  useEffect(() => {
    setOptimisticModelId(value);
  }, [value]);

  useEffect(() => {
    setOptimisticEffort(reasoningEffort);
  }, [reasoningEffort]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const isModelShortcut =
        event.metaKey &&
        event.altKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        event.code === "Slash";

      if (!isModelShortcut || event.repeat) {
        return;
      }

      event.preventDefault();
      setOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled]);

  const handleSelect = (modelId: string) => {
    setOptimisticModelId(modelId);
    onChange(modelId);
    setOpen(false);
  };

  const selectedOption = modelOptions.find(
    (option) => option.id === optimisticModelId,
  );
  const displayText = selectedOption?.shortLabel ?? optimisticModelId;

  const groups = useMemo(() => groupByProvider(modelOptions), [modelOptions]);

  const effectiveEffort =
    (optimisticEffort &&
    reasoningLevels.some((level) => level.value === optimisticEffort)
      ? optimisticEffort
      : null) ??
    (defaultReasoningEffort &&
    reasoningLevels.some((level) => level.value === defaultReasoningEffort)
      ? defaultReasoningEffort
      : null) ??
    reasoningLevels[0]?.value ??
    null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Change model"
            aria-keyshortcuts="Meta+Alt+/"
            title={
              appliesToNextPrompt
                ? "Change model for next prompt (⌘⌥/)"
                : "Change model (⌘⌥/)"
            }
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-300 disabled:pointer-events-none disabled:opacity-60"
          >
            {selectedOption && (
              <ProviderIcon
                provider={selectedOption.provider}
                className="size-3.5 shrink-0"
              />
            )}
            <span className="max-w-[140px] truncate">{displayText}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 p-0"
          align="start"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onCloseAutoFocus?.();
          }}
        >
          <Command>
            <CommandInput placeholder="Search models..." />
            <CommandList className="max-h-72">
              <CommandEmpty>No models found.</CommandEmpty>
              {groups.map((group) => (
                <CommandGroup
                  key={group.provider}
                  heading={getProviderDisplayName(group.provider)}
                >
                  {group.options.map((option) => {
                    const isLocked =
                      isFreeTierLocked && !unlockedModelIds.has(option.id);
                    const isSelected = optimisticModelId === option.id;
                    return (
                      <CommandItem
                        key={option.id}
                        value={`${option.label} ${option.shortLabel} ${option.provider} ${option.id}`}
                        onSelect={() => {
                          if (isLocked) {
                            setOpen(false);
                            setLockedModel(option);
                            return;
                          }
                          handleSelect(option.id);
                        }}
                        className={cn(
                          "flex items-center gap-1.5",
                          isLocked && "opacity-60",
                        )}
                      >
                        <ProviderIcon
                          provider={option.provider}
                          className="mr-0.5 size-3.5 shrink-0 opacity-75"
                        />
                        <span className="min-w-0 truncate">
                          {option.shortLabel}
                        </span>
                        {isLocked ? (
                          <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="size-3" />
                            Upgrade
                          </span>
                        ) : (
                          <>
                            {option.id === APP_DEFAULT_MODEL_ID && (
                              <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                default
                              </span>
                            )}
                            <CheckIcon
                              className={cn(
                                "ml-auto size-4 shrink-0 text-primary transition-opacity",
                                isSelected ? "opacity-100" : "opacity-0",
                              )}
                            />
                          </>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
          {(reasoningLevels.length > 0 && onReasoningEffortChange) ||
          appliesToNextPrompt ? (
            <div className="border-t border-border bg-muted/30 px-2.5 py-2 space-y-2">
              {reasoningLevels.length > 0 && onReasoningEffortChange && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Cpu className="size-3" />
                      Reasoning effort
                    </span>
                    <span className="text-foreground capitalize">
                      {reasoningLevels.find((l) => l.value === effectiveEffort)
                        ?.label ?? effectiveEffort}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {reasoningLevels.map((level) => {
                      const active = effectiveEffort === level.value;
                      return (
                        <button
                          key={level.value}
                          type="button"
                          onClick={() => {
                            setOptimisticEffort(level.value);
                            onReasoningEffortChange(level.value);
                          }}
                          className={cn(
                            "rounded px-2 py-0.5 text-[11px] font-medium transition-all",
                            active
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          {level.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {appliesToNextPrompt && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Changes apply cleanly to your next prompt without interrupting
                  the current run.
                </p>
              )}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      <Dialog
        open={lockedModel !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setLockedModel(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="mb-1 flex size-9 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="size-4.5 text-primary" />
            </div>
            <DialogTitle>
              {lockedModel?.shortLabel ?? "This model"} is a paid model
            </DialogTitle>
            <DialogDescription>
              Your Free plan only includes starter models. Upgrade to Plus, Pro,
              or Max to unlock every model, including{" "}
              {lockedModel?.shortLabel ?? "this one"}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end">
            <Button variant="ghost" onClick={() => setLockedModel(null)}>
              Maybe later
            </Button>
            <Button
              onClick={() => {
                setLockedModel(null);
                onUpgradeRequired?.();
              }}
            >
              Upgrade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
