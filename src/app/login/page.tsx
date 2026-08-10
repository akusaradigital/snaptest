"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Layers, ArrowLeft, ShieldCheck } from "lucide-react";

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const requestedCallbackUrl = params.get("callbackUrl");
  const callbackUrl = requestedCallbackUrl?.startsWith("/") && !requestedCallbackUrl.startsWith("//") && !requestedCallbackUrl.includes("\\")
    ? requestedCallbackUrl
    : "/dashboard";
  const error = params.get("error");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50/60 via-white to-white px-5">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <div className="bg-white border border-slate-100 rounded-3xl shadow-sm p-8">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold tracking-tight">SnapTest</span>
          </div>

          <h1 className="text-xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Sign in is required to use SnapTest and keep your work in sync across devices.
          </p>

          {error && (
            <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              Sign-in failed. Please try again.
            </div>
          )}

          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl })}
            className="mt-6 w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition text-sm font-medium text-slate-700"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="mt-6 flex items-start gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-500" />
            <span>Your AI API keys never leave your browser. We only store your generation history.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
