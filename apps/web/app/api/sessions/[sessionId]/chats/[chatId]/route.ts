import {
  requireAuthenticatedUser,
  requireOwnedSessionChat,
} from "@/app/api/sessions/_lib/session-context";
import type { WebAgentUIMessage } from "@/app/types";
import {
  deleteChat,
  getChatMessages,
  getChatsBySessionId,
  updateChat,
  updateChatActiveStreamId,
  setChatRunStatus,
  ACTIVE_CHAT_RUN_STATUSES,
} from "@/lib/db/sessions";
import { verifyRunState } from "@/lib/workflow-run-recovery";
import { sanitizeSelectedModelIdForSession } from "@/lib/model-access";
import {
  reasoningEffortSchema,
  sanitizeReasoningEffort,
} from "@/lib/model-reasoning";
import { getServerSession } from "@/lib/session/get-server-session";

type RouteContext = {
  params: Promise<{ sessionId: string; chatId: string }>;
};

interface UpdateChatRequest {
  title?: string;
  modelId?: string;
  reasoningEffort?: string | null;
}

export interface ChatRefreshResponse {
  chat: {
    id: string;
    modelId: string | null;
    reasoningEffort: string | null;
    activeStreamId: string | null;
  };
  // Durable run lifecycle -- the source of truth for "what is this chat
  // doing?" (see chats.status). A returning viewer reads this instead of
  // inferring state from its own optimistic overlay, which is the whole
  // point of the client being a viewer.
  status:
    | "idle"
    | "queued"
    | "running"
    | "sleeping"
    | "resuming"
    | "completed"
    | "failed"
    | "cancelled";
  isStreaming: boolean;
  messages: WebAgentUIMessage[];
}

function normalizeStoredMessage(m: {
  id: string;
  role: string;
  parts: unknown;
  createdAt?: Date;
}): WebAgentUIMessage {
  const raw = m.parts as unknown;
  if (Array.isArray(raw)) {
    return {
      id: m.id,
      role: m.role as WebAgentUIMessage["role"],
      parts: raw,
    } as WebAgentUIMessage;
  }
  if (raw && typeof raw === "object") {
    const obj = raw as { id?: unknown; role?: unknown; parts?: unknown };
    return {
      id: typeof obj.id === "string" ? obj.id : m.id,
      role: (typeof obj.role === "string"
        ? obj.role
        : m.role) as WebAgentUIMessage["role"],
      parts: Array.isArray(obj.parts) ? obj.parts : [],
    } as WebAgentUIMessage;
  }
  return {
    id: m.id,
    role: m.role as WebAgentUIMessage["role"],
    parts: [],
  } as WebAgentUIMessage;
}

export async function GET(req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const session = await getServerSession();
  const { sessionId, chatId } = await context.params;

  const chatContext = await requireOwnedSessionChat({
    userId: authResult.userId,
    sessionId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  let activeStreamId = chatContext.chat.activeStreamId;
  let chatStatus = chatContext.chat.status;
  let isStreaming = activeStreamId !== null;

  if (activeStreamId) {
    const outcome = await verifyRunState(activeStreamId);
    if (outcome === "gone") {
      await updateChatActiveStreamId(chatId, null);
      await setChatRunStatus(chatId, "idle");
      activeStreamId = null;
      chatStatus = "idle";
      isStreaming = false;
    }
  } else if (
    ACTIVE_CHAT_RUN_STATUSES.includes(chatStatus as any) &&
    chatContext.chat.runStatusUpdatedAt &&
    Date.now() - new Date(chatContext.chat.runStatusUpdatedAt).getTime() >
      120_000
  ) {
    await setChatRunStatus(chatId, "idle");
    chatStatus = "idle";
    isStreaming = false;
  }

  const messages = await getChatMessages(chatId);
  const modelId =
    sanitizeSelectedModelIdForSession(
      chatContext.chat.modelId,
      session,
      req.url,
    ) ??
    chatContext.chat.modelId ??
    null;

  return Response.json({
    chat: {
      id: chatContext.chat.id,
      modelId,
      reasoningEffort: modelId
        ? sanitizeReasoningEffort(modelId, chatContext.chat.reasoningEffort)
        : null,
      activeStreamId,
    },
    status: chatStatus,
    isStreaming,
    messages: messages.map((message) => normalizeStoredMessage(message)),
  } satisfies ChatRefreshResponse);
}

export async function PATCH(req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const session = await getServerSession();
  const { sessionId, chatId } = await context.params;

  const chatContext = await requireOwnedSessionChat({
    userId: authResult.userId,
    sessionId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  let body: UpdateChatRequest;
  try {
    body = (await req.json()) as UpdateChatRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const nextTitle = body.title?.trim();
  const nextModelId = body.modelId?.trim();
  const hasReasoningEffortField = Object.hasOwn(body, "reasoningEffort");

  if (!nextTitle && !nextModelId && !hasReasoningEffortField) {
    return Response.json(
      { error: "At least one field is required" },
      { status: 400 },
    );
  }

  const updatePayload: {
    title?: string;
    modelId?: string;
    reasoningEffort?: string | null;
  } = {};
  if (nextTitle) {
    updatePayload.title = nextTitle;
  }
  if (nextModelId) {
    const sanitizedModelId = sanitizeSelectedModelIdForSession(
      nextModelId,
      session,
      req.url,
    );
    updatePayload.modelId = sanitizedModelId ?? nextModelId;
  }
  if (hasReasoningEffortField) {
    if (body.reasoningEffort === null) {
      updatePayload.reasoningEffort = null;
    } else {
      const parsed = reasoningEffortSchema.safeParse(body.reasoningEffort);
      if (!parsed.success) {
        return Response.json(
          { error: "Invalid reasoningEffort value" },
          { status: 400 },
        );
      }
      updatePayload.reasoningEffort = parsed.data;
    }
  }

  const updatedChat = await updateChat(chatId, updatePayload);
  if (!updatedChat) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  const resolvedModelId =
    sanitizeSelectedModelIdForSession(updatedChat.modelId, session, req.url) ??
    updatedChat.modelId;

  return Response.json({
    chat: {
      ...updatedChat,
      modelId: resolvedModelId,
      reasoningEffort: resolvedModelId
        ? sanitizeReasoningEffort(resolvedModelId, updatedChat.reasoningEffort)
        : null,
    },
  });
}

export async function DELETE(_req: Request, context: RouteContext) {
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

  const chats = await getChatsBySessionId(sessionId);
  if (chats.length <= 1) {
    return Response.json(
      { error: "Cannot delete the only chat in a session" },
      { status: 400 },
    );
  }

  await deleteChat(chatId);
  return Response.json({ success: true });
}
