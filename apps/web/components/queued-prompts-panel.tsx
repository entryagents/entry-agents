"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  FastForward,
  GripVertical,
  ListOrdered,
  Pencil,
  X,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type QueuedPrompt = {
  id: string;
  displayText: string;
};

/**
 * Blur-vs-explicit-action ordering, extracted so it can be tested without a
 * DOM. The browser fires `blur` BEFORE the `click` that follows it, so a
 * plain "commit on blur" makes every Cancel press silently SAVE instead --
 * the blur handler ran first and committed before Cancel ever saw the click.
 *
 * The action buttons claim the blur (onMouseDown/onTouchStart both precede
 * blur); this rule is what honours that claim. Returns false when there is
 * nothing to commit OR when an explicit action already owns the blur.
 */
export function shouldCommitOnBlur(params: {
  editingId: string | null;
  claimedByAction: boolean;
}): boolean {
  return params.editingId !== null && !params.claimedByAction;
}

export type QueuedPromptsPanelProps<T extends QueuedPrompt> = {
  prompts: T[];
  isBusy?: boolean;
  onRemove: (id: string) => void;
  onEdit: (id: string, nextText: string) => void;
  onReorder: (nextOrder: T[]) => void;
  onSteerNow?: (prompt: T) => void;
};

function reorder<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Shows prompts queued while a turn is running (1:1 Sable QueueTray polish).
 * Supports inline edit, drag/button reorder, remove, and immediate Steer-now
 * promotion into the running agent's steering inbox.
 */
export function QueuedPromptsPanel<T extends QueuedPrompt>({
  prompts,
  isBusy = false,
  onRemove,
  onEdit,
  onReorder,
  onSteerNow,
}: QueuedPromptsPanelProps<T>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const claimBlurRef = useRef(false);

  useEffect(() => {
    const node = editInputRef.current;
    if (!node) {
      return;
    }
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [draftText, editingId]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      const len = editInputRef.current.value.length;
      editInputRef.current.setSelectionRange(len, len);
    }
  }, [editingId]);

  useEffect(() => {
    if (editingId && !prompts.some((p) => p.id === editingId)) {
      setEditingId(null);
    }
  }, [editingId, prompts]);

  if (prompts.length === 0) {
    return null;
  }

  function startEditing(prompt: T) {
    setEditingId(prompt.id);
    setDraftText(prompt.displayText);
  }

  function commitEdit() {
    const claimedByAction = claimBlurRef.current;
    claimBlurRef.current = false;
    if (!shouldCommitOnBlur({ editingId, claimedByAction })) {
      return;
    }
    const id = editingId;
    if (!id) {
      return;
    }
    const trimmed = draftText.trim();
    const original = prompts.find((p) => p.id === id);
    setEditingId(null);
    if (!trimmed) {
      onRemove(id);
      return;
    }
    if (original && trimmed !== original.displayText.trim()) {
      onEdit(id, trimmed);
    }
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commitEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  }

  function moveBy(id: string, delta: number) {
    const fromIndex = prompts.findIndex((p) => p.id === id);
    if (fromIndex === -1) {
      return;
    }
    const toIndex = fromIndex + delta;
    if (toIndex < 0 || toIndex >= prompts.length) {
      return;
    }
    onReorder(reorder(prompts, fromIndex, toIndex));
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const fromIndex = prompts.findIndex((p) => p.id === dragId);
    const toIndex = prompts.findIndex((p) => p.id === targetId);
    if (fromIndex === -1 || toIndex === -1) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    onReorder(reorder(prompts, fromIndex, toIndex));
    setDragId(null);
    setDragOverId(null);
  }

  return (
    <section
      aria-label="Queued messages"
      className="mx-3 overflow-hidden rounded-t-xl border border-b-0 border-border/60 bg-card/95 backdrop-blur-sm sm:mx-4"
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <ListOrdered className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        <span className="text-xs font-medium text-muted-foreground">
          Queued
        </span>
        <span className="text-xs font-medium tabular-nums text-muted-foreground/70">
          {prompts.length}
        </span>
      </div>
      <div className="max-h-[152px] space-y-0.5 overflow-y-auto border-t border-border/40 px-1.5 py-1.5">
        {prompts.map((prompt, index) => {
          const isEditing = editingId === prompt.id;
          const isDragging = dragId === prompt.id;
          const isDropTarget = dragOverId === prompt.id && dragId !== prompt.id;
          const canSteerNow =
            isBusy &&
            Boolean(onSteerNow) &&
            prompt.displayText.trim().length > 0;

          return (
            <div
              key={prompt.id}
              onDragOver={(event) => {
                if (!dragId || dragId === prompt.id) {
                  return;
                }
                event.preventDefault();
                setDragOverId(prompt.id);
              }}
              onDragLeave={() => {
                setDragOverId((current) =>
                  current === prompt.id ? null : current,
                );
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(prompt.id);
              }}
              className={cn(
                "group relative flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/50 focus-within:bg-muted/50",
                isDragging && "opacity-40",
                isDropTarget &&
                  "ring-2 ring-primary/50 ring-offset-1 ring-offset-card",
              )}
            >
              <button
                type="button"
                draggable={!isEditing}
                onDragStart={(event) => {
                  setDragId(prompt.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                className="hidden shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground/35 transition-colors hover:bg-muted hover:text-muted-foreground active:cursor-grabbing sm:inline-flex"
                aria-label="Drag to reorder"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
              <div className="flex shrink-0 flex-col sm:hidden">
                <button
                  type="button"
                  onClick={() => moveBy(prompt.id, -1)}
                  disabled={index === 0}
                  className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                  aria-label="Move up"
                  title="Move up"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => moveBy(prompt.id, 1)}
                  disabled={index === prompts.length - 1}
                  className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                  aria-label="Move down"
                  title="Move down"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
              <span className="w-4 shrink-0 text-center font-mono text-[11px] tabular-nums text-muted-foreground/55">
                {index + 1}
              </span>
              {isEditing ? (
                <textarea
                  ref={editInputRef}
                  value={draftText}
                  onChange={(event) => setDraftText(event.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={commitEdit}
                  className="max-h-40 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent text-xs leading-snug text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-[13px]"
                  placeholder="Edit queued message…"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEditing(prompt)}
                  className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground transition-colors group-hover:text-foreground sm:text-[13px]"
                  title="Click to edit"
                >
                  {prompt.displayText.trim() || "(attachment only)"}
                </button>
              )}
              <div
                className={cn(
                  "flex shrink-0 items-center gap-0.5 transition-opacity",
                  !isEditing &&
                    "sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
                )}
              >
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onMouseDown={() => {
                        claimBlurRef.current = true;
                      }}
                      onTouchStart={() => {
                        claimBlurRef.current = true;
                      }}
                      onClick={commitEdit}
                      className="rounded p-1 text-emerald-500/80 transition-colors hover:bg-emerald-500/10 hover:text-emerald-500"
                      aria-label="Save edit"
                      title="Save (Enter)"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={() => {
                        claimBlurRef.current = true;
                      }}
                      onTouchStart={() => {
                        claimBlurRef.current = true;
                      }}
                      onClick={cancelEdit}
                      className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Cancel edit"
                      title="Discard changes (Esc)"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    {canSteerNow && (
                      <button
                        type="button"
                        onClick={() => onSteerNow?.(prompt)}
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Steer now"
                        title="Steer now (inject into active run)"
                      >
                        <FastForward className="h-3 w-3" />
                        <span className="hidden sm:inline">Steer</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEditing(prompt)}
                      className="rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Edit queued prompt"
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(prompt.id)}
                      className="rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Remove queued prompt"
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
