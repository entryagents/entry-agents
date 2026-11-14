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
      <div className="rounded-lg border border-border/70">
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
    setDescription("");
    setAllowedHostsRaw("");
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
      setFormError("Secret name is required");
      return;
    }

    if (!editingSecret && !value.trim()) {
      setFormError("Secret value is required");
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
        err instanceof Error ? err.message : "Failed to save secret",
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
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">API keys &amp; secrets vault</h2>
        <p className="text-sm text-muted-foreground">
          Store third-party API keys securely without pasting raw secrets into
          chat prompts or exposing them to the model.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-muted/20 px-4 py-3 text-sm">
        <ShieldCheck
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
        />
        <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">
            Zero-exposure encryption and automatic redaction
          </p>
          <p>
            Secrets are encrypted with AES-256-GCM at rest. The agent only sees
            secret names, descriptions, and allowed hosts — never raw values.
            Reference them via{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
              $SECRET_NAME
            </code>{" "}
            in sandbox commands or{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
              {"{{SECRET:SECRET_NAME}}"}
            </code>{" "}
            in HTTP requests and MCP configs. Accidental echoes in tool outputs
            are redacted automatically.
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
        <div className="divide-y divide-border/70 rounded-lg border border-border/70">
          {secrets.map((secret) => (
            <div
              key={secret.id}
              className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
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
                        Bash + Fetch/MCP
                      </>
                    ) : (
                      <>
                        <Globe className="size-2.5" />
                        Fetch/MCP only
                      </>
                    )}
                  </Badge>
                </div>

                {secret.description && (
                  <p className="text-xs text-muted-foreground">
                    {secret.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {secret.allowedHosts.length > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="size-3" />
                      Hosts: {secret.allowedHosts.join(", ")}
                    </span>
                  ) : (
                    <span>Any public host</span>
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
                  title="Copy {{SECRET:...}} template for MCP or web_fetch"
                >
                  {copiedId === secret.id ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  <span className="sr-only sm:not-sr-only sm:ml-1 text-xs">
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
        className="space-y-4 rounded-lg border border-dashed border-border/70 p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            {editingSecret ? (
              <>
                <Pencil className="size-4" />
                Editing {editingSecret.name}
              </>
            ) : (
              <>
                <Plus className="size-4" />
                Add a Secret or API Key
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

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="secret-name">Variable Name</Label>
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
                ? "New Secret Value (leave blank to keep)"
                : "Value"}
            </Label>
            <Input
              id="secret-value"
              type="password"
              autoComplete="new-password"
              placeholder={
                editingSecret
                  ? `${editingSecret.maskedHint} (unchanged)`
                  : "sk_live_..."
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
              Description for Agent (optional)
            </Label>
            <Input
              id="secret-description"
              placeholder="Stripe API key for billing smoke tests"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="secret-hosts">
              Allowed Domains for Fetch / MCP (optional)
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

        <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
          <div className="space-y-0.5">
            <Label htmlFor="secret-inject-sandbox" className="text-sm">
              Inject into sandbox bash commands
            </Label>
            <p className="text-xs text-muted-foreground">
              Exposes{" "}
              <code className="font-mono">${name || "SECRET_NAME"}</code>{" "}
              ephemerally during bash runs. Turn off for HTTP-only credentials
              used strictly via{" "}
              <code className="font-mono">{"{{SECRET:...}}"}</code>.
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
          {editingSecret ? "Save Changes" : "Save Encrypted Secret"}
        </Button>
      </form>
    </div>
  );
}
