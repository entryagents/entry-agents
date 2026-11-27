import { EntryMark } from "@/components/entry-mark";
import { cn } from "@/lib/utils";

interface EntryLoadingScreenProps {
  readonly label?: string;
  readonly fullScreen?: boolean;
  readonly className?: string;
}

/**
 * Theme-aware branded loading screen using the Entry Cloud emblem.
 * Adapts automatically to light and dark themes via semantic tokens.
 */
export function EntryLoadingScreen({
  label,
  fullScreen = true,
  className,
}: EntryLoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center bg-background text-foreground",
        fullScreen ? "min-h-dvh w-full" : "min-h-[320px] w-full py-16",
        className,
      )}
    >
      <div className="relative flex size-14 items-center justify-center rounded-2xl border border-border/80 bg-card shadow-xs">
        <EntryMark className="size-7 text-foreground animate-pulse" />
      </div>
      <div className="mt-4 h-0.5 w-20 overflow-hidden rounded-full bg-border/70">
        <div className="h-full w-1/2 rounded-full bg-foreground/70 animate-[entry-loading-slide_1.1s_cubic-bezier(0.22,1,0.36,1)_infinite]" />
      </div>
      {label ? (
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          {label}
        </p>
      ) : (
        <span className="sr-only">Loading Entry</span>
      )}
    </div>
  );
}
