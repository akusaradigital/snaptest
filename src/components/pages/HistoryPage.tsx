"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  History, Search, Clock, Loader2, ArrowRight, Zap, Ticket, Database, Wrench, Globe2, Filter, Activity
} from "lucide-react";
import toast from "react-hot-toast";

interface ActivityLog {
  id: string;
  subject: string;
  description: string;
  type: "generate" | "ticket" | "data_generation" | "script_repair" | "api_agent";
  timestamp: string;
}

export default function HistoryPage() {
  const { data: session } = useSession();
  const router = useRouter();
  
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!session?.user) return;
    
    setIsLoading(true);
    const controller = new AbortController();
    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await fetch(`/api/activity?search=${encodeURIComponent(search)}&filter=${filter}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setActivities(data.activities || []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") toast.error("Failed to fetch activity log");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(delayDebounceFn);
      controller.abort();
    };
  }, [search, filter, session]);

  const getIconForType = (type: string) => {
    switch (type) {
      case "generate": return <Zap className="w-4 h-4 text-indigo-500" />;
      case "ticket": return <Ticket className="w-4 h-4 text-purple-500" />;
      case "data_generation": return <Database className="w-4 h-4 text-sky-500" />;
      case "script_repair": return <Wrench className="w-4 h-4 text-amber-500" />;
      case "api_agent": return <Globe2 className="w-4 h-4 text-emerald-500" />;
      default: return <Activity className="w-4 h-4 text-slate-500" />;
    }
  };

  const getLabelForType = (type: string) => {
    switch (type) {
      case "generate": return "Test Case Agent";
      case "ticket": return "Issue Agent";
      case "data_generation": return "Data Generator";
      case "script_repair": return "Script Auto-Repair";
      case "api_agent": return "API Test Agent";
      default: return "Activity";
    }
  };

  const handleJump = (item: ActivityLog) => {
    if (item.type === "generate") {
      router.push(`/generate#${item.id}`);
    } else if (item.type === "ticket") {
      router.push(`/ticket#${item.id}`);
    } else if (item.type === "data_generation") {
      router.push(`/data`);
    } else if (item.type === "api_agent") {
      router.push(`/api-agent`);
    }
  };

  if (!session?.user) return null; // handled by parent layout gate

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <History className="w-6 h-6 text-slate-500" />
          Global Search &amp; Activity
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Unified audit log of all your actions across AI agents and tools.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <label htmlFor="activity-search" className="sr-only">Search activity</label>
            <input
              id="activity-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activity, URLs, context..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-shadow"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <label htmlFor="activity-filter" className="sr-only">Filter activity by agent</label>
            <select
              id="activity-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none"
            >
              <option value="all">All Agents</option>
              <option value="generate">Test Case Agent</option>
              <option value="ticket">Issue Agent</option>
              <option value="api_agent">API Test Agent</option>
              <option value="data">Data Generator</option>
              <option value="repair">Script Auto-Repair</option>
            </select>
          </div>
        </div>

        {/* Timeline List */}
        <div className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2 text-indigo-500" />
              <span className="text-sm">Fetching activity log...</span>
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Clock className="w-8 h-8 mb-3 opacity-20" />
              <p className="text-sm font-medium text-slate-600">No activity found</p>
              <p className="text-xs mt-1">Try adjusting your filters or search terms.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activities.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => handleJump(item)}
                  className="group flex w-full flex-col sm:flex-row sm:items-center justify-between p-4 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 transition"
                >
                  <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                      {getIconForType(item.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {getLabelForType(item.type)}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date(item.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {item.subject || "Untitled Task"}
                      </p>
                      {item.description && (
                        <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{item.description}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-3 sm:mt-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0 w-fit">
                    Open Tool <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
