import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function LandingFooter() {
  return (
    <footer>
      <div className="mx-auto max-w-[1320px] md:border-t md:border-(--l-border)">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3">
          <div className="px-6 pt-14 md:px-10 md:py-18">
            <div className="text-xs font-medium text-(--l-fg-3)">
              Entry Agents
            </div>
            <div className="mt-3 text-sm text-(--l-fg-2)">
              Autonomous agent teams for
              <br />
              shipping software.
            </div>
          </div>

          <div className="px-6 pt-14 md:px-10 md:py-18">
            <div className="text-xs font-medium text-(--l-fg-3)">
              Product
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/ai-coding-agent"
                className="text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)"
              >
                AI coding agent
              </Link>
              <Link
                href="/guide"
                className="text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)"
              >
                Beginner guide
              </Link>
              <Link
                href="/pricing"
                className="text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)"
              >
                Pricing
              </Link>
              <Link
                href="/model"
                className="text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)"
              >
                Model
              </Link>
              <Link
                href="/"
                className="text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)"
              >
                Overview
              </Link>
            </div>
          </div>

          <div className="px-6 pt-14 md:px-10 md:py-18">
            <div className="text-xs font-medium text-(--l-fg-3)">
              Integrations
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <a
                href="https://ai-sdk.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)"
              >
                AI SDK
              </a>
              <span className="text-sm text-(--l-fg-2)">
                Workspace Sandboxes
              </span>
              <span className="text-sm text-(--l-fg-2)">
                Entry Gateway
              </span>
              <a
                href="https://useworkflow.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg)"
              >
                Workflow SDK
              </a>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end px-6 pt-6 pb-6 md:pt-0 md:px-10 md:pb-10">
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
