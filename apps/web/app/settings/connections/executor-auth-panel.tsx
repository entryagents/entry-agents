"use client";

import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { useState } from "react";
import type { ExecutorConnectionTestResult } from "@/lib/integrations/providers/executor-mcp";
import type {
  IntegrationConnectionSummary,
  IntegrationEnvRequirement,
} from "@/lib/integrations/registry-types";

interface ExecutorAuthPanelProps {
  connectionStatus?: IntegrationConnectionSummary;
  configured: boolean;
  requiredEnvVars?: IntegrationEnvRequirement[];
  oauthNotice?: { type: "connected" | "error"; message: string } | null;
  onRefresh: () => Promise<unknown>;
}

export function ExecutorAuthPanel({
  connectionStatus,
  configured,
  requiredEnvVars,
  oauthNotice,
  onRefresh,
}: ExecutorAuthPanelProps) {
  const [showPatForm, setShowPatForm] = useState(false);
  const [patInput, setPatInput] = useState("");
  const [orgInput, setOrgInput] = useState(
    connectionStatus?.organization ?? "",
  );
  const [connectionInput, setConnectionInput] = useState(
    connectionStatus?.connectionId ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResult, setTestResult] =
    useState<ExecutorConnectionTestResult | null>(null);

  const sourceLabel = (() => {
    switch (connectionStatus?.source) {
      case "oauth":
        return "Connected via OAuth";
      case "pat":
        return "Connected via personal token";
      case "env":
        return "Workspace default active";
      default:
        return "Not connected";
    }
  })();

  const oauthStartHref = (() => {
    const conn = (
      connectionInput.trim() ||
      connectionStatus?.connectionId ||
      ""
    ).trim();
    return conn
      ? `/api/integrations/executor/oauth/start?connection=${encodeURIComponent(conn)}`
      : "/api/integrations/executor/oauth/start";
  })();

  async function handleSavePat(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/integrations/executor/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(patInput.trim() ? { pat: patInput.trim() } : {}),
          organization: orgInput.trim(),
          connectionId: connectionInput.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFormError(data.error ?? "Failed to save Executor configuration");
        return;
      }
      setPatInput("");
      setShowPatForm(false);
      setTestResult(null);
      await onRefresh();
    } catch {
      setFormError("Network error saving Executor configuration");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/integrations/executor/test", {
        method: "POST",
      });
      const data = (await res.json()) as ExecutorConnectionTestResult;
      setTestResult(data);
      await onRefresh();
    } catch {
      setFormError("Network error while testing Executor MCP connection");
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    setFormError(null);
    try {
      await fetch("/api/integrations/executor/config", { method: "DELETE" });
      setTestResult(null);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {oauthNotice && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
            oauthNotice.type === "connected"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {oauthNotice.type === "connected" ? (
            <CheckCircle2
              className="mt-0.5 size-3.5 shrink-0"
              strokeWidth={1.5}
            />
          ) : (
            <AlertCircle
              className="mt-0.5 size-3.5 shrink-0"
              strokeWidth={1.5}
            />
          )}
          <span className="min-w-0 flex-1 break-words">
            {oauthNotice.message}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                configured
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  configured ? "bg-emerald-500" : "bg-muted-foreground/50"
                }`}
              />
              {sourceLabel}
            </span>
            {connectionStatus?.organization && (
              <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                org:{" "}
                {connectionStatus.organizationName ??
                  connectionStatus.organization}
              </span>
            )}
            {connectionStatus?.connectionId && (
              <span className="max-w-[200px] truncate rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                scope: {connectionStatus.connectionId}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Executor connects your external accounts through one encrypted MCP
            gateway so third-party tokens stay out of agent prompts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={oauthStartHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90"
          >
            <ShieldCheck className="size-3.5" strokeWidth={1.5} />
            <span>
              {connectionStatus?.source === "oauth"
                ? "Reconnect OAuth"
                : "Connect with Executor"}
            </span>
          </a>

          <button
            type="button"
            onClick={() => setShowPatForm((prev) => !prev)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <KeyRound className="size-3.5" strokeWidth={1.5} />
            <span>Token &amp; org</span>
          </button>

          {configured && (
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw
                className={`size-3.5 ${testing ? "animate-spin" : ""}`}
                strokeWidth={1.5}
              />
              <span>{testing ? "Testing..." : "Test gateway"}</span>
            </button>
          )}

          {(connectionStatus?.source === "oauth" ||
            connectionStatus?.source === "pat") && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={saving}
              title="Clear personal Executor override"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
            >
              <Unlink className="size-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {showPatForm && (
        <form
          onSubmit={handleSavePat}
          className="space-y-3 rounded-lg border border-border bg-background p-4"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xs font-medium text-foreground">
                Personal access token &amp; organization routing
              </h3>
              <p className="text-xs text-muted-foreground">
                Use OAuth above for scoped connections, or paste a personal
                token and organization slug for direct PAT mode.
              </p>
            </div>
            <a
              href="https://app.executor.sh/account/tokens"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              <span>Create token</span>
              <ExternalLink className="size-3" strokeWidth={1.5} />
            </a>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="block text-[11px] font-medium text-muted-foreground">
                Personal access token
              </span>
              <input
                type="password"
                value={patInput}
                onChange={(e) => setPatInput(e.target.value)}
                placeholder={
                  configured ? "Leave blank to keep existing key" : "exp_..."
                }
                autoComplete="off"
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none"
              />
            </label>

            <label className="space-y-1">
              <span className="block text-[11px] font-medium text-muted-foreground">
                Organization slug or ID
              </span>
              <input
                type="text"
                value={orgInput}
                onChange={(e) => setOrgInput(e.target.value)}
                placeholder="e.g. acme-team (needed for full-account PAT)"
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none"
              />
            </label>

            <label className="space-y-1">
              <span className="block text-[11px] font-medium text-muted-foreground">
                Scoped connection ID (OAuth)
              </span>
              <input
                type="text"
                value={connectionInput}
                onChange={(e) => setConnectionInput(e.target.value)}
                placeholder="Optional UUID for OAuth connect"
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none"
              />
            </label>
          </div>

          {formError && <p className="text-xs text-destructive">{formError}</p>}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save credentials"}
            </button>
            <button
              type="button"
              onClick={() => setShowPatForm(false)}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {testResult && (
        <div
          className={`rounded-lg border p-3.5 text-xs ${
            testResult.ok
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-destructive/30 bg-destructive/5"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`font-medium ${
                testResult.ok
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-destructive"
              }`}
            >
              {testResult.ok
                ? `Gateway verified · ${testResult.tools.length} MCP tools active`
                : `Gateway check failed`}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {testResult.latencyMs}ms · {testResult.authMode.toUpperCase()}
            </span>
          </div>

          {testResult.ok ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {testResult.tools.map((tool) => (
                <code
                  key={tool.name}
                  className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                >
                  {tool.name}
                </code>
              ))}
            </div>
          ) : (
            <div className="mt-1.5 space-y-1 text-muted-foreground">
              <p className="text-destructive">{testResult.error}</p>
              {testResult.recovery?.action && (
                <p>Action: {testResult.recovery.action}</p>
              )}
              {testResult.recovery?.instructions && (
                <p>{testResult.recovery.instructions}</p>
              )}
            </div>
          )}
        </div>
      )}

      {!configured && requiredEnvVars && requiredEnvVars.length > 0 && (
        <details className="rounded-lg border border-border bg-background px-3.5 py-2.5 text-xs">
          <summary className="cursor-pointer font-medium text-foreground">
            Server environment options (optional for OAuth users)
          </summary>
          <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
            {requiredEnvVars.map((envVar) => (
              <div
                key={envVar.key}
                className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2"
              >
                <code className="font-mono text-foreground">{envVar.key}</code>
                <span className="text-muted-foreground">
                  {envVar.description}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
