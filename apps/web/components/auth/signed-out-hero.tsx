"use client";

import { ArrowRight } from "lucide-react";
import { motion, MotionConfig, useScroll, useTransform } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { AppMockup } from "@/components/landing/app-mockup";
import { ConnectedStackShowcase } from "@/components/landing/connected-stack-showcase";
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
  const bgScale = useTransform(scrollYProgress, [0, 1], [1.01, 1.06]);
  const bgShiftY = useTransform(scrollYProgress, [0, 1], [0, 24]);
  const stageY = useTransform(scrollYProgress, [0, 0.5], [14, 0]);
  const stageScale = useTransform(scrollYProgress, [0, 0.5], [0.988, 1]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="landing relative isolate min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/20">
        {/* Full-site dense architectural background image, calibrated for both light and dark modes */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        >
          <motion.div
            style={{ scale: bgScale, y: bgShiftY }}
            className="absolute inset-0"
          >
            <Image
              src="/images/entry-site-bg.jpg"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-[72%_center] opacity-25 contrast-110 dark:opacity-55"
            />
          </motion.div>
          <div className="absolute inset-0 bg-gradient-to-b from-[#fafafa]/68 via-[#fafafa]/82 to-[#fafafa]/92 dark:from-[#0a0a0c]/55 dark:via-[#0a0a0c]/74 dark:to-[#0a0a0c]/88" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#fafafa]/78 via-[#fafafa]/40 to-transparent dark:from-[#0a0a0c]/80 dark:via-[#0a0a0c]/40 dark:to-transparent" />
        </div>

        <LandingNav showSignIn />

        <section
          ref={heroStageRef}
          className="relative overflow-hidden pt-24 pb-12 sm:pt-32 md:pt-36 md:pb-20"
        >
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
            <div className="max-w-3xl">
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
                  className="inline-flex h-10 items-center rounded-lg border border-(--l-border) bg-(--l-surface)/90 px-4 text-sm font-medium text-(--l-fg-2) backdrop-blur-xs transition-[border-color,color,background-color] duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg)"
                >
                  Plans from $5/mo
                </Link>
              </motion.div>
            </div>

            {/* Interactive 3-pane workspace showcase */}
            <motion.div
              style={{ y: stageY, scale: stageScale }}
              initial={{ opacity: 0, transform: "translateY(14px)" }}
              whileInView={{ opacity: 1, transform: "translateY(0px)" }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.42, ease: EASE_OUT }}
              className="mt-10 min-w-0 sm:mt-14"
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
