"use client";

import "./triage.css";
import {
  Check,
  ExternalLink,
  ShieldAlert,
  MessageCircleQuestion,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  type Variants,
} from "motion/react";
import { useRouter } from "next/navigation";
import * as RadixDialog from "@radix-ui/react-dialog";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  deckAction,
  type DeckAction,
  deckKeyAllowed,
  deckReducer,
  emptyDeck,
  type Exit,
  exitOf,
  type TriagePrompt,
} from "@/lib/triage/deck";
import { useTriage } from "./triage-context";

const SHOWN = 3;
const PEEK = 12;
const SHRINK = 0.05;
const ARM_MS = 220;
const END_HOLD = 900;
const END_H = 44;
const SPRING = { type: "spring", stiffness: 480, damping: 34 } as const;
const LEAVE = { type: "spring", stiffness: 520, damping: 40 } as const;

const pose = (depth: number) => ({
  y: depth * PEEK,
  x: 0,
  rotate: 0,
  scale: 1 - depth * SHRINK,
  opacity: 1,
});

function exitPose(exit: Exit) {
  const fade = { duration: 0.15, ease: [0.3, 0, 0.7, 0.5] as const };
  const over = { zIndex: SHOWN + 1 };
  const now = { zIndex: { duration: 0 } };
  switch (exit) {
    case "allow":
      return {
        ...over,
        y: -60,
        x: 0,
        rotate: 0,
        scale: 1.02,
        opacity: 0,
        transition: { ...now, y: LEAVE, scale: LEAVE, opacity: fade },
      };
    case "deny":
      return {
        ...over,
        x: -110,
        y: 10,
        rotate: -4,
        scale: 0.97,
        opacity: 0,
        transition: {
          ...now,
          x: LEAVE,
          y: LEAVE,
          rotate: LEAVE,
          scale: LEAVE,
          opacity: fade,
        },
      };
    case "back":
      return {
        ...pose(SHOWN),
        opacity: 0,
        zIndex: 0,
        transition: { ...SPRING, ...now, opacity: { duration: 0.14 } },
      };
    default:
      return {
        ...over,
        opacity: 0,
        scale: 0.98,
        transition: { ...now, duration: 0.16 },
      };
  }
}

