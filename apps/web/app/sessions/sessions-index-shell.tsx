"use client";

import { Folder, Lock, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { DEFAULT_SANDBOX_TYPE } from "@/components/sandbox-selector-compact";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useModelOptions } from "@/hooks/use-model-options";
import { useProjects } from "@/hooks/use-projects";
import type { SessionWithUnread } from "@/hooks/use-sessions";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { buildUserMessageFromComposerPayload } from "@/lib/chat/build-user-message";
import {
  generateAndApplyInitialTitle,
  startInitialChatOnServer,
} from "@/lib/chat/start-initial-chat";
import { sanitizePromptToTitle } from "@/lib/random-city";
import {
  ChatComposer,
  type BuiltComposerMessage,
} from "./[sessionId]/chats/[chatId]/components/chat-composer";
import { useSessionsShell } from "./sessions-shell-context";

export function SessionsIndexShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedProjectId = searchParams.get("projectId");
  const { mutate: globalMutate } = useSWRConfig();
  const { createSession } = useSessionsShell();
  const { projects } = useProjects({ enabled: Boolean(selectedProjectId) });
  const selectedFolder = selectedProjectId
    ? (projects.find((p) => p.id === selectedProjectId) ?? null)
    : null;
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
        const initialMessage = buildUserMessageFromComposerPayload(
          built.payload,
        );
        const {
          session: createdSession,
          chat,
          workflowRunId,
        } = await createSession({
          ...(initialTitle ? { title: initialTitle } : {}),
          ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
          isNewBranch: false,
          sandboxType: preferences?.defaultSandboxType ?? DEFAULT_SANDBOX_TYPE,
          autoCommitPush: preferences?.autoCommitPush ?? false,
          autoCreatePr: preferences?.autoCreatePr ?? false,
          permissionModeOverride: permissionMode,
          ...(effectiveModelId ? { modelId: effectiveModelId } : {}),
          ...(reasoningEffort !== null ? { reasoningEffort } : {}),
          initialMessage,
        });

        // If POST /api/sessions did not already start the workflow on the server,
        // fall back to starting it via POST /api/chat.
        if (!workflowRunId) {
          void startInitialChatOnServer({
            sessionId: createdSession.id,
            chatId: chat.id,
            built,
          }).catch((error) => {
            console.error("Failed to start initial chat on server:", error);
          });
        }

        void globalMutate<{
          sessions: SessionWithUnread[];
          archivedCount?: number;
        }>(
          "/api/sessions",
          (current) => {
            if (!current) return current;
            return {
              ...current,
              sessions: current.sessions.map((s) =>
                s.id === createdSession.id
                  ? { ...s, hasStreaming: true, latestChatId: chat.id }
                  : s,
              ),
            };
          },
          { revalidate: false },
        );

        void globalMutate<{
          chats?: Array<Record<string, unknown>>;
          defaultModelId?: string | null;
        }>(
          `/api/sessions/${createdSession.id}/chats`,
          (current) => {
            if (!current?.chats) return current;
            return {
              ...current,
              chats: current.chats.map((c) =>
                c.id === chat.id ? { ...c, isStreaming: true } : c,
              ),
            };
          },
          { revalidate: false },
        );

        void generateAndApplyInitialTitle({
          sessionId: createdSession.id,
          chatId: chat.id,
          displayText: built.displayText,
          onTitleResolved: (finalTitle) => {
            void globalMutate<{
              sessions: SessionWithUnread[];
              archivedCount?: number;
            }>(
              "/api/sessions",
              (current) => {
                if (!current) return current;
                return {
                  ...current,
                  sessions: current.sessions.map((s) =>
                    s.id === createdSession.id
                      ? { ...s, title: finalTitle }
                      : s,
                  ),
                };
              },
              { revalidate: false },
            );
          },
        });

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
      globalMutate,
      isCreating,
      permissionMode,
      preferences?.autoCommitPush,
      preferences?.autoCreatePr,
      preferences?.defaultSandboxType,
      reasoningEffort,
      router,
      selectedProjectId,
    ],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b border-border bg-background px-3 py-1.5 select-none">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="h-7 w-7 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground" />
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Toggle left sidebar · ⌘B
              </TooltipContent>
            </Tooltip>
            <span className="text-xs font-medium text-foreground sm:text-sm sm:font-normal sm:text-muted-foreground">
              New chat
            </span>
            {selectedFolder ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                <Folder className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span className="max-w-40 truncate">{selectedFolder.name}</span>
                <button
                  type="button"
                  onClick={() => router.replace("/sessions", { scroll: false })}
                  className="ml-0.5 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                  aria-label="Clear folder selection"
                >
                  <X className="h-3 w-3" strokeWidth={1.5} />
                </button>
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent("entry:open-command-palette"),
                    );
                  }}
                  className="hidden h-7 items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 text-xs text-muted-foreground hover:text-foreground sm:inline-flex cursor-pointer"
                  aria-label="Open command palette"
                >
                  <Search className="h-3 w-3" />
                  <kbd className="font-mono text-[10px] tracking-tight">⌘K</kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Command palette · ⌘K / Ctrl+K
              </TooltipContent>
            </Tooltip>
          </div>
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
              router.push("/pricing");
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
            overlaySlot={
              composerGate ? (
                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-background/80 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => router.push("/pricing")}
                    className="flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm font-medium text-foreground shadow-md ring-1 ring-border transition-colors hover:bg-muted cursor-pointer"
                  >
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>
                      {composerGate.reason ||
                        "Free tier ended — upgrade your account to use Entry"}
                    </span>
                  </button>
                </div>
              ) : null
            }
          />
        </div>
      </div>
    </div>
  );
}
