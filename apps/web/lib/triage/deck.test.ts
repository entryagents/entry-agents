import { describe, expect, it } from "bun:test";
import {
  deckAction,
  deckKeyAllowed,
  deckReducer,
  emptyDeck,
  exitOf,
} from "./deck";

describe("triage/deck", () => {
  it("preserves user order on sync and rotates with next/prev", () => {
    let s = emptyDeck(["a", "b", "c"]);
    s = deckReducer(s, { type: "next" });
    expect(s.order).toEqual(["b", "c", "a"]);

    s = deckReducer(s, { type: "sync", keys: ["a", "b", "c", "d"] });
    expect(s.order).toEqual(["b", "c", "a", "d"]);

    s = deckReducer(s, { type: "prev" });
    expect(s.order).toEqual(["d", "b", "c", "a"]);
  });

  it("records answered cards and excludes them from future syncs", () => {
    let s = emptyDeck(["a", "b"]);
    s = deckReducer(s, { type: "answer", key: "a", exit: "allow" });
    expect(s.order).toEqual(["b"]);
    expect(s.answered).toBe(1);
    expect(exitOf(s, "a", new Set(["b"]))).toBe("allow");

    s = deckReducer(s, { type: "sync", keys: ["a", "b"] });
    expect(s.order).toEqual(["b"]);
  });

  it("maps keyboard shortcuts per card kind", () => {
    expect(deckAction({ key: "Escape" }, "permission")).toEqual({
      type: "close",
    });
    expect(deckAction({ key: "j" }, "permission")).toEqual({ type: "next" });
    expect(deckAction({ key: "k" }, "question")).toEqual({ type: "prev" });
    expect(deckAction({ key: "Enter" }, "permission")).toEqual({
      type: "allow",
    });
    expect(deckAction({ key: "d" }, "permission")).toEqual({ type: "deny" });
    expect(deckAction({ key: "s" }, "question")).toEqual({ type: "skip" });
    expect(deckAction({ key: "2" }, "question")).toEqual({
      type: "pick",
      index: 1,
    });
  });

  it("ignores keys inside inputs or repeated keys", () => {
    expect(deckKeyAllowed({ key: "Enter", repeat: true })).toBe(false);
    expect(
      deckKeyAllowed({
        key: "d",
        target: { tagName: "TEXTAREA" } as unknown as EventTarget,
      }),
    ).toBe(false);
    expect(deckKeyAllowed({ key: "d" })).toBe(true);
  });
});
