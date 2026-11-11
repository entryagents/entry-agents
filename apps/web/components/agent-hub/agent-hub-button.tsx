"use client";

import { formatTokens } from "@entry-agents/shared";
import { Network } from "lucide-react";
import { useMemo, useState } from "react";
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
import { AgentRoster } from "./agent-roster";

/**
 * Agent Hub: live roster + inspector for the subagents of this chat.
 *
 * Read-only view over persisted messages, so it is correct after a page
 * refresh or reconnect -- the durable workflow owns execution, this only
 * renders it. Desktop: right-hand sheet with roster | inspector split.
 * Mobile: full-height bottom sheet; tapping a row opens the inspector
 * with a Back button.
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
  const [mobileInspector, setMobileInspector] = useState(false);

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
    setMobileInspector(true);
  };

  const showRoster = !isMobile || !mobileInspector;
  const showInspector = !isMobile || mobileInspector;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2"
          aria-label={`Agent hub, ${totals.live} running of ${totals.total} subagents`}
        >
          <Network className="h-4 w-4" />
          <span className="hidden sm:inline">Agents</span>
          <span className="font-mono text-xs tabular-nums">
            {totals.live > 0 ? `${totals.live}/${totals.total}` : totals.total}
          </span>
          {totals.live > 0 && (
            <span className="h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "h-[85dvh] gap-0 rounded-t-2xl p-0"
            : "w-full gap-0 p-0 sm:max-w-3xl"
        }
      >
        <SheetHeader className="border-b p-4 pr-12">
          <SheetTitle>Agent hub</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {totals.live} running · {totals.total} total ·{" "}
            {formatTokens(totals.inputTokens)} in /{" "}
            {formatTokens(totals.outputTokens)} out
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1">
          {showRoster && (
            <div className="min-h-0 w-full overflow-y-auto md:w-80 md:shrink-0 md:border-r">
              <AgentRoster
                entries={roster}
                selectedId={selected?.id ?? null}
                onSelect={select}
              />
            </div>
          )}
          {showInspector && selected && (
            <div className="min-h-0 min-w-0 flex-1">
              <AgentInspector
                entry={selected}
                parent={parent}
                childEntries={kids}
                onBack={isMobile ? () => setMobileInspector(false) : undefined}
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
