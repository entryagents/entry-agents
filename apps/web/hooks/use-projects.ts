"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import useSWR, { useSWRConfig } from "swr";
import type { Project } from "@/lib/db/schema";
import { fetcher } from "@/lib/swr";

interface ProjectsResponse {
  projects: Project[];
}

export function useProjects(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { data, error, isLoading, mutate } = useSWR<ProjectsResponse>(
    enabled ? "/api/projects" : null,
    () => fetcher<ProjectsResponse>("/api/projects"),
    {
      revalidateOnFocus: false,
    },
  );
  const { mutate: globalMutate } = useSWRConfig();

  const projects = data?.projects ?? [];

  const createProject = useCallback(
    async (name: string): Promise<Project> => {
      const trimmed = name.trim();
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      const responseData = (await res.json()) as {
        project?: Project;
        error?: string;
      };

      if (!res.ok || !responseData.project) {
        const message = responseData.error ?? "Failed to create folder";
        toast.error(message);
        throw new Error(message);
      }

      const created = responseData.project;
      await mutate(
        (current) => ({
          projects: [created, ...(current?.projects ?? [])],
        }),
        { revalidate: false },
      );

      return created;
    },
    [mutate],
  );

  const renameProject = useCallback(
    async (projectId: string, name: string): Promise<Project> => {
      const trimmed = name.trim();
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      const responseData = (await res.json()) as {
        project?: Project;
        error?: string;
      };

      if (!res.ok || !responseData.project) {
        const message = responseData.error ?? "Failed to rename folder";
        toast.error(message);
        throw new Error(message);
      }

      const updated = responseData.project;
      await mutate(
        (current) => ({
          projects: (current?.projects ?? []).map((p) =>
            p.id === projectId ? updated : p,
          ),
        }),
        { revalidate: false },
      );

      return updated;
    },
    [mutate],
  );

  const deleteProject = useCallback(
    async (projectId: string): Promise<void> => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const responseData = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        const message = responseData.error ?? "Failed to delete folder";
        toast.error(message);
        throw new Error(message);
      }

      await mutate(
        (current) => ({
          projects: (current?.projects ?? []).filter((p) => p.id !== projectId),
        }),
        { revalidate: false },
      );

      // Clear projectId on cached sessions so they immediately show as standalone chats
      await globalMutate(
        "/api/sessions",
        (
          current:
            | { sessions?: Array<{ projectId?: string | null }> }
            | undefined,
        ) => {
          if (!current?.sessions) return current;
          return {
            ...current,
            sessions: current.sessions.map((s) =>
              s.projectId === projectId ? { ...s, projectId: null } : s,
            ),
          };
        },
        { revalidate: false },
      );
    },
    [globalMutate, mutate],
  );

  return {
    projects,
    loading: isLoading,
    error,
    createProject,
    renameProject,
    deleteProject,
    refreshProjects: mutate,
  };
}
