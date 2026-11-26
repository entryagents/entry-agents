"use client";

import { ArrowRight } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { AppMockup } from "@/components/landing/app-mockup";
import { ConnectedStackShowcase } from "@/components/landing/connected-stack-showcase";
import { LandingFaq } from "@/components/landing/faq";
import { LandingFeatures } from "@/components/landing/features";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { LandingPricingStrip } from "@/components/landing/pricing-strip";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function SignedOutHero() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing relative min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg) selection:bg-(--l-accent)/25">
        <LandingNav showSignIn />

        <main>
          {/* Hero Stage: Bespoke Architectural Light + Real Entry Workspace */}
          <section className="relative overflow-hidden pt-24 pb-16 sm:pt-28 sm:pb-24 lg:pt-32">
            {/* Scoped architectural hero backdrop (dissolves cleanly into matte ground) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[620px] sm:h-[720px] lg:h-[780px]"
            >
              <Image
                src="/images/hero-dark.jpg"
                alt=""
                fill
                priority
                sizes="100vw"
                className="hidden object-cover object-[74%_24%] dark:block"
              />
              <Image
                src="/images/hero-light.jpg"
                alt=""
                fill
                priority
                sizes="100vw"
                className="block object-cover object-[74%_24%] dark:hidden"
              />
              {/* Subtle mobile scrim + left readability feather */}
              <div className="absolute inset-0 bg-(--l-bg)/45 md:bg-transparent" />
              <div
                className="absolute inset-0 md:w-[68%]"
                style={{
                  background:
                    "linear-gradient(to right, var(--l-bg) 0%, color-mix(in srgb, var(--l-bg) 76%, transparent) 48%, transparent 100%)",
                }}
              />
              {/* Seamless bottom dissolve into page ground */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 42%, color-mix(in srgb, var(--l-bg) 78%, transparent) 78%, var(--l-bg) 100%)",
                }}
              />
            </div>

            <div className="relative mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
              <div className="max-w-2xl">
                <motion.div
                  initial={{ opacity: 0, transform: "translateY(8px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  className="inline-flex items-center gap-2 rounded-full border border-(--l-border) bg-(--l-surface)/80 px-3 py-1 text-xs font-medium text-(--l-fg-2) backdrop-blur-sm"
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-(--l-accent)"
                  />
                  <span>Isolated Ubuntu workspaces</span>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, transform: "translateY(12px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.36, delay: 0.04, ease: EASE_OUT }}
                  className="mt-4 font-display text-balance text-[2.85rem] font-normal leading-[0.98] tracking-[-0.02em] text-(--l-fg) sm:mt-5 sm:text-[4.25rem] lg:text-[5rem]"
                >
                  Cloud coding agents that finish the work
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.36, delay: 0.09, ease: EASE_OUT }}
                  className="mt-4 max-w-[50ch] text-pretty text-base leading-relaxed text-(--l-fg-2) sm:mt-5 sm:text-[17px]"
                >
                  An isolated Ubuntu VM per session, durable background runs
                  that outlive your tab, and direct GitHub and Vercel delivery —
                  starting at $3/mo.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, transform: "translateY(8px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.36, delay: 0.14, ease: EASE_OUT }}
                  className="mt-6 flex flex-wrap items-center gap-3 sm:mt-7"
                >
                  <Link
                    href="/login"
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-(--l-btn-bg) px-5 text-sm font-medium text-(--l-btn-fg) shadow-xs transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
                  >
                    <span>Start building</span>
                    <ArrowRight className="size-4" strokeWidth={1.5} />
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex h-11 items-center rounded-xl border border-(--l-border) bg-(--l-surface)/85 px-5 text-sm font-medium text-(--l-fg) backdrop-blur-sm transition-[border-color,background-color,transform] duration-150 hover:border-(--l-fg-4) hover:bg-(--l-surface) active:scale-[0.98]"
                  >
                    View pricing
                  </Link>
                </motion.div>
              </div>

              {/* Real interactive 3-pane Entry workspace rising out of the architectural horizon */}
              <motion.div
                initial={{ opacity: 0, transform: "translateY(16px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{ duration: 0.44, delay: 0.16, ease: EASE_OUT }}
                className="mt-10 min-w-0 sm:mt-14"
              >
                <AppMockup />
                <p className="mt-3 hidden text-right text-xs text-(--l-fg-3) lg:block">
                  Click any chat in the sidebar or switch inspector tabs to
                  explore a live session
                </p>
              </motion.div>
            </div>
          </section>

          <LandingFeatures />
          <ConnectedStackShowcase />
          <LandingPricingStrip />
          <LandingFaq />

          {/* Editorial closing call to action */}
          <section aria-label="Get started">
            <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
              <div className="flex flex-col items-start justify-between gap-6 border-t border-(--l-border) py-16 sm:flex-row sm:items-end sm:py-24">
                <div className="max-w-xl">
                  <h2 className="font-display text-balance text-4xl font-normal leading-[1.04] tracking-[-0.02em] sm:text-5xl">
                    Leave the next branch with Entry
                  </h2>
                  <p className="mt-3 text-base leading-relaxed text-(--l-fg-2)">
                    Start free with $1 in trial credits and an isolated Linux
                    workspace in seconds.
                  </p>
                </div>
                <Link
                  href="/login"
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-(--l-btn-bg) px-5 text-sm font-medium text-(--l-btn-fg) transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
                >
                  <span>Start building</span>
                  <ArrowRight className="size-4" strokeWidth={1.5} />
                </Link>
              </div>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
