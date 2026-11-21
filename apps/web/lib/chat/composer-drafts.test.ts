import { describe, expect, test } from "bun:test";
import { packDrafts, stepPromptRecall, unpackDrafts } from "./composer-drafts";

describe("composer-drafts", () => {
  test("packDrafts filters empty drafts and caps to 40 most recent", () => {
    const input: Record<string, string> = {};
    for (let i = 0; i < 45; i++) {
      input[`chat-${i}`] = `draft ${i}`;
    }
    input["empty"] = "   ";
    const packed = packDrafts(input);
    expect(Object.keys(packed)).toHaveLength(40);
    expect(packed["empty"]).toBeUndefined();
    expect(packed["chat-0"]).toBeUndefined();
    expect(packed["chat-44"]).toBe("draft 44");
  });

  test("unpackDrafts drops malformed JSON and non-string entries", () => {
    expect(unpackDrafts("not-json")).toEqual({});
    expect(unpackDrafts('{"a":"hello","b":123,"c":""}')).toEqual({
      a: "hello",
    });
  });

  test("stepPromptRecall walks backward on ArrowUp and restores stash on ArrowDown", () => {
    const history = ["first prompt", "second prompt"];

    // Does not hijack ArrowUp when user has typed non-empty text
    expect(
      stepPromptRecall({
        direction: "up",
        history,
        currentInput: "typing something",
        state: { index: null, stashedDraft: "" },
      }),
    ).toBeNull();

    const step1 = stepPromptRecall({
      direction: "up",
      history,
      currentInput: "",
      state: { index: null, stashedDraft: "" },
    });
    expect(step1).toEqual({
      nextInput: "second prompt",
      nextState: { index: 1, stashedDraft: "" },
    });

    const step2 = stepPromptRecall({
      direction: "up",
      history,
      currentInput: step1!.nextInput,
      state: step1!.nextState,
    });
    expect(step2).toEqual({
      nextInput: "first prompt",
      nextState: { index: 0, stashedDraft: "" },
    });

    const step3 = stepPromptRecall({
      direction: "down",
      history,
      currentInput: step2!.nextInput,
      state: step2!.nextState,
    });
    expect(step3?.nextInput).toBe("second prompt");

    const step4 = stepPromptRecall({
      direction: "down",
      history,
      currentInput: step3!.nextInput,
      state: step3!.nextState,
    });
    expect(step4).toEqual({
      nextInput: "",
      nextState: { index: null, stashedDraft: "" },
    });
  });
});
