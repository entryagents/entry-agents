"use client";

import { Blocks, Terminal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { UserPluginSummary } from "@/lib/db/plugins";
import { fetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";

interface PluginsResponse {
  plugins?: UserPluginSummary[];
  builtins?: UserPluginSummary[];
  custom?: UserPluginSummary[];
}

interface SkillsCatalogResponse {
  builtinSkills?: Array<{ name: string }>;
}

const EXTENSIONS_TABS = [
  {
    href: "/settings/plugins",
    label: "Plugins",
    icon: Blocks,
  },
  {
    href: "/settings/skills",
    label: "Agent skills",
    icon: Terminal,
  },
] as const;

export function ExtensionsHeader({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  const pathname = usePathname();
  const { data: pluginsData } = useSWR<PluginsResponse>(
    "/api/plugins",
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: skillsData } = useSWR<SkillsCatalogResponse>(
    "/api/skills/catalog",
    fetcher,
    { revalidateOnFocus: false },
  );
  const { preferences } = useUserPreferences();

  const allPlugins =
    pluginsData?.plugins ??
    (pluginsData?.builtins || pluginsData?.custom
      ? [...(pluginsData.builtins ?? []), ...(pluginsData.custom ?? [])]
      : null);
  const enabledPlugins = allPlugins
    ? allPlugins.filter((p) => p.enabled).length
    : null;
  const builtinSkillCount = skillsData?.builtinSkills?.length ?? null;
  const externalSkillCount = preferences?.globalSkillRefs?.length ?? 0;

  const getTabCount = (href: string): string | null => {
    if (href === "/settings/plugins" && allPlugins && enabledPlugins !== null) {
      return `${enabledPlugins}/${allPlugins.length}`;
    }
    if (href === "/settings/skills" && builtinSkillCount !== null) {
      return `${builtinSkillCount + externalSkillCount}`;
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
        aria-label="Extensions navigation"
        className="flex flex-wrap gap-2 border-b border-border/70 pb-3"
      >
        {EXTENSIONS_TABS.map((tab) => {
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
