"use client";

import { ArrowRight, Code2, Plug, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const DISMISSED_KEY = "entry:first-run-onboarding-dismissed:v1";

interface FirstRunOnboardingProps {
  onQuickStartSandbox: () => void;
  isCreating: boolean;
}

export function FirstRunOnboarding({
  onQuickStartSandbox,
  isCreating,
}: FirstRunOnboardingProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <section
      aria-label="Getting started"
      className="mt-8 w-full max-w-2xl rounded-xl border border-border/70 bg-card/50 p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            Get started with Entry
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Launch a cloud sandbox, connect your daily tools, or adjust your
            workspace defaults
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss getting started guide"
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" strokeWidth={1.6} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          disabled={isCreating}
          onClick={onQuickStartSandbox}
          className="group flex cursor-pointer flex-col justify-between rounded-lg border border-border/70 bg-background p-4 text-left transition-colors hover:border-foreground/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div>
            <Code2
              className="size-4 text-muted-foreground transition-colors group-hover:text-foreground"
              strokeWidth={1.6}
            />
            <div className="mt-3 text-xs font-medium text-foreground">
              Start a blank sandbox
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Open an isolated Linux workspace with Node, Python, Git, and
              Sightline ready to run
            </p>
          </div>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground">
            <span>{isCreating ? "Starting…" : "Launch now"}</span>
            <ArrowRight className="size-3.5" strokeWidth={1.6} />
          </div>
        </button>

        <Link
          href="/settings/connections"
          className="group flex flex-col justify-between rounded-lg border border-border/70 bg-background p-4 text-left transition-colors hover:border-foreground/25"
        >
          <div>
            <Plug
              className="size-4 text-muted-foreground transition-colors group-hover:text-foreground"
              strokeWidth={1.6}
            />
            <div className="mt-3 text-xs font-medium text-foreground">
              Connect your apps
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Link Gmail, Tasks, Calendar, Slack, or Notion so Entry can act
              across your tools
            </p>
          </div>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground">
            <span>Open connections</span>
            <ArrowRight className="size-3.5" strokeWidth={1.6} />
          </div>
        </Link>

        <Link
          href="/settings"
          className="group flex flex-col justify-between rounded-lg border border-border/70 bg-background p-4 text-left transition-colors hover:border-foreground/25"
        >
          <div>
            <SlidersHorizontal
              className="size-4 text-muted-foreground transition-colors group-hover:text-foreground"
              strokeWidth={1.6}
            />
            <div className="mt-3 text-xs font-medium text-foreground">
              Set workspace defaults
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Pick your preferred model, tool approval mode, and context
              compaction threshold
            </p>
          </div>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground">
            <span>Open settings</span>
            <ArrowRight className="size-3.5" strokeWidth={1.6} />
          </div>
        </Link>
      </div>
    </section>
  );
}
