"use client";

import {
  Check,
  ChevronDown,
  Cloud,
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

const DEFAULT_VISIBLE_PROJECT_CHATS = 7;

export interface SidebarProjectsSectionProps {
  projects: SidebarProjectGroup[];
  standaloneSessions?: SessionWithUnread[];
  activeSessionId: string;
  onOpenImportGithub: () => void;
  onCreateFolder: (
    name: string,
    assignSessionId?: string | null,
  ) => Promise<void> | void;
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
  standaloneSessions = [],
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
  // Every project starts COLLAPSED by default until the user clicks it
  const [expandedProjects, setExpandedProjects] = useState<
    Record<string, boolean>
  >({});
  const [expandedProjectLimits, setExpandedProjectLimits] = useState<
    Record<string, boolean>
  >({});
  const [creatingRepoKey, setCreatingRepoKey] = useState<string | null>(null);

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderAssignSessionId, setNewFolderAssignSessionId] = useState("");
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
    setNewFolderAssignSessionId("");
    setIsCreatingFolder(true);
  };

  const handleCancelCreateFolder = () => {
    if (createFolderPending) return;
    setIsCreatingFolder(false);
    setNewFolderName("");
    setNewFolderAssignSessionId("");
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
      await onCreateFolder(trimmed, newFolderAssignSessionId || null);
      setIsCreatingFolder(false);
      setNewFolderName("");
      setNewFolderAssignSessionId("");
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
      {/* Header matching reference: "Projects v" on left, clean FolderPlus action on right */}
      <div className="group relative mb-1 flex h-7 items-center justify-between px-1.5">
        <button
          type="button"
          onClick={() => setSectionOpen((prev) => !prev)}
          aria-expanded={sectionOpen}
          className="inline-flex h-full items-center gap-1 rounded-md px-1 text-left text-[12px] font-medium text-muted-foreground transition-colors duration-120 hover:text-foreground cursor-pointer"
        >
          <span>Projects</span>
          <ChevronDown
            className={`size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              sectionOpen ? "" : "-rotate-90"
            }`}
            strokeWidth={1.6}
          />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="grid size-6 place-items-center rounded-md text-muted-foreground/80 transition-[background-color,color] duration-120 hover:bg-foreground/[0.07] hover:text-foreground cursor-pointer"
              aria-label="Add project"
              title="New folder or import repository"
            >
              <FolderPlus className="size-3.5" strokeWidth={1.5} />
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
        <div className="space-y-0.5">
          {isCreatingFolder ? (
            <div className="mx-1 mb-1.5 space-y-1.5 rounded-lg border border-border bg-background p-2">
              <div className="flex h-6 items-center gap-2">
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
                  placeholder="Project name"
                  maxLength={80}
                  disabled={createFolderPending}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleSubmitCreateFolder()}
                  disabled={createFolderPending || !newFolderName.trim()}
                  className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors duration-120 hover:bg-muted/60 hover:text-foreground disabled:opacity-40 cursor-pointer"
                  aria-label="Create project"
                >
                  {createFolderPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" strokeWidth={1.6} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleCancelCreateFolder}
                  disabled={createFolderPending}
                  className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors duration-120 hover:bg-muted/60 hover:text-foreground cursor-pointer"
                  aria-label="Cancel creating project"
                >
                  <X className="size-3.5" strokeWidth={1.6} />
                </button>
              </div>
              {standaloneSessions.length > 0 ? (
                <select
                  value={newFolderAssignSessionId}
                  onChange={(event) =>
                    setNewFolderAssignSessionId(event.target.value)
                  }
                  disabled={createFolderPending}
                  aria-label="Include existing chat in project"
                  className="h-7 w-full rounded-md border border-border/70 bg-muted/30 px-2 text-[11.5px] text-muted-foreground outline-none focus:border-border focus:text-foreground"
                >
                  <option value="">Start empty (or pick a chat...)</option>
                  {standaloneSessions.slice(0, 20).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}

          {projects.length === 0 && !isCreatingFolder ? (
            <div className="grid grid-cols-2 gap-1.5 px-1 pt-0.5">
              <button
                type="button"
                onClick={handleStartCreateFolder}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border/70 px-2.5 text-left text-[12px] font-medium text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border hover:bg-foreground/[0.04] hover:text-foreground cursor-pointer"
              >
                <FolderPlus className="size-3.5 shrink-0" strokeWidth={1.5} />
                <span className="truncate">New folder</span>
              </button>
              <button
                type="button"
                onClick={onOpenImportGithub}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border/70 px-2.5 text-left text-[12px] font-medium text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border hover:bg-foreground/[0.04] hover:text-foreground cursor-pointer"
              >
                <FolderGit2 className="size-3.5 shrink-0" strokeWidth={1.5} />
                <span className="truncate">Import repo</span>
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {projects.map((project) => {
                const containsActive = project.sessions.some(
                  (s) => s.id === activeSessionId,
                );
                // Collapsed by default unless explicitly expanded by user click
                const isExpanded = expandedProjects[project.key] ?? false;
                const isCreating = creatingRepoKey === project.key;
                const isRenaming =
                  project.kind === "folder" &&
                  renamingProjectId === project.projectId;
                const projectLabel =
                  project.kind === "github"
                    ? `${project.repoOwner}/${project.repoName}`
                    : project.name;
                const showAllProjectSessions =
                  expandedProjectLimits[project.key] ?? false;
                const visibleSessions = showAllProjectSessions
                  ? project.sessions
                  : project.sessions.slice(0, DEFAULT_VISIBLE_PROJECT_CHATS);
                const hiddenCount =
                  project.sessions.length - visibleSessions.length;

                if (isRenaming) {
                  return (
                    <div
                      key={project.key}
                      className="mx-1 flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-2"
                    >
                      <Cloud
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
                        className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none"
                      />
                    </div>
                  );
                }

                return (
                  <div key={project.key}>
                    <div className="group relative flex h-8 items-center rounded-lg transition-colors duration-120 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-foreground/[0.045]">
                      <button
                        type="button"
                        onClick={() => toggleProject(project.key)}
                        aria-expanded={isExpanded}
                        className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left cursor-pointer"
                        title={projectLabel}
                      >
                        <Cloud
                          className={`size-4 shrink-0 transition-colors duration-120 ${
                            containsActive || isExpanded
                              ? "text-foreground/75"
                              : "text-muted-foreground/70 group-hover:text-foreground/75"
                          }`}
                          strokeWidth={1.5}
                        />
                        <span
                          className={`min-w-0 flex-1 truncate text-[13px] leading-[18px] transition-colors duration-120 ${
                            containsActive || isExpanded
                              ? "text-foreground/85"
                              : "text-muted-foreground group-hover:text-foreground/90"
                          }`}
                        >
                          {projectLabel}
                        </span>
                      </button>

                      <span className="pointer-events-none absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-gradient-to-l from-sidebar via-sidebar/95 to-transparent pl-4 opacity-0 transition-opacity duration-120 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
                        {project.kind === "folder" || project.projectId ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(event) => event.stopPropagation()}
                                className="grid size-6 place-items-center rounded-md text-muted-foreground transition-[background-color,color] duration-120 hover:bg-foreground/[0.08] hover:text-foreground cursor-pointer"
                                aria-label={`Project options for ${projectLabel}`}
                                title="Project options"
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
                              {project.kind === "folder" ? (
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setRenameValue(project.name);
                                    setRenamingProjectId(project.projectId);
                                  }}
                                >
                                  <Pencil
                                    className="h-4 w-4"
                                    strokeWidth={1.5}
                                  />
                                  <span>Rename</span>
                                </DropdownMenuItem>
                              ) : null}
                              {project.projectId ? (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => {
                                    if (project.projectId) {
                                      void onDeleteFolder(project.projectId);
                                    }
                                  }}
                                >
                                  <Trash2
                                    className="h-4 w-4"
                                    strokeWidth={1.5}
                                  />
                                  <span>Remove project</span>
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                        <button
                          type="button"
                          onClick={(event) =>
                            handleNewChatInProject(event, project)
                          }
                          disabled={isCreating}
                          className="grid size-6 place-items-center rounded-md text-muted-foreground transition-[background-color,color] duration-120 hover:bg-foreground/[0.08] hover:text-foreground cursor-pointer"
                          aria-label={`New chat in ${projectLabel}`}
                          title={`New chat in ${projectLabel}`}
                        >
                          {isCreating ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Plus className="size-3.5" strokeWidth={1.6} />
                          )}
                        </button>
                      </span>
                    </div>

                    {/* Clean indented chat list matching reference — zero vertical tree line */}
                    {isExpanded ? (
                      <div className="mt-0.5 mb-2 space-y-0.5 pl-4">
                        {project.sessions.length === 0 ? (
                          <button
                            type="button"
                            onClick={(event) =>
                              void handleNewChatInProject(event, project)
                            }
                            className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[12px] text-muted-foreground transition-colors duration-120 hover:bg-foreground/[0.05] hover:text-foreground cursor-pointer"
                          >
                            <Plus
                              className="size-3.5 shrink-0"
                              strokeWidth={1.5}
                            />
                            <span className="truncate">
                              New chat in project
                            </span>
                          </button>
                        ) : (
                          <>
                            {visibleSessions.map((sessionItem) =>
                              renderSessionRow(sessionItem),
                            )}
                            {hiddenCount > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedProjectLimits((prev) => ({
                                    ...prev,
                                    [project.key]: true,
                                  }))
                                }
                                className="flex h-7 w-full items-center rounded-lg px-2 text-left text-[12px] text-muted-foreground/80 transition-colors duration-120 hover:bg-foreground/[0.04] hover:text-foreground cursor-pointer"
                              >
                                See more ({hiddenCount})
                              </button>
                            ) : showAllProjectSessions &&
                              project.sessions.length >
                                DEFAULT_VISIBLE_PROJECT_CHATS ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedProjectLimits((prev) => ({
                                    ...prev,
                                    [project.key]: false,
                                  }))
                                }
                                className="flex h-7 w-full items-center rounded-lg px-2 text-left text-[12px] text-muted-foreground/80 transition-colors duration-120 hover:bg-foreground/[0.04] hover:text-foreground cursor-pointer"
                              >
                                Show less
                              </button>
                            ) : null}
                          </>
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
