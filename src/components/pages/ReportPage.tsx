"use client";

import { useState, useEffect, useRef } from "react";
import { getAiRequestPayload } from "@/lib/keys";
import toast from "react-hot-toast";
import {
  Loader2,
  FileText,
  Download,
  Clock,
  RotateCw,
  Trash2,
  Check,
  X,
  PlusCircle
} from "lucide-react";

interface ReportPageProps {
  aiProvider: string;
  aiModel: string;
}

interface ReportResult {
  title: string;
  summary: string;
  key_achievements: string[];
  risk_assessment: string;
  recommendations: string[];
}

interface ReportSession {
  id: string;
  title: string;
  updatedAt: string;
  report: ReportResult;
}

const AGENT_TYPE = "report";
const REPORT_CACHE_KEY = "snaptest_executive_report_cache_v1";
const REPORT_SESSIONS_STORAGE = "snaptest_report_sessions_v1";
const ACTIVE_REPORT_SESSION_KEY = "snaptest_report_active_session_id";

export default function ReportPage({ aiProvider, aiModel }: ReportPageProps) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [sessions, setSessions] = useState<ReportSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Close history dropdown when clicking outside
  useEffect(() => {
    if (!historyOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
        setDeleteConfirmId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [historyOpen]);

  // Initial mount: load cached report and sessions
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      let localSessions: ReportSession[] = [];
      let initialReport: ReportResult | null = null;

      // 1. Immediately restore cached report and sessions from localStorage
      try {
        const cached = localStorage.getItem(REPORT_CACHE_KEY);
        if (cached) {
          initialReport = JSON.parse(cached);
          if (initialReport && initialReport.title) {
            setReport(initialReport);
          }
        }

        const stored = localStorage.getItem(REPORT_SESSIONS_STORAGE);
        if (stored) {
          localSessions = JSON.parse(stored);
          if (Array.isArray(localSessions) && localSessions.length > 0) {
            setSessions(localSessions);
            const hashId = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
            const savedActiveId = localStorage.getItem(ACTIVE_REPORT_SESSION_KEY);
            const targetId = hashId && localSessions.some(s => s.id === hashId)
              ? hashId
              : (savedActiveId && localSessions.some(s => s.id === savedActiveId)
                ? savedActiveId
                : localSessions[0]?.id);

            if (targetId) {
              setActiveSessionId(targetId);
              const found = localSessions.find(s => s.id === targetId);
              if (found?.report && !initialReport) {
                setReport(found.report);
              }
            }
          }
        }
      } catch { /* ignore */ }

      // 2. Fetch server sessions
      try {
        const res = await fetch(`/api/sessions?agent_type=${AGENT_TYPE}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items)) {
            const localMap = new Map<string, ReportSession>();
            localSessions.forEach(s => { if (s?.id) localMap.set(s.id, s); });

            const serverSessions: ReportSession[] = data.items.map((it: any) => {
              const local = localMap.get(it.id);
              return {
                id: it.id,
                title: it.title || local?.title || 'Executive Report',
                updatedAt: it.updated_at,
                report: local?.report as ReportResult,
              };
            });

            const serverIds = new Set(data.items.map((i: any) => i.id));
            const localOnly = localSessions.filter(s => !serverIds.has(s.id));
            const merged = [...serverSessions, ...localOnly];

            if (isMounted) {
              setSessions(merged);
              try {
                localStorage.setItem(REPORT_SESSIONS_STORAGE, JSON.stringify(merged));
              } catch {}
            }

            const hashId = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
            const savedActiveId = localStorage.getItem(ACTIVE_REPORT_SESSION_KEY);
            const activeId = hashId && merged.some(s => s.id === hashId)
              ? hashId
              : (savedActiveId && merged.some(s => s.id === savedActiveId)
                ? savedActiveId
                : merged[0]?.id);

            if (activeId && isMounted) {
              setActiveSessionId(activeId);
              try { localStorage.setItem(ACTIVE_REPORT_SESSION_KEY, activeId); } catch {}
              const existing = merged.find(s => s.id === activeId);

              if (existing?.report) {
                if (!initialReport) {
                  setReport(existing.report);
                  try {
                    localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(existing.report));
                  } catch {}
                }
              } else {
                // Fetch report detail from server if not cached locally
                try {
                  const detailRes = await fetch(`/api/sessions/${activeId}`);
                  if (detailRes.ok) {
                    const detail = await detailRes.json();
                    const fetchedReport = detail.data?.report as ReportResult;
                    if (fetchedReport && isMounted) {
                      setReport(fetchedReport);
                      try {
                        localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(fetchedReport));
                      } catch {}
                      setSessions(prev => {
                        const updated = prev.map(x => x.id === activeId ? { ...x, report: fetchedReport } : x);
                        try { localStorage.setItem(REPORT_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
                        return updated;
                      });
                    }
                  }
                } catch {}
              }
            }
          }
        }
      } catch { /* ignore */ }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleGenerate = async () => {
    const aiPayload = getAiRequestPayload(aiProvider, aiModel);
    if (aiProvider === "9router-public" ? !aiPayload.nine_router_public_url : !aiPayload.api_key) {
      toast.error(
        aiProvider === "9router-public"
          ? "No 9Router Public URL configured. Go to Settings first."
          : `No API key configured for ${aiProvider}. Go to Settings first.`
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...aiPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate report");

      const newReport: ReportResult = data.result;
      setReport(newReport);

      // Save to cache immediately
      try {
        localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(newReport));
      } catch {}

      const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const newTitle = newReport.title || `Executive Report (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
      const nowIso = new Date().toISOString();

      const newSession: ReportSession = {
        id: newId,
        title: newTitle,
        updatedAt: nowIso,
        report: newReport,
      };

      setActiveSessionId(newId);
      setSessions(prev => {
        const updated = [newSession, ...prev.filter(s => s.id !== newId)];
        try {
          localStorage.setItem(REPORT_SESSIONS_STORAGE, JSON.stringify(updated));
          localStorage.setItem(ACTIVE_REPORT_SESSION_KEY, newId);
          sessionStorage.removeItem("snaptest_dashboard_cache");
        } catch {}
        return updated;
      });

      // Persist to server
      try {
        await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: newId,
            agent_type: AGENT_TYPE,
            title: newTitle,
            data_json: { report: newReport },
          }),
        });
      } catch { /* offline: localStorage fallback already saved */ }

      toast.success("Executive report generated");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const selectReportSession = async (session: ReportSession) => {
    setActiveSessionId(session.id);
    setHistoryOpen(false);
    setDeleteConfirmId(null);
    try {
      localStorage.setItem(ACTIVE_REPORT_SESSION_KEY, session.id);
      window.location.hash = session.id;
    } catch {}

    if (session.report) {
      setReport(session.report);
      try {
        localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(session.report));
      } catch {}
      toast.success(`Loaded "${session.title}"`);
      return;
    }

    try {
      const res = await fetch(`/api/sessions/${session.id}`);
      if (!res.ok) throw new Error();
      const detail = await res.json();
      const fetchedReport = detail.data?.report as ReportResult;
      if (fetchedReport) {
        setReport(fetchedReport);
        try {
          localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(fetchedReport));
        } catch {}
        setSessions(prev => {
          const updated = prev.map(s => s.id === session.id ? { ...s, report: fetchedReport } : s);
          try { localStorage.setItem(REPORT_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
          return updated;
        });
        toast.success(`Loaded "${session.title}"`);
      }
    } catch {
      toast.error("Failed to load report");
    }
  };

  const handleDeleteSession = (id: string) => {
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    try {
      localStorage.setItem(REPORT_SESSIONS_STORAGE, JSON.stringify(updated));
    } catch {}

    if (activeSessionId === id) {
      if (updated.length > 0) {
        selectReportSession(updated[0]);
      } else {
        setActiveSessionId(null);
        setReport(null);
        try {
          localStorage.removeItem(REPORT_CACHE_KEY);
          localStorage.removeItem(ACTIVE_REPORT_SESSION_KEY);
          if (window.location.hash) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        } catch {}
      }
    }

    fetch(`/api/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
    setDeleteConfirmId(null);
    toast.success("Report deleted");
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const reportDateStr = activeSession
    ? new Date(activeSession.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="max-w-4xl mx-auto space-y-6 print:space-y-4">
      {/* Action Bar Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Executive Report</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Professional QA summary synthesized from testing activity, tickets, and AI telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Past Reports dropdown */}
          <div className="relative" ref={historyRef}>
            <button
              type="button"
              onClick={() => setHistoryOpen(o => !o)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition ${
                historyOpen
                  ? "bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
              title="View past reports"
            >
              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Past Reports</span>
              {sessions.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-xs bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold">
                  {sessions.length}
                </span>
              )}
            </button>

            {historyOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-3 z-30 flex flex-col max-h-[460px]">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Past Executive Reports ({sessions.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => { setHistoryOpen(false); handleGenerate(); }}
                    disabled={loading}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium disabled:opacity-50"
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>Generate New</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[100px]">
                  {sessions.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      No past reports saved yet. Generate your first executive report!
                    </div>
                  ) : (
                    sessions.map(s => {
                      const isActive = s.id === activeSessionId;
                      return (
                        <div
                          key={s.id}
                          className={`group relative flex items-center justify-between p-2.5 rounded-lg text-xs transition cursor-pointer border ${
                            isActive
                              ? "bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent"
                          }`}
                          onClick={() => selectReportSession(s)}
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <span className={`font-semibold block truncate ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-800 dark:text-slate-200"}`}>
                              {s.title}
                            </span>
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              {new Date(s.updatedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                            {deleteConfirmId === s.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSession(s.id)}
                                  className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded"
                                  title="Confirm delete"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(s.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 text-slate-400 transition"
                                title="Delete report"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Regenerate Fresh Report */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 disabled:opacity-60 transition"
            title="Re-run analysis to generate a fresh report"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCw className="w-4 h-4" />
            )}
            <span>Regenerate Fresh Report</span>
          </button>

          {/* Download PDF */}
          {report && (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 transition"
              title="Print or export report to PDF"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Body: Either Empty State or Report View */}
      {!report ? (
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center max-w-md p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center mb-5">
              <FileText className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Executive Test Report</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Generate a professional QA summary report based on your last 30 days of testing activity,
              Jira tickets, and AI telemetry.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Report...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    Generate Executive Report
                  </>
                )}
              </button>

              {sessions.length > 0 && (
                <button
                  type="button"
                  onClick={() => selectReportSession(sessions[0])}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium py-1"
                >
                  Or view recent report: &ldquo;{sessions[0].title}&rdquo;
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Subtle Regeneration Indicator when regenerating in the background */}
          {loading && (
            <div className="flex items-center gap-2.5 p-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-medium animate-pulse print:hidden">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>AI Agent is analyzing the last 30 days of testing data and synthesizing a fresh executive report...</span>
            </div>
          )}

          {/* Report Document Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 lg:p-10 print:border-none print:shadow-none print:p-0 space-y-7">
            {/* Title & Metadata */}
            <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{report.title}</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 flex items-center gap-2">
                <span>Generated {reportDateStr}</span>
                <span>·</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-medium">30-Day QA Synthesis</span>
              </p>
            </div>

            {/* Executive Summary */}
            {report.summary && (
              <section>
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Executive Summary</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{report.summary}</p>
              </section>
            )}

            {/* Key Achievements */}
            {Array.isArray(report.key_achievements) && report.key_achievements.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Key Achievements</h3>
                <ul className="space-y-2.5">
                  {report.key_achievements.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Risk Assessment */}
            {report.risk_assessment && (
              <section>
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Risk Assessment</h3>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl p-4">
                  <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">{report.risk_assessment}</p>
                </div>
              </section>
            )}

            {/* Recommendations */}
            {Array.isArray(report.recommendations) && report.recommendations.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Recommendations</h3>
                <ul className="space-y-2.5">
                  {report.recommendations.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
