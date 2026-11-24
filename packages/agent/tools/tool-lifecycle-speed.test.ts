import { describe, expect, test } from "bun:test";
import type { Sandbox } from "@entry-agents/sandbox";
import { readFileTool } from "./read";
import { editFileTool, writeFileTool } from "./write";

const SIMULATED_RPC_DELAY_MS = 40;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createLatencyTrackedSandbox(initialFiles: Record<string, string>) {
  const files = new Map<string, string>(Object.entries(initialFiles));
  const rpcCounts = {
    exec: 0,
    stat: 0,
    access: 0,
    readFile: 0,
    writeFile: 0,
    mkdir: 0,
  };

  const sandbox = {
    workingDirectory: "/workspace",
    exec: async (cmd: string) => {
      rpcCounts.exec += 1;
      await delay(SIMULATED_RPC_DELAY_MS);
      const match = /realpath -- '([^']+)'/.exec(cmd);
      const target = match?.[1] ?? "";
      return {
        success: true,
        stdout: `${target}\n`,
        stderr: "",
        exitCode: 0,
      };
    },
    access: async (filePath: string) => {
      rpcCounts.access += 1;
      await delay(SIMULATED_RPC_DELAY_MS);
      if (!files.has(filePath)) {
        throw new Error(`ENOENT: ${filePath}`);
      }
    },
    stat: async (filePath: string) => {
      rpcCounts.stat += 1;
      await delay(SIMULATED_RPC_DELAY_MS);
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`ENOENT: ${filePath}`);
      }
      return {
        isDirectory: () => false,
        isFile: () => true,
        size: Buffer.byteLength(content, "utf-8"),
      };
    },
    readFile: async (filePath: string) => {
      rpcCounts.readFile += 1;
      await delay(SIMULATED_RPC_DELAY_MS);
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`ENOENT: ${filePath}`);
      }
      return content;
    },
    writeFile: async (filePath: string, content: string) => {
      rpcCounts.writeFile += 1;
      await delay(SIMULATED_RPC_DELAY_MS);
      files.set(filePath, content);
    },
    mkdir: async () => {
      rpcCounts.mkdir += 1;
      await delay(SIMULATED_RPC_DELAY_MS);
    },
  } as unknown as Sandbox;

  return { sandbox, files, rpcCounts };
}

describe("full-lifecycle tool speed and RPC reduction", () => {
  test("unread edit and no-op edit reject instantly with 0 sandbox RPCs", async () => {
    const { sandbox, rpcCounts } = createLatencyTrackedSandbox({
      "/workspace/src/app.ts": "export const x = 1;\n",
    });
    const edit = editFileTool();
    const ctx = {
      experimental_context: { sandbox, readFileState: new Map() },
      toolCallId: "tc-unread",
      messages: [],
    };

    const t0 = performance.now();
    const unreadResult = await edit.execute?.(
      {
        filePath: "src/app.ts",
        oldString: "x = 1",
        newString: "x = 2",
      },
      ctx,
    );
    const unreadMs = performance.now() - t0;

    expect(unreadResult).toMatchObject({ success: false, gate: "unread" });
    expect(unreadMs).toBeLessThan(SIMULATED_RPC_DELAY_MS / 2);
    expect(rpcCounts).toEqual({
      exec: 0,
      stat: 0,
      access: 0,
      readFile: 0,
      writeFile: 0,
      mkdir: 0,
    });

    const t1 = performance.now();
    const noopResult = await edit.execute?.(
      {
        filePath: "src/app.ts",
        oldString: "x = 1",
        newString: "x = 1",
      },
      ctx,
    );
    const noopMs = performance.now() - t1;

    expect(noopResult).toMatchObject({ success: false });
    expect(noopMs).toBeLessThan(SIMULATED_RPC_DELAY_MS / 2);
    expect(rpcCounts.exec).toBe(0);
    expect(rpcCounts.readFile).toBe(0);
  });

  test("needsApproval + execute caches realpath across read -> edit -> write lifecycle", async () => {
    const { sandbox, files, rpcCounts } = createLatencyTrackedSandbox({
      "/workspace/src/index.ts": "const greeting = 'hello';\n",
    });
    const readFileState = new Map<string, string>();
    const experimental_context = {
      sandbox,
      readFileState,
      permissionMode: "ask" as const,
    };

    const read = readFileTool();
    const edit = editFileTool();
    const write = writeFileTool();

    // 1. Read: needsApproval + execute should only run realpath ONCE (cached)
    const needsReadApproval =
      typeof read.needsApproval === "function"
        ? await read.needsApproval(
            { filePath: "src/index.ts" },
            { experimental_context, toolCallId: "tc-r1", messages: [] },
          )
        : false;
    expect(needsReadApproval).toBe(false);
    expect(rpcCounts.exec).toBe(1);

    const readRes = await read.execute?.(
      { filePath: "src/index.ts" },
      { experimental_context, toolCallId: "tc-r1", messages: [] },
    );
    expect(readRes).toMatchObject({ success: true });
    expect(rpcCounts.exec).toBe(1); // Cached from needsApproval!

    // 2. Edit: needsApproval + execute reuses cached realpath (still 1 total exec!)
    const needsEditApproval =
      typeof edit.needsApproval === "function"
        ? await edit.needsApproval(
            {
              filePath: "src/index.ts",
              oldString: "'hello'",
              newString: "'world'",
            },
            { experimental_context, toolCallId: "tc-e1", messages: [] },
          )
        : false;
    expect(needsEditApproval).toBe(false);
    expect(rpcCounts.exec).toBe(1);

    const editRes = await edit.execute?.(
      {
        filePath: "src/index.ts",
        oldString: "'hello'",
        newString: "'world'",
      },
      { experimental_context, toolCallId: "tc-e1", messages: [] },
    );
    expect(editRes).toMatchObject({ success: true });
    expect(rpcCounts.exec).toBe(1);
    expect(files.get("/workspace/src/index.ts")).toBe(
      "const greeting = 'world';\n",
    );

    // 3. Write new file: 0 stat RPCs (pre-read stat & post-write stat eliminated), exact UTF-8 byte count
    const statCountBeforeWrite = rpcCounts.stat;
    const unicodeContent = "export const emoji = '✓ café';\n";
    const writeRes = await write.execute?.(
      { filePath: "src/new-file.ts", content: unicodeContent },
      { experimental_context, toolCallId: "tc-w1", messages: [] },
    );
    expect(writeRes).toMatchObject({
      success: true,
      bytesWritten: Buffer.byteLength(unicodeContent, "utf-8"),
    });
    expect(rpcCounts.stat).toBe(statCountBeforeWrite);
  });

  test("write on unread existing file fails fast with File already exists and 0 readFile RPCs", async () => {
    const { sandbox, rpcCounts } = createLatencyTrackedSandbox({
      "/workspace/src/existing.ts": "export const large = true;\n".repeat(1000),
    });
    const experimental_context = {
      sandbox,
      readFileState: new Map<string, string>(),
    };

    const write = writeFileTool();
    const res = await write.execute?.(
      { filePath: "src/existing.ts", content: "overwrite attempt" },
      { experimental_context, toolCallId: "tc-w-exists", messages: [] },
    );

    expect(res).toMatchObject({
      success: false,
      gate: "unread",
    });
    expect((res as { error?: string } | undefined)?.error).toContain(
      "File already exists",
    );
    expect(rpcCounts.readFile).toBe(0);
    expect(rpcCounts.writeFile).toBe(0);
  });
});
