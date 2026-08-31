"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Zap, Ticket, ArrowRight, Activity, Users, Database, Globe2, Loader2, BookOpen, PieChart } from "lucide-react";
import { PageId } from "@/components/Sidebar";

interface Metrics {
  totalGenerations: number;
  activeMonitors: number;
  teamMembers: number;
}

interface UsageSummary {
  total_tokens: number;
  total_cache_read_tokens: number;
  total_cache_creation_tokens: number;
  total_requests: number;
}

export default function DashboardPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { data: session } = useSession();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("snaptest_dashboard_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        setMetrics(parsed.metrics || null);
        setUsage(parsed.usage || null);
        setLoadingUsage(false);
      }
    } catch { sessionStorage.removeItem("snaptest_dashboard_cache"); }

    const start = performance.now();
    Promise.all([
      fetch("/api/dashboard/metrics").then((r) => r.json()).catch(() => ({ totalGenerations: 0, activeMonitors: 0, teamMembers: 1 })),
      fetch("/api/usage/summary").then((r) => r.json()).catch(() => ({ summary: null }))
    ]).then(([metricsData, usageData]) => {
      const nextUsage = usageData.summary || null;
      setMetrics(metricsData);
      setUsage(nextUsage);
      sessionStorage.setItem("snaptest_dashboard_cache", JSON.stringify({ metrics: metricsData, usage: nextUsage, cachedAt: Date.now() }));
      if (process.env.NODE_ENV === "development") console.info(`[perf] dashboard summary ${Math.round(performance.now() - start)}ms`);
    }).finally(() => setLoadingUsage(false));
  }, []);

  const STATS = [
    { label: "Tests generated", value: metrics?.totalGenerations, icon: <Zap className="h-4 w-4 text-indigo-600" /> },
    { label: "Active monitors", value: metrics?.activeMonitors, icon: <Activity className="h-4 w-4 text-emerald-600" /> },
    { label: "Team members", value: metrics?.teamMembers, icon: <Users className="h-4 w-4 text-sky-600" /> },
  ];

  const ACTIONS = [
    { page: "generate" as PageId, label: "Test Case Agent", desc: "Create test cases and scripts from a URL or screenshot.", icon: <Zap className="h-5 w-5 text-indigo-600" /> },
    { page: "planner" as PageId, label: "Test Planner", desc: "Turn requirements into a test matrix and effort estimate.", icon: <BookOpen className="h-5 w-5 text-emerald-600" /> },
    { page: "ticket" as PageId, label: "Issue Agent", desc: "Work through Jira and Linear tickets.", icon: <Ticket className="h-5 w-5 text-purple-600" /> },
    { page: "api-agent" as PageId, label: "API Test Agent", desc: "Generate API tests from cURL or Swagger.", icon: <Globe2 className="h-5 w-5 text-sky-600" /> },
    { page: "data" as PageId, label: "Data Generator", desc: "Create mock payloads and edge-case data.", icon: <Database className="h-5 w-5 text-teal-600" /> },
    { page: "report" as PageId, label: "Executive Report", desc: "Summarize testing activity in a PDF report.", icon: <PieChart className="h-5 w-5 text-slate-600" /> },
  ];

  const totalReqs = usage?.total_requests || 0;
  const inputTokens = usage?.total_tokens || 0;
  const cachedTokens = usage?.total_cache_read_tokens || 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Workspace overview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Welcome back, {session?.user?.name?.split(" ")[0] || "there"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Your test automation activity and tools in one place.</p>
        </div>
      </div>

      {/* Flat stat strip */}
      <section aria-label="Workspace statistics" className="flex divide-x divide-slate-200 border-y border-slate-200 dark:divide-slate-700 dark:border-slate-700">
        {STATS.map((stat) => (
          <div key={stat.label} className="flex flex-1 items-center gap-3 px-4 py-5 first:pl-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800">{stat.icon}</span>
            <div className="min-w-0">
              {metrics === null ? (
                <div className="h-7 w-14 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ) : (
                <p className="text-2xl font-semibold leading-none text-slate-950 dark:text-white">{stat.value ?? 0}</p>
              )}
              <p className="mt-1 truncate text-xs text-slate-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Usage, last 30 days */}
      <section>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Usage, last 30 days</h2>
        <p className="mt-1 text-xs text-slate-500">Recorded request and token totals. Output tokens are not separately tracked.</p>
        <dl className="mt-4 grid max-w-2xl grid-cols-1 divide-y divide-slate-200 border-y border-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-slate-700 dark:border-slate-700">
          <div className="px-4 py-4 first:pl-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Requests</dt>
            <dd className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
              {loadingUsage ? <span className="inline-block h-5 w-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /> : totalReqs.toLocaleString()}
            </dd>
          </div>
          <div className="px-4 py-4 sm:first:pl-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Input tokens</dt>
            <dd className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
              {loadingUsage ? <span className="inline-block h-5 w-14 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /> : inputTokens.toLocaleString()}
            </dd>
          </div>
          <div className="px-4 py-4 sm:first:pl-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Cached tokens</dt>
            <dd className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
              {loadingUsage ? <span className="inline-block h-5 w-14 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /> : cachedTokens.toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>

      {/* Feature directory */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Feature directory</h2>
          <span className="text-xs text-slate-400">{ACTIONS.length} tools</span>
        </div>
        <div className="mt-3 divide-y divide-slate-100 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {ACTIONS.map((action) => (
            <button
              key={action.page}
              type="button"
              onClick={() => onNavigate(action.page)}
              className="group flex w-full items-center gap-4 px-2 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-800">{action.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900 dark:text-white">{action.label}</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{action.desc}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-600" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
