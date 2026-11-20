import { describe, expect, it } from "bun:test";
import {
  isBuiltinRailTab,
  RAIL_TABS,
  railTabAt,
  railTabShortcut,
} from "./rail-tabs";

describe("rail-tabs", () => {
  it("defines the 7 Sable rail tabs in shortcut order", () => {
    expect(RAIL_TABS.map((t) => t.id)).toEqual([
      "review",
      "files",
      "preview",
      "terminal",
      "tasks",
      "context",
      "agents",
    ]);
  });

  it("identifies built-in rail tabs vs file paths", () => {
    for (const tab of RAIL_TABS) {
      expect(isBuiltinRailTab(tab.id)).toBe(true);
    }
    expect(isBuiltinRailTab("src/index.ts")).toBe(false);
    expect(isBuiltinRailTab("")).toBe(false);
  });

  it("maps Alt+1 through Alt+7 shortcuts", () => {
    expect(railTabShortcut("review")).toBe("Alt+1");
    expect(railTabShortcut("files")).toBe("Alt+2");
    expect(railTabShortcut("preview")).toBe("Alt+3");
    expect(railTabShortcut("terminal")).toBe("Alt+4");
    expect(railTabShortcut("tasks")).toBe("Alt+5");
    expect(railTabShortcut("context")).toBe("Alt+6");
    expect(railTabShortcut("agents")).toBe("Alt+7");

    expect(railTabAt(1)).toBe("review");
    expect(railTabAt(7)).toBe("agents");
    expect(railTabAt(0)).toBeUndefined();
    expect(railTabAt(8)).toBeUndefined();
  });
});
