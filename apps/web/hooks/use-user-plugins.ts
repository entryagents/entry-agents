"use client";

import useSWR from "swr";
import type { UserPluginSummary } from "@/lib/db/plugins";
import { fetcher } from "@/lib/swr";

interface PluginsApiResponse {
  builtins: UserPluginSummary[];
  custom: UserPluginSummary[];
}

export function useUserPlugins() {
  const { data, error, isLoading, mutate } = useSWR<PluginsApiResponse>(
    "/api/settings/plugins",
    fetcher,
    { revalidateOnFocus: false },
  );

  const togglePlugin = async (plugin: UserPluginSummary, enabled: boolean) => {
    const res =
      plugin.source === "builtin"
        ? await fetch("/api/settings/plugins", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "builtin",
              slug: plugin.slug,
              enabled,
            }),
          })
        : await fetch(
            `/api/settings/plugins/${encodeURIComponent(plugin.id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ enabled }),
            },
          );

    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(json.error ?? "Failed to update plugin");
    }
    await mutate();
  };

  const createCustomPlugin = async (payload: {
    manifest: unknown;
    enabled?: boolean;
    config?: Record<string, string>;
  }) => {
    const res = await fetch("/api/settings/plugins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "custom",
        ...payload,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(json.error ?? "Failed to create custom plugin");
    }
    await mutate();
  };

  const updatePluginConfig = async (
    plugin: UserPluginSummary,
    config: Record<string, string>,
  ) => {
    const res =
      plugin.source === "builtin"
        ? await fetch("/api/settings/plugins", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "builtin",
              slug: plugin.slug,
              config,
            }),
          })
        : await fetch(
            `/api/settings/plugins/${encodeURIComponent(plugin.id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ config }),
            },
          );

    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(json.error ?? "Failed to save plugin configuration");
    }
    await mutate();
  };

  const deletePlugin = async (pluginId: string) => {
    const res = await fetch(
      `/api/settings/plugins/${encodeURIComponent(pluginId)}`,
      { method: "DELETE" },
    );
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(json.error ?? "Failed to delete plugin");
    }
    await mutate();
  };

  return {
    builtins: data?.builtins ?? [],
    custom: data?.custom ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    togglePlugin,
    createCustomPlugin,
    updatePluginConfig,
    deletePlugin,
    refresh: () => mutate(),
  };
}
