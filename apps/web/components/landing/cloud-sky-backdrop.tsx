"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import Image from "next/image";
import { useEffect, useRef } from "react";

interface CloudBank {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  alpha: number;
  phase: number;
}

function buildCloudSprite(isDark: boolean): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  sprite.width = 256;
  sprite.height = 128;
  const ctx = sprite.getContext("2d");
  if (!ctx) return sprite;

  const puffs = [
    { x: 128, y: 74, r: 58, a: 0.42 },
    { x: 86, y: 78, r: 46, a: 0.34 },
    { x: 170, y: 80, r: 48, a: 0.32 },
    { x: 112, y: 56, r: 44, a: 0.36 },
    { x: 150, y: 60, r: 42, a: 0.3 },
  ];

  const rgb = isDark ? "214, 226, 244" : "255, 255, 255";
  const rim = isDark ? "148, 178, 214" : "224, 238, 252";

  for (const puff of puffs) {
    const grad = ctx.createRadialGradient(
      puff.x,
      puff.y - puff.r * 0.16,
      puff.r * 0.08,
      puff.x,
      puff.y,
      puff.r,
    );
    grad.addColorStop(0, `rgba(${rgb}, ${puff.a})`);
    grad.addColorStop(0.55, `rgba(${rim}, ${puff.a * 0.42})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
    ctx.fill();
  }

  return sprite;
}

function CloudWispCanvas({
  reducedMotion,
  density = 13,
}: {
  readonly reducedMotion: boolean;
  readonly density?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isDark = document.documentElement.classList.contains("dark");
    let sprite = buildCloudSprite(isDark);

    const observer = new MutationObserver(() => {
      const nextDark = document.documentElement.classList.contains("dark");
      if (nextDark !== isDark) {
        isDark = nextDark;
        sprite = buildCloudSprite(isDark);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    let width = 0;
    let height = 0;
    const banks: CloudBank[] = [];

    const seedBanks = (w: number, h: number) => {
      banks.length = 0;
      for (let i = 0; i < density; i++) {
        const layer = i % 3;
        const scale = layer === 0 ? 1.35 : layer === 1 ? 0.95 : 0.68;
        const bw = (220 + ((i * 53) % 190)) * scale;
        const bh = bw * 0.48;
        banks.push({
          x: (i / density) * (w + bw * 1.3) - bw * 0.4,
          y: h * (0.04 + ((i * 19) % 58) / 100),
          w: bw,
          h: bh,
          speed: (layer === 0 ? 16 : layer === 1 ? 10.5 : 6.5) + (i % 4) * 1.6,
          alpha: isDark
            ? layer === 0
              ? 0.24
              : layer === 1
                ? 0.17
                : 0.12
            : layer === 0
              ? 0.52
              : layer === 1
                ? 0.38
                : 0.28,
          phase: i * 1.17,
        });
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // Half-resolution backing store keeps blurred volumetric mist ultra-fast
      width = Math.max(1, Math.round(rect.width * 0.5));
      height = Math.max(1, Math.round(rect.height * 0.5));
      canvas.width = width;
      canvas.height = height;
      seedBanks(width, height);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let rafId = 0;
    let lastTime = performance.now();

    const drawFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      ctx.clearRect(0, 0, width, height);
      const t = now * 0.00035;

      for (const bank of banks) {
        if (!reducedMotion) {
          bank.x -= bank.speed * dt;
          if (bank.x + bank.w < -40) {
            bank.x = width + 30;
          }
        }
        const bobY = reducedMotion ? 0 : Math.sin(t + bank.phase) * 5;
        ctx.globalAlpha = isDark
          ? bank.alpha
          : Math.min(0.68, bank.alpha * 1.5);
        ctx.drawImage(sprite, bank.x, bank.y + bobY, bank.w, bank.h);
      }

      ctx.globalAlpha = 1;
      if (!reducedMotion) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    drawFrame(lastTime);

    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      observer.disconnect();
    };
  }, [density, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-95"
    />
  );
}

interface CloudSkyBackdropProps {
  readonly variant?: "hero" | "closing";
}

export function CloudSkyBackdrop({ variant = "hero" }: CloudSkyBackdropProps) {
  const prefersReduced = useReducedMotion() ?? false;
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  const scrollShiftY = useTransform(scrollYProgress, [0, 1], [0, 48]);

  const mouseX = useSpring(0, { stiffness: 45, damping: 22 });
  const mouseY = useSpring(0, { stiffness: 45, damping: 22 });

  useEffect(() => {
    if (prefersReduced || variant !== "hero") return;
    const handleMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      mouseX.set(nx * -18);
      mouseY.set(ny * -10);
    };
    window.addEventListener("pointermove", handleMove, { passive: true });
    return () => window.removeEventListener("pointermove", handleMove);
  }, [mouseX, mouseY, prefersReduced, variant]);

  if (variant === "closing") {
    return (
      <div
        ref={containerRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="entry-cloud-pan absolute inset-0">
          <Image
            src="/images/hero-cloud-dark.jpg"
            alt=""
            fill
            sizes="(max-width: 1280px) 100vw, 1200px"
            className="hidden object-cover object-[75%_60%] opacity-60 dark:block"
          />
          <Image
            src="/images/hero-cloud-light.jpg"
            alt=""
            fill
            sizes="(max-width: 1280px) 100vw, 1200px"
            className="block object-cover object-[75%_60%] opacity-70 dark:hidden"
          />
        </div>
        <CloudWispCanvas reducedMotion={prefersReduced} density={7} />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(95deg, var(--l-surface) 0%, color-mix(in srgb, var(--l-surface) 88%, transparent) 48%, color-mix(in srgb, var(--l-surface) 24%, transparent) 100%)",
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[660px] overflow-hidden sm:h-[760px] lg:h-[840px]"
    >
      {/* Layer 1: High-altitude photorealistic cloud sea with scroll + pointer parallax + slow pan */}
      <motion.div
        style={
          prefersReduced
            ? undefined
            : { x: mouseX, y: mouseY, translateY: scrollShiftY }
        }
        className="absolute inset-[-6%]"
      >
        <div className="entry-cloud-pan relative h-full w-full">
          <Image
            src="/images/hero-cloud-dark.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="hidden object-cover object-[72%_28%] dark:block"
          />
          <Image
            src="/images/hero-cloud-light.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="block object-cover object-[72%_28%] dark:hidden"
          />
        </div>
      </motion.div>

      {/* Layer 2: Counter-drifting upper atmospheric cloud depth veil */}
      <div
        className="entry-cloud-veil absolute inset-[-6%] opacity-30 dark:opacity-28"
        style={{
          maskImage:
            "radial-gradient(ellipse 80% 70% at 72% 32%, black 20%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 72% 32%, black 20%, transparent 78%)",
        }}
      >
        <Image
          src="/images/hero-cloud-dark.jpg"
          alt=""
          fill
          sizes="100vw"
          className="hidden object-cover object-[60%_22%] dark:block"
        />
        <Image
          src="/images/hero-cloud-light.jpg"
          alt=""
          fill
          sizes="100vw"
          className="block object-cover object-[60%_22%] dark:hidden"
        />
      </div>

      {/* Layer 3: Real-time 60fps drifting volumetric cloud wisps */}
      <CloudWispCanvas reducedMotion={prefersReduced} density={14} />

      {/* Crisp text readability feather on left while keeping right cloud sea open */}
      <div className="absolute inset-0 bg-(--l-bg)/30 md:bg-transparent" />
      <div
        className="absolute inset-0 md:w-[64%]"
        style={{
          background:
            "linear-gradient(to right, var(--l-bg) 0%, color-mix(in srgb, var(--l-bg) 74%, transparent) 44%, transparent 100%)",
        }}
      />
      {/* Seamless bottom dissolve into page ground */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--l-bg) 28%, transparent) 0%, transparent 16%, transparent 48%, color-mix(in srgb, var(--l-bg) 80%, transparent) 82%, var(--l-bg) 100%)",
        }}
      />
    </div>
  );
}
