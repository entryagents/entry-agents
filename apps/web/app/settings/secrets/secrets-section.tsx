"use client";

import {
  AlertTriangle,
  Check,
  Copy,
  Globe,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { ToolkitPresetIcon } from "@/components/toolkit-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  useUserSecrets,
  type UserSecretSummary,
} from "@/hooks/use-user-secrets";
import { formatRelativeTime } from "@/lib/format-relative-time";

interface SecretQuickPreset {
  readonly slug: string;
  readonly label: string;
  readonly name: string;
  readonly description: string;
  readonly hosts: string;
  readonly placeholder: string;
}

const SECRET_QUICK_PRESETS: readonly SecretQuickPreset[] = [
  {
    slug: "stripe",
    label: "Stripe",
    name: "STRIPE_SECRET_KEY",
    description: "Stripe API key for billing checks and webhooks",
    hosts: "api.stripe.com",
    placeholder: "sk_live_...",
  },
  {
    slug: "resend",
    label: "Resend",
    name: "RESEND_API_KEY",
    description: "Resend transactional email delivery key",
    hosts: "api.resend.com",
    placeholder: "re_...",
  },
  {
    slug: "openai",
    label: "OpenAI",
    name: "OPENAI_API_KEY",
    description: "OpenAI API key for scripts and eval runs",
    hosts: "api.openai.com",
    placeholder: "sk-proj-...",
  },
  {
    slug: "supabase",
    label: "Supabase",
    name: "SUPABASE_SERVICE_ROLE_KEY",
    description: "Supabase project key for migrations and database checks",
    hosts: "*.supabase.co",
    placeholder: "eyJhbGciOi...",
  },
  {
    slug: "posthog",
    label: "PostHog",
    name: "POSTHOG_API_KEY",
    description: "PostHog key for event verification and analytics scripts",
    hosts: "us.i.posthog.com, app.posthog.com",
    placeholder: "phx_...",
  },
  {
    slug: "cloudflare",
    label: "Cloudflare",
    name: "CLOUDFLARE_API_TOKEN",
    description: "Cloudflare token for Worker deploys and DNS tooling",
    hosts: "api.cloudflare.com",
    placeholder: "cf_...",
  },
];

