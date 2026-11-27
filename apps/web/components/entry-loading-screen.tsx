import { EntryMark } from "@/components/entry-mark";
import { cn } from "@/lib/utils";

interface EntryLoadingScreenProps {
  readonly label?: string;
  readonly fullScreen?: boolean;
  readonly overlay?: boolean;
  readonly size?: "default" | "compact";
  readonly className?: string;
}

/**
 * Theme-aware branded loading screen using the Entry Cloud emblem.
 * Adapts automatically to light and dark themes via semantic tokens.
 */
export function EntryLoadingScreen({
  label,
  fullScreen = true,
  overlay = false,
  size = "default",
  className,
}: EntryLoadingScreenProps) {
  const isCompact = size === "compact";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center bg-background text-foreground",
        overlay
          ? "fixed inset-0 z-50 bg-background/90 backdrop-blur-xs"
          : fullScreen
            ? "min-h-dvh w-full"
            : isCompact
              ? "min-h-[180px] w-full py-10"
              : "min-h-[calc(100dvh-7rem)] w-full",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex items-center justify-center border border-border/80 bg-card shadow-xs",
          isCompact ? "size-11 rounded-xl" : "size-14 rounded-2xl",
        )}
      >
        <EntryMark
          className={cn(
            "text-foreground animate-pulse",
            isCompact ? "size-5" : "size-7",
          )}
        />
      </div>
      <div
        className={cn(
          "overflow-hidden rounded-full bg-border/70",
          isCompact ? "mt-3 h-0.5 w-14" : "mt-4 h-0.5 w-20",
        )}
      >
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
