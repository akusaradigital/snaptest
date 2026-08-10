"use client";

import { useState } from "react";
import { GenerateResponse } from "@/types";
import TestCaseTable from "./TestCaseTable";
import ScriptViewer from "./ScriptViewer";
import DownloadButtons from "./DownloadButtons";
import { CheckCircle2, Table2, FileCode2, RotateCcw, Share2, Check } from "lucide-react";

interface ResultsDisplayProps {
  results: GenerateResponse;
  onGenerateAnother?: () => void;
}

export default function ResultsDisplay({ results, onGenerateAnother }: ResultsDisplayProps) {
  const [activeTab, setActiveTab] = useState<"table" | "scripts">("table");
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);
  // ponytail: older history rows / partial payloads may omit scripts
  const scripts = results.scripts ?? [];

  const handleShare = async () => {
    if (!results.history_id || sharing) return;
    setSharing(true);
    try {
      await fetch(`/api/history/${results.history_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: true }),
      });
      const shareUrl = `${window.location.origin}/share/${results.history_id}`;
      await navigator.clipboard.writeText(shareUrl);
      setShared(true);
      setTimeout(() => setShared(false), 3000);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="mt-8">
      {/* Success Banner */}
      <div className="card p-4 mb-6 border-emerald-200 bg-emerald-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <div>
              <p className="text-sm font-medium text-emerald-800">Generation Complete</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {results.page_title} - {results.elements_found} elements found, {scripts.length} scripts generated
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {results.history_id && (
              <button
                type="button"
                onClick={handleShare}
                disabled={sharing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                  shared
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {shared ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
                {shared ? "Link copied!" : "Share"}
              </button>
            )}
            <DownloadButtons results={results} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-5">
        <nav className="flex gap-1">
          <button
            onClick={() => setActiveTab("table")}
            className={`flex items-center gap-2 px-4 pb-3 border-b-2 text-sm font-medium transition-all ${
              activeTab === "table"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Table2 className="w-4 h-4" />
            Test Cases
            {(results.test_cases?.length ?? 0) > 0 && (
              <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                {results.test_cases!.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("scripts")}
            className={`flex items-center gap-2 px-4 pb-3 border-b-2 text-sm font-medium transition-all ${
              activeTab === "scripts"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <FileCode2 className="w-4 h-4" />
            Scripts
            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
              {scripts.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "table" && (
        <TestCaseTable
          markdown={results.test_case_table}
          testCases={results.test_cases}
          scripts={scripts}
        />
      )}
      {activeTab === "scripts" && (
        <ScriptViewer scripts={scripts} />
      )}

      {/* ponytail: prominent CTA button at the bottom of results to generate another */}
      {onGenerateAnother && (
        <div className="mt-8 flex justify-center pb-8 border-t border-slate-100 dark:border-slate-800 pt-6">
          <button
            type="button"
            onClick={onGenerateAnother}
            className="btn-primary flex items-center gap-2 px-6 py-3 shadow-lg shadow-indigo-600/10 text-sm font-semibold"
          >
            <RotateCcw className="w-4 h-4" />
            Generate Another Suite
          </button>
        </div>
      )}
    </div>
  );
}
