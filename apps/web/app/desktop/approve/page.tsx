"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { approveDesktopDevice, checkDeviceCode } from "./actions";
import { useSession } from "@/hooks/use-session";
import { SignInButton } from "@/components/auth/sign-in-button";

function ApproveForm() {
  const searchParams = useSearchParams();
  const codeParam = searchParams.get("code") || "";

  const [code, setCode] = React.useState(
    codeParam.replace(/\D/g, "").slice(0, 6),
  );
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<
    "idle" | "checking" | "approved" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const { isAuthenticated, loading: sessionLoading, session } = useSession();
  const user = session?.user;

  React.useEffect(() => {
    if (codeParam) {
      const clean = codeParam.replace(/\D/g, "").slice(0, 6);
      setCode(clean);
      if (clean.length === 6) {
        checkCode(clean);
      }
    }
  }, [codeParam]);

  const checkCode = async (c: string) => {
    setStatus("checking");
    setErrorMsg(null);
    const res = await checkDeviceCode(c);
    if (!res.valid) {
      setStatus("error");
      setErrorMsg(res.error || "Invalid or expired code");
    } else {
      setStatus("idle");
    }
  };

  const handleApprove = async () => {
    if (!code || code.length !== 6) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await approveDesktopDevice(code);
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(res.error || "Approval failed");
      } else {
        setStatus("approved");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg((err as Error).message || "Approval request failed");
    } finally {
      setLoading(false);
    }
  };

  const backToDesktop = () => {
    window.location.href = "entry://auth/complete";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#121214] p-8 shadow-2xl flex flex-col items-center text-center">
        {/* Brand header */}
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-700/60 text-2xl font-bold text-white">
          E
        </div>

        <h1 className="text-xl font-semibold text-white mb-1.5">
          Authorize Entry Agents Desktop
        </h1>
        <p className="text-sm text-zinc-400 mb-6">
          A desktop application is requesting access to your Entry account.
        </p>

        {sessionLoading ? (
          <div className="py-8 flex flex-col items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="text-xs text-zinc-400">Verifying session...</p>
          </div>
        ) : !isAuthenticated ? (
          <div className="w-full flex flex-col items-center gap-4">
            <p className="text-xs text-zinc-400 leading-relaxed mb-2">
              Sign in with your Entry account to authorize this desktop device:
            </p>
            <div className="w-full flex flex-col gap-2.5">
              <SignInButton
                className="w-full"
                provider="vercel"
                callbackUrl={`/desktop/approve?code=${code}`}
              />
              <SignInButton
                className="w-full"
                provider="github"
                callbackUrl={`/desktop/approve?code=${code}`}
              />
            </div>
          </div>
        ) : status === "approved" ? (
          <div className="w-full flex flex-col items-center gap-4 py-4">
            <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-400 border border-emerald-500/20">
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-base font-medium text-white">
              Desktop Application Authorized!
            </h2>
            <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
              Approved as{" "}
              <span className="text-zinc-200 font-medium">
                {user?.email || user?.name || (code ? `device ${code}` : "this device")}
              </span>
              . You can now return to Entry Agents Desktop.
            </p>
            <div className="flex flex-col w-full gap-2 pt-2">
              <button
                type="button"
                onClick={backToDesktop}
                className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 text-sm font-semibold text-white shadow-lg transition-all"
              >
                Return to Entry Desktop
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center gap-5">
            {/* Account identifier */}
            <div className="w-full rounded-xl bg-zinc-900/60 border border-zinc-800/80 p-3 flex items-center justify-between text-left">
              <div className="flex flex-col">
                <span className="text-xs text-zinc-400">
                  Authorizing account:
                </span>
                <span className="text-sm font-medium text-zinc-200">
                  {user?.email || user?.name || (code ? `device ${code}` : "this device")}
                </span>
              </div>
              <span className="rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-medium">
                Active
              </span>
            </div>

            {/* Code Input */}
            <div className="w-full">
              <label
                htmlFor="confirmation-code"
                className="block text-xs uppercase tracking-wider text-zinc-400 mb-2 font-medium"
              >
                Confirmation Code
              </label>
              <input
                id="confirmation-code"
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(val);
                  if (val.length === 6) checkCode(val);
                }}
                placeholder="••••••"
                className="w-full text-center text-2xl font-mono font-bold tracking-widest bg-zinc-900/80 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {errorMsg && (
              <div className="w-full p-3 rounded-lg border border-rose-500/20 bg-rose-500/10 text-xs text-rose-300">
                {errorMsg}
              </div>
            )}

            <div className="flex w-full flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={loading || code.length !== 6}
                onClick={handleApprove}
                className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-3 text-sm font-semibold text-white shadow-lg transition-all"
              >
                {loading ? "Authorizing..." : "Approve Desktop Access"}
              </button>
              <button
                type="button"
                onClick={() => window.close()}
                className="w-full inline-flex items-center justify-center rounded-xl border border-zinc-800 hover:bg-zinc-800 py-2.5 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                Deny Request
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DesktopApprovePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center text-zinc-400 text-sm">
          Loading...
        </div>
      }
    >
      <ApproveForm />
    </Suspense>
  );
}
