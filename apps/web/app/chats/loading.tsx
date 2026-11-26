import { Loader2 } from "lucide-react";

export default function ChatsIndexLoading() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-background text-foreground">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2
          className="h-3.5 w-3.5 animate-spin"
          strokeWidth={1.6}
          aria-hidden="true"
        />
        <span>Loading workspace</span>
      </div>
    </div>
  );
}
