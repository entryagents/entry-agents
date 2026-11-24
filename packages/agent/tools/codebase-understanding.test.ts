import { describe, expect, test } from "bun:test";
import { detectSpecializedToolHint } from "./bash";
import { globToRegExp } from "./glob";
import { normalizePerlShorthandsForEre } from "./grep";

describe("codebase understanding & tool discipline", () => {
  test("globToRegExp accurately matches multi-segment directory globs", () => {
    const chatComponents = globToRegExp("**/chat/*.tsx");
    expect(
      chatComponents.test("apps/web/components/chat/sable-turn-view.tsx"),
    ).toBe(true);
    expect(chatComponents.test("chat/index.tsx")).toBe(true);
    expect(chatComponents.test("apps/web/components/inbox-sidebar.tsx")).toBe(
      false,
    );
    expect(chatComponents.test("apps/web/components/chat/nested/foo.tsx")).toBe(
      false,
    );

    const pkgTools = globToRegExp("packages/*/tools/*.ts");
    expect(pkgTools.test("packages/agent/tools/grep.ts")).toBe(true);
    expect(pkgTools.test("packages/sandbox/toolchain.ts")).toBe(false);
    expect(
      pkgTools.test("packages/agent/context-management/auto-compact.ts"),
    ).toBe(false);

    const bracePattern = globToRegExp("src/**/*.{ts,tsx}");
    expect(bracePattern.test("src/app.ts")).toBe(true);
    expect(bracePattern.test("src/ui/button.tsx")).toBe(true);
    expect(bracePattern.test("src/ui/button.css")).toBe(false);
  });

  test("normalizePerlShorthandsForEre converts \\d, \\w, \\s to POSIX ERE safely", () => {
    expect(normalizePerlShorthandsForEre("timeout.*\\d+")).toBe(
      "timeout.*[0-9]+",
    );
    expect(normalizePerlShorthandsForEre("export\\s+function\\s+\\w+")).toBe(
      "export[[:space:]]+function[[:space:]]+[[:alnum:]_]+",
    );
    // Preserves escaped backslashes and bracket expressions
    expect(normalizePerlShorthandsForEre("\\\\d")).toBe("\\\\d");
    expect(normalizePerlShorthandsForEre("[a-z\\d]+")).toBe("[a-z\\d]+");
  });

  test("detectSpecializedToolHint flags standalone read/search/list bash commands but ignores pipelines", () => {
    expect(detectSpecializedToolHint("cat src/index.ts")).toContain("`read`");
    expect(detectSpecializedToolHint("head -n 40 src/index.ts")).toContain(
      "`read`",
    );
    expect(detectSpecializedToolHint("grep -rn foo src")).toContain("`grep`");
    expect(detectSpecializedToolHint("rg foo src")).toContain("`grep`");
    expect(detectSpecializedToolHint("find . -name '*.ts'")).toContain(
      "`glob`",
    );
    expect(detectSpecializedToolHint("ls -la apps/web")).toContain(
      "`dir_list`",
    );

    // Intentional shell pipelines/chains or non-discovery commands should not be flagged
    expect(detectSpecializedToolHint("cat src/index.ts | wc -l")).toBeNull();
    expect(detectSpecializedToolHint("pnpm run ci")).toBeNull();
    expect(detectSpecializedToolHint("git status")).toBeNull();
  });
});
