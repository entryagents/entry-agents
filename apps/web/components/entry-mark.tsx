import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** The official Entry logo symbol, theme-aware with seamless background blending. */
export function EntryMark({
  className,
  style,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className,
      )}
      style={style}
      {...props}
    >
      {/* Light theme: black mark on white background, multiplied to blend with light surfaces */}
      <img
        src="/logo-light.png"
        alt=""
        className="h-full w-full rounded-full object-contain mix-blend-multiply dark:hidden"
      />
      {/* Dark theme: white mark on black background, screened to blend with dark surfaces */}
      <img
        src="/logo-dark.png"
        alt=""
        className="hidden h-full w-full rounded-full object-contain mix-blend-screen dark:block"
      />
    </span>
  );
}
