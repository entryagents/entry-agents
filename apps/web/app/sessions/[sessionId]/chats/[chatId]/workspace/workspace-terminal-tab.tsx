"use client";

import {
  Check,
  ChevronDown,
  Copy,
  CornerDownLeft,
  Eraser,
  ExternalLink,
  Folder,
  Loader2,
  Play,
  RotateCw,
  Square,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import type { WorkspaceFileContentResponse } from "@/app/api/sessions/[sessionId]/files/content/route";
import type { TerminalExecResponse } from "@/app/api/sessions/[sessionId]/terminal/route";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DevUrlChip,
  extractDevUrls,
} from "@/components/workspace/dev-url-chip";
import { fetcher } from "@/lib/swr";
import { parseAnsiSegments } from "@/lib/terminal/ansi";
import { subscribePendingTerminalCommand } from "@/lib/terminal/pending-command";
import { cn } from "@/lib/utils";
import {
  detectPackageRunner,
  formatScriptCommand,
  parsePackageJsonScripts,
} from "./sable-rail-helpers";

interface TerminalLogEntry {
  id: string;
  command: string;
  scriptName?: string;
  cwd: string;
  timestamp: Date;
  durationMs?: number;
  result?: TerminalExecResponse;
  error?: string;
  running?: boolean;
  stopped?: boolean;
}

