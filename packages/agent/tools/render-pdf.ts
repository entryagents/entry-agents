import { tool } from "ai";
import { z } from "zod";
import { resolveWorkspacePath } from "./path-security";
import { getSandboxForCommand } from "./utils";

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Renders an HTML file in the workspace to a print-ready PDF using the VM's
 * pre-installed headless Chrome/Chromium, reports page count and embedded
 * font types (flagging Type3 fallback fonts), and optionally rasterizes each
 * page to PNG so the model can visually inspect them with `read` in 1 step.
 */
export function renderPdfTool() {
  return tool({
    description: `Render an HTML file to a print-ready PDF using the sandbox's pre-installed headless Chrome/Chromium (no Playwright install needed).
- Automatically checks page count and embedded fonts (flags Type3 fallback fonts).
- Optionally rasterizes pages to PNGs so you can visually verify them with the read tool.`,
    inputSchema: z.object({
      htmlPath: z
        .string()
        .describe("Workspace-relative path to the source HTML file"),
      outputPath: z
        .string()
        .describe("Workspace-relative path for the output PDF file"),
      renderPages: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Rasterize PDF pages to PNGs in <outputDir>/pages/ for visual inspection (default: true)",
        ),
      dpi: z
        .number()
        .int()
        .min(72)
        .max(300)
        .optional()
        .default(150)
        .describe("DPI for page PNG rasterization (default: 150)"),
    }),
    execute: async (
      { htmlPath, outputPath, renderPages = true, dpi = 150 },
      { experimental_context },
    ) => {
      const { sandbox } = await getSandboxForCommand(experimental_context);
      const workingDirectory = sandbox.workingDirectory;
      const htmlAbs = resolveWorkspacePath(htmlPath, workingDirectory);
      if (!htmlAbs) {
        return {
          success: false,
          error: `Invalid htmlPath outside workspace: ${htmlPath}`,
        };
      }
      const outAbs = resolveWorkspacePath(outputPath, workingDirectory);
      if (!outAbs) {
        return {
          success: false,
          error: `Invalid outputPath outside workspace: ${outputPath}`,
        };
      }

      const outDir =
        outAbs.slice(0, outAbs.lastIndexOf("/")) || workingDirectory;
      const pagesDir = `${outDir}/pages`;

      const script = [
        "set -e",
        `mkdir -p ${shellEscape(outDir)}`,
        "CHROME=$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser || true)",
        'if [ -z "$CHROME" ]; then echo "NO_CHROME_FOUND" >&2; exit 2; fi',
        `"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --no-pdf-header-footer --print-to-pdf=${shellEscape(outAbs)} ${shellEscape(`file://${htmlAbs}`)} 2>/dev/null || "$CHROME" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --no-pdf-header-footer --print-to-pdf=${shellEscape(outAbs)} ${shellEscape(`file://${htmlAbs}`)}`,
        `ls -lh ${shellEscape(outAbs)} | awk '{print "SIZE:"$5}'`,
        `if command -v pdfinfo >/dev/null 2>&1; then pdfinfo ${shellEscape(outAbs)} | grep -E "^(Pages|Page size):" || true; fi`,
        `if command -v pdffonts >/dev/null 2>&1; then echo "===FONTS==="; pdffonts ${shellEscape(outAbs)} | head -n 30; fi`,
        ...(renderPages
          ? [
              `if command -v pdftoppm >/dev/null 2>&1; then mkdir -p ${shellEscape(pagesDir)} && rm -f ${shellEscape(pagesDir)}/page-*.png && pdftoppm -png -r ${dpi} ${shellEscape(outAbs)} ${shellEscape(`${pagesDir}/page`)} && ls -1 ${shellEscape(pagesDir)}/page-*.png | sed 's/^/PNG:/'; fi`,
            ]
          : []),
      ].join("\n");

      const res = await sandbox.exec(script, workingDirectory, 60_000);
      if (!res.success) {
        return {
          success: false,
          error: (res.stderr || res.stdout || "PDF rendering failed").trim(),
        };
      }

      const lines = (res.stdout || "")
        .split("\n")
        .map((line: string) => line.trim());
      const size = lines
        .find((line: string) => line.startsWith("SIZE:"))
        ?.slice(5)
        .trim();
      const pagesLine = lines.find((line: string) => line.startsWith("Pages:"));
      const pageCount = pagesLine
        ? Number.parseInt(pagesLine.replace("Pages:", "").trim(), 10)
        : undefined;
      const fontIdx = lines.indexOf("===FONTS===");
      const fontLines =
        fontIdx >= 0
          ? lines
              .slice(fontIdx + 1)
              .filter(
                (line: string) => !line.startsWith("PNG:") && line.length > 0,
              )
          : [];
      const hasType3Fonts = fontLines.some((line: string) =>
        /\bType 3\b/i.test(line),
      );
      const pngPaths = lines
        .filter((line: string) => line.startsWith("PNG:"))
        .map((line: string) => line.slice(4).trim());

      return {
        success: true,
        outputPath,
        ...(size ? { size } : {}),
        ...(Number.isFinite(pageCount) ? { pageCount } : {}),
        hasType3Fonts,
        ...(fontLines.length > 0 ? { fonts: fontLines.slice(0, 15) } : {}),
        ...(pngPaths.length > 0 ? { pageImages: pngPaths } : {}),
      };
    },
  });
}
