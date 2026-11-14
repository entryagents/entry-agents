"use client";

import { pluginManifestSchema } from "@entry-agents/agent/plugins/schema";
import {
  Blocks,
  Check,
  Code2,
  Loader2,
  Plus,
  Shield,
  Terminal,
  Trash2,
  Users,
  Webhook,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUserPlugins } from "@/hooks/use-user-plugins";
import type { UserPluginSummary } from "@/lib/db/plugins";
import { cn } from "@/lib/utils";

const CUSTOM_PLUGIN_TEMPLATE = JSON.stringify(
  {
    slug: "strict-typescript-guard",
    name: "Strict TypeScript Guard",
    version: "1.0.0",
    description:
      "Reminds agents to avoid `any`, preserve docstrings, and expose /ts-check.",
    category: "quality",
    hooks: ["session.context", "tool.execute.after"],
    slashCommands: [
      {
        name: "ts-check",
        description: "Run typecheck cleanly across all workspace packages",
        promptTemplate:
          "Run the repository typecheck script cleanly, fix all TypeScript errors introduced by recent edits, and summarize what passed.",
      },
    ],
    rules: {
      appendSystemPrompt:
        "[Strict TS] Never use `any`; narrow unknown inputs with Zod or explicit type guards.",
      compactionHint: "Keep exact compiler error messages when compacting.",
    },
  },
  null,
  2,
);

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  quality: { label: "Quality", icon: Check },
  agents: { label: "Team", icon: Users },
  security: { label: "Security", icon: Shield },
  git: { label: "Git & PR", icon: Code2 },
  performance: { label: "Context", icon: Webhook },
  custom: { label: "Custom", icon: Blocks },
};

