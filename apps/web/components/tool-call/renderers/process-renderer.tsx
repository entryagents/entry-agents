"use client";

import type { WebAgentUIToolPart } from "@/app/types";
import { ToolLayout } from "../tool-layout";
import type { ToolRenderState } from "@/app/lib/render-tool";

interface ProcessRendererProps {
  part: WebAgentUIToolPart;
  state: ToolRenderState;
  onApprove?: (id: string) => void;
  onDeny?: (id: string, reason?: string) => void;
}

export function ProcessRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ProcessRendererProps) {
  const isKill = part.type === "tool-kill_process";
  const input = (part.input ?? {}) as {
    processId?: string;
    target?: string;
    tailLines?: number;
  };
  const output = (part.output ?? {}) as {
    success?: boolean;
    processes?: Array<{
      id: string;
      pid: number | null;
      alive: boolean;
      command: string;
      recentLogs?: string;
    }>;
    listeningPorts?: string[];
    status?: string;
    output?: string;
  };

  if (isKill) {
    const target = input.target ?? "process";
    const meta =
      part.state === "output-available" ? (output.status ?? "Done") : undefined;
    return (
      <ToolLayout
        name="Kill Process"
        summary={target}
        summaryClassName="font-mono"
        meta={meta}
        state={state}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
  }

  const processes = output.processes ?? [];
  const aliveCount = processes.filter((p) => p.alive).length;
  const summary = input.processId
    ? input.processId
    : "Background processes & ports";
  const meta =
    part.state === "output-available"
      ? `${aliveCount}/${processes.length} alive`
      : undefined;

  return (
    <ToolLayout
      name="Process Status"
      summary={summary}
      summaryClassName="font-mono"
      meta={meta}
      state={state}
      onApprove={onApprove}
      onDeny={onDeny}
    >
      {part.state === "output-available" && processes.length > 0 && (
        <div className="space-y-1.5 text-xs">
          {processes.map((proc) => (
            <div
              key={proc.id}
              className="rounded border border-border/60 bg-muted/30 p-2 font-mono"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">
                  {proc.id}
                  {proc.pid ? ` (pid ${proc.pid})` : ""}
                </span>
                <span
                  className={
                    proc.alive
                      ? "shrink-0 text-emerald-500"
                      : "shrink-0 text-muted-foreground"
                  }
                >
                  {proc.alive ? "running" : "exited"}
                </span>
              </div>
              {proc.command && (
                <div className="mt-0.5 truncate text-muted-foreground">
                  $ {proc.command}
                </div>
              )}
              {proc.recentLogs && (
                <pre className="mt-1.5 max-h-[min(9rem,40vh)] overflow-auto whitespace-pre-wrap break-all rounded bg-background/60 p-1.5 text-[11px] text-muted-foreground">
                  {proc.recentLogs}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </ToolLayout>
  );
}
