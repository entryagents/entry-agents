/** boxd's smallest machine class: exactly 1 vCPU and 4 GiB RAM. */
export const BOXD_VCPU = 1;
export const BOXD_MEMORY = "4G" as const;
export const BOXD_DISK = "100G" as const;

export type BoxdMemorySize = "4G" | "8G" | "16G";

export interface BoxdMachineSize {
  vcpu: 1 | 2 | 4;
  memory: BoxdMemorySize;
}

/**
 * Boxd only accepts matching size classes: 1 vCPU / 4G, 2 vCPU / 8G, or 4 vCPU / 16G.
 * Any mismatched pair is refused by the Boxd API.
 */
export function resolveBoxdMachineSize(vcpus?: number): BoxdMachineSize {
  if (typeof vcpus === "number" && Number.isFinite(vcpus)) {
    if (vcpus >= 4) {
      return { vcpu: 4, memory: "16G" };
    }
    if (vcpus >= 2) {
      return { vcpu: 2, memory: "8G" };
    }
  }
  return { vcpu: BOXD_VCPU, memory: BOXD_MEMORY };
}

// boxd machines run as an unprivileged user. `/` is root-owned, so a
// top-level `/workspace` cannot be created reliably across base images.
// `/tmp` is writable by the runtime user and lives on the machine disk.
export const BOXD_WORKING_DIRECTORY = "/tmp/entry-workspace";

export function isBoxdConfigured(): boolean {
  return Boolean(process.env.BOXD_API_KEY || process.env.BOXD_TOKEN);
}
