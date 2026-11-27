"use client";

import { CheckIcon, ChevronDown, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getProviderDisplayName,
  ProviderIcon,
} from "@/components/provider-icons";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { groupByProvider, type ModelOption } from "@/lib/model-options";
import { selectLatestGatewayModelId } from "@/lib/models";
import { cn } from "@/lib/utils";

interface ModelSelectorCompactProps {
  value: string;
  modelOptions: ModelOption[];
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** True while a turn is currently running — changing model remains unlocked and applies cleanly to the next prompt. */
  appliesToNextPrompt?: boolean;
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

  useEffect(() => {
    setOptimisticModelId(value);
  }, [value]);

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

  const latestModelId = useMemo(
    () => selectLatestGatewayModelId(modelOptions),
    [modelOptions],
  );
  const fallbackOption = useMemo(
    () =>
      modelOptions.find((option) => option.id === latestModelId) ??
      modelOptions[0],
    [modelOptions, latestModelId],
  );

  const selectedOption = modelOptions.find(
    (option) => option.id === optimisticModelId,
  );

  useEffect(() => {
    if (
      modelOptions.length > 0 &&
      !selectedOption &&
      fallbackOption &&
      fallbackOption.id !== optimisticModelId
    ) {
      setOptimisticModelId(fallbackOption.id);
      onChange(fallbackOption.id);
    }
  }, [
    modelOptions.length,
    selectedOption,
    fallbackOption,
    optimisticModelId,
    onChange,
  ]);

  const isSelectedModelLocked =
    isFreeTierLocked &&
    Boolean(optimisticModelId) &&
    !unlockedModelIds.has(optimisticModelId);

  const displayText =
    selectedOption?.shortLabel ??
    fallbackOption?.shortLabel ??
    optimisticModelId;

  const groups = useMemo(() => groupByProvider(modelOptions), [modelOptions]);

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
              isSelectedModelLocked
                ? "This model requires a paid plan — click to switch models"
                : appliesToNextPrompt
                  ? "Change model for next prompt (⌘⌥/)"
                  : "Change model (⌘⌥/)"
            }
            className={cn(
              "flex h-8 min-w-0 max-w-full shrink items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background/60 hover:text-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 sm:text-sm",
              isSelectedModelLocked && "text-amber-600 dark:text-amber-400",
            )}
          >
            {selectedOption && (
              <ProviderIcon
                provider={selectedOption.provider}
                className="size-3.5 shrink-0"
              />
            )}
            <span className="max-w-[148px] truncate sm:max-w-[168px]">
              {displayText}
            </span>
            {isSelectedModelLocked && (
              <Lock className="size-3 shrink-0" strokeWidth={1.75} />
            )}
            <ChevronDown className="size-3 shrink-0" strokeWidth={1.5} />
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
                            {option.id === latestModelId && (
                              <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                latest
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
          {appliesToNextPrompt ? (
            <div className="border-t border-border bg-muted/30 px-2.5 py-2">
              <p className="text-[11px] leading-snug text-muted-foreground">
                Changes apply cleanly to your next prompt without interrupting
                the current run.
              </p>
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
            <div className="mb-1 flex size-9 items-center justify-center rounded-full border border-border/70 bg-muted/60">
              <Lock
                className="size-4 text-muted-foreground"
                strokeWidth={1.5}
              />
            </div>
            <DialogTitle>
              {lockedModel?.shortLabel ?? "This model"} is a paid model
            </DialogTitle>
            <DialogDescription>
              Your Free plan only includes starter models. Upgrade to Plus or
              Builder to unlock paid models, including{" "}
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
