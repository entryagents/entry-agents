"use client";

import { CheckCircle2, Circle, ListTodo, Loader2 } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Todo = Record<string, any>;

export function TodoRenderer({
  part,
  state,
}: ToolRendererProps<"tool-todo_write">) {
  const input = part.input;
  const todos: Todo[] = (input?.todos ?? []).filter(
    (t): t is Todo => t !== undefined,
  );

  const completedCount = todos.filter(
    (todo) => todo?.status === "completed",
  ).length;
  const statusMeta =
    todos.length > 0 ? `${completedCount} of ${todos.length}` : undefined;

  const expandedContent =
    todos.length > 0 ? (
      <ul className="sable-todos">
        {todos.map((todo, i) => {
          const status = String(todo.status ?? "pending");
          const text =
            status === "in_progress"
              ? String(todo.activeForm ?? todo.content ?? "")
              : String(todo.content ?? "");
          return (
            <li key={todo.id ?? i} data-status={status}>
              <span className="sable-todo-mark">
                {status === "in_progress" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : status === "completed" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="sable-todo-text">{text}</span>
            </li>
          );
        })}
      </ul>
    ) : undefined;

  return (
    <ToolLayout
      name="Tasks"
      icon={<ListTodo className="h-3.5 w-3.5" />}
      summary=""
      meta={statusMeta}
      state={state}
      expandedContent={expandedContent}
      defaultExpanded={false}
    />
  );
}
