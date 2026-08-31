"use client";

import { useState } from "react";
import { getAiRequestPayload } from "@/lib/keys";
import toast from "react-hot-toast";
import { Loader2, FileText, Download } from "lucide-react";

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

export default function ReportPage({ aiProvider, aiModel }: ReportPageProps) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportResult | null>(null);

  const handleGenerate = async () => {
    const aiPayload = getAiRequestPayload(aiProvider, aiModel);
    if (aiProvider === "9router-public" ? !aiPayload.nine_router_public_url : !aiPayload.api_key) {
      toast.error(aiProvider === "9router-public" ? "No 9Router Public URL configured. Go to Settings first." : `No API key configured for ${aiProvider}. Go to Settings first.`);
      return;
    }

    setLoading(true);
    setReport(null);
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
      setReport(data.result);
      toast.success("Executive report generated");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  if (!report) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 flex items-center justify-center mb-5">
            <FileText className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Executive Test Report</h2>
          <p className="text-sm text-slate-500 mb-6">
            Generate a professional QA summary report based on your last 30 days of testing activity,
            Jira tickets, and AI usage.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                Generate Executive Report
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 print:space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Report</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 transition"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Regenerate
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 transition"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>

      {/* Report card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 lg:p-10 print:border-none print:shadow-none print:p-0 space-y-7">
        {/* Title */}
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{report.title}</h2>
          <p className="text-xs text-slate-400 mt-1">
            Generated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Summary */}
        <section>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Executive Summary</h3>
          <p className="text-sm text-slate-700 leading-relaxed">{report.summary}</p>
        </section>

        {/* Key Achievements */}
        <section>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Key Achievements</h3>
          <ul className="space-y-2">
            {report.key_achievements.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Risk Assessment */}
        <section>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Risk Assessment</h3>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-800 leading-relaxed">{report.risk_assessment}</p>
          </div>
        </section>

        {/* Recommendations */}
        <section>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Recommendations</h3>
          <ul className="space-y-2">
            {report.recommendations.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
