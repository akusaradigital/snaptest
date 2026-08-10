"use client";
import { useDashboard } from "@/components/DashboardContext";
import PlannerPage from "@/components/pages/PlannerPage";

export default function Page() {
  const { aiProvider, aiModel } = useDashboard();
  return <PlannerPage aiProvider={aiProvider} aiModel={aiModel} />;
}
