import type { ModelMessage } from "ai";
import type { AvailableModel } from "@/lib/models";
import type { SerializableCompactionCheckpoint } from "./chat-compaction";

export type PermissionMode = "ask" | "autoAccept" | "fullAccess";

export interface TurnBootstrapResult {
  vercelConnected: boolean;
  githubConnected: boolean;
  checkpoint: SerializableCompactionCheckpoint | null;
  modelCostCatalog: AvailableModel[];
  /** Fraction in [0.05, 0.98], default 0.95. */
  compactionThreshold: number;
}

export interface StepChecksResult {
  isCancelled: boolean;
  permissionMode: PermissionMode;
  unreadInboxMessages: Array<{
    id: string;
    content: string;
    createdAt: string;
  }>;
}

/**
 * Checks whether a chat has been deleted, marked cancelled, superseded by a
 * newer active stream, or cancelled at the Workflow SDK run level.
 * Pure Node helper intended to run directly inside an existing `"use step"`
 * (such as `runAgentStep`) without burning extra Workflow Events.
 */
export async function checkChatCancelledInternal(
  chatId: string,
  workflowRunId: string,
): Promise<boolean> {
  const [dbCancelled, runCancelled] = await Promise.all([
    import("@/lib/db/sessions")
      .then(async ({ getChatById }) => {
        const chat = await getChatById(chatId);
        if (!chat) return true;
        if (chat.status === "cancelled") return true;
        if (
          typeof chat.activeStreamId === "string" &&
          chat.activeStreamId.length > 0 &&
          chat.activeStreamId !== workflowRunId
        ) {
          return true;
        }
        return false;
      })
      .catch(() => false),
    import("workflow/api")
      .then(async ({ getRun }) => {
        const currentRun = getRun(workflowRunId);
        const currentStatus = await currentRun.status;
        return currentStatus === "cancelled";
      })
      .catch(() => false),
  ]);

  return dbCancelled || runCancelled;
}

/**
 * Formats unread user steering inbox messages into a single user ModelMessage
 * injected into the LLM context before the step executes.
 */
export function formatSteeringInboxMessage(
  unreadInboxMessages: StepChecksResult["unreadInboxMessages"],
): ModelMessage | null {
  if (unreadInboxMessages.length === 0) {
    return null;
  }
  const formattedSteering = unreadInboxMessages
    .map((m, idx) => `${idx + 1}. ${m.content}`)
    .join("\n");
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: `[STEERING MESSAGE FROM USER]\nThe user sent the following real-time steering instruction(s) while you were working (already marked read — do NOT call the \`inbox\` tool for these):\n${formattedSteering}`,
      },
    ],
  };
}

/**
 * Pure-Node pre-step preflight executed directly inside `runAgentStep`:
 * checks cancellation, resolves live permission mode, and reads unread inbox
 * messages in parallel — only marking inbox messages read if the chat is NOT
 * cancelled, so cancelled turns never swallow unread user steering messages.
 */
