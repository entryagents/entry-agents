"use client";

import {
  Check,
  ChevronDown,
  Cloud,
  Folder,
  FolderGit2,
  FolderPlus,
  GitBranch,
  Loader2,
  MessageSquare,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { GitHubImportDialog } from "@/components/github-import-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SessionWithUnread } from "@/hooks/use-sessions";
import type { Project } from "@/lib/db/schema";
import type { SidebarProjectGroup } from "@/lib/sessions/group-projects";
import { fetcher } from "@/lib/swr";

export type SelectedNewChatTarget =
  | { kind: "standalone" }
  | {
      kind: "folder";
      projectId: string;
      name: string;
    }
  | {
      kind: "github";
      projectId?: string;
      repoOwner: string;
      repoName: string;
      defaultBranch?: string | null;
    };

interface NewChatProjectPickerProps {
  readonly target: SelectedNewChatTarget;
  readonly projectGroups: SidebarProjectGroup[];
  readonly standaloneSessions: SessionWithUnread[];
  readonly onSelectTarget: (target: SelectedNewChatTarget) => void;
  readonly onCreateFolder: (
    name: string,
    options?: { assignSessionId?: string | null },
  ) => Promise<Project>;
  readonly onCreateRepoProject: (input: {
    repoOwner: string;
    repoName: string;
    defaultBranch?: string | null;
  }) => Promise<Project>;
}

export function NewChatProjectPicker({
  target,
  projectGroups,
  standaloneSessions,
  onSelectTarget,
  onCreateFolder,
  onCreateRepoProject,
}: NewChatProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [assignSessionId, setAssignSessionId] = useState<string>("");
  const [submittingFolder, setSubmittingFolder] = useState(false);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projectGroups;
    return projectGroups.filter((group) => {
      const label =
        group.kind === "github"
          ? `${group.repoOwner}/${group.repoName}`
          : group.name;
      return label.toLowerCase().includes(q);
    });
  }, [projectGroups, query]);

  const triggerLabel =
    target.kind === "github"
      ? `${target.repoOwner}/${target.repoName}`
      : target.kind === "folder"
        ? target.name
        : "No project";

  const handleSubmitNewFolder = async () => {
    const trimmed = folderName.trim();
    if (!trimmed || submittingFolder) return;
    setSubmittingFolder(true);
    try {
      const created = await onCreateFolder(trimmed, {
        assignSessionId: assignSessionId || null,
      });
      onSelectTarget({
        kind: "folder",
        projectId: created.id,
        name: created.name,
      });
      setFolderName("");
      setAssignSessionId("");
      setCreatingFolder(false);
      setOpen(false);
    } finally {
      setSubmittingFolder(false);
    }
  };

  const handleImportRepo = async (owner: string, repo: string) => {
    const created = await onCreateRepoProject({
      repoOwner: owner,
      repoName: repo,
    });
    onSelectTarget({
      kind: "github",
      projectId: created.id,
      repoOwner: created.repoOwner ?? owner,
      repoName: created.repoName ?? repo,
      defaultBranch: created.defaultBranch ?? null,
    });
    setOpen(false);
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
            setCreatingFolder(false);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 max-w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label="Select project for new chat"
          >
            {target.kind === "folder" ? (
              <Folder className="size-4 shrink-0" strokeWidth={1.5} />
            ) : (
              <Cloud className="size-4 shrink-0" strokeWidth={1.5} />
            )}
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown
              className="size-3.5 shrink-0 opacity-70"
              strokeWidth={1.5}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-72 overflow-hidden rounded-xl border border-border/80 bg-popover p-1.5 shadow-lg"
        >
          {creatingFolder ? (
            <div className="space-y-2.5 p-2">
              <div className="text-xs font-medium text-foreground">
                New project folder
              </div>
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSubmitNewFolder();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setCreatingFolder(false);
                  }
                }}
                placeholder="Project name"
                maxLength={80}
                autoFocus
                disabled={submittingFolder}
                className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-foreground/40 focus:outline-none"
              />

              {standaloneSessions.length > 0 && (
                <div className="space-y-1">
                  <label
                    htmlFor="new-project-assign-chat"
                    className="block text-[11px] text-muted-foreground"
                  >
                    Include an existing chat (optional)
                  </label>
                  <select
                    id="new-project-assign-chat"
                    value={assignSessionId}
                    onChange={(e) => setAssignSessionId(e.target.value)}
                    disabled={submittingFolder}
                    className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:border-foreground/40 focus:outline-none"
                  >
                    <option value="">Start empty</option>
                    {standaloneSessions.slice(0, 20).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setCreatingFolder(false)}
                  disabled={submittingFolder}
                  className="h-7 cursor-pointer rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmitNewFolder()}
                  disabled={submittingFolder || !folderName.trim()}
                  className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {submittingFolder && (
                    <Loader2 className="size-3 animate-spin" />
                  )}
                  <span>Create</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {projectGroups.length > 3 && (
                <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5">
                  <Search
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter projects..."
                    className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 outline-none"
                  />
                </div>
              )}

              <div className="max-h-60 space-y-0.5 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    onSelectTarget({ kind: "standalone" });
                    setOpen(false);
                  }}
                  className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-xs transition-colors ${
                    target.kind === "standalone"
                      ? "bg-foreground/[0.07] font-medium text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                  }`}
                >
                  <MessageSquare
                    className="size-3.5 shrink-0 opacity-80"
                    strokeWidth={1.5}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    Standalone chat
                  </span>
                  {target.kind === "standalone" && (
                    <Check className="size-3.5 shrink-0" strokeWidth={1.6} />
                  )}
                </button>

                {filteredGroups.length > 0 && (
                  <div className="my-1 border-t border-border/60 pt-1">
                    {filteredGroups.map((group) => {
                      const label =
                        group.kind === "github"
                          ? `${group.repoOwner}/${group.repoName}`
                          : group.name;
                      const isSelected =
                        (group.kind === "github" &&
                          target.kind === "github" &&
                          group.repoOwner.toLowerCase() ===
                            target.repoOwner.toLowerCase() &&
                          group.repoName.toLowerCase() ===
                            target.repoName.toLowerCase()) ||
                        (group.kind === "folder" &&
                          target.kind === "folder" &&
                          group.projectId === target.projectId);

                      return (
                        <button
                          key={group.key}
                          type="button"
                          onClick={() => {
                            if (group.kind === "github") {
                              onSelectTarget({
                                kind: "github",
                                projectId: group.projectId,
                                repoOwner: group.repoOwner,
                                repoName: group.repoName,
                                defaultBranch: group.defaultBranch ?? null,
                              });
                            } else {
                              onSelectTarget({
                                kind: "folder",
                                projectId: group.projectId,
                                name: group.name,
                              });
                            }
                            setOpen(false);
                          }}
                          className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-xs transition-colors ${
                            isSelected
                              ? "bg-foreground/[0.07] font-medium text-foreground"
                              : "text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground"
                          }`}
                        >
                          {group.kind === "github" ? (
                            <Cloud
                              className="size-3.5 shrink-0 text-muted-foreground"
                              strokeWidth={1.5}
                            />
                          ) : (
                            <Folder
                              className="size-3.5 shrink-0 text-muted-foreground"
                              strokeWidth={1.5}
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            {label}
                          </span>
                          {isSelected && (
                            <Check
                              className="size-3.5 shrink-0"
                              strokeWidth={1.6}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setImportOpen(true);
                  }}
                  className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                >
                  <FolderGit2 className="size-3.5 shrink-0" strokeWidth={1.5} />
                  <span>Import GitHub repository</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreatingFolder(true)}
                  className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                >
                  <FolderPlus className="size-3.5 shrink-0" strokeWidth={1.5} />
                  <span>New project folder</span>
                </button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      <GitHubImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportRepo={handleImportRepo}
      />
    </>
  );
}

interface NewChatBranchPickerProps {
  readonly owner: string;
  readonly repo: string;
  readonly selectedBranch: string | null;
  readonly isNewBranch: boolean;
  readonly onChange: (next: {
    branch: string | null;
    isNewBranch: boolean;
  }) => void;
}

export function NewChatBranchPicker({
  owner,
  repo,
  selectedBranch,
  isNewBranch,
  onChange,
}: NewChatBranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data, isLoading } = useSWR<{ branches?: string[] }>(
    owner && repo
      ? `/api/github/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
      : null,
    (url: string) => fetcher<{ branches?: string[] }>(url),
    { revalidateOnFocus: false },
  );

  const branches = useMemo(() => data?.branches ?? [], [data?.branches]);
  const defaultBranch = branches.includes("main")
    ? "main"
    : (branches[0] ?? "main");
  const displayLabel = isNewBranch
    ? "New branch"
    : (selectedBranch ?? defaultBranch);

  const filteredBranches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground"
          aria-label="Select Git branch"
        >
          <GitBranch className="size-3.5 shrink-0" strokeWidth={1.5} />
          <span className="max-w-44 truncate font-mono text-[12px]">
            {displayLabel}
          </span>
          <ChevronDown
            className="size-3 shrink-0 opacity-70"
            strokeWidth={1.5}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-64 overflow-hidden rounded-xl border border-border/80 bg-popover p-1.5 shadow-lg"
      >
        <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5">
          <Search
            className="size-3.5 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search branches..."
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 outline-none"
          />
        </div>

        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              onChange({ branch: null, isNewBranch: true });
              setOpen(false);
            }}
            className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-xs transition-colors ${
              isNewBranch
                ? "bg-foreground/[0.07] font-medium text-foreground"
                : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
            }`}
          >
            <Plus className="size-3.5 shrink-0" strokeWidth={1.5} />
            <span className="min-w-0 flex-1 truncate">Create new branch</span>
            {isNewBranch && (
              <Check className="size-3.5 shrink-0" strokeWidth={1.6} />
            )}
          </button>

          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Loading branches...</span>
            </div>
          ) : filteredBranches.length > 0 ? (
            <div className="my-1 border-t border-border/60 pt-1">
              {filteredBranches.map((branch) => {
                const active =
                  !isNewBranch && (selectedBranch ?? defaultBranch) === branch;
                return (
                  <button
                    key={branch}
                    type="button"
                    onClick={() => {
                      onChange({ branch, isNewBranch: false });
                      setOpen(false);
                    }}
                    className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left font-mono text-[11.5px] transition-colors ${
                      active
                        ? "bg-foreground/[0.07] font-medium text-foreground"
                        : "text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground"
                    }`}
                  >
                    <GitBranch
                      className="size-3 shrink-0 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    <span className="min-w-0 flex-1 truncate">{branch}</span>
                    {active && (
                      <Check className="size-3.5 shrink-0" strokeWidth={1.6} />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              Default branch ({defaultBranch})
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
