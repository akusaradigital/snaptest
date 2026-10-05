"use client";

import { useState, useMemo } from "react";
import { Check, X, Copy, Columns, AlignJustify, Sparkles, AlertTriangle, ShieldCheck, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  oldLine?: string;
  newLine?: string;
  oldNum?: number;
  newNum?: number;
}

interface SideBySideRow {
  left?: { num: number; line: string; type: "removed" | "unchanged" };
  right?: { num: number; line: string; type: "added" | "unchanged" };
}

function computeLcsDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

  // Protect against excessively huge scripts
  if (m > 800 || n > 800) {
    const diff: DiffLine[] = [];
    oldLines.forEach((line, idx) => diff.push({ type: "removed", oldLine: line, oldNum: idx + 1 }));
    newLines.forEach((line, idx) => diff.push({ type: "added", newLine: line, newNum: idx + 1 }));
    return diff;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = m;
  let j = n;
  const diff: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({ type: "unchanged", oldLine: oldLines[i - 1], newLine: newLines[j - 1], oldNum: i, newNum: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: "added", newLine: newLines[j - 1], newNum: j });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diff.unshift({ type: "removed", oldLine: oldLines[i - 1], oldNum: i });
      i--;
    }
  }

  return diff;
}

function buildSideBySideRows(diff: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let i = 0;

  while (i < diff.length) {
    const item = diff[i];
    if (item.type === "unchanged") {
      rows.push({
        left: { num: item.oldNum!, line: item.oldLine!, type: "unchanged" },
        right: { num: item.newNum!, line: item.newLine!, type: "unchanged" },
      });
      i++;
    } else {
      const removedChunk: DiffLine[] = [];
      const addedChunk: DiffLine[] = [];

      while (i < diff.length && diff[i].type !== "unchanged") {
        if (diff[i].type === "removed") removedChunk.push(diff[i]);
        else if (diff[i].type === "added") addedChunk.push(diff[i]);
        i++;
      }

      const maxLen = Math.max(removedChunk.length, addedChunk.length);
      for (let k = 0; k < maxLen; k++) {
        const rem = removedChunk[k];
        const add = addedChunk[k];
        rows.push({
          left: rem ? { num: rem.oldNum!, line: rem.oldLine!, type: "removed" } : undefined,
          right: add ? { num: add.newNum!, line: add.newLine!, type: "added" } : undefined,
        });
      }
    }
  }

  return rows;
}

