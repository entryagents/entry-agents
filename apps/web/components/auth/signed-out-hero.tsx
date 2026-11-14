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
    title: "Direct or Team Waves",
    summary:
      "Fast single-agent loop for focused edits, or wave-coordinated specialists streaming inline",
  },
  {
    title: "Cloud Linux Sandbox",
    summary:
      "Isolated repository branch, shell, live app preview, and side-by-side diffs in every session",
  },
  {
    title: "99% Caching & $5–$40 Plans",
    summary:
      "Up to 99% prompt token caching and 3.8x credit value ($13 Goat) with zero token markup",
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
  const opticsScale = useTransform(scrollYProgress, [0, 1], [1.02, 1.1]);
  const opticsShiftY = useTransform(scrollYProgress, [0, 1], [0, 24]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="landing relative isolate min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/20">
        <LandingNav showSignIn />

        <section
          ref={heroStageRef}
          className="relative overflow-hidden pt-20 pb-12 sm:pt-28 md:pt-32 md:pb-20"
        >
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
            <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-10">
              {/* Reading-order primary column (stacks above 3D visual on 375px mobile) */}
              <div className="min-w-0 lg:col-span-6">
                <motion.h1
                  initial={{ opacity: 0, transform: "translateY(12px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
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
                  connected to GitHub, Vercel, Gmail, Slack, and Linear. Simple
                  tasks finish in one fast pass, while broad builds run as
                  dependency waves inside the same chat.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, transform: "translateY(8px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.36, delay: 0.1, ease: EASE_OUT }}
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
                    href="/pricing"
                    className="inline-flex h-10 items-center rounded-lg border border-(--l-border) bg-(--l-surface) px-4 text-sm font-medium text-(--l-fg-2) transition-[border-color,color,background-color] duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg)"
                  >
                    Plans from $5/mo
                  </Link>
                </motion.div>
              </div>

              {/* Single bright hero moment: Large obsidian optical studio scene + 3D Entry orbital emblem */}
              <motion.div
                initial={{ opacity: 0, transform: "translateY(14px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{ duration: 0.44, delay: 0.08, ease: EASE_OUT }}
                className="min-w-0 lg:col-span-6"
              >
                <div className="relative overflow-hidden rounded-2xl border border-(--l-border) bg-[#0b0c10] text-zinc-100 shadow-(--l-window-shadow)">
                  <div className="relative h-72 w-full overflow-hidden sm:h-[400px] lg:h-[460px]">
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
                        sizes="(max-width: 1024px) 100vw, 660px"
                        className="object-cover object-[74%_center] opacity-90"
                      />
                    </motion.div>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0c10]/85 via-transparent to-[#0b0c10]/20"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0b0c10]/35 via-transparent to-transparent"
                    />
                    <div className="relative z-10 h-full w-full sm:w-[82%] lg:w-[78%]">
                      <EntryLogo3D tone="obsidian" className="h-full w-full" />
                    </div>
                  </div>
                  <div className="relative z-10 flex items-center justify-between border-t border-white/10 bg-[#0e1015]/95 px-4 py-3 font-mono text-xs text-zinc-300 tabular-nums">
                    <span>Entry orbital optics</span>
                    <span className="text-zinc-400">Drag to inspect</span>
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
