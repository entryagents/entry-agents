/* eslint-disable @next/next/no-img-element */
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders the Entry infinity emblem using the exact provided light and dark
 * circular PNG assets so navigation, sidebars, and fallbacks stay 100% on-brand.
 */
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
      <img
        src="/logo-light.png?v=2"
        alt=""
        className="h-full w-full object-cover dark:hidden"
        draggable={false}
      />
      <img
        src="/logo-dark.png?v=2"
        alt=""
        className="hidden h-full w-full object-cover dark:block"
        draggable={false}
      />
    </span>
  );
}
