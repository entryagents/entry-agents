"use client";

import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  Loader2,
  Plus,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { SessionWithUnread } from "@/hooks/use-sessions";
import type { SidebarProjectGroup } from "@/lib/sessions/group-projects";

export interface SidebarProjectsSectionProps {
  projects: SidebarProjectGroup[];
  activeSessionId: string;
  onOpenImportGithub: () => void;
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
  onCreateSessionForRepo,
  renderSessionRow,
}: SidebarProjectsSectionProps) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<
    Record<string, boolean>
  >({});
  const [creatingRepoKey, setCreatingRepoKey] = useState<string | null>(null);

  const toggleProject = (key: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? false),
    }));
  };

  const handleNewChatInProject = async (
    event: React.MouseEvent,
    project: SidebarProjectGroup,
  ) => {
    event.stopPropagation();
    if (creatingRepoKey) return;
    setCreatingRepoKey(project.key);
    try {
      await onCreateSessionForRepo(project.repoOwner, project.repoName);
    } finally {
      setCreatingRepoKey(null);
    }
  };

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between px-2 py-1">
        <button
          type="button"
          onClick={() => setSectionOpen((prev) => !prev)}
          className="flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-foreground cursor-pointer"
        >
          {sectionOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          )}
          <span>Projects</span>
          {projects.length > 0 ? (
            <span className="ml-1 font-mono text-[10px] tabular-nums text-muted-foreground/75">
              {projects.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onOpenImportGithub}
          className="rounded p-1 text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 hover:text-foreground cursor-pointer"
          aria-label="Import project from GitHub"
          title="Import from GitHub"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {sectionOpen ? (
        projects.length === 0 ? (
          <button
            type="button"
            onClick={onOpenImportGithub}
            className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-lg border border-dashed border-border/60 px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border hover:bg-muted/40 hover:text-foreground cursor-pointer"
          >
            <FolderGit2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span className="truncate">Import a GitHub repository</span>
          </button>
        ) : (
          <div className="space-y-0.5 px-0.5">
            {projects.map((project) => {
              const containsActive = project.sessions.some(
                (s) => s.id === activeSessionId,
              );
              const isExpanded =
                expandedProjects[project.key] ?? containsActive;
              const isCreating = creatingRepoKey === project.key;

              return (
                <div key={project.key} className="space-y-0.5">
                  <div className="group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/50">
                    <button
                      type="button"
                      onClick={() => toggleProject(project.key)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left cursor-pointer"
                      title={project.key}
                    >
                      {isExpanded ? (
                        <ChevronDown
                          className="h-3 w-3 shrink-0 text-muted-foreground"
                          strokeWidth={1.5}
                        />
                      ) : (
                        <ChevronRight
                          className="h-3 w-3 shrink-0 text-muted-foreground"
                          strokeWidth={1.5}
                        />
                      )}
                      <FolderGit2
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">
                        {project.repoName}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/75">
                        {project.sessions.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) =>
                        handleNewChatInProject(event, project)
                      }
                      disabled={isCreating}
                      className="shrink-0 rounded p-0.5 text-muted-foreground opacity-100 md:opacity-0 transition-[opacity,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 focus:opacity-100 hover:bg-muted hover:text-foreground cursor-pointer"
                      aria-label={`New chat in ${project.repoName}`}
                      title={`New chat in ${project.key}`}
                    >
                      {isCreating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                      )}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="space-y-0.5 pl-3">
                      {project.sessions.map((sessionItem) =>
                        renderSessionRow(sessionItem),
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}
