import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Compass,
  Cpu,
  Hammer,
  Paintbrush,
  ShieldCheck,
  Sparkles,
  Telescope,
  XCircle,
} from "lucide-react";
import type { AgentHubStatus } from "@/lib/agent-hub/derive-roster";
import { cn } from "@/lib/utils";

export const SUBAGENT_TYPE_META: Record<
  string,
  {
    label: string;
    description: string;
    icon: typeof Bot;
    colorClass: string;
    badgeClass: string;
    borderClass: string;
  }
> = {
  executor: {
    label: "Executor",
    description: "Code implementation & build execution",
    icon: Cpu,
    colorClass: "text-violet-600 dark:text-violet-400",
    badgeClass:
      "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/25",
    borderClass: "border-violet-500/30",
  },
  explorer: {
    label: "Explorer",
    description: "Codebase discovery & pattern search",
    icon: Compass,
    colorClass: "text-cyan-600 dark:text-cyan-400",
    badgeClass:
      "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/25",
    borderClass: "border-cyan-500/30",
  },
  reviewer: {
    label: "Reviewer",
    description: "Code review, security & diff checks",
    icon: ShieldCheck,
    colorClass: "text-amber-600 dark:text-amber-400",
    badgeClass:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
    borderClass: "border-amber-500/30",
  },
  design: {
    label: "Design",
    description: "Frontend design, styling & micro-interactions",
    icon: Sparkles,
    colorClass: "text-rose-600 dark:text-rose-400",
    badgeClass:
      "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25",
    borderClass: "border-rose-500/30",
  },
};

export function SubagentIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const meta = SUBAGENT_TYPE_META[type];
  if (meta) {
    const Icon = meta.icon;
    return <Icon className={cn("shrink-0", className)} />;
  }

  switch (type) {
    case "hammer":
      return <Hammer className={cn("shrink-0", className)} />;
    case "telescope":
      return <Telescope className={cn("shrink-0", className)} />;
    case "paintbrush":
      return <Paintbrush className={cn("shrink-0", className)} />;
    default:
      return <Bot className={cn("shrink-0", className)} />;
  }
}

export function SubagentRoleBadge({
  type,
  subagentType,
  className,
}: {
  type?: string;
  subagentType?: string;
  className?: string;
}) {
  const actualType = subagentType ?? type ?? "agent";
  const meta = SUBAGENT_TYPE_META[actualType] ?? {
    label: actualType,
    icon: Bot,
    badgeClass: "bg-muted text-muted-foreground border-border",
  };
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-all",
        meta.badgeClass,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span>{meta.label}</span>
    </span>
  );
}

const STATUS_STYLE: Record<
  AgentHubStatus,
  {
    label: string;
    dot: string;
    text: string;
    bg: string;
    border: string;
    pulse: boolean;
    icon: typeof Bot;
  }
> = {
  starting: {
    label: "Starting",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    pulse: true,
    icon: Clock,
  },
  running: {
    label: "Active",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    pulse: true,
    icon: Bot,
  },
  "awaiting-approval": {
    label: "Approval Needed",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    pulse: false,
    icon: AlertTriangle,
  },
  completed: {
    label: "Finished",
    dot: "bg-neutral-400 dark:bg-neutral-500",
    text: "text-neutral-600 dark:text-neutral-300",
    bg: "bg-muted/70",
    border: "border-border/80",
    pulse: false,
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/25",
    pulse: false,
    icon: XCircle,
  },
  denied: {
    label: "Stopped",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/25",
    pulse: false,
    icon: XCircle,
  },
};

export function StatusBadge({
  status,
  size = "md",
  className,
}: {
  status: AgentHubStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const style = STATUS_STYLE[status];

  if (size === "sm") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.2 text-[10px] font-semibold tabular-nums",
          style.text,
          style.bg,
          style.border,
          className,
        )}
      >
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {style.pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping",
                style.dot,
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex h-1.5 w-1.5 rounded-full",
              style.dot,
            )}
          />
        </span>
        <span>{style.label}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums shadow-2xs transition-all",
        style.text,
        style.bg,
        style.border,
        className,
      )}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {style.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping",
              style.dot,
            )}
          />
        )}
        <span
          className={cn("relative inline-flex h-2 w-2 rounded-full", style.dot)}
        />
      </span>
      <span>{style.label}</span>
    </span>
  );
}
