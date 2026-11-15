"use client";

import { Cable, KeyRound, Plug } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { useMcpServers } from "@/hooks/use-mcp-servers";
import { useUserSecrets } from "@/hooks/use-user-secrets";
import type { IntegrationToolkitsResult } from "@/lib/integrations/registry-types";
import { fetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";

const STACK_TABS = [
  {
    href: "/settings/connections",
    label: "Apps & accounts",
    icon: Cable,
  },
  {
    href: "/settings/mcp-servers",
    label: "Custom MCP tools",
    icon: Plug,
  },
  {
    href: "/settings/secrets",
    label: "API keys",
    icon: KeyRound,
  },
] as const;

export function StackHeader({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  const pathname = usePathname();
  const { servers } = useMcpServers();
  const { secrets } = useUserSecrets();
  const { data: toolkitsData } = useSWR<IntegrationToolkitsResult>(
    "/api/integrations",
    fetcher,
  );

  const connectedAppsCount =
    toolkitsData?.connectedCount ??
    toolkitsData?.items?.filter((t) => t.connected).length ??
    null;
  const activeMcpCount = servers.filter((s) => s.enabled).length;

  const getTabCount = (href: string): string | null => {
    if (href === "/settings/connections" && connectedAppsCount !== null) {
      return `${connectedAppsCount} linked`;
    }
    if (href === "/settings/mcp-servers" && servers.length > 0) {
      return `${activeMcpCount}/${servers.length}`;
    }
    if (href === "/settings/secrets" && secrets.length > 0) {
      return `${secrets.length}`;
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>

      <nav
        aria-label="Stack and tools navigation"
        className="flex flex-wrap gap-2 border-b border-border/70 pb-3"
      >
        {STACK_TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const count = getTabCount(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
                active
                  ? "border-foreground/20 bg-foreground text-background"
                  : "border-border/70 bg-card text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <tab.icon className="size-3.5 shrink-0" strokeWidth={1.5} />
              <span>{tab.label}</span>
              {count && (
                <span
                  className={cn(
                    "font-mono text-[11px] tabular-nums",
                    active ? "text-background/80" : "text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
