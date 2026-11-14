"use client";

import {
  Cpu,
  Gauge,
  ShieldAlert,
  TriangleAlert,
  Users,
  MessageSquare,
  Inbox,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ADMIN_TABS = [
  {
    id: "overview",
    label: "Overview",
    href: "/settings/admin",
    icon: ShieldAlert,
  },
  {
    id: "chats",
    label: "Chats & Agents",
    href: "/settings/admin/chats",
    icon: MessageSquare,
  },
  {
    id: "feedback",
    label: "Feedback Inbox",
    href: "/settings/admin/feedback",
    icon: Inbox,
  },
  {
    id: "users",
    label: "Users",
    href: "/settings/admin/users",
    icon: Users,
  },
  {
    id: "models",
    label: "Models",
    href: "/settings/admin/models",
    icon: Cpu,
  },
  {
    id: "gateway",
    label: "Gateway",
    href: "/settings/admin/gateway",
    icon: Gauge,
  },
  {
    id: "danger",
    label: "Danger Zone",
    href: "/settings/admin/danger",
    icon: TriangleAlert,
  },
] as const;

export function AdminSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border/80 bg-muted/20 p-1">
      {ADMIN_TABS.map((tab) => {
        const isActive =
          tab.href === "/settings/admin"
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150",
              isActive
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="size-3.5" strokeWidth={1.5} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
