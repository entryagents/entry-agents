import {
  requireAuthenticatedUser,
  requireOwnedSessionChat,
} from "@/app/api/sessions/_lib/session-context";
import { verifyRunState } from "@/lib/workflow-run-recovery";
import {
  deleteChatMessageAndFollowing,
  updateChatActiveStreamId,
} from "@/lib/db/sessions";

type RouteContext = {
  params: Promise<{ sessionId: string; chatId: string; messageId: string }>;
};

export async function DELETE(req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId, chatId, messageId } = await context.params;

  const chatContext = await requireOwnedSessionChat({
    userId: authResult.userId,
    sessionId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  const { chat } = chatContext;

  if (chat.activeStreamId) {
    const outcome = await verifyRunState(chat.activeStreamId);

    if (outcome === "alive") {
      return Response.json(
        { error: "Cannot delete messages while a response is streaming" },
        { status: 409 },
      );
    }

    if (outcome === "unknown") {
      // Deleting messages under a possibly-live run is destructive, so the
      // unverified case fails closed after bounded retries (unlike the
      // submit path, which fails open).
      console.error("could not verify chat run state:", chat.activeStreamId);
      return Response.json(
        {
          error:
            "Can't confirm this chat is idle right now. Try deleting again in a moment.",
        },
        { status: 503 },
      );
    }

    // Terminal or definitively gone — clear the stale activeStreamId.
    await updateChatActiveStreamId(chatId, null);
  }

  const result = await deleteChatMessageAndFollowing(chatId, messageId);

  if (result.status === "not_found") {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  if (result.status === "not_user_message") {
    return Response.json(
      { error: "Only user messages can be deleted" },
      { status: 400 },
    );
  }

  return Response.json({
    success: true,
    deletedMessageIds: result.deletedMessageIds,
  });
}
