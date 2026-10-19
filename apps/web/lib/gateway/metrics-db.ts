import postgres from "postgres";

interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg?: number;
  count: number;
}

function percentiles(samples: number[]): LatencyPercentiles {
  if (!samples || !samples.length) {
    return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, count: 0, avg: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const rank = (p: number) =>
    sorted[Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1))];
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    p50: rank(50),
    p95: rank(95),
    p99: rank(99),
    min: sorted[0],
    max: sorted[n - 1],
    count: n,
    avg: Math.round(sum / n),
  };
}

interface DbBucketRow {
  scope: string;
  name: string;
  requests: string | number;
  requests_2xx: string | number;
  requests_4xx: string | number;
  requests_5xx: string | number;
  upstream_errors: string | number;
  fallbacks: string | number;
  tokens_input: string | number;
  tokens_output: string | number;
  tokens_cache_read: string | number;
  tokens_cache_write: string | number;
  tokens_reasoning: string | number;
  estimated_spend: number;
  status_breakdown: Record<string, number>;
  lat?: number[];
  ttft?: number[];
}

function serializeBucket(row?: DbBucketRow) {
  if (!row) {
    return {
      requests: 0,
      requests2xx: 0,
      requests4xx: 0,
      requests5xx: 0,
      upstreamErrors: 0,
      fallbacks: 0,
      tokens: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        reasoning: 0,
        total: 0,
        cacheHitRate: 0,
      },
      estimatedSpend: 0,
      latency: percentiles([]),
      ttft: percentiles([]),
      statusBreakdown: {},
    };
  }

  const input = Number(row.tokens_input) || 0;
  const output = Number(row.tokens_output) || 0;
  const cacheRead = Number(row.tokens_cache_read) || 0;
  const cacheWrite = Number(row.tokens_cache_write) || 0;
  const reasoning = Number(row.tokens_reasoning) || 0;
  const denom = input + cacheRead + cacheWrite;
  const cacheHitRate = denom > 0 ? Number((cacheRead / denom).toFixed(4)) : 0;

  return {
    requests: Number(row.requests) || 0,
    requests2xx: Number(row.requests_2xx) || 0,
    requests4xx: Number(row.requests_4xx) || 0,
    requests5xx: Number(row.requests_5xx) || 0,
    upstreamErrors: Number(row.upstream_errors) || 0,
    fallbacks: Number(row.fallbacks) || 0,
    tokens: {
      input,
      output,
      cacheRead,
      cacheWrite,
      reasoning,
      total: input + cacheRead + cacheWrite + output,
      cacheHitRate,
    },
    estimatedSpend: Number(row.estimated_spend) || 0,
    latency: percentiles(row.lat || []),
    ttft: percentiles(row.ttft || []),
    statusBreakdown: row.status_breakdown || {},
  };
}

let _sql: postgres.Sql | null = null;

function getSql(): postgres.Sql | null {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) return null;
  if (!_sql) {
    _sql = postgres(url, { max: 2, idle_timeout: 10 });
  }
  return _sql;
}

