"use client";

import { Loader2, Lock } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { useSession } from "@/hooks/use-session";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth/client";
import { fetcher } from "@/lib/swr";

function VercelIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 76 65"
      fill="currentColor"
    >
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}

export function VercelSectionSkeleton() {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/10">
      <div className="border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <VercelIcon className="h-4 w-4" />
          <span className="text-sm font-medium">Vercel</span>
        </div>
        <Skeleton className="mt-2 h-3.5 w-40" />
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * Vercel section on /settings/connections. Two distinct states:
 * - Users who signed in WITH Vercel: their login is the Vercel account, so
 *   it shows as managed.
 * - Users who signed in with Google/GitHub: Vercel is NOT connected until
 *   they link it -- render a Connect button (better-auth linkSocial stores
 *   the vercel account row the deployment integration reads tokens from).
 *   The old UI assumed the Vercel-login case for everyone, so a
 *   Google-authenticated user had no way to connect at all.
 */
export function VercelSection() {
  const { session, loading } = useSession();
  const {
    data,
    isLoading: accountsLoading,
    mutate,
  } = useSWR<{
    providers: string[];
  }>("/api/auth/accounts", fetcher);
  const [linking, setLinking] = useState(false);
  const user = session?.user;

  const linked = data?.providers.includes("vercel") ?? false;

  async function connectVercel() {
    setLinking(true);
    try {
      await authClient.linkSocial({
        provider: "vercel",
        callbackURL: "/settings/connections",
        errorCallbackURL: "/settings/connections",
      });
      await mutate();
    } finally {
      setLinking(false);
    }
  }

  if (loading || accountsLoading) {
    return <VercelSectionSkeleton />;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border/50 bg-muted/10">
      <div className="border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <VercelIcon className="h-4 w-4" />
          <span className="text-sm font-medium">Vercel</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Connect your Vercel account to enable deployments.
        </p>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-9 rounded-full">
              <AvatarImage src={user.avatar} alt={user.username} />
              <AvatarFallback className="rounded-full">
                {user.username?.charAt(0).toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {user.name || user.username}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.username}
              </p>
            </div>
          </div>

          {linked ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3" />
              <span>Connected</span>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={linking}
              onClick={() => void connectVercel()}
            >
              {linking && <Loader2 className="mr-1.5 size-3 animate-spin" />}
              Connect
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
