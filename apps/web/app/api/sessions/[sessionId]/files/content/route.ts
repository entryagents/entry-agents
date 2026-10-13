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
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".mid": "audio/midi",
    ".midi": "audio/midi",
    ".mp3": "audio/mpeg",
    ".oga": "audio/ogg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".weba": "audio/webm",
    ".3gp": "video/3gpp",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".mpeg": "video/mpeg",
    ".mp4": "video/mp4",
    ".ogv": "video/ogg",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".zip": "application/zip",
    ".gz": "application/gzip",
    ".tar": "application/x-tar",
    ".7z": "application/x-7z-compressed",
    ".rar": "application/vnd.rar",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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
    const isBinary = Boolean(previewMimeType) || buffer.includes(0);

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
