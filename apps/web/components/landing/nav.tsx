"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserAvatarDropdown } from "@/components/user-avatar-dropdown";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { Logo } from "./logo";

export function LandingNav({
  showSignIn = false,
}: {
  readonly showSignIn?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated, loading } = useSession();

  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 20);
    handle();
    window.addEventListener("scroll", handle);
    return () => window.removeEventListener("scroll", handle);
  }, []);

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed left-0 right-0 top-0 z-50"
    >
      <div className="mx-auto max-w-[1320px]">
        <div
          className={`flex h-16 items-center justify-between border-x bg-(--l-bg) pl-6 pr-4 transition-colors duration-200 ${
            scrolled
              ? "border-x-(--l-border) shadow-[0_1px_0_0_var(--l-border)]"
              : "border-x-transparent shadow-none"
          }`}
        >
          <Logo className="h-[17px]" />

          <div className="hidden items-center gap-6 text-sm text-(--l-fg-2) md:flex">
            <Link
              href="/ai-coding-agent"
              className="transition-colors hover:text-(--l-fg) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)"
            >
              AI coding agent
            </Link>
            <Link
              href="/pricing"
              className="transition-colors hover:text-(--l-fg) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)"
            >
              Pricing
            </Link>
            <Link
              href="/model"
              className="transition-colors hover:text-(--l-fg) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)"
            >
              Model
            </Link>
          </div>

          {showSignIn && (
            <div className="flex items-center gap-2">
              {!loading && isAuthenticated ? (
                <>
                  <Button asChild size="sm" variant="ghost" className="focus-visible:ring-1 focus-visible:ring-(--l-fg)">
                    <Link href="/">Open Entry</Link>
                  </Button>
                  <UserAvatarDropdown />
                </>
              ) : (
                <Button asChild size="sm" variant="ghost" className="focus-visible:ring-1 focus-visible:ring-(--l-fg)">
                  <Link href="/login">Sign in</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
