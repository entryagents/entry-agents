import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "./client";
import {
  type ComposioAccountType,
  type ComposioConnectedAccountRow,
  type ComposioConnectedAccountStatus,
  type ComposioOAuthAttemptRow,
  type ComposioSharedAccountGrantRow,
  composioConnectedAccounts,
  composioOAuthAttempts,
  composioSessions,
  composioSharedAccountGrants,
} from "./schema";

/**
 * Looks up the Composio session ID Entry previously minted for this
 * user, if any.
 */
export async function getComposioSessionId(
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ sessionId: composioSessions.sessionId })
    .from(composioSessions)
    .where(eq(composioSessions.userId, userId));

  return row?.sessionId ?? null;
}

/**
 * Upserts the Composio session ID for a user.
 */
export async function setComposioSessionId(
  userId: string,
  sessionId: string,
): Promise<void> {
  await db
    .insert(composioSessions)
    .values({ userId, sessionId })
    .onConflictDoUpdate({
      target: composioSessions.userId,
      set: { sessionId, updatedAt: new Date() },
    });
}

/**
 * Deletes the stored Composio session ID when a session becomes stale.
 */
export async function deleteComposioSessionId(userId: string): Promise<void> {
  await db.delete(composioSessions).where(eq(composioSessions.userId, userId));
}

export interface UpsertComposioConnectedAccountInput {
  userId: string;
  composioUserId?: string;
  connectedAccountId: string;
  toolkitSlug: string;
  authConfigId?: string | null;
  alias?: string | null;
  accountType?: ComposioAccountType;
  status: ComposioConnectedAccountStatus;
  isDefault?: boolean;
  isDisabled?: boolean;
  lastError?: string | null;
  lastVerifiedAt?: Date | null;
}

export async function upsertComposioConnectedAccount(
  input: UpsertComposioConnectedAccountInput,
): Promise<ComposioConnectedAccountRow> {
  const now = new Date();
  const normalizedSlug = input.toolkitSlug.toLowerCase();
  const [existing] = await db
    .select()
    .from(composioConnectedAccounts)
    .where(
      eq(
        composioConnectedAccounts.connectedAccountId,
        input.connectedAccountId,
      ),
    );

  if (existing && existing.userId !== input.userId) {
    throw new Error(
      "Connected account belongs to a different Entry user; cross-user update rejected.",
    );
  }

  // If setting as default or if no default exists for this user + toolkit when ACTIVE
  let isDefault = input.isDefault ?? existing?.isDefault ?? false;
  if (input.status === "ACTIVE" && !existing) {
    const userToolkitRows = await db
      .select({ id: composioConnectedAccounts.id })
      .from(composioConnectedAccounts)
      .where(
        and(
          eq(composioConnectedAccounts.userId, input.userId),
          eq(composioConnectedAccounts.toolkitSlug, normalizedSlug),
          eq(composioConnectedAccounts.status, "ACTIVE"),
        ),
      );
    if (userToolkitRows.length === 0) {
      isDefault = true;
    }
  }

  if (isDefault) {
    await db
      .update(composioConnectedAccounts)
      .set({ isDefault: false, updatedAt: now })
      .where(
        and(
          eq(composioConnectedAccounts.userId, input.userId),
          eq(composioConnectedAccounts.toolkitSlug, normalizedSlug),
        ),
      );
  }

  const id = existing?.id ?? `cca_${crypto.randomUUID()}`;
  const [row] = await db
    .insert(composioConnectedAccounts)
    .values({
      id,
      userId: input.userId,
      composioUserId: input.composioUserId ?? input.userId,
      connectedAccountId: input.connectedAccountId,
      toolkitSlug: normalizedSlug,
      authConfigId: input.authConfigId ?? existing?.authConfigId ?? null,
      alias: input.alias ?? existing?.alias ?? null,
      accountType: input.accountType ?? existing?.accountType ?? "PRIVATE",
      status: input.status,
      isDefault,
      isDisabled: input.isDisabled ?? existing?.isDisabled ?? false,
      lastError: input.lastError ?? null,
      lastVerifiedAt: input.lastVerifiedAt ?? existing?.lastVerifiedAt ?? now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: composioConnectedAccounts.connectedAccountId,
      set: {
        toolkitSlug: normalizedSlug,
        authConfigId: input.authConfigId ?? existing?.authConfigId ?? null,
        alias: input.alias ?? existing?.alias ?? null,
        accountType: input.accountType ?? existing?.accountType ?? "PRIVATE",
        status: input.status,
        isDefault,
        isDisabled: input.isDisabled ?? existing?.isDisabled ?? false,
        lastError: input.lastError ?? null,
        lastVerifiedAt: input.lastVerifiedAt ?? existing?.lastVerifiedAt ?? now,
        updatedAt: now,
      },
    })
    .returning();

  return row;
}

