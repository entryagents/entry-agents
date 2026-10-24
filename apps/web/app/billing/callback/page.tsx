"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2, ArrowRight, Activity, ExternalLink } from "lucide-react";
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
  const [loadingPortal, setLoadingPortal] = useState(false);

  useEffect(() => {
    const checkoutId = searchParams.get("checkout_id");

    if (!checkoutId) {
      setResult({
        phase: "error",
        message:
          "No checkout session id found. If you cancelled the payment, you can return to Pricing.",
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

  async function handleOpenPortal() {
    setLoadingPortal(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        router.push("/pricing");
      }
    } catch {
      router.push("/pricing");
    } finally {
      setLoadingPortal(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground selection:bg-primary/20">
      <Card className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <CardContent className="p-8 text-center">
          {/* Brand Mark */}
          <div className="mb-6 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 border border-border shadow-2xs">
              <EntryMark className="h-6 w-6 text-foreground" />
            </div>
          </div>

          {result.phase === "loading" && (
            <div className="space-y-4 py-4">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <div className="space-y-1.5">
                <h1 className="text-xl font-bold tracking-tight">Confirming payment...</h1>
                <p className="text-xs text-muted-foreground">
                  Synchronizing transaction with Bachs and crediting your account.
                </p>
              </div>
            </div>
          )}

          {result.phase === "success" && (
            <div className="space-y-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  {result.kind === "topup" ? "Credit Top-Up Successful 🎉" : "Subscription Activated 🎉"}
                </h1>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {result.kind === "topup"
                    ? result.amountCents
                      ? `Added ${formatUsdCents(result.amountCents)} in credits to your balance. Your credits are ready for use.`
                      : "Your wallet credits have been added successfully."
                    : `You are now subscribed to the ${result.plan ? result.plan.toUpperCase() : "active"} plan with full allowance.`}
                </p>
              </div>

              {typeof result.creditBalanceCents === "number" && (
                <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Available Credit Balance
                  </p>
                  <p className="mt-1 font-mono text-3xl font-extrabold tracking-tight text-foreground">
                    {formatUsdCents(result.creditBalanceCents)}
                  </p>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <Button asChild className="w-full h-10 rounded-xl font-medium">
                  <Link href="/sessions">
                    Go to Dashboard
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline" size="sm" className="rounded-xl text-xs">
                    <Link href="/settings/usage">
                      <Activity className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                      Usage &amp; Balance
                    </Link>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs"
                    onClick={handleOpenPortal}
                    disabled={loadingPortal}
                  >
                    {loadingPortal ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    Manage Billing
                  </Button>
                </div>
              </div>
            </div>
          )}

          {result.phase === "pending" && (
            <div className="space-y-4 py-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-xl font-bold tracking-tight">Payment {result.status}</h1>
                <p className="text-xs text-muted-foreground">
                  Your payment is currently processing. If you completed payment, it usually confirms within a minute.
                </p>
              </div>
              <Button asChild variant="outline" className="mt-4 w-full rounded-xl">
                <Link href="/sessions">Return to Dashboard</Link>
              </Button>
            </div>
          )}

          {result.phase === "error" && (
            <div className="space-y-4 py-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-xl font-bold tracking-tight">Payment Issue</h1>
                <p className="text-xs text-muted-foreground">{result.message}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/pricing">Return to Pricing</Link>
                </Button>
                <Button asChild className="rounded-xl">
                  <Link href="/sessions">Dashboard</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BillingCallbackPage() {
  return (
    <Suspense fallback={null}>
      <BillingCallbackInner />
    </Suspense>
  );
}
