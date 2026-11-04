import { getRun, resumeHook } from "workflow/api";
import {
  requireAuthenticatedUser,
  requireOwnedChatById,
} from "@/app/api/chat/_lib/chat-context";
import type { WebAgentUIMessage } from "@/app/types";
import {
  compareAndSetChatActiveStreamId,
  createChatMessageIfNotExists,
  setChatRunStatus,
  updateChatAssistantActivity,
} from "@/lib/db/sessions";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { chatId } = await context.params;

  const chatContext = await requireOwnedChatById({
    userId: authResult.userId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  const { chat } = chatContext;

  if (!chat.activeStreamId) {
    await setChatRunStatus(chatId, "cancelled").catch(() => {});
    return Response.json({ success: true });
  }

  const activeStreamId = chat.activeStreamId;

  // Persist the latest client-side assistant message snapshot before
  // cancelling so mid-step output is not lost on abrupt stop.
  try {
    const body: unknown = await request.json().catch(() => null);
    if (isStopRequestWithMessage(body)) {
      await persistAssistantSnapshot(chatId, body.assistantMessage);
    }
  } catch {
    // Best-effort — don't block cancellation if persistence fails.
  }

  // 1. Durably mark the chat as cancelled in the database FIRST.
  // This serves as an immediate cooperative stop signal picked up
  // by startStopMonitor and step loops within 150ms.
  await setChatRunStatus(chatId, "cancelled").catch((err) => {
    console.error(
      `[workflow] Failed to setChatRunStatus to cancelled for chat ${chatId}:`,
      err,
    );
  });

  // 2. Clear activeStreamId immediately so a follow-up prompt does not
  // reconnect to the cancelled (but not yet terminal) workflow.
  await compareAndSetChatActiveStreamId(chatId, activeStreamId, null).catch(
    (err: unknown) => {
      console.error(
        `[workflow] Failed to clear activeStreamId for chat ${chatId}:`,
        err,
      );
    },
  );

  // 3. Resume stop hooks if active (official workflow agent cancellation pattern)
  try {
    await Promise.allSettled([
      resumeHook(`chat-stop:${chatId}`, { reason: "user_stop" }),
      resumeHook(`stop:${activeStreamId}`, { reason: "user_stop" }),
    ]);
  } catch {
    // Best effort — hook might not be waiting
  }

  // 4. Cancel the workflow run at the next suspension point
  try {
    const run = getRun(activeStreamId);
    await run.cancel();
  } catch (error) {
    console.warn(
      `[workflow] run.cancel non-fatal warning for chat ${chatId} (stream ${activeStreamId}):`,
      error,
    );
  }

  // 5. Release user billing turn lease immediately
  try {
    const { releaseUserBillingTurn } =
      await import("@/lib/billing/credit-ledger");
    await releaseUserBillingTurn(authResult.userId, activeStreamId).catch(
      () => {},
    );
  } catch {
    // Non-fatal
  }

  return Response.json({ success: true });
}

async function persistAssistantSnapshot(
  chatId: string,
  message: WebAgentUIMessage,
): Promise<void> {
  // Insert-only: if the workflow already persisted a fuller message, this
  // is a no-op. Avoids overwriting server-side content with a stale
  // (throttled) client snapshot.
  const created = await createChatMessageIfNotExists({
    id: message.id,
    chatId,
    role: "assistant",
    parts: message,
  });
  if (created) {
    await updateChatAssistantActivity(chatId, new Date());
  }
}

function isStopRequestWithMessage(
  value: unknown,
): value is { assistantMessage: WebAgentUIMessage } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("assistantMessage" in value) || !value.assistantMessage) {
    return false;
  }
  const msg = value.assistantMessage;
  return (
    typeof msg === "object" &&
    msg !== null &&
    "id" in msg &&
    typeof msg.id === "string" &&
    "role" in msg &&
    msg.role === "assistant" &&
    "parts" in msg &&
    Array.isArray(msg.parts)
  );
}
