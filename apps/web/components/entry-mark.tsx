import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders the Entry Agents cloud emblem — a sculpted cumulus silhouette carved
 * by two forward-entering wind channels forming an architectural "E".
 */
export function EntryMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("inline-block shrink-0", className)}
      {...props}
    >
      <path
        fill="currentColor"
        d="M17.4 6C13.3 6 9.85 8.58 8.52 12.2H18.4a1.65 1.65 0 0 1 0 3.3H5.5C3.57 15.5 2 17.07 2 19c0 .18.01.35.04.52H15.6a1.65 1.65 0 0 1 0 3.3H3.24C4.38 24.72 6.46 26 8.85 26h14.8C27.16 26 30 23.22 30 19.78c0-3.04-2.22-5.58-5.14-6.08C24.2 9.32 21.1 6 17.4 6Z"
      />
    </svg>
  );
}
