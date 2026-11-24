import { tool } from "ai";
import { z } from "zod";
import * as path from "path";
import { getSandbox, shellEscape, toDisplayPath } from "./utils";
import type { SecretRedactor } from "../lib/secret-redactor";

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

const GREP_EXCLUDED_DIRS = [
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

const GREP_EXCLUDED_FILES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "*.min.js",
  "*.min.css",
  "*.map",
];

/**
 * Translates common Perl regex shorthands (`\d`, `\D`, `\w`, `\W`, `\s`, `\S`)
 * to POSIX ERE equivalents so GNU `grep -E` never silently matches literal `'d'`
 * when a model searches for digits (`\d+`). Leaves escaped backslashes (`\\d`)
 * and bracket expressions (`[...]`) untouched.
 */
export function normalizePerlShorthandsForEre(pattern: string): string {
  let out = "";
  let inBracket = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\" && i + 1 < pattern.length) {
      const next = pattern[i + 1]!;
      if (inBracket) {
        out += ch + next;
        i += 1;
        continue;
      }
      if (next === "d") {
        out += "[0-9]";
        i += 1;
        continue;
      }
      if (next === "D") {
        out += "[^0-9]";
        i += 1;
        continue;
      }
      if (next === "w") {
        out += "[[:alnum:]_]";
        i += 1;
        continue;
      }
      if (next === "W") {
        out += "[^[:alnum:]_]";
        i += 1;
        continue;
      }
      if (next === "s") {
        out += "[[:space:]]";
        i += 1;
        continue;
      }
      if (next === "S") {
        out += "[^[:space:]]";
        i += 1;
        continue;
      }
      out += ch + next;
      i += 1;
      continue;
    }
    if (ch === "[" && !inBracket) {
      inBracket = true;
    } else if (ch === "]" && inBracket) {
      inBracket = false;
    }
    out += ch;
  }
  return out;
}

const grepInputSchema = z.object({
  pattern: z.string().describe("Regex pattern to search for"),
  path: z
    .string()
    .optional()
    .describe(
      "Workspace-relative file or directory to search in (e.g., 'src'). Defaults to '.' (workspace root).",
    ),
  glob: z
    .string()
    .optional()
    .describe("Glob pattern to filter files (e.g., '*.ts')"),
  caseSensitive: z
    .boolean()
    .optional()
    .describe("Case-sensitive search. Default: true"),
  filesOnly: z
    .boolean()
    .optional()
    .describe(
      "Return only matching file paths (compact, ideal for broad discovery before targeted reads). Default: false",
    ),
  include_hidden: z
    .boolean()
    .optional()
    .describe(
      "Whether to search inside dot-directories and hidden files (e.g. .github). Default: false",
    ),
});

