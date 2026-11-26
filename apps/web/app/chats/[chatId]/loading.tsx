import { Loader2 } from "lucide-react";

export default function ChatLoading() {
  return (
    <div className="flex h-dvh w-full bg-background text-foreground">
      {/* Desktop sidebar shell */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border/60 p-3 gap-2">
        <div className="h-8 w-28 rounded-md bg-muted/60" />
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="h-7 w-full rounded-md bg-muted/40" />
          <div className="h-7 w-5/6 rounded-md bg-muted/30" />
          <div className="h-7 w-4/5 rounded-md bg-muted/25" />
          <div className="h-7 w-3/4 rounded-md bg-muted/20" />
        </div>
      </aside>

      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
          <div className="h-4 w-40 rounded bg-muted/50" />
          <div className="h-7 w-20 rounded-md bg-muted/40" />
        </header>

        <main className="flex flex-1 items-center justify-center px-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2
              className="h-3.5 w-3.5 animate-spin"
              strokeWidth={1.6}
              aria-hidden="true"
            />
            <span>Loading chat</span>
          </div>
        </main>

        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <div className="h-24 w-full rounded-xl border border-border/60 bg-muted/20" />
        </div>
      </div>
    </div>
  );
}
