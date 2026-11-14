"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EntryMark } from "@/components/entry-mark";

/**
 * Generates an offscreen studio softbox equirectangular texture so the 3D
 * metallic Entry ribbon reflects architectural highlights without external assets.
 */
function createStudioEnvTexture(isDark: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    if (isDark) {
      bgGrad.addColorStop(0, "#f4f5f8");
      bgGrad.addColorStop(0.28, "#2a2d36");
      bgGrad.addColorStop(0.58, "#0f1014");
      bgGrad.addColorStop(0.84, "#2b1c12");
      bgGrad.addColorStop(1, "#090a0d");
    } else {
      bgGrad.addColorStop(0, "#ffffff");
      bgGrad.addColorStop(0.32, "#c6cad4");
      bgGrad.addColorStop(0.62, "#24262e");
      bgGrad.addColorStop(0.85, "#6b4328");
      bgGrad.addColorStop(1, "#16181e");
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Overhead cool specular softbox band
    const topLight = ctx.createRadialGradient(140, 48, 8, 140, 48, 130);
    topLight.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    topLight.addColorStop(0.45, "rgba(235, 240, 248, 0.35)");
    topLight.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = topLight;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Warm optical amber rim band matching Entry's prism optics
    const warmLight = ctx.createRadialGradient(410, 150, 6, 410, 150, 145);
    warmLight.addColorStop(
      0,
      isDark ? "rgba(255, 145, 72, 0.88)" : "rgba(229, 122, 46, 0.72)",
    );
    warmLight.addColorStop(0.5, "rgba(229, 122, 46, 0.2)");
    warmLight.addColorStop(1, "rgba(229, 122, 46, 0)");
    ctx.fillStyle = warmLight;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Shapes radial thickness along a TubeGeometry so the continuous ribbon
 * swells gracefully along its outer shoulders and tapers smoothly through intersections.
 */
function buildTaperedRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  tubularSegments: number,
  baseRadius: number,
  radialSegments: number,
  closed: boolean,
  profile: (u: number) => number,
): THREE.TubeGeometry {
  const geom = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    baseRadius,
    radialSegments,
    closed,
  );
  const pos = geom.attributes.position;
  if (!pos) return geom;

  const ringCount = radialSegments + 1;
  const point = new THREE.Vector3();
  const center = new THREE.Vector3();
  const offset = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    const scale = profile(u);
    curve.getPointAt(Math.min(1, Math.max(0, u)), center);

    for (let j = 0; j < ringCount; j++) {
      const idx = i * ringCount + j;
      if (idx >= pos.count) continue;
      point.fromBufferAttribute(pos, idx);
      offset.subVectors(point, center);
      // Elliptical sculpted ribbon profile with crisp dimensional depth
      offset.multiplyScalar(scale);
      offset.z *= 0.68;
      point.copy(center).add(offset);
      pos.setXYZ(idx, point.x, point.y, point.z);
    }
  }

  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

