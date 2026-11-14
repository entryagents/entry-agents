"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/swr";

export type McpTransportType = "http" | "sse" | "stdio";

export interface McpCachedToolSummary {
  name: string;
  description?: string;
}

export interface McpServerSummary {
  id: string;
  name: string;
  transport: McpTransportType;
  url: string | null;
  command: string | null;
  args: string[] | null;
  hasHeaders: boolean;
  hasEnv: boolean;
  enabled: boolean;
  lastToolCount: number | null;
  cachedTools: McpCachedToolSummary[] | null;
  lastConnectionError: string | null;
  lastConnectionCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpTestResult {
  ok: boolean;
  latencyMs: number;
  tools: Array<{
    name: string;
    namespacedName: string;
    description?: string;
  }>;
  error?: string;
}

interface ListResponse {
  servers: McpServerSummary[];
}

interface SingleResponse {
  server: McpServerSummary;
}

export type CreateMcpServerInput =
  | {
      name: string;
      transport: "http" | "sse";
      url: string;
      headers?: Record<string, string>;
    }
  | {
      name: string;
      transport: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };

export interface UpdateMcpServerInput {
  name?: string;
  transport?: McpTransportType;
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

async function parseErrorOrThrow(res: Response, fallback: string) {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(data.error ?? fallback);
}

export function useMcpServers() {
  const { data, error, isLoading, mutate } = useSWR<ListResponse>(
    "/api/settings/mcp-servers",
    fetcher,
  );

  const createServer = async (
    input: CreateMcpServerInput,
  ): Promise<McpServerSummary> => {
    const res = await fetch("/api/settings/mcp-servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      await parseErrorOrThrow(res, "Failed to add MCP server");
    }
    const { server } = (await res.json()) as SingleResponse;
    await mutate();
    return server;
  };

  const updateServer = async (
    id: string,
    input: UpdateMcpServerInput,
  ): Promise<McpServerSummary> => {
    const res = await fetch(`/api/settings/mcp-servers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      await parseErrorOrThrow(res, "Failed to update MCP server");
    }
    const { server } = (await res.json()) as SingleResponse;
    await mutate();
    return server;
  };

  const deleteServer = async (id: string): Promise<void> => {
    const res = await fetch(`/api/settings/mcp-servers/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      await parseErrorOrThrow(res, "Failed to delete MCP server");
    }
    await mutate();
  };

  const testServer = async (id: string): Promise<McpTestResult> => {
    const res = await fetch(`/api/settings/mcp-servers/${id}/test`, {
      method: "POST",
    });
    if (!res.ok) {
      await parseErrorOrThrow(res, "Failed to test MCP server");
    }
    const result = (await res.json()) as McpTestResult;
    await mutate();
    return result;
  };

  return {
    servers: data?.servers ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    createServer,
    updateServer,
    deleteServer,
    testServer,
    refresh: mutate,
  };
}