export const grepTool = () =>
  tool({
    description: `Search for patterns in files using Extended Regular Expressions (supports common shorthands \\d, \\w, \\s).

WHEN TO USE:
- Finding where a function, type, component, or string literal is defined or referenced
- Locating configuration keys, routes, or error messages across files
- Broad discovery with \`filesOnly: true\` to see which files mention a symbol without flooding context

WHEN NOT TO USE:
- Filename-only searches (use \`glob\` instead)
- Listing a directory's immediate contents (use \`dir_list\` instead)
- Reading a known file (use \`read\` instead)
- Complex, multi-round codebase exploration (use \`task\` with \`subagentType: "explorer"\`)

USAGE:
- \`path\` is optional and defaults to "." (workspace root)
- Optionally filter files with \`glob\` (e.g., "*.ts", "*.tsx")
- Use \`filesOnly: true\` for broad searches to get a compact list of matching files
- Automatically skips node_modules, dist, build, .next, coverage, .turbo, and lockfiles
- Matches are single-line; results are capped at 100 matches total (10 per file)

IMPORTANT:
- ALWAYS use \`grep\` for code/content searches instead of running \`grep\`/\`rg\` via \`bash\`
- Use \`caseSensitive: false\` for case-insensitive searches`,
    inputSchema: grepInputSchema,
    execute: async (
      {
        pattern,
        path: searchPath = ".",
        glob,
        caseSensitive = true,
        filesOnly = false,
        include_hidden = false,
      },
      { experimental_context, abortSignal },
    ) => {
      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "grep");
      } catch (error) {
        return {
          success: false,
          error: `Sandbox is unavailable (${error instanceof Error ? error.message : String(error)}). Cannot search files.`,
        };
      }
      const workingDirectory = sandbox.workingDirectory;

      try {
        const absolutePath = path.isAbsolute(searchPath)
          ? searchPath
          : path.resolve(workingDirectory, searchPath);

        const maxTotal = 100;
        const maxPerFile = 10;
        const normalizedPattern = normalizePerlShorthandsForEre(pattern);

        const args: string[] = filesOnly ? ["grep", "-rl"] : ["grep", "-rn"];
        if (!caseSensitive) args.push("-i");

        if (!include_hidden) {
          args.push(`--exclude-dir=${shellEscape(".*")}`);
        }
        for (const dir of GREP_EXCLUDED_DIRS) {
          args.push(`--exclude-dir=${shellEscape(dir)}`);
        }
        for (const excludedFile of GREP_EXCLUDED_FILES) {
          args.push(`--exclude=${shellEscape(excludedFile)}`);
        }

        if (glob) {
          args.push(`--include=${shellEscape(glob)}`);
        }

        if (!filesOnly) {
          args.push("-m", String(maxPerFile));
        }

        args.push(
          "-E",
          shellEscape(normalizedPattern),
          shellEscape(absolutePath),
        );

        const command = args.join(" ");

        const result = await sandbox.exec(
          command,
          sandbox.workingDirectory,
          30_000,
          { signal: abortSignal },
        );

        const redactor = (
          experimental_context as
            | { secretRedactor?: SecretRedactor }
            | undefined
        )?.secretRedactor;
        const redact = (text: string) =>
          redactor?.hasSecrets() ? redactor.redact(text) : text;

        // grep exits with 1 when no matches found - that's not an error
        if (!result.success && result.exitCode !== 1) {
          const errorOutput = redact(
            (result.stderr || result.stdout).slice(0, 500),
          );
          return {
            success: false,
            error: `Grep failed (exit ${result.exitCode}): ${errorOutput}`,
          };
        }

        if (filesOnly) {
          const matchedFiles = result.stdout
            .split("\n")
            .filter(Boolean)
            .slice(0, maxTotal)
            .map((file) => toDisplayPath(file, workingDirectory));
          return {
            success: true,
            pattern,
            filesOnly: true,
            matchCount: matchedFiles.length,
            filesWithMatches: matchedFiles.length,
            files: matchedFiles,
            matches: [],
          };
        }

        const matches: GrepMatch[] = [];
        const filesSet = new Set<string>();
        const fileMatchCounts = new Map<string, number>();

        const lines = result.stdout.split("\n").filter(Boolean);
        for (const line of lines) {
          if (matches.length >= maxTotal) break;

          const nulIndex = line.indexOf("\0");
          let file: string;
          let rest: string;
          if (nulIndex !== -1) {
            file = line.slice(0, nulIndex);
            rest = line.slice(nulIndex + 1);
          } else {
            const match = line.match(/:(\d+):/);
            if (!match || match.index === undefined) continue;
            file = line.slice(0, match.index);
            rest = line.slice(match.index + 1);
          }
          const colonIndex = rest.indexOf(":");
          if (colonIndex === -1) continue;

          const lineNum = parseInt(rest.slice(0, colonIndex), 10);
          const content = rest.slice(colonIndex + 1);

          if (isNaN(lineNum)) continue;

          const displayFile = toDisplayPath(file, workingDirectory);
          filesSet.add(displayFile);
          const currentFileCount = fileMatchCounts.get(displayFile) ?? 0;
          if (currentFileCount >= maxPerFile) continue;

          fileMatchCounts.set(displayFile, currentFileCount + 1);
          matches.push({
            file: displayFile,
            line: lineNum,
            content: redact(content.slice(0, 200)),
          });
        }

        const response: Record<string, unknown> = {
          success: true,
          pattern,
          matchCount: matches.length,
          filesWithMatches: filesSet.size,
          matches,
        };

        if (matches.length === 0) {
          response._debug = {
            command,
            exitCode: result.exitCode,
            stdoutPreview: redact(result.stdout.slice(0, 500)),
          };
        }

        return response;
      } catch (error) {
        const redactor = (
          experimental_context as
            | { secretRedactor?: SecretRedactor }
            | undefined
        )?.secretRedactor;
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Grep failed: ${redactor?.hasSecrets() ? redactor.redact(message) : message}`,
        };
      }
    },
    toModelOutput: ({ output }) => {
      const out = output as {
        success?: boolean;
        error?: string;
        pattern?: string;
        filesOnly?: boolean;
        files?: string[];
        matchCount?: number;
        filesWithMatches?: number;
        matches?: GrepMatch[];
        _debug?: { exitCode?: number };
      };
      if (!out.success) {
        return {
          type: "text",
          value: out.error ?? "Grep failed.",
        };
      }
      if (out.filesOnly) {
        const files = out.files ?? [];
        if (files.length === 0) {
          return {
            type: "text",
            value: `No files matching "${out.pattern ?? ""}".`,
          };
        }
        return {
          type: "text",
          value: `${files.length} file(s) matching "${out.pattern ?? ""}":\n${files.join("\n")}`,
        };
      }
      const matches = out.matches ?? [];
      if (matches.length === 0) {
        return {
          type: "text",
          value: `No matches for "${out.pattern ?? ""}" (exit ${out._debug?.exitCode ?? 1}).`,
        };
      }
      const lines = matches.map((m) => `${m.file}:${m.line}: ${m.content}`);
      return {
        type: "text",
        value: `${out.matchCount ?? matches.length} match(es) across ${out.filesWithMatches ?? 0} file(s) for "${out.pattern ?? ""}":\n${lines.join("\n")}`,
      };
    },
  });
