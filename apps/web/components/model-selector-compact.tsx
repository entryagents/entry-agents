"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronDown, Lock, Sparkles } from "lucide-react";
import { type ModelOption, groupByProvider } from "@/lib/model-options";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
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
  /** Option A: integrated reasoning effort picker rendered in the popover footer. */
  reasoningEffort?: {
    value: string | null;
    levels: Array<{ value: string; label: string }>;
    onChange: (value: string | null) => void;
    disabled?: boolean;
  };
}

export function ModelSelectorCompact({
  value,
  modelOptions,
  onChange,
  disabled = false,
  onCloseAutoFocus,
  isFreeTierLocked = false,
  freePlanModelId,
  freeTierUnlockedModelIds,
  onUpgradeRequired,
  reasoningEffort,
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
  const [search, setSearch] = useState("");
  const [lockedModel, setLockedModel] = useState<ModelOption | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      const input = searchInputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      input.select();
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    focusSearchInput();
  }, [focusSearchInput, open]);

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
      setSearch("");
      setOpen(true);
      focusSearchInput();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, focusSearchInput]);

  const handleSelect = (modelId: string) => {
    onChange(modelId);
    setSearch("");
    setOpen(false);
  };

  const selectedOption = modelOptions.find((option) => option.id === value);
  const displayText = selectedOption?.shortLabel ?? value;

  const groups = useMemo(() => groupByProvider(modelOptions), [modelOptions]);

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setSearch("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Change model"
            aria-keyshortcuts="Meta+Alt+/"
            title="Change model (⌘⌥/)"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-300 disabled:pointer-events-none disabled:opacity-60"
          >
            {selectedOption && (
              <ProviderIcon
                provider={selectedOption.provider}
                className="size-3.5 shrink-0"
              />
            )}
            <span className="max-w-[140px] truncate">{displayText}</span>
            {reasoningEffort?.value && (
              <span className="shrink-0 text-xs text-neutral-400">
                ·{" "}
                {reasoningEffort.levels.find(
                  (l) => l.value === reasoningEffort.value,
                )?.label ?? reasoningEffort.value}
              </span>
            )}
            <ChevronDown className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 p-0"
          align="start"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            focusSearchInput();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onCloseAutoFocus?.();
          }}
        >
          <Command>
            <CommandInput
              ref={searchInputRef}
              value={search}
              onValueChange={setSearch}
              placeholder="Search models..."
            />
            <CommandList>
              <CommandEmpty>No models found.</CommandEmpty>
              {groups.map((group) => (
                <CommandGroup
                  key={group.provider}
                  heading={getProviderDisplayName(group.provider)}
                >
                  {group.options.map((option) => {
                    const isLocked =
                      isFreeTierLocked && !unlockedModelIds.has(option.id);
                    return (
                      <CommandItem
                        key={option.id}
                        value={`${option.label} ${option.id}`}
                        onSelect={() => {
                          if (isLocked) {
                            setOpen(false);
                            setSearch("");
                            setLockedModel(option);
                            return;
                          }
                          handleSelect(option.id);
                        }}
                        className={cn(
                          "flex items-center",
                          isLocked && "opacity-60",
                        )}
                      >
                        <ProviderIcon
                          provider={option.provider}
                          className="mr-1.5 size-3.5 shrink-0 opacity-70"
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
                              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                default
                              </span>
                            )}
                            <CheckIcon
                              className={cn(
                                "ml-auto size-4 shrink-0",
                                value === option.id
                                  ? "opacity-100"
                                  : "opacity-0",
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
          {reasoningEffort && reasoningEffort.levels.length > 0 && (
            <div className="border-t border-border/60 bg-muted/30 p-2">
              <div className="mb-1.5 flex items-center justify-between px-0.5">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Reasoning Effort
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  disabled={reasoningEffort.disabled}
                  onClick={() => reasoningEffort.onChange(null)}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                    reasoningEffort.value === null
                      ? "bg-foreground text-background"
                      : "bg-background/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  Auto
                </button>
                {reasoningEffort.levels.map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    disabled={reasoningEffort.disabled}
                    onClick={() => reasoningEffort.onChange(level.value)}
                    className={cn(
                      "rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                      reasoningEffort.value === level.value
                        ? "bg-foreground text-background"
                        : "bg-background/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>
          )}
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
