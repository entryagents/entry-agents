"use client";

import {
  Check,
  ChevronRight,
  Folder,
  FolderGit2,
  FolderOpen,
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
      <div className="group relative mb-0.5 flex h-[30px] items-center rounded-lg transition-colors duration-100 hover:bg-foreground/[0.035]">
        <button
          type="button"
          onClick={() => setSectionOpen((prev) => !prev)}
          aria-expanded={sectionOpen}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-left cursor-pointer"
        >
          <span className="grid w-4 shrink-0 place-items-center text-muted-foreground/60 transition-colors duration-100 group-hover:text-muted-foreground">
            <ChevronRight
              className={`size-3.5 transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                sectionOpen ? "rotate-90" : ""
              }`}
              strokeWidth={1.5}
            />
          </span>
          <span className="text-[12px] font-medium text-muted-foreground/80 transition-colors duration-100 group-hover:text-muted-foreground">
            Projects
          </span>
          {projects.length > 0 ? (
            <span className="ml-auto text-[11.5px] tabular-nums text-muted-foreground/60 transition-opacity duration-100 group-hover:opacity-0">
              {projects.length}
            </span>
          ) : null}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="absolute top-1/2 right-[3px] grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color,color] duration-100 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 hover:bg-foreground/[0.09] hover:text-foreground cursor-pointer"
              aria-label="Add project"
              title="Add project"
            >
              <Plus className="size-3.5" strokeWidth={1.5} />
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
            <div className="space-y-2">
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
                  <div key={project.key}>
                    <div className="group relative flex h-[30px] items-center rounded-lg transition-colors duration-100 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:bg-foreground/[0.035]">
                      <button
                        type="button"
                        onClick={() => toggleProject(project.key)}
                        aria-expanded={isExpanded}
                        className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-left cursor-pointer"
                        title={
                          project.kind === "github"
                            ? `${project.repoOwner}/${project.repoName}`
                            : project.name
                        }
                      >
                        <span className="grid w-4 shrink-0 place-items-center text-muted-foreground/60 transition-colors duration-100 group-hover:text-muted-foreground">
                          {project.kind === "github" ? (
                            <FolderGit2 className="size-4" strokeWidth={1.5} />
                          ) : isExpanded ? (
                            <FolderOpen className="size-4" strokeWidth={1.5} />
                          ) : (
                            <Folder className="size-4" strokeWidth={1.5} />
                          )}
                        </span>
                        <span
                          className={`truncate text-[12px] font-medium transition-colors duration-100 group-hover:text-muted-foreground ${
                            containsActive
                              ? "text-muted-foreground"
                              : "text-muted-foreground/80"
                          }`}
                        >
                          {project.name}
                        </span>
                        <span className="ml-auto shrink-0 text-[11.5px] tabular-nums text-muted-foreground/60 transition-opacity duration-100 group-hover:opacity-0">
                          {project.sessions.length}
                        </span>
                      </button>

                      <span className="absolute top-1/2 right-[3px] flex -translate-y-1/2 opacity-0 transition-opacity duration-100 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:opacity-100 focus-within:opacity-100">
                        {project.kind === "folder" ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(event) => event.stopPropagation()}
                                className="grid size-6 place-items-center rounded-md text-muted-foreground transition-[background-color,color] duration-100 hover:bg-foreground/[0.09] hover:text-foreground cursor-pointer"
                                aria-label={`Folder options for ${project.name}`}
                                title="Folder options"
                              >
                                <MoreHorizontal
                                  className="size-3.5"
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
                          className="grid size-6 place-items-center rounded-md text-muted-foreground transition-[background-color,color] duration-100 hover:bg-foreground/[0.09] hover:text-foreground cursor-pointer"
                          aria-label={`New chat in ${project.name}`}
                          title={`New chat in ${project.name}`}
                        >
                          {isCreating ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Plus className="size-3.5" strokeWidth={1.5} />
                          )}
                        </button>
                      </span>
                    </div>

                    {isExpanded ? (
                      <div className="space-y-px pt-px">
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