export async function runStepPreflightChecks(params: {
  chatId: string;
  workflowRunId: string;
  userId: string;
  sessionId: string;
  overridePermissionMode?: PermissionMode;
}): Promise<StepChecksResult> {
  const [isCancelled, permissionMode, rawUnread] = await Promise.all([
    checkChatCancelledInternal(params.chatId, params.workflowRunId),
    params.overridePermissionMode
      ? Promise.resolve(params.overridePermissionMode)
      : Promise.all([
          import("@/lib/db/sessions").then(({ getSessionById }) =>
            getSessionById(params.sessionId),
          ),
          import("@/lib/db/user-preferences")
            .then(({ getUserPreferences }) => getUserPreferences(params.userId))
            .catch(() => null),
        ])
          .then(([sessionRecord, rawPreferences]) => {
            return (
              sessionRecord?.permissionModeOverride ??
              rawPreferences?.defaultPermissionMode ??
              ("ask" as PermissionMode)
            );
          })
          .catch(() => "ask" as PermissionMode),
    import("@/lib/db/inbox")
      .then(({ getUnreadInboxMessages }) =>
        getUnreadInboxMessages(params.chatId),
      )
      .catch(() => []),
  ]);

  if (isCancelled || rawUnread.length === 0) {
    return {
      isCancelled,
      permissionMode,
      unreadInboxMessages: [],
    };
  }

  await import("@/lib/db/inbox")
    .then(({ markInboxMessagesRead }) =>
      markInboxMessagesRead(
        params.chatId,
        rawUnread.map((m) => m.id),
      ),
    )
    .catch(() => {});

  return {
    isCancelled: false,
    permissionMode,
    unreadInboxMessages: rawUnread.map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/**
 * Composite startup step: combines 4 independent read-only lookups
 * (Vercel connected, GitHub connected, compaction checkpoint, model cost catalog)
 * into ONE `"use step"` invocation, cutting turn-startup Workflow Events from
 * 12 events (4 steps × 3 events) down to 3 events (1 step × 3 events).
 */
export async function prepareTurnBootstrapStep(params: {
  userId: string;
  chatId: string;
}): Promise<TurnBootstrapResult> {
  "use step";

  const [vercelConnected, githubConnected, checkpoint, modelCostCatalog] =
    await Promise.all([
      import("@/lib/vercel/token")
        .then(({ hasVercelAccountLinked }) =>
          hasVercelAccountLinked(params.userId),
        )
        .catch(() => false),
      import("@/lib/github/client")
        .then(
          async ({ getUserOctokit }) =>
            (await getUserOctokit(params.userId)) !== null,
        )
        .catch(() => false),
      Promise.all([
        import("@/lib/db/compaction-checkpoints"),
        import("@/lib/compact/helpers"),
        import("@/app/workflows/serialization"),
      ])
        .then(
          async ([
            { getLatestCompactionCheckpoint },
            { decodeCheckpointSummary },
            { withoutUndefined },
          ]) => {
            const row = await getLatestCompactionCheckpoint(params.chatId);
            if (!row || !row.summaryText) return null;
            const decoded = decodeCheckpointSummary(row.summaryText);
            return withoutUndefined({
              summaryText: decoded.summaryText,
              compactedUpToMessageCount: row.compactedUpToMessageCount,
              ...(row.compactedUpToMessageId
                ? { compactedUpToMessageId: row.compactedUpToMessageId }
                : {}),
              ...(decoded.exactBoundary ? { exactBoundary: true } : {}),
            });
          },
        )
        .catch(() => null),
      import("@/lib/models-with-context")
        .then(async ({ fetchModelCostCatalog }) => {
          const { withoutUndefined } =
            await import("@/app/workflows/serialization");
          let lastError: unknown;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const catalog = await fetchModelCostCatalog();
              if (catalog.length > 0 || attempt === 3) {
                return withoutUndefined(catalog);
              }
            } catch (error) {
              lastError = error;
              if (attempt < 3) {
                await new Promise((resolve) =>
                  setTimeout(resolve, 250 * attempt),
                );
              }
            }
          }
          if (lastError) {
            throw lastError;
          }
          return [] as AvailableModel[];
        })
        .catch((error) => {
          console.error(
            "Failed to fetch entry-gateway model/pricing catalog for cost tracking:",
            error,
          );
          return [] as AvailableModel[];
        }),
    ]);

  const compactionThreshold = await import("@/lib/db/user-preferences")
    .then(async ({ getUserPreferences }) => {
      const prefs = await getUserPreferences(params.userId);
      const pct = prefs?.compactionThreshold;
      if (typeof pct === "number" && pct >= 5 && pct <= 98) {
        return pct / 100;
      }
      return 0.95;
    })
    .catch(() => 0.95);

  return {
    vercelConnected,
    githubConnected,
    checkpoint,
    modelCostCatalog,
    compactionThreshold,
  };
}

/**
 * @deprecated Hot-loop preflight checks are now folded directly into
 * `runAgentStep` via `runStepPreflightChecks` so each LLM step consumes only
 * 1 Workflow step (3 events) instead of 2–4 steps (6–12 events). Kept for
 * backwards compatibility with standalone callers and tests.
 */
export async function prepareStepChecksStep(params: {
  chatId: string;
  workflowRunId: string;
  userId: string;
  sessionId: string;
  overridePermissionMode?: PermissionMode;
}): Promise<StepChecksResult> {
  "use step";

  return runStepPreflightChecks(params);
}
