import { describe, expect, test } from "bun:test";
import { todoReadTool, todoWriteTool, type TodoItem } from "./todo";

type TodoWriteExecutor = {
  execute: (input: { todos: TodoItem[] }) => Promise<{
    success: boolean;
    todos: TodoItem[];
  }>;
};

type TodoReadExecutor = {
  execute: (
    input: Record<string, never>,
    options: { experimental_context: { currentTodos?: TodoItem[] } },
  ) => Promise<{
    success: boolean;
    todos: TodoItem[];
    count: number;
    completed: number;
    inProgress: number;
    pending: number;
    summary: string;
  }>;
};

describe("todo tools", () => {
  test("todoWriteTool updates the task list", async () => {
    const todos = [
      { id: "1", content: "Implement feature", status: "in_progress" as const },
      { id: "2", content: "Write tests", status: "pending" as const },
    ];
    const result = await (
      todoWriteTool as unknown as TodoWriteExecutor
    ).execute({ todos });
    expect(result.success).toBe(true);
    expect(result.todos.length).toBe(2);
  });

  test("todoReadTool returns current todos from context", async () => {
    const currentTodos = [
      { id: "1", content: "Task 1", status: "completed" as const },
      { id: "2", content: "Task 2", status: "in_progress" as const },
      { id: "3", content: "Task 3", status: "pending" as const },
    ];

    const result = await (todoReadTool as unknown as TodoReadExecutor).execute(
      {},
      { experimental_context: { currentTodos } },
    );

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    expect(result.completed).toBe(1);
    expect(result.inProgress).toBe(1);
    expect(result.pending).toBe(1);
    expect(result.summary).toContain("1/3 completed");
  });

  test("todoReadTool handles empty todos cleanly", async () => {
    const result = await (todoReadTool as unknown as TodoReadExecutor).execute(
      {},
      { experimental_context: {} },
    );

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.todos).toEqual([]);
    expect(result.summary).toContain("No todos currently registered");
  });
});
