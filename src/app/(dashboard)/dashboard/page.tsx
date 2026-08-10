"use client";
import { useRouter } from "next/navigation";
import DashboardPage from "@/components/pages/DashboardPage";
import { PageId } from "@/components/Sidebar";

export default function Page() {
  const router = useRouter();
  const onNavigate = (page: PageId) => router.push(`/${page}`);
  return <DashboardPage onNavigate={onNavigate} />;
}
