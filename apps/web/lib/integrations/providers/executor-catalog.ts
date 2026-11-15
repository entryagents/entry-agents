import type {
  IntegrationCatalogCategory,
  IntegrationToolkitItem,
} from "../registry-types";

const CATALOG_INDEX_URL = "https://catalog.executor.sh/index.json";
const CATALOG_ASSET_ORIGIN = "https://catalog.executor.sh";
const CACHE_TTL_MS = 10 * 60 * 1000;

interface RawCatalogAuth {
  method?: string;
  kind?: string;
}

interface RawCatalogIcon {
  src?: string;
  mimeType?: string;
}

interface RawCatalogApp {
  id?: string;
  package?: string;
  name?: string;
  description?: string;
  auth?: RawCatalogAuth[];
  category?: string;
  icons?: RawCatalogIcon[];
}

export interface ExecutorCatalogApp {
  slug: string;
  name: string;
  description: string;
  category: string;
  iconUrl?: string;
  authKind?: string;
  packageName?: string;
}

interface CatalogCacheState {
  apps: ExecutorCatalogApp[];
  categories: IntegrationCatalogCategory[];
  fetchedAt: number;
  liveLoaded: boolean;
}

const FALLBACK_CATALOG_APPS: ExecutorCatalogApp[] = [
  {
    slug: "gmail",
    name: "Gmail",
    description:
      "Read, search, send and organize Gmail messages, threads, drafts, and labels.",
    category: "email",
    authKind: "OAuth 2.0",
    packageName: "@executor.sh/gmail",
  },
  {
    slug: "github",
    name: "GitHub",
    description:
      "Repositories, pull requests, issues, commits, workflows, and code search.",
    category: "developer tools",
    authKind: "OAuth 2.0",
    packageName: "@executor.sh/github",
  },
  {
    slug: "linear",
    name: "Linear",
    description:
      "Issues, cycles, projects, roadmaps, and team engineering workflows.",
    category: "project management",
    authKind: "OAuth 2.0",
    packageName: "@executor.sh/linear",
  },
  {
    slug: "slack",
    name: "Slack",
    description:
      "Channels, threads, direct messages, reactions, and workspace files.",
    category: "communication",
    authKind: "OAuth 2.0",
    packageName: "@executor.sh/slack",
  },
  {
    slug: "notion",
    name: "Notion",
    description:
      "Pages, databases, blocks, search, and team documentation workspaces.",
    category: "documents",
    authKind: "OAuth 2.0",
    packageName: "@executor.sh/notion",
  },
  {
    slug: "google-calendar",
    name: "Google Calendar",
    description:
      "Calendars, events, attendees, free/busy checks, and scheduling.",
    category: "scheduling & booking",
    authKind: "OAuth 2.0",
    packageName: "@executor.sh/google-calendar",
  },
  {
    slug: "google-drive",
    name: "Google Drive",
    description: "Files, folders, shared drives, permissions, and revisions.",
    category: "file management & storage",
    authKind: "OAuth 2.0",
    packageName: "@executor.sh/google-drive",
  },
  {
    slug: "vercel",
    name: "Vercel",
    description:
      "Projects, deployments, environment variables, domains, and logs.",
    category: "developer tools",
    authKind: "OAuth 2.0",
    packageName: "@executor.sh/vercel",
  },
  {
    slug: "figma",
    name: "Figma",
    description: "Design files, components, comments, styles, and frames.",
    category: "images & design",
    authKind: "OAuth 2.0",
    packageName: "@executor.sh/figma",
  },
  {
    slug: "jira",
    name: "Jira",
    description: "Issues, sprints, boards, comments, and project workflows.",
    category: "project management",
    authKind: "OAuth 2.0",
    packageName: "@executor.sh/jira",
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    description: "Contacts, companies, deals, tickets, and CRM pipelines.",
    category: "crm",
    authKind: "OAuth 2.0",
    packageName: "@executor.sh/hubspot",
  },
  {
    slug: "stripe",
    name: "Stripe",
    description: "Customers, invoices, subscriptions, charges, and payouts.",
    category: "ecommerce",
    authKind: "API Key",
    packageName: "@executor.sh/stripe",
  },
];

let cachedCatalog: CatalogCacheState | null = null;
let inflightCatalogPromise: Promise<CatalogCacheState> | null = null;

function formatAuthKind(auth?: RawCatalogAuth[]): string | undefined {
  if (!Array.isArray(auth) || auth.length === 0) return undefined;
  const primary = auth[0];
  const raw = (primary?.kind ?? primary?.method ?? "").toLowerCase();
  if (raw.includes("oauth")) return "OAuth 2.0";
  if (raw.includes("apikey") || raw.includes("api_key")) return "API Key";
  if (raw.includes("secret") || raw.includes("token")) return "Token / Secret";
  if (raw === "none") return "Public";
  return primary?.kind ?? primary?.method ?? undefined;
}

