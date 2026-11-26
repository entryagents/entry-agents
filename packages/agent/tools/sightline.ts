import { tool } from "ai";
import { z } from "zod";
import { getSandbox, toDisplayPath } from "./utils";
import { resolveWorkspacePath } from "./path-security";

/**
 * sightline_* — structural tools that replace read / dir_list / grep for the
 * questions those tools answer badly.
 *
 * DESIGN RULES, all learned from measurement (see sightline/bench):
 *
 *  1. Every description opens with WHEN TO USE and WHEN NOT TO. An agent picks a
 *     tool from its description, and the failure mode is reaching for `grep`
 *     because it is familiar. The negative cases matter more than the positive
 *     ones.
 *
 *  2. Results are FORMatted text, not JSON. `dir_list` returns an entries array
 *     plus a formatted string; the model receives both and pays for both,
 *     measured at 159 chars/entry versus 26 for a single formatted line.
 *
 *  3. Errors are results, never throws. A thrown error becomes a transport error
 *     the model cannot read or adapt to.
 *
 *  4. No unrequested work. `list` does not parse symbols unless asked; `map`
 *     does not read file bodies. The budget parameter is honoured exactly.
 *
 * The indexing engine lives in a Python sidecar because it is already written,
 * measured across 210 repos, and porting it would discard that. These tools shell
 * out to it through the sandbox. If you later want a pure-TS implementation, the
 * contract is: `sightline map|list|file|find|callers` on stdout.
 */

const CODEMAP_BIN = process.env.CODEMAP_BIN ?? "sightline";
const CODEMAP_PYTHONPATH = process.env.CODEMAP_PYTHONPATH ?? "";

/** Run one sightline command in the sandbox and return stdout. */
async function runSightline(
  sandbox: Awaited<ReturnType<typeof getSandbox>>,
  args: string[],
): Promise<{ ok: true; out: string } | { ok: false; error: string }> {
  const cwd = sandbox.workingDirectory;
  const env = CODEMAP_PYTHONPATH
    ? `PYTHONPATH=${shellQuote(CODEMAP_PYTHONPATH)} `
    : "";
  const escapedArgs = args.map(shellQuote).join(" ");
  const buildCmd = (bin: string) =>
    `${env}${bin} --root ${shellQuote(cwd)} ${escapedArgs}`;

  try {
    let result = await sandbox.exec(buildCmd(CODEMAP_BIN), cwd, 120_000);

    // Auto-bootstrap sightline into the sandbox once if not yet installed.
    const missingBin =
      result.exitCode === 127 ||
      (result.exitCode !== 0 &&
        !result.stdout &&
        /not found|no module named sightline/i.test(result.stderr ?? ""));
    if (missingBin && CODEMAP_BIN === "sightline") {
      const installCmd =
        'export PATH="$HOME/.local/bin:$PATH"; ' +
        "command -v sightline >/dev/null 2>&1 || " +
        "python3 -m pip install -q --user --break-system-packages git+https://github.com/thirdbase1/sightline.git 2>/dev/null || " +
        "python3 -m pip install -q --user git+https://github.com/thirdbase1/sightline.git";
      const installRes = await sandbox.exec(installCmd, cwd, 90_000);
      if (installRes.exitCode === 0) {
        result = await sandbox.exec(
          `export PATH="$HOME/.local/bin:$PATH"; ${buildCmd("sightline")}`,
          cwd,
          120_000,
        );
      }
    }

    const out = `${result.stdout ?? ""}${result.stderr ? `\n${result.stderr}` : ""}`;
    if (result.exitCode !== 0 && !result.stdout) {
      return {
        ok: false,
        error:
          `sightline exited ${result.exitCode}. ` +
          (out.trim() ||
            "No output. If sightline is not installed in this sandbox, use " +
              "glob and grep instead."),
      };
    }
    return { ok: true, out };
  } catch (error) {
    return {
      ok: false,
      error:
        `sightline is unavailable (${error instanceof Error ? error.message : String(error)}). ` +
        "Fall back to glob and grep.",
    };
  }
}

