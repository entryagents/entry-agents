"use client";

import {
  Check,
  FolderPlus,
  Loader2,
  MessageSquare,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SessionWithUnread } from "@/hooks/use-sessions";
import { formatCompactAge } from "@/lib/sessions/format-compact-age";

export interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standaloneSessions: SessionWithUnread[];
  onCreateProject: (
    name: string,
    assignSessionIds: string[],
  ) => Promise<void> | void;
}

/**
 * Custom project creation modal with a searchable multi-select list of existing
 * chats — replaces ugly native `<select>` elements with tactile, keyboard-friendly rows.
 */
export function CreateProjectDialog({
  open,
  onOpenChange,
  standaloneSessions,
  onCreateProject,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setSearchQuery("");
      setSelectedIds([]);
      const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return standaloneSessions;
    return standaloneSessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [searchQuery, standaloneSessions]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleSession = (sessionId: string) => {
    setSelectedIds((prev) =>
      prev.includes(sessionId)
        ? prev.filter((id) => id !== sessionId)
        : [...prev, sessionId],
    );
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onCreateProject(trimmed, selectedIds);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-md gap-0 overflow-hidden rounded-2xl border border-border/80 bg-card p-0 shadow-xl">
        <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            <span className="grid size-7 place-items-center rounded-lg border border-border/70 bg-muted/40 text-foreground">
              <FolderPlus className="size-3.5" strokeWidth={1.6} />
            </span>
            <span>New project</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Group related chats together in one shared workspace
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {/* Project Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="create-project-name"
              className="block text-xs font-medium text-foreground"
            >
              Project name
            </label>
            <input
              ref={inputRef}
              id="create-project-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Mobile checkout, Billing refactor"
              maxLength={80}
              disabled={submitting}
              className="h-10 w-full rounded-xl border border-border/80 bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground/65 transition-colors focus:border-foreground/45 focus:outline-none"
            />
          </div>

          {/* Custom Searchable Multi-Select Chat Picker */}
          {standaloneSessions.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">
                  Move existing chats{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </span>
                {selectedIds.length > 0 ? (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono tabular-nums text-foreground">
                      {selectedIds.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
              </div>

              {standaloneSessions.length > 4 ? (
                <div className="flex h-9 items-center gap-2 rounded-xl border border-border/70 bg-background px-3 transition-colors focus-within:border-foreground/40">
                  <Search
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search chats..."
                    disabled={submitting}
                    className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/65 outline-none"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="grid size-5 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="size-3" strokeWidth={1.6} />
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-border/70 bg-background/60 p-1.5">
                {filteredSessions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No matching chats
                  </div>
                ) : (
                  filteredSessions.slice(0, 30).map((sessionItem) => {
                    const checked = selectedSet.has(sessionItem.id);
                    const age = formatCompactAge(
                      sessionItem.lastActivityAt ?? sessionItem.createdAt,
                    );
                    return (
                      <button
                        key={sessionItem.id}
                        type="button"
                        onClick={() => toggleSession(sessionItem.id)}
                        disabled={submitting}
                        aria-pressed={checked}
                        className={`flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 text-left text-xs transition-[background-color,border-color,color] duration-150 ${
                          checked
                            ? "border-foreground/25 bg-foreground/[0.07] text-foreground"
                            : "border-transparent text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground"
                        }`}
                      >
                        <span
                          className={`grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors duration-150 ${
                            checked
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-background text-transparent"
                          }`}
                        >
                          <Check className="size-3" strokeWidth={2.2} />
                        </span>
                        <MessageSquare
                          className="size-3.5 shrink-0 text-muted-foreground/75"
                          strokeWidth={1.5}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {sessionItem.title}
                        </span>
                        {age ? (
                          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">
                            {age}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="h-9 cursor-pointer px-3.5 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !name.trim()}
              className="h-9 cursor-pointer gap-1.5 rounded-lg px-4 text-xs font-medium"
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              <span>Create project</span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
