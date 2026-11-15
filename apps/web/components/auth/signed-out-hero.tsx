"use client";

import { ArrowRight } from "lucide-react";
import { motion, MotionConfig, useScroll, useTransform } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { AppMockup } from "@/components/landing/app-mockup";
import { LandingBento } from "@/components/landing/bento";
import { ConnectedStackShowcase } from "@/components/landing/connected-stack-showcase";
import { EntryLogo3D } from "@/components/landing/entry-logo-3d";
import { LandingFaq } from "@/components/landing/faq";
import { LandingFeatures } from "@/components/landing/features";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { Stage } from "@/components/landing/stage";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const HERO_CAPABILITIES = [
  {
    title: "Direct or /team Waves",
    summary:
      "Fast single-agent loop for focused edits, or wave-coordinated @role specialists streaming inline",
  },
  {
    title: "Cloud Linux Sandbox",
    summary:
      "Isolated repository branch, shell, live app preview, and side-by-side diffs in every session",
  },
  {
    title: "$1 Free · $5 Gets $10 Credit",
    summary:
      "Start on the Free plan with $1 of real execution, then upgrade to the $5 plan for $10 of AI credit",
  },
  {
    title: "Offline-Durable Runs",
    summary:
      "Execution continues on cloud checkpoints across Wi-Fi drops, closed tabs, and device handoffs",
  },
] as const;

export function SignedOutHero() {
  const heroStageRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroStageRef,
    offset: ["start start", "end start"],
  });
  const opticsScale = useTransform(scrollYProgress, [0, 1], [1.02, 1.12]);
  const opticsShiftY = useTransform(scrollYProgress, [0, 1], [0, 28]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="landing relative isolate min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/20">
        <LandingNav showSignIn />

        <section
          ref={heroStageRef}
          className="relative overflow-hidden pt-20 pb-12 sm:pt-28 md:pt-32 md:pb-20"
        >
          {/* Subtle full-bleed architectural optical background image */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] overflow-hidden opacity-20 dark:opacity-35 sm:h-[760px]"
          >
            <Image
              src="/images/entry-hero-optics.jpg"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-(--l-bg)/55 via-(--l-bg)/80 to-(--l-bg)" />
          </div>

          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
            <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-10">
              {/* Reading-order primary column (stacks above 3D visual on 375px mobile) */}
              <div className="min-w-0 lg:col-span-6">
                <motion.h1
                  initial={{
                    opacity: 0,
                    transform: "translateY(12px) scale(0.98)",
                  }}
                  animate={{
                    opacity: 1,
                    transform: "translateY(0px) scale(1)",
                  }}
                  transition={{ duration: 0.36, ease: EASE_OUT }}
                  className="text-balance text-3xl font-semibold leading-[1.06] tracking-tight sm:text-5xl md:text-[3.5rem]"
                >
                  Software engineering workspaces that run alone or as a team
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.36, delay: 0.05, ease: EASE_OUT }}
                  className="mt-4 max-w-[56ch] text-pretty text-base leading-relaxed text-(--l-fg-2) sm:mt-6 sm:text-lg"
                >
                  Build and ship code inside an isolated Linux cloud container
                  connected to GitHub, Vercel, Gmail, Slack, and Linear. Start
                  free with $1 of real execution credit — and if you need more,
                  try our $5 plan and get $10 of AI credit.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, transform: "translateY(8px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.36, delay: 0.1, ease: EASE_OUT }}
                  className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8"
                >
                  <Link
                    href="/login"
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-(--l-btn-bg) px-4 text-sm font-medium text-(--l-btn-fg) transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97]"
                  >
                    <span>Start free ($1 credit)</span>
                    <ArrowRight className="size-4" strokeWidth={1.5} />
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex h-10 items-center rounded-lg border border-(--l-border) bg-(--l-surface) px-4 text-sm font-medium text-(--l-fg-2) transition-[border-color,color,background-color,transform] duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg) active:scale-[0.97]"
                  >
                    Try $5 plan → get $10 credit
                  </Link>
                </motion.div>
              </div>

              {/* Single bright hero moment: Enlarged obsidian optical studio scene + 3D Entry orbital emblem with core logo medallion */}
              <motion.div
                initial={{
                  opacity: 0,
                  transform: "translateY(14px) scale(0.97)",
                }}
                animate={{
                  opacity: 1,
                  transform: "translateY(0px) scale(1)",
                }}
                transition={{ duration: 0.44, delay: 0.08, ease: EASE_OUT }}
                className="min-w-0 lg:col-span-6"
              >
                <div className="relative overflow-hidden rounded-2xl border border-(--l-border) bg-[#0b0c10] text-zinc-100 shadow-(--l-window-shadow)">
                  <div className="relative h-[340px] w-full overflow-hidden sm:h-[460px] lg:h-[520px]">
                    <motion.div
                      style={{
                        scale: opticsScale,
                        y: opticsShiftY,
                      }}
                      className="absolute inset-0"
                    >
                      <Image
                        src="/images/entry-hero-optics.jpg"
                        alt="Optical glass prism refracting a warm amber light beam onto an anodized monolith"
                        fill
                        priority
                        sizes="(max-width: 1024px) 100vw, 720px"
                        className="object-cover object-[72%_center] opacity-95"
                      />
                    </motion.div>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0c10]/80 via-transparent to-[#0b0c10]/15"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0b0c10]/30 via-transparent to-transparent"
                    />
                    <div className="relative z-10 h-full w-full">
                      <EntryLogo3D tone="obsidian" className="h-full w-full" />
                    </div>
                  </div>
                  <div className="relative z-10 flex items-center justify-between border-t border-white/10 bg-[#0e1015]/95 px-4 py-3 font-mono text-xs text-zinc-300 tabular-nums">
                    <span>Entry orbital core</span>
                    <span className="text-zinc-400">
                      Drag 3D emblem to inspect
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Aligned architectural summary bar */}
            <div className="mt-8 grid grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
              {HERO_CAPABILITIES.map((item, idx) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{
                    duration: 0.34,
                    delay: 0.14 + idx * 0.04,
                    ease: EASE_OUT,
                  }}
                  className="min-w-0 rounded-xl border border-(--l-border) bg-(--l-surface) p-4 transition-colors duration-150 hover:border-(--l-fg-4)"
                >
                  <div className="font-mono text-xs font-medium text-(--l-fg)">
                    {item.title}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-(--l-fg-3)">
                    {item.summary}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Interactive 3-pane workspace showcase */}
            <motion.div
              initial={{ opacity: 0, transform: "translateY(14px)" }}
              whileInView={{ opacity: 1, transform: "translateY(0px)" }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.42, ease: EASE_OUT }}
              className="mt-8 min-w-0 sm:mt-12"
            >
              <Stage>
                <AppMockup />
              </Stage>
            </motion.div>
          </div>
        </section>

        <ConnectedStackShowcase />
        <LandingFeatures />
        <LandingBento />
        <LandingFaq />
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
