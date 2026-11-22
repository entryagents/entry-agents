import * as path from "path";
import type { Sandbox } from "@entry-agents/sandbox";
import { isPathWithinDirectory, shellEscape } from "./utils";

export function isDotEnvFilePath(filePath: string): boolean {
  const basename = path.basename(filePath.replaceAll("\\", "/")).toLowerCase();
  return basename.startsWith(".env");
}

export function resolveWorkspacePath(
  filePath: string,
  workingDirectory: string,
): string | null {
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(workingDirectory, filePath);

  if (isPathWithinDirectory(absolutePath, workingDirectory)) {
    return absolutePath;
  }

  // Safe ephemeral scratch/artifact paths in the sandbox VM (screenshots, browser tests, /tmp)
  const normalized = absolutePath.replaceAll("\\", "/");
  const allowedPrefixes = [
    "/tmp/",
    "/home/boxd/.agent-browser/",
    "/home/user/.agent-browser/",
  ];
  if (
    allowedPrefixes.some(
      (p) => normalized.startsWith(p) || normalized === p.slice(0, -1),
    )
  ) {
    return absolutePath;
  }

  return null;
}

const REALPATH_CACHE_TTL_MS = 5_000;
const realPathCache = new WeakMap<
  Sandbox,
  Map<string, { realPath: string | null; expiresAt: number }>
>();

export async function resolveSandboxRealPath(params: {
  sandbox: Sandbox;
  absolutePath: string;
  workingDirectory: string;
}): Promise<string | null> {
  if (typeof params.sandbox.exec !== "function") {
    return null;
  }

  const now = Date.now();
  let sandboxCache = realPathCache.get(params.sandbox);
  const cached = sandboxCache?.get(params.absolutePath);
  if (cached && cached.expiresAt > now) {
    return cached.realPath;
  }

  const result = await params.sandbox.exec(
    `realpath -- ${shellEscape(params.absolutePath)}`,
    params.workingDirectory,
    5000,
  );

  const realPath = result.success ? result.stdout.trim() || null : null;

  if (!sandboxCache) {
    sandboxCache = new Map();
    realPathCache.set(params.sandbox, sandboxCache);
  }
  if (sandboxCache.size > 256) {
    sandboxCache.clear();
  }
  sandboxCache.set(params.absolutePath, {
    realPath,
    expiresAt: now + REALPATH_CACHE_TTL_MS,
  });

  return realPath;
}

export function isSensitiveDotEnvPath(params: {
  requestedPath: string;
  absolutePath: string;
  realPath?: string | null;
}): boolean {
  return (
    isDotEnvFilePath(params.requestedPath) ||
    isDotEnvFilePath(params.absolutePath) ||
    (params.realPath ? isDotEnvFilePath(params.realPath) : false)
  );
}
