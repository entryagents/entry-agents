#!/usr/bin/env node
/**
 * Builds the Entry golden Boxd base snapshot (without downloading Chromium —
 * uses Boxd's pre-installed Chrome). Pre-warms:
 *   - /var/tmp/entry/{workspace,tmp,caches/{pnpm,npm,bun,pip}} on the 100 GB disk
 *   - TMPDIR=/var/tmp/entry/tmp and shared package cache env vars
 *   - poppler-utils (pdftoppm, pdfinfo, pdffonts, pdftotext), qpdf
 *   - Python PDF/font/image libs (pymupdf, pypdf, fonttools, brotli, pillow)
 *
 * Usage:
 *   BOXD_API_KEY=... node scripts/build-boxd-golden-snapshot.ts
 */
import { Boxd } from "@boxd-sh/sdk";

async function main() {
  const apiKey = process.env.BOXD_API_KEY || process.env.BOXD_TOKEN;
  if (!apiKey) {
    console.error("BOXD_API_KEY is required");
    process.exit(1);
  }

  const client = new Boxd({ apiKey });
  const builderName = `entry-golden-builder-${Date.now().toString(36)}`;
  const snapshotName = process.env.BOXD_GOLDEN_SNAPSHOT_NAME || "entry-base-v1";

  console.log(`Creating temporary builder VM ${builderName}...`);
  const machine = await client.machines.create({
    name: builderName,
    isolated: true,
    restartPolicy: "never",
    config: {
      vcpu: 2,
      memory: "8G",
      disk: "100G",
      autoSuspendTimeout: 600,
      autoDestroyTimeout: 3600,
      ssh: true,
    },
  });

  try {
    const setupScript = [
      "set -e",
      "mkdir -p /var/tmp/entry/workspace /var/tmp/entry/tmp /var/tmp/entry/caches/pnpm /var/tmp/entry/caches/npm /var/tmp/entry/caches/bun /var/tmp/entry/caches/pip",
      "chmod 1777 /var/tmp/entry/tmp",
      'cat << "EOF" >> /etc/profile.d/entry-disk.sh',
      "export TMPDIR=/var/tmp/entry/tmp",
      "export NPM_CONFIG_CACHE=/var/tmp/entry/caches/npm",
      "export BUN_INSTALL_CACHE_DIR=/var/tmp/entry/caches/bun",
      "export PIP_CACHE_DIR=/var/tmp/entry/caches/pip",
      "EOF",
      "chmod 644 /etc/profile.d/entry-disk.sh",
      "apt-get update -qq && apt-get install -y -qq poppler-utils qpdf python3-pip python3-venv",
      "pip3 install --break-system-packages --quiet pymupdf pypdf fonttools brotli pillow",
      "rm -rf /var/lib/apt/lists/*",
    ].join("\n");

    console.log(
      "Installing lightweight PDF/font/image tools & 100 GB disk layout...",
    );
    const res = await client.machines.exec(machine.id, {
      command: ["bash", "-lc", setupScript],
      timeout: 180,
    });
    if (res.exitCode !== 0) {
      throw new Error(
        `Setup failed (${res.exitCode}): ${res.stderr || res.stdout}`,
      );
    }

    console.log(`Creating golden snapshot "${snapshotName}"...`);
    const snap = await client.snapshots.create(machine.id, snapshotName);
    console.log("Snapshot created:", JSON.stringify(snap, null, 2));
    console.log(
      `\nSet BOXD_GOLDEN_SNAPSHOT=${snapshotName} in Vercel env to enable instant boots.`,
    );
  } finally {
    console.log(`Cleaning up builder VM ${machine.id}...`);
    await client.machines.delete(machine.id).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
