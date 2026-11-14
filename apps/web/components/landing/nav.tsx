"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { UserAvatarDropdown } from "@/components/user-avatar-dropdown";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { Logo } from "./logo";

const NAV_LINKS = [
  { href: "/ai-coding-agent", label: "AI coding agent" },
  { href: "/pricing", label: "Pricing" },
  { href: "/model", label: "Models" },
  { href: "/guide", label: "Guide" },
] as const;

export function LandingNav({
  showSignIn = true,
}: {
  readonly showSignIn?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated, loading } = useSession();

  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 16);
    handle();
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, []);

  return (
    <nav
      aria-label="Primary navigation"
      className={`fixed left-0 right-0 top-0 z-50 border-b transition-[border-color,background-color] duration-150 ${
        scrolled || mobileMenuOpen
          ? "border-(--l-border) bg-(--l-bg)/90 backdrop-blur-md"
          : "border-transparent bg-(--l-bg)/70 backdrop-blur-xs"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-[1320px] items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-10">
        <div className="flex items-center gap-8">
          <Logo className="h-[17px]" />

          <div className="hidden items-center gap-6 text-sm text-(--l-fg-2) md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors duration-150 hover:text-(--l-fg)"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!loading && isAuthenticated ? (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/sessions">Open Entry</Link>
              </Button>
              <UserAvatarDropdown />
            </>
          ) : (
            showSignIn && (
              <Link
                href="/login"
                className="inline-flex h-8 items-center rounded-lg border border-(--l-border) bg-(--l-surface) px-3 text-xs font-medium text-(--l-fg) transition-colors duration-150 hover:border-(--l-fg-4)"
              >
                Sign in
              </Link>
            )
          )}

          <button
            type="button"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-(--l-border) text-(--l-fg-2) transition-colors hover:text-(--l-fg) md:hidden"
          >
            {mobileMenuOpen ? (
              <X className="size-4" strokeWidth={1.5} />
            ) : (
              <Menu className="size-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-(--l-border) bg-(--l-bg) px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-(--l-fg-2) transition-colors hover:bg-(--l-surface-3) hover:text-(--l-fg)"
              >
                {link.label}
              </Link>
            ))}
            {!loading && !isAuthenticated && (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-1 inline-flex h-9 items-center justify-center rounded-lg bg-(--l-btn-bg) px-4 text-sm font-medium text-(--l-btn-fg)"
              >
                Sign in to Entry
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
