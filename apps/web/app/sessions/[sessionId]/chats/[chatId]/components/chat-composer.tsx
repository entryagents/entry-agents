"use client";

import "./sable-composer.css";

import type { AskUserQuestionInput } from "@entry-agents/agent";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUp,
  Check,
  Inbox,
  Loader2,
  Mic,
  Paperclip,
  Square,
  Terminal,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import type { SkillSuggestion } from "@/app/api/sessions/[sessionId]/skills/route";
import type { WebAgentUIMessage } from "@/app/types";
import type { FileUIPart } from "ai";
import { ComposerHighlight } from "@/components/chat/composer-highlight";
import { FileSuggestionsDropdown } from "@/components/file-suggestions-dropdown";
import { ImageAttachmentsPreview } from "@/components/image-attachments-preview";
import { useInlineQuestion } from "@/components/inline-question-input";
import { ModelSelectorCompact } from "@/components/model-selector-compact";
import {
  nextPermissionMode,
  PermissionModeSelector,
} from "@/components/permission-mode-selector";
import { ReasoningEffortSelector } from "@/components/reasoning-effort-selector";
import { SelectedSkillsPreview } from "@/components/selected-skills-preview";
import { SlashCommandDropdown } from "@/components/slash-command-dropdown";
import { TextAttachmentsPreview } from "@/components/text-attachments-preview";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAudioRecording } from "@/hooks/use-audio-recording";
import { useFileSuggestions } from "@/hooks/use-file-suggestions";
import { useImageAttachments } from "@/hooks/use-image-attachments";
import { useSlashCommands } from "@/hooks/use-slash-commands";
import { useTextAttachments } from "@/hooks/use-text-attachments";
import { mergeRestoredDraftText } from "@/components/chat/draft-restore";
import { parseCompactCommand } from "@/lib/compact/parse";
import {
  ACCEPT_IMAGE_TYPES,
  type ImageAttachment,
  isValidImageType,
} from "@/lib/image-utils";
import type { ModelOption } from "@/lib/model-options";
import {
  getReasoningEffortLevels,
  isReasoningCapableModel,
  sanitizeReasoningEffort,
} from "@/lib/model-reasoning";
import {
  clearChatDraft,
  type PromptRecallState,
  readChatDraft,
  stepPromptRecall,
  writeChatDraft,
} from "@/lib/chat/composer-drafts";
import { isLargeText } from "@/lib/text-attachment-utils";

export type ComposerMessagePayload =
  | {
      text: string;
      files?: FileUIPart[];
    }
  | {
      parts: WebAgentUIMessage["parts"];
    };

export interface BuiltComposerMessage {
  payload: ComposerMessagePayload;
  displayText: string;
}

export interface ComposerRestorePayload {
  text: string;
  snippets?: Array<{ content: string; filename?: string }>;
  files?: FileUIPart[];
}

export interface ChatComposerHandle {
  focus: () => void;
  addTextAttachment: (content: string, filename?: string) => void;
  appendMention: (mentionText: string) => void;
  restoreDraft: (payload: ComposerRestorePayload) => void;
}

export interface ChatComposerGate {
  title?: string | null;
  reason?: string | null;
}

interface ChatComposerProps {
  chatId?: string;
  sentPrompts?: readonly string[];
  onRunShellCommand?: (command: string) => void;
  isArchived: boolean;
  isChatInFlight: boolean;
  hasPendingResponse: boolean;
  composerGate: ChatComposerGate | null;
  modelId: string | null;
  reasoningEffort: string | null;
  modelOptions: ModelOption[];
  modelOptionsLoading: boolean;
  isFreeTierLocked: boolean;
  freePlanModelId: string | null;
  freeTierAllowedModelIds: string[];
  onModelChange: (modelId: string) => void;
  onReasoningEffortChange: (effort: string) => void;
  onUpgradeRequired: () => void;
  permissionMode: "ask" | "autoAccept" | "fullAccess";
  isTogglingPermissionMode: boolean;
  onPermissionModeChange: (mode: "ask" | "autoAccept" | "fullAccess") => void;
  files: FileSuggestion[] | null;
  filesLoading: boolean;
  skills: SkillSuggestion[] | null;
  skillsLoading: boolean;
  pendingQuestions: AskUserQuestionInput["questions"];
  hasPendingQuestion: boolean;
  onSubmitQuestionAnswers: (answers: Record<string, string | string[]>) => void;
  onCancelQuestion: () => void;
  queuedCount: number;
  inboxUnreadCount: number;
  isSendingInbox: boolean;
  onSubmitMessage: (built: BuiltComposerMessage) => unknown;
  onEnqueueMessage: (built: BuiltComposerMessage) => void;
  onSendInboxMessage: (text: string) => Promise<boolean | undefined>;
  onStopStream: () => void;
  contextUsageSlot?: ReactNode;
  topPanelsSlot?: ReactNode;
  overlaySlot?: ReactNode;
}

