"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Check,
  Copy,
  Eye,
  FileCode2,
  GitBranch,
  Plus,
  Search,
  Terminal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type {
  BuiltinSkillCatalogEntry,
  GithubSkillPreset,
  SkillCategory,
} from "@/app/api/skills/catalog/route";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import {
  globalSkillRefSchema,
  type GlobalSkillRef,
} from "@/lib/skills/global-skill-refs";
import { fetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";

interface SkillsCatalogResponse {
  builtinSkills: BuiltinSkillCatalogEntry[];
  githubPresets: GithubSkillPreset[];
}

const CATEGORY_FILTERS: Array<{
  id: "all" | SkillCategory;
  label: string;
}> = [
  { id: "all", label: "All Skills" },
  { id: "ui-design", label: "UI & Design" },
  { id: "architecture-review", label: "Architecture & Review" },
  { id: "ai-workflows", label: "AI & Workflows" },
  { id: "backend-cloud", label: "Backend & Cloud" },
];

export function SkillsSectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-28 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-36 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function parseShorthandSkillInput(
  rawSource: string,
  rawSkillName: string,
): { source: string; skillName: string } {
  const trimmedSource = rawSource
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^npx\s+skills\s+add\s+/i, "");
  const trimmedSkill = rawSkillName.trim().replace(/^\//, "");

  if (!trimmedSkill && trimmedSource.split("/").filter(Boolean).length >= 3) {
    const parts = trimmedSource.split("/").filter(Boolean);
    return {
      source: `${parts[0]}/${parts[1]}`,
      skillName: parts[parts.length - 1] ?? "",
    };
  }

  return {
    source: trimmedSource,
    skillName: trimmedSkill,
  };
}

export function SkillsSection() {
  const { data, isLoading } = useSWR<SkillsCatalogResponse>(
    "/api/skills/catalog",
    fetcher,
    { revalidateOnFocus: false },
  );
  const {
    preferences,
    loading: prefsLoading,
    updatePreferences,
  } = useUserPreferences();

  const [activeTab, setActiveTab] = useState<"builtin" | "github">("builtin");
  const [categoryFilter, setCategoryFilter] = useState<"all" | SkillCategory>(
    "all",
  );
  const [search, setSearch] = useState("");
  const [copiedSkill, setCopiedSkill] = useState<string | null>(null);
  const [inspectedSkill, setInspectedSkill] =
    useState<BuiltinSkillCatalogEntry | null>(null);

  const [repoInput, setRepoInput] = useState("");
  const [skillNameInput, setSkillNameInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const builtinSkills = useMemo(
    () => data?.builtinSkills ?? [],
    [data?.builtinSkills],
  );
  const githubPresets = useMemo(
    () => data?.githubPresets ?? [],
    [data?.githubPresets],
  );
  const globalSkillRefs = useMemo(
    () => preferences?.globalSkillRefs ?? [],
    [preferences?.globalSkillRefs],
  );

  const filteredBuiltinSkills = useMemo(() => {
    const q = search.trim().toLowerCase();
    return builtinSkills.filter((skill) => {
      if (categoryFilter !== "all" && skill.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.categoryLabel.toLowerCase().includes(q)
      );
    });
  }, [builtinSkills, categoryFilter, search]);

  const handleCopyCommand = async (skillName: string) => {
    try {
      await navigator.clipboard.writeText(`/${skillName} `);
      setCopiedSkill(skillName);
      toast.success(`Copied /${skillName} — paste in any chat composer`);
      window.setTimeout(() => setCopiedSkill(null), 1500);
    } catch {
      toast.error("Failed to copy skill command");
    }
  };

  const isPresetInstalled = (preset: GithubSkillPreset) =>
    globalSkillRefs.some(
      (ref) =>
        ref.source.toLowerCase() === preset.source.toLowerCase() &&
        ref.skillName.toLowerCase() === preset.skillName.toLowerCase(),
    );

  const handleTogglePreset = async (preset: GithubSkillPreset) => {
    setIsMutating(true);
    setFormError(null);
    try {
      const installed = isPresetInstalled(preset);
      const nextRefs: GlobalSkillRef[] = installed
        ? globalSkillRefs.filter(
            (ref) =>
              !(
                ref.source.toLowerCase() === preset.source.toLowerCase() &&
                ref.skillName.toLowerCase() === preset.skillName.toLowerCase()
              ),
          )
        : [
            ...globalSkillRefs,
            { source: preset.source, skillName: preset.skillName },
          ];
      await updatePreferences({ globalSkillRefs: nextRefs });
      toast.success(
        installed
          ? `Removed ${preset.skillName} from GitHub skills`
          : `Added ${preset.skillName} (${preset.source})`,
      );
    } catch {
      toast.error("Failed to update GitHub skills");
    } finally {
      setIsMutating(false);
    }
  };

  const handleAddCustomRepoSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const resolved = parseShorthandSkillInput(repoInput, skillNameInput);
    const parsed = globalSkillRefSchema.safeParse(resolved);
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ??
          "Enter a valid owner/repo and skill name",
      );
      return;
    }

    const exists = globalSkillRefs.some(
      (ref) =>
        ref.source.toLowerCase() === parsed.data.source.toLowerCase() &&
        ref.skillName.toLowerCase() === parsed.data.skillName.toLowerCase(),
    );
    if (exists) {
      setFormError("This GitHub skill is already installed.");
      return;
    }

    setIsMutating(true);
    try {
      await updatePreferences({
        globalSkillRefs: [...globalSkillRefs, parsed.data],
      });
      setRepoInput("");
      setSkillNameInput("");
      toast.success(
        `Installed /${parsed.data.skillName} from ${parsed.data.source}`,
      );
    } catch {
      setFormError("Failed to save skill to preferences.");
    } finally {
      setIsMutating(false);
    }
  };

  const handleRemoveGlobalSkill = async (index: number) => {
    setIsMutating(true);
    try {
      const removed = globalSkillRefs[index];
      await updatePreferences({
        globalSkillRefs: globalSkillRefs.filter((_, i) => i !== index),
      });
      if (removed) {
        toast.success(`Removed /${removed.skillName}`);
      }
    } catch {
      toast.error("Failed to remove skill");
    } finally {
      setIsMutating(false);
    }
  };

  if (isLoading || prefsLoading) {
    return <SkillsSectionSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Top summary bar & tab switcher */}
      <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-foreground">
              <Terminal
                className="h-3 w-3 text-muted-foreground"
                strokeWidth={1.5}
              />
              {builtinSkills.length} built-in skills
            </span>
            {globalSkillRefs.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                <GitBranch className="h-3 w-3" strokeWidth={1.5} />
                {globalSkillRefs.length} GitHub{" "}
                {globalSkillRefs.length === 1 ? "pack" : "packs"}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Invoke any skill in chat by typing{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
              /skill-name
            </code>{" "}
            (for example{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
              /unslop
            </code>{" "}
            or{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
              /frontend-design
            </code>
            ), or let Entry Agent load them automatically when relevant.
          </p>
        </div>

        <div className="inline-flex shrink-0 rounded-lg border border-border/80 bg-muted/50 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("builtin")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium tabular-nums transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
              activeTab === "builtin"
                ? "bg-background text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Built-in catalog ({builtinSkills.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("github")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium tabular-nums transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
              activeTab === "github"
                ? "bg-background text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            GitHub skill packs ({globalSkillRefs.length})
          </button>
        </div>
      </div>

      {activeTab === "builtin" ? (
        <div className="space-y-4">
          {/* Category filters & search */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_FILTERS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
                    categoryFilter === cat.id
                      ? "border-foreground/20 bg-foreground text-background"
                      : "border-border/80 bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.5}
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter skills (e.g. unslop)..."
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          {/* Built-in skills grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredBuiltinSkills.map((skill) => {
              const isCopied = copiedSkill === skill.name;
              return (
                <div
                  key={skill.name}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-border/80 bg-card p-4 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md border border-border/80 bg-muted/70 px-2 py-0.5 font-mono text-xs font-medium text-foreground">
                          /{skill.name}
                        </span>
                        <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {skill.categoryLabel}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                        {skill.fileCount}{" "}
                        {skill.fileCount === 1 ? "file" : "files"}
                      </span>
                    </div>

                    <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {skill.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Check
                        className="h-3 w-3 text-emerald-600 dark:text-emerald-400"
                        strokeWidth={1.5}
                      />
                      Active in all sessions
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setInspectedSkill(skill)}
                        className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                        SKILL.md
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyCommand(skill.name)}
                        className="h-7 gap-1 px-2.5 font-mono text-xs"
                      >
                        {isCopied ? (
                          <>
                            <Check
                              className="h-3 w-3 text-emerald-600 dark:text-emerald-400"
                              strokeWidth={1.5}
                            />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" strokeWidth={1.5} />/
                            {skill.name}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1-Click Curated GitHub Skill Presets */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">
                Curated GitHub skill packs
              </h3>
              <p className="text-xs text-muted-foreground">
                Install community and official skill repositories into every new
                sandbox session with one click.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {githubPresets.map((preset) => {
                const installed = isPresetInstalled(preset);
                return (
                  <div
                    key={preset.id}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">
                          {preset.title}
                        </span>
                        <span className="rounded border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {preset.categoryLabel}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {preset.source} · /{preset.skillName}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {preset.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-border/60 pt-3">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        npx skills add {preset.source}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant={installed ? "secondary" : "default"}
                        disabled={isMutating}
                        onClick={() => handleTogglePreset(preset)}
                        className="h-7 text-xs"
                      >
                        {installed ? (
                          <>
                            <Check className="mr-1 h-3 w-3" strokeWidth={1.5} />
                            Installed
                          </>
                        ) : (
                          <>
                            <Plus className="mr-1 h-3 w-3" strokeWidth={1.5} />
                            Install
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom GitHub Skill Installer */}
          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">
                Install a GitHub skill repository
              </h3>
              <p className="text-xs text-muted-foreground">
                Paste a GitHub <code className="font-mono">owner/repo</code> (or{" "}
                <code className="font-mono">owner/repo/skill-name</code>) and
                Entry will provision it in every session.
              </p>
            </div>

            <form
              onSubmit={handleAddCustomRepoSkill}
              className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="skill-repo-source" className="text-xs">
                  GitHub repository (or owner/repo/skill)
                </Label>
                <Input
                  id="skill-repo-source"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="heydamir/unslop or vercel-labs/agent-skills"
                  disabled={isMutating}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="skill-repo-name" className="text-xs">
                  Skill name
                </Label>
                <Input
                  id="skill-repo-name"
                  value={skillNameInput}
                  onChange={(e) => setSkillNameInput(e.target.value)}
                  placeholder="unslop"
                  disabled={isMutating}
                  className="font-mono text-xs"
                />
              </div>
              <Button type="submit" disabled={isMutating}>
                <Plus className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
                Add skill
              </Button>
            </form>

            {formError && (
              <p className="text-xs text-destructive">{formError}</p>
            )}

            {globalSkillRefs.length > 0 && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs text-muted-foreground tabular-nums">
                  Installed GitHub skills ({globalSkillRefs.length})
                </Label>
                <div className="divide-y divide-border/60 rounded-lg border border-border/70">
                  {globalSkillRefs.map((ref, idx) => (
                    <div
                      key={`${ref.source}-${ref.skillName}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold">
                            /{ref.skillName}
                          </span>
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            {ref.source}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={isMutating}
                        onClick={() => handleRemoveGlobalSkill(idx)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${ref.skillName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SKILL.md Inspector Modal */}
      <Dialog
        open={Boolean(inspectedSkill)}
        onOpenChange={(open) => {
          if (!open) setInspectedSkill(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-base">
              <FileCode2
                className="h-4 w-4 text-muted-foreground"
                strokeWidth={1.5}
              />
              /{inspectedSkill?.name}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {inspectedSkill?.description}
            </DialogDescription>
          </DialogHeader>

          {inspectedSkill && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {inspectedSkill.files.map((file) => (
                  <span
                    key={file}
                    className="rounded border border-border bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {file}
                  </span>
                ))}
              </div>
              <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3.5 font-mono text-xs leading-relaxed text-foreground">
                {inspectedSkill.instructionsPreview}
              </pre>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  Type{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono">
                    /{inspectedSkill.name}
                  </code>{" "}
                  in the chat composer to invoke this skill.
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleCopyCommand(inspectedSkill.name)}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
                  Copy /{inspectedSkill.name}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
