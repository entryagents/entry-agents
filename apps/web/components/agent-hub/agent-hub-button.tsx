"use client";

import { formatTokens } from "@entry-agents/shared";
import { Network } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  deriveAgentHubRoster,
  summarizeAgentHub,
} from "@/lib/agent-hub/derive-roster";
import { AgentInspector } from "./agent-inspector";

/**
 * Agent Hub: live roster + inspector for the subagents of this chat.
 *
 * Read-only view over persisted messages, so it is correct after a page
 * refresh or reconnect -- the durable workflow owns execution, this only
 * renders it. Desktop: right-hand sheet with roster | inspector split.
 * Mobile: full-height bottom sheet with pull handle; tapping a row opens the
 * inspector with a Back button.
 * Keyboard shortcut: Alt+A or Ctrl+Shift+A opens/toggles the hub.
 */
export function AgentHubButton({
  messages,
  onStopRun,
}: {
  messages: unknown;
  onStopRun?: () => void;
}) {
  const isMobile = useIsMobile();
  const roster = useMemo(() => deriveAgentHubRoster(messages), [messages]);
  const totals = useMemo(() => summarizeAgentHub(roster), [roster]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keyboard shortcut listener (Alt+A or Option+A or Ctrl+Shift+A)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.altKey && e.code === "KeyA") ||
        (e.ctrlKey && e.shiftKey && e.code === "KeyA")
      ) {
        // Only trigger if subagents exist
        if (roster.length > 0) {
          e.preventDefault();
          setOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [roster.length]);

  if (roster.length === 0) return null;

  const selected =
    roster.find((entry) => entry.id === selectedId) ??
    roster.find((entry) => entry.status === "running") ??
    roster[roster.length - 1] ??
    null;
  const parent = selected?.parentId
    ? (roster.find((entry) => entry.id === selected.parentId) ?? null)
    : null;
  const kids = selected
    ? roster.filter((entry) => entry.parentId === selected.id)
    : [];

  const select = (id: string) => {
    setSelectedId(id);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 active:scale-[0.97] transition-transform"
          aria-label={`Agent hub, ${totals.live} running of ${totals.total} subagents`}
        >
          <Network className="h-4 w-4" />
          <span className="hidden sm:inline font-medium">Agents</span>
          <span className="font-mono text-xs tabular-nums">
            {totals.live > 0 ? `${totals.live}/${totals.total}` : totals.total}
          </span>
          {totals.live > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "h-[88dvh] gap-0 rounded-t-2xl p-0 flex flex-col"
            : "w-full gap-0 p-0 sm:max-w-3xl flex flex-col"
        }
      >
        {/* Mobile pull handle */}
        {isMobile && (
          <div className="pt-2 pb-1 shrink-0 flex justify-center">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>
        )}

        <SheetHeader className="border-b border-border/80 p-4 pr-12 shrink-0 bg-muted/10">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base font-semibold">
              <Network className="h-4 w-4 text-primary" />
              <span>Agent Hub</span>
              <kbd className="hidden sm:inline-block rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                Alt+A
              </kbd>
            </SheetTitle>
          </div>
          <SheetDescription className="font-mono text-xs text-muted-foreground mt-1">
            <span className="text-foreground font-medium">
              {totals.live} active
            </span>{" "}
            · <span>{totals.total} total</span> ·{" "}
            <span className="tabular-nums">
              {formatTokens(totals.inputTokens)} in
            </span>{" "}
            /{" "}
            <span className="tabular-nums">
              {formatTokens(totals.outputTokens)} out
            </span>
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {selected && (
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <AgentInspector
                entry={selected}
                parent={parent}
                childEntries={kids}
                onSelect={select}
                onStopRun={onStopRun}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
