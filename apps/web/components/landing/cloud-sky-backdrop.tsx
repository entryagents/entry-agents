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
  sprite.width = 280;
  sprite.height = 140;
  const ctx = sprite.getContext("2d");
  if (!ctx) return sprite;

  const puffs = [
    { x: 140, y: 82, r: 64, a: 0.56 },
    { x: 92, y: 86, r: 52, a: 0.44 },
    { x: 188, y: 88, r: 54, a: 0.42 },
    { x: 120, y: 60, r: 48, a: 0.48 },
    { x: 166, y: 64, r: 46, a: 0.4 },
  ];

  const rgb = isDark ? "226, 236, 250" : "255, 255, 255";
  const rim = isDark ? "160, 192, 228" : "220, 236, 252";

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
    grad.addColorStop(0.55, `rgba(${rim}, ${puff.a * 0.48})`);
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
  density = 20,
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
        const scale = layer === 0 ? 1.45 : layer === 1 ? 1 : 0.72;
        const bw = (220 + ((i * 53) % 190)) * scale;
        const bh = bw * 0.48;
        banks.push({
          x: (i / density) * (w + bw * 1.25) - bw * 0.35,
          y: h * (0.02 + ((i * 19) % 62) / 100),
          w: bw,
          h: bh,
          speed: (layer === 0 ? 34 : layer === 1 ? 22 : 14) + (i % 4) * 3.2,
          alpha: isDark
            ? layer === 0
              ? 0.34
              : layer === 1
                ? 0.24
                : 0.16
            : layer === 0
              ? 0.66
              : layer === 1
                ? 0.48
                : 0.34,
          phase: i * 1.17,
        });
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
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
      const t = now * 0.00055;

      for (const bank of banks) {
        if (!reducedMotion) {
          bank.x -= bank.speed * dt;
          if (bank.x + bank.w < -40) {
            bank.x = width + 30;
          }
        }
        const bobY = reducedMotion ? 0 : Math.sin(t + bank.phase) * 7;
        ctx.globalAlpha = isDark
          ? bank.alpha
          : Math.min(0.76, bank.alpha * 1.3);
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
      className="pointer-events-none absolute inset-0 h-full w-full"
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
  const scrollShiftY = useTransform(scrollYProgress, [0, 1], [0, 64]);

  const mouseX = useSpring(0, { stiffness: 45, damping: 20 });
  const mouseY = useSpring(0, { stiffness: 45, damping: 20 });

  useEffect(() => {
    if (prefersReduced || variant !== "hero") return;
    const handleMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      mouseX.set(nx * -28);
      mouseY.set(ny * -14);
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
            className="hidden object-cover object-[75%_60%] opacity-65 dark:block"
          />
          <Image
            src="/images/hero-cloud-light.jpg"
            alt=""
            fill
            sizes="(max-width: 1280px) 100vw, 1200px"
            className="block object-cover object-[75%_60%] opacity-75 dark:hidden"
          />
        </div>
        <CloudWispCanvas reducedMotion={prefersReduced} density={9} />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(95deg, var(--l-surface) 0%, color-mix(in srgb, var(--l-surface) 88%, transparent) 48%, color-mix(in srgb, var(--l-surface) 22%, transparent) 100%)",
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[660px] overflow-hidden sm:h-[760px] lg:h-[860px]"
    >
      {/* Layer 1: High-altitude cloud sea with scroll + pointer parallax + continuous drift */}
      <motion.div
        style={
          prefersReduced
            ? undefined
            : { x: mouseX, y: mouseY, translateY: scrollShiftY }
        }
        className="absolute inset-[-7%]"
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

      {/* Layer 2: Counter-drifting atmospheric cloud depth veil */}
      <div
        className="entry-cloud-veil absolute inset-[-7%] opacity-40 dark:opacity-38"
        style={{
          maskImage:
            "radial-gradient(ellipse 84% 72% at 72% 32%, black 22%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 84% 72% at 72% 32%, black 22%, transparent 80%)",
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

      {/* Layer 3: Real-time 60fps visibly drifting volumetric cloud banks */}
      <CloudWispCanvas reducedMotion={prefersReduced} density={20} />

      {/* Crisp readability feather on left while keeping right cloud sea vividly open */}
      <div className="absolute inset-0 bg-(--l-bg)/28 md:bg-transparent" />
      <div
        className="absolute inset-0 md:w-[62%]"
        style={{
          background:
            "linear-gradient(to right, var(--l-bg) 0%, color-mix(in srgb, var(--l-bg) 72%, transparent) 42%, transparent 100%)",
        }}
      />
      {/* Seamless bottom dissolve into page ground */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--l-bg) 24%, transparent) 0%, transparent 16%, transparent 48%, color-mix(in srgb, var(--l-bg) 80%, transparent) 82%, var(--l-bg) 100%)",
        }}
      />
    </div>
  );
}
