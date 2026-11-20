import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isBuiltinRailTab,
  RAIL_TABS,
  railTabAt,
  railTabShortcut,
} from "./rail-tabs";

const here = dirname(fileURLToPath(import.meta.url));

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

describe("sable rail visibility and interaction contracts", () => {
  it("binds active panes with data-active and puts data-dir on rail-body matching rail.css", () => {
    const panelSrc = readFileSync(join(here, "workspace-panel.tsx"), "utf8");
    const cssSrc = readFileSync(join(here, "rail.css"), "utf8");

    expect(panelSrc).toContain('className="rail-body" data-dir={dir}');
    expect(panelSrc).toContain('data-active={isActive ? "" : undefined}');
    expect(panelSrc).toContain('role="tabpanel" data-active=""');
    expect(panelSrc).not.toContain('data-on={isActive ? "" : undefined}');

    expect(cssSrc).toContain(".sable-rail .rail-pane[data-active]");
    expect(cssSrc).toContain(
      '.sable-rail .rail-body[data-dir="back"] > .rail-pane[data-active]',
    );
    expect(cssSrc).toContain(".sable-rail .rail-btn");
    expect(cssSrc).toContain("--ink:");
    expect(cssSrc).toContain("--surface:");
  });

  it("keeps all visited panes mounted and code-splits heavy tab modules", () => {
    const panelSrc = readFileSync(join(here, "workspace-panel.tsx"), "utf8");

    expect(panelSrc).toContain(
      "const shouldRender = isActive || mountedPanes.has(def.id);",
    );
    expect(panelSrc).toContain('import("./workspace-review-tab")');
    expect(panelSrc).toContain('import("./workspace-preview-tab")');
    expect(panelSrc).toContain('import("./workspace-terminal-tab")');
    expect(panelSrc).toContain('import("./workspace-file-tab")');
  });

  it("does not nest TooltipTrigger around DropdownMenuTrigger on the More menu", () => {
    const tabsSrc = readFileSync(join(here, "workspace-rail-tabs.tsx"), "utf8");

    expect(tabsSrc).not.toMatch(/<TooltipTrigger[^>]*>\s*<DropdownMenuTrigger/);
    expect(tabsSrc).toContain("<DropdownMenuTrigger asChild>");
  });
});