export const ChatComposer = memo(
  forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
    {
      chatId,
      sentPrompts,
      onRunShellCommand,
      isArchived,
      isChatInFlight,
      hasPendingResponse,
      composerGate,
      modelId,
      reasoningEffort,
      modelOptions,
      modelOptionsLoading,
      isFreeTierLocked,
      freePlanModelId,
      freeTierAllowedModelIds,
      onModelChange,
      onReasoningEffortChange,
      onUpgradeRequired,
      permissionMode,
      isTogglingPermissionMode,
      onPermissionModeChange,
      files,
      filesLoading,
      skills,
      skillsLoading,
      pendingQuestions,
      hasPendingQuestion,
      onSubmitQuestionAnswers,
      onCancelQuestion,
      queuedCount,
      inboxUnreadCount,
      isSendingInbox,
      onSubmitMessage,
      onEnqueueMessage,
      onSendInboxMessage,
      onStopStream,
      contextUsageSlot,
      topPanelsSlot,
      overlaySlot,
    },
    ref,
  ) {
    const [input, setInput] = useState(() => readChatDraft(chatId));
    const [cursorPosition, setCursorPosition] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isOnline, setIsOnline] = useState(() =>
      typeof navigator === "undefined" ? true : navigator.onLine !== false,
    );
    const [recallState, setRecallState] = useState<PromptRecallState>({
      index: null,
      stashedDraft: "",
    });
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const highlightRef = useRef<HTMLDivElement>(null);
    const prevChatIdRef = useRef<string | undefined>(chatId);

    // Restore persisted draft when switching between chats
    useEffect(() => {
      if (prevChatIdRef.current !== chatId) {
        prevChatIdRef.current = chatId;
        const restored = readChatDraft(chatId);
        setInput(restored);
        setCursorPosition(restored.length);
        setRecallState({ index: null, stashedDraft: "" });
      }
    }, [chatId]);

    // Persist per-chat draft text (debounced + flushed on pagehide/beforeunload)
    useEffect(() => {
      writeChatDraft(chatId, input);
    }, [chatId, input]);

    useEffect(() => {
      if (typeof window === "undefined") return;
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }, []);

    const isIosDevice = useMemo(() => {
      if (typeof navigator === "undefined") {
        return false;
      }
      return (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
      );
    }, []);

    const {
      images,
      addImage,
      addImages,
      addImageAttachments,
      removeImage,
      clearImages,
      getFileParts,
      fileInputRef,
      openFilePicker,
    } = useImageAttachments();

    const {
      textAttachments,
      addTextAttachment,
      removeTextAttachment,
      clearTextAttachments,
    } = useTextAttachments();

    const [selectedSkills, setSelectedSkills] = useState<SkillSuggestion[]>([]);

    const removeSelectedSkill = useCallback((name: string) => {
      setSelectedSkills((prev) => prev.filter((s) => s.name !== name));
    }, []);

    const clearSelectedSkills = useCallback(() => {
      setSelectedSkills([]);
    }, []);

    const {
      state: recordingState,
      error: recordingError,
      clearError: clearRecordingError,
      toggleRecording,
    } = useAudioRecording();

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          inputRef.current?.focus();
        },
        addTextAttachment: (content: string, filename?: string) => {
          addTextAttachment(content, filename);
        },
        appendMention: (mentionText: string) => {
          const clean = mentionText.trim();
          if (!clean) {
            inputRef.current?.focus();
            return;
          }
          setInput((prev) => {
            const sep = prev.length > 0 && !/\s$/.test(prev) ? " " : "";
            const next = `${prev}${sep}${clean} `;
            const caret = next.length;
            setCursorPosition(caret);
            requestAnimationFrame(() => {
              const field = inputRef.current;
              if (!field) return;
              field.focus();
              field.setSelectionRange(caret, caret);
            });
            return next;
          });
        },
        restoreDraft: (payload: ComposerRestorePayload) => {
          const caretPos = payload.text.length;
          setInput((prev) => mergeRestoredDraftText(payload.text, prev));
          setCursorPosition(caretPos);
          if (payload.snippets && payload.snippets.length > 0) {
            for (const snippet of payload.snippets) {
              addTextAttachment(snippet.content, snippet.filename);
            }
          }
          if (payload.files && payload.files.length > 0) {
            const restoredImages: ImageAttachment[] = payload.files
              .filter(
                (
                  file,
                ): file is FileUIPart & {
                  mediaType: ImageAttachment["mediaType"];
                } =>
                  isValidImageType(file.mediaType) &&
                  typeof file.url === "string" &&
                  file.url.length > 0,
              )
              .map((file, index) => ({
                id: `restored-${Date.now()}-${index}`,
                dataUrl: file.url,
                mediaType: file.mediaType,
                ...(file.filename ? { filename: file.filename } : {}),
              }));
            if (restoredImages.length > 0) {
              addImageAttachments(restoredImages);
            }
          }
          requestAnimationFrame(() => {
            const field = inputRef.current;
            if (!field) return;
            field.focus();
            field.setSelectionRange(caretPos, caretPos);
          });
        },
      }),
      [addImageAttachments, addTextAttachment],
    );

    useEffect(() => {
      const handleInsertPrompt = (event: Event) => {
        const custom = event as CustomEvent<{ text?: string }>;
        const text = custom.detail?.text;
        if (typeof text !== "string" || !text) return;
        setInput(text);
        setCursorPosition(text.length);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.setSelectionRange(text.length, text.length);
          }
        }, 0);
      };

      window.addEventListener(
        "entry:insert-composer-prompt",
        handleInsertPrompt,
      );
      return () => {
        window.removeEventListener(
          "entry:insert-composer-prompt",
          handleInsertPrompt,
        );
      };
    }, []);

    const handleTextareaFocus = useCallback(() => {}, []);

    // Auto-resize textarea up to 3 lines
    useEffect(() => {
      const textarea = inputRef.current;
      if (!textarea) return;

      const computedStyle = getComputedStyle(textarea);
      const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
      const maxHeight = lineHeight * 3;
      const currentHeight = textarea.offsetHeight;

      textarea.style.height = "0";
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(scrollHeight, maxHeight);

      if (Math.abs(newHeight - currentHeight) > 1) {
        textarea.style.height = `${newHeight}px`;
      } else {
        textarea.style.height = `${currentHeight}px`;
      }
    }, [input]);

    const handleFileSelect = useCallback(
      (value: string, mentionStart: number, cursorPos: number) => {
        setInput((prev) => {
          const before = prev.slice(0, mentionStart);
          const after = prev.slice(cursorPos);
          const newInput = `${before}@${value} ${after}`;
          const newCursorPos = mentionStart + value.length + 2;
          setCursorPosition(newCursorPos);
          setTimeout(() => {
            if (inputRef.current && inputRef.current.value === newInput) {
              inputRef.current.focus();
              inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
            }
          }, 0);
          return newInput;
        });
      },
      [],
    );

    const {
      showSuggestions,
      suggestions,
      selectedIndex,
      handleKeyDown: handleSuggestionsKeyDown,
      mentionInfo,
    } = useFileSuggestions({
      inputValue: input,
      cursorPosition,
      files,
      onSelect: handleFileSelect,
    });

    const handleSlashCommandSelect = useCallback(
      (skillName: string, slashStart: number, cursorPos: number) => {
        const matched = skills?.find((s) => s.name === skillName);
        if (matched && matched.source !== "command") {
          setSelectedSkills((prev) =>
            prev.some((s) => s.name === matched.name)
              ? prev
              : [...prev, matched],
          );
          setInput((prev) => {
            const before = prev.slice(0, slashStart);
            const after = prev.slice(cursorPos).replace(/^\s+/, "");
            const newInput = `${before}${after}`;
            const newCursorPos = slashStart;
            setCursorPosition(newCursorPos);
            setTimeout(() => {
              if (inputRef.current && inputRef.current.value === newInput) {
                inputRef.current.focus();
                inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
              }
            }, 0);
            return newInput;
          });
          return;
        }
        setInput((prev) => {
          const before = prev.slice(0, slashStart);
          const after = prev.slice(cursorPos);
          const newInput = `${before}/${skillName} ${after}`;
          const newCursorPos = slashStart + skillName.length + 2;
          setCursorPosition(newCursorPos);
          setTimeout(() => {
            if (inputRef.current && inputRef.current.value === newInput) {
              inputRef.current.focus();
              inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
            }
          }, 0);
          return newInput;
        });
      },
      [skills],
    );

    const {
      showSlashCommands,
      slashSuggestions,
      selectedSlashIndex,
      handleSlashKeyDown,
      slashInfo,
    } = useSlashCommands({
      inputValue: input,
      cursorPosition,
      skills,
      onSelect: handleSlashCommandSelect,
    });

    const emptyQuestions = useMemo(
      () => [] as AskUserQuestionInput["questions"],
      [],
    );

    const inlineQuestion = useInlineQuestion({
      questions: hasPendingQuestion ? pendingQuestions : emptyQuestions,
      onSubmit: onSubmitQuestionAnswers,
      onCancel: onCancelQuestion,
      textareaValue: input,
      onTextareaChange: setInput,
    });

    const showInlineQuestion = inlineQuestion.isActive;
    const isShellMode =
      !isArchived &&
      !showInlineQuestion &&
      !composerGate &&
      Boolean(onRunShellCommand) &&
      input.startsWith("!");
    const canRunShell = isShellMode && input.slice(1).trim().length > 0;
    const skillNames = useMemo(
      () => (skills ?? []).map((s) => s.name),
      [skills],
    );
    const suggestOriginX = useMemo(() => {
      const triggerPos =
        mentionInfo?.mentionStart ?? slashInfo?.slashStart ?? 0;
      const lineStart =
        input.lastIndexOf("\n", Math.max(0, triggerPos - 1)) + 1;
      const col = Math.max(0, triggerPos - lineStart);
      return Math.max(16, Math.min(480, 16 + col * 8));
    }, [input, mentionInfo?.mentionStart, slashInfo?.slashStart]);
    const hasComposerContent = isShellMode
      ? canRunShell
      : input.trim().length > 0 ||
        images.length > 0 ||
        textAttachments.length > 0 ||
        selectedSkills.length > 0;

    const buildPayload = useCallback((): BuiltComposerMessage | null => {
      const hasContent =
        input.trim() ||
        images.length > 0 ||
        textAttachments.length > 0 ||
        selectedSkills.length > 0;
      if (!hasContent) {
        return null;
      }

      const skillPrefix = selectedSkills.map((s) => `/${s.name}`).join(" ");
      const messageText = skillPrefix
        ? input.trim()
          ? `${skillPrefix} ${input}`
          : skillPrefix
        : input;
      const fileParts = getFileParts();
      const hasSnippets = textAttachments.length > 0;
      let payload: ComposerMessagePayload;

      if (hasSnippets) {
        const parts: WebAgentUIMessage["parts"] = [];
        if (messageText.trim()) {
          parts.push({ type: "text" as const, text: messageText });
        }
        if (fileParts) {
          for (const f of fileParts) {
            parts.push(f);
          }
        }
        for (const attachment of textAttachments) {
          parts.push({
            type: "data-snippet" as const,
            id: attachment.id,
            data: {
              content: attachment.content,
              filename: attachment.filename,
            },
          });
        }
        payload = { parts };
      } else {
        payload = { text: messageText, files: fileParts };
      }

      return { payload, displayText: messageText };
    }, [getFileParts, images.length, input, selectedSkills, textAttachments]);

    const handleMicClick = async () => {
      clearRecordingError();
      const transcribedText = await toggleRecording();
      if (transcribedText) {
        setInput((prev) =>
          prev ? `${prev} ${transcribedText}` : transcribedText,
        );
        inputRef.current?.focus();
      }
    };

    const selectedModelLevels = useMemo(
      () =>
        modelId && isReasoningCapableModel(modelId, modelOptions)
          ? getReasoningEffortLevels(modelId, modelOptions)
          : [],
      [modelId, modelOptions],
    );
    const defaultReasoningEffort = useMemo(
      () =>
        modelOptions.find((m) => m.id === modelId)?.defaultReasoningEffort ??
        null,
      [modelId, modelOptions],
    );
    const sanitizedReasoningEffort = useMemo(
      () =>
        modelId
          ? modelOptions.length > 0
            ? sanitizeReasoningEffort(modelId, reasoningEffort, modelOptions)
            : reasoningEffort
          : null,
      [modelId, modelOptions, reasoningEffort],
    );
    const isBusy = isChatInFlight || hasPendingResponse;

    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_IMAGE_TYPES}
          multiple
          onChange={(e) => {
            const selectedFiles = e.target.files;
            if (selectedFiles && selectedFiles.length > 0) {
              const totalCurrent = images.length + textAttachments.length;
              if (totalCurrent >= 5) {
                toast.error("Maximum 5 attachments allowed per message");
              } else {
                const remaining = 5 - totalCurrent;
                const filesToAdd = Array.from(selectedFiles).slice(
                  0,
                  remaining,
                );
                if (selectedFiles.length > remaining) {
                  toast.error("Maximum 5 attachments allowed per message");
                }
                addImages(filesToAdd);
              }
            }
            e.target.value = "";
          }}
          className="hidden"
        />
        <div className="relative">
          {!isShellMode && showSuggestions && (
            <FileSuggestionsDropdown
              suggestions={suggestions}
              selectedIndex={selectedIndex}
              originX={suggestOriginX}
              onSelect={(suggestion) => {
                if (mentionInfo) {
                  handleFileSelect(
                    suggestion.value,
                    mentionInfo.mentionStart,
                    cursorPosition,
                  );
                }
              }}
              isLoading={filesLoading}
            />
          )}
          {!isShellMode && showSlashCommands && !showSuggestions && (
            <SlashCommandDropdown
              suggestions={slashSuggestions}
              selectedIndex={selectedSlashIndex}
              originX={suggestOriginX}
              onSelect={(suggestion) => {
                if (slashInfo) {
                  handleSlashCommandSelect(
                    suggestion.name,
                    slashInfo.slashStart,
                    cursorPosition,
                  );
                }
              }}
              isLoading={skillsLoading}
            />
          )}
          {!isOnline && (
            <div
              role="status"
              aria-live="polite"
              className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/60 px-3 py-2 text-xs text-foreground"
            >
              <div className="flex items-center gap-2">
                <WifiOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>
                  Offline — active turns keep running on the server and will
                  sync automatically when your connection returns.
                </span>
              </div>
              <span className="hidden shrink-0 rounded border border-border/70 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
                Durable stream
              </span>
            </div>
          )}
          {topPanelsSlot}
          <div
            className={`sable-cmp-card ${isDragging ? "ring-2 ring-foreground/30" : ""}`}
          >
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (showInlineQuestion) return;
                if (isArchived) return;
                if (composerGate) return;

                if (isShellMode) {
                  const command = input.slice(1).trim();
                  if (!command) return;
                  setInput("");
                  clearChatDraft(chatId);
                  setRecallState({ index: null, stashedDraft: "" });
                  onRunShellCommand?.(command);
                  return;
                }

                const built = buildPayload();
                if (!built) return;

                const rawText = input.trim();
                setInput("");
                clearChatDraft(chatId);
                setRecallState({ index: null, stashedDraft: "" });
                clearImages();
                clearTextAttachments();
                clearSelectedSkills();

                if (isBusy) {
                  if (parseCompactCommand(rawText)) {
                    setInput(rawText);
                    toast.info("Available when this turn ends");
                    return;
                  }
                  if (/^\/inbox\s+/i.test(rawText)) {
                    const inboxText = rawText
                      .replace(/^\/inbox\s+/i, "")
                      .trim();
                    if (inboxText) {
                      void onSendInboxMessage(inboxText);
                      return;
                    }
                  }
                  onEnqueueMessage(built);
                  return;
                }

                await onSubmitMessage(built);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setIsDragging(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const droppedFiles = e.dataTransfer.files;
                if (droppedFiles.length > 0) {
                  const totalCurrent = images.length + textAttachments.length;
                  if (totalCurrent >= 5) {
                    toast.error("Maximum 5 attachments allowed per message");
                  } else {
                    const remaining = 5 - totalCurrent;
                    const filesToAdd = Array.from(droppedFiles).slice(
                      0,
                      remaining,
                    );
                    if (droppedFiles.length > remaining) {
                      toast.error("Maximum 5 attachments allowed per message");
                    }
                    addImages(filesToAdd);
                  }
                }
              }}
            >
              {overlaySlot}
              {(images.length > 0 ||
                textAttachments.length > 0 ||
                selectedSkills.length > 0) && (
                <div className="flex flex-wrap items-start gap-2 px-4 pt-3">
                  {images.length > 0 && (
                    <ImageAttachmentsPreview
                      images={images}
                      onRemove={removeImage}
                      className="p-0"
                    />
                  )}
                  {textAttachments.length > 0 && (
                    <TextAttachmentsPreview
                      attachments={textAttachments}
                      onRemove={removeTextAttachment}
                      className="p-0"
                    />
                  )}
                  {selectedSkills.length > 0 && (
                    <SelectedSkillsPreview
                      skills={selectedSkills}
                      onRemove={removeSelectedSkill}
                      className="p-0"
                    />
                  )}
                </div>
              )}

              {showInlineQuestion && inlineQuestion.questionHeaderUI}

              <div className="px-4 pb-2 pt-3">
                <div className="relative">
                  <ComposerHighlight
                    ref={highlightRef}
                    text={input}
                    skillNames={skillNames}
                    shell={isShellMode}
                    className={
                      isShellMode
                        ? "font-mono text-[13.5px] leading-6 [font-variant-ligatures:none]"
                        : "text-base leading-6"
                    }
                  />
                  {isShellMode && input === "!" && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-0 select-none truncate font-mono text-[13.5px] leading-6 text-muted-foreground/55"
                    >
                      <span className="invisible">!</span> Run a shell command
                      in the terminal
                    </span>
                  )}
                  <textarea
                    ref={inputRef}
                    value={input}
                    placeholder={
                      composerGate
                        ? composerGate.reason ||
                          "Free tier ended — upgrade your account to use Entry"
                        : showInlineQuestion
                          ? inlineQuestion.placeholder
                          : ""
                    }
                    rows={1}
                    onFocus={handleTextareaFocus}
                    onScroll={(e) => {
                      if (highlightRef.current) {
                        highlightRef.current.scrollTop =
                          e.currentTarget.scrollTop;
                      }
                    }}
                    onChange={(e) => {
                      setInput(e.currentTarget.value);
                      setCursorPosition(e.currentTarget.selectionStart ?? 0);
                      if (recallState.index !== null) {
                        setRecallState({ index: null, stashedDraft: "" });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Tab" &&
                        e.shiftKey &&
                        !e.metaKey &&
                        !e.ctrlKey &&
                        !e.altKey
                      ) {
                        e.preventDefault();
                        if (!isTogglingPermissionMode) {
                          onPermissionModeChange(
                            nextPermissionMode(permissionMode),
                          );
                        }
                        return;
                      }
                      if (
                        showInlineQuestion &&
                        e.key === "Enter" &&
                        !e.shiftKey
                      ) {
                        e.preventDefault();
                        inlineQuestion.handleNext();
                        return;
                      }
                      if (!isShellMode && handleSuggestionsKeyDown(e)) {
                        return;
                      }
                      if (!isShellMode && handleSlashKeyDown(e)) {
                        return;
                      }
                      if (
                        !showInlineQuestion &&
                        !e.shiftKey &&
                        !e.altKey &&
                        !e.ctrlKey &&
                        !e.metaKey &&
                        sentPrompts &&
                        sentPrompts.length > 0 &&
                        (e.key === "ArrowUp" || e.key === "ArrowDown")
                      ) {
                        const ta = e.currentTarget;
                        const selStart = ta.selectionStart ?? 0;
                        const selEnd = ta.selectionEnd ?? 0;
                        const atStart = selStart === 0 && selEnd === 0;
                        const atEnd =
                          selStart === ta.value.length &&
                          selEnd === ta.value.length;
                        if (
                          (e.key === "ArrowUp" && atStart) ||
                          (e.key === "ArrowDown" &&
                            recallState.index !== null &&
                            atEnd)
                        ) {
                          const stepped = stepPromptRecall({
                            direction: e.key === "ArrowUp" ? "up" : "down",
                            history: sentPrompts,
                            currentInput: input,
                            state: recallState,
                          });
                          if (stepped) {
                            e.preventDefault();
                            setInput(stepped.nextInput);
                            setRecallState(stepped.nextState);
                            const nextPos =
                              e.key === "ArrowUp"
                                ? 0
                                : stepped.nextInput.length;
                            setCursorPosition(nextPos);
                            window.requestAnimationFrame(() => {
                              inputRef.current?.setSelectionRange(
                                nextPos,
                                nextPos,
                              );
                            });
                            return;
                          }
                        }
                      }
                      if (e.key === "Enter" && !e.shiftKey && !isIosDevice) {
                        e.preventDefault();
                        if (!isArchived) {
                          e.currentTarget.form?.requestSubmit();
                        }
                      }
                    }}
                    onKeyUp={(e) => {
                      setCursorPosition(e.currentTarget.selectionStart ?? 0);
                    }}
                    onClick={(e) => {
                      setCursorPosition(e.currentTarget.selectionStart ?? 0);
                    }}
                    onPaste={(e) => {
                      const items = e.clipboardData?.items;
                      if (items) {
                        for (const item of items) {
                          if (isValidImageType(item.type)) {
                            const file = item.getAsFile();
                            if (file) {
                              e.preventDefault();
                              if (images.length + textAttachments.length >= 5) {
                                toast.error(
                                  "Maximum 5 attachments allowed per message",
                                );
                                return;
                              }
                              addImage(file).catch(() => {});
                              return;
                            }
                          }
                        }
                      }

                      const pastedText = e.clipboardData?.getData("text/plain");
                      if (pastedText && isLargeText(pastedText)) {
                        e.preventDefault();
                        if (images.length + textAttachments.length >= 5) {
                          toast.error(
                            "Maximum 5 attachments allowed per message",
                          );
                          return;
                        }
                        addTextAttachment(pastedText);
                      }
                    }}
                    disabled={isArchived || Boolean(composerGate)}
                    className={`relative block w-full resize-none overflow-y-auto bg-transparent leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none ${
                      isShellMode
                        ? "font-mono text-[13.5px] [font-variant-ligatures:none]"
                        : "text-base"
                    } ${composerGate ? "pointer-events-none select-none blur-[2px]" : ""}`}
                    style={{ minHeight: "24px" }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 px-3 pb-2">
                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 overflow-hidden">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={openFilePicker}
                    disabled={isArchived}
                    className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  {modelId && (
                    <ModelSelectorCompact
                      value={modelId}
                      modelOptions={modelOptions}
                      disabled={isArchived || modelOptionsLoading}
                      appliesToNextPrompt={isBusy}
                      onCloseAutoFocus={() => {
                        window.requestAnimationFrame(() => {
                          const textarea = inputRef.current;
                          if (!textarea) {
                            return;
                          }
                          textarea.focus();
                          const nextCursorPosition = Math.min(
                            cursorPosition,
                            textarea.value.length,
                          );
                          textarea.setSelectionRange(
                            nextCursorPosition,
                            nextCursorPosition,
                          );
                        });
                      }}
                      onChange={onModelChange}
                      isFreeTierLocked={isFreeTierLocked}
                      freePlanModelId={freePlanModelId}
                      freeTierUnlockedModelIds={freeTierAllowedModelIds}
                      onUpgradeRequired={onUpgradeRequired}
                    />
                  )}
                  {modelId && selectedModelLevels.length > 0 && (
                    <ReasoningEffortSelector
                      value={sanitizedReasoningEffort}
                      defaultEffort={defaultReasoningEffort}
                      levels={selectedModelLevels}
                      disabled={isArchived || modelOptionsLoading}
                      appliesToNextPrompt={isBusy}
                      onChange={onReasoningEffortChange}
                    />
                  )}
                  <PermissionModeSelector
                    value={permissionMode}
                    onChange={onPermissionModeChange}
                    disabled={isArchived || isTogglingPermissionMode}
                  />
                  {contextUsageSlot}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleMicClick}
                    disabled={isArchived || recordingState === "processing"}
                    className={`relative h-8 w-8 rounded-full ${
                      recordingState === "recording"
                        ? "text-red-500"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {recordingState === "recording" && (
                      <span className="absolute inset-0 animate-pulse rounded-full bg-red-500/30" />
                    )}
                    {recordingState === "processing" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                  </Button>

                  {showInlineQuestion ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        inlineQuestion.handleNext();
                      }}
                      disabled={!inlineQuestion.hasCurrentAnswer}
                      className="h-8 rounded-full bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-30"
                    >
                      <Check className="h-3 w-3" />
                      <span className="sm:hidden">
                        {inlineQuestion.compactButtonLabel}
                      </span>
                      <span className="hidden sm:inline">
                        {inlineQuestion.buttonLabel}
                      </span>
                    </Button>
                  ) : isBusy && !hasComposerContent ? (
                    <Button
                      type="button"
                      size="icon"
                      onClick={onStopStream}
                      className="h-8 w-8 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      style={{ touchAction: "manipulation" }}
                    >
                      <Square className="h-3 w-3 fill-current" />
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="relative inline-flex">
                          <Button
                            type="submit"
                            size="icon"
                            onTouchEnd={() => {
                              inputRef.current?.blur();
                            }}
                            disabled={
                              isArchived ||
                              Boolean(composerGate) ||
                              (isShellMode
                                ? !canRunShell
                                : !isBusy && !hasComposerContent)
                            }
                            className="h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30"
                          >
                            {isShellMode ? (
                              <Terminal className="h-4 w-4" />
                            ) : (
                              <ArrowUp className="h-4 w-4" />
                            )}
                          </Button>
                          {isBusy && !isShellMode && (
                            <span
                              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-background"
                              aria-hidden="true"
                            >
                              {queuedCount + 1}
                            </span>
                          )}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {isShellMode
                          ? "Run in terminal"
                          : isBusy
                            ? `Queue message (position ${queuedCount + 1})`
                            : "Send message"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {isBusy && !isShellMode && input.trim().length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="relative inline-flex">
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            disabled={
                              isArchived ||
                              Boolean(composerGate) ||
                              isSendingInbox
                            }
                            onClick={async () => {
                              const text = input.trim();
                              if (!text) return;
                              setInput("");
                              await onSendInboxMessage(text);
                              inputRef.current?.blur();
                            }}
                            className="h-8 w-8 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                            aria-label="Send to agent inbox"
                          >
                            <Inbox className="h-4 w-4" />
                          </Button>
                          {inboxUnreadCount > 0 && (
                            <span
                              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground ring-2 ring-background"
                              aria-hidden="true"
                            >
                              {inboxUnreadCount}
                            </span>
                          )}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Send to agent inbox (agent reads on next step)
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </form>
          </div>

          {recordingError && (
            <p className="mt-2 text-sm text-destructive">{recordingError}</p>
          )}
        </div>
      </>
    );
  }),
);
