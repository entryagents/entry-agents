"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Monitor,
  Moon,
  Plus,
  Search,
  Sun,
  Terminal,
  X,
} from "lucide-react";
import { type ThemePreference, useTheme } from "@/app/providers";
import { EntryLoadingScreen } from "@/components/entry-loading-screen";
import {
  DEFAULT_SANDBOX_TYPE,
  type SandboxType,
} from "@/components/sandbox-selector-compact";
import { listUserSelectableSandboxProviders } from "@entry-agents/sandbox/registry.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ModelCombobox } from "@/components/model-combobox";
import { useModelOptions } from "@/hooks/use-model-options";
import { useSession } from "@/hooks/use-session";
import {
  type DiffMode,
  useUserPreferences,
} from "@/hooks/use-user-preferences";
import {
  globalSkillRefSchema,
  type GlobalSkillRef,
} from "@/lib/skills/global-skill-refs";
import {
  type ModelOption,
  getDefaultModelOptionId,
  withMissingModelOption,
} from "@/lib/model-options";

const SANDBOX_OPTIONS: Array<{ id: SandboxType; name: string }> =
  listUserSelectableSandboxProviders().map((provider) => ({
    id: provider.id as SandboxType,
    name: provider.displayName,
  }));

const THEME_OPTIONS: Array<{ id: ThemePreference; name: string }> = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

const DIFF_MODE_OPTIONS: Array<{ id: DiffMode; name: string }> = [
  { id: "unified", name: "Unified" },
  { id: "split", name: "Split" },
];

type PermissionMode = "ask" | "autoAccept" | "fullAccess";

const PERMISSION_MODE_OPTIONS: Array<{
  id: PermissionMode;
  name: string;
  description: string;
}> = [
  {
    id: "ask",
    name: "Ask",
    description:
      "Approve dangerous bash commands, .env access, and every web request.",
  },
  {
    id: "autoAccept",
    name: "Auto Accept",
    description:
      "Skip approval for web requests only. Bash and .env access still gated.",
  },
  {
    id: "fullAccess",
    name: "Full Access",
    description: "Skip every approval gate entirely.",
  },
];

function isThemePreference(value: string): value is ThemePreference {
  return THEME_OPTIONS.some((option) => option.id === value);
}

function getGlobalSkillRefError(params: {
  source: string;
  skillName: string;
  existingRefs: GlobalSkillRef[];
}): string | null {
  const parsedRef = globalSkillRefSchema.safeParse({
    source: params.source,
    skillName: params.skillName,
  });

  if (!parsedRef.success) {
    return parsedRef.error.issues[0]?.message ?? "Invalid global skill ref";
  }

  const duplicateExists = params.existingRefs.some(
    (ref) =>
      ref.source.toLowerCase() === parsedRef.data.source.toLowerCase() &&
      ref.skillName.toLowerCase() === parsedRef.data.skillName.toLowerCase(),
  );

  return duplicateExists ? "That global skill has already been added" : null;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium text-muted-foreground">{children}</h3>
  );
}

