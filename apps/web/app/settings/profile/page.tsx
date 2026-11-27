"use client";

import { useMemo } from "react";
import Image from "next/image";
import useSWR from "swr";
import { ContributionChart } from "@/components/contribution-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { fetcher } from "@/lib/swr";

interface DailyUsageRow {
  date: string;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
  toolCallCount: number;
}

interface MergedDay {
  date: string;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
  toolCallCount: number;
}

interface UsageResponse {
  usage: DailyUsageRow[];
}

function mergeDays(rows: DailyUsageRow[]): MergedDay[] {
  const map = new Map<string, MergedDay>();
  for (const r of rows) {
    const existing = map.get(r.date);
    if (existing) {
      existing.inputTokens += r.inputTokens;
      existing.outputTokens += r.outputTokens;
      existing.messageCount += r.messageCount;
      existing.toolCallCount += r.toolCallCount;
    } else {
      map.set(r.date, {
        date: r.date,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        messageCount: r.messageCount,
        toolCallCount: r.toolCallCount,
      });
    }
  }
  return [...map.values()];
}

function ProfileSidebar({
  totalPrompts,
  isUsageLoading,
}: {
  totalPrompts: number;
  isUsageLoading: boolean;
}) {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    );
  }

  if (!session?.user) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {session.user.avatar && (
          <Image
            src={session.user.avatar}
            alt={session.user.username}
            width={56}
            height={56}
            className="shrink-0 rounded-full"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight">
            {session.user.name ?? session.user.username}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            @{session.user.username}
          </p>
        </div>
      </div>

      {session.user.email && (
        <p className="truncate text-sm text-muted-foreground">
          {session.user.email}
        </p>
      )}

      <div className="rounded-lg border border-border/60 bg-muted/15 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">Total prompts</span>
          {isUsageLoading ? (
            <Skeleton className="h-4 w-12" />
          ) : (
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {totalPrompts.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { data, isLoading } = useSWR<UsageResponse>("/api/usage", fetcher);

  const { chartData, totalPrompts } = useMemo(() => {
    const rows = data?.usage ?? [];
    const total = rows.reduce((sum, r) => sum + r.messageCount, 0);
    return {
      chartData: mergeDays(rows),
      totalPrompts: total,
    };
  }, [data]);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <div className="w-full shrink-0 lg:w-60">
          <ProfileSidebar
            totalPrompts={totalPrompts}
            isUsageLoading={isLoading}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Activity
            </h2>
            <span className="text-xs text-muted-foreground">
              Last 12 months
            </span>
          </div>
          {isLoading ? (
            <Skeleton className="h-[96px] w-full rounded-md" />
          ) : (
            <ContributionChart data={chartData} />
          )}
        </div>
      </div>
    </>
  );
}