export function PluginsSectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border/70 p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-4 h-6 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PluginsSection() {
  const {
    builtins,
    custom,
    loading,
    error,
    togglePlugin,
    createCustomPlugin,
    deletePlugin,
  } = useUserPlugins();

  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showBuilder, setShowBuilder] = useState(false);
  const [manifestJson, setManifestJson] = useState(CUSTOM_PLUGIN_TEMPLATE);
  const [configKey, setConfigKey] = useState("");
  const [configValue, setConfigValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleToggle = async (plugin: UserPluginSummary, enabled: boolean) => {
    setActionError(null);
    setTogglingSlug(plugin.slug);
    try {
      await togglePlugin(plugin, enabled);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to toggle plugin",
      );
    } finally {
      setTogglingSlug(null);
    }
  };

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(manifestJson);
    } catch {
      setActionError("Manifest must be valid JSON.");
      return;
    }

    const validated = pluginManifestSchema.safeParse(parsedJson);
    if (!validated.success) {
      setActionError(
        validated.error.issues[0]?.message ?? "Invalid plugin manifest schema",
      );
      return;
    }

    setSubmitting(true);
    try {
      const config =
        configKey.trim() && configValue.trim()
          ? { [configKey.trim()]: configValue.trim() }
          : undefined;
      await createCustomPlugin({
        manifest: validated.data,
        enabled: true,
        config,
      });
      setShowBuilder(false);
      setConfigKey("");
      setConfigValue("");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to install custom plugin",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCustom = async (plugin: UserPluginSummary) => {
    setActionError(null);
    setDeletingId(plugin.id);
    try {
      await deletePlugin(plugin.id);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to remove custom plugin",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const renderPluginCard = (plugin: UserPluginSummary) => {
    const cat = CATEGORY_META[plugin.category] ?? CATEGORY_META.custom;
    const CatIcon = cat.icon;
    const busy = togglingSlug === plugin.slug || deletingId === plugin.id;

    return (
      <div
        key={plugin.slug}
        className={cn(
          "flex flex-col justify-between rounded-lg border p-4 transition-colors",
          plugin.enabled
            ? "border-border bg-card"
            : "border-border/60 bg-muted/20",
        )}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {plugin.name}
                </h3>
                <Badge
                  variant="secondary"
                  className="inline-flex items-center gap-1 px-1.5 py-0 text-[10px] font-medium"
                >
                  <CatIcon className="size-3" />
                  {cat.label}
                </Badge>
                {plugin.source === "custom" && (
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 font-mono text-[10px]"
                  >
                    custom
                  </Badge>
                )}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {plugin.description}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {plugin.source === "custom" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  onClick={() => void handleDeleteCustom(plugin)}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${plugin.name}`}
                >
                  {deletingId === plugin.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </Button>
              )}
              <Switch
                checked={plugin.enabled}
                disabled={busy}
                onCheckedChange={(checked) =>
                  void handleToggle(plugin, checked)
                }
                aria-label={`Toggle ${plugin.name}`}
              />
            </div>
          </div>

          {/* Hook lifecycle pills */}
          {plugin.manifest.hooks.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {plugin.manifest.hooks.map((hook) => (
                <span
                  key={hook}
                  className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {hook}
                </span>
              ))}
            </div>
          )}

          {/* Registered slash commands */}
          {plugin.manifest.slashCommands.length > 0 && (
            <div className="space-y-1 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
              {plugin.manifest.slashCommands.map((cmd) => (
                <div
                  key={cmd.name}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="inline-flex items-center gap-1 font-mono font-medium text-foreground">
                    <Terminal className="size-3 text-muted-foreground" />/
                    {cmd.name}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {cmd.description}
                  </span>
                </div>
              ))}
            </div>
          )}

          {plugin.manifest.rules.blockedTools &&
            plugin.manifest.rules.blockedTools.length > 0 && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400">
                Blocks tools:{" "}
                {plugin.manifest.rules.blockedTools
                  .map((b) => (typeof b === "string" ? b : b.tool))
                  .join(", ")}
              </div>
            )}

          {plugin.configuredKeys.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              Encrypted config keys: {plugin.configuredKeys.join(", ")}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
          <span className="font-mono">{plugin.slug}</span>
          <span>v{plugin.manifest.version}</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return <PluginsSectionSkeleton />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Plugins</h1>
          <p className="text-sm text-muted-foreground">
            Compose runtime lifecycle hooks, slash commands, tool policies, and
            compaction hints across every agent turn and subagent.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={showBuilder ? "outline" : "default"}
          onClick={() => {
            setActionError(null);
            setShowBuilder((v) => !v);
          }}
          className="cursor-pointer active:scale-[0.97]"
        >
          <Plus className="mr-1.5 size-3.5" />
          {showBuilder ? "Close manifest editor" : "Install custom plugin"}
        </Button>
      </div>

      {(error || actionError) && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {actionError ?? error}
        </div>
      )}

      {showBuilder && (
        <form
          onSubmit={(e) => void handleCreateCustom(e)}
          className="space-y-4 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">
                Custom Plugin Manifest (JSON)
              </h2>
              <p className="text-xs text-muted-foreground">
                Defines typed hooks, slash commands, system additions, tool
                policies, and regex output redaction rules.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setManifestJson(CUSTOM_PLUGIN_TEMPLATE)}
            >
              Reset template
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plugin-manifest-json" className="text-xs">
              Manifest JSON
            </Label>
            <Textarea
              id="plugin-manifest-json"
              value={manifestJson}
              onChange={(e) => setManifestJson(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plugin-cfg-key" className="text-xs">
                Optional encrypted config key
              </Label>
              <Input
                id="plugin-cfg-key"
                placeholder="WEBHOOK_SECRET"
                value={configKey}
                onChange={(e) => setConfigKey(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plugin-cfg-val" className="text-xs">
                Optional encrypted config value
              </Label>
              <Input
                id="plugin-cfg-val"
                type="password"
                placeholder="••••••••"
                value={configValue}
                onChange={(e) => setConfigValue(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowBuilder(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              )}
              Save & Enable Plugin
            </Button>
          </div>
        </form>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            First-Party Plugins ({builtins.filter((b) => b.enabled).length}/
            {builtins.length} active)
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {builtins.map(renderPluginCard)}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Custom Plugins ({custom.length})
          </h2>
        </div>
        {custom.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-xs text-muted-foreground">
            No custom manifest plugins installed yet. Click{" "}
            <button
              type="button"
              onClick={() => setShowBuilder(true)}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Install custom plugin
            </button>{" "}
            to register your own hooks and slash commands.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {custom.map(renderPluginCard)}
          </div>
        )}
      </section>
    </div>
  );
}
