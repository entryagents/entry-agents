export type ChangeStatusLetter = "M" | "A" | "D" | "R";

export function toChangeLetter(
  status?: string | null,
): ChangeStatusLetter | undefined {
  switch (status) {
    case "added":
    case "A":
      return "A";
    case "deleted":
    case "D":
      return "D";
    case "renamed":
    case "R":
      return "R";
    case "modified":
    case "M":
      return "M";
    default:
      return undefined;
  }
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

export function highlightSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return [{ text, match: false }];

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  let pos = idx;
  while (pos >= 0) {
    if (pos > cursor) {
      segments.push({ text: text.slice(cursor, pos), match: false });
    }
    segments.push({ text: text.slice(pos, pos + q.length), match: true });
    cursor = pos + q.length;
    pos = lower.indexOf(q, cursor);
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
}

export function splitFileSegments(filePath: string): {
  segments: string[];
  dirParts: string[];
  fileName: string;
} {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { segments: [filePath], dirParts: [], fileName: filePath };
  }
  return {
    segments,
    dirParts: segments.slice(0, -1),
    fileName: segments[segments.length - 1] ?? filePath,
  };
}

export type PreviewDeviceMode = "desktop" | "tablet" | "phone";

export const PREVIEW_DEVICES: Record<
  PreviewDeviceMode,
  { label: string; width: number; height: number }
> = {
  desktop: { label: "Desktop", width: 0, height: 0 },
  tablet: { label: "Tablet", width: 768, height: 1024 },
  phone: { label: "Phone", width: 375, height: 812 },
};

const STAGE_PAD = 12;
const STRIP_H = 36;

export interface DeviceStageMetrics {
  width: number;
  height: number;
  scale: number;
  pct: number;
  top: number;
}

export function computeDeviceStage({
  device,
  containerWidth,
  containerHeight,
}: {
  device: PreviewDeviceMode;
  containerWidth: number;
  containerHeight: number;
}): DeviceStageMetrics | null {
  if (device === "desktop" || containerWidth <= 0 || containerHeight <= 0) {
    return null;
  }
  const spec = PREVIEW_DEVICES[device];
  const availWidth = Math.max(120, containerWidth - STAGE_PAD * 2);
  const scale = Math.min(1, availWidth / spec.width);
  const availHeight = Math.max(160, containerHeight - STRIP_H - STAGE_PAD);
  const height = Math.max(
    180,
    Math.round(Math.min(spec.height, availHeight / scale)),
  );
  return {
    width: spec.width,
    height,
    scale,
    pct: Math.round(scale * 100),
    top: STRIP_H,
  };
}

export function normalizeBrowserAddress(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Allow explicit http(s):// schemes; reject non-http(s) schemes (unless it is host:port like localhost:3000)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).toString();
    } catch {
      return null;
    }
  }
  const hasColon = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);
  const isHostPort = /^[a-zA-Z\d.-]+:\d+(?:[/?#]|$)/.test(trimmed);
  if (hasColon && !isHostPort) {
    return null;
  }

  // Hostnames without scheme: localhost / 127.0.0.1 / 0.0.0.0 / IP / explicit port default to http, others https
  const isLocalLike =
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(trimmed) ||
    /^[\d.]+:\d+(\/|$)/.test(trimmed);
  const candidate = `${isLocalLike ? "http" : "https"}://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parseAddressParts(url: string): {
  host: string;
  path: string;
  isLocal: boolean;
  secure: boolean;
} {
  try {
    const parsed = new URL(url);
    const host = parsed.host || url;
    const rawPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const path = rawPath === "/" ? "" : rawPath;
    const hostname = parsed.hostname.toLowerCase();
    const isLocal =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local");
    return {
      host,
      path,
      isLocal,
      secure: parsed.protocol === "https:",
    };
  } catch {
    return { host: url, path: "", isLocal: false, secure: false };
  }
}

export function isLocalPreviewUrl(url: string): boolean {
  return parseAddressParts(url).isLocal;
}

export interface PackageScriptItem {
  name: string;
  command: string;
}

export function parsePackageJsonScripts(rawJson: string): PackageScriptItem[] {
  try {
    const parsed = JSON.parse(rawJson) as {
      scripts?: Record<string, unknown>;
    };
    if (!parsed || typeof parsed !== "object" || !parsed.scripts) {
      return [];
    }
    const items: PackageScriptItem[] = [];
    for (const [name, value] of Object.entries(parsed.scripts)) {
      if (typeof value === "string" && name.trim() && value.trim()) {
        items.push({ name: name.trim(), command: value.trim() });
      }
    }
    return items.slice(0, 40);
  } catch {
    return [];
  }
}

export type PackageRunner = "pnpm" | "bun" | "yarn" | "npm";

export function detectPackageRunner(
  filePaths: readonly string[] | null | undefined,
): PackageRunner {
  if (!filePaths || filePaths.length === 0) return "pnpm";
  const names = new Set(
    filePaths.map((p) => p.replace(/\\/g, "/").replace(/^\/+/, "")),
  );
  if (names.has("pnpm-lock.yaml")) return "pnpm";
  if (names.has("bun.lock") || names.has("bun.lockb")) return "bun";
  if (names.has("yarn.lock")) return "yarn";
  if (names.has("package-lock.json")) return "npm";
  return "pnpm";
}

export function formatScriptCommand(
  runner: PackageRunner,
  scriptName: string,
): string {
  switch (runner) {
    case "pnpm":
      return `pnpm ${scriptName}`;
    case "bun":
      return `bun run ${scriptName}`;
    case "yarn":
      return `yarn ${scriptName}`;
    case "npm":
      return `npm run ${scriptName}`;
  }
}
