"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { EntryLoadingScreen } from "@/components/entry-loading-screen";
import { EntryMark } from "@/components/entry-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatUsdCents } from "@/lib/format-usd";

type VerifyResult =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "pending"; status: string }
  | {
      phase: "success";
      kind: "topup" | "subscription" | string;
      amountCents: number | null;
      creditBalanceCents: number | null;
      plan: string | null;
    };

function BillingCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [result, setResult] = useState<VerifyResult>({ phase: "loading" });
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const checkoutId = searchParams.get("checkout_id");

    if (!checkoutId) {
      setResult({
        phase: "error",
        message: "No checkout session found.",
      });
      return;
    }

    fetch(`/api/billing/verify?checkout_id=${encodeURIComponent(checkoutId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setResult({ phase: "error", message: data.error });
        } else if (data.status === "success") {
          setResult({
            phase: "success",
            kind: data.kind ?? "topup",
            amountCents: data.amountCents ?? null,
            creditBalanceCents: data.creditBalanceCents ?? null,
            plan: data.plan ?? null,
          });
        } else {
          setResult({ phase: "pending", status: data.status ?? "unknown" });
        }
      })
      .catch((err) => {
        setResult({
          phase: "error",
          message: err instanceof Error ? err.message : "Verification failed",
        });
      });
  }, [searchParams]);

  useEffect(() => {
    if (result.phase !== "success") return;
    setCountdown(3);
    const interval = window.setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    const timeout = window.setTimeout(() => {
      router.replace("/settings/billing");
    }, 3000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [result.phase, router]);

  if (result.phase === "loading") {
    return <EntryLoadingScreen label="Confirming payment..." />;
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-foreground">
      <Card className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <CardContent className="px-6 pb-7 pt-10 text-center sm:px-8">
          <div className="mb-5 flex justify-center">
            <div className="flex size-12 items-center justify-center rounded-xl border border-border/80 bg-muted/40">
              <EntryMark className="size-6 text-foreground" />
            </div>
          </div>

          {result.phase === "success" && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <h1 className="text-xl font-semibold tracking-tight">
                  {result.kind === "topup"
                    ? "Credit top-up successful"
                    : "Subscription active"}
                </h1>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {result.kind === "topup"
                    ? result.amountCents
                      ? `Added ${formatUsdCents(result.amountCents)} to your balance.`
                      : "Your credits have been added."
                    : `Your ${result.plan ? result.plan : "paid"} plan is now active.`}
                </p>
              </div>

              {typeof result.creditBalanceCents === "number" && (
                <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-4">
                  <p className="text-xs text-muted-foreground">
                    Available credit balance
                  </p>
                  <p className="mt-1 font-mono text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                    {formatUsdCents(result.creditBalanceCents)}
                  </p>
                </div>
              )}

              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                Redirecting to billing in {countdown}s...
              </p>
            </div>
          )}

          {result.phase === "pending" && (
            <div className="space-y-4">
              <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
              <div className="space-y-1.5">
                <h1 className="text-lg font-semibold tracking-tight">
                  Payment {result.status}
                </h1>
                <p className="text-xs text-muted-foreground">
                  Your payment is processing and usually confirms within a
                  minute.
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full rounded-lg"
              >
                <Link href="/settings/billing">Go to Billing</Link>
              </Button>
            </div>
          )}

          {result.phase === "error" && (
            <div className="space-y-4">
              <AlertCircle
                className="mx-auto size-5 text-destructive"
                strokeWidth={1.5}
              />
              <div className="space-y-1.5">
                <h1 className="text-lg font-semibold tracking-tight">
                  Payment issue
                </h1>
                <p className="text-xs text-muted-foreground">
                  {result.message}
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full rounded-lg"
              >
                <Link href="/settings/billing">Return to Billing</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BillingCallbackPage() {
  return (
    <Suspense fallback={<EntryLoadingScreen label="Confirming payment..." />}>
      <BillingCallbackInner />
    </Suspense>
  );
}
