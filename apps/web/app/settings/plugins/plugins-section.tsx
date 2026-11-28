"use client";

import { pluginManifestSchema } from "@entry-agents/agent/plugins/schema";
import {
  Blocks,
  Check,
  Code2,
  KeyRound,
  Loader2,
  Plus,
  Search,
  Shield,
  Terminal,
  Trash2,
  Users,
  Webhook,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { EntryLoadingScreen } from "@/components/entry-loading-screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUserPlugins } from "@/hooks/use-user-plugins";
import type { UserPluginSummary } from "@/lib/db/plugins";
import { cn } from "@/lib/utils";

type PluginFilter = "all" | "active" | "builtin" | "custom";

const PLUGIN_PRESETS = [
  {
    id: "strict-ts",
    label: "Strict TypeScript",
    manifest: {
      slug: "strict-typescript-guard",
      name: "Strict TypeScript Guard",
      version: "1.0.0",
      description:
        "Enforces zero `any` types, explicit Zod narrowing, and adds /ts-check.",
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
  },
  {
    id: "conventional-commits",
    label: "Conventional commits",
    manifest: {
      slug: "conventional-commits-guard",
      name: "Conventional Commits Enforcer",
      version: "1.0.0",
      description:
        "Standardizes git commit messages and PR titles using conventional prefixes.",
      category: "git",
      hooks: ["session.context"],
      slashCommands: [
        {
          name: "commit-msg",
          description: "Draft a conventional commit summary for staged changes",
          promptTemplate:
            "Inspect `git status` and `git diff --stat` and draft a concise Conventional Commit title and bullet body.",
        },
      ],
      rules: {
        appendSystemPrompt:
          "[Git Convention] Format all commit titles as `feat(scope): ...`, `fix(scope): ...`, or `chore(scope): ...`.",
      },
    },
  },
  {
    id: "sensitive-file-guard",
    label: "Secret guard",
    manifest: {
      slug: "sensitive-path-blocker",
      name: "Sensitive Path & Secret Guard",
      version: "1.0.0",
      description:
        "Redacts private keys from tool outputs and warns before editing production env files.",
      category: "security",
      hooks: ["session.context", "tool.execute.after"],
      slashCommands: [],
      rules: {
        appendSystemPrompt:
          "[Security Guard] Never write raw credentials to `.env.production` or commit `.pem` files.",
        redactRegexes: [
          {
            pattern:
              "-----BEGIN [A-Z ]+ PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]+ PRIVATE KEY-----",
            replacement: "[REDACTED_PRIVATE_KEY]",
          },
        ],
      },
    },
  },
  {
    id: "test-first",
    label: "Test-first workflow",
    manifest: {
      slug: "test-first-workflow",
      name: "Test-First Workflow",
      version: "1.0.0",
      description:
        "Guides agents to add or update unit tests alongside every code change.",
      category: "quality",
      hooks: ["session.context", "session.compacting"],
      slashCommands: [
        {
          name: "tdd",
          description:
            "Write a failing test first, implement fix, verify green",
          promptTemplate:
            "Follow a strict TDD loop: reproduce or specify the behavior with a focused test first, implement the minimal fix, and run the test file to confirm it passes.",
          targetAgent: "executor",
        },
      ],
      rules: {
        appendSystemPrompt:
          "[Test-First] Whenever you modify business logic, add or update the colocated `.test.ts` file in the same turn.",
        compactionHint:
          "Preserve the list of test files executed and their pass/fail status.",
      },
    },
  },
] as const;

const DEFAULT_MANIFEST_JSON = JSON.stringify(
  PLUGIN_PRESETS[0].manifest,
  null,
  2,
);

const CATEGORY_META: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/70 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-4 h-7 w-28" />
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
    updatePluginConfig,
    deletePlugin,
  } = useUserPlugins();

  const [filter, setFilter] = useState<PluginFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showBuilder, setShowBuilder] = useState(false);
  const [manifestJson, setManifestJson] = useState(DEFAULT_MANIFEST_JSON);
  const [configKey, setConfigKey] = useState("");
  const [configValue, setConfigValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editingConfigSlug, setEditingConfigSlug] = useState<string | null>(
    null,
  );
  const [inlineKey, setInlineKey] = useState("");
  const [inlineValue, setInlineValue] = useState("");
  const [savingConfigSlug, setSavingConfigSlug] = useState<string | null>(null);

  const allPlugins = useMemo(
    () => [...builtins, ...custom],
    [builtins, custom],
  );

  const counts = useMemo(
    () => ({
      all: allPlugins.length,
      active: allPlugins.filter((p) => p.enabled).length,
      builtin: builtins.length,
      custom: custom.length,
    }),
    [allPlugins, builtins.length, custom.length],
  );

  const filteredPlugins = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allPlugins.filter((plugin) => {
      if (filter === "active" && !plugin.enabled) return false;
      if (filter === "builtin" && plugin.source !== "builtin") return false;
      if (filter === "custom" && plugin.source !== "custom") return false;
      if (!q) return true;
      return (
        plugin.name.toLowerCase().includes(q) ||
        plugin.description.toLowerCase().includes(q) ||
        plugin.slug.toLowerCase().includes(q) ||
        plugin.manifest.slashCommands.some((cmd) =>
          cmd.name.toLowerCase().includes(q),
        )
      );
    });
  }, [allPlugins, filter, searchQuery]);

  const handleToggle = async (plugin: UserPluginSummary, enabled: boolean) => {
    setActionError(null);
    setTogglingSlug(plugin.slug);
    try {
      await togglePlugin(plugin, enabled);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update plugin",
      );
    } finally {
      setTogglingSlug(null);
    }
  };

  const handleSaveInlineConfig = async (plugin: UserPluginSummary) => {
    const trimmedKey = inlineKey.trim();
    if (!trimmedKey) {
      setActionError("Config key is required");
      return;
    }
    setActionError(null);
    setSavingConfigSlug(plugin.slug);
    try {
      await updatePluginConfig(plugin, { [trimmedKey]: inlineValue });
      setEditingConfigSlug(null);
      setInlineKey("");
      setInlineValue("");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to save plugin setting",
      );
    } finally {
      setSavingConfigSlug(null);
    }
  };

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(manifestJson);
    } catch {
      setActionError("Manifest must be valid JSON");
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

  if (loading) {
    return <EntryLoadingScreen fullScreen={false} />;
  }

  const filterTabs: Array<{ id: PluginFilter; label: string; count: number }> =
    [
      { id: "all", label: "All", count: counts.all },
      { id: "active", label: "Active", count: counts.active },
      { id: "builtin", label: "Built-in", count: counts.builtin },
      { id: "custom", label: "Custom", count: counts.custom },
    ];

  return (
    <div className="space-y-6">
      {/* Toolbar: filters + search + install CTA */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Filter plugins"
            className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:inline-flex"
          >
            {filterTabs.map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(tab.id)}
                  className={cn(
                    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3",
                    active
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{tab.label}</span>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <Button
            type="button"
            size="sm"
            variant={showBuilder ? "outline" : "default"}
            onClick={() => {
              setActionError(null);
              setShowBuilder((v) => !v);
            }}
            className="w-full cursor-pointer rounded-lg sm:w-auto"
          >
            {showBuilder ? (
              <X className="mr-1.5 size-3.5" strokeWidth={1.5} />
            ) : (
              <Plus className="mr-1.5 size-3.5" strokeWidth={1.5} />
            )}
            {showBuilder ? "Close editor" : "Install custom plugin"}
          </Button>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.5}
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search plugins or /commands"
            className="h-9 rounded-lg pl-9 text-sm"
          />
        </div>
      </div>

      {(error || actionError) && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
          {actionError ?? error}
        </div>
      )}

      {/* Custom Plugin Installer */}
      {showBuilder ? (
        <form
          onSubmit={(e) => void handleCreateCustom(e)}
          className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-foreground">
                Custom plugin manifest
              </h2>
              <p className="text-xs text-muted-foreground">
                Pick a starter template or paste a JSON manifest
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {PLUGIN_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    setManifestJson(JSON.stringify(preset.manifest, null, 2))
                  }
                  className="cursor-pointer rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plugin-manifest-json" className="text-xs">
              Manifest JSON
            </Label>
            <Textarea
              id="plugin-manifest-json"
              value={manifestJson}
              onChange={(e) => setManifestJson(e.target.value)}
              rows={11}
              className="rounded-lg font-mono text-xs"
            />
          </div>

          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3.5">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-foreground">
                Optional API key or webhook secret
              </p>
              <p className="text-xs text-muted-foreground">
                Only needed if this custom plugin authenticates with an external
                service
              </p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Input
                id="plugin-cfg-key"
                placeholder="Key name (e.g. WEBHOOK_SECRET)"
                value={configKey}
                onChange={(e) => setConfigKey(e.target.value)}
                className="h-9 rounded-lg font-mono text-xs"
              />
              <Input
                id="plugin-cfg-val"
                type="password"
                placeholder="Secret value"
                value={configValue}
                onChange={(e) => setConfigValue(e.target.value)}
                className="h-9 rounded-lg font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowBuilder(false)}
              className="cursor-pointer rounded-lg"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="cursor-pointer rounded-lg"
            >
              {submitting ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              Install &amp; enable
            </Button>
          </div>
        </form>
      ) : null}

      {/* Plugin Cards Grid */}
      {filteredPlugins.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            No plugins match this view
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {filter === "custom"
              ? "Install a custom JSON manifest to add your own hooks and slash commands"
              : "Try clearing your search or switching filters"}
          </p>
          {filter === "custom" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowBuilder(true)}
              className="mt-4 cursor-pointer rounded-lg"
            >
              <Plus className="mr-1.5 size-3.5" strokeWidth={1.5} />
              Install custom plugin
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredPlugins.map((plugin) => {
            const cat = CATEGORY_META[plugin.category] ?? CATEGORY_META.custom;
            const CatIcon = cat.icon;
            const busy =
              togglingSlug === plugin.slug || deletingId === plugin.id;
            const isEditingConfig = editingConfigSlug === plugin.slug;
            const supportsCredentials =
              plugin.source === "custom" ||
              plugin.manifest.configFields.length > 0 ||
              plugin.configuredKeys.length > 0;

            return (
              <div
                key={plugin.slug}
                className={cn(
                  "flex min-w-0 flex-col justify-between rounded-xl border p-4 transition-colors sm:p-5",
                  plugin.enabled
                    ? "border-border bg-card"
                    : "border-border/60 bg-muted/20",
                )}
              >
                <div className="space-y-3.5">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground">
                        <CatIcon className="size-4" strokeWidth={1.5} />
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-foreground">
                            {plugin.name}
                          </h3>
                          {plugin.source === "custom" ? (
                            <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              Custom
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {cat.label}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {supportsCredentials ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          onClick={() => {
                            if (isEditingConfig) {
                              setEditingConfigSlug(null);
                            } else {
                              setEditingConfigSlug(plugin.slug);
                              setInlineKey(
                                plugin.manifest.configFields[0]?.key ??
                                  plugin.configuredKeys[0] ??
                                  "",
                              );
                              setInlineValue("");
                            }
                          }}
                          className="size-7 cursor-pointer rounded-md text-muted-foreground hover:text-foreground"
                          aria-label={`Configure ${plugin.name}`}
                          title="Configure plugin secret"
                        >
                          <KeyRound className="size-3.5" strokeWidth={1.5} />
                        </Button>
                      ) : null}

                      {plugin.source === "custom" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          onClick={() => void handleDeleteCustom(plugin)}
                          className="size-7 cursor-pointer rounded-md text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${plugin.name}`}
                        >
                          {deletingId === plugin.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" strokeWidth={1.5} />
                          )}
                        </Button>
                      ) : null}

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

                  {/* Description */}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {plugin.description}
                  </p>

                  {/* Slash commands */}
                  {plugin.manifest.slashCommands.length > 0 ? (
                    <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5">
                      {plugin.manifest.slashCommands.map((cmd) => (
                        <div
                          key={cmd.name}
                          className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                        >
                          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs font-medium text-foreground">
                            <Terminal
                              className="size-3 text-muted-foreground"
                              strokeWidth={1.5}
                            />
                            /{cmd.name}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {cmd.description}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* Configured keys notice (only if present) */}
                  {plugin.configuredKeys.length > 0 ? (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      Keys: {plugin.configuredKeys.join(", ")}
                    </p>
                  ) : null}

                  {/* Inline Credential Editor (only shown when toggled on a plugin that supports config) */}
                  {isEditingConfig ? (
                    <div className="space-y-2.5 rounded-lg border border-border/70 bg-muted/30 p-3">
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-foreground">
                          Plugin secret
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Used if this plugin connects to an external webhook or
                          API
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          placeholder="KEY_NAME"
                          value={inlineKey}
                          onChange={(e) => setInlineKey(e.target.value)}
                          className="h-8 rounded-md font-mono text-xs"
                        />
                        <Input
                          type="password"
                          placeholder="Secret value"
                          value={inlineValue}
                          onChange={(e) => setInlineValue(e.target.value)}
                          className="h-8 rounded-md font-mono text-xs"
                        />
                      </div>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 cursor-pointer rounded-md px-2.5 text-xs"
                          onClick={() => setEditingConfigSlug(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 cursor-pointer rounded-md px-2.5 text-xs"
                          disabled={savingConfigSlug === plugin.slug}
                          onClick={() => void handleSaveInlineConfig(plugin)}
                        >
                          {savingConfigSlug === plugin.slug ? (
                            <Loader2 className="mr-1 size-3 animate-spin" />
                          ) : null}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Quiet card footer */}
                <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
                  <span className="truncate font-mono">{plugin.slug}</span>
                  <div className="flex shrink-0 items-center gap-2.5 font-mono tabular-nums">
                    {plugin.triggerCount > 0 ? (
                      <span>
                        {plugin.triggerCount}{" "}
                        {plugin.triggerCount === 1 ? "run" : "runs"}
                      </span>
                    ) : null}
                    <span>v{plugin.manifest.version}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
