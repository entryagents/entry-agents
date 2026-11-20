import { describe, expect, it } from "bun:test";
import { TurnLoopGuard } from "./loop-guard";

describe("TurnLoopGuard", () => {
  it("catches alternating A/B/A/B/A/B tool-call loops and breaks cleanly", () => {
    const guard = new TurnLoopGuard();
    const a = [
      { toolName: "bash", signature: 'bash:{"command":"ls /workspace"}' },
    ];
    const b = [{ toolName: "bash", signature: 'bash:{"command":"ls ."}' }];

    expect(guard.recordStep(a).action).toBe("continue");
    expect(guard.recordStep(b).action).toBe("continue");
    expect(guard.recordStep(a).action).toBe("continue");
    expect(guard.recordStep(b).action).toBe("continue");
    // 3rd occurrence of A triggers warn
    expect(guard.recordStep(a).action).toBe("warn");
    // 4th occurrence of A after warn triggers break
    expect(guard.recordStep(a).action).toBe("break");
  });

  it("catches 12+ consecutive read-only exploration steps", () => {
    const guard = new TurnLoopGuard();
    for (let i = 0; i < 11; i++) {
      expect(
        guard.recordStep([
          { toolName: "grep", signature: `grep:{"pattern":"p${i}"}` },
        ]).action,
      ).toBe("continue");
    }
    expect(
      guard.recordStep([
        { toolName: "grep", signature: 'grep:{"pattern":"p11"}' },
      ]).action,
    ).toBe("warn");
  });
});
