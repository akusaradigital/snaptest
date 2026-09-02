"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, HelpCircle, Monitor, Smartphone, Laptop, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface TestRun {
  id: string;
  browser: string;
  os: string;
  status: "pass" | "fail" | "untested";
  notes?: string;
  tester_email?: string;
  ran_at: string;
}

interface CompatibilityMatrixProps {
  historyId: string;
}

const BROWSERS = ["Chrome", "Safari", "Firefox", "Edge"];
const OS_LIST = ["Windows", "macOS", "Android", "iOS"];

export default function CompatibilityMatrix({ historyId }: CompatibilityMatrixProps) {
  const [runs, setRuns] = useState<Record<string, TestRun>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const loadRuns = async () => {
    try {
      const res = await fetch(`/api/test-runs?historyId=${historyId}`);
      const data = await res.json();
      if (data.runs) {
        const map: Record<string, TestRun> = {};
        for (const run of data.runs) {
          map[`${run.browser}_${run.os}`] = run;
        }
        setRuns(map);
      }
    } catch {
      toast.error("Failed to load compatibility matrix");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (historyId) loadRuns();
  }, [historyId]);

  const toggleStatus = async (browser: string, os: string) => {
    const key = `${browser}_${os}`;
    const current = runs[key]?.status || "untested";
    const nextStatus = current === "untested" ? "pass" : current === "pass" ? "fail" : "untested";

    setUpdating(key);
    try {
      const res = await fetch("/api/test-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          historyId,
          browser,
          os,
          status: nextStatus,
        }),
      });

      if (!res.ok) throw new Error("Failed to update status");

      setRuns((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || { id: "", browser, os, ran_at: new Date().toISOString() }),
          status: nextStatus,
        },
      }));
      toast.success(`${browser} on ${os}: ${nextStatus.toUpperCase()}`);
    } catch {
      toast.error("Failed to update test run status");
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading matrix...
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div>
          <h4 className="text-xs font-bold text-slate-800">Browser & OS Compatibility Matrix</h4>
          <p className="text-[11px] text-slate-400">Click a cell to cycle: Untested → Pass → Fail</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-center text-xs">
          <thead className="bg-slate-50/20 text-[11px] font-semibold text-slate-500 border-b border-slate-100">
            <tr>
              <th className="py-2.5 px-3 text-left font-semibold text-slate-700">Browser \ OS</th>
              {OS_LIST.map((os) => (
                <th key={os} className="py-2.5 px-3 font-semibold text-slate-700">
                  {os}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {BROWSERS.map((browser) => (
              <tr key={browser} className="hover:bg-slate-50/40">
                <td className="py-2 px-3 text-left font-semibold text-slate-800">{browser}</td>
                {OS_LIST.map((os) => {
                  const key = `${browser}_${os}`;
                  const run = runs[key];
                  const status = run?.status || "untested";
                  const isUpdating = updating === key;

                  return (
                    <td key={os} className="py-2 px-3">
                      <button
                        type="button"
                        onClick={() => toggleStatus(browser, os)}
                        disabled={isUpdating}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          status === "pass"
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                            : status === "fail"
                            ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                            : "bg-slate-50 text-slate-400 hover:bg-slate-100 border border-slate-200/60"
                        }`}
                      >
                        {isUpdating ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : status === "pass" ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : status === "fail" ? (
                          <XCircle className="w-3 h-3 text-rose-600" />
                        ) : (
                          <HelpCircle className="w-3 h-3 text-slate-300" />
                        )}
                        <span className="capitalize">{status}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
