"use client";

import {
  Bot,
  Compass,
  FileSearch,
  Hammer,
  Palette,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

export function getSubagentRoleTag(subagentType?: string): string {
  switch (subagentType) {
    case "architect":
      return "Architect";
    case "explorer":
      return "Explorer";
    case "executor":
      return "Executor";
    case "design":
      return "Design";
    case "reviewer":
      return "Reviewer";
    case "team":
      return "Team";
    default:
      return "Subagent";
  }
}

export function SubagentIcon({
  subagentType,
  type,
  className = "size-4 shrink-0",
}: {
  subagentType?: string;
  type?: string;
  className?: string;
}) {
  switch (subagentType ?? type) {
    case "architect":
      return <Compass className={className} strokeWidth={1.5} />;
    case "explorer":
      return <FileSearch className={className} strokeWidth={1.5} />;
    case "executor":
      return <Hammer className={className} strokeWidth={1.5} />;
    case "design":
      return <Palette className={className} strokeWidth={1.5} />;
    case "reviewer":
      return <ShieldCheck className={className} strokeWidth={1.5} />;
    case "team":
      return <Users className={className} strokeWidth={1.5} />;
    default:
      return <Bot className={className} strokeWidth={1.5} />;
  }
}

export function StatusBadge({
  status,
  size = "sm",
  className = "",
}: {
  status: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const isLive =
    status === "starting" ||
    status === "running" ||
    status === "awaiting-approval";
  const isFailed = status === "failed" || status === "denied";
  return (
    <span
      className={`inline-flex items-center rounded border font-mono ${
        size === "md" ? "px-2 py-0.5 text-xs" : "px-1.5 py-0.5 text-[10px]"
      } ${
        isLive
          ? "border-border bg-muted text-foreground"
          : isFailed
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-border/70 bg-muted/40 text-muted-foreground"
      } ${className}`}
    >
      {status}
    </span>
  );
}
