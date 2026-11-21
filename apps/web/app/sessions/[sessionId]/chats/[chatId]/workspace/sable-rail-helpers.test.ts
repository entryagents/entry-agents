import { describe, expect, test } from "bun:test";
import {
  computeDeviceStage,
  detectPackageRunner,
  formatScriptCommand,
  highlightSegments,
  normalizeBrowserAddress,
  parseAddressParts,
  parsePackageJsonScripts,
  splitFileSegments,
  toChangeLetter,
} from "./sable-rail-helpers";

describe("sable-rail-helpers", () => {
  test("toChangeLetter maps statuses to monochrome letters", () => {
    expect(toChangeLetter("added")).toBe("A");
    expect(toChangeLetter("modified")).toBe("M");
    expect(toChangeLetter("deleted")).toBe("D");
    expect(toChangeLetter("renamed")).toBe("R");
    expect(toChangeLetter(undefined)).toBeUndefined();
  });

  test("highlightSegments highlights all case-insensitive matches", () => {
    expect(highlightSegments("WorkspacePanel.tsx", "panel")).toEqual([
      { text: "Workspace", match: false },
      { text: "Panel", match: true },
      { text: ".tsx", match: false },
    ]);
    expect(highlightSegments("foo.ts", "")).toEqual([
      { text: "foo.ts", match: false },
    ]);
  });

  test("splitFileSegments separates parent dirs from fileName", () => {
    expect(splitFileSegments("apps/web/components/Button.tsx")).toEqual({
      segments: ["apps", "web", "components", "Button.tsx"],
      dirParts: ["apps", "web", "components"],
      fileName: "Button.tsx",
    });
    expect(splitFileSegments("package.json")).toEqual({
      segments: ["package.json"],
      dirParts: [],
      fileName: "package.json",
    });
  });

  test("normalizeBrowserAddress handles localhost, bare domains, and rejects unsafe schemes", () => {
    expect(normalizeBrowserAddress("localhost:3000")).toBe(
      "http://localhost:3000/",
    );
    expect(normalizeBrowserAddress("127.0.0.1:5173/app")).toBe(
      "http://127.0.0.1:5173/app",
    );
    expect(normalizeBrowserAddress("example.com/docs")).toBe(
      "https://example.com/docs",
    );
    expect(normalizeBrowserAddress(`${"java"}script:alert(1)`)).toBeNull();
    expect(normalizeBrowserAddress("data:text/html,hi")).toBeNull();
    expect(normalizeBrowserAddress("   ")).toBeNull();
  });

  test("parseAddressParts splits host and non-root path cleanly", () => {
    expect(parseAddressParts("https://preview.example.com/")).toEqual({
      host: "preview.example.com",
      path: "",
      isLocal: false,
      secure: true,
    });
    expect(parseAddressParts("http://localhost:3000/login?next=%2F")).toEqual({
      host: "localhost:3000",
      path: "/login?next=%2F",
      isLocal: true,
      secure: false,
    });
  });

  test("computeDeviceStage scales tablet and phone frames inside narrow mobile containers", () => {
    expect(
      computeDeviceStage({
        device: "desktop",
        containerWidth: 400,
        containerHeight: 700,
      }),
    ).toBeNull();

    const tabletInNarrow = computeDeviceStage({
      device: "tablet",
      containerWidth: 420,
      containerHeight: 720,
    });
    expect(tabletInNarrow).not.toBeNull();
    expect(tabletInNarrow?.width).toBe(768);
    expect(tabletInNarrow?.scale).toBeLessThan(1);
    expect(tabletInNarrow?.pct).toBe(Math.round(((420 - 24) / 768) * 100));

    const phoneInWide = computeDeviceStage({
      device: "phone",
      containerWidth: 600,
      containerHeight: 900,
    });
    expect(phoneInWide?.scale).toBe(1);
    expect(phoneInWide?.pct).toBe(100);
  });

  test("parsePackageJsonScripts and detectPackageRunner extract scripts accurately", () => {
    expect(
      parsePackageJsonScripts(
        JSON.stringify({
          name: "demo",
          scripts: { dev: "next dev", build: "next build", empty: "" },
        }),
      ),
    ).toEqual([
      { name: "dev", command: "next dev" },
      { name: "build", command: "next build" },
    ]);
    expect(parsePackageJsonScripts("{bad")).toEqual([]);
    expect(detectPackageRunner(["package.json", "bun.lock"])).toBe("bun");
    expect(detectPackageRunner(["package.json", "pnpm-lock.yaml"])).toBe(
      "pnpm",
    );
    expect(formatScriptCommand("pnpm", "dev")).toBe("pnpm dev");
    expect(formatScriptCommand("npm", "test")).toBe("npm run test");
  });
});
