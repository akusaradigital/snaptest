"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="relative w-40 h-40 mx-auto mb-8 select-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-200 rounded-full blur-md" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-20 h-24 bg-red-50 rounded-2xl border-2 border-red-200 flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-7 bg-slate-800 rounded-lg flex items-center justify-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span className="text-white text-[10px] font-bold">ERR</span>
            </div>
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-300" />
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <div className="w-2 h-2 rounded-full bg-red-300" />
            </div>
          </div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-14 bg-red-100 rounded-2xl border-2 border-red-300 flex items-center justify-between px-3">
            <div className="w-3 h-3 bg-slate-800 rounded-full flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full" />
            </div>
            <div className="w-3 h-3 bg-slate-800 rounded-full flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full" />
            </div>
          </div>
          <div className="absolute top-[-12px] left-1/2 -translate-x-1/2 w-0.5 h-3 bg-red-300" />
          <div className="absolute top-[-18px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-red-400 rounded-full animate-bounce" />
          <div className="absolute bottom-10 left-[18px] w-3 h-8 bg-red-50 rounded-full border-2 border-red-200 -rotate-12" />
          <div className="absolute bottom-10 right-[18px] w-3 h-8 bg-red-50 rounded-full border-2 border-red-200 rotate-12" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">Something broke</h1>
        <p className="text-sm text-slate-500 mb-8 leading-relaxed">
          Our robots tripped over something unexpected. Try again, or head back home.
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-colors"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
