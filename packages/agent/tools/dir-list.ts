import { tool } from "ai";
import { z } from "zod";
import * as path from "path";
import { getSandbox, toDisplayPath } from "./utils";
import { resolveWorkspacePath } from "./path-security";

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink" | "other";
  size?: number;
}

export interface DirListResult {
  success: boolean;
  path?: string;
  entries?: DirEntry[];
  totalCount?: number;
  truncated?: boolean;
  formatted?: string;
  error?: string;
}

const dirListInputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe(
      "Workspace-relative path to the directory to list (e.g. 'src', 'apps/web', or '.' for workspace root). Default: '.'",
    ),
  showHidden: z
    .boolean()
    .optional()
    .describe(
      "Whether to include hidden files and directories (names starting with '.'). Default: false",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of entries to return (default: 100, max: 500)."),
  recursive: z
    .boolean()
    .optional()
    .describe(
      "Whether to list subdirectories recursively (up to 2 levels deep). Default: false",
    ),
});

export type DirListInput = z.infer<typeof dirListInputSchema>;

const IGNORED_RECURSIVE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".cache",
]);

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const dirListTool = () =>
  tool({
    description: `List files and directories in a directory on the workspace filesystem.

WHEN TO USE:
- Exploring project structure or directory hierarchy
- Checking files in a directory (e.g., 'src', 'components', '.')
- Discovering subdirectories, config files, or project layout without running shell commands

WHEN NOT TO USE:
- Finding files matching a glob pattern across the entire project (use glob instead)
- Searching for regex content inside files (use grep instead)
- Reading file contents (use read instead)

USAGE:
- Path is workspace-relative (defaults to workspace root '.')
- Returns entries sorted with directories first, then files alphabetically
- Each entry includes name, type ('file' | 'directory' | 'symlink'), and size for files
- Supports showHidden (default: false), limit (default: 100, max: 500), and recursive (default: false)`,
    inputSchema: dirListInputSchema,
    execute: async (
      {
        path: requestedPath = ".",
        showHidden = false,
        limit = 100,
        recursive = false,
      },
      { experimental_context },
    ): Promise<DirListResult> => {
      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "dir_list");
      } catch (error) {
        return {
          success: false,
          error: `Sandbox is unavailable (${error instanceof Error ? error.message : String(error)}). Cannot list directory.`,
        };
      }

      const workingDirectory = sandbox.workingDirectory;
      const absolutePath = resolveWorkspacePath(
        requestedPath,
        workingDirectory,
      );
      if (!absolutePath) {
        return {
          success: false,
          error: `Path '${requestedPath}' is outside the workspace directory.`,
        };
      }

      const displayBase = toDisplayPath(absolutePath, workingDirectory) || ".";

      try {
        const stats = await sandbox.stat(absolutePath);
        if (!stats.isDirectory()) {
          return {
            success: false,
            error: `'${displayBase}' is a file, not a directory. Use the read tool to view file contents.`,
          };
        }

        const entries: DirEntry[] = [];
        const maxLimit = Math.min(Math.max(1, limit), 500);

        const scanDir = async (
          currentAbs: string,
          currentRel: string,
          currentDepth: number,
        ): Promise<void> => {
          if (entries.length >= maxLimit) return;

          const rawDirents = await sandbox.readdir(currentAbs, {
            withFileTypes: true,
          });

          // Filter hidden
          const filtered = rawDirents.filter((d) => {
            if (!showHidden && d.name.startsWith(".")) return false;
            return true;
          });

          // Sort directories first, then files
          filtered.sort((a, b) => {
            const aIsDir = a.isDirectory();
            const bIsDir = b.isDirectory();
            if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          for (const dirent of filtered) {
            if (entries.length >= maxLimit) break;

            const entryRelPath = currentRel
              ? path.posix.join(currentRel, dirent.name)
              : dirent.name;
            const entryAbsPath = path.posix.join(currentAbs, dirent.name);

            let type: DirEntry["type"] = "other";
            if (dirent.isDirectory()) type = "directory";
            else if (dirent.isFile()) type = "file";
            else if (dirent.isSymbolicLink()) type = "symlink";

            let size: number | undefined;
            if (type === "file") {
              try {
                const s = await sandbox.stat(entryAbsPath);
                size = s.size;
              } catch {
                // Best-effort size query
              }
            }

            entries.push({
              name: dirent.name,
              path: entryRelPath,
              type,
              ...(size !== undefined ? { size } : {}),
            });

            if (
              recursive &&
              type === "directory" &&
              currentDepth < 2 &&
              !IGNORED_RECURSIVE_DIRS.has(dirent.name)
            ) {
              await scanDir(entryAbsPath, entryRelPath, currentDepth + 1);
            }
          }
        };

        await scanDir(absolutePath, displayBase === "." ? "" : displayBase, 0);

        const truncated = entries.length >= maxLimit;
        const formattedLines = entries.map((e) => {
          const typeTag =
            e.type === "directory"
              ? "[dir] "
              : e.type === "symlink"
                ? "[link]"
                : "[file]";
          const sizeStr =
            e.size !== undefined ? ` (${formatBytes(e.size)})` : "";
          return `${typeTag}  ${e.path}${e.type === "directory" ? "/" : ""}${sizeStr}`;
        });

        const formatted =
          `Directory listing for ${displayBase} (${entries.length} entries${truncated ? ", truncated at limit" : ""}):\n` +
          (formattedLines.length > 0
            ? formattedLines.join("\n")
            : "(empty directory)");

        return {
          success: true,
          path: displayBase,
          entries,
          totalCount: entries.length,
          truncated,
          formatted,
        };
      } catch (err) {
        return {
          success: false,
          error: `Failed to list directory '${displayBase}': ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
