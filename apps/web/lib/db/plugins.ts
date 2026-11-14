import {
  BUILTIN_PLUGIN_CATALOG,
  getBuiltinPluginBySlug,
  pluginManifestSchema,
  type PluginManifest,
  type PluginSlashCommand,
  type ResolvedEntryPlugin,
} from "@entry-agents/agent";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  decryptPluginConfig,
  encryptPluginConfig,
} from "@/lib/plugins/encryption";
import { db } from "./client";
import { userPlugins, type UserPluginRow } from "./schema";

const DEFAULT_ENABLED_BUILTINS = new Set([
  "verification-gate",
  "team-orchestrator",
  "context-compactor",
]);

export interface UserPluginSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  source: "builtin" | "custom";
  enabled: boolean;
  manifest: PluginManifest;
  configuredKeys: string[];
  triggerCount: number;
  lastTriggeredAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export class PluginValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginValidationError";
  }
}

export interface PluginSlashCommandEntry extends PluginSlashCommand {
  pluginSlug: string;
  pluginName: string;
}

function normalizeConfigRecord(
  raw: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const trimmedKey = k.trim();
    if (!trimmedKey || typeof v !== "string") continue;
    out[trimmedKey] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function rowToSummary(row: UserPluginRow): UserPluginSummary {
  const parsed = pluginManifestSchema.safeParse(row.manifest);
  const builtinFallback =
    row.source === "builtin" ? getBuiltinPluginBySlug(row.slug) : undefined;
  const manifest: PluginManifest = parsed.success
    ? parsed.data
    : (builtinFallback ?? {
        slug: row.slug,
        name: row.name,
        version: "1.0.0",
        description: row.description,
        category: "custom",
        source: row.source,
        hooks: [],
        slashCommands: [],
        rules: {},
        configFields: [],
      });

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    source: row.source,
    enabled: row.enabled,
    manifest,
    configuredKeys: Array.isArray(row.configKeys) ? row.configKeys : [],
    triggerCount: row.triggerCount,
    lastTriggeredAt: row.lastTriggeredAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function builtinToDefaultSummary(manifest: PluginManifest): UserPluginSummary {
  return {
    id: `builtin:${manifest.slug}`,
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description,
    category: manifest.category,
    source: "builtin",
    enabled: DEFAULT_ENABLED_BUILTINS.has(manifest.slug),
    manifest,
    configuredKeys: [],
    triggerCount: 0,
    lastTriggeredAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

export async function listUserPlugins(userId: string): Promise<{
  builtins: UserPluginSummary[];
  custom: UserPluginSummary[];
}> {
  const rows = await db
    .select()
    .from(userPlugins)
    .where(eq(userPlugins.userId, userId))
    .orderBy(asc(userPlugins.createdAt));

  const rowBySlug = new Map<string, UserPluginRow>();
  const custom: UserPluginSummary[] = [];

  for (const row of rows) {
    rowBySlug.set(row.slug, row);
    if (row.source === "custom" && !getBuiltinPluginBySlug(row.slug)) {
      custom.push(rowToSummary(row));
    }
  }

  const builtins = BUILTIN_PLUGIN_CATALOG.map((manifest) => {
    const override = rowBySlug.get(manifest.slug);
    if (!override) return builtinToDefaultSummary(manifest);
    return {
      ...rowToSummary(override),
      manifest,
      name: manifest.name,
      description: manifest.description,
      category: manifest.category,
      source: "builtin" as const,
    };
  });

  return { builtins, custom };
}

export async function upsertBuiltinPluginState(
  userId: string,
  slug: string,
  patch: {
    enabled?: boolean;
    config?: Record<string, string>;
  },
): Promise<UserPluginSummary> {
  const builtin = getBuiltinPluginBySlug(slug);
  if (!builtin) {
    throw new PluginValidationError(`Unknown built-in plugin "${slug}"`);
  }

  const existing = await db
    .select()
    .from(userPlugins)
    .where(and(eq(userPlugins.userId, userId), eq(userPlugins.slug, slug)))
    .limit(1);

  const normalizedConfig = normalizeConfigRecord(patch.config);
  const encryptedConfig =
    normalizedConfig !== undefined
      ? encryptPluginConfig(normalizedConfig)
      : (existing[0]?.encryptedConfig ?? null);
  const configKeys =
    normalizedConfig !== undefined
      ? Object.keys(normalizedConfig)
      : (existing[0]?.configKeys ?? []);
  const enabled =
    patch.enabled ??
    existing[0]?.enabled ??
    DEFAULT_ENABLED_BUILTINS.has(builtin.slug);

  if (existing[0]) {
    const [updated] = await db
      .update(userPlugins)
      .set({
        enabled,
        manifest: builtin,
        name: builtin.name,
        description: builtin.description,
        category: builtin.category,
        encryptedConfig,
        configKeys,
        updatedAt: new Date(),
      })
      .where(eq(userPlugins.id, existing[0].id))
      .returning();

    return rowToSummary(updated ?? existing[0]);
  }

  const [created] = await db
    .insert(userPlugins)
    .values({
      id: nanoid(),
      userId,
      slug: builtin.slug,
      name: builtin.name,
      description: builtin.description,
      category: builtin.category,
      source: "builtin",
      enabled,
      manifest: builtin,
      encryptedConfig,
      configKeys,
    })
    .returning();

  return created ? rowToSummary(created) : builtinToDefaultSummary(builtin);
}

export async function createCustomPlugin(
  userId: string,
  input: {
    manifest: unknown;
    enabled?: boolean;
    config?: Record<string, string>;
  },
): Promise<UserPluginSummary> {
  const parsed = pluginManifestSchema.safeParse(input.manifest);
  if (!parsed.success) {
    throw new PluginValidationError(
      parsed.error.issues[0]?.message ?? "Invalid plugin manifest",
    );
  }

  const manifest: PluginManifest = {
    ...parsed.data,
    source: "custom",
  };

  if (getBuiltinPluginBySlug(manifest.slug)) {
    throw new PluginValidationError(
      `Slug "${manifest.slug}" is reserved by a built-in plugin`,
    );
  }

  const normalizedConfig = normalizeConfigRecord(input.config);
  const encryptedConfig = encryptPluginConfig(normalizedConfig);
  const configKeys = normalizedConfig ? Object.keys(normalizedConfig) : [];

  const [created] = await db
    .insert(userPlugins)
    .values({
      id: nanoid(),
      userId,
      slug: manifest.slug,
      name: manifest.name,
      description: manifest.description,
      category: manifest.category,
      source: "custom",
      enabled: input.enabled ?? true,
      manifest,
      encryptedConfig,
      configKeys,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to insert custom plugin");
  }
  return rowToSummary(created);
}

export async function updateUserPlugin(
  userId: string,
  pluginId: string,
  patch: {
    enabled?: boolean;
    manifest?: unknown;
    config?: Record<string, string>;
  },
): Promise<UserPluginSummary | null> {
  if (pluginId.startsWith("builtin:")) {
    const slug = pluginId.slice("builtin:".length);
    return upsertBuiltinPluginState(userId, slug, {
      enabled: patch.enabled,
      config: patch.config,
    });
  }

  const rows = await db
    .select()
    .from(userPlugins)
    .where(and(eq(userPlugins.id, pluginId), eq(userPlugins.userId, userId)))
    .limit(1);

  const existing = rows[0];
  if (!existing) {
    const builtin = getBuiltinPluginBySlug(pluginId);
    if (builtin) {
      return upsertBuiltinPluginState(userId, pluginId, {
        enabled: patch.enabled,
        config: patch.config,
      });
    }
    return null;
  }

  if (existing.source === "builtin") {
    return upsertBuiltinPluginState(userId, existing.slug, {
      enabled: patch.enabled,
      config: patch.config,
    });
  }

  let nextManifest = existing.manifest;
  if (patch.manifest !== undefined) {
    const parsed = pluginManifestSchema.safeParse(patch.manifest);
    if (!parsed.success) {
      throw new PluginValidationError(
        parsed.error.issues[0]?.message ?? "Invalid plugin manifest",
      );
    }
    nextManifest = { ...parsed.data, source: "custom" };
  }

  const normalizedConfig = normalizeConfigRecord(patch.config);
  const encryptedConfig =
    normalizedConfig !== undefined
      ? encryptPluginConfig(normalizedConfig)
      : existing.encryptedConfig;
  const configKeys =
    normalizedConfig !== undefined
      ? Object.keys(normalizedConfig)
      : existing.configKeys;

  const [updated] = await db
    .update(userPlugins)
    .set({
      enabled: patch.enabled ?? existing.enabled,
      name: nextManifest.name,
      description: nextManifest.description,
      category: nextManifest.category,
      manifest: nextManifest,
      encryptedConfig,
      configKeys,
      updatedAt: new Date(),
    })
    .where(eq(userPlugins.id, existing.id))
    .returning();

  return updated ? rowToSummary(updated) : null;
}

export async function deleteCustomPlugin(
  userId: string,
  pluginId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(userPlugins)
    .where(
      and(
        eq(userPlugins.id, pluginId),
        eq(userPlugins.userId, userId),
        eq(userPlugins.source, "custom"),
      ),
    )
    .returning({ id: userPlugins.id });

  return deleted.length > 0;
}

export async function getEnabledPluginsForExecution(
  userId: string,
): Promise<ResolvedEntryPlugin[]> {
  try {
    const { builtins, custom } = await listUserPlugins(userId);
    const rows = await db
      .select()
      .from(userPlugins)
      .where(eq(userPlugins.userId, userId));

    const configBySlug = new Map<string, Record<string, string>>();
    for (const row of rows) {
      if (row.encryptedConfig) {
        try {
          const decrypted = decryptPluginConfig(row.encryptedConfig);
          if (decrypted) {
            configBySlug.set(row.slug, decrypted);
          }
        } catch (err) {
          console.warn(
            `[plugins] Failed to decrypt config for plugin "${row.slug}":`,
            err,
          );
        }
      }
    }

    const enabled: ResolvedEntryPlugin[] = [];
    for (const summary of [...builtins, ...custom]) {
      if (!summary.enabled) continue;
      enabled.push({
        id: summary.id,
        slug: summary.slug,
        name: summary.name,
        enabled: true,
        manifest: summary.manifest,
        config: configBySlug.get(summary.slug),
      });
    }
    return enabled;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("POSTGRES_URL environment variable is required")) {
      console.warn(`[plugins] Failed to load plugins for user ${userId}:`, err);
    }
    return BUILTIN_PLUGIN_CATALOG.filter((p) =>
      DEFAULT_ENABLED_BUILTINS.has(p.slug),
    ).map((manifest) => ({
      id: `builtin:${manifest.slug}`,
      slug: manifest.slug,
      name: manifest.name,
      enabled: true,
      manifest,
    }));
  }
}

export async function getEnabledPluginSlashCommands(
  userId: string,
): Promise<PluginSlashCommandEntry[]> {
  const enabledPlugins = await getEnabledPluginsForExecution(userId);
  const seen = new Set<string>();
  const commands: PluginSlashCommandEntry[] = [];

  for (const plugin of enabledPlugins) {
    for (const cmd of plugin.manifest.slashCommands) {
      if (seen.has(cmd.name)) continue;
      seen.add(cmd.name);
      commands.push({
        ...cmd,
        pluginSlug: plugin.slug,
        pluginName: plugin.name,
      });
    }
  }

  return commands;
}
