import Link from "next/link";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function LandingFooter() {
  return (
    <footer>
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
        <div className="border-t border-(--l-border) py-12 sm:py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Logo className="h-5" />
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-(--l-fg-2)">
                Cloud software engineering workspaces with live in-chat
                multi-agent coordination, real Linux containers, and durable
                execution.
              </p>
            </div>

            <div>
              <div className="text-xs font-medium text-(--l-fg)">Product</div>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href="/ai-coding-agent"
                  className="text-sm text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  AI coding agent
                </Link>
                <Link
                  href="/guide"
                  className="text-sm text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  Beginner guide
                </Link>
                <Link
                  href="/pricing"
                  className="text-sm text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  Pricing
                </Link>
                <Link
                  href="/model"
                  className="text-sm text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  Models
                </Link>
                <Link
                  href="/about"
                  className="text-sm text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  About
                </Link>
                <Link
                  href="/login"
                  className="text-sm text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  Sign in
                </Link>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-(--l-fg)">Resources</div>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href="/settings/connections"
                  className="text-sm text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  App connections
                </Link>
                <Link
                  href="/privacy"
                  className="text-sm text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  Privacy
                </Link>
                <Link
                  href="/terms"
                  className="text-sm text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  Terms
                </Link>
                <a
                  href="https://ai-sdk.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  AI SDK
                </a>
                <a
                  href="https://useworkflow.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  Workflow DevKit
                </a>
              </div>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-between border-t border-(--l-border-subtle) pt-6 text-xs text-(--l-fg-3)">
            <span>Entry Agents</span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
