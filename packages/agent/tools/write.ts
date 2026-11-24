import { tool } from "ai";
import { z } from "zod";
import * as path from "path";
import { getSandbox, toDisplayPath } from "./utils";
import {
  checkReadGate,
  currentFileHash,
  ensureReadFileState,
} from "./read-state";
import {
  isDotEnvFilePath,
  isSensitiveDotEnvPath,
  resolveSandboxRealPath,
  resolveWorkspacePath,
} from "./path-security";

const writeInputSchema = z.object({
  filePath: z
    .string()
    .describe(
      "Workspace-relative path to the file to write (e.g., src/user.test.ts)",
    ),
  content: z.string().describe("Content to write to the file"),
});

const editInputSchema = z.object({
  filePath: z
    .string()
    .describe(
      "Workspace-relative path to the file to edit (e.g., src/auth.ts)",
    ),
  oldString: z.string().describe("The exact text to replace"),
  newString: z
    .string()
    .describe("The text to replace it with (must differ from oldString)"),
  replaceAll: z
    .boolean()
    .optional()
    .describe("Replace all occurrences. Default: false"),
  startLine: z
    .number()
    .optional()
    .describe("Line number where oldString starts (for diff display)"),
});

export const writeFileTool = () =>
  tool({
    needsApproval: async ({ filePath }, { experimental_context }) => {
      if (
        (
          experimental_context as
            | { permissionMode?: "ask" | "autoAccept" | "fullAccess" }
            | undefined
        )?.permissionMode === "fullAccess"
      ) {
        return false;
      }

      if (isDotEnvFilePath(filePath)) {
        return true;
      }

      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "write");
      } catch {
        return false;
      }
      const workingDirectory = sandbox.workingDirectory;
      const absolutePath = resolveWorkspacePath(filePath, workingDirectory);
      if (!absolutePath) {
        return false;
      }

      const realPath = await resolveSandboxRealPath({
        sandbox,
        absolutePath,
        workingDirectory,
      });

      return isSensitiveDotEnvPath({
        requestedPath: filePath,
        absolutePath,
        realPath,
      });
    },
    description: `Write content to a file on the filesystem.

WHEN TO USE:
- Creating a new file that does not yet exist
- Completely replacing the contents of an existing file after you've read it
- Generating code or configuration as part of an implementation task

WHEN NOT TO USE:
- Small or localized changes to an existing file (prefer editFileTool instead)
- Reading files (use readFileTool instead)
- Searching (use grepTool or globTool instead)

USAGE:
- Use workspace-relative paths (e.g., "src/user.test.ts")
- This will OVERWRITE existing files entirely
- Parent directories are created automatically if they do not exist

IMPORTANT:
- ALWAYS read an existing file with readFileTool before overwriting it
- Prefer editing existing files over creating new ones unless a new file is explicitly needed
- NEVER proactively create documentation files (e.g., *.md) unless the user explicitly requests them
- Do not write files that contain secrets or credentials (API keys, passwords, .env, etc.)

EXAMPLES:
- Create a new test file: filePath: "src/user.test.ts", content: "<full file contents>"
- Replace a script after reading it: filePath: "scripts/build.sh", content: "<entire updated script>"`,
    inputSchema: writeInputSchema,
    execute: async ({ filePath, content }, { experimental_context }) => {
      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "write");
      } catch (error) {
        return {
          success: false,
          error: `Sandbox is unavailable (${error instanceof Error ? error.message : String(error)}). Cannot write file.`,
        };
      }
      const workingDirectory = sandbox.workingDirectory;

      try {
        const absolutePath = resolveWorkspacePath(filePath, workingDirectory);
        if (!absolutePath) {
          return {
            success: false,
            error: "Path must stay within the workspace.",
          };
        }

        // Read gate (read-state.ts): creating a new file is free, whereas
        // targeting an existing file the model has never read must fail fast
        // with a clear "File already exists" error without downloading the
        // entire file over remote sandbox RPC.
        const readState = ensureReadFileState(
          (experimental_context ?? {}) as { readFileState?: unknown },
        );
        const displayPath = toDisplayPath(absolutePath, workingDirectory);
        const preflightGate = checkReadGate(
          readState,
          displayPath,
          "",
          "write",
        );
        const hasPriorRead =
          preflightGate.ok || preflightGate.reason === "stale";

        if (!hasPriorRead) {
          const checkExists = async (): Promise<boolean> => {
            if (typeof sandbox.access === "function") {
              return sandbox
                .access(absolutePath)
                .then(() => true)
                .catch(() => false);
            }
            return sandbox
              .stat(absolutePath)
              .then(() => true)
              .catch(() => false);
          };

          const [realPath, fileExists] = await Promise.all([
            resolveSandboxRealPath({
              sandbox,
              absolutePath,
              workingDirectory,
            }),
            checkExists(),
          ]);
          if (realPath && !resolveWorkspacePath(realPath, workingDirectory)) {
            return {
              success: false,
              error: "Path resolves outside the workspace.",
            };
          }
          if (fileExists) {
            return {
              success: false,
              error: `File already exists (${displayPath}). Use the read tool to inspect it and the edit tool to modify it, or read it first before overwriting with write.`,
              gate: "unread",
            };
          }
        } else {
          const [realPath, existingRead] = await Promise.all([
            resolveSandboxRealPath({
              sandbox,
              absolutePath,
              workingDirectory,
            }),
            sandbox
              .readFile(absolutePath, "utf-8")
              .then((raw) => ({ exists: true as const, raw }))
              .catch(() => ({ exists: false as const, raw: "" })),
          ]);
          if (realPath && !resolveWorkspacePath(realPath, workingDirectory)) {
            return {
              success: false,
              error: "Path resolves outside the workspace.",
            };
          }

          if (existingRead.exists) {
            const gate = checkReadGate(
              readState,
              displayPath,
              currentFileHash(existingRead.raw),
              "write",
            );
            if (!gate.ok) {
              return {
                success: false,
                error: gate.message,
                gate: gate.reason,
              };
            }
          }
        }

        const dir = path.dirname(absolutePath);
        await sandbox.mkdir(dir, { recursive: true });
        await sandbox.writeFile(absolutePath, content, "utf-8");

        // A write is not read evidence. Any later edit or overwrite must
        // read the resulting file first, so the model cannot chain blind
        // mutations from content it has not actually seen.
        const contentHash = currentFileHash(content);

        return {
          success: true,
          path: displayPath,
          contentHash,
          bytesWritten: Buffer.byteLength(content, "utf-8"),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to write file: ${message}`,
        };
      }
    },
  });

export const editFileTool = () =>
  tool({
    needsApproval: async ({ filePath }, { experimental_context }) => {
      if (
        (
          experimental_context as
            | { permissionMode?: "ask" | "autoAccept" | "fullAccess" }
            | undefined
        )?.permissionMode === "fullAccess"
      ) {
        return false;
      }

      if (isDotEnvFilePath(filePath)) {
        return true;
      }

      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "edit");
      } catch {
        return false;
      }
      const workingDirectory = sandbox.workingDirectory;
      const absolutePath = resolveWorkspacePath(filePath, workingDirectory);
      if (!absolutePath) {
        return false;
      }

      const realPath = await resolveSandboxRealPath({
        sandbox,
        absolutePath,
        workingDirectory,
      });

      return isSensitiveDotEnvPath({
        requestedPath: filePath,
        absolutePath,
        realPath,
      });
    },
    description: `Perform exact string replacement in a file.

WHEN TO USE:
- Making small, precise edits to an existing file you have already read
- Renaming a variable or identifier consistently within a single file
- Changing a specific block of code or configuration exactly as seen in the read output

WHEN NOT TO USE:
- Creating new files (use \`write\` instead)
- Large structural rewrites where it's simpler to rewrite the entire file (use \`write\` after reading it)
- Multi-file refactors (use \`grep\` + multiple \`edit\` calls, or \`task\` for larger jobs)

USAGE:
- Use workspace-relative file paths (e.g., "src/auth.ts")
- You must read the file first with \`read\` in this conversation
- Provide oldString as the EXACT text to replace, including whitespace and indentation
- By default, oldString must be UNIQUE in the file; otherwise the edit will fail
- Use replaceAll: true to change ALL occurrences of oldString in the file (e.g., for a rename)
- ALWAYS provide startLine: the line number where oldString begins (from the \`read\` output)

IMPORTANT:
- Preserve exact indentation and spacing from the file's content as returned by \`read\`
- Never include line numbers or the "N: " line prefixes from the \`read\` output in oldString or newString
- If oldString appears multiple times and replaceAll is false, the tool will FAIL with an error and occurrence count

EXAMPLES:
- Replace a single function call: filePath: "src/auth.ts", oldString: "login(user, password)", newString: "loginWithAudit(user, password)", startLine: 42
- Rename a variable throughout a file: filePath: "src/api.ts", oldString: "oldApiClient", newString: "newApiClient", replaceAll: true, startLine: 15`,
    inputSchema: editInputSchema,
    execute: async (
      { filePath, oldString, newString, replaceAll = false },
      { experimental_context },
    ) => {
      if (oldString === newString) {
        return {
          success: false,
          error: "oldString and newString must be different",
        };
      }

      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "edit");
      } catch (error) {
        return {
          success: false,
          error: `Sandbox is unavailable (${error instanceof Error ? error.message : String(error)}). Cannot edit file.`,
        };
      }
      const workingDirectory = sandbox.workingDirectory;

      try {
        const absolutePath = resolveWorkspacePath(filePath, workingDirectory);
        if (!absolutePath) {
          return {
            success: false,
            error: "Path must stay within the workspace.",
          };
        }

        // Fast-path in-memory read gate BEFORE any sandbox RPCs (realpath / readFile):
        // if the model has never read this file (or its last read failed), refuse
        // instantly in <0.1ms instead of paying 2 remote Boxd round-trips first.
        const readState = ensureReadFileState(
          (experimental_context ?? {}) as { readFileState?: unknown },
        );
        const displayPath = toDisplayPath(absolutePath, workingDirectory);
        const preflightGate = checkReadGate(readState, displayPath, "", "edit");
        if (!preflightGate.ok && preflightGate.reason !== "stale") {
          return {
            success: false,
            error: preflightGate.message,
            gate: preflightGate.reason,
          };
        }

        const [realPath, content] = await Promise.all([
          resolveSandboxRealPath({
            sandbox,
            absolutePath,
            workingDirectory,
          }),
          sandbox.readFile(absolutePath, "utf-8"),
        ]);
        if (realPath && !resolveWorkspacePath(realPath, workingDirectory)) {
          return {
            success: false,
            error: "Path resolves outside the workspace.",
          };
        }

        // Full read gate (checks stale hash against live file contents).
        const gate = checkReadGate(
          readState,
          displayPath,
          currentFileHash(content),
          "edit",
        );
        if (!gate.ok) {
          return {
            success: false,
            error: gate.message,
            gate: gate.reason,
          };
        }

        if (!content.includes(oldString)) {
          const anchor = oldString
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line.length >= 6);
          let nearMissHint =
            "Make sure to match exact whitespace and indentation.";
          if (anchor) {
            const fileLines = content.split("\n");
            const idx = fileLines.findIndex((line) =>
              line.trim().includes(anchor),
            );
            if (idx >= 0) {
              const from = Math.max(0, idx - 1);
              const to = Math.min(fileLines.length, idx + 4);
              const snippet = fileLines
                .slice(from, to)
                .map((l, offset) => `${from + offset + 1}: ${l}`)
                .join("\n");
              nearMissHint = `Closest match near line ${idx + 1} (check exact indentation/content):\n${snippet}`;
            }
          }
          return {
            success: false,
            error: "oldString not found in file",
            hint: nearMissHint,
          };
        }

        const occurrences = content.split(oldString).length - 1;
        if (occurrences > 1 && !replaceAll) {
          return {
            success: false,
            error: `oldString found ${occurrences} times. Use replaceAll=true or provide more context to make it unique.`,
          };
        }

        // Calculate starting line number for the edit
        const matchIndex = content.indexOf(oldString);
        const startLine = content.slice(0, matchIndex).split("\n").length;

        const newContent = replaceAll
          ? content.replaceAll(oldString, newString)
          : content.replace(oldString, newString);

        await sandbox.writeFile(absolutePath, newContent, "utf-8");

        // An edit is not read evidence. A later mutation must read the
        // new file contents before changing it again.
        const contentHash = currentFileHash(newContent);

        return {
          success: true,
          path: displayPath,
          contentHash,
          replacements: replaceAll ? occurrences : 1,
          startLine,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to edit file: ${message}`,
        };
      }
    },
  });