export async function getMetricsSnapshotFromDb() {
  const sql = getSql();
  if (!sql) return null;

  try {
    const [bucketRows, breakerRows, dailyRows] = await Promise.all([
      sql<DbBucketRow[]>`SELECT * FROM gw_metrics_buckets`,
      sql<
        {
          provider: string;
          model: string;
          state: string;
          failures: number;
          opened_at: string | number | null;
        }[]
      >`SELECT * FROM gw_circuit_breakers`,
      sql<
        {
          day: string;
          scope: string;
          name: string;
          requests: string | number;
          requests_2xx: string | number;
          requests_4xx: string | number;
          requests_5xx: string | number;
          upstream_errors: string | number;
          fallbacks: string | number;
          tokens_input: string | number;
          tokens_output: string | number;
          tokens_cache_read: string | number;
          tokens_cache_write: string | number;
          tokens_reasoning: string | number;
          estimated_spend: number;
        }[]
      >`SELECT * FROM gw_metrics_daily ORDER BY day DESC LIMIT 50`,
    ]);

    const globalRow = bucketRows.find(
      (r) => r.scope === "global" && r.name === "_",
    );
    const global = serializeBucket(globalRow);

    const byProvider: Record<string, ReturnType<typeof serializeBucket>> = {};
    const byModel: Record<string, ReturnType<typeof serializeBucket>> = {};

    for (const r of bucketRows) {
      if (r.scope === "provider") {
        byProvider[r.name] = serializeBucket(r);
      } else if (r.scope === "model") {
        byModel[r.name] = serializeBucket(r);
      }
    }

    const circuitBreakers: Record<
      string,
      { state: string; failures: number; openedAt: number }
    > = {};
    for (const b of breakerRows) {
      circuitBreakers[b.provider] = {
        state: b.state,
        failures: b.failures,
        openedAt: b.opened_at ? Number(b.opened_at) : 0,
      };
    }

    const daily = dailyRows.map((r) => ({
      day: r.day,
      scope: r.scope,
      name: r.name,
      requests: Number(r.requests) || 0,
      requests2xx: Number(r.requests_2xx) || 0,
      requests4xx: Number(r.requests_4xx) || 0,
      requests5xx: Number(r.requests_5xx) || 0,
      upstreamErrors: Number(r.upstream_errors) || 0,
      fallbacks: Number(r.fallbacks) || 0,
      tokens: {
        input: Number(r.tokens_input) || 0,
        output: Number(r.tokens_output) || 0,
        cacheRead: Number(r.tokens_cache_read) || 0,
        cacheWrite: Number(r.tokens_cache_write) || 0,
        reasoning: Number(r.tokens_reasoning) || 0,
      },
      estimatedSpend: Number(r.estimated_spend) || 0,
    }));

    return {
      uptime: Math.floor(process.uptime()),
      activeRequests: 0,
      activeStreams: 0,
      global,
      byProvider,
      byModel,
      circuitBreakers,
      providers: Object.keys(byProvider),
      modelCount: Object.keys(byModel).length,
      providerCount: Object.keys(byProvider).length,
      daily,
      metricsBackend: "postgres",
      definitions: { upstreamTimeoutMs: "120000" },
    };
  } catch (error) {
    console.error("[gateway-metrics] DB fallback failed:", error);
    return null;
  }
}

export interface FallbackRoute {
  id: string;
  protocol: string;
  provider: string;
  priority: number;
  enabled: boolean;
  upstreamBaseURL?: string;
  upstreamModel?: string;
}

export async function getFallbackRoutes(): Promise<FallbackRoute[]> {
  const defaults: FallbackRoute[] = [
    {
      id: "step-5-preview",
      protocol: "openai",
      provider: "stepfun",
      priority: 1,
      enabled: true,
      upstreamBaseURL: "https://api.stepfun.com/v1",
      upstreamModel: "step-2-16k",
    },
    {
      id: "glm-5.3-flash",
      protocol: "openai",
      provider: "zhipu",
      priority: 1,
      enabled: true,
      upstreamBaseURL: "https://open.bigmodel.cn/api/paas/v4",
      upstreamModel: "glm-4-flash",
    },
    {
      id: "deepseek-v4.1-flash",
      protocol: "openai",
      provider: "deepseek",
      priority: 1,
      enabled: true,
      upstreamBaseURL: "https://api.deepseek.com/v1",
      upstreamModel: "deepseek-chat",
    },
  ];

  const sql = getSql();
  if (!sql) return defaults;

  try {
    const rows = await sql<{ name: string }[]>`
      SELECT DISTINCT name FROM gw_metrics_buckets WHERE scope = 'model'
    `;
    if (!rows.length) return defaults;

    const existingIds = new Set(defaults.map((d) => d.id));
    for (const r of rows) {
      if (!existingIds.has(r.name)) {
        defaults.push({
          id: r.name,
          protocol: "openai",
          provider: "gateway",
          priority: 2,
          enabled: true,
        });
      }
    }
    return defaults;
  } catch {
    return defaults;
  }
}
