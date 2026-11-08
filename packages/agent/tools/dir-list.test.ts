import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { dirListTool, type DirEntry } from "./dir-list";

type DirListOutput = {
  success: boolean;
  path?: string;
  entries: DirEntry[];
  truncated?: boolean;
  totalFound?: number;
  error?: string;
};

type ToolWithExecute = {
  execute: (
    input: {
      path: string;
      recursive?: boolean;
      showHidden?: boolean;
      limit?: number;
    },
    options: { experimental_context: unknown },
  ) => Promise<DirListOutput>;
};

describe("dirListTool", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      tempDir = undefined;
    }
  });

  async function createFixture() {
    tempDir = await mkdtemp(path.join(tmpdir(), "dir-list-test-"));
    await mkdir(path.join(tempDir, "src", "components"), { recursive: true });
    await mkdir(path.join(tempDir, ".hidden-dir"), { recursive: true });

    await writeFile(path.join(tempDir, "package.json"), '{"name":"test"}');
    await writeFile(path.join(tempDir, "README.md"), "# Hello");
    await writeFile(path.join(tempDir, ".env"), "SECRET=123");
    await writeFile(
      path.join(tempDir, "src", "index.ts"),
      'console.log("hi");',
    );
    await writeFile(
      path.join(tempDir, "src", "components", "button.tsx"),
      "export const Button = () => null;",
    );

    const sandbox = {
      type: "local" as const,
      workingDirectory: tempDir,
      async readdir(dirPath: string) {
        const { readdir } = await import("node:fs/promises");
        return readdir(dirPath, { withFileTypes: true });
      },
      async stat(targetPath: string) {
        const { stat } = await import("node:fs/promises");
        return stat(targetPath);
      },
    };

    return { sandbox, tempDir };
  }

  test("lists entries with directories first and hides dotfiles by default", async () => {
    const { sandbox } = await createFixture();
    const tool = dirListTool();

    const result = await (tool as unknown as ToolWithExecute).execute(
      { path: "." },
      { experimental_context: { sandbox } },
    );

    expect(result.success).toBe(true);
    expect(result.path).toBe(".");
    expect(result.entries.length).toBe(3); // src (dir), package.json (file), README.md (file)

    const entryNames = result.entries.map((e) => e.name);
    expect(entryNames).toContain("src");
    expect(entryNames).toContain("package.json");
    expect(entryNames).toContain("README.md");
    expect(entryNames).not.toContain(".env");
    expect(entryNames).not.toContain(".hidden-dir");

    // Directories first
    expect(result.entries[0]?.type).toBe("directory");
    expect(result.entries[0]?.name).toBe("src");
  });

  test("includes hidden files when showHidden is true", async () => {
    const { sandbox } = await createFixture();
    const tool = dirListTool();

    const result = await (tool as unknown as ToolWithExecute).execute(
      { path: ".", showHidden: true },
      { experimental_context: { sandbox } },
    );

    expect(result.success).toBe(true);
    const entryNames = result.entries.map((e) => e.name);
    expect(entryNames).toContain(".env");
    expect(entryNames).toContain(".hidden-dir");
  });

  test("lists subdirectory contents", async () => {
    const { sandbox } = await createFixture();
    const tool = dirListTool();

    const result = await (tool as unknown as ToolWithExecute).execute(
      { path: "src" },
      { experimental_context: { sandbox } },
    );

    expect(result.success).toBe(true);
    const entryNames = result.entries.map((e) => e.name);
    expect(entryNames).toContain("components");
    expect(entryNames).toContain("index.ts");
  });

  test("recursively lists subdirectories when recursive is true", async () => {
    const { sandbox } = await createFixture();
    const tool = dirListTool();

    const result = await (tool as unknown as ToolWithExecute).execute(
      { path: "src", recursive: true },
      { experimental_context: { sandbox } },
    );

    expect(result.success).toBe(true);
    const entryPaths = result.entries.map((e) => e.path);
    expect(entryPaths).toContain("src/components");
    expect(entryPaths).toContain("src/components/button.tsx");
    expect(entryPaths).toContain("src/index.ts");
  });

  test("returns clear error when path is a file, not a directory", async () => {
    const { sandbox } = await createFixture();
    const tool = dirListTool();

    const result = await (tool as unknown as ToolWithExecute).execute(
      { path: "package.json" },
      { experimental_context: { sandbox } },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("is a file, not a directory");
  });

  test("returns clear error when path does not exist", async () => {
    const { sandbox } = await createFixture();
    const tool = dirListTool();

    const result = await (tool as unknown as ToolWithExecute).execute(
      { path: "nonexistent-folder" },
      { experimental_context: { sandbox } },
    );

    expect(result.success).toBe(false);
  });
});
