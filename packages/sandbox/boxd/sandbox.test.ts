import { describe, expect, test } from "bun:test";
import type { Boxd } from "@boxd-sh/sdk";
import { BoxdSandbox } from "./sandbox.ts";

function createFakeBoxdClient() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let checkpointListStatus: "pending" | "ready" | "failed" = "ready";

  const client = {
    snapshots: {
      create: async (machineId: string, name: string) => {
        calls.push({ method: "snapshots.create", args: [machineId, name] });
        return { id: "snap_1", name };
      },
      get: async (name: string) => {
        calls.push({ method: "snapshots.get", args: [name] });
        return { id: "snap_1", name, status: "ready" };
      },
    },
    machines: {
      get: async (machineId: string) => {
        calls.push({ method: "machines.get", args: [machineId] });
        return {
          id: machineId,
          name: "entry-test",
          status: "running",
          resources: {
            vcpu: 4,
            memoryBytes: 8 * 1024 * 1024 * 1024,
            diskBytes: 100 * 1024 * 1024 * 1024,
          },
          access: {
            url: "https://entry-test.boxd.sh",
            desktopUrl: "https://app.boxd.sh/desktop/entry-test",
            sshPort: 2222,
          },
          egressAllow: ["api.github.com"],
          bootTimeMs: 420,
        };
      },
      waitUntilReady: async (machineId: string) => {
        calls.push({ method: "machines.waitUntilReady", args: [machineId] });
      },
      resize: async (
        machineId: string,
        params: { vcpu?: number; memory?: string },
      ) => {
        calls.push({ method: "machines.resize", args: [machineId, params] });
        return {
          vcpu: params.vcpu ?? 4,
          memoryBytes: 16 * 1024 * 1024 * 1024,
          rebooted: true,
        };
      },
      fork: async (
        machineId: string,
        params: { name?: string; isolated?: boolean },
      ) => {
        calls.push({ method: "machines.fork", args: [machineId, params] });
        return {
          id: "vm_fork_1",
          name: params.name ?? "entry-fork",
          access: { url: "https://entry-fork.boxd.sh" },
        };
      },
      setEgressAllow: async (machineId: string, entries: string[]) => {
        calls.push({
          method: "machines.setEgressAllow",
          args: [machineId, entries],
        });
        return entries;
      },
      logs: async function* (machineId: string, params: { follow: boolean }) {
        calls.push({ method: "machines.logs", args: [machineId, params] });
        const encoder = new TextEncoder();
        yield encoder.encode("boot line 1\n");
        yield encoder.encode("boot line 2\n");
      },
      checkpoints: {
        create: async (machineId: string, name: string) => {
          calls.push({ method: "checkpoints.create", args: [machineId, name] });
          return { id: "cp_1", name, status: "pending" };
        },
        list: async (machineId: string) => {
          calls.push({ method: "checkpoints.list", args: [machineId] });
          return [
            {
              id: "cp_1",
              name: "before-refactor",
              status: checkpointListStatus,
              sizeBytes: 2048,
              createdAt: new Date("2026-11-18T00:00:00.000Z"),
              available: checkpointListStatus === "ready",
            },
          ];
        },
        restore: async (machineId: string, name: string) => {
          calls.push({
            method: "checkpoints.restore",
            args: [machineId, name],
          });
        },
        delete: async (machineId: string, name: string) => {
          calls.push({ method: "checkpoints.delete", args: [machineId, name] });
        },
      },
      ports: {
        expose: async (
          machineId: string,
          port: number,
          params?: { protocol?: "tcp" | "udp" | "both" },
        ) => {
          calls.push({
            method: "ports.expose",
            args: [machineId, port, params],
          });
          return {
            machinePort: port,
            publicPort: 40001,
            protocol: params?.protocol ?? "tcp",
            dns: "proxy.boxd.sh",
          };
        },
        unexpose: async (machineId: string, port: number) => {
          calls.push({ method: "ports.unexpose", args: [machineId, port] });
          return {
            machinePort: port,
            publicPort: 40001,
            protocol: "tcp",
            dns: "proxy.boxd.sh",
          };
        },
        list: async (machineId: string) => {
          calls.push({ method: "ports.list", args: [machineId] });
          return [
            {
              machinePort: 5432,
              publicPort: 40001,
              protocol: "tcp",
              dns: "proxy.boxd.sh",
            },
          ];
        },
      },
      proxies: {
        list: async (machineId: string) => {
          calls.push({ method: "proxies.list", args: [machineId] });
          return [
            {
              name: "api",
              domain: "api.entry-test.boxd.sh",
              port: 4000,
              portMode: "locked",
              isDefault: false,
            },
          ];
        },
        create: async (machineId: string, name: string, port: number) => {
          calls.push({
            method: "proxies.create",
            args: [machineId, name, port],
          });
          return { name, port };
        },
        setPort: async (
          machineId: string,
          port: number | "auto",
          params?: { name?: string },
        ) => {
          calls.push({
            method: "proxies.setPort",
            args: [machineId, port, params],
          });
        },
      },
      files: {
        mkdir: async (machineId: string, path: string) => {
          calls.push({ method: "files.mkdir", args: [machineId, path] });
        },
      },
      exec: async () => ({
        stdout: "",
        stderr: "",
        exitCode: 0,
        success: true,
      }),
    },
    close: async () => {
      calls.push({ method: "close", args: [] });
    },
  };

  return {
    client: client as unknown as Boxd,
    calls,
    setCheckpointStatus: (status: "pending" | "ready" | "failed") => {
      checkpointListStatus = status;
    },
  };
}

