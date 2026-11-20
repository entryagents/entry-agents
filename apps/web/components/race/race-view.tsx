"use client";

import "./race.css";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Check, Loader2, Square, Swords, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { ChatMessageFeed } from "@/components/chat/chat-message-feed";
import { OpenFileProvider } from "@/components/tool-call/open-file-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ModelOption } from "@/lib/model-options";

type Target = "both" | "0" | "1";

export interface RaceSessionConfig {
  task: string;
  leftChatId: string;
  rightChatId: string;
  leftModelId: string;
  rightModelId: string;
}

interface RaceViewProps {
  sessionId: string;
  config: RaceSessionConfig;
  modelOptions: ModelOption[];
  onOpenFile: (filePath: string) => void;
  onKeepChat: (chatId: string) => void;
  onClose: () => void;
}

/**
 * Side-by-side Model Race View (`/race <task>`), ported 1:1 from Sable's `RaceView.tsx`.
 * Runs two independent chats in parallel, lets the user send follow-ups to Both or
 * either side, and keep the winning chat.
 */
export const RaceView = memo(function RaceView({
  sessionId,
  config,
  modelOptions,
  onOpenFile,
  onKeepChat,
  onClose,
}: RaceViewProps) {
  const [target, setTarget] = useState<Target>("both");
  const [followUp, setFollowUp] = useState("");
  const [keptChatId, setKeptChatId] = useState<string | null>(null);
  const [leftModel, setLeftModel] = useState(config.leftModelId);
  const [rightModel, setRightModel] = useState(config.rightModelId);

  const sendLeftRef = useRef<((text: string) => void) | null>(null);
  const sendRightRef = useRef<((text: string) => void) | null>(null);

  const handleSendFollowUp = () => {
    const trimmed = followUp.trim();
    if (!trimmed) return;
    if (target === "both" || target === "0") {
      sendLeftRef.current?.(trimmed);
    }
    if (target === "both" || target === "1") {
      sendRightRef.current?.(trimmed);
    }
    setFollowUp("");
  };

  const leftLabel =
    modelOptions.find((m) => m.id === leftModel)?.shortLabel ?? leftModel;
  const rightLabel =
    modelOptions.find((m) => m.id === rightModel)?.shortLabel ?? rightModel;

  return (
    <div className="race">
      <header className="race-bar">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground shrink-0">
            <Swords size={13} strokeWidth={1.7} aria-hidden="true" />
            Race
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {config.task}
          </span>
        </div>

        <div className="race-bar-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-xs gap-1"
            onClick={onClose}
          >
            <X size={13} strokeWidth={1.7} aria-hidden="true" />
            Close race
          </Button>
        </div>
      </header>

      <div className="race-stage">
        <div className="race-cols">
          <RaceColumn
            sessionId={sessionId}
            chatId={config.leftChatId}
            initialTask={config.task}
            modelId={leftModel}
            onModelChange={setLeftModel}
            modelOptions={modelOptions}
            outcome={
              keptChatId === null
                ? undefined
                : keptChatId === config.leftChatId
                  ? "kept"
                  : "dropped"
            }
            onOpenFile={onOpenFile}
            onKeep={() => {
              setKeptChatId(config.leftChatId);
              onKeepChat(config.leftChatId);
            }}
            registerSend={(fn) => {
              sendLeftRef.current = fn;
            }}
          />

          <RaceColumn
            sessionId={sessionId}
            chatId={config.rightChatId}
            initialTask={config.task}
            modelId={rightModel}
            onModelChange={setRightModel}
            modelOptions={modelOptions}
            outcome={
              keptChatId === null
                ? undefined
                : keptChatId === config.rightChatId
                  ? "kept"
                  : "dropped"
            }
            onOpenFile={onOpenFile}
            onKeep={() => {
              setKeptChatId(config.rightChatId);
              onKeepChat(config.rightChatId);
            }}
            registerSend={(fn) => {
              sendRightRef.current = fn;
            }}
          />
        </div>
      </div>

      <div className="race-dock">
        <div className="race-dock-box">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5 shrink-0">
            {(
              [
                { id: "both", label: "Both" },
                { id: "0", label: leftLabel },
                { id: "1", label: rightLabel },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTarget(opt.id)}
                className={`rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors cursor-pointer truncate max-w-[110px] ${
                  target === opt.id
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="Send a follow-up to both or one side…"
            className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendFollowUp();
              }
            }}
          />

          <Button
            type="button"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            disabled={!followUp.trim()}
            onClick={handleSendFollowUp}
            aria-label="Send follow-up"
          >
            <ArrowUp size={14} strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
});

function RaceColumn({
  sessionId,
  chatId,
  initialTask,
  modelId,
  onModelChange,
  modelOptions,
  outcome,
  onOpenFile,
  onKeep,
  registerSend,
}: {
  sessionId: string;
  chatId: string;
  initialTask: string;
  modelId: string;
  onModelChange: (id: string) => void;
  modelOptions: ModelOption[];
  outcome: "kept" | "dropped" | undefined;
  onOpenFile: (filePath: string) => void;
  onKeep: () => void;
  registerSend: (fn: (text: string) => void) => void;
}) {
  const modelRef = useRef(modelId);
  modelRef.current = modelId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          sessionId,
          chatId,
          modelId: modelRef.current,
        }),
      }),
    [sessionId, chatId],
  );

  const { messages, status, sendMessage, stop } = useChat<WebAgentUIMessage>({
    id: `race-${chatId}`,
    transport,
  });

  const sentInitialRef = useRef(false);
  useEffect(() => {
    if (sentInitialRef.current) return;
    sentInitialRef.current = true;
    void sendMessage({ text: initialTask });
  }, [initialTask, sendMessage]);

  useEffect(() => {
    registerSend((text: string) => {
      void sendMessage({ text });
    });
  }, [registerSend, sendMessage]);

  const isStreaming = status === "streaming" || status === "submitted";
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isStreaming) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  return (
    <section className="race-col" data-outcome={outcome}>
      <div className="race-col-head">
        <Select
          value={modelId}
          onValueChange={onModelChange}
          disabled={isStreaming}
        >
          <SelectTrigger className="h-7 w-auto max-w-[200px] border-none bg-transparent px-1.5 text-xs font-medium shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="race-state">
          {isStreaming ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2
                size={12}
                strokeWidth={2}
                className="animate-spin"
                aria-hidden="true"
              />
              Working
            </span>
          ) : outcome === "kept" ? (
            "Kept"
          ) : (
            "Ready"
          )}
        </span>

        {isStreaming && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 ml-1"
            onClick={() => void stop()}
            aria-label="Stop"
          >
            <Square size={11} strokeWidth={2} aria-hidden="true" />
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="race-col-scroll">
        <OpenFileProvider onOpenFile={onOpenFile}>
          <ChatMessageFeed
            messages={messages}
            isStreaming={isStreaming}
            onOpenFile={onOpenFile}
            readOnly
          />
        </OpenFileProvider>
      </div>

      <div className="race-col-foot">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {messages.length} {messages.length === 1 ? "message" : "messages"}
        </span>
        <Button
          type="button"
          size="sm"
          variant={outcome === "kept" ? "default" : "outline"}
          className="h-7 px-2.5 text-xs gap-1"
          onClick={onKeep}
        >
          <Check size={12} strokeWidth={2} aria-hidden="true" />
          Keep this one
        </Button>
      </div>
    </section>
  );
}
