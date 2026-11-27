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
      <div className="landing relative min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/15">
        <LandingNav showSignIn />

        <main>
          {/* Hero Stage: Full-Horizon Cloud Sea + Asymmetric Editorial Header + Live Workspace */}
          <section className="relative overflow-hidden pt-24 pb-16 sm:pt-28 sm:pb-24 lg:pt-32">
            {/* Scoped high-altitude cloud horizon backdrop */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[660px] sm:h-[760px] lg:h-[840px]"
            >
              <Image
                src="/images/hero-cloud-dark.jpg"
                alt=""
                fill
                priority
                sizes="100vw"
                className="hidden object-cover object-[68%_24%] dark:block"
              />
              <Image
                src="/images/hero-cloud-light.jpg"
                alt=""
                fill
                priority
                sizes="100vw"
                className="block object-cover object-[68%_24%] dark:hidden"
              />
              {/* Soft readability feather preserving full cloud crest drama */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(105deg, color-mix(in srgb, var(--l-bg) 88%, transparent) 0%, color-mix(in srgb, var(--l-bg) 52%, transparent) 46%, transparent 78%)",
                }}
              />
              {/* Seamless bottom dissolve into obsidian / cloud-white ground */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, color-mix(in srgb, var(--l-bg) 35%, transparent) 0%, transparent 18%, transparent 52%, color-mix(in srgb, var(--l-bg) 82%, transparent) 84%, var(--l-bg) 100%)",
                }}
              />
            </div>

            <div className="relative mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
              {/* Asymmetric 12-column editorial hero header */}
              <div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-8">
                <div className="lg:col-span-7">
                  <motion.h1
                    initial={{ opacity: 0, transform: "translateY(12px)" }}
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    transition={{ duration: 0.36, ease: EASE_OUT }}
                    className="font-display text-balance text-4xl font-semibold leading-[0.98] tracking-[-0.04em] text-(--l-fg) sm:text-5xl lg:text-[4.25rem]"
                  >
                    Cloud coding agents
                    <br />
                    that finish the work
                  </motion.h1>
                </div>

                <motion.div
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.36, delay: 0.08, ease: EASE_OUT }}
                  className="lg:col-span-5"
                >
                  <p className="max-w-[44ch] text-pretty text-base leading-relaxed text-(--l-fg-2)">
                    An isolated Ubuntu VM per session, durable runs that outlive
                    your tab, and direct GitHub and Vercel delivery.
                  </p>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Link
                      href="/login"
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-(--l-btn-bg) px-5 text-sm font-medium text-(--l-btn-fg) shadow-xs transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
                    >
                      <span>Start building</span>
                      <ArrowRight className="size-4" strokeWidth={1.5} />
                    </Link>
                    <Link
                      href="/pricing"
                      className="inline-flex h-10 items-center rounded-xl border border-(--l-border) bg-(--l-surface)/85 px-5 text-sm font-medium text-(--l-fg) backdrop-blur-sm transition-[border-color,background-color,transform] duration-150 hover:border-(--l-fg-4) hover:bg-(--l-surface) active:scale-[0.98]"
                    >
                      View pricing
                    </Link>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums text-(--l-fg-3)">
                    <span>Claude Opus 5.5</span>
                    <span aria-hidden="true">·</span>
                    <span>GPT-5.6</span>
                    <span aria-hidden="true">·</span>
                    <span>Plans from $3/mo</span>
                  </div>
                </motion.div>
              </div>

              {/* Interactive 3-pane Entry workspace rising out of the cloud horizon */}
              <motion.div
                initial={{ opacity: 0, transform: "translateY(16px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{ duration: 0.44, delay: 0.14, ease: EASE_OUT }}
                className="mt-10 min-w-0 sm:mt-14"
              >
                <AppMockup />
              </motion.div>
            </div>
          </section>

          <LandingFeatures />
          <ConnectedStackShowcase />
          <LandingPricingStrip />
          <LandingFaq />

          {/* Bookend Cloud Horizon Closing CTA */}
          <section aria-label="Get started" className="pb-16 sm:pb-24">
            <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
              <div className="relative overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-surface)">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                >
                  <Image
                    src="/images/hero-cloud-dark.jpg"
                    alt=""
                    fill
                    sizes="(max-width: 1280px) 100vw, 1200px"
                    className="hidden object-cover object-[75%_65%] opacity-55 dark:block"
                  />
                  <Image
                    src="/images/hero-cloud-light.jpg"
                    alt=""
                    fill
                    sizes="(max-width: 1280px) 100vw, 1200px"
                    className="block object-cover object-[75%_65%] opacity-60 dark:hidden"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(95deg, var(--l-surface) 0%, color-mix(in srgb, var(--l-surface) 88%, transparent) 50%, color-mix(in srgb, var(--l-surface) 28%, transparent) 100%)",
                    }}
                  />
                </div>

                <div className="relative flex flex-col items-start justify-between gap-6 px-6 py-12 sm:px-10 sm:py-16 lg:flex-row lg:items-end">
                  <div className="max-w-xl">
                    <h2 className="font-display text-balance text-3xl font-semibold leading-[1.05] tracking-[-0.035em] text-(--l-fg) sm:text-4xl">
                      Leave the next branch with Entry
                    </h2>
                    <p className="mt-3 text-pretty text-base leading-relaxed text-(--l-fg-2)">
                      Start free with $1 in trial credits and an isolated Ubuntu
                      workspace in seconds.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href="/login"
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-(--l-btn-bg) px-5 text-sm font-medium text-(--l-btn-fg) shadow-xs transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
                    >
                      <span>Start building</span>
                      <ArrowRight className="size-4" strokeWidth={1.5} />
                    </Link>
                    <Link
                      href="/guide"
                      className="inline-flex h-10 shrink-0 items-center rounded-xl border border-(--l-border) bg-(--l-surface)/85 px-5 text-sm font-medium text-(--l-fg) backdrop-blur-sm transition-[border-color,background-color,transform] duration-150 hover:border-(--l-fg-4) hover:bg-(--l-surface) active:scale-[0.98]"
                    >
                      Read the guide
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
