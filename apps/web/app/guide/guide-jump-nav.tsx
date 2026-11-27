"use client";

import { ArrowDown } from "lucide-react";

export interface GuideJumpSection {
  readonly id: string;
  readonly label: string;
}

export function GuideJumpNav({
  sections,
}: {
  readonly sections: readonly GuideJumpSection[];
}) {
  const scrollToSection = (id: string) => {
    const target = document.querySelector(`#${id}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      aria-label="Guide sections"
      className="mt-10 rounded-xl border border-(--l-border) bg-(--l-surface) p-4 sm:p-5"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollToSection(section.id)}
            className="flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-(--l-border) bg-(--l-surface-2) px-3 py-2 text-left text-xs text-(--l-fg-2) transition-[border-color,color,background-color] duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg)"
          >
            <span className="truncate font-medium">{section.label}</span>
            <ArrowDown
              className="size-3.5 shrink-0 text-(--l-fg-3)"
              strokeWidth={1.5}
            />
          </button>
        ))}
      </div>
    </nav>
  );
}
