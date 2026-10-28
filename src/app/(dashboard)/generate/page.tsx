"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboard } from "@/components/DashboardContext";
import GenerateChatPage from "@/components/pages/GenerateChatPage";
import PlannerPage from "@/components/pages/PlannerPage";
import DataGenPage from "@/components/pages/DataGenPage";
import { Zap, BookOpen, Database } from "lucide-react";

type TestAgentTab = "cases" | "planner" | "data";

function TestAgentContent() {
  const searchParams = useSearchParams();
  const { aiProvider, aiModel } = useDashboard();
  const tabParam = searchParams?.get("tab") as TestAgentTab | null;
  const [activeTab, setActiveTab] = useState<TestAgentTab>(() => {
    if (tabParam === "planner" || tabParam === "data") return tabParam;
    return "cases";
  });

  useEffect(() => {
    if (tabParam === "planner" || tabParam === "data" || tabParam === "cases") {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  return (
    <div className="flex flex-col h-full w-full min-h-0 font-sans">
      {/* ── Sub-navigation Tab Bar ── */}
      <div className="shrink-0 flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80">
          <button
            type="button"
            onClick={() => setActiveTab("cases")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "cases"
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Test Cases &amp; Scripts</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("planner")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "planner"
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Test Planner Matrix</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("data")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "data"
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Test Data Generator</span>
          </button>
        </div>
      </div>

      {/* ── Sub-view Container ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "cases" && <GenerateChatPage aiProvider={aiProvider} aiModel={aiModel} />}
        {activeTab === "planner" && <PlannerPage aiProvider={aiProvider} aiModel={aiModel} />}
        {activeTab === "data" && <DataGenPage aiProvider={aiProvider} aiModel={aiModel} />}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center text-xs text-slate-400">Loading Test Agent...</div>}>
      <TestAgentContent />
    </Suspense>
  );
}
