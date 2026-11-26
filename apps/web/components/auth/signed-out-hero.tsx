"use client";

import { ArrowRight } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
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
      <div className="landing relative min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/15">
        <LandingNav showSignIn />

        <main>
          {/* Hero + Authentic Entry Workspace */}
          <section className="pt-20 pb-16 sm:pt-24 sm:pb-24 lg:pt-26">
            <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
              <div className="max-w-3xl">
                <motion.h1
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.32, ease: EASE_OUT }}
                  className="text-balance text-3xl font-semibold leading-[1.06] tracking-[-0.03em] sm:text-5xl lg:text-[3.25rem]"
                >
                  Cloud coding agents that finish the work
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, transform: "translateY(8px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.32, delay: 0.05, ease: EASE_OUT }}
                  className="mt-3.5 max-w-[54ch] text-pretty text-base leading-relaxed text-(--l-fg-2) sm:mt-4 sm:text-[17px]"
                >
                  An isolated Ubuntu VM per session, durable background runs
                  that outlive your tab, and direct GitHub and Vercel delivery —
                  starting at $3/mo.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, transform: "translateY(6px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.32, delay: 0.1, ease: EASE_OUT }}
                  className="mt-5 flex flex-wrap items-center gap-3 sm:mt-6"
                >
                  <Link
                    href="/login"
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-(--l-btn-bg) px-4 text-sm font-medium text-(--l-btn-fg) transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
                  >
                    <span>Start building</span>
                    <ArrowRight className="size-4" strokeWidth={1.5} />
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex h-10 items-center rounded-lg border border-(--l-border) bg-(--l-surface) px-4 text-sm font-medium text-(--l-fg-2) transition-[border-color,color,background-color] duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg)"
                  >
                    View pricing
                  </Link>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, transform: "translateY(12px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{ duration: 0.38, delay: 0.12, ease: EASE_OUT }}
                className="mt-8 min-w-0 sm:mt-10"
              >
                <AppMockup />
              </motion.div>
            </div>
          </section>

          <LandingFeatures />
          <ConnectedStackShowcase />
          <LandingPricingStrip />
          <LandingFaq />

          {/* Quiet closing call to action */}
          <section aria-label="Get started">
            <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
              <div className="flex flex-col items-start justify-between gap-6 border-t border-(--l-border) py-16 sm:flex-row sm:items-center sm:py-20">
                <div className="max-w-xl">
                  <h2 className="text-balance text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                    Hand off your next branch
                  </h2>
                  <p className="mt-2 text-base text-(--l-fg-2)">
                    Start free with $1 in trial credits and an isolated Linux
                    workspace in seconds.
                  </p>
                </div>
                <Link
                  href="/login"
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-(--l-btn-bg) px-5 text-sm font-medium text-(--l-btn-fg) transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
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
