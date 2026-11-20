"use client";

import { Check, Circle, Dot, ListChecks } from "lucide-react";
import { getLatestTodos, type TodoItem } from "@/components/pinned-todo-panel";
import type { WebAgentUIMessage } from "@/app/types";

interface WorkspaceTasksTabProps {
  messages: WebAgentUIMessage[];
}

export function WorkspaceTasksTab({ messages }: WorkspaceTasksTabProps) {
  const todos = getLatestTodos(messages);

  if (todos.length === 0) {
    return (
      <div className="rail-empty">
        <ListChecks size={22} strokeWidth={1.3} aria-hidden="true" />
        <p>
          No task list yet. When the agent plans multi-step work, tasks appear
          here.
        </p>
      </div>
    );
  }

  const done = todos.filter((t) => t.status === "completed").length;
  const pct = (done / todos.length) * 100;

  return (
    <div className="rail-col">
      <div className="rail-bar">
        <span>
          {done} of {todos.length} done
        </span>
        <div className="tk-progress meter" aria-hidden="true">
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="rail-scroll">
        <ul className="tk-list">
          {todos.map((t, idx) => (
            <TaskRow key={t.id ?? `${t.content ?? "todo"}-${idx}`} todo={t} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function TaskRow({ todo }: { todo: TodoItem }) {
  const status = todo.status ?? "pending";
  const active = status === "in_progress";
  const isDone = status === "completed";

  return (
    <li className="tk-item" data-status={status}>
      <span className="tk-mark" aria-hidden="true">
        {isDone ? (
          <Check size={12} strokeWidth={2.2} />
        ) : active ? (
          <Dot size={16} strokeWidth={3} />
        ) : (
          <Circle size={10} strokeWidth={1.6} />
        )}
      </span>
      <span className={active ? "shimmer" : undefined}>
        {todo.content ?? ""}
      </span>
    </li>
  );
}
