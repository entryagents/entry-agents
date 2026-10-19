export function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as Record<string, unknown>;
  if (err.code === "23505") return true;
  if (
    typeof err.message === "string" &&
    (err.message.includes("unique") ||
      err.message.includes("duplicate key") ||
      err.message.includes("23505"))
  ) {
    return true;
  }
  return false;
}
