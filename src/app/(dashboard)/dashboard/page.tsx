"use client";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import DashboardPage from "@/components/pages/DashboardPage";
import { PageId } from "@/components/Sidebar";

export default function Page() {
  const router = useRouter();
  const onNavigate = (page: PageId) => router.push(`/${page}`);
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center text-xs text-slate-400">Loading Dashboard...</div>}>
      <DashboardPage onNavigate={onNavigate} />
    </Suspense>
  );
}
