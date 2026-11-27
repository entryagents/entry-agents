import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/sign-in-button";
import { getServerSession } from "@/lib/session/get-server-session";

/**
 * The dedicated sign-in page (one centered card, full-width provider buttons).
 *
 * `?next=` carries a same-origin post-login destination (the OAuth
 * round trip loses client state, so the path travels in the query).
 */
export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in with Vercel, Google, or GitHub to open your cloud engineering workspaces.",
  alternates: {
    canonical: "/login",
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextParam = Array.isArray(params.next) ? params.next[0] : params.next;

  // Only accept same-origin paths as the post-login destination.
  const callbackUrl =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/chats";

  const session = await getServerSession();
  if (session?.user) {
    redirect(callbackUrl);
  }

  const isPricingReturn = callbackUrl.startsWith("/pricing");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12 sm:px-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-xs sm:p-8">
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {isPricingReturn ? "Sign in to subscribe" : "Sign in"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isPricingReturn
                ? "Continue with Vercel, Google, or GitHub to return to subscription plans"
                : "Continue with Vercel, Google, or GitHub to open your workspaces"}
            </p>
          </div>

          <div className="mt-8 grid gap-3">
            <SignInButton
              provider="vercel"
              callbackUrl={callbackUrl}
              className="h-11 w-full justify-center"
            />
            <SignInButton
              provider="google"
              callbackUrl={callbackUrl}
              className="h-11 w-full justify-center"
            />
            <SignInButton
              provider="github"
              callbackUrl={callbackUrl}
              className="h-11 w-full justify-center"
            />
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            By continuing, you agree to our{" "}
            <Link
              href="/terms"
              className="text-foreground/85 underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="text-foreground/85 underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link
            href={isPricingReturn ? "/pricing" : "/"}
            className="underline underline-offset-4 hover:text-foreground"
          >
            {isPricingReturn ? "Back to pricing" : "Back to home"}
          </Link>
        </p>
      </div>
    </main>
  );
}
