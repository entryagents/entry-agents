"use client";

import { ArrowLeft, GitBranch, Server, Terminal } from "lucide-react";
import Link from "next/link";
import { SignInButton } from "@/components/auth/sign-in-button";
import { EntryMark } from "@/components/entry-mark";
import { CloudSkyBackdrop } from "@/components/landing/cloud-sky-backdrop";

interface LoginShellProps {
  readonly callbackUrl: string;
  readonly isPricingReturn: boolean;
}

const HIGHLIGHTS = [
  {
    icon: Terminal,
    title: "Isolated Ubuntu VM per workspace",
    detail: "Real filesystem, background dev servers, and live HTTPS port URLs",
  },
  {
    icon: Server,
    title: "Durable runs that outlive your tab",
    detail:
      "Close your laptop mid-turn and return to finished commits and diffs",
  },
  {
    icon: GitBranch,
    title: "Direct GitHub and Vercel delivery",
    detail: "Branches, pull requests, and live preview builds from one thread",
  },
] as const;

export function LoginShell({ callbackUrl, isPricingReturn }: LoginShellProps) {
  return (
    <main className="landing min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg)">
      <div className="grid min-h-dvh lg:grid-cols-12">
        {/* Left Atmospheric Cloud Horizon Stage (Desktop) */}
        <section
          aria-label="Entry Agents overview"
          className="relative hidden p-3 lg:col-span-7 lg:flex"
        >
          <div className="relative flex flex-1 flex-col justify-between overflow-hidden rounded-3xl border border-(--l-border) bg-(--l-surface) p-10 xl:p-12">
            <CloudSkyBackdrop variant="login" />

            {/* Top brand bar */}
            <div className="relative z-10 flex items-center justify-between gap-4">
              <Link
                href="/"
                className="inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight text-(--l-fg) transition-opacity hover:opacity-85"
              >
                <EntryMark className="size-5" />
                <span>Entry Agents</span>
              </Link>

              <span className="inline-flex items-center gap-2 rounded-full border border-(--l-border) bg-(--l-panel)/75 px-3 py-1 font-mono text-[11px] text-(--l-fg-2) backdrop-blur-md">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span>ubuntu-24.04 · ready</span>
              </span>
            </div>

            {/* Bottom editorial proof block */}
            <div className="relative z-10 max-w-xl">
              <h2 className="font-display text-balance text-3xl font-semibold leading-[1.06] tracking-[-0.035em] text-(--l-fg) xl:text-[2.5rem]">
                Cloud coding agents that finish the work
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-(--l-fg-2) sm:text-base">
                Start in a clean Ubuntu workspace or attach a GitHub repository.
                Run multiple chats in parallel across shared project sandboxes.
              </p>

              <div className="mt-8 divide-y divide-(--l-border) rounded-2xl border border-(--l-border) bg-(--l-panel)/80 backdrop-blur-md">
                {HIGHLIGHTS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="flex items-start gap-3.5 px-4 py-3.5"
                    >
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-(--l-panel-border) bg-(--l-surface) text-(--l-fg-2)">
                        <Icon className="size-3.5" strokeWidth={1.5} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-(--l-fg)">
                          {item.title}
                        </div>
                        <div className="mt-0.5 text-xs leading-relaxed text-(--l-fg-3)">
                          {item.detail}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Right Sign-in Column */}
        <section className="relative flex min-h-dvh flex-col justify-between px-5 py-6 sm:px-8 lg:col-span-5 lg:px-12 lg:py-10">
          {/* Mobile Atmospheric Cloud Strip */}
          <div className="relative mb-6 overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-surface) px-4 py-4 lg:hidden">
            <CloudSkyBackdrop variant="closing" />
            <div className="relative z-10 flex items-center justify-between gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-(--l-fg)"
              >
                <EntryMark className="size-4" />
                <span>Entry Agents</span>
              </Link>
              <Link
                href={isPricingReturn ? "/pricing" : "/"}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-(--l-fg-2) transition-colors hover:text-(--l-fg)"
              >
                <ArrowLeft className="size-3.5" strokeWidth={1.5} />
                <span>{isPricingReturn ? "Pricing" : "Home"}</span>
              </Link>
            </div>
          </div>

          {/* Desktop top return link */}
          <div className="hidden lg:flex lg:justify-end">
            <Link
              href={isPricingReturn ? "/pricing" : "/"}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-(--l-fg-2) transition-colors hover:bg-(--l-surface) hover:text-(--l-fg)"
            >
              <ArrowLeft className="size-3.5" strokeWidth={1.5} />
              <span>
                {isPricingReturn ? "Back to pricing" : "Back to home"}
              </span>
            </Link>
          </div>

          {/* Centered Auth Panel */}
          <div className="mx-auto my-auto w-full max-w-[380px] py-6">
            <div className="inline-flex size-10 items-center justify-center rounded-xl border border-(--l-border) bg-(--l-surface) text-(--l-fg)">
              <EntryMark className="size-5" />
            </div>

            <h1 className="mt-5 font-display text-2xl font-semibold tracking-[-0.03em] text-(--l-fg) sm:text-[1.75rem]">
              {isPricingReturn ? "Sign in to subscribe" : "Sign in to Entry"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-(--l-fg-2)">
              {isPricingReturn
                ? "Continue with Vercel, Google, or GitHub to complete your subscription"
                : "Continue with Vercel, Google, or GitHub to open your cloud workspaces"}
            </p>

            <div className="mt-7 grid gap-2.5">
              <SignInButton
                provider="vercel"
                callbackUrl={callbackUrl}
                className="h-11 w-full cursor-pointer justify-center rounded-xl bg-(--l-btn-bg) text-sm font-medium text-(--l-btn-fg) shadow-xs transition-[opacity,transform] duration-150 hover:bg-(--l-btn-bg) hover:opacity-90 active:scale-[0.985]"
              />
              <SignInButton
                provider="google"
                variant="outline"
                callbackUrl={callbackUrl}
                className="h-11 w-full cursor-pointer justify-center rounded-xl border-(--l-border) bg-(--l-surface) text-sm font-medium text-(--l-fg) transition-[border-color,background-color,transform] duration-150 hover:border-(--l-fg-4) hover:bg-(--l-surface-2) active:scale-[0.985]"
              />
              <SignInButton
                provider="github"
                variant="outline"
                callbackUrl={callbackUrl}
                className="h-11 w-full cursor-pointer justify-center rounded-xl border-(--l-border) bg-(--l-surface) text-sm font-medium text-(--l-fg) transition-[border-color,background-color,transform] duration-150 hover:border-(--l-fg-4) hover:bg-(--l-surface-2) active:scale-[0.985]"
              />
            </div>

            <p className="mt-6 text-xs leading-relaxed text-(--l-fg-3)">
              By continuing, you agree to our{" "}
              <Link
                href="/terms"
                className="text-(--l-fg-2) underline decoration-(--l-border) underline-offset-4 transition-colors hover:text-(--l-fg)"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-(--l-fg-2) underline decoration-(--l-border) underline-offset-4 transition-colors hover:text-(--l-fg)"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          <div className="text-center text-xs text-(--l-fg-3) lg:text-left">
            © 2026 Entry Agents
          </div>
        </section>
      </div>
    </main>
  );
}
