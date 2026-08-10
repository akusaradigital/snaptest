import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">

        {/* Ilustrasi lucu */}
        <div className="relative w-40 h-40 mx-auto mb-8 select-none">
          {/* Shadow */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-4 bg-slate-200 rounded-full blur-md" />

          {/* Robot body */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-20 h-24 bg-indigo-100 rounded-2xl border-2 border-indigo-200 flex flex-col items-center justify-center gap-2">
            {/* Screen */}
            <div className="w-12 h-7 bg-slate-800 rounded-lg flex items-center justify-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span className="text-white text-[10px] font-bold">404</span>
            </div>
            {/* Buttons */}
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-indigo-300" />
              <div className="w-2 h-2 rounded-full bg-indigo-400" />
              <div className="w-2 h-2 rounded-full bg-indigo-300" />
            </div>
          </div>

          {/* Robot head */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-14 bg-indigo-200 rounded-2xl border-2 border-indigo-300 flex items-center justify-between px-3">
            {/* Eyes */}
            <div className="w-3 h-3 bg-slate-800 rounded-full flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full" />
            </div>
            <div className="w-3 h-3 bg-slate-800 rounded-full flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full" />
            </div>
          </div>

          {/* Antenna */}
          <div className="absolute top-[-12px] left-1/2 -translate-x-1/2 w-0.5 h-3 bg-indigo-300" />
          <div className="absolute top-[-18px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" />

          {/* Arms */}
          <div className="absolute bottom-10 left-[18px] w-3 h-8 bg-indigo-100 rounded-full border-2 border-indigo-200 -rotate-12" />
          <div className="absolute bottom-10 right-[18px] w-3 h-8 bg-indigo-100 rounded-full border-2 border-indigo-200 rotate-12" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Page not found
        </h1>
        <p className="text-sm text-slate-500 mb-8 leading-relaxed">
          Our robots searched everywhere, but it seems this page is hiding or doesn't exist.
        </p>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75v-4.5h-4.5V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z" />
          </svg>
          Back to Dashboard
        </Link>

        <p className="text-xs text-slate-400 mt-4">
          Or navigate to <Link href="/generate" className="text-indigo-500 hover:underline">Generate</Link>, <Link href="/history" className="text-indigo-500 hover:underline">History</Link>, <Link href="/settings" className="text-indigo-500 hover:underline">Settings</Link>
        </p>
      </div>
    </div>
  );
}
