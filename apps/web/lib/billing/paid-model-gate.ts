export const PAID_MODEL_UPGRADE_MESSAGE =
  "This model requires a paid plan. Upgrade your plan to chat with paid models.";

export interface FreePlanModelGateInput {
  readonly modelAccess: "starter-only" | "all" | null | undefined;
  readonly modelId: string | null | undefined;
  readonly freePlanModelId: string | null | undefined;
  readonly freeTierAllowedModelIds: readonly string[];
}

export function getUnlockedFreeModelIds(
  freePlanModelId: string | null | undefined,
  freeTierAllowedModelIds: readonly string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of [freePlanModelId, ...freeTierAllowedModelIds]) {
    const trimmed = id?.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * Returns true when a user on a starter-only (Free) plan is targeting a paid
 * model that has not been unlocked by the admin in Platform Settings.
 *
 * Also returns true when `modelAccess === "starter-only"` and zero free models
 * are unlocked, so the composer stays locked instead of letting the user send
 * a prompt that will immediately fail server-side.
 */
export function isModelBlockedForFreePlan({
  modelAccess,
  modelId,
  freePlanModelId,
  freeTierAllowedModelIds,
}: FreePlanModelGateInput): boolean {
  if (modelAccess !== "starter-only") {
    return false;
  }

  const unlockedIds = getUnlockedFreeModelIds(
    freePlanModelId,
    freeTierAllowedModelIds,
  );
  if (unlockedIds.length === 0) {
    return true;
  }

  if (!modelId) {
    return false;
  }

  return !unlockedIds.includes(modelId);
}

/**
 * Resolves the effective model ID for the new-chat composer.
 * For Free-plan users (`starter-only`), prefers an unlocked free model over a
 * paid saved default so users with an available free model aren't stranded on
 * a locked paid default, while preserving explicit choices or falling back to
 * the catalog default when no free models are unlocked (which triggers the
 * composer lock gate).
 */
export function resolveNewChatModelId({
  modelAccess,
  selectedModelId,
  defaultModelId,
  availableModelIds,
  freePlanModelId,
  freeTierAllowedModelIds,
}: {
  readonly modelAccess: "starter-only" | "all" | null | undefined;
  readonly selectedModelId: string | null | undefined;
  readonly defaultModelId: string | null | undefined;
  readonly availableModelIds: readonly string[];
  readonly freePlanModelId: string | null | undefined;
  readonly freeTierAllowedModelIds: readonly string[];
}): string | null {
  if (selectedModelId) {
    return selectedModelId;
  }

  if (modelAccess === "starter-only") {
    const unlockedIds = getUnlockedFreeModelIds(
      freePlanModelId,
      freeTierAllowedModelIds,
    );
    if (defaultModelId && unlockedIds.includes(defaultModelId)) {
      return defaultModelId;
    }
    const availableSet = new Set(availableModelIds);
    const firstAvailableUnlocked = unlockedIds.find((id) =>
      availableSet.has(id),
    );
    if (firstAvailableUnlocked) {
      return firstAvailableUnlocked;
    }
    if (unlockedIds[0]) {
      return unlockedIds[0];
    }
  }

  return defaultModelId ?? availableModelIds[0] ?? null;
}
