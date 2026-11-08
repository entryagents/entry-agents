"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { buildModelOptions, type ModelOption } from "@/lib/model-options";
import type { AvailableModel } from "@/lib/models";
import { fetcher } from "@/lib/swr";

/** Mirrors the shape returned by GET /api/models when the free-tier kill
 * switch is off for this (non-admin) user. `null` means either the gate
 * is on, or the user is an admin -- the API always sends null for admins
 * so their UI never changes. */
export interface FreeTierGateStatus {
  enabled: false;
  reason: string | null;
}

/** Mirrors CreditGateStatus from app/api/models/route.ts -- the user's
 * own account balance hit zero (free trial spent, or a paid plan's
 * balance ran out mid-cycle). Distinct from FreeTierGateStatus, which is
 * the admin-controlled capacity kill-switch, not a per-user thing. */
export interface CreditGateStatus {
  blocked: boolean;
  reason: string | null;
  kind: "free" | "paid" | null;
}

export interface UserPlanInfo {
  id: string;
  modelAccess: "luna-only" | "all";
}

interface ModelsResponse {
  models: AvailableModel[];
  freeTierGate?: FreeTierGateStatus | null;
  creditGate?: CreditGateStatus | null;
  userPlan?: UserPlanInfo | null;
  freePlanModelId?: string | null;
  freeTierAllowedModelIds?: string[];
}

interface UseModelOptionsConfig {
  initialModelOptions?: ModelOption[];
}

const EMPTY_MODELS: AvailableModel[] = [];
const EMPTY_MODEL_OPTIONS: ModelOption[] = [];
const EMPTY_FREE_ALLOWED_MODELS: string[] = [];

export function useModelOptions(config: UseModelOptionsConfig = {}) {
  const {
    data: modelsData,
    error: modelsError,
    isLoading: modelsLoading,
  } = useSWR<ModelsResponse>("/api/models", fetcher);

  const models = modelsData?.models ?? EMPTY_MODELS;
  const initialModelOptions = config.initialModelOptions ?? EMPTY_MODEL_OPTIONS;
  const hasCompleteFetchedData = modelsData !== undefined;

  const fetchedModelOptions = useMemo<ModelOption[]>(
    () => buildModelOptions(models),
    [models],
  );

  const modelOptions =
    hasCompleteFetchedData || initialModelOptions.length === 0
      ? fetchedModelOptions
      : initialModelOptions;

  return {
    modelOptions,
    models,
    freeTierGate: modelsData?.freeTierGate ?? null,
    creditGate: modelsData?.creditGate ?? null,
    userPlan: modelsData?.userPlan ?? null,
    freePlanModelId: modelsData?.freePlanModelId ?? null,
    freeTierAllowedModelIds:
      modelsData?.freeTierAllowedModelIds ?? EMPTY_FREE_ALLOWED_MODELS,
    loading:
      initialModelOptions.length === 0 &&
      !hasCompleteFetchedData &&
      modelsLoading,
    error: modelsError?.message ?? null,
  };
}
