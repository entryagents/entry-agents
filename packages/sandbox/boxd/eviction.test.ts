import { describe, expect, test } from "bun:test";
import {
  isBoxdCapacityError,
  provisionBoxdMachineWithEviction,
  selectBoxdEvictionCandidates,
  type BoxdEvictionCandidate,
} from "./eviction.ts";

function makeMachine(
  overrides: Partial<BoxdEvictionCandidate> & { id: string; name: string },
): BoxdEvictionCandidate {
  return {
    status: "stopped",
    createdAt: new Date("2026-11-10T00:00:00.000Z"),
    ...overrides,
  };
}

describe("selectBoxdEvictionCandidates", () => {
  test("excludes non-entry org VMs, target VM, and live/sleeping workspaces", () => {
    const targetName = "entry-target000000000000000000";
    const machines: BoxdEvictionCandidate[] = [
      makeMachine({ id: "m1", name: "org-shared-db", status: "stopped" }),
      makeMachine({ id: "m2", name: "custom-dev-box", status: "failed" }),
      makeMachine({ id: "m3", name: targetName, status: "stopped" }),
      makeMachine({
        id: "m4",
        name: "entry-running1111111111111111",
        status: "running",
      }),
      makeMachine({
        id: "m5",
        name: "entry-suspended22222222222222",
        status: "suspended",
      }),
      makeMachine({
        id: "m6",
        name: "entry-hibernated3333333333333",
        status: "hibernated",
      }),
      makeMachine({
        id: "m7",
        name: "entry-starting444444444444444",
        status: "starting",
      }),
      makeMachine({
        id: "m8",
        name: "entry-pending5555555555555555",
        status: "pending",
      }),
      makeMachine({
        id: "m9",
        name: "entry-migrating66666666666666",
        status: "migrating",
      }),
      makeMachine({
        id: "m10",
        name: "entry-stopped7777777777777777",
        status: "stopped",
      }),
    ];

    const selected = selectBoxdEvictionCandidates(machines, targetName);
    expect(selected.map((m) => m.id)).toEqual(["m10"]);
  });

  test("prioritizes destroyed and failed Entry machines before oldest stopped machines", () => {
    const machines: BoxdEvictionCandidate[] = [
      makeMachine({
        id: "stopped-old",
        name: "entry-a",
        status: "stopped",
        createdAt: "2026-11-01T00:00:00.000Z",
      }),
      makeMachine({
        id: "stopped-new",
        name: "entry-b",
        status: "stopped",
        createdAt: "2026-11-12T00:00:00.000Z",
      }),
      makeMachine({
        id: "failed-new",
        name: "entry-c",
        status: "failed",
        createdAt: "2026-11-14T00:00:00.000Z",
      }),
      makeMachine({
        id: "destroyed-any",
        name: "entry-d",
        status: "destroyed",
        createdAt: "2026-11-15T00:00:00.000Z",
      }),
    ];

    const selected = selectBoxdEvictionCandidates(machines, "entry-target");
    expect(selected.map((m) => m.id)).toEqual([
      "destroyed-any",
      "failed-new",
      "stopped-old",
      "stopped-new",
    ]);
  });
});

describe("provisionBoxdMachineWithEviction", () => {
  test("does not list or evict on non-capacity errors", async () => {
    let listed = false;
    let deleted = false;
    expect(isBoxdCapacityError(new Error("name already taken"))).toBe(false);

    await expect(
      provisionBoxdMachineWithEviction({
        targetMachineName: "entry-target",
        createMachine: async () => {
          throw new Error("name already taken");
        },
        listMachines: async () => {
          listed = true;
          return [];
        },
        deleteMachine: async () => {
          deleted = true;
        },
      }),
    ).rejects.toThrow("already taken");

    expect(listed).toBe(false);
    expect(deleted).toBe(false);
  });

  test("evicts incrementally one Entry VM at a time and stops once create succeeds", async () => {
    let createCalls = 0;
    const deletedIds: string[] = [];

    const machine = await provisionBoxdMachineWithEviction({
      targetMachineName: "entry-target",
      createMachine: async () => {
        createCalls++;
        if (createCalls === 1) {
          throw new Error("Org VM limit reached: destroy an org VM first");
        }
        return makeMachine({
          id: "new-vm",
          name: "entry-target",
          status: "running",
        });
      },
      listMachines: async () => [
        makeMachine({
          id: "non-entry",
          name: "billing-worker",
          status: "stopped",
          createdAt: "2026-10-01T00:00:00.000Z",
        }),
        makeMachine({
          id: "hibernated-entry",
          name: "entry-sleeping",
          status: "hibernated",
          createdAt: "2026-10-02T00:00:00.000Z",
        }),
        makeMachine({
          id: "stopped-old",
          name: "entry-old",
          status: "stopped",
          createdAt: "2026-10-03T00:00:00.000Z",
        }),
        makeMachine({
          id: "stopped-newer",
          name: "entry-newer",
          status: "stopped",
          createdAt: "2026-10-04T00:00:00.000Z",
        }),
      ],
      deleteMachine: async (id) => {
        deletedIds.push(id);
      },
    });

    expect(machine.id).toBe("new-vm");
    expect(deletedIds).toEqual(["stopped-old"]);
    expect(createCalls).toBe(2);
  });

  test("respects maxEvictions and propagates retry non-capacity race errors", async () => {
    let createCalls = 0;
    const deletedIds: string[] = [];

    await expect(
      provisionBoxdMachineWithEviction({
        targetMachineName: "entry-target",
        createMachine: async () => {
          createCalls++;
          if (createCalls === 1) {
            throw new Error("limit reached");
          }
          throw new Error("name already taken");
        },
        listMachines: async () => [
          makeMachine({ id: "dead-1", name: "entry-1", status: "failed" }),
          makeMachine({ id: "dead-2", name: "entry-2", status: "stopped" }),
        ],
        deleteMachine: async (id) => {
          deletedIds.push(id);
        },
      }),
    ).rejects.toThrow("already taken");

    expect(deletedIds).toEqual(["dead-1"]);
  });

  test("preserves capacity error without touching hibernated/non-entry VMs when no candidates qualify", async () => {
    const deletedIds: string[] = [];

    await expect(
      provisionBoxdMachineWithEviction({
        targetMachineName: "entry-target",
        createMachine: async () => {
          throw new Error("limit reached");
        },
        listMachines: async () => [
          makeMachine({ id: "other", name: "prod-api", status: "stopped" }),
          makeMachine({
            id: "hibernated",
            name: "entry-user",
            status: "hibernated",
          }),
        ],
        deleteMachine: async (id) => {
          deletedIds.push(id);
        },
      }),
    ).rejects.toThrow("limit reached");

    expect(deletedIds).toEqual([]);
  });
});
