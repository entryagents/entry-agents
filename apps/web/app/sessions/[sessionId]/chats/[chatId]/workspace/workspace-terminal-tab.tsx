"use client";

import {
  Check,
  Copy,
  CornerDownLeft,
  ExternalLink,
  Loader2,
  Terminal as TerminalIcon,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DevUrlChip,
  extractDevUrls,
} from "@/components/workspace/dev-url-chip";
import { parseAnsiSegments } from "@/lib/terminal/ansi";
import { cn } from "@/lib/utils";
import type { TerminalExecResponse } from "@/app/api/sessions/[sessionId]/terminal/route";

interface TerminalLogEntry {
  id: string;
  command: string;
  cwd: string;
  timestamp: Date;
  durationMs?: number;
  result?: TerminalExecResponse;
  error?: string;
  running?: boolean;
}

const QUICK_COMMANDS = [
  { label: "git status", cmd: "git status" },
  { label: "git diff --stat", cmd: "git diff --stat" },
  { label: "pnpm test", cmd: "pnpm test" },
  { label: "ls -la", cmd: "ls -la" },
];

function AnsiText({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => parseAnsiSegments(text), [text]);
  return (
    <pre
      className={cn(
        "overflow-x-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] pl-3 border-l border-zinc-800/80 font-mono text-xs leading-5",
        className,
      )}
    >
      {segments.map((seg, index) => {
        const styleClass = cn(
          seg.style.fgClass,
          seg.style.bold && "font-medium",
          seg.style.dim && "opacity-65",
          seg.style.italic && "italic",
          seg.style.underline && "underline",
        );
        return styleClass ? (
          <span key={index} className={styleClass}>
            {seg.text}
          </span>
        ) : (
          seg.text
        );
      })}
    </pre>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function WorkspaceTerminalTab({
  sessionId,
  canRun = true,
  onOpenPreview,
}: {
  sessionId: string;
  canRun?: boolean;
  onOpenPreview?: (url: string) => void;
}) {
  const router = useRouter();
  const [logs, setLogs] = useState<TerminalLogEntry[]>(() => {
    if (typeof window === "undefined" || !sessionId) return [];
    try {
      const stored = localStorage.getItem(`entry:terminal-logs:${sessionId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => ({
            ...item,
            timestamp: new Date(item.timestamp),
          }));
        }
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [currentCwd, setCurrentCwd] = useState<string | undefined>(undefined);
  const [inputCommand, setInputCommand] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandHistory, setCommandHistory] = useState<string[]>(() => {
    if (typeof window === "undefined" || !sessionId) return [];
    try {
      const stored = localStorage.getItem(
        `entry:terminal-history:${sessionId}`,
      );
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionId) return;
    try {
      localStorage.setItem(
        `entry:terminal-logs:${sessionId}`,
        JSON.stringify(logs.slice(-50)),
      );
    } catch {
      // ignore
    }
  }, [sessionId, logs]);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionId) return;
    try {
      localStorage.setItem(
        `entry:terminal-history:${sessionId}`,
        JSON.stringify(commandHistory.slice(0, 50)),
      );
    } catch {
      // ignore
    }
  }, [sessionId, commandHistory]);

  const scrollToBottom = useCallback(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logs, scrollToBottom]);

  const handleClear = useCallback(() => {
    setLogs([]);
    if (typeof window !== "undefined" && sessionId) {
      try {
        localStorage.removeItem(`entry:terminal-logs:${sessionId}`);
      } catch {
        // ignore
      }
    }
  }, [sessionId]);

  const executeCommand = useCallback(
    async (cmdToRun: string) => {
      const trimmed = cmdToRun.trim();
      if (!trimmed || isRunning || !canRun) return;

      if (trimmed === "clear") {
        setInputCommand("");
        handleClear();
        return;
      }

      const logId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const startedAt = Date.now();
      const newEntry: TerminalLogEntry = {
        id: logId,
        command: trimmed,
        cwd: currentCwd ?? "~",
        timestamp: new Date(),
        running: true,
      };

      setLogs((prev) => [...prev, newEntry]);
      setCommandHistory((prev) => [
        trimmed,
        ...prev.filter((c) => c !== trimmed),
      ]);
      setHistoryIndex(-1);
      setInputCommand("");
      setIsRunning(true);

      // If user runs `cd <dir>`, resolve new cwd via pwd so subsequent commands stay in that directory
      const isCdOnly =
        /^cd(?:\s+|$)/.test(trimmed) &&
        !trimmed.includes("&&") &&
        !trimmed.includes(";");
      const effectiveCommand = isCdOnly ? `${trimmed} && pwd` : trimmed;

      try {
        const response = await fetch(`/api/sessions/${sessionId}/terminal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: effectiveCommand,
            ...(currentCwd ? { cwd: currentCwd } : {}),
          }),
        });

        const data: unknown = await response.json().catch(() => null);
        const durationMs = Date.now() - startedAt;

        if (!response.ok) {
          const err =
            (data as { error?: string })?.error ??
            `Command failed with HTTP ${response.status}`;
          setLogs((prev) =>
            prev.map((l) =>
              l.id === logId
                ? { ...l, running: false, durationMs, error: err }
                : l,
            ),
          );
        } else {
          const res = data as TerminalExecResponse;
          if (isCdOnly && res.success) {
            const nextDir = res.stdout.trim().split("\n").pop()?.trim();
            if (nextDir) {
              setCurrentCwd(nextDir);
            }
          }
          setLogs((prev) =>
            prev.map((l) =>
              l.id === logId
                ? {
                    ...l,
                    running: false,
                    durationMs,
                    cwd: res.cwd,
                    result:
                      isCdOnly && res.success ? { ...res, stdout: "" } : res,
                  }
                : l,
            ),
          );
        }
      } catch (err) {
        const durationMs = Date.now() - startedAt;
        setLogs((prev) =>
          prev.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  running: false,
                  durationMs,
                  error: err instanceof Error ? err.message : "Network error",
                }
              : l,
          ),
        );
      } finally {
        setIsRunning(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [canRun, currentCwd, handleClear, isRunning, sessionId],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      handleClear();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      void executeCommand(inputCommand);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const nextIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(nextIndex);
        setInputCommand(commandHistory[nextIndex] ?? "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setInputCommand(commandHistory[nextIndex] ?? "");
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputCommand("");
      }
    }
  };

  const handleCopy = () => {
    const text = logs
      .map((l) => {
        const out = l.result?.stdout ?? "";
        const err = l.result?.stderr ?? l.error ?? "";
        return `$ ${l.command}\n${out}${err ? `\n${err}` : ""}`;
      })
      .join("\n\n");
    void navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Terminal output copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRerun = useCallback(
    (cmd: string) => {
      void executeCommand(cmd);
    },
    [executeCommand],
  );

  const handleOutputMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.toString().length === 0) {
      inputRef.current?.focus();
    }
  }, []);

  const shortCwd = currentCwd
    ? currentCwd.split("/").slice(-2).join("/") || "/"
    : "~";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-950 font-mono text-zinc-100">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-950 px-3 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <TerminalIcon
            className="h-3.5 w-3.5 shrink-0 text-zinc-400"
            strokeWidth={1.5}
          />
          <span className="truncate text-zinc-200">{shortCwd}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-zinc-400">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isRunning
                  ? "bg-amber-400"
                  : canRun
                    ? "bg-emerald-400"
                    : "bg-zinc-600",
              )}
            />
            {isRunning ? "Running" : canRun ? "Ready" : "Offline"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleCopy}
                disabled={logs.length === 0}
                className="rounded-md p-1.5 text-zinc-400 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-zinc-900 hover:text-zinc-200 disabled:opacity-35 cursor-pointer"
                aria-label="Copy terminal output"
              >
                {copied ? (
                  <Check
                    className="h-3.5 w-3.5 text-emerald-400"
                    strokeWidth={1.5}
                  />
                ) : (
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Copy output</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleClear}
                disabled={logs.length === 0}
                className="rounded-md p-1.5 text-zinc-400 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-zinc-900 hover:text-zinc-200 disabled:opacity-35 cursor-pointer"
                aria-label="Clear terminal"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => router.push(`/codespace/${sessionId}`)}
                className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-2 py-1 text-[11px] font-sans font-medium text-zinc-300 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-zinc-900 hover:text-zinc-100 cursor-pointer"
              >
                <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                <span className="hidden sm:inline">Full shell</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Open full workspace editor
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div
        role="log"
        aria-label="Terminal output"
        onMouseUp={handleOutputMouseUp}
        className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 text-xs leading-5 selection:bg-zinc-700 selection:text-zinc-50"
      >
        {logs.length === 0 ? (
          <div className="flex h-full min-h-[160px] flex-col items-start justify-end gap-3 pb-1 font-sans">
            <div className="space-y-1">
              <p className="text-xs font-medium text-zinc-300">
                {canRun ? "Sandbox shell" : "Sandbox offline"}
              </p>
              <p className="text-xs text-zinc-500">
                {canRun
                  ? "Run a command below or start with a common check"
                  : "Start or resume a workspace sandbox to run shell commands"}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 font-mono">
              {QUICK_COMMANDS.map((qc) => (
                <button
                  key={qc.label}
                  type="button"
                  onClick={() => void executeCommand(qc.cmd)}
                  disabled={isRunning || !canRun}
                  className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-40 cursor-pointer"
                >
                  $ {qc.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-900">
            {logs.map((log) => (
              <div
                key={log.id}
                className="group space-y-1.5 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 text-emerald-400">$</span>
                    <span className="truncate font-medium text-zinc-100">
                      {log.command}
                    </span>
                    {log.running ? (
                      <Loader2 className="ml-1 h-3 w-3 shrink-0 animate-spin text-amber-400" />
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {extractDevUrls(
                      `${log.result?.stdout ?? ""}\n${log.result?.stderr ?? ""}`,
                    )
                      .slice(0, 2)
                      .map((devUrl) => (
                        <DevUrlChip
                          key={devUrl.url}
                          url={devUrl.url}
                          label={devUrl.label}
                          onOpenPreview={onOpenPreview}
                        />
                      ))}
                    {log.result &&
                    log.result.exitCode !== null &&
                    log.result.exitCode !== 0 ? (
                      <span className="rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-0.5 text-[10px] tabular-nums text-rose-400">
                        exit {log.result.exitCode}
                      </span>
                    ) : null}
                    {log.durationMs !== undefined ? (
                      <span className="text-[11px] tabular-nums text-zinc-500">
                        {formatDuration(log.durationMs)}
                      </span>
                    ) : null}
                    {!log.running && canRun ? (
                      <button
                        type="button"
                        onClick={() => handleRerun(log.command)}
                        disabled={isRunning}
                        className="rounded px-1.5 py-0.5 text-[10px] font-sans text-zinc-400 opacity-0 transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 focus:opacity-100 hover:bg-zinc-900 hover:text-zinc-200 disabled:opacity-0 cursor-pointer"
                      >
                        Re-run
                      </button>
                    ) : null}
                  </div>
                </div>

                {log.result?.stdout ? (
                  <AnsiText
                    text={log.result.stdout}
                    className="text-zinc-300"
                  />
                ) : null}

                {log.result?.stderr ? (
                  <AnsiText
                    text={log.result.stderr}
                    className="border-rose-900/60 text-rose-400"
                  />
                ) : null}

                {log.error ? (
                  <div className="border-l border-rose-900 pl-3 text-rose-400">
                    {log.error}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <div ref={outputEndRef} />
      </div>

      {/* Prompt Input Line */}
      <div className="flex shrink-0 items-center gap-2 border-t border-zinc-800/80 bg-zinc-950 px-3 py-2">
        <span className="shrink-0 text-xs text-zinc-500">{shortCwd}</span>
        <span className="shrink-0 text-emerald-400">$</span>
        <input
          ref={inputRef}
          type="text"
          value={inputCommand}
          onChange={(e) => setInputCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning || !canRun}
          placeholder={canRun ? "Run command" : "Sandbox offline"}
          className="min-w-0 flex-1 bg-transparent font-mono text-base sm:text-xs text-zinc-100 placeholder:text-zinc-600 outline-none"
        />
        <button
          type="button"
          onClick={() => void executeCommand(inputCommand)}
          disabled={isRunning || !canRun || !inputCommand.trim()}
          className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-zinc-900 hover:text-zinc-200 disabled:opacity-30 cursor-pointer"
          aria-label="Execute command"
        >
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
          ) : (
            <CornerDownLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
        </button>
      </div>
    </div>
  );
}
