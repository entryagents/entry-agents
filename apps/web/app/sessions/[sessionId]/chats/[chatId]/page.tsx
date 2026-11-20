import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { WebAgentUIMessage } from "@/app/types";
import { DiffsProvider } from "@/components/diffs-provider";
import {
  getChatById,
  getChatMessages,
  getChatSummariesBySessionId,
} from "@/lib/db/sessions";
import { getSessionByIdCached } from "@/lib/db/sessions-cache";
import {
  buildSessionChatModelOptions,
  withMissingModelOption,
} from "@/lib/model-options";
import {
  filterModelsForSession,
  sanitizeSelectedModelIdForSession,
} from "@/lib/model-access";
import { fetchAvailableLanguageModelsWithCachedContext } from "@/lib/models-with-context";
import { getServerSession } from "@/lib/session/get-server-session";
import { isUserAdmin } from "@/lib/db/users";
import { getInitialIsOnlyChatInSession } from "./only-chat-in-session";
import { SessionChatContent } from "./session-chat-content";
import { SessionChatProvider } from "./session-chat-context";

export const maxDuration = 120;

interface SessionChatPageProps {
  params: Promise<{ sessionId: string; chatId: string }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOptimisticChatId(chatId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    chatId,
  );
}

const OPTIMISTIC_CHAT_RETRY_DELAY_MS = 100;
const OPTIMISTIC_CHAT_RETRY_ATTEMPTS = 50;

/**
 * Normalizes a stored chat_messages row into a WebAgentUIMessage.
 *
 * Web persists the WHOLE UIMessage ({id, role, parts}) in the `parts` column
 * (see app/api/chat/route.ts — `parts: latestMessage`), so the common case is
 * that the column IS the message. The desktop client historically persisted
 * only the bare parts ARRAY, which made every desktop-authored message render
 * as undefined.parts and blew up the chat page with "Something went wrong".
 * Accept both shapes: a bare array is wrapped, an object is passed through.
 */
function normalizeStoredMessage(m: {
  id: string;
  role: string;
  parts: unknown;
  metadata?: unknown;
  createdAt: Date;
}): WebAgentUIMessage {
  const raw = m.parts as unknown;
  if (Array.isArray(raw)) {
    return {
      id: m.id,
      role: m.role as WebAgentUIMessage["role"],
      parts: raw,
      ...(m.metadata
        ? { metadata: m.metadata as WebAgentUIMessage["metadata"] }
        : {}),
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
        ((obj.metadata ?? m.metadata) as WebAgentUIMessage["metadata"]) ??
        undefined,
    } as WebAgentUIMessage;
  }
  return {
    id: m.id,
    role: m.role as WebAgentUIMessage["role"],
    parts: [],
    ...(m.metadata
      ? { metadata: m.metadata as WebAgentUIMessage["metadata"] }
      : {}),
  } as WebAgentUIMessage;
}

async function getInitialModels() {
  try {
    return await fetchAvailableLanguageModelsWithCachedContext();
  } catch {
    return [];
  }
}

async function getChatByIdWithRetry(
  chatId: string,
  sessionId: string,
): Promise<Awaited<ReturnType<typeof getChatById>>> {
  const maxAttempts = isOptimisticChatId(chatId)
    ? OPTIMISTIC_CHAT_RETRY_ATTEMPTS
    : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const chat = await getChatById(chatId);
    if (chat && chat.sessionId === sessionId) {
      return chat;
    }
    if (attempt < maxAttempts) {
      await sleep(OPTIMISTIC_CHAT_RETRY_DELAY_MS);
    }
  }
  return undefined;
}

export async function generateMetadata({
  params,
}: SessionChatPageProps): Promise<Metadata> {
  const { sessionId } = await params;
  const sessionRecord = await getSessionByIdCached(sessionId);

  return {
    title: sessionRecord?.title ?? `Session ${sessionId}`,
    description: "Review session progress, chats, and outputs.",
  };
}

