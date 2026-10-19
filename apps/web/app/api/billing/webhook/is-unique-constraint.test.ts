import { describe, test, expect } from "bun:test";
import { isUniqueConstraintViolation } from "./is-unique-constraint";

describe("Billing Webhook Idempotency Error Handling", () => {
  test("identifies Postgres unique constraint code 23505", () => {
    expect(isUniqueConstraintViolation({ code: "23505" })).toBe(true);
  });

  test("identifies unique key violation message", () => {
    expect(
      isUniqueConstraintViolation(
        new Error("duplicate key value violates unique constraint"),
      ),
    ).toBe(true);
  });

  test("rejects connection errors, timeouts, syntax errors", () => {
    expect(
      isUniqueConstraintViolation(
        new Error("Connection terminated unexpectedly"),
      ),
    ).toBe(false);
    expect(isUniqueConstraintViolation(new Error("timeout expired"))).toBe(
      false,
    );
    expect(isUniqueConstraintViolation({ code: "ECONNREFUSED" })).toBe(false);
    expect(isUniqueConstraintViolation(null)).toBe(false);
    expect(isUniqueConstraintViolation(undefined)).toBe(false);
  });
});
