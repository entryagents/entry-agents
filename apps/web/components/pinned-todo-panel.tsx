"use client";

import { isToolUIPart } from "ai";
import { Check, ChevronUp, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { cn } from "@/lib/utils";

export type TodoItem = {
  id?: string;
  content?: string;
  activeForm?: string;
  status?: string;
};

/**
 * Extract the latest committed todo list from the conversation.
 * Ignores still-streaming todo tool inputs so the pinned panel only swaps once
 * a full update is available.
 */
export function getLatestTodos(messages: WebAgentUIMessage[]): TodoItem[] {
  let latestTodos: TodoItem[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolUIPart(part) || part.type !== "tool-todo_write") {
        continue;
      }

      if (part.state === "input-streaming") {
        continue;
      }

      const input = part.input as { todos?: TodoItem[] } | undefined;
      const todos = input?.todos;
      if (Array.isArray(todos) && todos.length > 0) {
        latestTodos = todos;
      }
    }
  }

  return latestTodos;
}

/**
 * Circular SVG progress ring (1:1 Sable `TaskStrip.tsx` Ring).
 * Draws a gentle track + filled arc with smooth stroke-dashoffset transition,
 * and fades in a checkmark when all tasks are complete.
 */
function TaskProgressRing({ done, total }: { done: number; total: number }) {
  const r = 6.5;
  const c = 2 * Math.PI * r;
  const progress = total ? done / total : 0;
  return (
    <svg
      className="h-[18px] w-[18px] shrink-0"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
    >
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        strokeWidth="2.2"
        className="stroke-foreground/12"
      />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
        transform="rotate(-90 9 9)"
        className="stroke-foreground/70 transition-[stroke-dashoffset] duration-300 ease-out"
      />
      {total > 0 && done === total && (
        <path
          d="M6.1 9.3l1.9 1.9 3.9-4"
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-foreground/75"
        />
      )}
    </svg>
  );
}

/**
 * Sable 1:1 TaskStrip docked directly above the composer.
 * Single compact header row with circular progress ring, tabular done/total
 * count, current task label, and collapsible checklist.
 */
export function PinnedTodoPanel({
  todos,
  isRunning = false,
}: {
  todos: TodoItem[];
  isRunning?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  if (todos.length === 0) {
    return null;
  }

  const doneCount = todos.filter((t) => t.status === "completed").length;
  const totalCount = todos.length;
  const current =
    todos.find((t) => t.status === "in_progress") ??
    todos.find((t) => t.status !== "completed");
  const currentLabel =
    doneCount === totalCount
      ? "All done"
      : current?.status === "in_progress"
        ? (current.activeForm ?? current.content ?? "Working…")
        : (current?.content ?? "Tasks");

  return (
    <section
      className="mx-3 overflow-hidden rounded-t-xl border border-b-0 border-border/60 bg-card/95 backdrop-blur-sm sm:mx-4"
      aria-label="Tasks"
      data-open={open ? "" : undefined}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-[38px] w-full items-center gap-2.5 px-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <TaskProgressRing done={doneCount} total={totalCount} />
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {doneCount}/{totalCount}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs text-muted-foreground",
            isRunning &&
              current?.status === "in_progress" &&
              "animate-pulse text-foreground/85",
          )}
        >
          {currentLabel}
        </span>
        <ChevronUp
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200",
            !open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ul
          id={listId}
          className="flex max-h-[34vh] flex-col gap-0.5 overflow-y-auto border-t border-border/40 px-3 pt-1.5 pb-2.5"
        >
          {todos.map((todo, idx) => {
            const isCompleted = todo.status === "completed";
            const isInProgress = todo.status === "in_progress";
            const text = isInProgress
              ? (todo.activeForm ?? todo.content)
              : todo.content;

            return (
              <li
                key={todo.id ?? `${todo.content ?? "todo"}-${idx}`}
                data-status={todo.status ?? "pending"}
                className={cn(
                  "flex items-start gap-2.5 py-1 text-xs leading-[1.45]",
                  isCompleted
                    ? "text-muted-foreground/55"
                    : isInProgress
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                <span
                  className="grid h-[18px] w-[18px] shrink-0 place-items-center"
                  aria-hidden="true"
                >
                  {isCompleted ? (
                    <Check className="h-3 w-3 text-muted-foreground/70" />
                  ) : isInProgress ? (
                    <Loader2
                      className={cn(
                        "h-3 w-3 text-foreground/80",
                        isRunning && "animate-spin",
                      )}
                    />
                  ) : (
                    <i className="block h-[11px] w-[11px] rounded-full border-[1.5px] border-muted-foreground/40" />
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    isCompleted &&
                      "line-through decoration-muted-foreground/35 decoration-1",
                  )}
                >
                  {text}
                </span>
                <span className="sr-only">
                  {isCompleted
                    ? "Done"
                    : isInProgress
                      ? "In progress"
                      : "Pending"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