export function PreferencesSectionSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <SectionHeader>General</SectionHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>

      <div className="border-t border-border/50" />

      <div className="space-y-4">
        <SectionHeader>Skills</SectionHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-[28rem] max-w-full" />
          </div>
          <div className="rounded-lg border border-border/70">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0"
              >
                <div className="grid min-w-0 flex-1 gap-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-44" />
                </div>
                <Skeleton className="size-8 rounded-md" />
              </div>
            ))}
          </div>
          <div className="grid gap-2.5 rounded-lg border border-dashed border-border/60 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="grid gap-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="grid gap-1.5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-10 w-20" />
            </div>
            <Skeleton className="h-4 w-[30rem] max-w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelPreferencesSectionSkeleton() {
  return (
    <div className="space-y-4">
      <SectionHeader>Model Preferences</SectionHeader>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="grid gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-44" />
        </div>
      </div>
      <div className="grid gap-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-14" />
          </div>
          <Skeleton className="h-4 w-[34rem] max-w-full" />
        </div>
        <div className="rounded-lg border border-border/70">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="size-6 rounded-md" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

function usePreferencesSectionState() {
  const { theme, setTheme } = useTheme();
  const { session } = useSession();
  const { preferences, loading, updatePreferences } = useUserPreferences();
  const { modelOptions, loading: modelOptionsLoading } = useModelOptions();
  const [isSaving, setIsSaving] = useState(false);
  const [globalSkillSource, setGlobalSkillSource] = useState("");
  const [globalSkillName, setGlobalSkillName] = useState("");
  const [globalSkillsError, setGlobalSkillsError] = useState<string | null>(
    null,
  );
  const [copiedPublicProfile, setCopiedPublicProfile] = useState(false);

  const selectedDefaultModelId =
    preferences?.defaultModelId ?? getDefaultModelOptionId(modelOptions) ?? "";
  const selectedSubagentModelId = preferences?.defaultSubagentModelId ?? "auto";
  const publicProfilePath = session?.user?.username
    ? `/u/${session.user.username}`
    : null;

  const defaultModelOptions = useMemo(
    () => withMissingModelOption(modelOptions, selectedDefaultModelId),
    [modelOptions, selectedDefaultModelId],
  );
  const subagentModelOptions = useMemo(
    () =>
      withMissingModelOption(modelOptions, preferences?.defaultSubagentModelId),
    [modelOptions, preferences?.defaultSubagentModelId],
  );

  const handleThemeChange = (nextTheme: string) => {
    if (isThemePreference(nextTheme)) {
      setTheme(nextTheme);
    }
  };

  const handleModelChange = async (modelId: string) => {
    setIsSaving(true);
    try {
      await updatePreferences({ defaultModelId: modelId });
    } catch (error) {
      console.error("Failed to update model preference:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubagentModelChange = async (value: string) => {
    setIsSaving(true);
    try {
      await updatePreferences({
        defaultSubagentModelId: value === "auto" ? null : value,
      });
    } catch (error) {
      console.error("Failed to update subagent model preference:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSandboxChange = async (sandboxType: SandboxType) => {
    setIsSaving(true);
    try {
      await updatePreferences({ defaultSandboxType: sandboxType });
    } catch (error) {
      console.error("Failed to update sandbox preference:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiffModeChange = async (diffMode: DiffMode) => {
    setIsSaving(true);
    try {
      await updatePreferences({ defaultDiffMode: diffMode });
    } catch (error) {
      console.error("Failed to update diff mode preference:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoCommitPushChange = async (enabled: boolean) => {
    setIsSaving(true);
    try {
      await updatePreferences({ autoCommitPush: enabled });
    } catch (error) {
      console.error("Failed to update auto-commit preference:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoCreatePrChange = async (enabled: boolean) => {
    setIsSaving(true);
    try {
      await updatePreferences({ autoCreatePr: enabled });
    } catch (error) {
      console.error("Failed to update auto-PR preference:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGuidedFrontendWorkflowEnabledChange = async (
    enabled: boolean,
  ) => {
    setIsSaving(true);
    try {
      await updatePreferences({ guidedFrontendWorkflowEnabled: enabled });
    } catch (error) {
      console.error(
        "Failed to update guided frontend workflow preference:",
        error,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handlePermissionModeChange = async (mode: PermissionMode) => {
    setIsSaving(true);
    try {
      await updatePreferences({ defaultPermissionMode: mode });
    } catch (error) {
      console.error("Failed to update default permission mode:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAlertsEnabledChange = async (enabled: boolean) => {
    setIsSaving(true);
    try {
      await updatePreferences({ alertsEnabled: enabled });
    } catch (error) {
      console.error("Failed to update alerts preference:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAlertSoundEnabledChange = async (enabled: boolean) => {
    setIsSaving(true);
    try {
      await updatePreferences({ alertSoundEnabled: enabled });
    } catch (error) {
      console.error("Failed to update alert sound preference:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublicUsageEnabledChange = async (enabled: boolean) => {
    setIsSaving(true);
    try {
      await updatePreferences({ publicUsageEnabled: enabled });
      if (!enabled) {
        setCopiedPublicProfile(false);
      }
    } catch (error) {
      console.error("Failed to update public usage preference:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyPublicProfileUrl = async () => {
    if (!publicProfilePath || typeof window === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${publicProfilePath}`,
      );
      setCopiedPublicProfile(true);
      window.setTimeout(() => setCopiedPublicProfile(false), 1500);
    } catch (error) {
      console.error("Failed to copy public usage URL:", error);
    }
  };

  const handleAddGlobalSkillRef = async () => {
    const existingRefs = preferences?.globalSkillRefs ?? [];
    const errorMessage = getGlobalSkillRefError({
      source: globalSkillSource,
      skillName: globalSkillName,
      existingRefs,
    });

    if (errorMessage) {
      setGlobalSkillsError(errorMessage);
      return;
    }

    setIsSaving(true);
    setGlobalSkillsError(null);
    try {
      const nextRef = globalSkillRefSchema.parse({
        source: globalSkillSource,
        skillName: globalSkillName,
      });
      await updatePreferences({
        globalSkillRefs: [...existingRefs, nextRef],
      });
      setGlobalSkillSource("");
      setGlobalSkillName("");
    } catch (error) {
      console.error("Failed to add global skill preference:", error);
      setGlobalSkillsError("Failed to add global skill");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveGlobalSkillRef = async (index: number) => {
    const existingRefs = preferences?.globalSkillRefs ?? [];

    setIsSaving(true);
    setGlobalSkillsError(null);
    try {
      await updatePreferences({
        globalSkillRefs: existingRefs.filter(
          (_, refIndex) => refIndex !== index,
        ),
      });
    } catch (error) {
      console.error("Failed to remove global skill preference:", error);
      setGlobalSkillsError("Failed to remove global skill");
    } finally {
      setIsSaving(false);
    }
  };

  const enabledModelIds = useMemo(
    () => new Set(preferences?.enabledModelIds),
    [preferences?.enabledModelIds],
  );

  const handleAddModel = useCallback(
    async (modelId: string) => {
      const currentIds = preferences?.enabledModelIds ?? [];
      if (currentIds.includes(modelId)) return;

      setIsSaving(true);
      try {
        await updatePreferences({ enabledModelIds: [...currentIds, modelId] });
      } catch (error) {
        console.error("Failed to update enabled models:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [preferences?.enabledModelIds, updatePreferences],
  );

  const handleRemoveModel = useCallback(
    async (modelId: string) => {
      const currentIds = preferences?.enabledModelIds ?? [];

      setIsSaving(true);
      try {
        await updatePreferences({
          enabledModelIds: currentIds.filter((id) => id !== modelId),
        });
      } catch (error) {
        console.error("Failed to update enabled models:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [preferences?.enabledModelIds, updatePreferences],
  );

  const handleSetEnabledModels = useCallback(
    async (nextIds: string[]) => {
      setIsSaving(true);
      try {
        await updatePreferences({ enabledModelIds: nextIds });
      } catch (error) {
        console.error("Failed to update enabled models:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [updatePreferences],
  );

  return {
    theme,
    setTheme,
    preferences,
    loading,
    updatePreferences,
    modelOptions,
    modelOptionsLoading,
    isSaving,
    globalSkillSource,
    setGlobalSkillSource,
    globalSkillName,
    setGlobalSkillName,
    globalSkillsError,
    setGlobalSkillsError,
    copiedPublicProfile,
    setCopiedPublicProfile,
    selectedDefaultModelId,
    selectedSubagentModelId,
    publicProfilePath,
    defaultModelOptions,
    subagentModelOptions,
    handleThemeChange,
    handleModelChange,
    handleSubagentModelChange,
    handleSandboxChange,
    handleDiffModeChange,
    handleAutoCommitPushChange,
    handleAutoCreatePrChange,
    handleGuidedFrontendWorkflowEnabledChange,
    handlePermissionModeChange,
    handleAlertsEnabledChange,
    handleAlertSoundEnabledChange,
    handlePublicUsageEnabledChange,
    handleCopyPublicProfileUrl,
    handleAddGlobalSkillRef,
    handleRemoveGlobalSkillRef,
    enabledModelIds,
    handleAddModel,
    handleRemoveModel,
    handleSetEnabledModels,
  };
}

const THEME_ICONS: Record<
  ThemePreference,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export function PreferencesSection() {
  const state = usePreferencesSectionState();

  if (state.loading) {
    return <EntryLoadingScreen fullScreen={false} />;
  }

  const {
    theme,
    preferences,
    isSaving,
    copiedPublicProfile,
    publicProfilePath,
    handleThemeChange,
    handleSandboxChange,
    handleDiffModeChange,
    handleAutoCommitPushChange,
    handleAutoCreatePrChange,
    handleGuidedFrontendWorkflowEnabledChange,
    handlePermissionModeChange,
    handleAlertsEnabledChange,
    handleAlertSoundEnabledChange,
    handlePublicUsageEnabledChange,
    handleCopyPublicProfileUrl,
  } = state;

  const currentPermissionMode: PermissionMode =
    (preferences?.defaultPermissionMode as PermissionMode | undefined) ?? "ask";
  const currentDiffMode: DiffMode = preferences?.defaultDiffMode ?? "unified";
  const autoCommitEnabled = preferences?.autoCommitPush ?? false;
  const alertsEnabled = preferences?.alertsEnabled ?? true;
  const publicUsageEnabled = preferences?.publicUsageEnabled ?? false;
  const skillPackCount = (preferences?.globalSkillRefs ?? []).length;

  return (
    <div className="space-y-8">
      {/* ── Workspace & Appearance ── */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-medium text-muted-foreground">
          Workspace &amp; appearance
        </h2>
        <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
          {/* Theme */}
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Theme</p>
              <p className="text-xs text-muted-foreground">
                Saved locally in this browser
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="Theme"
              className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:w-auto"
            >
              {THEME_OPTIONS.map((option) => {
                const Icon = THEME_ICONS[option.id];
                const active = theme === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => handleThemeChange(option.id)}
                    className={cn(
                      "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" strokeWidth={1.5} />
                    {option.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Default Diff View */}
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                Default diff view
              </p>
              <p className="text-xs text-muted-foreground">
                How file changes are displayed in the workspace
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="Default diff view"
              className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:w-auto"
            >
              {DIFF_MODE_OPTIONS.map((option) => {
                const active = currentDiffMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={isSaving}
                    onClick={() => handleDiffModeChange(option.id)}
                    className={cn(
                      "cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                      active
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Default Sandbox */}
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="space-y-0.5">
              <Label
                htmlFor="sandbox"
                className="text-sm font-medium text-foreground"
              >
                Default sandbox
              </Label>
              <p className="text-xs text-muted-foreground">
                Runtime environment used for new sessions
              </p>
            </div>
            <Select
              value={preferences?.defaultSandboxType ?? DEFAULT_SANDBOX_TYPE}
              onValueChange={(value) =>
                handleSandboxChange(value as SandboxType)
              }
              disabled={isSaving}
            >
              <SelectTrigger
                id="sandbox"
                className="h-9 w-full rounded-lg sm:w-48"
              >
                <SelectValue placeholder="Select sandbox" />
              </SelectTrigger>
              <SelectContent>
                {SANDBOX_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── Safety & Permissions ── */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-medium text-muted-foreground">
          Safety &amp; permissions
        </h2>
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              Default permission mode
            </p>
            <p className="text-xs text-muted-foreground">
              Controls which tool approval prompts new sessions require; can be
              changed per session
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="Default permission mode"
            className="mt-4 grid gap-2.5 sm:grid-cols-3"
          >
            {PERMISSION_MODE_OPTIONS.map((option) => {
              const active = currentPermissionMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={isSaving}
                  onClick={() => handlePermissionModeChange(option.id)}
                  className={cn(
                    "flex cursor-pointer flex-col items-start rounded-lg border p-3.5 text-left transition-colors disabled:pointer-events-none disabled:opacity-50",
                    active
                      ? "border-foreground/50 bg-muted/40"
                      : "border-border/70 bg-background hover:border-border hover:bg-muted/20",
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {option.name}
                    </span>
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-full border",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border",
                      )}
                    >
                      {active ? (
                        <Check className="size-2.5" strokeWidth={2.5} />
                      ) : null}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {option.description.replace(/\.$/, "")}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Automation ── */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-medium text-muted-foreground">
          Automation
        </h2>
        <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
            <div className="min-w-0 space-y-0.5">
              <Label
                htmlFor="auto-commit-push"
                className="text-sm font-medium text-foreground"
              >
                Auto commit &amp; push
              </Label>
              <p className="text-xs text-muted-foreground">
                Commit and push changes when an agent turn completes
              </p>
            </div>
            <Switch
              id="auto-commit-push"
              checked={autoCommitEnabled}
              onCheckedChange={handleAutoCommitPushChange}
              disabled={isSaving}
            />
          </div>

          <div
            className={cn(
              "flex items-center justify-between gap-4 p-4 sm:p-5",
              !autoCommitEnabled && "opacity-60",
            )}
          >
            <div className="min-w-0 space-y-0.5">
              <Label
                htmlFor="auto-create-pr"
                className="text-sm font-medium text-foreground"
              >
                Auto create pull request
              </Label>
              <p className="text-xs text-muted-foreground">
                Open a pull request automatically after auto commit
              </p>
            </div>
            <Switch
              id="auto-create-pr"
              checked={preferences?.autoCreatePr ?? false}
              onCheckedChange={handleAutoCreatePrChange}
              disabled={isSaving || !autoCommitEnabled}
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
            <div className="min-w-0 space-y-0.5">
              <Label
                htmlFor="guided-frontend-workflow"
                className="text-sm font-medium text-foreground"
              >
                Guided frontend workflow
              </Label>
              <p className="text-xs text-muted-foreground">
                Agree on a design spec first and run a browser audit loop on
                frontend builds
              </p>
            </div>
            <Switch
              id="guided-frontend-workflow"
              checked={preferences?.guidedFrontendWorkflowEnabled ?? false}
              onCheckedChange={handleGuidedFrontendWorkflowEnabledChange}
              disabled={isSaving}
            />
          </div>
        </div>
      </section>

      {/* ── Notifications & Sharing ── */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-medium text-muted-foreground">
          Notifications &amp; sharing
        </h2>
        <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
            <div className="min-w-0 space-y-0.5">
              <Label
                htmlFor="alerts-enabled"
                className="text-sm font-medium text-foreground"
              >
                Background alerts
              </Label>
              <p className="text-xs text-muted-foreground">
                Notify when a background agent finishes running
              </p>
            </div>
            <Switch
              id="alerts-enabled"
              checked={alertsEnabled}
              onCheckedChange={handleAlertsEnabledChange}
              disabled={isSaving}
            />
          </div>

          {alertsEnabled ? (
            <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0 space-y-0.5">
                <Label
                  htmlFor="alert-sound-enabled"
                  className="text-sm font-medium text-foreground"
                >
                  Alert sound
                </Label>
                <p className="text-xs text-muted-foreground">
                  Play a subtle chime alongside desktop alerts
                </p>
              </div>
              <Switch
                id="alert-sound-enabled"
                checked={preferences?.alertSoundEnabled ?? true}
                onCheckedChange={handleAlertSoundEnabledChange}
                disabled={isSaving}
              />
            </div>
          ) : null}

          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-0.5">
                <Label
                  htmlFor="public-usage-enabled"
                  className="text-sm font-medium text-foreground"
                >
                  Public usage profile
                </Label>
                <p className="text-xs text-muted-foreground">
                  Publish a shareable activity summary at{" "}
                  <code className="font-mono text-[11px] text-foreground">
                    {publicProfilePath ?? "/u/username"}
                  </code>
                </p>
              </div>
              <Switch
                id="public-usage-enabled"
                checked={publicUsageEnabled}
                onCheckedChange={handlePublicUsageEnabledChange}
                disabled={isSaving}
              />
            </div>

            {publicUsageEnabled && publicProfilePath ? (
              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <Input
                  id="public-usage-url"
                  readOnly
                  value={publicProfilePath}
                  className="h-9 rounded-lg font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyPublicProfileUrl}
                  disabled={isSaving}
                  className="h-9 shrink-0 cursor-pointer rounded-lg px-3"
                >
                  {copiedPublicProfile ? (
                    <Check className="mr-1.5 size-3.5" strokeWidth={1.5} />
                  ) : (
                    <Copy className="mr-1.5 size-3.5" strokeWidth={1.5} />
                  )}
                  {copiedPublicProfile ? "Copied" : "Copy URL"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Agent Skills ── */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-medium text-muted-foreground">
          Agent skills
        </h2>
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Terminal
                className="size-4 text-muted-foreground"
                strokeWidth={1.5}
              />
              <span className="text-sm font-medium text-foreground">
                Built-in skills &amp; GitHub skill packs
              </span>
              {skillPackCount > 0 ? (
                <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {skillPackCount} {skillPackCount === 1 ? "pack" : "packs"}
                </span>
              ) : null}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Browse built-in skills, inspect instructions, or attach GitHub
              skill repositories
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full shrink-0 rounded-lg sm:w-auto"
          >
            <Link href="/settings/skills">
              Manage skills
              <ArrowUpRight className="ml-1.5 size-3.5" strokeWidth={1.5} />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

export function ModelPreferencesSection() {
  const state = usePreferencesSectionState();

  if (state.loading) {
    return <ModelPreferencesSectionSkeleton />;
  }

  const {
    defaultModelOptions,
    selectedDefaultModelId,
    selectedSubagentModelId,
    subagentModelOptions,
    modelOptions,
    modelOptionsLoading,
    enabledModelIds,
    isSaving,
    handleModelChange,
    handleSubagentModelChange,
    handleAddModel,
    handleRemoveModel,
    handleSetEnabledModels,
  } = state;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SectionHeader>Model preferences</SectionHeader>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="model">Default model</Label>
            <ModelCombobox
              value={selectedDefaultModelId}
              items={defaultModelOptions.map((option) => ({
                id: option.id,
                label: option.label,
                description: option.description,
              }))}
              placeholder="Select a model"
              searchPlaceholder="Search models..."
              emptyText={modelOptionsLoading ? "Loading..." : "No models found"}
              disabled={isSaving || modelOptionsLoading}
              onChange={handleModelChange}
            />
            <p className="text-xs text-muted-foreground">
              The model used for new chats.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="subagent-model">Subagent model</Label>
            <ModelCombobox
              value={selectedSubagentModelId}
              items={[
                { id: "auto", label: "Same as main model" },
                ...subagentModelOptions.map((option) => ({
                  id: option.id,
                  label: option.label,
                  description: option.description,
                })),
              ]}
              placeholder="Select a model"
              searchPlaceholder="Search models..."
              emptyText={modelOptionsLoading ? "Loading..." : "No models found"}
              disabled={isSaving || modelOptionsLoading}
              onChange={handleSubagentModelChange}
            />
            <p className="text-xs text-muted-foreground">
              For on-demand specialist subagents (/architect, /explorer,
              /executor, /reviewer, /design).
            </p>
          </div>
        </div>

        <EnabledModelsSection
          modelOptions={modelOptions}
          modelOptionsLoading={modelOptionsLoading}
          enabledModelIds={enabledModelIds}
          onAddModel={handleAddModel}
          onRemoveModel={handleRemoveModel}
          onSetEnabledModels={handleSetEnabledModels}
          disabled={isSaving}
        />
      </div>

      <div className="border-t border-border/50 pt-6">
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Terminal
                className="h-4 w-4 text-muted-foreground"
                strokeWidth={1.5}
              />
              <span className="text-sm font-medium">
                Agent skills &amp; slash commands
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Skills now have a dedicated catalog where you can inspect{" "}
              <code>SKILL.md</code> instructions and install GitHub skill packs
              (such as <code>/unslop</code> and <code>/frontend-design</code>)
              with one click.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/settings/skills">
              Open skills catalog
              <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function EnabledModelsSection({
  modelOptions,
  modelOptionsLoading,
  enabledModelIds,
  onAddModel,
  onRemoveModel,
  onSetEnabledModels,
  disabled,
}: {
  modelOptions: ModelOption[];
  modelOptionsLoading: boolean;
  enabledModelIds: Set<string>;
  onAddModel: (modelId: string) => void;
  onRemoveModel: (modelId: string) => void;
  onSetEnabledModels: (ids: string[]) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const enabledCount = enabledModelIds.size;

  const enabledOptions = useMemo(
    () => modelOptions.filter((option) => enabledModelIds.has(option.id)),
    [modelOptions, enabledModelIds],
  );

  const availableOptions = useMemo(() => {
    const opts = modelOptions.filter(
      (option) => !enabledModelIds.has(option.id),
    );
    if (!search.trim()) return opts;
    const lower = search.toLowerCase();
    return opts.filter(
      (option) =>
        option.label.toLowerCase().includes(lower) ||
        option.id.toLowerCase().includes(lower) ||
        (option.description?.toLowerCase().includes(lower) ?? false),
    );
  }, [modelOptions, enabledModelIds, search]);

  const handleDeselectAll = () => {
    onSetEnabledModels([]);
  };

  const handleAdd = (modelId: string) => {
    onAddModel(modelId);
    setSearch("");
    inputRef.current?.focus();
  };

  if (modelOptionsLoading) {
    return (
      <div className="grid gap-2">
        <Label>Custom Model Set</Label>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label>Custom Model Set</Label>
          {enabledCount > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleDeselectAll}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-40"
            >
              Clear all
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {enabledCount === 0
            ? "By default, every available model is shown in the model selector. Add models here to create a shortlist of just the ones you use."
            : `The model selector will only show ${enabledCount === 1 ? "this model" : `these ${enabledCount} models`}. Remove all to go back to showing every model.`}
        </p>
      </div>

      {enabledOptions.length > 0 && (
        <div className="divide-y divide-border/60 rounded-lg border border-border/70">
          {enabledOptions.map((option) => (
            <div key={option.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {option.label}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {option.id}
                </p>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemoveModel(option.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
                aria-label={`Remove ${option.label}`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            placeholder="Search to add a model..."
            disabled={disabled}
            className="pl-9"
          />
        </div>
        {dropdownOpen && (
          <>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- backdrop dismiss */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => {
                setDropdownOpen(false);
                setSearch("");
              }}
            />
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-popover shadow-md">
              <div className="max-h-60 overflow-y-auto">
                {availableOptions.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {search.trim()
                      ? "No matching models."
                      : "All models have been added."}
                  </p>
                ) : (
                  availableOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleAdd(option.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                    >
                      <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">
                            {option.label}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {option.description ?? option.id}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
