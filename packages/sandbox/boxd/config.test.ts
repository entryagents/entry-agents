import { describe, expect, test } from "bun:test";
import { BOXD_MEMORY, BOXD_VCPU, resolveBoxdMachineSize } from "./config.ts";

describe("resolveBoxdMachineSize", () => {
  test("defaults to 1 vCPU / 4G memory when vcpus is omitted", () => {
    expect(resolveBoxdMachineSize()).toEqual({
      vcpu: BOXD_VCPU,
      memory: BOXD_MEMORY,
    });
  });

  test("maps 2 vCPUs to Boxd 2vCPU / 8G class", () => {
    expect(resolveBoxdMachineSize(2)).toEqual({
      vcpu: 2,
      memory: "8G",
    });
  });

  test("maps 4+ vCPUs to Boxd 4vCPU / 16G class", () => {
    expect(resolveBoxdMachineSize(4)).toEqual({
      vcpu: 4,
      memory: "16G",
    });
  });
});