function buildCategoryHistogram(
  apps: ExecutorCatalogApp[],
): IntegrationCatalogCategory[] {
  const counts = new Map<string, number>();
  for (const app of apps) {
    const key = app.category || "other";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (a.name === "other") return 1;
      if (b.name === "other") return -1;
      return b.count - a.count || a.name.localeCompare(b.name);
    });
}

function normalizeRawCatalog(rawApps: RawCatalogApp[]): CatalogCacheState {
  const apps: ExecutorCatalogApp[] = [];
  const seen = new Set<string>();

  for (const raw of rawApps) {
    const slug = typeof raw.id === "string" ? raw.id.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!slug || !name || seen.has(slug)) continue;
    seen.add(slug);

    const iconSrc = raw.icons?.[0]?.src;
    const iconUrl =
      typeof iconSrc === "string" && iconSrc.length > 0
        ? `${CATALOG_ASSET_ORIGIN}/${iconSrc.replace(/^\/+/, "")}`
        : undefined;

    apps.push({
      slug,
      name,
      description:
        typeof raw.description === "string" && raw.description.trim()
          ? raw.description.trim()
          : `Official Executor integration for ${name}`,
      category:
        typeof raw.category === "string" && raw.category.trim()
          ? raw.category.trim().toLowerCase()
          : "other",
      iconUrl,
      authKind: formatAuthKind(raw.auth),
      packageName:
        typeof raw.package === "string" ? raw.package.trim() : undefined,
    });
  }

  return {
    apps,
    categories: buildCategoryHistogram(apps),
    fetchedAt: Date.now(),
    liveLoaded: true,
  };
}

export async function getExecutorCatalog(): Promise<CatalogCacheState> {
  if (cachedCatalog && Date.now() - cachedCatalog.fetchedAt < CACHE_TTL_MS) {
    return cachedCatalog;
  }

  if (inflightCatalogPromise) {
    return inflightCatalogPromise;
  }

  inflightCatalogPromise = (async () => {
    try {
      const res = await fetch(CATALOG_INDEX_URL, {
        headers: {
          "User-Agent": "EntryAgents/1.0",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`Catalog HTTP ${res.status}`);
      }
      const data = (await res.json()) as { apps?: RawCatalogApp[] };
      if (!Array.isArray(data.apps) || data.apps.length === 0) {
        throw new Error("Catalog returned empty app list");
      }
      const normalized = normalizeRawCatalog(data.apps);
      cachedCatalog = normalized;
      return normalized;
    } catch {
      if (cachedCatalog) {
        return cachedCatalog;
      }
      return {
        apps: FALLBACK_CATALOG_APPS,
        categories: buildCategoryHistogram(FALLBACK_CATALOG_APPS),
        fetchedAt: Date.now(),
        liveLoaded: false,
      };
    } finally {
      inflightCatalogPromise = null;
    }
  })();

  return inflightCatalogPromise;
}

export function mergeCatalogAndConnectedApps(options: {
  catalog: CatalogCacheState;
  connectedSlugs: Map<string, { accountLabel?: string; description?: string }>;
  query?: string;
  category?: string;
  offset?: number;
  limit?: number;
}): {
  items: IntegrationToolkitItem[];
  totalCount: number;
  catalogCount: number;
  connectedCount: number;
  categories: IntegrationCatalogCategory[];
} {
  const { catalog, connectedSlugs, query, category } = options;
  const q = query?.trim().toLowerCase() ?? "";
  const cat = category?.trim().toLowerCase() ?? "";

  const seen = new Set<string>();
  const combined: IntegrationToolkitItem[] = [];

  for (const app of catalog.apps) {
    seen.add(app.slug.toLowerCase());
    const conn = connectedSlugs.get(app.slug.toLowerCase());
    combined.push({
      slug: app.slug,
      name: app.name,
      description: conn?.description || app.description,
      category: app.category,
      connected: Boolean(conn),
      accountLabel: conn?.accountLabel,
      iconUrl: app.iconUrl,
      authKind: app.authKind,
      packageName: app.packageName,
    });
  }

  // Include custom/org-authored Executor apps returned from MCP `skills` even if
  // they are private workspace apps not published to catalog.executor.sh.
  for (const [slug, meta] of connectedSlugs.entries()) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    combined.push({
      slug,
      name: slug,
      description: meta.description || "Custom workspace app in Executor",
      category: "custom app",
      connected: true,
      accountLabel: meta.accountLabel,
    });
  }

  combined.sort((a, b) => {
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    return 0;
  });

  const filtered = combined.filter((item) => {
    if (cat === "connected" && !item.connected) return false;
    if (cat && cat !== "all" && cat !== "connected") {
      if (item.category.toLowerCase() !== cat) return false;
    }
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.slug.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });

  const safeOffset = Math.max(0, options.offset ?? 0);
  const safeLimit = Math.min(120, Math.max(1, options.limit ?? 48));

  return {
    items: filtered.slice(safeOffset, safeOffset + safeLimit),
    totalCount: filtered.length,
    catalogCount: catalog.apps.length,
    connectedCount: connectedSlugs.size,
    categories: catalog.categories,
  };
}
