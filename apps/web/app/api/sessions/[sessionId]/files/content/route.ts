import { posix } from "node:path";
import { connectSandbox } from "@entry-agents/sandbox";
import {
  requireAuthenticatedUser,
  requireOwnedSessionWithSandboxGuard,
} from "@/app/api/sessions/_lib/session-context";
import { updateSession } from "@/lib/db/sessions";
import { buildHibernatedLifecycleUpdate } from "@/lib/sandbox/lifecycle";
import {
  clearUnavailableSandboxState,
  hasRuntimeSandboxState,
  isSandboxUnavailableError,
} from "@/lib/sandbox/utils";

export type WorkspaceFileContentResponse = {
  path: string;
  content: string;
  size: number;
  kind?: "text" | "image" | "pdf" | "audio" | "video" | "binary";
  mimeType?: string;
  contentBase64?: string;
};

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

const MAX_FILE_PREVIEW_BYTES = 5_000_000;

function normalizeRequestedFilePath(rawPath: string | null): string | null {
  if (!rawPath) {
    return null;
  }

  const trimmedPath = rawPath.trim();
  if (!trimmedPath || trimmedPath.includes("\0")) {
    return null;
  }

  const normalizedPath = posix.normalize(trimmedPath.replaceAll("\\", "/"));
  if (
    !normalizedPath ||
    normalizedPath === "." ||
    normalizedPath === ".." ||
    normalizedPath.startsWith("../") ||
    posix.isAbsolute(normalizedPath)
  ) {
    return null;
  }

  return normalizedPath;
}

function getPreviewMimeType(filePath: string): string | null {
  const extension = posix.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "video/webm",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return mimeTypes[extension] ?? null;
}

function getPreviewKind(
  mimeType: string | null,
): WorkspaceFileContentResponse["kind"] {
  if (!mimeType) return "binary";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "binary";
}

function isMissingFileError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("enoent") ||
    normalizedMessage.includes("no such file") ||
    normalizedMessage.includes("not found")
  );
}

export async function GET(req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId } = await context.params;
  const requestedPath = new URL(req.url).searchParams.get("path");
  const filePath = normalizeRequestedFilePath(requestedPath);
  if (!filePath) {
    return Response.json({ error: "Invalid file path" }, { status: 400 });
  }

  const sessionContext = await requireOwnedSessionWithSandboxGuard({
    userId: authResult.userId,
    sessionId,
    sandboxGuard: hasRuntimeSandboxState,
    sandboxErrorMessage: "Sandbox not initialized",
  });
  if (!sessionContext.ok) {
    return sessionContext.response;
  }

  const { sessionRecord } = sessionContext;
  const sandboxState = sessionRecord.sandboxState;
  if (!sandboxState) {
    return Response.json({ error: "Sandbox not initialized" }, { status: 400 });
  }

  try {
    const sandbox = await connectSandbox(sandboxState);
    const fullPath = posix.join(sandbox.workingDirectory, filePath);
    const stats = await sandbox.stat(fullPath);

    if (!stats.isFile()) {
      return Response.json(
        {
          error: stats.isDirectory()
            ? "Directories cannot be previewed"
            : "Only regular files can be previewed",
        },
        { status: 400 },
      );
    }

    if (stats.size > MAX_FILE_PREVIEW_BYTES) {
      return Response.json(
        { error: "File is too large to preview" },
        { status: 413 },
      );
    }

    const previewMimeType = getPreviewMimeType(filePath);
    const buffer = await sandbox.readFileBuffer(fullPath);
    const isBinary = buffer.includes(0);

    if (isBinary) {
      const kind = getPreviewKind(previewMimeType);
      const response: WorkspaceFileContentResponse = {
        path: filePath,
        content: "",
        size: stats.size,
        kind,
        mimeType: previewMimeType ?? "application/octet-stream",
        contentBase64: buffer.toString("base64"),
      };
      return Response.json(response, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const content = buffer.toString("utf-8");
    const response: WorkspaceFileContentResponse = {
      path: filePath,
      content,
      size: stats.size,
      kind: "text",
      mimeType: "text/plain",
    };

    return Response.json(response, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isSandboxUnavailableError(message)) {
      await updateSession(sessionId, {
        sandboxState: clearUnavailableSandboxState(
          sessionRecord.sandboxState,
          message,
        ),
        ...buildHibernatedLifecycleUpdate(),
      });
      return Response.json(
        { error: "Sandbox is unavailable. Please resume sandbox." },
        { status: 409 },
      );
    }

    if (isMissingFileError(message)) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }

    console.error("Failed to load workspace file:", error);
    return Response.json(
      { error: "Failed to load workspace file" },
      { status: 500 },
    );
  }
}
