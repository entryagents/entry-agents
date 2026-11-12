import { describe, expect, test } from "bun:test";
import {
  buildDetachedSpawnScript,
  buildKillProcessScript,
  buildProcessStatusScript,
  ENTRY_PIDS_DIR,
} from "./process-registry.ts";
import { buildToolchainBootstrapScript } from "./toolchain.ts";

describe("process-registry", () => {
  test("buildDetachedSpawnScript uses setsid, nohup, disown, and writes pid/meta files", () => {
    const script = buildDetachedSpawnScript(
      "pnpm dev --port 3000",
      "cmd_123_abc",
      "/workspace",
    );
    expect(script).toContain(`mkdir -p ${ENTRY_PIDS_DIR}`);
    expect(script).toContain("setsid nohup bash -c");
    expect(script).toContain("disown -a");
    expect(script).toContain(`${ENTRY_PIDS_DIR}/cmd_123_abc.pid`);
    expect(script).toContain(`${ENTRY_PIDS_DIR}/cmd_123_abc.meta.json`);
    expect(script).toContain(`${ENTRY_PIDS_DIR}/cmd_123_abc.log`);
  });

  test("buildProcessStatusScript inspects registry and listening ports", () => {
    const script = buildProcessStatusScript("cmd_123_abc", 25);
    expect(script).toContain(`TARGET_ID="cmd_123_abc"`);
    expect(script).toContain("TAIL_LINES=25");
    expect(script).toContain("=== PROCESSES ===");
    expect(script).toContain("=== PORTS ===");
  });

  test("buildKillProcessScript handles both numeric PIDs and registered command IDs", () => {
    const pidScript = buildKillProcessScript("4242");
    expect(pidScript).toContain("PID=4242");
    expect(pidScript).toContain("kill -TERM");
    expect(pidScript).toContain("kill -KILL");

    const idScript = buildKillProcessScript("cmd_123_abc");
    expect(idScript).toContain(`PIDFILE="${ENTRY_PIDS_DIR}/cmd_123_abc.pid"`);
    expect(idScript).toContain("kill -TERM");
    expect(idScript).toContain("kill -KILL");
  });

  test("buildToolchainBootstrapScript is non-fatal and checks modern CLI tools", () => {
    const script = buildToolchainBootstrapScript();
    expect(script).toContain("set +e");
    expect(script).toContain("ripgrep");
    expect(script).toContain("jq");
    expect(script).toContain("tmux");
    expect(script).toContain("exit 0");
  });
});
