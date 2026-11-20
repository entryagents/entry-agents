import Link from "next/link";
import { getAdminSubscriptionOverview } from "@/lib/admin/subscriptions";
import { getBachsEnvironmentStatus } from "@/lib/billing/bachs";
import { PLAN_CATALOG, resolveProductIdForPlan } from "@/lib/billing/plans";
import { AdminStatCard } from "../admin-stat-card";

export const dynamic = "force-dynamic";

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AdminSubscriptionsPage() {
  const overview = await getAdminSubscriptionOverview();
  const bachsStatus = getBachsEnvironmentStatus();
  const plusProductId = resolveProductIdForPlan(PLAN_CATALOG.plus);
  const builderProductId = resolveProductIdForPlan(PLAN_CATALOG.entry);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs font-medium ${
                bachsStatus.mode === "live"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : bachsStatus.mode === "sandbox"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "border-border bg-muted text-muted-foreground"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  bachsStatus.mode === "live"
                    ? "bg-emerald-500"
                    : bachsStatus.mode === "sandbox"
                      ? "bg-amber-500"
                      : "bg-muted-foreground"
                }`}
              />
              {bachsStatus.mode === "live"
                ? "Bachs Live"
                : bachsStatus.mode === "sandbox"
                  ? "Bachs Sandbox"
                  : "Bachs Unconfigured"}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {bachsStatus.baseUrl}
            </span>
            {bachsStatus.keyPrefix ? (
              <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {bachsStatus.keyPrefix}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums text-muted-foreground">
            <span>
              Webhook:{" "}
              <strong className="font-medium text-foreground">
                {bachsStatus.webhookSecretConfigured ? "Active" : "Missing"}
              </strong>
            </span>
            <span>
              Plus ($3):{" "}
              <strong className="font-medium text-foreground">
                {plusProductId ?? "none"}
              </strong>
            </span>
            <span>
              Builder ($10):{" "}
              <strong className="font-medium text-foreground">
                {builderProductId ?? "none"}
              </strong>
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStatCard
          label="Estimated MRR"
          value={formatUsd(overview.estimatedMrrCents)}
        />
        <AdminStatCard
          label="Paid subscribers"
          value={overview.paidCount.toLocaleString()}
        />
        <AdminStatCard
          label="Free users"
          value={overview.freeCount.toLocaleString()}
        />
        <AdminStatCard
          label="Active sessions"
          value={`${overview.totalActiveSessions.toLocaleString()} (${overview.twoVcpuUsers} · 2 vCPU)`}
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">
              Subscriptions & usage
            </h2>
            <p className="text-xs text-muted-foreground">
              Plan tiers, billing cycles, credit balances, 24h message caps, and
              sandbox vCPU allocation
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
            {Object.entries(overview.planCounts).map(([plan, count]) => (
              <span
                key={plan}
                className="rounded border border-border/70 bg-muted/40 px-2 py-0.5"
              >
                {plan}: {count}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-4 py-2.5 font-medium">Plan</th>
                <th className="px-4 py-2.5 font-medium">Balance / Grant</th>
                <th className="px-4 py-2.5 font-medium">24h Msgs</th>
                <th className="px-4 py-2.5 font-medium">
                  Spend (5h / 7d / 30d)
                </th>
                <th className="px-4 py-2.5 font-medium">Renewal</th>
                <th className="px-4 py-2.5 font-medium">Sandbox</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {overview.subscribers.map((sub) => (
                <tr
                  key={sub.id}
                  className="hover:bg-muted/20 transition-colors duration-150"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/settings/admin/users/${sub.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {sub.username}
                    </Link>
                    {sub.email && (
                      <div className="text-[11px] text-muted-foreground">
                        {sub.email}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">
                    <span className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                      {sub.planName}
                    </span>
                    {sub.subscriptionCode && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {sub.subscriptionCode.slice(0, 14)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">
                    <div className="text-foreground">
                      {formatUsd(sub.creditBalanceCents)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      grant {formatUsd(sub.subscriptionGrantCents)}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">
                    {sub.planId === "free" ? (
                      <span
                        className={
                          sub.dailyMessages24h >= 5
                            ? "text-amber-600 dark:text-amber-400 font-medium"
                            : "text-foreground"
                        }
                      >
                        {sub.dailyMessages24h} / 5
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {sub.dailyMessages24h}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-muted-foreground">
                    {formatUsd(sub.spend5hCents)} /{" "}
                    {formatUsd(sub.spend7dCents)} /{" "}
                    {formatUsd(sub.spend30dCents)}
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-muted-foreground">
                    {formatShortDate(sub.nextRenewalAt)}
                  </td>
                  <td className="px-4 py-2.5 font-mono tabular-nums text-muted-foreground">
                    <span>{sub.sandboxVcpus} vCPU</span>
                    {sub.activeSessions > 0 && (
                      <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                        · {sub.activeSessions} active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
