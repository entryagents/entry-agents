"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/swr";

export interface UserSecretSummary {
  id: string;
  name: string;
  description: string | null;
  maskedHint: string;
  allowedHosts: string[];
  injectInSandbox: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListSecretsResponse {
  secrets: UserSecretSummary[];
}

interface SingleSecretResponse {
  secret: UserSecretSummary;
}

export interface CreateUserSecretInput {
  name: string;
  value: string;
  description?: string;
  allowedHosts?: string[];
  injectInSandbox?: boolean;
}

export interface UpdateUserSecretInput {
  name?: string;
  value?: string;
  description?: string | null;
  allowedHosts?: string[];
  injectInSandbox?: boolean;
}

async function parseErrorOrThrow(res: Response, fallback: string) {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(data.error ?? fallback);
}

export function useUserSecrets() {
  const { data, error, isLoading, mutate } = useSWR<ListSecretsResponse>(
    "/api/settings/secrets",
    fetcher,
  );

  const createSecret = async (
    input: CreateUserSecretInput,
  ): Promise<UserSecretSummary> => {
    const res = await fetch("/api/settings/secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      await parseErrorOrThrow(res, "Failed to save secret");
    }
    const { secret } = (await res.json()) as SingleSecretResponse;
    await mutate();
    return secret;
  };

  const updateSecret = async (
    id: string,
    input: UpdateUserSecretInput,
  ): Promise<UserSecretSummary> => {
    const res = await fetch(`/api/settings/secrets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      await parseErrorOrThrow(res, "Failed to update secret");
    }
    const { secret } = (await res.json()) as SingleSecretResponse;
    await mutate();
    return secret;
  };

  const deleteSecret = async (id: string): Promise<void> => {
    const res = await fetch(`/api/settings/secrets/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      await parseErrorOrThrow(res, "Failed to delete secret");
    }
    await mutate();
  };

  return {
    secrets: data?.secrets ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    createSecret,
    updateSecret,
    deleteSecret,
    refresh: mutate,
  };
}
