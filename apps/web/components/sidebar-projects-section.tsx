"use client";

import {
  Check,
  ChevronDown,
  Folder,
  FolderGit2,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionWithUnread } from "@/hooks/use-sessions";
import type { SidebarProjectGroup } from "@/lib/sessions/group-projects";

export interface SidebarProjectsSectionProps {
  projects: SidebarProjectGroup[];
  activeSessionId: string;
  selectedProjectKey?: string | null;
  onSelectProjectKey?: (key: string | null) => void;
  onOpenImportGithub: () => void;
  onCreateFolder: (name: string) => Promise<void> | void;
  onRenameFolder: (projectId: string, name: string) => Promise<void> | void;
  onDeleteFolder: (projectId: string) => Promise<void> | void;
  onStartChatInFolder: (projectId: string) => void;
  onCreateSessionForRepo: (
    repoOwner: string,
    repoName: string,
  ) => Promise<void> | void;
  renderSessionRow: (session: SessionWithUnread) => ReactNode;
}

export function SidebarProjectsSection({
  projects,
  activeSessionId,
  selectedProjectKey = null,
  onSelectProjectKey,
  onOpenImportGithub,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onStartChatInFolder,
  onCreateSessionForRepo,
  renderSessionRow,
}: SidebarProjectsSectionProps) {
  const [collapsedProjects, setCollapsedProjects] = useState<
    Record<string, boolean>
  >({});
  const [creatingRepoKey, setCreatingRepoKey] = useState<string | null>(null);

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createFolderPending, setCreateFolderPending] = useState(false);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [renamePending, setRenamePending] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreatingFolder) {
      newFolderInputRef.current?.focus();
    }
  }, [isCreatingFolder]);

  useEffect(() => {
    if (renamingProjectId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingProjectId]);

  const toggleProjectCollapsed = (key: string) => {
    setCollapsedProjects((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? false),
    }));
  };

  const handleStartCreateFolder = () => {
    setNewFolderName("");
    setIsCreatingFolder(true);
  };

  const handleCancelCreateFolder = () => {
    if (createFolderPending) return;
    setIsCreatingFolder(false);
    setNewFolderName("");
  };

  const handleSubmitCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed || createFolderPending) {
      if (!trimmed) {
        setIsCreatingFolder(false);
      }
      return;
    }
    setCreateFolderPending(true);
    try {
      await onCreateFolder(trimmed);
      setIsCreatingFolder(false);
      setNewFolderName("");
    } finally {
      setCreateFolderPending(false);
    }
  };

  const handleSubmitRename = async () => {
    if (!renamingProjectId || renamePending) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingProjectId(null);
      return;
    }
    setRenamePending(true);
    try {
      await onRenameFolder(renamingProjectId, trimmed);
      setRenamingProjectId(null);
    } finally {
      setRenamePending(false);
    }
  };

  const handleNewChatInProject = async (
    event: React.MouseEvent,
    project: SidebarProjectGroup,
  ) => {
    event.stopPropagation();
    if (project.kind === "folder") {
      onStartChatInFolder(project.projectId);
      return;
    }
    if (creatingRepoKey) return;
    setCreatingRepoKey(project.key);
    try {
      await onCreateSessionForRepo(project.repoOwner, project.repoName);
    } finally {
      setCreatingRepoKey(null);
    }
  };

  const activeScopeKey =
    selectedProjectKey && projects.some((p) => p.key === selectedProjectKey)
      ? selectedProjectKey
      : null;

  const visibleProjects = activeScopeKey
    ? projects.filter((p) => p.key === activeScopeKey)
    : projects;

  return (
    <div className="mb-3 space-y-2">
      {/* Compact Workspace Scope Strip — filter to a single repo/folder or browse All */}
      <div className="flex items-center gap-1 px-0.5">
        <div
          role="tablist"
          aria-label="Filter by project"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar py-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeScopeKey === null}
            onClick={() => onSelectProjectKey?.(null)}
            className={`inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11.5px] font-medium transition-colors duration-120 cursor-pointer ${
              activeScopeKey === null
                ? "bg-foreground/[0.09] text-foreground"
                : "text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground"
            }`}
          >
            All
          </button>

          {projects.map((project) => {
            const isScoped = activeScopeKey === project.key;
            const hasStreaming = project.sessions.some((s) => s.hasStreaming);
            return (
              <button
                key={project.key}
                type="button"
                role="tab"
                aria-selected={isScoped}
                onClick={() =>
                  onSelectProjectKey?.(isScoped ? null : project.key)
                }
                title={
                  project.kind === "github"
                    ? `${project.repoOwner}/${project.repoName}`
                    : project.name
                }
                className={`inline-flex h-6 max-w-[116px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[11.5px] transition-colors duration-120 cursor-pointer ${
                  isScoped
                    ? "bg-foreground/[0.09] font-medium text-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground"
                }`}
              >
                {hasStreaming ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-sky-500 dark:bg-sky-400" />
                ) : null}
                <span className="truncate">{project.name}</span>
              </button>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-120 hover:bg-foreground/[0.07] hover:text-foreground cursor-pointer"
              aria-label="Add project"
              title="New folder or import repository"
            >
              <Plus className="size-3.5" strokeWidth={1.6} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} className="w-48">
            <DropdownMenuItem onSelect={handleStartCreateFolder}>
              <FolderPlus className="h-4 w-4" strokeWidth={1.5} />
              <span>New folder</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenImportGithub}>
              <FolderGit2 className="h-4 w-4" strokeWidth={1.5} />
              <span>Import from GitHub</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Inline New Folder Creator */}
      {isCreatingFolder ? (
        <div className="mx-0.5 flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-2">
          <Folder
            className="size-3.5 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
          />
          <input
            ref={newFolderInputRef}
            type="text"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSubmitCreateFolder();
              } else if (event.key === "Escape") {
                event.preventDefault();
                handleCancelCreateFolder();
              }
            }}
            placeholder="Folder name"
            maxLength={80}
            disabled={createFolderPending}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground/70 outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSubmitCreateFolder()}
            disabled={createFolderPending || !newFolderName.trim()}
            className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40 cursor-pointer"
            aria-label="Create folder"
          >
            {createFolderPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3.5" strokeWidth={1.6} />
            )}
          </button>
          <button
            type="button"
            onClick={handleCancelCreateFolder}
            disabled={createFolderPending}
            className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground cursor-pointer"
            aria-label="Cancel creating folder"
          >
            <X className="size-3.5" strokeWidth={1.6} />
          </button>
        </div>
      ) : null}

      {/* Empty State Quick Actions */}
      {projects.length === 0 && !isCreatingFolder ? (
        <div className="grid grid-cols-2 gap-1.5 px-0.5">
          <button
            type="button"
            onClick={handleStartCreateFolder}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border/70 px-2.5 text-left text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-foreground/[0.04] hover:text-foreground cursor-pointer"
          >
            <FolderPlus className="size-3.5 shrink-0" strokeWidth={1.5} />
            <span className="truncate">New folder</span>
          </button>
          <button
            type="button"
            onClick={onOpenImportGithub}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border/70 px-2.5 text-left text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-foreground/[0.04] hover:text-foreground cursor-pointer"
          >
            <FolderGit2 className="size-3.5 shrink-0" strokeWidth={1.5} />
            <span className="truncate">Import repo</span>
          </button>
        </div>
      ) : (
        /* Flush Full-Width Project Sections — Zero Indented Tree Pipes */
        <div className="space-y-2.5">
          {visibleProjects.map((project) => {
            const containsActive = project.sessions.some(
              (s) => s.id === activeSessionId,
            );
            const isCollapsed =
              activeScopeKey === project.key
                ? false
                : (collapsedProjects[project.key] ?? false);
            const isCreating = creatingRepoKey === project.key;
            const isRenaming =
              project.kind === "folder" &&
              renamingProjectId === project.projectId;

            if (isRenaming) {
              return (
                <div
                  key={project.key}
                  className="mx-0.5 flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-2"
                >
                  <Folder
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onBlur={() => void handleSubmitRename()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleSubmitRename();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setRenamingProjectId(null);
                      }
                    }}
                    maxLength={80}
                    disabled={renamePending}
                    className="min-w-0 flex-1 bg-transparent text-[12.5px] font-medium text-foreground outline-none"
                  />
                </div>
              );
            }

            return (
              <div key={project.key} className="space-y-0.5">
                {/* Clean Full-Width Section Header (Linear / Codex Style) */}
                <div className="group flex h-7 items-center gap-1 rounded-md px-2 transition-colors duration-120 hover:bg-foreground/[0.035]">
                  <button
                    type="button"
                    onClick={() => toggleProjectCollapsed(project.key)}
                    aria-expanded={!isCollapsed}
                    className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left cursor-pointer"
                    title={
                      project.kind === "github"
                        ? `${project.repoOwner}/${project.repoName}`
                        : project.name
                    }
                  >
                    {project.kind === "github" ? (
                      <FolderGit2
                        className={`size-3.5 shrink-0 ${
                          containsActive
                            ? "text-foreground/85"
                            : "text-muted-foreground/70"
                        }`}
                        strokeWidth={1.5}
                      />
                    ) : (
                      <Folder
                        className={`size-3.5 shrink-0 ${
                          containsActive
                            ? "text-foreground/85"
                            : "text-muted-foreground/70"
                        }`}
                        strokeWidth={1.5}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-muted-foreground transition-colors duration-120 group-hover:text-foreground">
                      {project.name}
                    </span>
                    <ChevronDown
                      className={`size-3 shrink-0 text-muted-foreground/45 transition-transform duration-150 ${
                        isCollapsed ? "-rotate-90" : ""
                      }`}
                      strokeWidth={1.6}
                    />
                  </button>

                  <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground/55 group-hover:hidden">
                    {project.sessions.length}
                  </span>

                  <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex focus-within:flex">
                    {project.kind === "folder" ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            onClick={(event) => event.stopPropagation()}
                            className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground cursor-pointer"
                            aria-label={`Folder options for ${project.name}`}
                            title="Folder options"
                          >
                            <MoreHorizontal
                              className="size-3.5"
                              strokeWidth={1.6}
                            />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          sideOffset={4}
                          className="w-40"
                        >
                          <DropdownMenuItem
                            onSelect={() => {
                              setRenameValue(project.name);
                              setRenamingProjectId(project.projectId);
                            }}
                          >
                            <Pencil className="h-4 w-4" strokeWidth={1.5} />
                            <span>Rename</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => {
                              void onDeleteFolder(project.projectId);
                            }}
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                            <span>Delete folder</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                    <button
                      type="button"
                      onClick={(event) =>
                        handleNewChatInProject(event, project)
                      }
                      disabled={isCreating}
                      className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground cursor-pointer"
                      aria-label={`New chat in ${project.name}`}
                      title={`New chat in ${project.name}`}
                    >
                      {isCreating ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Plus className="size-3.5" strokeWidth={1.6} />
                      )}
                    </button>
                  </span>
                </div>

                {/* Flush Full-Width Session List — ZERO Tree Indentation */}
                {!isCollapsed ? (
                  <div className="space-y-0.5">
                    {project.sessions.length === 0 &&
                    project.kind === "folder" ? (
                      <button
                        type="button"
                        onClick={() => onStartChatInFolder(project.projectId)}
                        className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[12px] text-muted-foreground transition-colors duration-120 hover:bg-foreground/[0.045] hover:text-foreground cursor-pointer"
                      >
                        <Plus className="size-3.5 shrink-0" strokeWidth={1.5} />
                        <span className="truncate">New thread</span>
                      </button>
                    ) : (
                      project.sessions.map((sessionItem) =>
                        renderSessionRow(sessionItem),
                      )
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
