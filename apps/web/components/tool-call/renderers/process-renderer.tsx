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
        <div className="sable-detail-stack">
          {processes.map((proc) => (
            <div key={proc.id} className="sable-term">
              <div className="sable-term-cmd">
                <span className="sable-term-ps" aria-hidden>
                  $
                </span>
                <code className="sable-term-line">
                  {proc.command || proc.id}
                </code>
                <span className="sable-term-side">
                  <span className="sable-term-note">
                    {proc.pid ? `pid ${proc.pid} · ` : ""}
                    {proc.alive ? "running" : "exited"}
                  </span>
                </span>
              </div>
              {proc.recentLogs && (
                <div className="sable-term-out">
                  <pre>{proc.recentLogs}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </ToolLayout>
  );
}
