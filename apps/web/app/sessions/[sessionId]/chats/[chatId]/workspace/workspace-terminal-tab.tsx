"use client";

import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Play,
  RotateCcw,
  Terminal as TerminalIcon,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { TerminalExecResponse } from "@/app/api/sessions/[sessionId]/terminal/route";

interface TerminalLogEntry {
  id: string;
  command: string;
  cwd: string;
  timestamp: Date;
  result?: TerminalExecResponse;
  error?: string;
  running?: boolean;
}

const QUICK_COMMANDS = [
  { label: "git status", cmd: "git status" },
  { label: "git log", cmd: "git log -n 5 --oneline" },
  { label: "pnpm test", cmd: "pnpm test" },
  { label: "ls -la", cmd: "ls -la" },
];

export function WorkspaceTerminalTab({
  sessionId,
  canRun = true,
}: {
  sessionId: string;
  canRun?: boolean;
}) {
  const router = useRouter();
  const [logs, setLogs] = useState<TerminalLogEntry[]>([]);
  const [inputCommand, setInputCommand] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logs, scrollToBottom]);

  const executeCommand = useCallback(
    async (cmdToRun: string) => {
      const trimmed = cmdToRun.trim();
      if (!trimmed || isRunning || !canRun) return;

      const logId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newEntry: TerminalLogEntry = {
        id: logId,
        command: trimmed,
        cwd: "/workspace",
        timestamp: new Date(),
        running: true,
      };

      setLogs((prev) => [...prev, newEntry]);
      setCommandHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)]);
      setHistoryIndex(-1);
      setInputCommand("");
      setIsRunning(true);

      try {
        const response = await fetch(`/api/sessions/${sessionId}/terminal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: trimmed }),
        });

        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const err =
            (data as { error?: string })?.error ??
            `Command failed with HTTP ${response.status}`;
          setLogs((prev) =>
            prev.map((l) =>
              l.id === logId ? { ...l, running: false, error: err } : l,
            ),
          );
        } else {
          const res = data as TerminalExecResponse;
          setLogs((prev) =>
            prev.map((l) =>
              l.id === logId
                ? {
                    ...l,
                    running: false,
                    cwd: res.cwd,
                    result: res,
                  }
                : l,
            ),
          );
        }
      } catch (err) {
        setLogs((prev) =>
          prev.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  running: false,
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
    [canRun, isRunning, sessionId],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void executeCommand(inputCommand);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const nextIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        setHistoryIndex(nextIndex);
        setInputCommand(commandHistory[nextIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setInputCommand(commandHistory[nextIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputCommand("");
      }
    }
  };

  const handleClear = () => {
    setLogs([]);
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
    toast.success("Terminal output copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-black font-mono text-zinc-100">
      {/* Top Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-semibold text-zinc-300">Sandbox Shell</span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.2 text-[10px] text-zinc-400">
            bash
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Quick command buttons */}
          <div className="hidden sm:flex items-center gap-1 mr-2">
            {QUICK_COMMANDS.map((qc) => (
              <button
                key={qc.label}
                type="button"
                onClick={() => void executeCommand(qc.cmd)}
                disabled={isRunning}
                className="rounded bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              >
                {qc.label}
              </button>
            ))}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleCopy}
                disabled={logs.length === 0}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40 transition-colors"
                aria-label="Copy terminal text"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Copy Output</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleClear}
                disabled={logs.length === 0}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40 transition-colors"
                aria-label="Clear terminal"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear Logs</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => router.push(`/codespace/${sessionId}`)}
                className="flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                <span>VS Code</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open full Codespace terminal</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs leading-relaxed selection:bg-emerald-800 selection:text-white">
        <div className="text-zinc-500 text-[11px]">
          Connected to Entry Agents container sandbox. Type any command below or use quick actions.
        </div>

        {logs.map((log) => (
          <div key={log.id} className="space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="text-zinc-500">{log.cwd}</span>
              <span className="text-zinc-400">$</span>
              <span className="font-semibold text-zinc-100">{log.command}</span>
              {log.running && (
                <Loader2 className="ml-2 h-3 w-3 animate-spin text-amber-400" />
              )}
            </div>

            {log.result?.stdout && (
              <pre className="overflow-x-auto whitespace-pre-wrap text-zinc-300 pl-4 border-l border-zinc-800">
                {log.result.stdout}
              </pre>
            )}

            {log.result?.stderr && (
              <pre className="overflow-x-auto whitespace-pre-wrap text-rose-400 pl-4 border-l border-rose-900/60">
                {log.result.stderr}
              </pre>
            )}

            {log.error && (
              <div className="text-rose-400 pl-4 border-l border-rose-900">
                Error: {log.error}
              </div>
            )}

            {log.result && log.result.exitCode !== 0 && (
              <div className="text-[10px] text-zinc-500 pl-4">
                Process exited with code {log.result.exitCode}
              </div>
            )}
          </div>
        ))}
        <div ref={outputEndRef} />
      </div>

      {/* Prompt Input Line */}
      <div className="flex shrink-0 items-center border-t border-zinc-800 bg-zinc-950 px-3 py-2 gap-2">
        <span className="text-emerald-400 font-bold">$</span>
        <input
          ref={inputRef}
          type="text"
          value={inputCommand}
          onChange={(e) => setInputCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning || !canRun}
          placeholder={
            canRun
              ? "Type command (e.g. pnpm test, git status)..."
              : "Sandbox not running"
          }
          className="flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 outline-none font-mono"
          autoFocus
        />
        {isRunning && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400 shrink-0" />
        )}
      </div>
    </div>
  );
}
