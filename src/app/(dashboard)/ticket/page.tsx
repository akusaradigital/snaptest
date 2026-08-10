"use client";
import { useDashboard } from "@/components/DashboardContext";
import TicketPage from "@/components/pages/TicketPage";
import { useSession, signIn } from "next-auth/react";
import { Lock } from "lucide-react";

export default function Page() {
  const { data: session } = useSession();
  const { aiProvider, aiModel } = useDashboard();
  if (!session?.user) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
          <Lock className="w-7 h-7 text-indigo-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Sign in required</h2>
        <p className="text-sm text-slate-500 mt-1.5 mb-5">Sign in with Google to use the Issue & Ticket Agent.</p>
        <button type="button" onClick={() => signIn("google", { callbackUrl: "/ticket" })} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition">
          Sign in with Google
        </button>
      </div>
    </div>
  );
  return <TicketPage aiProvider={aiProvider} aiModel={aiModel} />;
}
