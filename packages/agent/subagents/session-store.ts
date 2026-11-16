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

export interface ActiveSubagentHandle {
  subagentId: string;
  sessionId?: string;
  teamId: string;
  subagentType: string;
  controller: AbortController;
  startedAt: number;
}

export interface SubagentRealtimeMessage {
  id: string;
  fromSubagentId: string;
  subagentType: string;
  teamId: string;
  message: string;
  createdAt: number;
}

const activeSubagents = new Map<string, ActiveSubagentHandle>();
const realtimeParentMessages = new Map<string, SubagentRealtimeMessage[]>();
const realtimeMessageListeners = new Map<
  string,
  Set<(msg: SubagentRealtimeMessage) => void>
>();

export function registerActiveSubagent(handle: ActiveSubagentHandle): void {
  activeSubagents.set(handle.subagentId, handle);
  if (handle.sessionId) {
    activeSubagents.set(handle.sessionId, handle);
  }
}

export function unregisterActiveSubagent(
  subagentId: string,
  sessionId?: string,
): void {
  activeSubagents.delete(subagentId);
  if (sessionId) {
    activeSubagents.delete(sessionId);
  }
}

export function stopSubagentById(id: string): boolean {
  const handle = activeSubagents.get(id);
  if (!handle) return false;
  handle.controller.abort();
  unregisterActiveSubagent(handle.subagentId, handle.sessionId);
  return true;
}

export function stopAllSubagentsForTeam(teamId: string): number {
  let stopped = 0;
  const seen = new Set<AbortController>();
  for (const [key, handle] of activeSubagents.entries()) {
    if (handle.teamId === teamId) {
      if (!seen.has(handle.controller)) {
        seen.add(handle.controller);
        handle.controller.abort();
        stopped++;
      }
      activeSubagents.delete(key);
    }
  }
  return stopped;
}

export function pushSubagentRealtimeMessage(
  msg: Omit<SubagentRealtimeMessage, "id" | "createdAt">,
): SubagentRealtimeMessage {
  const full: SubagentRealtimeMessage = {
    ...msg,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const queue = realtimeParentMessages.get(msg.teamId) ?? [];
  queue.push(full);
  realtimeParentMessages.set(msg.teamId, queue);
  const listeners = realtimeMessageListeners.get(msg.teamId);
  if (listeners) {
    for (const listener of listeners) {
      try {
        listener(full);
      } catch {
        // Ignore listener errors
      }
    }
  }
  return full;
}

export function consumeSubagentRealtimeMessages(
  teamId: string,
): SubagentRealtimeMessage[] {
  const queue = realtimeParentMessages.get(teamId) ?? [];
  realtimeParentMessages.delete(teamId);
  return queue;
}

export function subscribeSubagentRealtimeMessages(
  teamId: string,
  listener: (msg: SubagentRealtimeMessage) => void,
): () => void {
  let set = realtimeMessageListeners.get(teamId);
  if (!set) {
    set = new Set();
    realtimeMessageListeners.set(teamId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set?.size === 0) {
      realtimeMessageListeners.delete(teamId);
    }
  };
}