export async function listUserComposioConnectedAccounts(
  userId: string,
  toolkitSlug?: string,
): Promise<ComposioConnectedAccountRow[]> {
  const filters = [eq(composioConnectedAccounts.userId, userId)];
  if (toolkitSlug) {
    filters.push(
      eq(composioConnectedAccounts.toolkitSlug, toolkitSlug.toLowerCase()),
    );
  }
  return await db
    .select()
    .from(composioConnectedAccounts)
    .where(and(...filters))
    .orderBy(
      desc(composioConnectedAccounts.isDefault),
      desc(composioConnectedAccounts.updatedAt),
    );
}

export async function getComposioConnectedAccountById(
  connectedAccountId: string,
): Promise<ComposioConnectedAccountRow | null> {
  const [row] = await db
    .select()
    .from(composioConnectedAccounts)
    .where(
      eq(composioConnectedAccounts.connectedAccountId, connectedAccountId),
    );
  return row ?? null;
}

export async function deleteUserComposioConnectedAccount(
  userId: string,
  connectedAccountId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(composioConnectedAccounts)
    .where(
      and(
        eq(composioConnectedAccounts.userId, userId),
        eq(composioConnectedAccounts.connectedAccountId, connectedAccountId),
      ),
    )
    .returning({ id: composioConnectedAccounts.id });
  return deleted.length > 0;
}

export async function setDefaultComposioConnectedAccount(
  userId: string,
  connectedAccountId: string,
): Promise<ComposioConnectedAccountRow | null> {
  const [target] = await db
    .select()
    .from(composioConnectedAccounts)
    .where(
      and(
        eq(composioConnectedAccounts.userId, userId),
        eq(composioConnectedAccounts.connectedAccountId, connectedAccountId),
      ),
    );
  if (!target) {
    return null;
  }

  const now = new Date();
  await db
    .update(composioConnectedAccounts)
    .set({ isDefault: false, updatedAt: now })
    .where(
      and(
        eq(composioConnectedAccounts.userId, userId),
        eq(composioConnectedAccounts.toolkitSlug, target.toolkitSlug),
      ),
    );

  const [updated] = await db
    .update(composioConnectedAccounts)
    .set({ isDefault: true, updatedAt: now })
    .where(eq(composioConnectedAccounts.id, target.id))
    .returning();

  return updated ?? null;
}

export async function updateComposioConnectedAccountStatusByWebhook(
  connectedAccountId: string,
  status: ComposioConnectedAccountStatus,
  lastError?: string | null,
): Promise<ComposioConnectedAccountRow | null> {
  const now = new Date();
  const [updated] = await db
    .update(composioConnectedAccounts)
    .set({
      status,
      isDisabled: status === "INACTIVE" || status === "EXPIRED",
      lastError: lastError ?? null,
      updatedAt: now,
    })
    .where(eq(composioConnectedAccounts.connectedAccountId, connectedAccountId))
    .returning();
  return updated ?? null;
}

export interface CreateComposioOAuthAttemptInput {
  userId: string;
  stateNonce: string;
  toolkitSlug: string;
  connectedAccountId?: string | null;
  alias?: string | null;
  accountType?: ComposioAccountType;
  chatId?: string | null;
  sessionId?: string | null;
  returnPath?: string | null;
  ttlMs?: number;
}

export async function createComposioOAuthAttempt(
  input: CreateComposioOAuthAttemptInput,
): Promise<ComposioOAuthAttemptRow> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? 15 * 60 * 1000));
  const [row] = await db
    .insert(composioOAuthAttempts)
    .values({
      id: `coa_${crypto.randomUUID()}`,
      userId: input.userId,
      stateNonce: input.stateNonce,
      toolkitSlug: input.toolkitSlug.toLowerCase(),
      connectedAccountId: input.connectedAccountId ?? null,
      alias: input.alias ?? null,
      accountType: input.accountType ?? "PRIVATE",
      chatId: input.chatId ?? null,
      sessionId: input.sessionId ?? null,
      returnPath: input.returnPath ?? null,
      status: "PENDING",
      expiresAt,
      createdAt: now,
    })
    .returning();
  return row;
}