const AnsiOutput = memo(function AnsiOutput({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const segments = useMemo(() => parseAnsiSegments(text), [text]);
  return (
    <pre className={cn("tm-out", className)}>
      {segments.map((seg, index) => {
        const styleClass = cn(
          seg.style.fgClass,
          seg.style.bold && "font-semibold",
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
});

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function WorkspaceTerminalTab({
  sessionId,
  canRun = true,
  repoName,
  files,
  onOpenPreview,
}: {
  sessionId: string;
  canRun?: boolean;
  repoName?: string | null;
  files?: FileSuggestion[] | null;
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
            running: false,
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
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedRunId, setCopiedRunId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasPackageJson = useMemo(() => {
    if (!files || files.length === 0) return canRun;
    return files.some((f) => !f.isDirectory && f.value === "package.json");
  }, [canRun, files]);

  const packageRunner = useMemo(
    () =>
      detectPackageRunner(
        files?.filter((f) => !f.isDirectory).map((f) => f.value),
      ),
    [files],
  );

  const { data: pkgData } = useSWR<WorkspaceFileContentResponse>(
    canRun && hasPackageJson
      ? `/api/sessions/${sessionId}/files/content?path=package.json`
      : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const scripts = useMemo(
    () => (pkgData?.content ? parsePackageJsonScripts(pkgData.content) : []),
    [pkgData?.content],
  );

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
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
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

  const handleStopRunning = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const executeCommand = useCallback(
    async (cmdToRun: string, scriptName?: string) => {
      const trimmed = cmdToRun.trim();
      if (!trimmed || isRunning || !canRun) return;

      if (trimmed === "clear" || trimmed === "cls") {
        setInputCommand("");
        handleClear();
        return;
      }

      const logId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const startedAt = Date.now();
      const matchedScript =
        scriptName ??
        scripts.find(
          (s) => formatScriptCommand(packageRunner, s.name) === trimmed,
        )?.name;

      const newEntry: TerminalLogEntry = {
        id: logId,
        command: trimmed,
        ...(matchedScript ? { scriptName: matchedScript } : {}),
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

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const isCdOnly =
        /^cd(?:\s+|$)/.test(trimmed) &&
        !trimmed.includes("&&") &&
        !trimmed.includes(";");
      const effectiveCommand = isCdOnly ? `${trimmed} && pwd` : trimmed;

      try {
        const response = await fetch(`/api/sessions/${sessionId}/terminal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
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
        const aborted = err instanceof Error && err.name === "AbortError";
        setLogs((prev) =>
          prev.map((l) =>
            l.id === logId
              ? {
                  ...l,
                  running: false,
                  stopped: aborted,
                  durationMs,
                  ...(aborted
                    ? {}
                    : {
                        error:
                          err instanceof Error ? err.message : "Network error",
                      }),
                }
              : l,
          ),
        );
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsRunning(false);
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
      }
    },
    [
      canRun,
      currentCwd,
      handleClear,
      isRunning,
      packageRunner,
      scripts,
      sessionId,
    ],
  );

  const executeCommandRef = useRef(executeCommand);
  executeCommandRef.current = executeCommand;

  useEffect(() => {
    if (!canRun) return;
    return subscribePendingTerminalCommand(sessionId, (entry) => {
      void executeCommandRef.current(entry.command);
    });
  }, [canRun, sessionId]);

  const flashRunCard = useCallback((runId: string) => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(
      `[data-run="${CSS.escape(runId)}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    delete el.dataset.flash;
    void el.offsetWidth;
    el.dataset.flash = "";
    window.setTimeout(() => delete el.dataset.flash, 900);
  }, []);

  const handleRunScript = useCallback(
    (scriptName: string) => {
      const runningMatch = logs.find(
        (l) => l.running && l.scriptName === scriptName,
      );
      if (runningMatch) {
        flashRunCard(runningMatch.id);
        return;
      }
      const cmd = formatScriptCommand(packageRunner, scriptName);
      void executeCommand(cmd, scriptName);
    },
    [executeCommand, flashRunCard, logs, packageRunner],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      handleClear();
      return;
    }

    if (
      e.ctrlKey &&
      e.key.toLowerCase() === "c" &&
      e.currentTarget.selectionStart === e.currentTarget.selectionEnd &&
      isRunning
    ) {
      e.preventDefault();
      handleStopRunning();
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

  const handleCopyAll = () => {
    const text = logs
      .map((l) => {
        const out = l.result?.stdout ?? "";
        const err = l.result?.stderr ?? l.error ?? "";
        return `$ ${l.command}\n${out}${err ? `\n${err}` : ""}`;
      })
      .join("\n\n");
    void navigator.clipboard.writeText(text);
    setCopiedAll(true);
    toast.success("Terminal output copied");
    setTimeout(() => setCopiedAll(false), 1800);
  };

  const handleCopySingle = (log: TerminalLogEntry) => {
    const out = log.result?.stdout ?? "";
    const err = log.result?.stderr ?? log.error ?? "";
    const text = `$ ${log.command}\n${out}${err ? `\n${err}` : ""}`;
    void navigator.clipboard.writeText(text);
    setCopiedRunId(log.id);
    setTimeout(() => setCopiedRunId(null), 1600);
  };

  const handleOutputMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.toString().length === 0) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, []);

  const barTitle = currentCwd
    ? currentCwd.replace(/\/+$/, "").split("/").at(-1) || currentCwd
    : repoName || "Workspace";

  return (
    <div className="rail-col tm">
      {/* 1:1 Sable .rail-bar */}
      <div className="rail-bar">
        <span
          className="rail-bar-title truncate"
          title={currentCwd ?? barTitle}
        >
          <Folder size={13.5} strokeWidth={1.6} aria-hidden="true" />
          <span className="truncate">{barTitle}</span>
        </span>

        <span className="rail-bar-actions">
          {canRun && scripts.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="sable-btn-sm tm-run-btn"
                  aria-label="Run a script"
                >
                  <Play size={10.5} strokeWidth={2} className="fill-current" />
                  <span>Run</span>
                  <ChevronDown size={11} strokeWidth={1.8} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 text-xs">
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                  package.json ({packageRunner})
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {scripts.map((script) => {
                  const runningThis = logs.some(
                    (l) => l.running && l.scriptName === script.name,
                  );
                  return (
                    <DropdownMenuItem
                      key={script.name}
                      onSelect={() => handleRunScript(script.name)}
                      className="flex items-center justify-between gap-2 cursor-pointer"
                      title={script.command}
                    >
                      <span className="truncate font-medium">
                        {script.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {runningThis ? "Running" : script.command}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {isRunning ? (
            <button
              type="button"
              className="rail-btn text-rose-500"
              onClick={handleStopRunning}
              aria-label="Stop running command"
              title="Stop command (Ctrl+C)"
            >
              <Square size={11.5} strokeWidth={2} className="fill-current" />
            </button>
          ) : null}

          {logs.length > 0 ? (
            <>
              <button
                type="button"
                className="rail-btn"
                onClick={handleCopyAll}
                aria-label="Copy all output"
                title="Copy all output"
              >
                {copiedAll ? (
                  <Check
                    size={13}
                    strokeWidth={1.8}
                    className="text-emerald-500"
                  />
                ) : (
                  <Copy size={13} strokeWidth={1.6} />
                )}
              </button>
              <button
                type="button"
                className="rail-btn"
                onClick={handleClear}
                aria-label="Clear terminal"
                title="Clear (Ctrl+L)"
              >
                <Eraser size={13} strokeWidth={1.6} />
              </button>
            </>
          ) : null}

          <button
            type="button"
            className="rail-btn"
            onClick={() => router.push(`/codespace/${sessionId}`)}
            aria-label="Open full shell editor"
            title="Full shell"
          >
            <ExternalLink size={13} strokeWidth={1.6} />
          </button>
        </span>
      </div>

      {/* Transcript */}
      <div
        ref={scrollerRef}
        className="rail-scroll tm-scroll"
        role="log"
        aria-label="Command output"
        onMouseUp={handleOutputMouseUp}
      >
        {logs.length === 0 ? (
          <div className="rail-empty">
            <p className="rail-empty-title">
              {canRun ? "No commands run yet." : "Sandbox offline"}
            </p>
            <p>
              {canRun
                ? "Run a script above or type any shell command below."
                : "Start or resume a workspace sandbox to run shell commands."}
            </p>
          </div>
        ) : (
          <div className="tm-runs">
            {logs.map((log) => {
              const exitCode = log.result?.exitCode;
              const tone = log.running
                ? "live"
                : log.stopped
                  ? "quiet"
                  : log.error ||
                      (exitCode !== undefined &&
                        exitCode !== null &&
                        exitCode !== 0)
                    ? "fail"
                    : "ok";
              const devUrls = extractDevUrls(
                `${log.result?.stdout ?? ""}\n${log.result?.stderr ?? ""}`,
              ).slice(0, 2);

              return (
                <div
                  key={log.id}
                  className="tm-run"
                  data-tone={tone}
                  data-run={log.id}
                >
                  <div className="tm-cmd">
                    <span className="tm-mark" aria-hidden="true">
                      ❯
                    </span>
                    {log.scriptName ? (
                      <span className="tm-title">
                        <span className="tm-name">{log.scriptName}</span>
                        <code className="tm-cmd-sub">{log.command}</code>
                      </span>
                    ) : (
                      <code className="tm-cmd-text">{log.command}</code>
                    )}

                    {devUrls.map((devUrl) => (
                      <DevUrlChip
                        key={devUrl.url}
                        url={devUrl.url}
                        label={devUrl.label}
                        onOpenPreview={onOpenPreview}
                        className="tm-url"
                      />
                    ))}

                    <button
                      type="button"
                      className="tm-act"
                      aria-label="Copy output"
                      title="Copy output"
                      onClick={() => handleCopySingle(log)}
                    >
                      {copiedRunId === log.id ? (
                        <Check size={11.5} className="text-emerald-500" />
                      ) : (
                        <Copy size={11.5} strokeWidth={1.6} />
                      )}
                    </button>

                    {log.running ? (
                      <button
                        type="button"
                        className="tm-act tm-stop"
                        aria-label="Stop command"
                        title="Stop command"
                        onClick={handleStopRunning}
                      >
                        <Square size={10} className="fill-current" />
                      </button>
                    ) : canRun ? (
                      <button
                        type="button"
                        className="tm-act"
                        aria-label="Run again"
                        title="Run again"
                        disabled={isRunning}
                        onClick={() =>
                          void executeCommand(log.command, log.scriptName)
                        }
                      >
                        <RotateCw size={11.5} strokeWidth={1.6} />
                      </button>
                    ) : null}
                  </div>

                  {log.result?.stdout ? (
                    <AnsiOutput text={log.result.stdout} />
                  ) : null}

                  {log.result?.stderr ? (
                    <AnsiOutput text={log.result.stderr} className="tm-err" />
                  ) : null}

                  {log.error ? (
                    <div className="tm-error">{log.error}</div>
                  ) : null}

                  <div className="tm-foot num">
                    {log.running ? (
                      <>
                        <Loader2 size={11} className="animate-spin" />
                        <span>Running</span>
                      </>
                    ) : (
                      <>
                        <span className="tm-exit">
                          {log.stopped
                            ? "Stopped"
                            : log.error
                              ? "Failed"
                              : exitCode !== undefined && exitCode !== null
                                ? `Exit ${exitCode}`
                                : "Done"}
                        </span>
                        {log.durationMs !== undefined ? (
                          <>
                            <span className="tm-sep" />
                            <span>{formatDuration(log.durationMs)}</span>
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pinned command prompt */}
      <div className="tm-input-wrap">
        <label className="tm-input">
          <span className="tm-mark" aria-hidden="true">
            ❯
          </span>
          <input
            ref={inputRef}
            type="text"
            value={inputCommand}
            onChange={(e) => setInputCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning || !canRun}
            placeholder={canRun ? "Run a command" : "Sandbox offline"}
            aria-label="Run a command"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
          />
          <button
            type="button"
            className="rail-btn"
            onClick={() => void executeCommand(inputCommand)}
            disabled={isRunning || !canRun || !inputCommand.trim()}
            aria-label="Execute command"
          >
            {isRunning ? (
              <Loader2 size={13} className="animate-spin text-amber-500" />
            ) : (
              <CornerDownLeft size={13} strokeWidth={1.7} />
            )}
          </button>
        </label>
      </div>
    </div>
  );
}
