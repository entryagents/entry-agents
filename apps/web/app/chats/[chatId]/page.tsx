import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { WebAgentUIMessage } from "@/app/types";
import { DiffsProvider } from "@/components/diffs-provider";
import {
  getChatById,
  getChatMessages,
  getChatsBySessionId,
  getChatSummariesBySessionId,
} from "@/lib/db/sessions";
import { getSessionByIdCached } from "@/lib/db/sessions-cache";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { isUserAdmin } from "@/lib/db/users";
import {
  filterModelsForSession,
  sanitizeSelectedModelIdForSession,
  sanitizeUserPreferencesForSession,
} from "@/lib/model-access";
import {
  buildSessionChatModelOptions,
  withMissingModelOption,
} from "@/lib/model-options";
import { fetchAvailableLanguageModelsWithCachedContext } from "@/lib/models-with-context";
import { getServerSession } from "@/lib/session/get-server-session";
import { getInitialIsOnlyChatInSession } from "@/app/sessions/[sessionId]/chats/[chatId]/only-chat-in-session";
import { SessionChatContent } from "@/app/sessions/[sessionId]/chats/[chatId]/session-chat-content";
import { SessionChatProvider } from "@/app/sessions/[sessionId]/chats/[chatId]/session-chat-context";
import { SessionLayoutShell } from "@/app/sessions/[sessionId]/session-layout-shell";

export const maxDuration = 120;

interface ChatPageProps {
  params: Promise<{ chatId: string }>;
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
): Promise<Awaited<ReturnType<typeof getChatById>>> {
  const maxAttempts = isOptimisticChatId(chatId)
    ? OPTIMISTIC_CHAT_RETRY_ATTEMPTS
    : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const chat = await getChatById(chatId);
    if (chat) {
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
}: ChatPageProps): Promise<Metadata> {
  const { chatId } = await params;
  const chat = await getChatById(chatId);
  const sessionRecord = chat
    ? await getSessionByIdCached(chat.sessionId)
    : undefined;

  return {
    title: sessionRecord?.title ?? chat?.title ?? "Chat",
    description: "Review chat progress, files, and outputs.",
  };
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { chatId } = await params;

  const sessionPromise = getServerSession();
  const chatPromise = getChatByIdWithRetry(chatId);
  const headersPromise = headers();
  const messagesPromise = getChatMessages(chatId);
  const modelsPromise = getInitialModels();
  const preferencesPromise = sessionPromise
    .then((s) => (s?.user ? getUserPreferences(s.user.id) : null))
    .catch(() => null);

  void messagesPromise.catch(() => {});
  void modelsPromise.catch(() => {});

  const [session, chat] = await Promise.all([sessionPromise, chatPromise]);
  if (!session?.user) {
    redirect("/");
  }

  // Graceful fallback: if someone navigated to /chats/[sessionId], resolve
  // its first chat and redirect to /chats/[chatId].
  if (!chat) {
    const maybeSession = await getSessionByIdCached(chatId);
    if (maybeSession) {
      const sessionChats = await getChatsBySessionId(maybeSession.id);
      if (sessionChats[0]) {
        redirect(`/chats/${sessionChats[0].id}`);
      }
    }
    notFound();
  }

  const sessionRecord = await getSessionByIdCached(chat.sessionId);
  if (!sessionRecord) {
    notFound();
  }

  const isOwner = sessionRecord.userId === session.user.id;
  const isAdmin = isOwner
    ? false
    : await isUserAdmin(session.user.id).catch(() => false);
  if (!isOwner && !isAdmin) {
    redirect("/");
  }

  const [
    requestHeaders,
    dbMessages,
    initialModels,
    sessionChats,
    rawPreferences,
  ] = await Promise.all([
    headersPromise,
    messagesPromise,
    modelsPromise,
    getChatSummariesBySessionId(sessionRecord.id, sessionRecord.userId),
    preferencesPromise,
  ]);
  const requestHost = requestHeaders.get("host") ?? "";

  let initialChatsData:
    | {
        chats: Awaited<ReturnType<typeof getChatSummariesBySessionId>>;
        defaultModelId: string | null;
      }
    | undefined;
  if (rawPreferences) {
    const sanitizedPrefs = sanitizeUserPreferencesForSession(
      rawPreferences,
      session,
      requestHost,
    );
    initialChatsData = {
      chats: sessionChats,
      defaultModelId: sanitizedPrefs.defaultModelId,
    };
  }

  const initialMessages = dbMessages.map((m) => normalizeStoredMessage(m));

  const messageDurationMap: Record<string, number> = {};
  const messageStartedAtMap: Record<string, string> = {};
  for (let i = 0; i < dbMessages.length; i++) {
    const m = dbMessages[i];
    if (m.role === "assistant" && i > 0) {
      const prev = dbMessages[i - 1];
      if (prev && prev.role === "user") {
        const persistedDurationMs =
          initialMessages[i]?.metadata?.turnDurationMs;
        if (
          typeof persistedDurationMs === "number" &&
          Number.isFinite(persistedDurationMs) &&
          persistedDurationMs > 0
        ) {
          messageDurationMap[m.id] = persistedDurationMs;
        } else {
          const isLastMessage = i === dbMessages.length - 1;
          const endMs =
            isLastMessage && chat.updatedAt
              ? Math.max(m.createdAt.getTime(), chat.updatedAt.getTime())
              : m.createdAt.getTime();
          messageDurationMap[m.id] = Math.max(
            0,
            endMs - prev.createdAt.getTime(),
          );
        }
        messageStartedAtMap[m.id] = prev.createdAt.toISOString();
      }
    }
  }

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
    <SessionLayoutShell
      session={sessionRecord}
      initialChatsData={initialChatsData}
    >
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
    </SessionLayoutShell>
  );
}