export interface ScriptDiffViewerProps {
  originalScript: string;
  proposedScript: string;
  rationale?: string;
  confidence?: number;
  analysis?: {
    summary?: string;
    root_cause?: string;
    evidence?: string[];
    risks?: string[];
  };
  fileName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ScriptDiffViewer({
  originalScript,
  proposedScript,
  rationale,
  confidence = 0.85,
  analysis,
  fileName = "test.spec.ts",
  onConfirm,
  onCancel,
}: ScriptDiffViewerProps) {
  const [viewMode, setViewMode] = useState<"side-by-side" | "unified">("side-by-side");

  const oldLines = useMemo(() => originalScript.split("\n"), [originalScript]);
  const newLines = useMemo(() => proposedScript.split("\n"), [proposedScript]);
  const diffLines = useMemo(() => computeLcsDiff(oldLines, newLines), [oldLines, newLines]);
  const sideBySideRows = useMemo(() => buildSideBySideRows(diffLines), [diffLines]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const d of diffLines) {
      if (d.type === "added") added++;
      if (d.type === "removed") removed++;
    }
    return { added, removed };
  }, [diffLines]);

  const copyProposed = () => {
    navigator.clipboard.writeText(proposedScript);
    toast.success("Repaired script copied to clipboard");
  };

  const confidencePct = Math.round((confidence || 0.85) * 100);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5 animate-[fadeIn_0.15s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="repair-diff-title"
    >
      <div className="relative w-full max-w-6xl h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="repair-diff-title" className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  Script Repair Diff
                </h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {fileName}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                    confidencePct >= 80
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {confidencePct}% Confidence
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  <span className="text-emerald-600 font-semibold">+{stats.added}</span>{" "}
                  <span className="text-red-500 font-semibold">-{stats.removed}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xl mt-0.5">
                Review proposed test script fixes before replacing the current file.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center p-0.5 bg-slate-200 dark:bg-slate-800 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setViewMode("side-by-side")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium ${
                  viewMode === "side-by-side"
                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
                title="Side-by-Side Diff"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Side-by-Side</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("unified")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium ${
                  viewMode === "unified"
                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
                title="Unified Diff"
              >
                <AlignJustify className="w-3.5 h-3.5" />
                <span>Unified</span>
              </button>
            </div>

            <button
              type="button"
              onClick={copyProposed}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition shadow-sm"
              title="Copy proposed repair"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Fix</span>
            </button>

            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Close"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* AI Analysis / Root Cause Card */}
        {(analysis?.root_cause || rationale || analysis?.summary) && (
          <div className="px-5 py-3 bg-amber-50/70 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/40 text-xs shrink-0 space-y-1">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                {analysis?.root_cause && (
                  <p className="text-amber-900 dark:text-amber-200 font-medium">
                    <span className="font-bold">Root Cause:</span> {analysis.root_cause}
                  </p>
                )}
                {(rationale || analysis?.summary) && (
                  <p className="text-amber-800 dark:text-amber-300">
                    <span className="font-bold">Proposed Fix:</span> {rationale || analysis?.summary}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Diff Content Area */}
        <div className="flex-1 overflow-auto bg-slate-900 text-slate-200 font-mono text-xs leading-relaxed select-text scrollbar-thin">
          {viewMode === "side-by-side" ? (
            <div className="min-w-full">
              {/* Column Headers */}
              <div className="grid grid-cols-2 bg-slate-800 border-b border-slate-700 text-[11px] font-semibold text-slate-400 sticky top-0 z-10">
                <div className="px-4 py-1.5 border-r border-slate-700 flex items-center justify-between">
                  <span>Original Script</span>
                  <span className="text-red-400 font-mono">-{stats.removed} lines</span>
                </div>
                <div className="px-4 py-1.5 flex items-center justify-between">
                  <span>Proposed Repair</span>
                  <span className="text-emerald-400 font-mono">+{stats.added} lines</span>
                </div>
              </div>

              {/* Side-by-side rows */}
              <div className="divide-y divide-slate-800/60">
                {sideBySideRows.map((row, idx) => {
                  const leftType = row.left?.type;
                  const rightType = row.right?.type;

                  return (
                    <div key={idx} className="grid grid-cols-2">
                      {/* Left side */}
                      <div
                        className={`flex border-r border-slate-800 min-w-0 ${
                          leftType === "removed"
                            ? "bg-red-950/40 text-red-200"
                            : "bg-slate-900/60 text-slate-400"
                        }`}
                      >
                        <span className="w-12 select-none text-right pr-2 text-slate-600 bg-slate-950/40 shrink-0 font-mono">
                          {row.left?.num ?? ""}
                        </span>
                        <span className="w-5 select-none text-center shrink-0 font-bold text-red-400">
                          {leftType === "removed" ? "-" : " "}
                        </span>
                        <pre className="flex-1 px-1 py-0.5 overflow-x-auto whitespace-pre font-mono">
                          {row.left?.line ?? ""}
                        </pre>
                      </div>

                      {/* Right side */}
                      <div
                        className={`flex min-w-0 ${
                          rightType === "added"
                            ? "bg-emerald-950/40 text-emerald-200"
                            : "bg-slate-900/60 text-slate-300"
                        }`}
                      >
                        <span className="w-12 select-none text-right pr-2 text-slate-600 bg-slate-950/40 shrink-0 font-mono">
                          {row.right?.num ?? ""}
                        </span>
                        <span className="w-5 select-none text-center shrink-0 font-bold text-emerald-400">
                          {rightType === "added" ? "+" : " "}
                        </span>
                        <pre className="flex-1 px-1 py-0.5 overflow-x-auto whitespace-pre font-mono">
                          {row.right?.line ?? ""}
                        </pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Unified Diff View */
            <div className="min-w-full">
              <div className="bg-slate-800 px-4 py-1.5 border-b border-slate-700 text-[11px] font-semibold text-slate-400 sticky top-0 z-10 flex items-center justify-between">
                <span>Unified Diff ({fileName})</span>
                <span className="font-mono">
                  <span className="text-emerald-400">+{stats.added}</span> /{" "}
                  <span className="text-red-400">-{stats.removed}</span>
                </span>
              </div>
              <div className="divide-y divide-slate-800/40">
                {diffLines.map((line, idx) => {
                  const isAdded = line.type === "added";
                  const isRemoved = line.type === "removed";

                  return (
                    <div
                      key={idx}
                      className={`flex min-w-0 ${
                        isAdded
                          ? "bg-emerald-950/40 text-emerald-200"
                          : isRemoved
                          ? "bg-red-950/40 text-red-200"
                          : "text-slate-300 hover:bg-slate-800/30"
                      }`}
                    >
                      <span className="w-10 select-none text-right pr-2 text-slate-600 bg-slate-950/40 shrink-0 font-mono">
                        {line.oldNum ?? ""}
                      </span>
                      <span className="w-10 select-none text-right pr-2 text-slate-600 bg-slate-950/40 shrink-0 font-mono">
                        {line.newNum ?? ""}
                      </span>
                      <span
                        className={`w-5 select-none text-center shrink-0 font-bold ${
                          isAdded ? "text-emerald-400" : isRemoved ? "text-red-400" : "text-slate-600"
                        }`}
                      >
                        {isAdded ? "+" : isRemoved ? "-" : " "}
                      </span>
                      <pre className="flex-1 px-1 py-0.5 overflow-x-auto whitespace-pre font-mono">
                        {isAdded ? line.newLine : line.oldLine}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Clicking <strong className="text-slate-700 dark:text-slate-200">Confirm & Apply Repair</strong> will replace the existing script with the repaired version.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
            >
              <Check className="w-4 h-4" />
              <span>Confirm & Apply Repair</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
