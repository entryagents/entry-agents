import type { ReactNode } from "react";

export type StageTone = "slate" | "ash" | "iron";

export function Stage({
  children,
}: {
  readonly tone?: StageTone;
  readonly children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-surface-2) p-2 sm:p-4 md:p-6">
      <div className="relative">{children}</div>
    </div>
  );
}
