import { describe, expect, test } from "bun:test";
import { UserMessageFold } from "./user-message-fold";

describe("UserMessageFold", () => {
  test("renders short text directly", () => {
    const el = UserMessageFold({ text: "Short prompt" });
    expect(el).toBeDefined();
    expect(el.props.children).toBe("Short prompt");
  });

  test("wraps long multi-line prompt in scrollable container", () => {
    const longText = Array.from({ length: 25 }, (_, i) => `Line ${i + 1}`).join(
      "\n",
    );
    const el = UserMessageFold({ text: longText });
    expect(el).toBeDefined();
    expect(el.props.className).toContain("overflow-y-auto");
    expect(el.props.className).toContain("max-h-72");
    expect(el.props.children).toBe(longText);
  });

  test("wraps large character prompt in scrollable container", () => {
    const longChars = "a".repeat(600);
    const el = UserMessageFold({ text: longChars });
    expect(el.props.className).toContain("overflow-y-auto");
    expect(el.props.children).toBe(longChars);
  });
});
