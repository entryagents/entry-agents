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

  const syncAssignedSessionCache = useCallback(
    async (sessionId: string, projectId: string) => {
      await globalMutate(
        "/api/sessions",
        (
          current:
            | { sessions?: Array<{ id: string; projectId?: string | null }> }
            | undefined,
        ) => {
          if (!current?.sessions) return current;
          return {
            ...current,
            sessions: current.sessions.map((s) =>
              s.id === sessionId ? { ...s, projectId } : s,
            ),
          };
        },
        { revalidate: false },
      );
    },
    [globalMutate],
  );

  const createProject = useCallback(
    async (
      name: string,
      options?: { assignSessionId?: string | null },
    ): Promise<Project> => {
      const trimmed = name.trim();
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          ...(options?.assignSessionId
            ? { assignSessionId: options.assignSessionId }
            : {}),
        }),
      });

      const responseData = (await res.json()) as {
        project?: Project;
        error?: string;
      };

      if (!res.ok || !responseData.project) {
        const message = responseData.error ?? "Failed to create project";
        toast.error(message);
        throw new Error(message);
      }

      const created = responseData.project;
      await mutate(
        (current) => ({
          projects: [
            created,
            ...(current?.projects ?? []).filter((p) => p.id !== created.id),
          ],
        }),
        { revalidate: false },
      );

      if (options?.assignSessionId) {
        await syncAssignedSessionCache(options.assignSessionId, created.id);
      }

      return created;
    },
    [mutate, syncAssignedSessionCache],
  );

  const createRepoProject = useCallback(
    async (input: {
      repoOwner: string;
      repoName: string;
      defaultBranch?: string | null;
      assignSessionId?: string | null;
    }): Promise<Project> => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoOwner: input.repoOwner.trim(),
          repoName: input.repoName.trim(),
          ...(input.defaultBranch
            ? { defaultBranch: input.defaultBranch }
            : {}),
          ...(input.assignSessionId
            ? { assignSessionId: input.assignSessionId }
            : {}),
        }),
      });

      const responseData = (await res.json()) as {
        project?: Project;
        error?: string;
      };

      if (!res.ok || !responseData.project) {
        const message = responseData.error ?? "Failed to import repository";
        toast.error(message);
        throw new Error(message);
      }

      const created = responseData.project;
      await mutate(
        (current) => ({
          projects: [
            created,
            ...(current?.projects ?? []).filter((p) => p.id !== created.id),
          ],
        }),
        { revalidate: false },
      );

      if (input.assignSessionId) {
        await syncAssignedSessionCache(input.assignSessionId, created.id);
      }

      return created;
    },
    [mutate, syncAssignedSessionCache],
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
        const message = responseData.error ?? "Failed to rename project";
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
        const message = responseData.error ?? "Failed to delete project";
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
    createRepoProject,
    renameProject,
    deleteProject,
    refreshProjects: mutate,
  };
}
