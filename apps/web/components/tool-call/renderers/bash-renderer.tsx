"use client";

import { Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
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
  const trimmedStdout = stdout?.replace(/\n+$/, "") ?? "";
  const trimmedStderr =
    stderr && !trimmedStdout.includes(stderr.trim())
      ? stderr.replace(/\n+$/, "")
      : "";
  const hasOutput = Boolean(trimmedStdout || trimmedStderr);
  const firstLine = command.split("\n")[0] ?? "";
  const isMultiline = command.includes("\n");
  const compactCommand =
    firstLine.length > 100
      ? `${firstLine.slice(0, 100)}…`
      : isMultiline
        ? `${firstLine} …`
        : firstLine;
  const displayCommand = cwd ? `${cwd} $ ${compactCommand}` : compactCommand;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div
      className="sable-term"
      data-failed={
        (typeof exitCode === "number" && exitCode !== 0) || undefined
      }
    >
      <div className="sable-term-cmd">
        <span className="sable-term-ps" aria-hidden="true">
          $
        </span>
        <code className="sable-term-line truncate" title={command}>
          {displayCommand}
        </code>
        <span className="sable-term-side">
          {typeof exitCode === "number" && exitCode !== 0 && (
            <span className="sable-term-exit">exit {exitCode}</span>
          )}
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy command"
            data-copied={copied || undefined}
            className="sable-term-copy"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </span>
      </div>

      {hasOutput ? (
        <div className="sable-term-out">
          <div className="sable-term-flow">
            {trimmedStdout && (
              <pre className="whitespace-pre-wrap! break-words [overflow-wrap:anywhere]">
                {trimmedStdout}
              </pre>
            )}
            {trimmedStderr && (
              <pre className="sable-term-err whitespace-pre-wrap! break-words [overflow-wrap:anywhere]">
                {trimmedStderr}
              </pre>
            )}
          </div>
        </div>
      ) : (
        <div className="sable-term-empty">No output</div>
      )}
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

  const mergedState =
    isError && !state.error
      ? { ...state, error: `Exit code ${exitCode ?? "unknown"}` }
      : state;

  const meta = isDetached ? "detached" : undefined;

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
      summary={command.split("\n")[0] || "..."}
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
