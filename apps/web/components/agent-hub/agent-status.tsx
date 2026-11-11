import { Bot, Hammer, Paintbrush, ShieldCheck, Telescope } from "lucide-react";
import type { AgentHubStatus } from "@/lib/agent-hub/derive-roster";
import { cn } from "@/lib/utils";

export function SubagentIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  switch (type) {
    case "executor":
      return <Hammer className={className} />;
    case "design":
      return <Paintbrush className={className} />;
    case "explorer":
      return <Telescope className={className} />;
    case "reviewer":
      return <ShieldCheck className={className} />;
    default:
      return <Bot className={className} />;
  }
}

const STATUS_STYLE: Record<
  AgentHubStatus,
  { label: string; dot: string; text: string; pulse: boolean }
> = {
  starting: {
    label: "Starting",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    pulse: true,
  },
  running: {
    label: "Running",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    pulse: true,
  },
  "awaiting-approval": {
    label: "Needs approval",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    pulse: false,
  },
  completed: {
    label: "Done",
    dot: "bg-neutral-400",
    text: "text-neutral-500",
    pulse: false,
  },
  failed: {
    label: "Failed",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    pulse: false,
  },
  denied: {
    label: "Denied",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    pulse: false,
  },
};

export function StatusBadge({ status }: { status: AgentHubStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        style.text,
      )}
    >
      <span className="relative flex h-2 w-2">
        {style.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping",
              style.dot,
            )}
          />
        )}
        <span
          className={cn("relative inline-flex h-2 w-2 rounded-full", style.dot)}
        />
      </span>
      {style.label}
    </span>
  );
}
