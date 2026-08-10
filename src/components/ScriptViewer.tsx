"use client";

import { useState, useMemo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ScriptFile } from "@/types";
import { useIsLocal } from "@/lib/useIsLocal";
import toast from "react-hot-toast";
import axios from "axios";
import {
  Copy,
  Folder,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
} from "lucide-react";

const API_URL = "";

interface ScriptViewerProps {
  scripts: ScriptFile[];
}

interface TestStep {
  action: string;
  target: string;
  value?: string;
  status: "passed" | "failed";
  error?: string;
}

interface TestResult {
  passed: boolean;
  steps: TestStep[];
  error: string | null;
  screenshot: string | null;
}

export default function ScriptViewer({ scripts }: ScriptViewerProps) {
  const isLocal = useIsLocal();
  const [activeScript, setActiveScript] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showScreenshot, setShowScreenshot] = useState(false);

  const current = scripts[activeScript];
  const formattedContent = useMemo(
    () => formatScriptContent(current?.content || ""),
    [current?.content]
  );

  const copyScript = (content: string) => {
    const cleanContent = formatScriptContent(content);
    navigator.clipboard.writeText(cleanContent);
    toast.success("Script copied to clipboard");
  };

  // ponytail: Helper to clean script content from escape sequences
  const formatScriptContent = (content: string): string => {
    if (!content) return "";
    return content.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  };

  // ponytail: Helper to get syntax language based on file extension
  const getSyntaxLanguage = (fileName: string): string => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "py") return "python";
    if (ext === "java") return "java";
    if (ext === "cs") return "csharp";
    if (ext === "js" || ext === "ts") return "javascript";
    return "typescript";
  };

  // ponytail: Shorten tab display name by stripping case slug prefix
  const getShortTabName = (fileName: string, index: number): string => {
    const parts = fileName.split("-");
    if (parts.length > 1) {
      return `${index + 1}. ${parts.slice(1).join("-")}`;
    }
    return `${index + 1}. ${fileName}`;
  };

  const runTest = async () => {
    const current = scripts[activeScript];
    if (!current) return;

    const cleanContent = formatScriptContent(current.content);

    // Extract URL from the script content
    const urlMatch = cleanContent.match(/page\.goto\(['"]([^'"]+)['"]\)/);
    if (!urlMatch) {
      toast.error("Could not find page.goto() URL in script");
      return;
    }

    setIsRunning(true);
    setTestResult(null);

    try {
      const res = await axios.post<TestResult>(`${API_URL}/api/runner/execute`, {
        script_content: cleanContent,
        url: urlMatch[1],
      });
      setTestResult(res.data);
      if (res.data.passed) {
        toast.success("Test passed!");
      } else {
        toast.error("Test failed");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Test execution failed");
    } finally {
      setIsRunning(false);
    }
  };

  if (scripts.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-500 text-sm">No scripts generated.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        {/* Script Tabs */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 scrollbar-thin">
          {scripts.map((script, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setActiveScript(i);
                setTestResult(null);
              }}
              title={script.file_name}
              className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-all ${
                i === activeScript
                  ? "border-indigo-600 text-indigo-700 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {getShortTabName(script.file_name, i)}
            </button>
          ))}
        </div>

        {/* Script Info Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
          <span className="flex items-center gap-1.5 text-xs text-slate-500 select-all font-mono">
            <Folder className="w-3.5 h-3.5 text-indigo-500" />
            {current.script_location}
          </span>
          <div className="flex items-center gap-2">
            {isLocal && (
              <button
                type="button"
                onClick={runTest}
                disabled={isRunning}
                className="btn-ghost text-xs flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {isRunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {isRunning ? "Running..." : "Run Test"}
              </button>
            )}
            <button
              type="button"
              onClick={() => copyScript(current.content)}
              className="btn-ghost text-xs flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </button>
          </div>
        </div>

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

      {/* Test Results */}
      {testResult && (
        <div className={`card p-4 border ${testResult.passed ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {testResult.passed ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              <span className={`text-sm font-medium ${testResult.passed ? "text-emerald-800" : "text-red-800"}`}>
                {testResult.passed ? "Test Passed" : "Test Failed"}
              </span>
              <span className="text-xs text-slate-500">
                ({testResult.steps.filter((s) => s.status === "passed").length}/{testResult.steps.length} steps passed)
              </span>
            </div>
            {testResult.screenshot && (
              <button
                type="button"
                onClick={() => setShowScreenshot(!showScreenshot)}
                className="btn-ghost text-xs flex items-center gap-1.5"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {showScreenshot ? "Hide" : "Screenshot"}
              </button>
            )}
          </div>

          {/* Steps */}
          <div className="space-y-1.5">
            {testResult.steps.map((step, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded ${
                  step.status === "passed" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                }`}
              >
                {step.status === "passed" ? (
                  <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                ) : (
                  <XCircle className="w-3 h-3 flex-shrink-0" />
                )}
                <span className="font-medium">{step.action}</span>
                <code className="font-mono text-[11px] bg-white/50 px-1 rounded">{step.target}</code>
                {step.value && <span className="text-slate-500">= &quot;{step.value}&quot;</span>}
                {step.error && <span className="text-red-600 truncate ml-auto">{step.error}</span>}
              </div>
            ))}
          </div>

          {testResult.error && (
            <p className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">{testResult.error}</p>
          )}

          {/* Screenshot */}
          {showScreenshot && testResult.screenshot && (
            <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
              <img
                src={`data:image/png;base64,${testResult.screenshot}`}
                alt="Test screenshot"
                className="w-full"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
