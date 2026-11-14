"use client";

import { ArrowRight } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { AppMockup } from "@/components/landing/app-mockup";
import { LandingBento } from "@/components/landing/bento";
import { EntryLogo3D } from "@/components/landing/entry-logo-3d";
import { LandingFaq } from "@/components/landing/faq";
import { LandingFeatures } from "@/components/landing/features";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { Stage } from "@/components/landing/stage";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const HERO_CAPABILITIES = [
  {
    title: "Direct or Team",
    summary:
      "Fast single-agent loop for everyday fixes, or live in-chat multi-agent coordination for broad changes",
  },
  {
    title: "Cloud Linux",
    summary:
      "Isolated repository branch, shell, live app preview, and side-by-side diffs in every session",
  },
  {
    title: "Connected stack",
    summary:
      "Native GitHub PRs and Vercel deploys alongside Gmail, Slack, Linear, Notion, and Calendar",
  },
  {
    title: "Durable runs",
    summary:
      "Work continues in the cloud across Wi-Fi drops, closed tabs, and desktop-to-mobile handoffs",
  },
] as const;

export function SignedOutHero() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing relative isolate min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/20">
        <LandingNav showSignIn />

        <section className="relative overflow-hidden pt-20 pb-12 sm:pt-28 md:pt-32 md:pb-20">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
            <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
              {/* Reading-order primary column (stacks above 3D visual on 375px mobile) */}
              <div className="min-w-0 lg:col-span-7">
                <motion.div
                  initial={{ opacity: 0, transform: "translateY(8px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.32, ease: EASE_OUT }}
                  className="inline-flex items-center gap-2 rounded-lg border border-(--l-border) bg-(--l-surface) px-3 py-1.5 text-xs text-(--l-fg-2)"
                >
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <span>Cloud engineering workspaces</span>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.36, delay: 0.04, ease: EASE_OUT }}
                  className="mt-5 text-balance text-3xl font-semibold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl"
                >
                  Software engineering workspaces that run alone or as a team
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.36, delay: 0.08, ease: EASE_OUT }}
                  className="mt-4 max-w-[58ch] text-pretty text-base leading-relaxed text-(--l-fg-2) sm:mt-6 sm:text-lg"
                >
                  Ship code in an isolated Linux cloud sandbox connected to your
                  repository and workspace apps. Simple tasks run in one direct
                  pass, while complex builds coordinate specialist agents live
                  inside the same chat.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, transform: "translateY(8px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.36, delay: 0.12, ease: EASE_OUT }}
                  className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8"
                >
                  <Link
                    href="/login"
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-(--l-btn-bg) px-4 text-sm font-medium text-(--l-btn-fg) transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
                  >
                    <span>Start building</span>
                    <ArrowRight className="size-4" strokeWidth={1.5} />
                  </Link>
                  <Link
                    href="/model"
                    className="inline-flex h-10 items-center rounded-lg border border-(--l-border) bg-(--l-surface) px-4 text-sm font-medium text-(--l-fg-2) transition-[border-color,color,background-color] duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg)"
                  >
                    Models and pricing
                  </Link>
                </motion.div>
              </div>

              {/* Single bright hero moment: Optical studio scene + interactive 3D Entry sculpture */}
              <motion.div
                initial={{ opacity: 0, transform: "translateY(12px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{ duration: 0.42, delay: 0.1, ease: EASE_OUT }}
                className="min-w-0 lg:col-span-5"
              >
                <div className="relative overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-surface)">
                  <div className="relative h-64 w-full sm:h-80 lg:h-96">
                    <Image
                      src="/images/entry-hero-optics.jpg"
                      alt=""
                      fill
                      priority
                      sizes="(max-width: 1024px) 100vw, 520px"
                      className="object-cover object-center opacity-25 dark:opacity-55"
                      aria-hidden="true"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-gradient-to-b from-(--l-surface)/15 via-transparent to-(--l-surface)/85"
                    />
                    <EntryLogo3D className="relative z-10 h-full w-full" />
                  </div>
                  <div className="flex items-center justify-between border-t border-(--l-border) bg-(--l-surface-2) px-4 py-2.5 font-mono text-xs text-(--l-fg-3)">
                    <span>Entry orbital emblem</span>
                    <span>Drag to inspect</span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Aligned architectural summary bar */}
            <motion.div
              initial={{ opacity: 0, transform: "translateY(10px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{ duration: 0.4, delay: 0.14, ease: EASE_OUT }}
              className="mt-8 grid grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4"
            >
              {HERO_CAPABILITIES.map((item) => (
                <div
                  key={item.title}
                  className="min-w-0 rounded-xl border border-(--l-border) bg-(--l-surface) p-4"
                >
                  <div className="font-mono text-xs font-medium text-(--l-fg)">
                    {item.title}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-(--l-fg-3)">
                    {item.summary}
                  </p>
                </div>
              ))}
            </motion.div>

            {/* Interactive 3-pane workspace showcase */}
            <motion.div
              id="workspace"
              initial={{ opacity: 0, transform: "translateY(12px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{ duration: 0.44, delay: 0.16, ease: EASE_OUT }}
              className="mt-8 min-w-0 sm:mt-12"
            >
              <Stage>
                <AppMockup />
              </Stage>
            </motion.div>
          </div>
        </section>

        <div id="features" className="min-w-0">
          <LandingFeatures />
        </div>
        <LandingBento />
        <LandingFaq />
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
