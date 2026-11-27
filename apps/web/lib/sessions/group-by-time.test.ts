import { describe, expect, test } from "bun:test";
import type { SessionWithUnread } from "@/hooks/use-sessions";
import {
  formatCompactSessionAge,
  groupSessionsByRecency,
} from "./group-by-time";

function makeSession(id: string, lastActivityAt: Date): SessionWithUnread {
  return {
    id,
    projectId: null,
    title: `Session ${id}`,
    status: "completed",
    repoOwner: null,
    repoName: null,
    branch: null,
    linesAdded: null,
    linesRemoved: null,
    prNumber: null,
    prStatus: null,
    createdAt: lastActivityAt,
    hasUnread: false,
    hasStreaming: false,
    latestChatId: null,
    lastActivityAt,
  };
}

describe("formatCompactSessionAge", () => {
  const now = new Date("2026-11-27T12:00:00Z").getTime();

  test("formats sub-minute, minute, hour, day, and older dates compactly", () => {
    expect(formatCompactSessionAge(now - 20_000, now)).toBe("now");
    expect(formatCompactSessionAge(now - 5 * 60_000, now)).toBe("5m");
    expect(formatCompactSessionAge(now - 3 * 3600_000, now)).toBe("3h");
    expect(formatCompactSessionAge(now - 2 * 86_400_000, now)).toBe("2d");
    expect(formatCompactSessionAge(now - 14 * 86_400_000, now)).toContain(
      "Nov",
    );
  });
});

describe("groupSessionsByRecency", () => {
  const now = new Date("2026-11-27T15:00:00Z").getTime();

  test("groups sessions into Today, Yesterday, Previous 7 days, and Older while omitting empty buckets", () => {
    const today = makeSession("a", new Date("2026-11-27T14:30:00Z"));
    const yesterday = makeSession("b", new Date("2026-11-26T18:00:00Z"));
    const week = makeSession("c", new Date("2026-11-23T10:00:00Z"));
    const older = makeSession("d", new Date("2026-10-01T10:00:00Z"));

    const groups = groupSessionsByRecency([today, yesterday, week, older], now);
    expect(groups.map((g) => g.label)).toEqual([
      "Today",
      "Yesterday",
      "Previous 7 days",
      "Older",
    ]);
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(["a"]);
    expect(groups[3]?.sessions.map((s) => s.id)).toEqual(["d"]);

    const onlyToday = groupSessionsByRecency([today], now);
    expect(onlyToday.map((g) => g.label)).toEqual(["Today"]);
  });
});
