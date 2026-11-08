import { tool } from "ai";
import { z } from "zod";
import { todoItemSchema, type TodoItem } from "../types";

export type { TodoItem };

export const todoWriteTool = tool({
  description: `Create and manage a structured task list for the current session.

WHEN TO USE:
- Complex multi-step tasks requiring 3 or more distinct steps
- When the user provides multiple requirements or a checklist
- After receiving new instructions - immediately capture them as todos
- When starting work on a task - mark that todo as in_progress BEFORE beginning
- After completing a task - mark it as completed immediately

WHEN NOT TO USE:
- A single, straightforward task that can be done in one step
- Trivial tasks requiring fewer than 3 minor steps
- Purely conversational or informational queries

TASK STATES:
- "pending": Task not yet started
- "in_progress": Currently being worked on (ONLY ONE todo should be in this state at a time)
- "completed": Task finished successfully

USAGE:
- This tool REPLACES the entire todo list - always send the full, updated list of todos
- Use it frequently to keep the task list in sync with your actual progress
- Update statuses as you start and finish work, rather than batching updates later

IMPORTANT:
- Only one todo should be in-progress at a time; avoid parallel in-progress tasks
- Mark todos as completed as soon as they are done - do not wait to batch completions
- Use clear, concise todo content so the list remains readable to the user`,
  inputSchema: z.object({
    todos: z
      .array(todoItemSchema)
      .describe(
        "The complete list of todo items. This replaces existing todos.",
      ),
  }),
  execute: async ({ todos }) => {
    return {
      success: true,
      message: `Updated task list with ${todos.length} items`,
      todos,
    };
  },
});

export const todoReadTool = tool({
  description: `Read the current task/todo list for this session.

WHEN TO USE:
- Reviewing what tasks remain before choosing the next action
- Checking which todo is currently marked in-progress
- Inspecting completed tasks when resuming or planning next steps`,
  inputSchema: z.object({}),
  execute: async (_input, { experimental_context }) => {
    const todos =
      (
        experimental_context as
          | { currentTodos?: Array<z.infer<typeof todoItemSchema>> }
          | undefined
      )?.currentTodos ?? [];

    const completed = todos.filter((t) => t.status === "completed").length;
    const inProgress = todos.filter((t) => t.status === "in_progress").length;
    const pending = todos.filter((t) => t.status === "pending").length;

    return {
      success: true,
      count: todos.length,
      completed,
      inProgress,
      pending,
      todos,
      summary:
        todos.length === 0
          ? "No todos currently registered. Use todo_write to create tasks."
          : `Current todos (${completed}/${todos.length} completed, ${inProgress} in-progress, ${pending} pending):\n` +
            todos
              .map(
                (t, idx) =>
                  `${idx + 1}. [${t.status === "completed" ? "x" : t.status === "in_progress" ? "~" : " "}] ${t.content}`,
              )
              .join("\n"),
    };
  },
});
