import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session/get-server-session";
import { LoginShell } from "./login-shell";

/**
 * Dedicated sign-in route (`?next=` carries a same-origin post-login destination).
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
    <LoginShell callbackUrl={callbackUrl} isPricingReturn={isPricingReturn} />
  );
}