export function EntryLogo3D({ className }: { readonly className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    renderer.setSize(
      Math.max(1, container.clientWidth),
      Math.max(1, container.clientHeight),
    );
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      34,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      50,
    );
    camera.position.set(0, 0.04, 7.25);

    const pmrem = new THREE.PMREMGenerator(renderer);
    let currentIsDark = document.documentElement.classList.contains("dark");
    let rawEnvTex = createStudioEnvTexture(currentIsDark);
    let envRT = pmrem.fromEquirectangular(rawEnvTex);
    scene.environment = envRT.texture;

    const group = new THREE.Group();
    scene.add(group);

    // Continuous calligraphic 'ae' infinity weave:
    // Start neatly tucked behind the upper-center crossover so no flat cap or kink is visible,
    // sweep through the left loop, cross smoothly up-right through the center bridge,
    // curl around the right loop, dip into the 'e' crossbar, and taper cleanly into a sharp lower-right crescent tail.
    const mainCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-0.08, 0.2, -0.02),
        new THREE.Vector3(-0.56, 0.68, 0.08),
        new THREE.Vector3(-1.32, 0.56, 0.02),
        new THREE.Vector3(-1.62, -0.04, -0.04),
        new THREE.Vector3(-1.28, -0.66, 0.06),
        new THREE.Vector3(-0.52, -0.74, 0.14),
        new THREE.Vector3(0.02, -0.1, 0.2),
        new THREE.Vector3(0.58, 0.58, 0.12),
        new THREE.Vector3(1.26, 0.64, -0.02),
        new THREE.Vector3(1.58, 0.12, -0.08),
        new THREE.Vector3(1.06, -0.22, 0.04),
        new THREE.Vector3(0.46, -0.34, 0.14),
        new THREE.Vector3(0.96, -0.74, 0.04),
        new THREE.Vector3(1.62, -0.48, -0.06),
      ],
      false,
      "catmullrom",
      0.5,
    );

    // Secondary S-ribbon weaving across the left cavity into the ascending central bridge
    const crossCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-1.54, -0.16, -0.06),
        new THREE.Vector3(-1.02, 0.06, 0.06),
        new THREE.Vector3(-0.42, 0.16, 0.02),
        new THREE.Vector3(0.14, 0.24, -0.04),
      ],
      false,
      "catmullrom",
      0.5,
    );

    const ribbonGeometry = buildTaperedRibbonGeometry(
      mainCurve,
      240,
      0.21,
      36,
      false,
      (u) => {
        // Taper start smoothly into the crossover seam and sweep end to a sculpted calligraphic point
        const startCap = u < 0.06 ? Math.sin(((u / 0.06) * Math.PI) / 2) : 1;
        const endCap =
          u > 0.86
            ? Math.max(0.04, Math.cos((((u - 0.86) / 0.14) * Math.PI) / 2))
            : 1;
        const swell =
          0.9 +
          Math.sin(u * Math.PI * 3.1 + 0.4) * 0.18 +
          Math.cos(u * Math.PI * 2) * 0.08;
        return Math.max(0.04, startCap * endCap * swell);
      },
    );

    const crossGeometry = buildTaperedRibbonGeometry(
      crossCurve,
      96,
      0.135,
      28,
      false,
      (u) => Math.max(0.12, Math.sin(u * Math.PI) * 0.96),
    );

    const ribbonMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(currentIsDark ? "#2a2d36" : "#121318"),
      metalness: currentIsDark ? 0.94 : 0.88,
      roughness: currentIsDark ? 0.12 : 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: currentIsDark ? 1.85 : 1.75,
    });

    const mainMesh = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
    const crossMesh = new THREE.Mesh(crossGeometry, ribbonMaterial);
    group.add(mainMesh, crossMesh);

    // Framed orbital ring & warm amber optical filament (sized to stay inside card bounds)
    const outerRingGeometry = new THREE.TorusGeometry(1.9, 0.012, 16, 128);
    const outerRingMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(currentIsDark ? "#454956" : "#8b8f9a"),
      metalness: 0.85,
      roughness: 0.28,
    });
    const outerRing = new THREE.Mesh(outerRingGeometry, outerRingMaterial);
    outerRing.rotation.x = Math.PI * 0.08;
    group.add(outerRing);

    const warmArcCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.88, -0.28, 0.11),
      new THREE.Vector3(-1.2, -1.49, 0.14),
      new THREE.Vector3(0, -1.9, 0.16),
      new THREE.Vector3(1.22, -1.46, 0.11),
    ]);
    const warmArcGeometry = new THREE.TubeGeometry(
      warmArcCurve,
      64,
      0.013,
      10,
      false,
    );
    const warmArcMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#e57a2e"),
      emissive: new THREE.Color("#e57a2e"),
      emissiveIntensity: currentIsDark ? 0.82 : 0.44,
      roughness: 0.3,
      metalness: 0.45,
    });
    const warmArc = new THREE.Mesh(warmArcGeometry, warmArcMaterial);
    warmArc.rotation.x = Math.PI * 0.08;
    group.add(warmArc);

    // Studio light rig with specular edge rim
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.6);
    keyLight.position.set(2.8, 3.6, 4.5);
    scene.add(keyLight);

    const backRimLight = new THREE.DirectionalLight("#eef2ff", 1.8);
    backRimLight.position.set(-2.4, 3, -3.5);
    scene.add(backRimLight);

    const rimLight = new THREE.DirectionalLight("#e57a2e", 2.5);
    rimLight.position.set(-3.6, -2.4, 2.2);
    scene.add(rimLight);

    const fillLight = new THREE.HemisphereLight("#eef1f8", "#16171d", 0.72);
    scene.add(fillLight);

    // Interaction state
    let targetRotX = -0.14;
    let targetRotY = 0.22;
    let currentRotX = targetRotX;
    let currentRotY = targetRotY;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let pointerX = 0;
    let pointerY = 0;

    const canvasEl = renderer.domElement;

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvasEl.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        pointerX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        pointerY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      }

      if (isDragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        dragOffsetY += dx * 0.01;
        dragOffsetX = Math.max(-0.85, Math.min(0.85, dragOffsetX + dy * 0.01));
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        canvasEl.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer already released
      }
    };

    const handlePointerLeave = () => {
      pointerX = 0;
      pointerY = 0;
    };

    canvasEl.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    container.addEventListener("pointerleave", handlePointerLeave);

    // Theme observer updates material/env map dynamically
    const themeObserver = new MutationObserver(() => {
      const nextDark = document.documentElement.classList.contains("dark");
      if (nextDark === currentIsDark) return;
      currentIsDark = nextDark;

      const nextRawEnv = createStudioEnvTexture(nextDark);
      const nextEnvRT = pmrem.fromEquirectangular(nextRawEnv);
      envRT.dispose();
      rawEnvTex.dispose();
      rawEnvTex = nextRawEnv;
      envRT = nextEnvRT;
      scene.environment = envRT.texture;

      ribbonMaterial.color.set(nextDark ? "#2a2d36" : "#121318");
      ribbonMaterial.metalness = nextDark ? 0.94 : 0.88;
      ribbonMaterial.roughness = nextDark ? 0.12 : 0.16;
      ribbonMaterial.envMapIntensity = nextDark ? 1.85 : 1.75;

      outerRingMaterial.color.set(nextDark ? "#454956" : "#8b8f9a");
      warmArcMaterial.emissiveIntensity = nextDark ? 0.82 : 0.44;
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(1, entry.contentRect.width);
      const h = Math.max(1, entry.contentRect.height);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    let rafId = 0;
    const startTime = performance.now();

    const renderFrame = (now: number) => {
      const elapsed = (now - startTime) * 0.001;

      if (!isDragging && !prefersReducedMotion) {
        dragOffsetX *= 0.96;
        dragOffsetY *= 0.96;
      }

      const idleYaw = prefersReducedMotion
        ? 0.24
        : Math.sin(elapsed * 0.55) * 0.22;
      const idlePitch = prefersReducedMotion
        ? -0.14
        : -0.12 + Math.cos(elapsed * 0.42) * 0.06;

      targetRotY = idleYaw + pointerX * 0.34 + dragOffsetY;
      targetRotX = idlePitch + pointerY * 0.22 + dragOffsetX;

      const ease = prefersReducedMotion ? 0.16 : 0.08;
      currentRotX += (targetRotX - currentRotX) * ease;
      currentRotY += (targetRotY - currentRotY) * ease;

      group.rotation.x = currentRotX;
      group.rotation.y = currentRotY;
      outerRing.rotation.z = prefersReducedMotion ? 0 : elapsed * 0.12;

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      canvasEl.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("pointerleave", handlePointerLeave);
      ribbonGeometry.dispose();
      crossGeometry.dispose();
      ribbonMaterial.dispose();
      outerRingGeometry.dispose();
      outerRingMaterial.dispose();
      warmArcGeometry.dispose();
      warmArcMaterial.dispose();
      envRT.dispose();
      rawEnvTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (canvasEl.parentNode === container) {
        canvasEl.remove();
      }
    };
  }, []);

  if (webglFailed) {
    return (
      <div
        className={`relative flex items-center justify-center ${className ?? ""}`}
      >
        <div className="flex size-36 items-center justify-center rounded-full border border-(--l-border) bg-(--l-surface)">
          <EntryMark className="size-20 text-(--l-fg)" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Interactive 3D Entry Agents emblem — drag to rotate"
      className={`relative cursor-grab touch-pan-y select-none active:cursor-grabbing ${className ?? ""}`}
    />
  );
}