function shellQuote(s: string): string {
  return `'${s.replaceAll("'", `'\\''`)}'`;
}

// ---------------------------------------------------------------- sightline_map

const sightlineMapInputSchema = z.object({
  budget: z
    .number()
    .int()
    .min(200)
    .max(200_000)
    .optional()
    .describe(
      "Token budget for the output. 2000 for orientation, 8000 for feature work " +
        "in one area, 25000 for a large repo. Default: 2000.",
    ),
  focus: z
    .string()
    .optional()
    .describe(
      "Workspace-relative path to bias ranking toward, e.g. 'src/auth'. " +
        "Re-ranks without increasing the budget - use this before raising it.",
    ),
});

export type SightlineMapInput = z.infer<typeof sightlineMapInputSchema>;

export interface SightlineMapResult {
  success: boolean;
  map?: string;
  truncated?: boolean;
  error?: string;
}

export const sightlineMapTool = () =>
  tool({
    description: `Structural map: directories, files, declarations, ranked by importance.

WHEN TO USE:
- First in an unfamiliar repo, before grep or read
- Choosing which file to read when you do not know its name

WHEN NOT TO USE:
- You know the file (use read)
- A string literal or usage count (use grep)
- One directory (use sightline_list)

Budget 2000 to start. If output says "showing directories", pass focus.`,
    inputSchema: sightlineMapInputSchema,
    execute: async (
      { budget = 2000, focus }: SightlineMapInput,
      { experimental_context },
    ): Promise<SightlineMapResult> => {
      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "sightline_map");
      } catch (error) {
        return {
          success: false,
          error: `Sandbox is unavailable (${error instanceof Error ? error.message : String(error)}). Cannot build a map.`,
        };
      }

      if (focus) {
        const abs = resolveWorkspacePath(focus, sandbox.workingDirectory);
        if (!abs) {
          return {
            success: false,
            error: `Focus '${focus}' is outside the workspace directory.`,
          };
        }
      }

      const args = ["map", "--budget", String(budget)];
      if (focus)
        args.push(
          "--focus",
          toDisplayPath(
            resolveWorkspacePath(focus, sandbox.workingDirectory)!,
            sandbox.workingDirectory,
          ) || focus,
        );

      const r = await runSightline(sandbox, args);
      if (!r.ok) return { success: false, error: r.error };

      return {
        success: true,
        map: r.out.trimEnd(),
        truncated:
          r.out.includes("omitted by budget") || r.out.includes("narrow:"),
      };
    },
  });

// --------------------------------------------------------------- sightline_list

const sightlineListInputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe(
      "Workspace-relative directory to inventory. Default: '.' (whole workspace).",
    ),
  budget: z
    .number()
    .int()
    .min(200)
    .max(200_000)
    .optional()
    .describe("Token budget for the output. Default: 4000."),
  symbols: z
    .boolean()
    .optional()
    .describe(
      "Count declarations per file (default: true). Set false for a 4x faster, " +
        "smaller listing when you only need names and sizes.",
    ),
});

export type SightlineListInput = z.infer<typeof sightlineListInputSchema>;

export interface SightlineListResult {
  success: boolean;
  listing?: string;
  truncated?: boolean;
  error?: string;
}

export const sightlineListTool = () =>
  tool({
    description: `Every file in one directory, with size and declaration count.

WHEN TO USE:
- You need to know what files exist, not what the code does
- Checking a file exists before reading it

WHEN NOT TO USE:
- What a codebase does (use sightline_map)
- A name across directories (use sightline_find)

Lists every non-binary file, including configs and dotfiles. symbols:false is 4x faster.`,
    inputSchema: sightlineListInputSchema,
    execute: async (
      {
        path: requested = ".",
        budget = 4000,
        symbols = true,
      }: SightlineListInput,
      { experimental_context },
    ): Promise<SightlineListResult> => {
      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "sightline_list");
      } catch (error) {
        return {
          success: false,
          error: `Sandbox is unavailable (${error instanceof Error ? error.message : String(error)}). Cannot list.`,
        };
      }

      const abs = resolveWorkspacePath(requested, sandbox.workingDirectory);
      if (!abs) {
        return {
          success: false,
          error: `Path '${requested}' is outside the workspace directory.`,
        };
      }

      const display = toDisplayPath(abs, sandbox.workingDirectory) || ".";
      const args = ["list", display, "--budget", String(budget), "--direct"];
      if (!symbols) args.push("--no-symbols");

      const r = await runSightline(sandbox, args);
      if (!r.ok) return { success: false, error: r.error };

      return {
        success: true,
        listing: r.out.trimEnd(),
        truncated: r.out.includes("narrow:"),
      };
    },
  });

// --------------------------------------------------------------- sightline_file

const sightlineFileInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Workspace-relative path to the file whose declarations you want.",
    ),
});

export type SightlineFileInput = z.infer<typeof sightlineFileInputSchema>;

export interface SightlineFileResult {
  success: boolean;
  outline?: string;
  error?: string;
}

export const sightlineFileTool = () =>
  tool({
    description: `Declarations in one file, with signatures, plus its imports.

WHEN TO USE:
- You need a file's API surface, not its implementation
- Checking a signature before calling something

WHEN NOT TO USE:
- You are about to EDIT it (use read; the body is where the bug is)
- The file is under ~100 lines (just read it)

~40 tokens per file; reading a 50 KB file costs ~13,000.`,
    inputSchema: sightlineFileInputSchema,
    execute: async (
      { path: requested }: SightlineFileInput,
      { experimental_context },
    ): Promise<SightlineFileResult> => {
      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "sightline_file");
      } catch (error) {
        return {
          success: false,
          error: `Sandbox is unavailable (${error instanceof Error ? error.message : String(error)}).`,
        };
      }

      const abs = resolveWorkspacePath(requested, sandbox.workingDirectory);
      if (!abs) {
        return {
          success: false,
          error: `Path '${requested}' is outside the workspace directory.`,
        };
      }

      const display = toDisplayPath(abs, sandbox.workingDirectory) || requested;
      const r = await runSightline(sandbox, ["file", display]);
      if (!r.ok) return { success: false, error: r.error };

      if (r.out.includes("not in index")) {
        return {
          success: false,
          error:
            `'${display}' is not in the index. It may be binary, generated, or ` +
            "outside the indexed set. Use read instead.",
        };
      }

      return { success: true, outline: r.out.trimEnd() };
    },
  });

// --------------------------------------------------------------- sightline_find

const sightlineFindInputSchema = z.object({
  query: z
    .string()
    .describe(
      "Substring or regular expression to match against declaration names and signatures.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Maximum results. Default: 30."),
});

export type SightlineFindInput = z.infer<typeof sightlineFindInputSchema>;

export interface SightlineFindResult {
  success: boolean;
  matches?: string;
  count?: number;
  error?: string;
}

export const sightlineFindTool = () =>
  tool({
    description: `Find declarations by name or signature.

WHEN TO USE:
- You know the name and want its location
- Finding a definition rather than a usage

WHEN NOT TO USE:
- A string literal, error message, or usage count (use grep)
- You do not know the name yet (use sightline_map)
- What imports a module (use sightline_callers)

One result per definition, ordered by importance.`,
    inputSchema: sightlineFindInputSchema,
    execute: async (
      { query, limit = 30 }: SightlineFindInput,
      { experimental_context },
    ): Promise<SightlineFindResult> => {
      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "sightline_find");
      } catch (error) {
        return {
          success: false,
          error: `Sandbox is unavailable (${error instanceof Error ? error.message : String(error)}).`,
        };
      }

      const r = await runSightline(sandbox, [
        "find",
        query,
        "--limit",
        String(limit),
      ]);
      if (!r.ok) return { success: false, error: r.error };

      const lines = r.out.trim().split("\n").filter(Boolean);
      return {
        success: true,
        matches: r.out.trimEnd(),
        count: lines.length,
      };
    },
  });

// ------------------------------------------------------------ sightline_callers

const sightlineCallersInputSchema = z.object({
  symbol: z.string().describe("Exact declaration name."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Maximum files to list. Default: 20."),
});

export type SightlineCallersInput = z.infer<typeof sightlineCallersInputSchema>;

export interface SightlineCallersResult {
  success: boolean;
  report?: string;
  error?: string;
}

export const sightlineCallersTool = () =>
  tool({
    description: `Which files import the file that defines a symbol.

WHEN TO USE:
- Before editing a shared function, to see the blast radius
- Checking whether something is used before deleting it

WHEN NOT TO USE:
- Finding the definition itself (use sightline_find)
- Individual call sites (use grep)

Replaces a grep plus a read per hit.`,
    inputSchema: sightlineCallersInputSchema,
    execute: async (
      { symbol, limit = 20 }: SightlineCallersInput,
      { experimental_context },
    ): Promise<SightlineCallersResult> => {
      let sandbox;
      try {
        sandbox = await getSandbox(experimental_context, "sightline_callers");
      } catch (error) {
        return {
          success: false,
          error: `Sandbox is unavailable (${error instanceof Error ? error.message : String(error)}).`,
        };
      }

      const r = await runSightline(sandbox, [
        "callers",
        symbol,
        "--limit",
        String(limit),
      ]);
      if (!r.ok) return { success: false, error: r.error };
      return { success: true, report: r.out.trimEnd() };
    },
  });
