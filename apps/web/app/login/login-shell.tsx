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
    <main className="landing min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg)">
      <div className="grid min-h-dvh lg:grid-cols-12">
        {/* Left: Calm, unboxed sign-in column */}
        <section className="relative flex min-h-dvh flex-col px-6 py-6 sm:px-10 lg:col-span-5 lg:px-14 lg:py-8">
          {/* Mobile subtle top cloud horizon wash */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-44 overflow-hidden lg:hidden"
          >
            <CloudSkyBackdrop variant="login" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--l-bg) 70%, transparent) 55%, var(--l-bg) 100%)",
              }}
            />
          </div>

          <div className="relative z-10 flex items-center">
            <Link
              href={isPricingReturn ? "/pricing" : "/"}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 -ml-2 text-xs font-medium text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
            >
              <ArrowLeft className="size-3.5" strokeWidth={1.5} />
              <span>{isPricingReturn ? "Pricing" : "Home"}</span>
            </Link>
          </div>

          <div className="relative z-10 mx-auto my-auto w-full max-w-[340px] py-12">
            <Link
              href="/"
              aria-label="Entry Agents home"
              className="inline-flex text-(--l-fg) transition-opacity duration-150 hover:opacity-80"
            >
              <EntryMark className="size-7" />
            </Link>

            <h1 className="mt-6 font-display text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.035em] text-(--l-fg)">
              {isPricingReturn ? "Sign in to subscribe" : "Sign in to Entry"}
            </h1>

            <div className="mt-8 grid gap-2.5">
              <SignInButton
                provider="vercel"
                callbackUrl={callbackUrl}
                className="h-11 w-full cursor-pointer justify-center rounded-[10px] bg-(--l-btn-bg) text-sm font-medium text-(--l-btn-fg) transition-[opacity,transform] duration-150 hover:bg-(--l-btn-bg) hover:opacity-90 active:scale-[0.985]"
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

            <p className="mt-6 text-xs leading-relaxed text-(--l-fg-3)">
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

        {/* Right (Desktop): Pure, uninterrupted moving cloud sky window */}
        <section
          aria-hidden="true"
          className="relative hidden p-3 lg:col-span-7 lg:flex"
        >
          <div className="relative flex-1 overflow-hidden rounded-[22px] border border-(--l-border) bg-(--l-surface)">
            <CloudSkyBackdrop variant="login" />
          </div>
        </section>
      </div>
    </main>
  );
}