function parseAllowedHosts(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function SecretsSectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="rounded-xl border border-border/70 bg-card">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0"
          >
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SecretsSection() {
  const { secrets, loading, error, createSecret, updateSecret, deleteSecret } =
    useUserSecrets();

  const [editingSecret, setEditingSecret] = useState<UserSecretSummary | null>(
    null,
  );
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [valuePlaceholder, setValuePlaceholder] = useState("sk_live_...");
  const [description, setDescription] = useState("");
  const [allowedHostsRaw, setAllowedHostsRaw] = useState("");
  const [injectInSandbox, setInjectInSandbox] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const resetForm = () => {
    setEditingSecret(null);
    setName("");
    setValue("");
    setValuePlaceholder("sk_live_...");
    setDescription("");
    setAllowedHostsRaw("");
    setInjectInSandbox(true);
    setFormError(null);
  };

  const applyPreset = (preset: SecretQuickPreset) => {
    setEditingSecret(null);
    setName(preset.name);
    setValue("");
    setValuePlaceholder(preset.placeholder);
    setDescription(preset.description);
    setAllowedHostsRaw(preset.hosts);
    setInjectInSandbox(true);
    setFormError(null);
  };

  const startEditing = (secret: UserSecretSummary) => {
    setEditingSecret(secret);
    setName(secret.name);
    setValue("");
    setDescription(secret.description ?? "");
    setAllowedHostsRaw(secret.allowedHosts.join(", "));
    setInjectInSandbox(secret.injectInSandbox);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const normalizedName = name.trim().toUpperCase();
    if (!normalizedName) {
      setFormError("Variable name is required");
      return;
    }

    if (!editingSecret && !value.trim()) {
      setFormError("Key value is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const hosts = parseAllowedHosts(allowedHostsRaw);
      if (editingSecret) {
        await updateSecret(editingSecret.id, {
          name: normalizedName,
          ...(value.trim() ? { value: value.trim() } : {}),
          description: description.trim() || null,
          allowedHosts: hosts,
          injectInSandbox,
        });
      } else {
        await createSecret({
          name: normalizedName,
          value: value.trim(),
          description: description.trim() || undefined,
          allowedHosts: hosts,
          injectInSandbox,
        });
      }
      resetForm();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save API key",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteSecret(id);
      if (editingSecret?.id === id) {
        resetForm();
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyReference = async (secret: UserSecretSummary) => {
    const snippet = `{{SECRET:${secret.name}}}`;
    await navigator.clipboard.writeText(snippet);
    setCopiedId(secret.id);
    setTimeout(() => {
      setCopiedId((current) => (current === secret.id ? null : current));
    }, 1500);
  };

  if (loading) {
    return <SecretsSectionSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5 text-sm">
        <ShieldCheck
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
        />
        <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">
            Private credentials kept out of chat history
          </p>
          <p>
            Agents only see key names, notes, and allowed domains — never raw
            values. Reference them as{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
              $KEY_NAME
            </code>{" "}
            in terminal commands or{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
              {"{{SECRET:KEY_NAME}}"}
            </code>{" "}
            in MCP headers and web requests.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {secrets.length > 0 && (
        <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-card">
          {secrets.map((secret) => (
            <div
              key={secret.id}
              className="flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-mono text-sm font-medium">
                    {secret.name}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {secret.maskedHint}
                  </span>
                  <Badge
                    variant="secondary"
                    className="gap-1 px-1.5 py-0 text-[10px] font-normal"
                  >
                    {secret.injectInSandbox ? (
                      <>
                        <Terminal className="size-2.5" />
                        Shell + MCP
                      </>
                    ) : (
                      <>
                        <Globe className="size-2.5" />
                        HTTP / MCP only
                      </>
                    )}
                  </Badge>
                </div>

                {secret.description && (
                  <p className="text-xs text-muted-foreground">
                    {secret.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
                  {secret.allowedHosts.length > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="size-3" />
                      Domains: {secret.allowedHosts.join(", ")}
                    </span>
                  ) : (
                    <span>Any public domain</span>
                  )}
                  <span>
                    Used {secret.usageCount}{" "}
                    {secret.usageCount === 1 ? "time" : "times"}
                  </span>
                  {secret.lastUsedAt && (
                    <span>
                      Last used{" "}
                      {formatRelativeTime(new Date(secret.lastUsedAt))}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyReference(secret)}
                  title="Copy template reference for MCP headers or requests"
                >
                  {copiedId === secret.id ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  <span className="sr-only text-xs sm:not-sr-only sm:ml-1">
                    {copiedId === secret.id ? "Copied" : "Template"}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => startEditing(secret)}
                  aria-label={`Edit ${secret.name}`}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={deletingId === secret.id}
                  onClick={() => handleDelete(secret.id)}
                  aria-label={`Delete ${secret.name}`}
                >
                  {deletingId === secret.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-border/70 bg-card p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            {editingSecret ? (
              <>
                <Pencil className="size-4" strokeWidth={1.5} />
                Editing {editingSecret.name}
              </>
            ) : (
              <>
                <Plus className="size-4" strokeWidth={1.5} />
                Add API key
              </>
            )}
          </div>
          {editingSecret && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetForm}
              className="h-7 gap-1 text-xs"
            >
              <X className="size-3.5" />
              Cancel edit
            </Button>
          )}
        </div>

        {!editingSecret && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              One-click templates prefill variable names and domain guards
            </div>
            <div className="flex flex-wrap gap-2">
              {SECRET_QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.slug}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ${
                    name === preset.name
                      ? "border-foreground/30 bg-muted text-foreground"
                      : "border-border/70 bg-background text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  <ToolkitPresetIcon slug={preset.slug} className="size-3.5" />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="secret-name">Variable name</Label>
            <Input
              id="secret-name"
              placeholder="STRIPE_SECRET_KEY"
              value={name}
              onChange={(e) =>
                setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))
              }
              className="font-mono text-xs"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="secret-value">
              {editingSecret
                ? "New value (leave blank to keep existing)"
                : "Key value"}
            </Label>
            <Input
              id="secret-value"
              type="password"
              autoComplete="new-password"
              placeholder={
                editingSecret
                  ? `${editingSecret.maskedHint} (unchanged)`
                  : valuePlaceholder
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="secret-description">
              Note for agent (optional)
            </Label>
            <Input
              id="secret-description"
              placeholder="Stripe API key for billing checks"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="secret-hosts">
              Allowed domains for fetch / MCP (optional)
            </Label>
            <Input
              id="secret-hosts"
              placeholder="api.stripe.com, *.example.com"
              value={allowedHostsRaw}
              onChange={(e) => setAllowedHostsRaw(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
          <div className="space-y-0.5">
            <Label htmlFor="secret-inject-sandbox" className="text-sm">
              Expose in terminal commands
            </Label>
            <p className="text-xs text-muted-foreground">
              Makes <code className="font-mono">${name || "KEY_NAME"}</code>{" "}
              available in shell runs. Disable to restrict usage to HTTP
              requests and MCP headers only.
            </p>
          </div>
          <Switch
            id="secret-inject-sandbox"
            checked={injectInSandbox}
            onCheckedChange={setInjectInSandbox}
          />
        </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : null}
          {editingSecret ? "Save changes" : "Save API key"}
        </Button>
      </form>
    </div>
  );
}