describe("BoxdSandbox capabilities", () => {
  test("creates native snapshots and checkpoints, and waits for readiness on restore", async () => {
    const { client, calls } = createFakeBoxdClient();
    const sandbox = new BoxdSandbox(client, "vm_1", "entry-test");

    const snap = await sandbox.snapshot();
    expect(snap.snapshotId).toStartWith("snap-entry-test-");

    const cp = await sandbox.createCheckpoint("Before Refactor!");
    expect(cp).toMatchObject({
      id: "cp_1",
      name: "before-refactor",
      status: "ready",
    });

    await sandbox.restoreCheckpoint("before-refactor");
    await sandbox.deleteCheckpoint("before-refactor");

    expect(calls.map((c) => c.method)).toContain("snapshots.create");
    expect(calls.map((c) => c.method)).toContain("checkpoints.restore");
    expect(calls.map((c) => c.method)).toContain("machines.waitUntilReady");
    expect(calls.map((c) => c.method)).toContain("checkpoints.delete");
  });

  test("manages raw TCP/UDP ports and HTTPS proxy routes including auto mode", async () => {
    const { client, calls } = createFakeBoxdClient();
    const sandbox = new BoxdSandbox(client, "vm_1", "entry-test");

    const raw = await sandbox.exposePort(5432, "tcp");
    expect(raw).toEqual({
      machinePort: 5432,
      publicPort: 40001,
      protocol: "tcp",
      dns: "proxy.boxd.sh",
    });

    const autoRoute = await sandbox.exposeProxy("auto");
    expect(autoRoute).toEqual({
      url: "https://entry-test.boxd.sh",
      port: "auto",
    });

    const namedRoute = await sandbox.exposeProxy(8080, "docs");
    expect(namedRoute).toEqual({
      url: "https://docs.entry-test.boxd.sh",
      port: 8080,
      name: "docs",
    });
    expect(sandbox.domain(8080)).toBe("https://p8080.entry-test.boxd.sh");

    await sandbox.unexposePort(5432);
    const rawList = await sandbox.listExposedPorts();
    const proxyList = await sandbox.listProxies();
    expect(rawList).toHaveLength(1);
    expect(proxyList).toHaveLength(1);
    expect(calls.map((c) => c.method)).toContain("proxies.create");
  });

  test("enforces isolated: true when forking, caps logs, resizes cleanly, and updates egress allowlist", async () => {
    const { client, calls } = createFakeBoxdClient();
    const sandbox = new BoxdSandbox(client, "vm_1", "entry-test");

    const logs = await sandbox.getLogs(10);
    expect(logs).toBe("ot line 2\n");

    const resized = await sandbox.resize({ vcpu: 8, memory: "16G" });
    expect(resized).toMatchObject({ vcpu: 8, rebooted: true });
    expect(calls.map((c) => c.method)).toContain("machines.waitUntilReady");

    const forked = await sandbox.fork("My Fork Test!");
    expect(forked).toEqual({
      machineId: "vm_fork_1",
      machineName: "my-fork-test",
      url: "https://entry-fork.boxd.sh",
    });
    const forkCall = calls.find((c) => c.method === "machines.fork");
    expect(forkCall?.args[1]).toEqual({ name: "my-fork-test", isolated: true });

    const allow = await sandbox.setEgressAllow(["api.github.com"]);
    expect(allow).toEqual(["api.github.com"]);

    const info = await sandbox.getInfo();
    expect(info).toMatchObject({
      status: "running",
      vcpu: 4,
      url: "https://entry-test.boxd.sh",
      sshPort: 2222,
    });
  });

  test("rejects checkpoint restore when checkpoint failed", async () => {
    const { client, setCheckpointStatus } = createFakeBoxdClient();
    setCheckpointStatus("failed");
    const sandbox = new BoxdSandbox(client, "vm_1", "entry-test");

    await expect(sandbox.restoreCheckpoint("before-refactor")).rejects.toThrow(
      "failed",
    );
  });

  test("execDetached spawns on persistent VMs and fails fast on legacy ubuntu container images", async () => {
    const { client } = createFakeBoxdClient();
    const vmSandbox = new BoxdSandbox(
      client,
      "vm_1",
      "entry-test",
      undefined,
      "boxd.sh",
      new Set(),
      false,
    );
    const spawned = await vmSandbox.execDetached("npm run dev", "/tmp");
    expect(spawned.commandId).toStartWith("cmd_");

    const legacySandbox = new BoxdSandbox(
      client,
      "vm_legacy",
      "entry-legacy",
      undefined,
      "boxd.sh",
      new Set(),
      true,
    );
    await expect(
      legacySandbox.execDetached("npm run dev", "/tmp"),
    ).rejects.toThrow(/legacy container image/i);
  });
});
