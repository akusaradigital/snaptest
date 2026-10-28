"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  Zap,
  Activity,
  Users,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowUp,
  ArrowRight,
  Info,
  Clock,
  BarChart2,
  PieChart,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useDashboard } from "@/components/DashboardContext";
import ReportPage from "@/components/pages/ReportPage";
import { PageId } from "@/components/Sidebar";

interface Metrics {
  totalGenerations: number;
  generationsGrowth: number;
  activeMonitors: number;
  teamMembers: number;
}

interface ModelUsage {
  model: string;
  requests: number;
  tokens: number;
  cached: number;
  share: number;
}

interface DailyItem {
  day: string;
  label: string;
  fullDate: string;
  requests: number;
  tokens: number;
  cached: number;
  top_model: string;
  dayNumber?: number;
}

interface UsageResponse {
  summary: {
    total_tokens: number;
    total_cache_read_tokens: number;
    total_requests: number;
  };
  by_model: ModelUsage[];
  daily: DailyItem[];
}

export default function DashboardPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const { aiProvider, aiModel } = useDashboard();
  const tabParam = searchParams?.get("tab");
  const [activeTab, setActiveTab] = useState<"overview" | "report">(
    tabParam === "report" ? "report" : "overview"
  );

  useEffect(() => {
    if (tabParam === "report") setActiveTab("report");
    else if (tabParam === "overview") setActiveTab("overview");
  }, [tabParam]);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [usage, setUsage] = useState<UsageResponse["summary"] | null>(null);
  const [modelList, setModelList] = useState<ModelUsage[]>([]);
  const [dailyList, setDailyList] = useState<DailyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState<"requests" | "tokens">("requests");
  const [trendPeriod, setTrendPeriod] = useState<"daily" | "weekly">("daily");
  const [hoveredBar, setHoveredBar] = useState<DailyItem | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("snaptest_dashboard_cache_v3");
      if (cached) {
        const p = JSON.parse(cached);
        setMetrics(p.metrics || null);
        setUsage(p.usage || null);
        setModelList(p.modelList || []);
        setDailyList(p.dailyList || []);
        setLoading(false);
      }
    } catch {
      sessionStorage.removeItem("snaptest_dashboard_cache_v3");
    }

    Promise.all([
      fetch("/api/dashboard/metrics")
        .then((r) => r.json())
        .catch(() => ({ totalGenerations: 0, generationsGrowth: 0, activeMonitors: 0, teamMembers: 1 })),
      fetch("/api/usage/summary")
        .then((r) => r.json())
        .catch(() => ({ summary: null, by_model: [], daily: [] })),
    ])
      .then(([metricsData, usageData]) => {
        setMetrics(metricsData);
        setUsage(usageData.summary || null);
        setModelList(usageData.by_model || []);
        setDailyList(usageData.daily || []);
        sessionStorage.setItem(
          "snaptest_dashboard_cache_v3",
          JSON.stringify({
            metrics: metricsData,
            usage: usageData.summary,
            modelList: usageData.by_model,
            dailyList: usageData.daily,
          })
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const firstName = session?.user?.name ? session.user.name.split(" ")[0] : "Wahyu";

  // Real data with honest zero defaults
  const totalGenerations = metrics?.totalGenerations ?? 0;
  const growthPercent = metrics?.generationsGrowth ?? 0;
  const activeMonitors = metrics?.activeMonitors ?? 0;
  const teamMembers = metrics?.teamMembers ?? 1;

  const totalRequests = usage?.total_requests ?? 0;
  const totalTokens = usage?.total_tokens ?? 0;
  const totalCached = usage?.total_cache_read_tokens ?? 0;

  // Filter per bulan selama 1 tahun
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // 12 months for 1 year (January - December of the current year)
  const monthOptions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const shortNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return Array.from({ length: 12 }, (_, m) => {
      const key = `${currentYear}-${String(m + 1).padStart(2, "0")}`;
      const daysInMonth = new Date(currentYear, m + 1, 0).getDate();
      return {
        key,
        label: `${monthNames[m]} ${currentYear}`,
        monthName: monthNames[m],
        shortName: shortNames[m],
        year: currentYear,
        monthIndex: m,
        daysInMonth,
        isCurrent: m === currentMonth,
      };
    });
  }, []);

  const selectedMonthOption = useMemo(() => {
    return monthOptions.find((m) => m.key === selectedMonthKey) || monthOptions[new Date().getMonth()] || monthOptions[0];
  }, [monthOptions, selectedMonthKey]);

  const currentMonthIdx = monthOptions.findIndex((m) => m.key === selectedMonthKey);
  const handlePrevMonth = () => {
    if (currentMonthIdx > 0) {
      setSelectedMonthKey(monthOptions[currentMonthIdx - 1].key);
    }
  };
  const handleNextMonth = () => {
    if (currentMonthIdx >= 0 && currentMonthIdx < monthOptions.length - 1) {
      setSelectedMonthKey(monthOptions[currentMonthIdx + 1].key);
    }
  };

  // Generate days for the selected month: 1..daysInMonth
  const chartDays = useMemo(() => {
    const days: DailyItem[] = [];
    const map = new Map<string, DailyItem>();
    dailyList.forEach((d) => map.set(d.day, d));

    const { year, monthIndex, daysInMonth, monthName } = selectedMonthOption;

    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(monthIndex + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      const key = `${year}-${mm}-${dd}`;
      const label = String(d); // 1, 2, 3...
      const fullDate = `${monthName} ${d}, ${year}`;

      if (map.has(key)) {
        const item = map.get(key)!;
        days.push({
          ...item,
          day: key,
          label,
          fullDate,
          dayNumber: d,
        });
      } else {
        days.push({
          day: key,
          label,
          fullDate,
          requests: 0,
          tokens: 0,
          cached: 0,
          top_model: "-",
          dayNumber: d,
        });
      }
    }
    return days;
  }, [dailyList, selectedMonthOption]);

  const monthTotalRequests = useMemo(() => {
    return chartDays.reduce((acc, cur) => acc + cur.requests, 0);
  }, [chartDays]);

  const monthTotalTokens = useMemo(() => {
    return chartDays.reduce((acc, cur) => acc + cur.tokens, 0);
  }, [chartDays]);

  // Model breakdown data from real database records
  const displayModels = useMemo(() => {
    return modelList;
  }, [modelList]);

  // Dynamic model color assignment by model provider/family
  const getModelColor = (modelName: string) => {
    const m = (modelName || "").toLowerCase();
    if (m.includes("claude") || m.includes("anthropic")) {
      return { dot: "bg-amber-500", bar: "bg-amber-500" };
    }
    if (m.includes("gpt") || m.includes("openai") || m.includes("o1") || m.includes("o3")) {
      return { dot: "bg-emerald-500", bar: "bg-emerald-500" };
    }
    if (m.includes("gemini") || m.includes("google")) {
      return { dot: "bg-blue-500", bar: "bg-blue-500" };
    }
    if (m.includes("deepseek")) {
      return { dot: "bg-cyan-500", bar: "bg-cyan-500" };
    }
    if (m.includes("llama") || m.includes("groq")) {
      return { dot: "bg-orange-500", bar: "bg-orange-500" };
    }
    if (m.includes("kimi") || m.includes("moonshot") || m.includes("luna")) {
      return { dot: "bg-purple-500", bar: "bg-purple-500" };
    }
    return { dot: "bg-indigo-500", bar: "bg-indigo-500" };
  };

  // Trend table data (daily or weekly aggregates from real usage)
  const trendDays = useMemo(() => {
    if (trendPeriod === "weekly") {
      const weeks: DailyItem[] = [];
      for (let w = 0; w < 4; w++) {
        const startIdx = chartDays.length - (w + 1) * 7;
        const endIdx = chartDays.length - w * 7;
        const slice = chartDays.slice(Math.max(0, startIdx), endIdx);
        if (slice.length === 0) continue;
        const totalReqs = slice.reduce((acc, cur) => acc + cur.requests, 0);
        const totalToks = slice.reduce((acc, cur) => acc + cur.tokens, 0);
        const totalCach = slice.reduce((acc, cur) => acc + cur.cached, 0);
        const activeModel = slice.find((s) => s.top_model && s.top_model !== "-")?.top_model;
        weeks.push({
          day: `w-${w}`,
          label: `Week ${w + 1}`,
          fullDate: `${selectedMonthOption.shortName} ${slice[0].label} - ${slice[slice.length - 1].label}, ${selectedMonthOption.year}`,
          requests: totalReqs,
          tokens: totalToks,
          cached: totalCach,
          top_model: activeModel || "-",
        });
      }
      return weeks;
    }
    const withActivity = chartDays.filter((d) => d.requests > 0 || d.tokens > 0);
    if (withActivity.length > 0) {
      return [...withActivity].slice(-7).reverse();
    }
    return [...chartDays].slice(-5).reverse();
  }, [chartDays, trendPeriod, selectedMonthOption]);

  // SVG Chart dimensions
  const chartWidth = 920;
  const chartHeight = 220;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;

  const maxVal = Math.max(...chartDays.map((d) => (chartMetric === "requests" ? d.requests : d.tokens)), 0);
  const yMax = maxVal > 0 ? Math.ceil(maxVal * 1.2) : (chartMetric === "requests" ? 10 : 1000);
  const yTicks = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0];

  const barCount = chartDays.length;
  const barSlotWidth = plotWidth / barCount;
  const barWidth = Math.min(16, Math.max(10, Math.floor(barSlotWidth * 0.55)));

  const dateRangeDisplay = useMemo(() => {
    return `${selectedMonthOption.label} (1 - ${selectedMonthOption.daysInMonth})`;
  }, [selectedMonthOption]);

  return (
    <div className="flex flex-col h-full w-full min-h-0 font-sans">
      {/* ── Top Header Strip with Tab Switcher ── */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800 mb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
              DASHBOARD
            </p>
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              {activeTab === "overview" ? `Welcome back, ${firstName}` : "Executive Intelligence Report"}
            </h1>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === "overview"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Overview &amp; Metrics</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("report")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === "report"
                  ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <PieChart className="w-3.5 h-3.5" />
              <span>Executive Report</span>
            </button>
          </div>
        </div>

        {activeTab === "overview" && (
          <div className="flex items-center gap-2.5">
            {/* Date Range Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 shadow-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{dateRangeDisplay}</span>
            </div>

            {/* Primary CTA */}
            <button
              type="button"
              onClick={() => onNavigate("generate")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create test</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === "overview" ? (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pb-12 pr-1 scrollbar-thin">

      {/* ── Top 3 KPI Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Tests generated */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6 fill-current stroke-none" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tests generated</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {loading ? "..." : totalGenerations}
              </p>
            </div>
          </div>
          <div className="text-right">
            {growthPercent > 0 ? (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
                <ArrowUp className="w-3 h-3 stroke-[2.5]" /> {growthPercent}%
              </span>
            ) : growthPercent < 0 ? (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800">
                {growthPercent}%
              </span>
            ) : (
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                -
              </span>
            )}
            <p className="text-[11px] text-slate-400 mt-1">{growthPercent === 0 ? "No change" : "vs last 30 days"}</p>
          </div>
        </div>

        {/* Card 2: Active monitors */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Activity className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active monitors</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {loading ? "..." : activeMonitors}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
              -
            </span>
            <p className="text-[11px] text-slate-400 mt-1">No change</p>
          </div>
        </div>

        {/* Card 3: Team members */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-500 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6 stroke-[2]" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Team members</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {loading ? "..." : teamMembers}
              </p>
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={() => onNavigate("settings")}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 transition"
            >
              <span>Manage team</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Chart Card: Usage by Month (Matching Image #13) ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Usage, {selectedMonthOption.label}
              </h2>
              <Info className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Recorded request and token totals for {selectedMonthOption.label}. Output tokens are not separately tracked.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter per bulan selama 1 tahun */}
            <div className="flex items-center bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-0.5 shadow-xs">
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={currentMonthIdx <= 0}
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                title="Previous month"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="relative">
                <select
                  value={selectedMonthKey}
                  onChange={(e) => setSelectedMonthKey(e.target.value)}
                  className="appearance-none bg-transparent border-0 py-1 pl-2 pr-6 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none"
                >
                  {monthOptions.map((opt) => (
                    <option key={opt.key} value={opt.key} className="dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                      {opt.label} {opt.isCurrent ? "(Current)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                disabled={currentMonthIdx >= monthOptions.length - 1}
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                title="Next month"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Metric Selector (Requests / Tokens) */}
            <div className="relative">
              <select
                value={chartMetric}
                onChange={(e) => setChartMetric(e.target.value as "requests" | "tokens")}
                className="appearance-none bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 pr-8 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="requests">Requests</option>
                <option value="tokens">Tokens</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Bar Chart Container */}
        <div className="mt-6 relative w-full select-none" style={{ height: "230px" }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-full"
            preserveAspectRatio="none"
            onMouseLeave={() => {
              setHoveredBar(null);
              setTooltipPos(null);
            }}
          >
            {/* Horizontal Gridlines & Y-Axis Labels */}
            {yTicks.map((val) => {
              const y = padTop + plotHeight - (val / yMax) * plotHeight;
              return (
                <g key={val}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={chartWidth - padRight}
                    y2={y}
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    className="text-slate-100 dark:text-slate-700/60"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="11"
                    className="fill-slate-400 font-medium"
                    fontFamily="system-ui, sans-serif"
                  >
                    {val >= 1000 ? `${val / 1000}k` : val}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {chartDays.map((d, i) => {
              const val = chartMetric === "requests" ? d.requests : d.tokens;
              const scaledHeight = val > 0 ? Math.max(6, Math.round((val / yMax) * plotHeight)) : 2;
              const x = padLeft + i * barSlotWidth + (barSlotWidth - barWidth) / 2;
              const y = padTop + plotHeight - scaledHeight;

              return (
                <g key={d.day}>
                  {/* Invisible hit rect for easy mouse hover */}
                  <rect
                    x={padLeft + i * barSlotWidth}
                    y={padTop}
                    width={barSlotWidth}
                    height={plotHeight}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={(e) => {
                      const rect = svgRef.current?.getBoundingClientRect();
                      if (rect) {
                        setTooltipPos({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top,
                        });
                        setHoveredBar(d);
                      }
                    }}
                  />
                  {/* Visual Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={scaledHeight}
                    rx="3"
                    className={`${
                      hoveredBar?.day === d.day
                        ? "fill-blue-500"
                        : "fill-blue-600 dark:fill-blue-500"
                    } transition-colors`}
                  />
                </g>
              );
            })}

            {/* X-Axis Day Numbers: 1, 2, 3, ... sesuai dengan bulan dan tahun itu */}
            {chartDays.map((d, i) => {
              const x = padLeft + i * barSlotWidth + barSlotWidth / 2;
              const isHovered = hoveredBar?.day === d.day;
              return (
                <text
                  key={`label-${d.day}`}
                  x={x}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  fontSize="10"
                  className={`font-medium transition-colors ${
                    isHovered
                      ? "fill-blue-600 dark:fill-blue-400 font-bold"
                      : "fill-slate-400 dark:fill-slate-500"
                  }`}
                  fontFamily="system-ui, sans-serif"
                >
                  {d.label}
                </text>
              );
            })}
          </svg>

          {/* Interactive Tooltip (Themed: White on Day / Dark on Night, auto edge-clamped) */}
          {hoveredBar && tooltipPos && (() => {
            const dayNum = hoveredBar.dayNumber ?? 1;
            const totalDays = selectedMonthOption.daysInMonth;
            const isNearRight = dayNum >= totalDays - 2;
            const isNearLeft = dayNum <= 3;
            const translateClass = isNearRight
              ? "-translate-x-[92%] -translate-y-full"
              : isNearLeft
              ? "-translate-x-[8%] -translate-y-full"
              : "-translate-x-1/2 -translate-y-full";

            return (
              <div
                className={`absolute pointer-events-none z-30 bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 text-xs rounded-xl px-3.5 py-2.5 shadow-xl shadow-slate-900/10 dark:shadow-slate-950/50 border border-slate-200/90 dark:border-slate-700/80 backdrop-blur-xs transition-transform duration-75 mb-2 min-w-[170px] ${translateClass}`}
                style={{
                  left: `${tooltipPos.x}px`,
                  top: `${tooltipPos.y - 10}px`,
                }}
              >
                <div className="flex items-center justify-between gap-3 pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-700/60">
                  <span className="font-bold text-slate-900 dark:text-white text-xs">
                    {hoveredBar.fullDate}
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                    Day {hoveredBar.dayNumber || hoveredBar.label}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        chartMetric === "requests" ? "bg-blue-600 dark:bg-blue-500" : "bg-indigo-600 dark:bg-indigo-400"
                      }`}
                    />
                    <span className="text-slate-500 dark:text-slate-400 capitalize">{chartMetric}:</span>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                    {(chartMetric === "requests" ? hoveredBar.requests : hoveredBar.tokens).toLocaleString()}
                  </span>
                </div>
                {hoveredBar.top_model && hoveredBar.top_model !== "-" && (
                  <div className="flex items-center justify-between gap-4 text-[11px] pt-1 mt-1 border-t border-slate-100 dark:border-slate-700/40 text-slate-500 dark:text-slate-400">
                    <span>Model:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[120px]">
                      {hoveredBar.top_model}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Summary totals below chart */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700/60 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Requests */}
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Requests ({selectedMonthOption.shortName})
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
              {(monthTotalRequests > 0 ? monthTotalRequests : totalRequests).toLocaleString()}
            </p>
          </div>

          {/* Input tokens */}
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Input tokens ({selectedMonthOption.shortName})
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
              {(monthTotalTokens > 0 ? monthTotalTokens : totalTokens).toLocaleString()}
            </p>
          </div>

          {/* Cached tokens */}
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Cached tokens ({selectedMonthOption.shortName})
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
              {totalCached.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* ── Bottom Row: Two Cards Side-by-Side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card Left: Token usage by model */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Token usage by model</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("settings")}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 transition"
            >
              <span>View details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700/80 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 font-semibold">MODEL</th>
                  <th className="py-2.5 font-semibold">REQUESTS</th>
                  <th className="py-2.5 font-semibold">INPUT TOKENS</th>
                  <th className="py-2.5 font-semibold">CACHED</th>
                  <th className="py-2.5 font-semibold">SHARE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {displayModels.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                      No model usage recorded in the last 30 days.
                    </td>
                  </tr>
                ) : (
                  displayModels.map((item) => {
                    const colors = getModelColor(item.model);
                    return (
                      <tr key={item.model} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition">
                        <td className="py-3 font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
                          <span>{item.model}</span>
                        </td>
                        <td className="py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                          {item.requests.toLocaleString()}
                        </td>
                        <td className="py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                          {item.tokens.toLocaleString()}
                        </td>
                        <td className="py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                          {item.cached.toLocaleString()}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-7 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                              {item.share}%
                            </span>
                            <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${colors.bar}`}
                                style={{ width: `${Math.min(100, Math.max(item.share, 4))}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Card Right: Token usage trend */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Token usage trend</h3>
            </div>
            <div className="relative">
              <select
                value={trendPeriod}
                onChange={(e) => setTrendPeriod(e.target.value as "daily" | "weekly")}
                className="appearance-none bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1 pr-6 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700/80 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 font-semibold">DATE</th>
                  <th className="py-2.5 font-semibold">REQUESTS</th>
                  <th className="py-2.5 font-semibold">INPUT TOKENS</th>
                  <th className="py-2.5 font-semibold">CACHED</th>
                  <th className="py-2.5 font-semibold">TOP MODEL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {trendDays.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                      No activity recorded in the last 30 days.
                    </td>
                  </tr>
                ) : (
                  trendDays.map((item) => (
                    <tr key={item.day} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition">
                      <td className="py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {item.fullDate}
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                        {item.requests.toLocaleString()}
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                        {item.tokens.toLocaleString()}
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                        {item.cached.toLocaleString()}
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                        {item.top_model}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ReportPage aiProvider={aiProvider} aiModel={aiModel} />
        </div>
      )}
    </div>
  );
}