function formatInputPreview(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

/**
 * Triage Deck (`Ctrl+I`), ported 1:1 from Sable's `Triage.tsx`.
 * Shows every pending tool approval and question across sessions as a stack of cards.
 */
export function TriageDeck() {
  const { open, setOpen } = useTriage();
  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="tri-overlay" />
        <Deck />
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function Deck() {
  const router = useRouter();
  const { prompts, activeHandlers, setOpen } = useTriage();
  const root = useRef<HTMLDivElement>(null);

  const byKey = useMemo(
    () => new Map(prompts.map((p) => [p.key, p])),
    [prompts],
  );
  const keys = useMemo(() => prompts.map((p) => p.key), [prompts]);
  const live = useMemo(() => new Set(keys), [keys]);
  const [state, dispatch] = useReducer(deckReducer, keys, emptyDeck);

  useLayoutEffect(() => {
    dispatch({ type: "sync", keys });
  }, [keys]);

  const cards = state.order.flatMap((k) => {
    const item = byKey.get(k);
    return item ? [item] : [];
  });
  const shown = cards.slice(0, SHOWN);
  const front = shown[0];

  const posOf = useMemo(() => {
    const inDeck = new Set(state.order);
    const m = new Map<string, number>();
    for (const k of keys) {
      if (inDeck.has(k)) m.set(k, m.size + 1);
    }
    return m;
  }, [keys, state.order]);

  const [armedKey, setArmedKey] = useState<string | null>(null);
  const frontKey = front?.key;
  useEffect(() => {
    if (!frontKey) return;
    const t = window.setTimeout(() => setArmedKey(frontKey), ARM_MS);
    return () => window.clearTimeout(t);
  }, [frontKey]);
  const armed = !!frontKey && armedKey === frontKey;

  const [dealt, setDealt] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDealt(true), 400);
    return () => window.clearTimeout(t);
  }, []);

  const [heights, setHeights] = useState<Record<string, number>>({});
  const measure = useCallback((key: string, h: number) => {
    setHeights((cur) => (cur[key] === h ? cur : { ...cur, [key]: h }));
  }, []);
  const frontH = front ? heights[front.key] : undefined;
  const stackH = front ? (frontH ?? 0) + PEEK * (shown.length - 1) : END_H;

  const refocus = useCallback(
    () => requestAnimationFrame(() => root.current?.focus()),
    [],
  );

  const openChat = useCallback(
    (p: TriagePrompt) => {
      setOpen(false);
      router.push(`/chats/${p.chatId}`);
    },
    [router, setOpen],
  );

  const leave = useCallback(
    (key: string, exit: Exit) => {
      dispatch({ type: "answer", key, exit });
      refocus();
    },
    [refocus],
  );

  const handlePermission = useCallback(
    (p: Extract<TriagePrompt, { kind: "permission" }>, approved: boolean) => {
      if (activeHandlers && activeHandlers.chatId === p.chatId) {
        leave(p.key, approved ? "allow" : "deny");
        if (approved) {
          activeHandlers.onApproveTool(p.approvalId);
        } else {
          activeHandlers.onDenyTool(p.approvalId);
        }
        return;
      }
      openChat(p);
    },
    [activeHandlers, leave, openChat],
  );

  const handleQuestionAnswer = useCallback(
    (
      p: Extract<TriagePrompt, { kind: "question" }>,
      answers: Record<string, string | string[]> | null,
    ) => {
      if (activeHandlers && activeHandlers.chatId === p.chatId) {
        leave(p.key, answers ? "allow" : "deny");
        if (answers) {
          activeHandlers.onSubmitQuestion(answers);
        } else {
          activeHandlers.onCancelQuestion();
        }
        return;
      }
      openChat(p);
    },
    [activeHandlers, leave, openChat],
  );

  const raise = useCallback(
    (depth: number) => {
      for (let i = 0; i < depth; i++) dispatch({ type: "next" });
      refocus();
    },
    [refocus],
  );

  const empty = !front;
  useEffect(() => {
    if (!empty) return;
    const t = window.setTimeout(
      () => setOpen(false),
      state.answered ? END_HOLD : END_HOLD + 400,
    );
    return () => window.clearTimeout(t);
  }, [empty, state.answered, setOpen]);

  const cardActRef = useRef<((a: DeckAction) => boolean) | null>(null);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const ev = e.nativeEvent;
    if (!deckKeyAllowed(ev)) return;
    const a = deckAction(ev, front?.kind ?? null);
    if (!a || a.type === "close") return;
    if (a.type === "next" || a.type === "prev") {
      dispatch({ type: a.type });
    } else if (a.type === "open" && front) {
      openChat(front);
    } else if (!front || !cardActRef.current?.(a)) {
      return;
    }
    e.preventDefault();
  };

  const resolveExit = useCallback(
    (key: string) => exitOf(state, key, live),
    [state, live],
  );

  return (
    <RadixDialog.Content
      ref={root}
      className="tri"
      aria-describedby={undefined}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        root.current?.focus();
      }}
      onKeyDown={onKeyDown}
    >
      <RadixDialog.Title className="sr-only">Waiting on you</RadixDialog.Title>
      <motion.div
        className="tri-stack"
        initial={false}
        animate={{ height: stackH }}
        transition={SPRING}
      >
        <AnimatePresence custom={resolveExit}>
          {shown.map((p, depth) => (
            <Card
              key={p.key}
              p={p}
              depth={depth}
              delay={dealt ? 0 : depth * 0.05}
              height={depth === 0 ? heights[p.key] : frontH}
              pos={posOf.get(p.key) ?? 1}
              total={cards.length}
              armed={depth === 0 && armed}
              isActiveChat={activeHandlers?.chatId === p.chatId}
              onMeasure={measure}
              onRaise={raise}
              onOpen={() => openChat(p)}
              onPermission={handlePermission}
              onQuestion={handleQuestionAnswer}
              registerAct={
                depth === 0 ? (fn) => (cardActRef.current = fn) : undefined
              }
            />
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {empty && (
            <motion.div
              key="end"
              className="tri-end"
              role="status"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { ...SPRING, delay: state.answered ? 0.12 : 0 },
              }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              <motion.span
                className="tri-end-mark"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  transition: { ...SPRING, delay: state.answered ? 0.2 : 0.08 },
                }}
              >
                <Check size={12} strokeWidth={2.2} aria-hidden="true" />
              </motion.span>
              {state.answered ? "All answered" : "Nothing is waiting on you"}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </RadixDialog.Content>
  );
}

