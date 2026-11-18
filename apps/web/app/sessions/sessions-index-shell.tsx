"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_SANDBOX_TYPE } from "@/components/sandbox-selector-compact";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useModelOptions } from "@/hooks/use-model-options";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { savePendingInitialPrompt } from "@/lib/chat/pending-initial-prompt";
import { sanitizePromptToTitle } from "@/lib/random-city";
import {
  ChatComposer,
  type BuiltComposerMessage,
} from "./[sessionId]/chats/[chatId]/components/chat-composer";
import { useSessionsShell } from "./sessions-shell-context";

export function SessionsIndexShell() {
  const router = useRouter();
  const { createSession } = useSessionsShell();
  const { preferences } = useUserPreferences();
  const {
    modelOptions,
    loading: modelOptionsLoading,
    userPlan,
    freePlanModelId,
    freeTierAllowedModelIds,
    creditGate,
  } = useModelOptions();

  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(null);
  const [permissionMode, setPermissionMode] = useState<
    "ask" | "autoAccept" | "fullAccess"
  >("autoAccept");
  const [isCreating, setIsCreating] = useState(false);

  const effectiveModelId =
    selectedModelId ??
    preferences?.defaultModelId ??
    modelOptions[0]?.id ??
    null;

  const isFreeTierLocked =
    userPlan?.id === "free" &&
    (freeTierAllowedModelIds.length > 0 || Boolean(freePlanModelId));

  const composerGate = creditGate?.blocked
    ? {
        title: "Credit limit reached",
        reason: creditGate.reason ?? "Upgrade your plan to continue.",
      }
    : null;

  const handleSubmitMessage = useCallback(
    async (built: BuiltComposerMessage) => {
      if (isCreating) return;
      setIsCreating(true);
      try {
        const trimmedDisplayText = built.displayText.trim();
        const initialTitle =
          trimmedDisplayText.length > 0
            ? sanitizePromptToTitle(trimmedDisplayText)
            : undefined;
        const { session: createdSession, chat } = await createSession({
          ...(initialTitle ? { title: initialTitle } : {}),
          isNewBranch: false,
          sandboxType: preferences?.defaultSandboxType ?? DEFAULT_SANDBOX_TYPE,
          autoCommitPush: preferences?.autoCommitPush ?? false,
          autoCreatePr: preferences?.autoCreatePr ?? false,
        });

        if (
          effectiveModelId &&
          effectiveModelId !== preferences?.defaultModelId
        ) {
          await fetch(`/api/sessions/${createdSession.id}/chats/${chat.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelId: effectiveModelId }),
          }).catch(() => {});
        }

        savePendingInitialPrompt(chat.id, built);
        router.push(`/sessions/${createdSession.id}/chats/${chat.id}`, {
          scroll: false,
        });
      } catch (error) {
        setIsCreating(false);
        toast.error(
          error instanceof Error ? error.message : "Failed to start chat",
        );
      }
    },
    [
      createSession,
      effectiveModelId,
      isCreating,
      preferences?.autoCommitPush,
      preferences?.autoCreatePr,
      preferences?.defaultModelId,
      preferences?.defaultSandboxType,
      router,
    ],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b border-border px-3 py-2 lg:px-4 lg:py-3">
        <div className="flex min-h-8 items-center gap-2">
          <SidebarTrigger className="shrink-0" />
          <span className="text-sm font-medium text-foreground">New chat</span>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-3 py-6 sm:px-6">
        <div className="w-full max-w-3xl space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
              What do you want to build?
            </h1>
          </div>

          <ChatComposer
            isArchived={false}
            isChatInFlight={isCreating}
            hasPendingResponse={isCreating}
            composerGate={composerGate}
            modelId={effectiveModelId}
            reasoningEffort={reasoningEffort}
            modelOptions={modelOptions}
            modelOptionsLoading={modelOptionsLoading}
            isFreeTierLocked={isFreeTierLocked}
            freePlanModelId={freePlanModelId}
            freeTierAllowedModelIds={freeTierAllowedModelIds}
            onModelChange={setSelectedModelId}
            onReasoningEffortChange={setReasoningEffort}
            onUpgradeRequired={() => {
              router.push("/settings/billing");
            }}
            permissionMode={permissionMode}
            isTogglingPermissionMode={false}
            onPermissionModeChange={setPermissionMode}
            files={null}
            filesLoading={false}
            skills={null}
            skillsLoading={false}
            pendingQuestions={[]}
            hasPendingQuestion={false}
            onSubmitQuestionAnswers={() => {}}
            onCancelQuestion={() => {}}
            queuedCount={0}
            inboxUnreadCount={0}
            isSendingInbox={false}
            onSubmitMessage={handleSubmitMessage}
            onEnqueueMessage={() => {}}
            onSendInboxMessage={async () => false}
            onStopStream={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
