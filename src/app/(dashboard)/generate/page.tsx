"use client";
import { useDashboard } from "@/components/DashboardContext";
import GenerateChatPage from "@/components/pages/GenerateChatPage";

export default function Page() {
  const { aiProvider, aiModel } = useDashboard();
  return <GenerateChatPage aiProvider={aiProvider} aiModel={aiModel} />;
}