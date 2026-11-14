import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Pure vector SVG representation of the Entry infinity-ribbon mark.
 * Renders cleanly at every icon size in light and dark themes using currentColor.
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
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        className,
      )}
      style={style}
      {...props}
    >
      <svg
        viewBox="0 0 120 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M36.5 14C20.2 14 8 25.4 8 40.6C8 56.2 20.6 66 36.2 66C46.5 66 54.4 61.1 61.6 52.8L68.2 44.8C73.9 37.9 79.4 33.4 86.2 33.4C92.8 33.4 97.6 37 97.6 41.8C97.6 46.8 92.2 50 82.8 50H72.2C66.8 56.8 61.4 61 55.6 63.4C61.8 65.1 68.5 66 75.8 66C95.4 66 112 55.4 112 39.2C112 24.1 99.6 14 83.2 14C71.8 14 63.1 19.6 55.2 29.2L48.6 37.2C43.1 43.9 37.4 47.4 30.8 47.4C24.9 47.4 20.8 44.3 20.8 39.8C20.8 34.4 26.8 30.2 36.5 30.2C42.1 30.2 47.1 31.8 51.3 34.6L57.8 26.6C51.8 18.6 44.8 14 36.5 14ZM36.2 55.8C44.5 55.8 51.1 50.9 57.5 42.9L64.1 34.8C69.6 28 75.5 23.8 83.2 23.8C93.5 23.8 100.8 29.8 100.8 39.2C100.8 48.2 92 55.6 78.2 55.8C87.4 53.7 95.8 49.4 102.4 44.1C99.5 52.6 89.2 57.2 76.2 57.2C70.4 57.2 65.2 56.2 60.8 54.4L65.4 48.8L72.6 48.8C70.2 51.2 67.6 53 64.9 54.4ZM22.2 43.1C24.1 38.2 30.1 35.1 38.5 35.1C41.8 35.1 45 35.7 48.1 36.9L43.3 42.7C39.2 44.9 34.7 46 30.2 46C26.3 46 23.8 44.9 22.2 43.1Z"
          fill="currentColor"
        />
        <path
          d="M17.5 46.8C25.4 37.5 38.8 34.1 53.6 32.8C58.4 32.4 61.9 30.1 65.8 25.5"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
