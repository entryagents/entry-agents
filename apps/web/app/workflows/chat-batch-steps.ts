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
 * Composite per-step preflight: combines 3 independent DB checks
 * (chat cancellation, live permission mode, unread inbox messages) into ONE
 * `"use step"` invocation per LLM step, cutting per-step preflight Workflow
 * Events from 9 events (3 steps × 3 events) down to 3 events (1 step × 3 events).
 */
export async function prepareStepChecksStep(params: {
  chatId: string;
  workflowRunId: string;
  userId: string;
  sessionId: string;
  overridePermissionMode?: PermissionMode;
}): Promise<StepChecksResult> {
  "use step";

  const [isCancelled, permissionMode, unreadInboxMessages] = await Promise.all([
    import("@/lib/db/sessions")
      .then(async ({ getChatById }) => {
        const chat = await getChatById(params.chatId);
        if (!chat) return true;
        if (chat.status === "cancelled") return true;
        if (
          chat.activeStreamId &&
          chat.activeStreamId !== params.workflowRunId
        ) {
          return true;
        }
        return false;
      })
      .catch(() => false),
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
      .then(async ({ getUnreadInboxMessages, markInboxMessagesRead }) => {
        const unread = await getUnreadInboxMessages(params.chatId);
        if (unread.length === 0) return [];
        await markInboxMessagesRead(
          params.chatId,
          unread.map((m) => m.id),
        );
        return unread.map((m) => ({
          id: m.id,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        }));
      })
      .catch(() => []),
  ]);

  return {
    isCancelled,
    permissionMode,
    unreadInboxMessages,
  };
}
