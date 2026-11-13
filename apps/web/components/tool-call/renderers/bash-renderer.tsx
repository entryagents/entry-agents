"use client";

import { Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { cn } from "@/lib/utils";
import { ToolLayout } from "../tool-layout";

function TerminalOutputCard({
  command,
  cwd,
  stdout,
  stderr,
  exitCode,
}: {
  command: string;
  cwd?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
}) {
  const [copied, setCopied] = useState(false);
  const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
  const textToCopy = combined ? `$ ${command}\n${combined}` : `$ ${command}`;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-lg border border-border/80 bg-zinc-950 dark:bg-black font-mono text-xs shadow-xs">
      {/* Terminal Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/60 px-3 py-1.5 text-[11px] text-zinc-400 select-none min-w-0 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="h-2 w-2 rounded-full bg-zinc-600/70" />
            <span className="h-2 w-2 rounded-full bg-zinc-600/70" />
            <span className="h-2 w-2 rounded-full bg-zinc-600/70" />
          </div>
          <span className="truncate text-zinc-300 font-medium font-mono min-w-0">
            {cwd ? `${cwd} $` : "$"} {command}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {exitCode !== undefined && exitCode !== null && (
            <span
              className={cn(
                "rounded px-1.5 py-0.2 text-[10px] font-mono",
                exitCode === 0
                  ? "text-emerald-400 bg-emerald-950/60 border border-emerald-800/40"
                  : "text-rose-400 bg-rose-950/60 border border-rose-800/40",
              )}
            >
              exit {exitCode}
            </span>
          )}

          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy terminal command and output"
            className="inline-flex items-center gap-1 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div className="max-h-[min(18rem,55vh)] overflow-x-auto overflow-y-auto p-3 text-[12px] leading-relaxed selection:bg-emerald-900 selection:text-white min-w-0">
        {stdout && (
          <pre className="whitespace-pre-wrap break-words break-all text-zinc-200">
            {stdout.trim()}
          </pre>
        )}
        {stderr && (
          <pre
            className={cn(
              "whitespace-pre-wrap break-words break-all text-rose-400",
              stdout && "mt-2 pt-2 border-t border-zinc-800/60",
            )}
          >
            {stderr.trim()}
          </pre>
        )}
        {!stdout && !stderr && (
          <span className="text-zinc-500 italic">(No output)</span>
        )}
      </div>
    </div>
  );
}

export function BashRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-bash">) {
  const input = part.input;
  const command = String(input?.command ?? "");
  const cwd = input?.cwd;
  const isDetached = input?.detached === true;

  const output = part.state === "output-available" ? part.output : undefined;
  const exitCode = output?.exitCode;
  const stdout = output?.stdout;
  const stderr = output?.stderr;
  const toolFailed = output?.success === false;
  const isError =
    toolFailed || (typeof exitCode === "number" && exitCode !== 0);

  const hasExpandableContent =
    part.state === "output-available" || Boolean(cwd) || isDetached;

  // When bash errors, route through the standard error UI in ToolLayout.
  // The minimized view will show: [CircleX] Error  Exit code N
  // The expanded view uses our custom terminal card.
  const mergedState =
    isError && !state.error
      ? { ...state, error: `Exit code ${exitCode ?? "unknown"}` }
      : state;

  const meta = isDetached ? (
    <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[11px] font-medium text-blue-500">
      detached
    </span>
  ) : undefined;

  const errorMetaContent =
    isError && exitCode !== undefined ? `exit ${exitCode}` : undefined;

  const expandedContent = hasExpandableContent ? (
    <TerminalOutputCard
      command={command}
      cwd={cwd}
      stdout={stdout}
      stderr={stderr}
      exitCode={exitCode}
    />
  ) : undefined;

  return (
    <ToolLayout
      name="Bash"
      summary={command || "..."}
      summaryClassName="font-mono"
      meta={meta}
      errorMeta={errorMetaContent}
      state={mergedState}
      icon={<Terminal className="h-3.5 w-3.5" />}
      expandedContent={expandedContent}
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
