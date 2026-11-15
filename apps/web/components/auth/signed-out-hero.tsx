"use client";

import { ArrowRight } from "lucide-react";
import { motion, MotionConfig, useScroll, useTransform } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { AppMockup } from "@/components/landing/app-mockup";
import { ConnectedStackShowcase } from "@/components/landing/connected-stack-showcase";
import { EntryLogo3D } from "@/components/landing/entry-logo-3d";
import { LandingFaq } from "@/components/landing/faq";
import { LandingFeatures } from "@/components/landing/features";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { Stage } from "@/components/landing/stage";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function SignedOutHero() {
  const heroStageRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroStageRef,
    offset: ["start start", "end start"],
  });
  const opticsScale = useTransform(scrollYProgress, [0, 1], [1.01, 1.08]);
  const opticsShiftY = useTransform(scrollYProgress, [0, 1], [0, 22]);
  const stageY = useTransform(scrollYProgress, [0, 0.5], [14, 0]);
  const stageScale = useTransform(scrollYProgress, [0, 0.5], [0.988, 1]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="landing relative isolate min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/20">
        <LandingNav showSignIn />

        <section
          ref={heroStageRef}
          className="relative overflow-hidden pt-[72px] pb-12 sm:pt-24 md:pt-28 md:pb-20"
        >
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
            {/* Single obsidian hero scene: calm editorial space left, prism + interactive 3D Entry orbital right */}
            <div className="relative overflow-hidden rounded-2xl border border-(--l-border) bg-[#0b0c10] text-zinc-100 shadow-(--l-window-shadow)">
              <motion.div
                aria-hidden="true"
                style={{ scale: opticsScale, y: opticsShiftY }}
                className="pointer-events-none absolute inset-0"
              >
                <Image
                  src="/images/entry-hero-optics.jpg"
                  alt="Optical glass prism refracting a warm amber light beam onto an anodized monolith"
                  fill
                  priority
                  sizes="(max-width: 1320px) 100vw, 1320px"
                  className="object-cover object-[76%_center] opacity-90 sm:opacity-95"
                />
              </motion.div>

              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0b0c10]/92 via-[#0b0c10]/78 to-[#0b0c10]/68 lg:bg-gradient-to-r lg:from-[#0b0c10]/95 lg:via-[#0b0c10]/74 lg:to-[#0b0c10]/20"
              />

              <div className="relative z-10 grid items-center gap-4 px-5 pt-6 pb-4 sm:gap-6 sm:px-8 sm:pt-12 sm:pb-8 lg:grid-cols-12 lg:gap-8 lg:px-12 lg:py-12">
                {/* Reading-order primary column (stacks above 3D orbital on 375px mobile) */}
                <div className="min-w-0 lg:col-span-6">
                  <motion.h1
                    initial={false}
                    animate={{
                      opacity: 1,
                      transform: "translateY(0px) scale(1)",
                    }}
                    transition={{ duration: 0.32, ease: EASE_OUT }}
                    className="text-balance text-3xl font-semibold leading-[1.06] tracking-tight text-white sm:text-5xl md:text-[3.25rem]"
                  >
                    Software engineering workspaces that run alone or as a team
                  </motion.h1>

                  <motion.p
                    initial={false}
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    transition={{ duration: 0.32, delay: 0.04, ease: EASE_OUT }}
                    className="mt-3.5 max-w-[54ch] text-pretty text-base leading-relaxed text-zinc-200 sm:mt-5 sm:text-lg"
                  >
                    Build and ship code inside an isolated Linux cloud container
                    connected to GitHub, Vercel, Gmail, Slack, and Linear. Start
                    free with $1 of real execution credit — and when you need
                    more, try our $5 plan for $10 of AI credit.
                  </motion.p>

                  <motion.div
                    initial={false}
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    transition={{ duration: 0.32, delay: 0.08, ease: EASE_OUT }}
                    className="mt-5 flex flex-wrap items-center gap-3 sm:mt-8"
                  >
                    <Link
                      href="/login"
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-[#0a0a0c] transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97]"
                    >
                      <span>Start free ($1 credit)</span>
                      <ArrowRight className="size-4" strokeWidth={1.5} />
                    </Link>
                    <Link
                      href="/pricing"
                      className="inline-flex h-10 items-center rounded-lg border border-white/25 bg-[#0e1015]/80 px-4 text-sm font-medium text-white backdrop-blur-xs transition-[border-color,background-color,transform] duration-150 hover:border-white/40 hover:bg-[#161922]/90 active:scale-[0.97]"
                    >
                      Try $5 plan → $10 credit
                    </Link>
                  </motion.div>
                </div>

                {/* Single enlarged interactive 3D Entry orbital blended directly over prism optics */}
                <motion.div
                  initial={false}
                  animate={{
                    opacity: 1,
                    transform: "translateY(0px) scale(1)",
                  }}
                  transition={{ duration: 0.36, delay: 0.06, ease: EASE_OUT }}
                  className="min-w-0 lg:col-span-6"
                >
                  <div className="relative h-[240px] w-full sm:h-[380px] lg:h-[460px]">
                    <EntryLogo3D tone="obsidian" className="h-full w-full" />
                  </div>
                </motion.div>
              </div>

              <div className="relative z-10 flex items-center justify-between border-t border-white/10 bg-[#0e1015]/92 px-5 py-2.5 font-mono text-xs text-zinc-300 tabular-nums sm:px-8">
                <span>Entry orbital optics</span>
                <span className="text-zinc-400">Drag emblem to rotate</span>
              </div>
            </div>

            {/* Interactive 3-pane workspace showcase rising cleanly below hero stage */}
            <motion.div
              style={{ y: stageY, scale: stageScale }}
              initial={false}
              whileInView={{ opacity: 1, transform: "translateY(0px)" }}
              viewport={{ once: true, amount: 0.08 }}
              transition={{ duration: 0.36, ease: EASE_OUT }}
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
        <LandingFaq />
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
