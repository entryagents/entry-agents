import type { LanguageModelUsage, ModelMessage } from "ai";
import { sumLanguageModelUsage } from "../usage";

export interface SubagentTaskRecord {
  task: string;
  timestamp: number;
  toolCallCount: number;
  outcome?: string;
}

export interface SubagentSession {
  id: string;
  subagentType: string;
  depth: number;
  parentSessionId?: string;
  createdAt: number;
  lastUsedAt: number;
  messages: ModelMessage[];
  totalUsage?: LanguageModelUsage;
  toolCallCount: number;
  taskHistory: SubagentTaskRecord[];
}

/** Default in-memory session idle TTL: 15 minutes. */
export const DEFAULT_SUBAGENT_SESSION_IDLE_TTL_MS = 15 * 60 * 1000;

class SubagentSessionStore {
  private sessions = new Map<string, SubagentSession>();

  get(
    id: string,
    ttlMs = DEFAULT_SUBAGENT_SESSION_IDLE_TTL_MS,
  ): SubagentSession | undefined {
    this.prune(ttlMs);
    const session = this.sessions.get(id);
    if (session) {
      session.lastUsedAt = Date.now();
    }
    return session;
  }

  create(params: {
    id?: string;
    subagentType: string;
    depth?: number;
    parentSessionId?: string;
    initialMessages?: ModelMessage[];
  }): SubagentSession {
    const id = params.id || crypto.randomUUID();
    const now = Date.now();
    const session: SubagentSession = {
      id,
      subagentType: params.subagentType,
      depth: params.depth ?? 1,
      parentSessionId: params.parentSessionId,
      createdAt: now,
      lastUsedAt: now,
      messages: params.initialMessages ? [...params.initialMessages] : [],
      toolCallCount: 0,
      taskHistory: [],
    };
    this.sessions.set(id, session);
    return session;
  }

  save(session: SubagentSession): void {
    session.lastUsedAt = Date.now();
    this.sessions.set(session.id, session);
  }

  recordTaskCompletion(params: {
    id: string;
    task: string;
    newMessages: ModelMessage[];
    toolCallCount: number;
    usage?: LanguageModelUsage;
    outcome?: string;
  }): SubagentSession | undefined {
    const session = this.get(params.id);
    if (!session) return undefined;

    session.messages = [...session.messages, ...params.newMessages];
    session.toolCallCount += params.toolCallCount;
    session.totalUsage = sumLanguageModelUsage(
      session.totalUsage,
      params.usage,
    );
    session.lastUsedAt = Date.now();
    session.taskHistory.push({
      task: params.task,
      timestamp: Date.now(),
      toolCallCount: params.toolCallCount,
      outcome: params.outcome,
    });

    this.sessions.set(session.id, session);
    return session;
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  prune(ttlMs = DEFAULT_SUBAGENT_SESSION_IDLE_TTL_MS): number {
    const now = Date.now();
    let pruned = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastUsedAt > ttlMs) {
        this.sessions.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  clear(): void {
    this.sessions.clear();
  }

  size(): number {
    return this.sessions.size;
  }
}

export const subagentSessionStore = new SubagentSessionStore();
