"use client";

import { Check, Circle, Dot, ListChecks } from "lucide-react";
import type { CSSProperties } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { getLatestTodos, type TodoItem } from "@/components/pinned-todo-panel";

interface WorkspaceTasksTabProps {
  messages: WebAgentUIMessage[];
}

export function WorkspaceTasksTab({ messages }: WorkspaceTasksTabProps) {
  const todos = getLatestTodos(messages);

  if (todos.length === 0) {
    return (
      <div className="rail-col">
        <div className="rail-bar">
          <span className="rail-bar-title">Tasks</span>
        </div>
        <div className="rail-empty">
          <ListChecks size={22} strokeWidth={1.3} aria-hidden="true" />
          <p className="rail-empty-title">No tasks yet</p>
          <p>
            When the agent plans multi-step work, live task progress appears
            here.
          </p>
        </div>
      </div>
    );
  }

  const done = todos.filter((t) => t.status === "completed").length;
  const ratio = todos.length > 0 ? done / todos.length : 0;

  return (
    <div className="rail-col">
      <div className="rail-bar">
        <span className="rail-bar-title">
          {done} of {todos.length} done
        </span>
        <div className="tk-progress meter" aria-hidden="true">
          <div
            className="meter-fill"
            style={{ "--p": ratio } as CSSProperties}
          />
        </div>
      </div>
      <div className="rail-scroll">
        <div className="rail-stack tk-stack">
          <ul className="tk-list">
            {todos.map((t, idx) => (
              <TaskRow key={t.id ?? `${t.content ?? "todo"}-${idx}`} todo={t} />
            ))}
          </ul>
        </div>
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
      <span className={active ? "tk-text shimmer" : "tk-text"}>
        {todo.content ?? ""}
      </span>
    </li>
  );
}
