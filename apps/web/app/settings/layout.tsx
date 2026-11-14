"use client";

import {
  Activity,
  ArrowLeft,
  Blocks,
  Cable,
  CreditCard,
  KeyRound,
  LogOut,
  Menu,
  Plug,
  Settings as SettingsIcon,
  ShieldAlert,
  SlidersHorizontal,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth/actions";
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

const baseSidebarItems = [
  {
    id: "profile",
    label: "Profile",
    href: "/settings/profile",
    icon: User,
  },
  {
    id: "usage",
    label: "Usage & Balance",
    href: "/settings/usage",
    icon: Activity,
  },
  {
    id: "pricing",
    label: "Pricing & Plans",
    href: "/pricing",
    icon: CreditCard,
  },
  {
    id: "preferences",
    label: "Preferences",
    href: "/settings/preferences",
    icon: SettingsIcon,
  },
  {
    id: "connections",
    label: "Connections",
    href: "/settings/connections",
    icon: Cable,
  },
  {
    id: "secrets",
    label: "API Keys & Secrets",
    href: "/settings/secrets",
    icon: KeyRound,
  },
  {
    id: "models",
    label: "Models",
    href: "/settings/models",
    icon: SlidersHorizontal,
  },
  {
    id: "mcp-servers",
    label: "MCP Servers",
    href: "/settings/mcp-servers",
    icon: Plug,
  },
  {
    id: "plugins",
    label: "Plugins",
    href: "/settings/plugins",
    icon: Blocks,
  },
];

const adminSidebarItem = {
  id: "admin",
  label: "Admin",
  href: "/settings/admin",
  icon: ShieldAlert,
};

function SettingsLayout({
  children,
  pathname,
  isAdmin,
}: {
  children: React.ReactNode;
  pathname: string;
  isAdmin: boolean;
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const sidebarItems = isAdmin
    ? [...baseSidebarItems, adminSidebarItem]
    : baseSidebarItems;
  const isAdminRoute = pathname.startsWith("/settings/admin");
  const activeItem = sidebarItems.find((item) =>
    item.href === "/settings/admin"
      ? isAdminRoute
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  const navItems = (
    <ul className="space-y-1">
      {sidebarItems.map((item) => {
        const isActive =
          item.href === "/settings/admin"
            ? isAdminRoute
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              onClick={() => setMobileSidebarOpen(false)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-4 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" strokeWidth={1.5} />
              {item.label}
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
          <div className="flex items-center gap-4 px-6 py-4">
            <Link
              href="/sessions"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4 shrink-0" strokeWidth={1.5} />
              Back
            </Link>
          </div>
          <nav className="flex-1 px-2 py-2">
            <div className="mb-2 px-4 text-xs font-medium text-muted-foreground">
              Settings
            </div>
            {navItems}
          </nav>
          <div className="border-t border-border px-2 py-3">
            <button
              type="button"
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-4 shrink-0" strokeWidth={1.5} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="flex w-64 flex-col p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Settings navigation</SheetTitle>
          </SheetHeader>
          <div className="flex items-center gap-4 px-6 py-4">
            <Link
              href="/sessions"
              onClick={() => setMobileSidebarOpen(false)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4 shrink-0" strokeWidth={1.5} />
              Back
            </Link>
          </div>
          <nav className="flex-1 px-2 py-2">
            <div className="mb-2 px-4 text-xs font-medium text-muted-foreground">
              Settings
            </div>
            {navItems}
          </nav>
          <div className="border-t border-border px-2 py-3">
            <button
              type="button"
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-4 shrink-0" strokeWidth={1.5} />
              Sign out
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
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Menu className="size-4" strokeWidth={1.5} />
          </button>
          <span className="flex-1 truncate text-sm font-medium">
            {activeItem?.label ?? "Settings"}
          </span>
          <Link
            href="/sessions"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Sessions
          </Link>
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
  const activeItem = baseSidebarItems.find((item) => item.href === pathname);
  const fallbackTitle = activeItem?.label ?? "Profile";
  const fallbackContent =
    activeItem?.id === "connections" ? (
      <ConnectionsPageSkeleton />
    ) : activeItem?.id === "preferences" ? (
      <PreferencesSectionSkeleton />
    ) : activeItem?.id === "models" ? (
      <PreferencesSectionSkeleton />
    ) : activeItem?.id === "mcp-servers" ? (
      <McpServersSectionSkeleton />
    ) : activeItem?.id === "plugins" ? (
      <PluginsSectionSkeleton />
    ) : activeItem?.id === "secrets" ? (
      <SecretsSectionSkeleton />
    ) : (
      <ProfilePageSkeleton />
    );

  return (
    <AuthGuard
      loadingFallback={
        <SettingsLayout pathname={pathname} isAdmin={false}>
          <h1 className="text-2xl font-semibold">{fallbackTitle}</h1>
          {fallbackContent}
        </SettingsLayout>
      }
    >
      <SettingsLayout pathname={pathname} isAdmin={isAdmin}>
        {children}
      </SettingsLayout>
    </AuthGuard>
  );
}
