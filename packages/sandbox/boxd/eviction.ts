export interface BoxdEvictionCandidate {
  id: string;
  name: string;
  status: string;
  createdAt?: Date | string | number | null;
}

export const EVICTABLE_BOXD_STATUSES = new Set<string>([
  "destroyed",
  "failed",
  "stopped",
]);

export const MAX_BOXD_EVICTION_ATTEMPTS = 5;

const EVICTION_STATUS_PRIORITY: Record<string, number> = {
  destroyed: 0,
  failed: 1,
  stopped: 2,
};

export function isEntryBoxdMachineName(machineName: string): boolean {
  return machineName.startsWith("entry-");
}

export function isBoxdCapacityError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes("limit reached") || message.includes("destroy an org vm")
  );
}

function getCreatedAtMs(
  value: Date | string | number | null | undefined,
): number {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string" && value.length > 0) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }
  return 0;
}

/**
 * Selects only Entry-managed machines (`entry-*`) that are already in a
 * non-live terminal/stopped state (`destroyed`, `failed`, or `stopped`),
 * excluding the target machine itself. Running, starting, pending,
 * migrating, suspended, hibernated, and non-Entry org VMs are never evicted.
 */
export function selectBoxdEvictionCandidates<T extends BoxdEvictionCandidate>(
  machines: readonly T[],
  targetMachineName: string,
): T[] {
  return machines
    .filter(
      (machine) =>
        machine.name !== targetMachineName &&
        isEntryBoxdMachineName(machine.name) &&
        EVICTABLE_BOXD_STATUSES.has(machine.status),
    )
    .toSorted((a, b) => {
      const priorityA = EVICTION_STATUS_PRIORITY[a.status] ?? 99;
      const priorityB = EVICTION_STATUS_PRIORITY[b.status] ?? 99;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return getCreatedAtMs(a.createdAt) - getCreatedAtMs(b.createdAt);
    });
}

export interface ProvisionBoxdWithEvictionParams<
  TMachine extends BoxdEvictionCandidate,
> {
  targetMachineName: string;
  createMachine: () => Promise<TMachine>;
  listMachines: () => Promise<readonly TMachine[]>;
  deleteMachine: (machineId: string) => Promise<unknown>;
  maxEvictions?: number;
}

/**
 * Attempts to create a Boxd machine, and on an org capacity error evicts
 * scoped Entry-owned dead/stopped VMs one at a time until creation succeeds
 * (up to `maxEvictions` deletions). Preserves non-capacity errors so callers
 * can handle races such as `"already taken"`.
 */
export async function provisionBoxdMachineWithEviction<
  TMachine extends BoxdEvictionCandidate,
>({
  targetMachineName,
  createMachine,
  listMachines,
  deleteMachine,
  maxEvictions = MAX_BOXD_EVICTION_ATTEMPTS,
}: ProvisionBoxdWithEvictionParams<TMachine>): Promise<TMachine> {
  try {
    return await createMachine();
  } catch (error) {
    if (!isBoxdCapacityError(error)) {
      throw error;
    }

    const allMachines = await listMachines().catch(() => []);
    const candidates = selectBoxdEvictionCandidates(
      allMachines,
      targetMachineName,
    ).slice(0, maxEvictions);

    let lastError: unknown = error;
    for (const candidate of candidates) {
      const deleted = await deleteMachine(candidate.id)
        .then(() => true)
        .catch(() => false);
      if (!deleted) {
        continue;
      }

      try {
        return await createMachine();
      } catch (retryError) {
        if (!isBoxdCapacityError(retryError)) {
          throw retryError;
        }
        lastError = retryError;
      }
    }

    throw lastError;
  }
}
