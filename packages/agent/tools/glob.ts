import { tool } from "ai";
import { z } from "zod";
import * as path from "path";
import { getSandbox, shellEscape, toDisplayPath } from "./utils";

interface FileInfo {
  path: string;
  size: number;
  modifiedAt: number;
}

const globInputSchema = z.object({
  pattern: z.string().describe("Glob pattern to match (e.g., '**/*.ts')"),
  path: z
    .string()
    .optional()
    .describe("Workspace-relative base directory to search from (e.g., src)"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results. Default: 100"),
});

const GLOB_EXCLUDED_DIRS = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  "coverage",
  "target",
  "__pycache__",
];

/**
 * Compiles a glob pattern (supporting `**`, `*`, `?`, and `{a,b}` brace lists)
 * into an anchored RegExp matched against normalized relative file paths.
 */
export function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/^\.\/+/, "").replace(/\/+/g, "/");
  let re = "^";
  let i = 0;

  while (i < normalized.length) {
    const ch = normalized[i]!;
    if (ch === "*") {
      if (normalized[i + 1] === "*") {
        // "**/" matches zero or more directory segments
        if (normalized[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
      continue;
    }
    if (ch === "?") {
      re += "[^/]";
      i += 1;
      continue;
    }
    if (ch === "{") {
      const close = normalized.indexOf("}", i + 1);
      if (close > i + 1) {
        const alts = normalized
          .slice(i + 1, close)
          .split(",")
          .map((alt) => alt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        re += `(?:${alts.join("|")})`;
        i = close + 1;
        continue;
      }
    }
    re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    i += 1;
  }

  re += "$";
  return new RegExp(re);
}

export const globTool = () =>
  tool({
    description: `Find files matching a glob pattern (supports multi-segment directory globs like "**/chat/*.tsx" and "packages/*/tools/*.ts").

WHEN TO USE:
- Locating files by extension, directory segment, or naming pattern (e.g., "**/chat/*.tsx", "src/**/*.test.ts")
- Discovering where components, routes, migrations, or configs live
- Getting a quick list of recently modified files of a given type

WHEN NOT TO USE:
- Searching inside file contents (use \`grep\` instead)
- Reading file contents (use \`read\` instead)
- Listing a single directory's immediate children (use \`dir_list\` instead — never \`bash\` with \`ls\`)

USAGE:
- Supports full path patterns like "**/*.ts", "**/components/**/*.tsx", "packages/*/tools/*.ts", "*.json"
- Returns FILES (not directories) sorted by modification time (newest first)
- Automatically skips hidden directories, node_modules, dist, build, .next, coverage, and .turbo
- If path is omitted, the workspace root is used as the base
- Results are limited by the limit parameter (default: 100)

EXAMPLES:
- All TypeScript files in the project: pattern: "**/*.ts"
- Chat components anywhere: pattern: "**/chat/*.tsx"
- Tools across monorepo packages: pattern: "packages/*/tools/*.ts"
- Recent JSON config files: pattern: "*.json", path: "config", limit: 20`,
    inputSchema: globInputSchema,
    execute: async (
      { pattern, path: basePath, limit = 100 },
      { experimental_context, abortSignal },
    ) => {
      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "glob");
      } catch (error) {
        return {
          success: false,
          error: `Sandbox is unavailable (${error instanceof Error ? error.message : String(error)}). Cannot list files.`,
        };
      }
      const workingDirectory = sandbox.workingDirectory;

      try {
        const rootSearchDir = basePath
          ? path.isAbsolute(basePath)
            ? basePath
            : path.resolve(workingDirectory, basePath)
          : workingDirectory;

        let searchDir = rootSearchDir;

        // Extract file name pattern from glob (last segment)
        const patternParts = pattern.split("/").filter(Boolean);
        const namePattern = patternParts[patternParts.length - 1] ?? "*";
        const hasBraceInName = namePattern.includes("{");

        // Extract literal directory prefix (segments before any wildcards)
        // e.g., "src/components/**/*.tsx" → prefix "src/components", name "*.tsx"
        const literalPrefix: string[] = [];
        for (let i = 0; i < patternParts.length - 1; i++) {
          const part = patternParts[i]!;
          if (
            part.includes("*") ||
            part.includes("?") ||
            part.includes("[") ||
            part.includes("{")
          ) {
            break;
          }
          literalPrefix.push(part);
        }
        if (literalPrefix.length > 0) {
          searchDir = path.join(searchDir, ...literalPrefix);
        }

        const remainingDirSegments = patternParts.slice(
          literalPrefix.length,
          patternParts.length - 1,
        );
        const hasRecursiveWildcard =
          remainingDirSegments.some((s) => s === "**") || namePattern === "**";

        let maxDepth: number | undefined;
        if (!hasRecursiveWildcard) {
          maxDepth = remainingDirSegments.length + 1;
        }

        // Full-path matcher for multi-segment directory patterns so
        // "**/chat/*.tsx" or "packages/*/tools/*.ts" never leak non-matching dirs.
        const needsFullPathFilter =
          remainingDirSegments.some((s) => s !== "**") || hasBraceInName;
        const fullPathMatcher = needsFullPathFilter
          ? globToRegExp(pattern)
          : null;

        const findArgs: string[] = ["find", shellEscape(searchDir)];
        if (maxDepth !== undefined) {
          findArgs.push("-maxdepth", String(maxDepth));
        }
        findArgs.push("-not", "-path", "'*/.*'");
        for (const dir of GLOB_EXCLUDED_DIRS) {
          findArgs.push("-not", "-path", shellEscape(`*/${dir}/*`));
        }
        findArgs.push("-type", "f");
        if (!hasBraceInName && namePattern !== "**") {
          findArgs.push("-name", shellEscape(namePattern));
        }

        // Fetch extra candidates when filtering multi-segment paths in JS
        const fetchLimit = needsFullPathFilter
          ? Math.max(limit * 10, 500)
          : limit;

        const findBase = findArgs.join(" ");
        const command = [
          `{ ${findBase} -printf '%T@\\t%s\\t%p\\n' 2>/dev/null`,
          `|| ${findBase} -print0 | xargs -0 stat -f '%m%t%z%t%N' ; }`,
          `| sort -t$'\\t' -k1 -rn | head -n ${fetchLimit}`,
        ].join(" ");

        const result = await sandbox.exec(
          command,
          sandbox.workingDirectory,
          30_000,
          { signal: abortSignal },
        );

        // find returns exit code 1 on permission errors but may still produce valid results
        if (!result.success && result.exitCode !== 1) {
          return {
            success: false,
            error: `Glob failed (exit ${result.exitCode}): ${result.stdout.slice(0, 500)}`,
          };
        }

        const files: FileInfo[] = [];
        const lines = result.stdout.split("\n").filter(Boolean);

        for (const line of lines) {
          if (files.length >= limit) break;
          // Format: mtime_epoch\tsize\tpath
          const firstTab = line.indexOf("\t");
          if (firstTab === -1) continue;
          const secondTab = line.indexOf("\t", firstTab + 1);
          if (secondTab === -1) continue;

          const mtimeSeconds = parseFloat(line.slice(0, firstTab));
          const size = parseInt(line.slice(firstTab + 1, secondTab), 10);
          const filePath = line.slice(secondTab + 1);

          if (isNaN(mtimeSeconds) || isNaN(size) || !filePath) continue;

          if (fullPathMatcher) {
            const relFromRoot = path
              .relative(rootSearchDir, filePath)
              .split(path.sep)
              .join("/");
            if (!fullPathMatcher.test(relFromRoot)) continue;
          }

          files.push({
            path: toDisplayPath(filePath, workingDirectory),
            size,
            modifiedAt: mtimeSeconds * 1000,
          });
        }

        const response: Record<string, unknown> = {
          success: true,
          pattern,
          baseDir: toDisplayPath(searchDir, workingDirectory),
          count: files.length,
          files: files.map((f) => ({
            path: f.path,
            size: f.size,
            modifiedAt: new Date(f.modifiedAt).toISOString(),
          })),
        };

        // Include debug info when no results found to aid diagnosis
        if (files.length === 0) {
          response._debug = {
            command,
            exitCode: result.exitCode,
            stdoutPreview: result.stdout.slice(0, 500),
          };
        }

        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Glob failed: ${message}`,
        };
      }
    },
    toModelOutput: ({ output }) => {
      const out = output as {
        success?: boolean;
        error?: string;
        pattern?: string;
        baseDir?: string;
        count?: number;
        files?: Array<{ path: string }>;
      };
      if (!out.success) {
        return {
          type: "text",
          value: out.error ?? "Glob failed.",
        };
      }
      const files = out.files ?? [];
      if (files.length === 0) {
        return {
          type: "text",
          value: `No files matching "${out.pattern ?? ""}" under ${out.baseDir ?? "."}.`,
        };
      }
      return {
        type: "text",
        value: `${out.count ?? files.length} file(s) matching "${out.pattern ?? ""}" (newest first):\n${files.map((f) => f.path).join("\n")}`,
      };
    },
  });
