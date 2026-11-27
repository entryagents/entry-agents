"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SignInButton } from "@/components/auth/sign-in-button";
import { EntryMark } from "@/components/entry-mark";
import { CloudSkyBackdrop } from "@/components/landing/cloud-sky-backdrop";

interface LoginShellProps {
  readonly callbackUrl: string;
  readonly isPricingReturn: boolean;
}

export function LoginShell({ callbackUrl, isPricingReturn }: LoginShellProps) {
  return (
    <main className="landing relative flex min-h-dvh flex-col overflow-x-clip bg-(--l-bg) px-4 py-6 text-(--l-fg) sm:px-6 sm:py-8">
      <CloudSkyBackdrop variant="login" />

      <div className="relative z-10 mx-auto flex w-full max-w-[1280px] items-center">
        <Link
          href={isPricingReturn ? "/pricing" : "/"}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-(--l-border) bg-(--l-panel)/75 px-3 text-xs font-medium text-(--l-fg-2) backdrop-blur-md transition-colors duration-150 hover:text-(--l-fg)"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.5} />
          <span>{isPricingReturn ? "Pricing" : "Home"}</span>
        </Link>
      </div>

      <section className="relative z-10 my-auto flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-[380px] rounded-2xl border border-(--l-border) bg-(--l-panel)/90 p-7 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
          <div className="flex flex-col items-center text-center">
            <Link
              href="/"
              aria-label="Entry Agents home"
              className="inline-flex size-10 items-center justify-center rounded-xl border border-(--l-border) bg-(--l-surface) text-(--l-fg) transition-opacity duration-150 hover:opacity-85"
            >
              <EntryMark className="size-5" />
            </Link>

            <h1 className="mt-5 font-display text-2xl font-semibold tracking-[-0.03em] text-(--l-fg)">
              {isPricingReturn ? "Sign in to subscribe" : "Sign in to Entry"}
            </h1>
          </div>

          <div className="mt-7 grid gap-2.5">
            <SignInButton
              provider="vercel"
              callbackUrl={callbackUrl}
              className="h-11 w-full cursor-pointer justify-center rounded-[10px] bg-(--l-btn-bg) text-sm font-medium text-(--l-btn-fg) shadow-xs transition-[opacity,transform] duration-150 hover:bg-(--l-btn-bg) hover:opacity-90 active:scale-[0.985]"
            />
            <SignInButton
              provider="google"
              variant="outline"
              callbackUrl={callbackUrl}
              className="h-11 w-full cursor-pointer justify-center rounded-[10px] border-(--l-border) bg-(--l-surface) text-sm font-medium text-(--l-fg) transition-[border-color,background-color,transform] duration-150 hover:border-(--l-fg-4) hover:bg-(--l-surface-2) active:scale-[0.985]"
            />
            <SignInButton
              provider="github"
              variant="outline"
              callbackUrl={callbackUrl}
              className="h-11 w-full cursor-pointer justify-center rounded-[10px] border-(--l-border) bg-(--l-surface) text-sm font-medium text-(--l-fg) transition-[border-color,background-color,transform] duration-150 hover:border-(--l-fg-4) hover:bg-(--l-surface-2) active:scale-[0.985]"
            />
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-(--l-fg-3)">
            By continuing, you agree to the{" "}
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
          </p>
        </div>
      </section>
    </main>
  );
}
