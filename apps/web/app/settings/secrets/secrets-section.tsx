"use client";

import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useUserSecrets,
  type UserSecretSummary,
} from "@/hooks/use-user-secrets";

export function SecretsSectionSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[220px] w-full rounded-xl" />
      <Skeleton className="h-[136px] w-full rounded-xl" />
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
  const [showValue, setShowValue] = useState(false);
  const [allowedUrl, setAllowedUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingSecret(null);
    setName("");
    setValue("");
    setShowValue(false);
    setAllowedUrl("");
    setFormError(null);
  };

  const startEditing = (secret: UserSecretSummary) => {
    setEditingSecret(secret);
    setName(secret.name);
    setValue("");
    setShowValue(false);
    setAllowedUrl(secret.allowedHosts[0] ?? "");
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const normalizedName = name.trim().toUpperCase();
    if (!normalizedName) {
      setFormError("Key name is required");
      return;
    }

    if (!editingSecret && !value.trim()) {
      setFormError("Key is required");
      return;
    }

    const trimmedUrl = allowedUrl.trim();
    const allowedHosts = trimmedUrl ? [trimmedUrl] : [];

    setIsSubmitting(true);
    try {
      if (editingSecret) {
        await updateSecret(editingSecret.id, {
          name: normalizedName,
          ...(value.trim() ? { value: value.trim() } : {}),
          allowedHosts,
          injectInSandbox: allowedHosts.length === 0,
        });
      } else {
        await createSecret({
          name: normalizedName,
          value: value.trim(),
          allowedHosts,
          injectInSandbox: allowedHosts.length === 0,
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

  if (loading) {
    return <SecretsSectionSkeleton />;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="text-sm text-destructive">Failed to load API keys.</p>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-border bg-card p-5"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground">
            {editingSecret ? `Edit ${editingSecret.name}` : "Add API key"}
          </h2>
          {editingSecret ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetForm}
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            >
              <X className="size-3.5" strokeWidth={1.5} />
              Cancel
            </Button>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="secret-name" className="text-xs font-medium">
              Key name
            </Label>
            <Input
              id="secret-name"
              placeholder="STRIPE_SECRET_KEY"
              value={name}
              onChange={(e) =>
                setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))
              }
              autoComplete="off"
              className="h-9 font-mono text-xs"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="secret-value" className="text-xs font-medium">
              {editingSecret ? "Key (leave blank to keep existing)" : "Key"}
            </Label>
            <div className="relative">
              <Input
                id="secret-value"
                type={showValue ? "text" : "password"}
                autoComplete="new-password"
                placeholder={
                  editingSecret ? editingSecret.maskedHint : "sk_live_..."
                }
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-9 pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowValue((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors duration-150 hover:text-foreground cursor-pointer"
                aria-label={showValue ? "Hide key" : "Show key"}
              >
                {showValue ? (
                  <EyeOff className="size-3.5" strokeWidth={1.5} />
                ) : (
                  <Eye className="size-3.5" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="secret-url" className="text-xs font-medium">
              URL{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
          </div>
          <Input
            id="secret-url"
            placeholder="https://api.stripe.com"
            value={allowedUrl}
            onChange={(e) => setAllowedUrl(e.target.value)}
            autoComplete="off"
            className="h-9 font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            If provided, this key can only be sent to requests matching this
            URL.
          </p>
        </div>

        {formError ? (
          <p className="text-xs text-destructive">{formError}</p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : null}
            {editingSecret ? "Save changes" : "Add key"}
          </Button>
        </div>
      </form>

      {secrets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
          <KeyRound
            className="mb-2.5 size-5 text-muted-foreground/70"
            strokeWidth={1.5}
          />
          <p className="text-sm font-medium text-foreground">No API keys yet</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Keys are encrypted at rest and never exposed to the agent.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {secrets.map((secret) => (
            <div
              key={secret.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
                  <KeyRound className="size-4" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-sm font-medium text-foreground">
                      {secret.name}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {secret.maskedHint}
                    </span>
                  </div>
                  {secret.allowedHosts.length > 0 ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="size-3 shrink-0" strokeWidth={1.5} />
                      <span className="truncate font-mono">
                        {secret.allowedHosts.join(", ")}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  onClick={() => startEditing(secret)}
                  aria-label={`Edit ${secret.name}`}
                >
                  <Pencil className="size-3.5" strokeWidth={1.5} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  disabled={deletingId === secret.id}
                  onClick={() => handleDelete(secret.id)}
                  aria-label={`Delete ${secret.name}`}
                >
                  {deletingId === secret.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" strokeWidth={1.5} />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