export async function getComposioOAuthAttemptByNonce(
  stateNonce: string,
): Promise<ComposioOAuthAttemptRow | null> {
  const [row] = await db
    .select()
    .from(composioOAuthAttempts)
    .where(eq(composioOAuthAttempts.stateNonce, stateNonce));
  return row ?? null;
}

export async function completeComposioOAuthAttempt(
  stateNonce: string,
  status: "COMPLETED" | "FAILED" | "EXPIRED",
  connectedAccountId?: string | null,
): Promise<ComposioOAuthAttemptRow | null> {
  const now = new Date();
  const [row] = await db
    .update(composioOAuthAttempts)
    .set({
      status,
      ...(connectedAccountId ? { connectedAccountId } : {}),
      completedAt: now,
    })
    .where(eq(composioOAuthAttempts.stateNonce, stateNonce))
    .returning();
  return row ?? null;
}

export async function grantSharedComposioAccountAccess(input: {
  ownerUserId: string;
  connectedAccountId: string;
  granteeUserId: string;
}): Promise<ComposioSharedAccountGrantRow> {
  const account = await getComposioConnectedAccountById(
    input.connectedAccountId,
  );
  if (!account || account.userId !== input.ownerUserId) {
    throw new Error("Only the connection owner can grant shared access.");
  }
  if (account.accountType !== "SHARED") {
    throw new Error(
      "Cannot grant shared access to a PRIVATE connected account.",
    );
  }

  const now = new Date();
  const [row] = await db
    .insert(composioSharedAccountGrants)
    .values({
      id: `csg_${crypto.randomUUID()}`,
      connectedAccountId: input.connectedAccountId,
      ownerUserId: input.ownerUserId,
      granteeUserId: input.granteeUserId,
      toolkitSlug: account.toolkitSlug,
      revokedAt: null,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [
        composioSharedAccountGrants.connectedAccountId,
        composioSharedAccountGrants.granteeUserId,
      ],
      set: {
        revokedAt: null,
      },
    })
    .returning();
  return row;
}

export async function revokeSharedComposioAccountAccess(input: {
  ownerUserId: string;
  connectedAccountId: string;
  granteeUserId: string;
}): Promise<boolean> {
  const updated = await db
    .update(composioSharedAccountGrants)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(composioSharedAccountGrants.ownerUserId, input.ownerUserId),
        eq(
          composioSharedAccountGrants.connectedAccountId,
          input.connectedAccountId,
        ),
        eq(composioSharedAccountGrants.granteeUserId, input.granteeUserId),
        isNull(composioSharedAccountGrants.revokedAt),
      ),
    )
    .returning({ id: composioSharedAccountGrants.id });
  return updated.length > 0;
}

export async function listAuthorizedSharedAccountsForUser(
  granteeUserId: string,
  toolkitSlug?: string,
): Promise<ComposioConnectedAccountRow[]> {
  const filters = [
    eq(composioSharedAccountGrants.granteeUserId, granteeUserId),
    isNull(composioSharedAccountGrants.revokedAt),
    eq(composioConnectedAccounts.accountType, "SHARED"),
    eq(composioConnectedAccounts.status, "ACTIVE"),
  ];
  if (toolkitSlug) {
    filters.push(
      eq(composioConnectedAccounts.toolkitSlug, toolkitSlug.toLowerCase()),
    );
  }

  const rows = await db
    .select({ account: composioConnectedAccounts })
    .from(composioSharedAccountGrants)
    .innerJoin(
      composioConnectedAccounts,
      eq(
        composioSharedAccountGrants.connectedAccountId,
        composioConnectedAccounts.connectedAccountId,
      ),
    )
    .where(and(...filters));

  return rows.map((r) => r.account);
}

export async function listActiveSharedGrantsForOwner(
  ownerUserId: string,
  connectedAccountId?: string,
): Promise<ComposioSharedAccountGrantRow[]> {
  const filters = [
    eq(composioSharedAccountGrants.ownerUserId, ownerUserId),
    isNull(composioSharedAccountGrants.revokedAt),
  ];
  if (connectedAccountId) {
    filters.push(
      eq(composioSharedAccountGrants.connectedAccountId, connectedAccountId),
    );
  }
  return await db
    .select()
    .from(composioSharedAccountGrants)
    .where(and(...filters));
}
