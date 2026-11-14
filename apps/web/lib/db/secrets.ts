import type { RuntimeSecret, SecretCatalogEntry } from "@entry-agents/agent";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  decryptSecretValue,
  encryptSecretValue,
  maskSecretValue,
} from "@/lib/secrets/encryption";
import { db } from "./client";
import { InvalidSecretValueError } from "./secret-errors";
import { userSecrets, type UserSecretRow } from "./schema";

export interface UserSecretSummary {
  id: string;
  name: string;
  description: string | null;
  maskedHint: string;
  allowedHosts: string[];
  injectInSandbox: boolean;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

const RESERVED_SECRET_PREFIXES = [
  "BETTER_AUTH_",
  "DATABASE_",
  "GATEWAY_",
  "MODAL_TOKEN_",
  "VERCEL_APP_",
  "GITHUB_APP_",
  "AWS_SECRET_",
];

const RESERVED_SECRET_NAMES = new Set([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "PWD",
  "TERM",
  "NODE_OPTIONS",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
]);

export class InvalidSecretNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSecretNameError";
  }
}

export { InvalidSecretValueError };

export function normalizeAllowedHosts(
  rawHosts: string[] | undefined,
): string[] {
  if (!rawHosts || rawHosts.length === 0) return [];
  const unique = new Set<string>();
  for (const host of rawHosts) {
    const normalized = host.trim().toLowerCase();
    if (!normalized) continue;
    unique.add(normalized);
  }
  return [...unique];
}

function assertValidSecretName(rawName: string): string {
  const name = rawName.trim().toUpperCase();
  if (!SECRET_NAME_PATTERN.test(name)) {
    throw new InvalidSecretNameError(
      "Secret name must match ^[A-Z][A-Z0-9_]{0,63}$ (e.g. STRIPE_API_KEY)",
    );
  }
  if (
    RESERVED_SECRET_NAMES.has(name) ||
    RESERVED_SECRET_PREFIXES.some((prefix) => name.startsWith(prefix))
  ) {
    throw new InvalidSecretNameError(
      `"${name}" is a reserved system variable name`,
    );
  }
  return name;
}

function assertValidSecretValue(value: string): string {
  if (!value || value.trim().length === 0) {
    throw new InvalidSecretValueError("Secret value cannot be empty");
  }
  if (value.length > 32_768) {
    throw new InvalidSecretValueError(
      "Secret value exceeds maximum allowed length (32 KB)",
    );
  }
  return value;
}

function toSummary(row: UserSecretRow): UserSecretSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    maskedHint: row.maskedHint,
    allowedHosts: Array.isArray(row.allowedHosts) ? row.allowedHosts : [],
    injectInSandbox: row.injectInSandbox,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Lists secret metadata for Settings UI. NEVER decrypts or returns secret values. */
export async function listUserSecrets(
  userId: string,
): Promise<UserSecretSummary[]> {
  const rows = await db
    .select()
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
    .orderBy(asc(userSecrets.name));

  return rows.map(toSummary);
}

export async function createUserSecret(params: {
  userId: string;
  name: string;
  value: string;
  description?: string;
  allowedHosts?: string[];
  injectInSandbox?: boolean;
}): Promise<UserSecretSummary> {
  const name = assertValidSecretName(params.name);
  const value = assertValidSecretValue(params.value);
  const allowedHosts = normalizeAllowedHosts(params.allowedHosts);
  const description = params.description?.trim() || null;

  const [created] = await db
    .insert(userSecrets)
    .values({
      id: nanoid(),
      userId: params.userId,
      name,
      description,
      encryptedValue: encryptSecretValue(value),
      maskedHint: maskSecretValue(value),
      allowedHosts,
      injectInSandbox: params.injectInSandbox ?? true,
    })
    .returning();

  return toSummary(created);
}

export async function updateUserSecret(params: {
  userId: string;
  id: string;
  name?: string;
  value?: string;
  description?: string | null;
  allowedHosts?: string[];
  injectInSandbox?: boolean;
}): Promise<UserSecretSummary | null> {
  const name =
    params.name !== undefined ? assertValidSecretName(params.name) : undefined;
  const value =
    params.value !== undefined && params.value.length > 0
      ? assertValidSecretValue(params.value)
      : undefined;

  const [updated] = await db
    .update(userSecrets)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(value !== undefined
        ? {
            encryptedValue: encryptSecretValue(value),
            maskedHint: maskSecretValue(value),
          }
        : {}),
      ...(params.description !== undefined
        ? { description: params.description?.trim() || null }
        : {}),
      ...(params.allowedHosts !== undefined
        ? { allowedHosts: normalizeAllowedHosts(params.allowedHosts) }
        : {}),
      ...(params.injectInSandbox !== undefined
        ? { injectInSandbox: params.injectInSandbox }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(userSecrets.id, params.id), eq(userSecrets.userId, params.userId)),
    )
    .returning();

  return updated ? toSummary(updated) : null;
}

export async function deleteUserSecret(
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(userSecrets)
    .where(and(eq(userSecrets.id, id), eq(userSecrets.userId, userId)))
    .returning({ id: userSecrets.id });

  return deleted.length > 0;
}

/**
 * Server-only execution helper: decrypts user secrets for passing into
 * agent tool execution (`bash` ephemeral env / `web_fetch` / `MCP` templates).
 * Never serialize or log the returned `secrets` array.
 */
export async function getDecryptedUserSecretsForExecution(
  userId: string,
): Promise<{
  secretCatalog: SecretCatalogEntry[];
  secrets: RuntimeSecret[];
}> {
  const rows = await db
    .select()
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
    .orderBy(asc(userSecrets.name));

  const secretCatalog: SecretCatalogEntry[] = [];
  const secrets: RuntimeSecret[] = [];

  for (const row of rows) {
    const allowedHosts = Array.isArray(row.allowedHosts)
      ? row.allowedHosts
      : [];
    try {
      const value = decryptSecretValue(row.encryptedValue);
      secretCatalog.push({
        name: row.name,
        ...(row.description ? { description: row.description } : {}),
        ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
      });
      secrets.push({
        name: row.name,
        value,
        ...(row.description ? { description: row.description } : {}),
        ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
        injectInSandbox: row.injectInSandbox,
      });
    } catch (error) {
      console.error(
        `[secrets] Failed to decrypt user secret ${row.name} (${row.id}):`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return { secretCatalog, secrets };
}

export async function recordUserSecretsUsed(
  userId: string,
  names: readonly string[],
): Promise<void> {
  const uniqueNames = [...new Set(names.filter(Boolean))];
  if (uniqueNames.length === 0) return;

  await db
    .update(userSecrets)
    .set({
      usageCount: sql`${userSecrets.usageCount} + 1`,
      lastUsedAt: new Date(),
    })
    .where(
      and(
        eq(userSecrets.userId, userId),
        inArray(userSecrets.name, uniqueNames),
      ),
    );
}
