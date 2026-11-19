"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
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
  onOpenImportGithub,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onStartChatInFolder,
  onCreateSessionForRepo,
  renderSessionRow,
}: SidebarProjectsSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<
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

  const toggleProject = (key: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? false),
    }));
  };

  const handleStartCreateFolder = () => {
    setSectionOpen(true);
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

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <button
          type="button"
          onClick={() => setSectionOpen((prev) => !prev)}
          className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-foreground cursor-pointer"
        >
          {sectionOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          )}
          <span>Projects</span>
          {projects.length > 0 ? (
            <span className="ml-0.5 rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              {projects.length}
            </span>
          ) : null}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 hover:text-foreground cursor-pointer"
              aria-label="Add project"
              title="Add project"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
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

      {sectionOpen ? (
        <div className="space-y-1.5 px-0.5">
          {isCreatingFolder ? (
            <div className="mx-1 flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
                <Folder className="h-4 w-4" strokeWidth={1.5} />
              </div>
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
                className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none"
              />
              <button
                type="button"
                onClick={() => void handleSubmitCreateFolder()}
                disabled={createFolderPending || !newFolderName.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 hover:text-foreground disabled:opacity-40 cursor-pointer"
                aria-label="Create folder"
              >
                {createFolderPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
              <button
                type="button"
                onClick={handleCancelCreateFolder}
                disabled={createFolderPending}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 hover:text-foreground cursor-pointer"
                aria-label="Cancel creating folder"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          ) : null}

          {projects.length === 0 && !isCreatingFolder ? (
            <div className="mx-1 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={handleStartCreateFolder}
                className="flex min-h-10 items-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-2 text-left text-[13px] font-medium text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border hover:bg-muted/40 hover:text-foreground cursor-pointer"
              >
                <FolderPlus className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span className="truncate">New folder</span>
              </button>
              <button
                type="button"
                onClick={onOpenImportGithub}
                className="flex min-h-10 items-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-2 text-left text-[13px] font-medium text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border hover:bg-muted/40 hover:text-foreground cursor-pointer"
              >
                <FolderGit2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span className="truncate">Import repo</span>
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {projects.map((project) => {
                const containsActive = project.sessions.some(
                  (s) => s.id === activeSessionId,
                );
                const isExpanded =
                  expandedProjects[project.key] ?? containsActive;
                const isCreating = creatingRepoKey === project.key;
                const isRenaming =
                  project.kind === "folder" &&
                  renamingProjectId === project.projectId;

                if (isRenaming) {
                  return (
                    <div
                      key={project.key}
                      className="mx-1 flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
                        <Folder className="h-4 w-4" strokeWidth={1.5} />
                      </div>
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
                        className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none"
                      />
                    </div>
                  );
                }

                return (
                  <div key={project.key} className="space-y-1">
                    <div
                      className={`group flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        containsActive ? "bg-muted/60" : "hover:bg-muted/45"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleProject(project.key)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                        title={
                          project.kind === "github"
                            ? `${project.repoOwner}/${project.repoName}`
                            : project.name
                        }
                      >
                        {isExpanded ? (
                          <ChevronDown
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            strokeWidth={1.5}
                          />
                        ) : (
                          <ChevronRight
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            strokeWidth={1.5}
                          />
                        )}
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background/70 text-foreground/80">
                          {project.kind === "github" ? (
                            <FolderGit2 className="h-4 w-4" strokeWidth={1.5} />
                          ) : (
                            <Folder className="h-4 w-4" strokeWidth={1.5} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium leading-tight text-foreground">
                            {project.name}
                          </div>
                          {project.kind === "github" ? (
                            <div className="truncate text-[11px] leading-tight text-muted-foreground/80">
                              {project.repoOwner}
                            </div>
                          ) : null}
                        </div>
                        <span className="shrink-0 rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {project.sessions.length}
                        </span>
                      </button>

                      {project.kind === "folder" ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              onClick={(event) => event.stopPropagation()}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-100 md:opacity-0 transition-[opacity,color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 focus:opacity-100 hover:bg-muted hover:text-foreground cursor-pointer"
                              aria-label={`Folder options for ${project.name}`}
                              title="Folder options"
                            >
                              <MoreHorizontal
                                className="h-4 w-4"
                                strokeWidth={1.5}
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
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-100 md:opacity-0 transition-[opacity,color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 focus:opacity-100 hover:bg-muted hover:text-foreground cursor-pointer"
                        aria-label={`New chat in ${project.name}`}
                        title={`New chat in ${project.name}`}
                      >
                        {isCreating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" strokeWidth={1.5} />
                        )}
                      </button>
                    </div>

                    {isExpanded ? (
                      <div className="ml-4 space-y-1 border-l border-border/50 pl-2.5 py-0.5">
                        {project.sessions.length === 0 &&
                        project.kind === "folder" ? (
                          <button
                            type="button"
                            onClick={() =>
                              onStartChatInFolder(project.projectId)
                            }
                            className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/40 hover:text-foreground cursor-pointer"
                          >
                            <Plus
                              className="h-3.5 w-3.5 shrink-0"
                              strokeWidth={1.5}
                            />
                            <span className="truncate">New chat in folder</span>
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
      ) : null}
    </div>
  );
}
