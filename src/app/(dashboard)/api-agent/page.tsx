"use client";

import { useDashboard } from "@/components/DashboardContext";
import ApiAgentPage from "@/components/pages/ApiAgentPage";

export default function ApiAgentRoute() {
  const { aiProvider, aiModel } = useDashboard();
  return <ApiAgentPage aiProvider={aiProvider} aiModel={aiModel} />;
}