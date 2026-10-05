"use client";

import { useState, useMemo, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ScriptFile } from "@/types";
import { generatePlaywrightConfig } from "@/lib/playwrightConfig";
import toast from "react-hot-toast";
import {
  Copy,
  Folder,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Download,
  AlertCircle,
} from "lucide-react";

interface ScriptViewerProps {
  scripts: ScriptFile[];
  baseUrl?: string;
}

interface SandboxRunState {
  status: "idle" | "running" | "passed" | "failed";
  duration?: number;
  error?: string | null;
  passedCount?: number;
  failedCount?: number;
}

function dlBlob(filename: string, mime: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ScriptViewer({ scripts, baseUrl }: ScriptViewerProps) {
  const [activeScript, setActiveScript] = useState(0);
  const [runStates, setRunStates] = useState<Record<string, SandboxRunState>>({});
  const [liveElapsed, setLiveElapsed] = useState<number>(0);

  const current = scripts[activeScript];
  const currentKey = current?.file_name || `script_${activeScript}`;
  const currentRunState = runStates[currentKey] || { status: "idle" };

  // Timer for live duration counter while running
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (currentRunState.status === "running") {
      setLiveElapsed(0);
      const start = Date.now();
      interval = setInterval(() => {
        setLiveElapsed(Number(((Date.now() - start) / 1000).toFixed(1)));
      }, 100);
    } else {
      setLiveElapsed(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentRunState.status]);

  const formattedContent = useMemo(
    () => formatScriptContent(current?.content || ""),
    [current?.content]
  );

  const copyScript = (content: string) => {
    const cleanContent = formatScriptContent(content);
    navigator.clipboard.writeText(cleanContent);
    toast.success("Script copied to clipboard");
  };

  // Helper to clean script content from escape sequences
  function formatScriptContent(content: string): string {
    if (!content) return "";
    return content.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }

  // Helper to get syntax language based on file extension
  const getSyntaxLanguage = (fileName: string): string => {
    const ext = fileName?.split(".").pop()?.toLowerCase();
    if (ext === "py") return "python";
    if (ext === "java") return "java";
    if (ext === "cs") return "csharp";
    if (ext === "js" || ext === "ts") return "javascript";
    return "typescript";
  };

  // Shorten tab display name by stripping case slug prefix
  const getShortTabName = (fileName: string, index: number): string => {
    const parts = fileName.split("-");
    if (parts.length > 1) {
      return `${index + 1}. ${parts.slice(1).join("-")}`;
    }
    return `${index + 1}. ${fileName}`;
  };

  // Execute test in sandbox container via /api/run-test
  const runInSandbox = async () => {
    if (!current) return;
    const fileName = current.file_name;
    const cleanContent = formatScriptContent(current.content);

    setRunStates((prev) => ({
      ...prev,
      [fileName]: { status: "running" },
    }));

    const startTime = Date.now();
    try {
      const res = await fetch("/api/run-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script_content: cleanContent,
          file_name: fileName,
        }),
      });

      const data = await res.json();
      const elapsed =
        typeof data.duration === "number"
          ? data.duration
          : Number(((Date.now() - startTime) / 1000).toFixed(2));

      if (!res.ok || data.error) {
        const errorMsg = data.error || "Sandbox test execution failed";
        setRunStates((prev) => ({
          ...prev,
          [fileName]: {
            status: "failed",
            duration: elapsed,
            error: errorMsg,
          },
        }));
        toast.error(errorMsg);
        return;
      }

      const passed = (data.passed || 0) > 0 && (data.failed || 0) === 0;
      if (passed) {
        setRunStates((prev) => ({
          ...prev,
          [fileName]: {
            status: "passed",
            duration: elapsed,
            passedCount: data.passed,
            failedCount: data.failed,
          },
        }));
        toast.success(`Passed in ${elapsed}s`);
      } else {
        const errorMsg = data.error || `${data.failed || 1} test(s) failed`;
        setRunStates((prev) => ({
          ...prev,
          [fileName]: {
            status: "failed",
            duration: elapsed,
            error: errorMsg,
            passedCount: data.passed,
            failedCount: data.failed,
          },
        }));
        toast.error(errorMsg);
      }
    } catch (err: any) {
      const elapsed = Number(((Date.now() - startTime) / 1000).toFixed(2));
      const errorMsg = err.message || "Failed to execute test in sandbox";
      setRunStates((prev) => ({
        ...prev,
        [fileName]: {
          status: "failed",
          duration: elapsed,
          error: errorMsg,
        },
      }));
      toast.error(errorMsg);
    }
  };

  // Download standard playwright.config.ts configuration
  const handleDownloadPlaywrightConfig = () => {
    const cleanContent = formatScriptContent(current?.content || "");
    const urlMatch = cleanContent.match(/page\.goto\(['"]([^'"]+)['"]\)/);
    const targetUrl = baseUrl || (urlMatch ? urlMatch[1] : undefined);
    const configContent = generatePlaywrightConfig(targetUrl);
    dlBlob("playwright.config.ts", "text/typescript", configContent);
    toast.success("Downloaded playwright.config.ts");
  };

  if (scripts.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-500 text-sm">No scripts generated.</p>
      </div>
    );
  }

  const isRunning = currentRunState.status === "running";

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        {/* Script Tabs */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 scrollbar-thin">
          {scripts.map((script, i) => {
            const tabState = runStates[script.file_name]?.status;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActiveScript(i)}
                title={script.file_name}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-all ${
                  i === activeScript
                    ? "border-indigo-600 text-indigo-700 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <span>{getShortTabName(script.file_name, i)}</span>
                {tabState === "running" && <Loader2 className="w-3 h-3 animate-spin text-indigo-500 shrink-0" />}
                {tabState === "passed" && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                {tabState === "failed" && <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Script Info Bar & Controls */}
        <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-slate-500 select-all font-mono">
              <Folder className="w-3.5 h-3.5 text-indigo-500" />
              {current?.script_location || current?.file_name}
            </span>

            {/* Live Status Badge */}
            {currentRunState.status === "running" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                <span>Running ({liveElapsed}s)</span>
              </span>
            )}
            {currentRunState.status === "passed" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Passed ({currentRunState.duration}s)</span>
              </span>
            )}
            {currentRunState.status === "failed" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                <XCircle className="w-3 h-3 text-red-600" />
                <span>Failed ({currentRunState.duration}s)</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Run in Sandbox Button */}
            <button
              type="button"
              onClick={runInSandbox}
              disabled={isRunning}
              className="btn-ghost text-xs flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 font-medium transition disabled:opacity-50"
              title="Execute script in sandbox container via /api/run-test"
            >
              {isRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-indigo-600" />
              )}
              <span>{isRunning ? "Running..." : "Run in Sandbox"}</span>
            </button>

            {/* Download playwright.config.ts button */}
            <button
              type="button"
              onClick={handleDownloadPlaywrightConfig}
              className="btn-ghost text-xs flex items-center gap-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg px-2.5 py-1.5 transition"
              title="Download standard playwright.config.ts (chromium, firefox, webkit)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download playwright.config.ts</span>
            </button>

            {/* Copy Script */}
            <button
              type="button"
              onClick={() => copyScript(current.content)}
              className="btn-ghost text-xs flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-slate-600 hover:text-slate-800"
              title="Copy script to clipboard"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>
          </div>
        </div>

        {/* Live Execution Feedback Banner */}
        {currentRunState.status === "passed" && (
          <div className="flex items-center justify-between px-4 py-2 bg-emerald-50/80 border-b border-emerald-100 text-xs">
            <div className="flex items-center gap-2 text-emerald-800 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Execution Passed in {currentRunState.duration}s</span>
            </div>
            <span className="text-[11px] text-emerald-600">All assertions verified in sandbox</span>
          </div>
        )}

        {currentRunState.status === "failed" && (
          <div className="px-4 py-2.5 bg-red-50/80 border-b border-red-100 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-red-800 font-medium">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Execution Failed ({currentRunState.duration}s)</span>
              </div>
              <span className="text-[11px] text-red-500 font-mono">Exit status: failure</span>
            </div>
            {currentRunState.error && (
              <pre className="font-mono text-[11px] text-red-700 bg-white/80 p-2 rounded border border-red-200 overflow-x-auto whitespace-pre-wrap">
                {currentRunState.error}
              </pre>
            )}
          </div>
        )}

        {/* Code Block */}
        <div className="max-h-[500px] overflow-auto">
          <SyntaxHighlighter
            language={getSyntaxLanguage(current.file_name)}
            style={oneDark}
            customStyle={{ margin: 0, borderRadius: 0, fontSize: "13px" }}
            showLineNumbers
          >
            {formattedContent}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  );
}