function Card({
  p,
  depth,
  delay,
  height,
  pos,
  total,
  armed,
  isActiveChat,
  onMeasure,
  onRaise,
  onOpen,
  onPermission,
  onQuestion,
  registerAct,
}: {
  p: TriagePrompt;
  depth: number;
  delay: number;
  height: number | undefined;
  pos: number;
  total: number;
  armed: boolean;
  isActiveChat: boolean;
  onMeasure: (key: string, h: number) => void;
  onRaise: (depth: number) => void;
  onOpen: () => void;
  onPermission: (
    p: Extract<TriagePrompt, { kind: "permission" }>,
    approved: boolean,
  ) => void;
  onQuestion: (
    p: Extract<TriagePrompt, { kind: "question" }>,
    answers: Record<string, string | string[]> | null,
  ) => void;
  registerAct?: (fn: (a: DeckAction) => boolean) => void;
}) {
  const inner = useRef<HTMLDivElement>(null);
  const present = useIsPresent();
  const behind = depth > 0;
  const [selected, setSelected] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    onMeasure(p.key, el.offsetHeight);
    const ro = new ResizeObserver(() => onMeasure(p.key, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.key, onMeasure]);

  useEffect(() => {
    if (!registerAct) return;
    registerAct((a) => {
      if (!armed) return false;
      if (p.kind === "permission") {
        if (a.type === "allow") {
          onPermission(p, true);
          return true;
        }
        if (a.type === "deny") {
          onPermission(p, false);
          return true;
        }
        return false;
      }
      if (a.type === "skip") {
        onQuestion(p, null);
        return true;
      }
      if (a.type === "pick") {
        const q = p.questions[0];
        const opt = q?.options[a.index];
        if (q && opt) {
          onQuestion(p, { [q.question]: opt.label });
          return true;
        }
      }
      if (a.type === "advance") {
        if (Object.keys(selected).length > 0) {
          onQuestion(p, selected);
          return true;
        }
      }
      return false;
    });
  }, [registerAct, armed, p, onPermission, onQuestion, selected]);

  const variants: Variants = {
    enter: { ...pose(depth + 1), opacity: 0 },
    exit: (resolve: (key: string) => Exit) => exitPose(resolve(p.key)),
  };

  return (
    <motion.article
      className="tri-card"
      data-depth={depth}
      aria-hidden={behind || !present || undefined}
      inert={!present}
      onClick={behind && present ? () => onRaise(depth) : undefined}
      style={{ zIndex: SHOWN - depth }}
      variants={variants}
      initial="enter"
      animate={{
        ...pose(depth),
        ...(height ? { height } : {}),
        transition: { ...SPRING, delay, opacity: { duration: 0.18, delay } },
      }}
      exit="exit"
    >
      <div ref={inner} className="tri-card-inner" inert={behind}>
        <div className="tri-head">
          <span className="tri-session truncate">
            {p.kind === "permission" ? (
              <ShieldAlert size={14} strokeWidth={1.7} aria-hidden="true" />
            ) : (
              <MessageCircleQuestion
                size={14}
                strokeWidth={1.7}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{p.sessionTitle}</span>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="tri-pos">
              {pos} of {total}
            </span>
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Open chat (O)"
            >
              <ExternalLink size={11} strokeWidth={1.7} aria-hidden="true" />
              Open
            </button>
          </div>
        </div>

        {p.kind === "permission" ? (
          <>
            <div className="text-sm font-medium text-foreground mb-2">
              Allow <span className="font-mono">{p.toolName}</span>?
            </div>
            <pre className="tri-tool-box">{formatInputPreview(p.input)}</pre>
            <div className="tri-foot">
              <div className="tri-hints">
                <span>↵ Allow</span>
                <span>D Deny</span>
                <span>J/K Next/Prev</span>
                <span>O Open</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => onPermission(p, false)}
                >
                  {isActiveChat ? "Deny" : "Open to deny"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => onPermission(p, true)}
                >
                  {isActiveChat ? "Allow" : "Open to allow"}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            {p.questions.slice(0, 1).map((q) => (
              <div key={q.question} className="mb-3">
                <div className="text-sm font-medium text-foreground mb-2">
                  {q.question}
                </div>
                <div className="flex flex-col gap-1.5">
                  {q.options.map((opt, idx) => {
                    const isPicked = selected[q.question] === opt.label;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          setSelected({ [q.question]: opt.label });
                          onQuestion(p, { [q.question]: opt.label });
                        }}
                        className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                          isPicked
                            ? "border-foreground/40 bg-muted"
                            : "border-border hover:bg-muted/60"
                        }`}
                      >
                        <span className="font-mono text-[11px] text-muted-foreground pt-0.5">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">
                            {opt.label}
                          </div>
                          {opt.description && (
                            <div className="text-muted-foreground mt-0.5">
                              {opt.description}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="tri-foot">
              <div className="tri-hints">
                <span>1–9 Pick</span>
                <span>S Skip</span>
                <span>J/K Next/Prev</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => onQuestion(p, null)}
              >
                Skip
              </Button>
            </div>
          </>
        )}
      </div>
    </motion.article>
  );
}
