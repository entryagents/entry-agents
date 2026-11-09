import { beforeEach, describe, expect, mock, test } from "bun:test";

// ── In-memory chat row + lock-emulating transaction ────────────────

type QueuedPrompt = {
  id: string;
  text: string;
  payload: unknown;
  modelId?: string | null;
  createdAt: string;
};

// The single chat row's queued_prompts column, as the fake tx sees it.
let queuedPrompts: QueuedPrompt[] | null = null;

// When set, the next FOR UPDATE read only resolves once this gate
// resolves -- models a transaction pausing while holding the row lock.
let gateNextSelect: Promise<void> | null = null;

// Serializes transaction callbacks: the fake stands in for Postgres
// row locks, where a transaction's SELECT ... FOR UPDATE blocks every
// other writer on the row until it commits.
let txChain: Promise<unknown> = Promise.resolve();

const spies = {
  transaction: mock(() => {}),
  selectForUpdate: mock((_strength: string) => {}),
  writeQueuedPrompts: mock((_next: QueuedPrompt[] | null) => {}),
};

type FakeTx = {
  select: () => {
    from: () => {
      where: () => {
        limit: () => {
          for: (
            strength: string,
          ) => Promise<Array<{ queuedPrompts: QueuedPrompt[] | null }>>;
        };
      };
    };
  };
  update: () => {
    set: (patch: { queuedPrompts: QueuedPrompt[] | null }) => {
      where: () => Promise<void>;
    };
  };
};

function makeTx(): FakeTx {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            for: (strength: string) => {
              spies.selectForUpdate(strength);
              const gate = gateNextSelect;
              gateNextSelect = null;
              // The row snapshot is taken when the lock is acquired.
              const row = [{ queuedPrompts }];
              return gate ? gate.then(() => row) : Promise.resolve(row);
            },
          }),
        }),
      }),
    }),
    update: () => ({
      set: (patch: { queuedPrompts: QueuedPrompt[] | null }) => {
        spies.writeQueuedPrompts(patch.queuedPrompts);
        return {
          where: () => {
            queuedPrompts = patch.queuedPrompts;
            return Promise.resolve();
          },
        };
      },
    }),
  };
}

// ── Module mocks (must appear before the module-under-test import) ──

mock.module("@/lib/db/client", () => ({
  db: {
    transaction: (cb: (tx: FakeTx) => Promise<unknown>) => {
      spies.transaction();
      const run = txChain.then(() => cb(makeTx()));
      txChain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  },
}));

mock.module("@/app/api/chat/_lib/chat-context", () => ({
  requireAuthenticatedUser: async () => ({ ok: true, userId: "user-1" }),
  requireOwnedChatById: async () => ({
    ok: true,
    sessionRecord: { id: "session-1", userId: "user-1" },
    chat: { id: "chat-1" },
  }),
}));

const { POST, DELETE } = await import("../api/chat/[chatId]/queue/route");

// ── Helpers ────────────────────────────────────────────────────────

function makePrompt(id: string, text = `prompt ${id}`): QueuedPrompt {
  return {
    id,
    text,
    payload: { text },
    modelId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/chat/chat-1/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ chatId: "chat-1" }) },
  );
}

function removeQueued(id: string): Promise<Response> {
  return DELETE(
    new Request(
      `http://localhost/api/chat/chat-1/queue?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
    { params: Promise.resolve({ chatId: "chat-1" }) },
  );
}

function queuedIds(): string[] {
  return (queuedPrompts ?? []).map((p) => p.id);
}

// ── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
  queuedPrompts = null;
  gateNextSelect = null;
  txChain = Promise.resolve();
  Object.values(spies).forEach((s) => s.mockClear());
});

describe("queue route mutations", () => {
  test("enqueue rejects with 409 when the queue is already full", async () => {
    queuedPrompts = Array.from({ length: 20 }, (_, i) => makePrompt(`p-${i}`));
    const before = queuedIds();

    const response = await post({
      text: "one too many",
      payload: { text: "one too many" },
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Queue is full (20 messages)");
    // The rejected POST must not change the list it found under the lock.
    expect(queuedIds()).toEqual(before);
  });

  test("DELETE removes only the requested id", async () => {
    queuedPrompts = [makePrompt("a"), makePrompt("b"), makePrompt("c")];

    const response = await removeQueued("b");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { queued: QueuedPrompt[] };
    expect(body.queued.map((p) => p.id)).toEqual(["a", "c"]);
    expect(queuedIds()).toEqual(["a", "c"]);
  });

  test("enqueue-while-locked appends after the lock holder", async () => {
    let releaseLock!: () => void;
    const lockGate = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    // First POST enters its transaction and pauses holding the row lock
    // (its FOR UPDATE read only resolves when the gate opens).
    gateNextSelect = lockGate;
    const first = post({ id: "a", text: "a", payload: { text: "a" } });

    // Wait until the first POST has actually entered its transaction.
    for (let i = 0; i < 100 && spies.transaction.mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(spies.transaction).toHaveBeenCalledTimes(1);

    // Second POST arrives while the first still holds the lock.
    const second = post({ id: "b", text: "b", payload: { text: "b" } });
    releaseLock();

    const [firstResponse, secondResponse] = await Promise.all([
      first,
      second,
    ]);
    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    // The locked read-modify-write serialized the enqueues: both survive,
    // in lock-acquisition order -- a lost update would leave only ["b"].
    expect(queuedIds()).toEqual(["a", "b"]);
    const writes = spies.writeQueuedPrompts.mock.calls.map(
      (call) => (call[0] as QueuedPrompt[]).map((p) => p.id),
    );
    expect(writes).toEqual([["a"], ["a", "b"]]);
    expect(spies.selectForUpdate).toHaveBeenCalledTimes(2);
    const strengths = spies.selectForUpdate.mock.calls.map(
      (call) => call[0] as string,
    );
    expect(strengths.every((strength) => strength === "update")).toBe(true);
  });
});
