import { describe, expect, test } from "bun:test";
import { isLeadIn } from "./lead-in";

describe("isLeadIn (Sable 1:1)", () => {
  test("recognizes short pre-tool announcements", () => {
    expect(isLeadIn("Let me read the handler.")).toBe(true);
    expect(isLeadIn("Now I'll run the tests.")).toBe(true);
    expect(isLeadIn("Checking the logs now.")).toBe(true);
  });

  test("rejects real reports, findings, and questions", () => {
    expect(isLeadIn("The guard answers 403. Let me fix it.")).toBe(false);
    expect(isLeadIn("Looking at the logs, the guard throws first.")).toBe(
      false,
    );
    expect(isLeadIn("Should I deploy this now?")).toBe(false);
    expect(isLeadIn("I should note the key is read from .env.")).toBe(false);
  });
});