export default async function SessionChatPage({
  params,
}: SessionChatPageProps) {
  const { sessionId, chatId } = await params;

  // Start all independent reads immediately in parallel so auth, session,
  // chat, messages, models, and headers overlap in a single wave.
  // Auth & ownership checks below strictly gate access before any data is used.
  const sessionPromise = getServerSession();
  const sessionRecordPromise = getSessionByIdCached(sessionId);
  const headersPromise = headers();
  const chatPromise = getChatByIdWithRetry(chatId, sessionId);
  const messagesPromise = getChatMessages(chatId);
  const modelsPromise = getInitialModels();
  const sessionChatsPromise = sessionRecordPromise.then((rec) =>
    rec ? getChatSummariesBySessionId(sessionId, rec.userId) : [],
  );

  // Prevent unhandled rejections if auth/existence checks redirect early.
  void chatPromise.catch(() => {});
  void messagesPromise.catch(() => {});
  void modelsPromise.catch(() => {});
  void sessionChatsPromise.catch(() => {});

  const [session, sessionRecord] = await Promise.all([
    sessionPromise,
    sessionRecordPromise,
  ]);
  if (!session?.user) {
    redirect("/");
  }

  if (!sessionRecord) {
    notFound();
  }

  // Check ownership (admins can audit any user session/chat)
  const isOwner = sessionRecord.userId === session.user.id;
  const isAdmin = isOwner
    ? false
    : await isUserAdmin(session.user.id).catch(() => false);
  if (!isOwner && !isAdmin) {
    redirect("/");
  }

  const [requestHeaders, chat, dbMessages, initialModels, sessionChats] =
    await Promise.all([
      headersPromise,
      chatPromise,
      messagesPromise,
      modelsPromise,
      sessionChatsPromise,
    ]);
  const requestHost = requestHeaders.get("host") ?? "";

  if (!chat) {
    if (isOptimisticChatId(chatId)) {
      redirect(`/sessions/${sessionId}`);
    }
    notFound();
  }

  const initialMessages = dbMessages.map((m) => normalizeStoredMessage(m));

  // Compute generation duration for each assistant message:
  // duration = assistant.createdAt − preceding user.createdAt
  const messageDurationMap: Record<string, number> = {};
  // Also store the preceding user message's createdAt so that a currently-
  // streaming message can show a live timer relative to when the user sent it.
  const messageStartedAtMap: Record<string, string> = {};
  for (let i = 0; i < dbMessages.length; i++) {
    const m = dbMessages[i];
    if (m.role === "assistant" && i > 0) {
      const prev = dbMessages[i - 1];
      if (prev && prev.role === "user") {
        messageDurationMap[m.id] =
          m.createdAt.getTime() - prev.createdAt.getTime();
        messageStartedAtMap[m.id] = prev.createdAt.toISOString();
      }
    }
  }

  // Fallback for refresh-during-stream: the streaming assistant message may
  // not be in the maps above (not yet persisted or different ID). Use the
  // last user message's createdAt so the timer still starts from the right
  // moment.
  const lastUserMessage = dbMessages
    .toReversed()
    .find((m) => m.role === "user");
  const lastUserMessageSentAt = lastUserMessage
    ? lastUserMessage.createdAt.toISOString()
    : null;
  const codeEditorDisabledReason = null;
  const filteredModels = filterModelsForSession(
    initialModels,
    session,
    requestHost,
  );
  const chatModelId =
    sanitizeSelectedModelIdForSession(chat.modelId, session, requestHost) ??
    chat.modelId;
  const initialModelOptions = withMissingModelOption(
    buildSessionChatModelOptions(filteredModels),
    chatModelId,
  );

  const initialIsOnlyChatInSession = getInitialIsOnlyChatInSession(
    sessionChats,
    chat.id,
  );

  return (
    <DiffsProvider>
      <SessionChatProvider
        session={sessionRecord}
        chat={{ ...chat, modelId: chatModelId }}
        initialMessages={initialMessages}
        initialModelOptions={initialModelOptions}
      >
        <SessionChatContent
          initialIsOnlyChatInSession={initialIsOnlyChatInSession}
          messageDurationMap={messageDurationMap}
          messageStartedAtMap={messageStartedAtMap}
          lastUserMessageSentAt={lastUserMessageSentAt}
          codeEditorDisabledReason={codeEditorDisabledReason}
        />
      </SessionChatProvider>
    </DiffsProvider>
  );
}
