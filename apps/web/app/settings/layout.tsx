"use client";

import {
  Activity,
  ArrowLeft,
  Blocks,
  Cable,
  CreditCard,
  Link2,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  ShieldAlert,
  SlidersHorizontal,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { signOut } from "@/lib/auth/actions";
import { useIdleRoutePrefetch } from "@/hooks/use-idle-route-prefetch";
import { useSession } from "@/hooks/use-session";
import { AuthGuard } from "@/components/auth/auth-guard";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AccountsSectionSkeleton } from "./accounts-section";
import { McpServersSectionSkeleton } from "./mcp-servers-section";
import { PluginsSectionSkeleton } from "./plugins/plugins-section";
import { PreferencesSectionSkeleton } from "./preferences-section";
import { SecretsSectionSkeleton } from "./secrets/secrets-section";
import { SkillsSectionSkeleton } from "./skills/skills-section";

/** Skeleton shown while auth is loading for the combined profile page */
function ProfilePageSkeleton() {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <div className="w-full shrink-0 lg:w-56">
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-6">
        <Skeleton className="h-[96px] w-full rounded-md" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ConnectionsPageSkeleton() {
  return <AccountsSectionSkeleton />;
}

interface SidebarNavItem {
  id: string;
  label: string;
  href: string;
  matchPrefixes: readonly string[];
  icon: typeof User;
}

const baseSidebarItems: readonly SidebarNavItem[] = [
  {
    id: "profile",
    label: "Profile",
    href: "/settings/profile",
    matchPrefixes: ["/settings/profile"],
    icon: User,
  },
  {
    id: "billing",
    label: "Billing",
    href: "/settings/billing",
    matchPrefixes: ["/settings/billing"],
    icon: CreditCard,
  },
  {
    id: "usage",
    label: "Usage",
    href: "/settings/usage",
    matchPrefixes: ["/settings/usage"],
    icon: Activity,
  },
  {
    id: "preferences",
    label: "Preferences",
    href: "/settings/preferences",
    matchPrefixes: ["/settings/preferences"],
    icon: SettingsIcon,
  },
  {
    id: "models",
    label: "Models",
    href: "/settings/models",
    matchPrefixes: ["/settings/models"],
    icon: SlidersHorizontal,
  },
  {
    id: "accounts",
    label: "Accounts",
    href: "/settings/accounts",
    matchPrefixes: ["/settings/accounts"],
    icon: Link2,
  },
  {
    id: "integrations",
    label: "Integrations",
    href: "/settings/connections",
    matchPrefixes: [
      "/settings/connections",
      "/settings/mcp-servers",
      "/settings/secrets",
    ],
    icon: Cable,
  },
  {
    id: "extensions",
    label: "Extensions",
    href: "/settings/plugins",
    matchPrefixes: ["/settings/plugins", "/settings/skills"],
    icon: Blocks,
  },
];

const adminSidebarItem: SidebarNavItem = {
  id: "admin",
  label: "Admin",
  href: "/settings/admin",
  matchPrefixes: ["/settings/admin"],
  icon: ShieldAlert,
};

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function resolvePageTitle(
  pathname: string,
  activeItem?: SidebarNavItem,
): string {
  if (matchesPrefix(pathname, ["/settings/accounts"])) {
    return "Connected accounts";
  }
  if (matchesPrefix(pathname, ["/settings/mcp-servers"])) {
    return "Custom MCP tools";
  }
  if (matchesPrefix(pathname, ["/settings/secrets"])) {
    return "API keys";
  }
  if (matchesPrefix(pathname, ["/settings/skills"])) {
    return "Agent skills";
  }
  if (matchesPrefix(pathname, ["/settings/plugins"])) {
    return "Plugins";
  }
  return activeItem?.label ?? "Settings";
}

function SettingsLayout({
  children,
  pathname,
  isAdmin,
  shouldPrefetch = false,
}: {
  children: React.ReactNode;
  pathname: string;
  isAdmin: boolean;
  shouldPrefetch?: boolean;
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const sidebarItems = useMemo(
    () =>
      isAdmin ? [...baseSidebarItems, adminSidebarItem] : baseSidebarItems,
    [isAdmin],
  );
  const prefetchHrefs = useMemo(
    () => [
      ...sidebarItems.map((item) => item.href),
      "/settings/mcp-servers",
      "/settings/secrets",
      "/settings/skills",
      "/chats",
    ],
    [sidebarItems],
  );
  useIdleRoutePrefetch(prefetchHrefs, {
    enabled: shouldPrefetch,
    delayMs: 100,
  });

  const isAdminRoute = pathname.startsWith("/settings/admin");

  const navItems = (
    <ul className="space-y-0.5">
      {sidebarItems.map((item) => {
        const isActive = matchesPrefix(pathname, item.matchPrefixes);
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              prefetch={true}
              onClick={() => setMobileSidebarOpen(false)}
              className={cn(
                "flex h-8 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-medium transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex h-dvh bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-border md:flex lg:w-64">
        <div className="flex h-full w-full flex-col overflow-y-auto">
          <div className="flex items-center gap-4 px-5 py-4">
            <Link
              href="/chats"
              prefetch={true}
              className="flex h-8 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 hover:text-foreground"
            >
              <ArrowLeft className="size-4 shrink-0" strokeWidth={1.5} />
              <span>Back</span>
            </Link>
          </div>
          <nav aria-label="Settings navigation" className="flex-1 px-3 py-1">
            <div className="mb-2 px-3 text-xs font-medium text-muted-foreground">
              Settings
            </div>
            {navItems}
          </nav>
          <div className="border-t border-border px-3 py-3">
            <button
              type="button"
              onClick={signOut}
              className="flex h-8 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 hover:text-foreground active:scale-[0.98]"
            >
              <LogOut className="size-4 shrink-0" strokeWidth={1.5} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="flex w-64 flex-col p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Settings navigation</SheetTitle>
          </SheetHeader>
          <div className="flex items-center gap-4 px-5 py-4">
            <Link
              href="/chats"
              prefetch={true}
              onClick={() => setMobileSidebarOpen(false)}
              className="flex h-8 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 hover:text-foreground"
            >
              <ArrowLeft className="size-4 shrink-0" strokeWidth={1.5} />
              <span>Back</span>
            </Link>
          </div>
          <nav aria-label="Settings navigation" className="flex-1 px-3 py-1">
            <div className="mb-2 px-3 text-xs font-medium text-muted-foreground">
              Settings
            </div>
            {navItems}
          </nav>
          <div className="border-t border-border px-3 py-3">
            <button
              type="button"
              onClick={signOut}
              className="flex h-8 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 hover:text-foreground active:scale-[0.98]"
            >
              <LogOut className="size-4 shrink-0" strokeWidth={1.5} />
              <span>Sign out</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xs md:hidden">
          <button
            type="button"
            aria-label="Open settings navigation"
            onClick={() => setMobileSidebarOpen(true)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Menu className="size-4" strokeWidth={1.5} />
          </button>
          <span className="flex-1 truncate text-sm font-medium">Settings</span>
        </div>
        <div
          className={cn(
            "mx-auto w-full space-y-6 px-4 py-6 sm:px-6 md:py-8",
            isAdminRoute ? "max-w-[1440px] lg:px-8" : "max-w-5xl",
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAdmin } = useSession();
  const activeItem = baseSidebarItems.find((item) =>
    matchesPrefix(pathname, item.matchPrefixes),
  );
  const fallbackTitle = resolvePageTitle(pathname, activeItem);
  const fallbackContent = matchesPrefix(pathname, [
    "/settings/accounts",
    "/settings/connections",
  ]) ? (
    <ConnectionsPageSkeleton />
  ) : matchesPrefix(pathname, ["/settings/mcp-servers"]) ? (
    <McpServersSectionSkeleton />
  ) : matchesPrefix(pathname, ["/settings/secrets"]) ? (
    <SecretsSectionSkeleton />
  ) : matchesPrefix(pathname, ["/settings/skills"]) ? (
    <SkillsSectionSkeleton />
  ) : matchesPrefix(pathname, ["/settings/plugins"]) ? (
    <PluginsSectionSkeleton />
  ) : matchesPrefix(pathname, ["/settings/preferences", "/settings/models"]) ? (
    <PreferencesSectionSkeleton />
  ) : (
    <ProfilePageSkeleton />
  );

  return (
    <AuthGuard
      loadingFallback={
        <SettingsLayout pathname={pathname} isAdmin={false}>
          <h1 className="text-2xl font-semibold tracking-tight">
            {fallbackTitle}
          </h1>
          {fallbackContent}
        </SettingsLayout>
      }
    >
      <SettingsLayout pathname={pathname} isAdmin={isAdmin} shouldPrefetch>
        {children}
      </SettingsLayout>
    </AuthGuard>
  );
}
