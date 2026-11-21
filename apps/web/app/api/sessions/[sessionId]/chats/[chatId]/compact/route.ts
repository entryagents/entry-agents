import {
  requireAuthenticatedUser,
  requireOwnedSessionChat,
} from "@/app/api/sessions/_lib/session-context";
import type { WebAgentUIMessage } from "@/app/types";
import { runManualCompaction } from "@/lib/compact/server";
import {
  ACTIVE_CHAT_RUN_STATUSES,
  compareAndSetChatActiveStreamId,
  getChatMessages,
  setChatRunStatus,
} from "@/lib/db/sessions";
import { verifyRunStateWithStatus } from "@/lib/workflow-run-recovery";

type RouteContext = {
  params: Promise<{ sessionId: string; chatId: string }>;
};

interface CompactRequestBody {
  focus?: string;
}

function normalizeStoredMessage(m: {
  id: string;
  role: string;
  parts: unknown;
  metadata?: unknown;
}): WebAgentUIMessage {
  const raw = m.parts as unknown;
  const fallbackMetadata =
    (m.metadata as WebAgentUIMessage["metadata"]) ?? undefined;
  if (Array.isArray(raw)) {
    return {
      id: m.id,
      role: m.role as WebAgentUIMessage["role"],
      parts: raw,
      ...(fallbackMetadata !== undefined ? { metadata: fallbackMetadata } : {}),
    } as WebAgentUIMessage;
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return {
      ...obj,
      id: typeof obj.id === "string" ? obj.id : m.id,
      role: (typeof obj.role === "string"
        ? obj.role
        : m.role) as WebAgentUIMessage["role"],
      parts: Array.isArray(obj.parts) ? obj.parts : [],
      metadata:
        (obj.metadata as WebAgentUIMessage["metadata"]) ?? fallbackMetadata,
    } as WebAgentUIMessage;
  }
  return {
    id: m.id,
    role: m.role as WebAgentUIMessage["role"],
    parts: [],
    ...(fallbackMetadata !== undefined ? { metadata: fallbackMetadata } : {}),
  } as WebAgentUIMessage;
}

export async function POST(req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId, chatId } = await context.params;
  const chatContext = await requireOwnedSessionChat({
    userId: authResult.userId,
    sessionId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  let body: CompactRequestBody = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) {
      body = JSON.parse(text) as CompactRequestBody;
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const focusInstructions =
    typeof body.focus === "string" ? body.focus.trim() : undefined;

  // Reject compaction if a live stream is currently running.
  let activeStreamId = chatContext.chat.activeStreamId;
  let chatStatus = chatContext.chat.status;
  if (activeStreamId) {
    const { outcome, terminalStatus } =
      await verifyRunStateWithStatus(activeStreamId);
    if (outcome === "gone") {
      const cleared = await compareAndSetChatActiveStreamId(
        chatId,
        activeStreamId,
        null,
      ).catch(() => false);
      if (cleared) {
        activeStreamId = null;
        if (ACTIVE_CHAT_RUN_STATUSES.some((s) => s === chatStatus)) {
          const nextStatus = terminalStatus ?? "idle";
          await setChatRunStatus(chatId, nextStatus, {
            onlyIfActiveStreamId: null,
          });
          chatStatus = nextStatus;
        }
      }
    }
  }

  if (
    activeStreamId !== null ||
    ACTIVE_CHAT_RUN_STATUSES.some((s) => s === chatStatus)
  ) {
    return Response.json(
      { error: "Available when this turn ends" },
      { status: 409 },
    );
  }

  const rows = await getChatMessages(chatId);
  const uiMessages = rows.map(normalizeStoredMessage);

  const result = await runManualCompaction({
    chatId,
    sessionId,
    userId: authResult.userId,
    chatModelId: chatContext.chat.modelId,
    chatReasoningEffort: chatContext.chat.reasoningEffort,
    uiMessages,
    ...(focusInstructions ? { focusInstructions } : {}),
  });

  return Response.json(result);
}
