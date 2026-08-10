"use client";

import { useState, useRef } from "react";
import axios from "axios";
import { getApiKey } from "@/lib/keys";
import {
  Network, FileJson, FileText, Loader2, Copy,
  CheckCircle2, Download, Send, Paperclip,
  ChevronDown, ChevronRight
} from "lucide-react";
import toast from "react-hot-toast";

interface ApiAgentPageProps { aiProvider: string; aiModel: string; }

type InputType = "curl" | "openapi" | "postman" | "manual";

interface TestCase {
  id: string; name: string; category: string; description: string;
  request: { headers: Record<string, string>; body: any; params: Record<string, string> };
  expected_status: number; expected_response: string; priority: string;
}

interface ApiSuite {
  endpoint: string; method: string; base_url: string;
  test_cases: TestCase[]; postman_collection: Record<string, any>;
}

interface ApiAgentResult {
  suites?: ApiSuite[];
  endpoint?: string; method?: string; base_url?: string;
  test_cases?: TestCase[]; postman_collection?: Record<string, any>;
}

const toSuites = (r: ApiAgentResult | null): ApiSuite[] => {
  if (!r) return [];
  if (Array.isArray(r.suites) && r.suites.length) return r.suites;
  return [{
    endpoint: r.endpoint || "", method: r.method || "", base_url: r.base_url || "",
    test_cases: r.test_cases || [], postman_collection: r.postman_collection || {},
  }];
};

const FORMATS: { value: InputType; label: string }[] = [
  { value: "curl", label: "cURL" },
  { value: "openapi", label: "OpenAPI" },
  { value: "postman", label: "Postman" },
  { value: "manual", label: "Manual" },
];

const EXAMPLE_CURL = 'curl -X POST https://api.example.com/login \\\n  -H "Content-Type: application/json" \\\n  -d \'{"email":"user@example.com","password":"pass123"}\'';

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-700",
  POST: "bg-blue-100 text-blue-700",
  PUT: "bg-amber-100 text-amber-700",
  PATCH: "bg-purple-100 text-purple-700",
  DELETE: "bg-rose-100 text-rose-700",
};

const CATEGORY_COLORS: Record<string, string> = {
  "Happy Path": "bg-emerald-100 text-emerald-700",
  "Auth": "bg-purple-100 text-purple-700",
  "Validation": "bg-amber-100 text-amber-700",
  "Error Handling": "bg-red-100 text-red-700",
  "Edge Case": "bg-blue-100 text-blue-700",
  "Security": "bg-rose-100 text-rose-700",
};

export default function ApiAgentPage({ aiProvider, aiModel }: ApiAgentPageProps) {
  const [inputText, setInputText] = useState("");
  const [inputType, setInputType] = useState<InputType>("curl");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ApiAgentResult | null>(null);
  const [activeOutputTab, setActiveOutputTab] = useState<"cases" | "collection">("cases");
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suites = toSuites(result);

  const loadExample = () => {
    setInputType("curl");
    setInputText(EXAMPLE_CURL);
  };

  const toggleSuite = (i: number) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      if (!text.trim()) { toast.error("File is empty"); return; }
      setInputText(text);
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".yaml") || lower.endsWith(".yml")) setInputType("openapi");
      else if (lower.endsWith(".json")) {
        try {
          const parsed = JSON.parse(text);
          setInputType(parsed && typeof parsed === "object" && (parsed.collection || parsed.item) ? "postman" : "openapi");
        } catch { setInputType("openapi"); }
      }
      toast.success(`Loaded ${file.name}`);
    };
    reader.onerror = () => toast.error("Failed to read file");
    reader.readAsText(file);
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    if (!aiProvider || !aiModel) { toast.error("Please select an AI provider and model first"); return; }

    setIsLoading(true);
    try {
      let pubCfg: Record<string, string> = {};
      try {
        const saved = JSON.parse(localStorage.getItem("9router_public") || "{}");
        if (saved && typeof saved === "object" && !Array.isArray(saved)) pubCfg = saved;
      } catch {}
      const res = await axios.post("/api/api-agent/generate", {
        input: inputText, input_type: inputType,
        ai_provider: aiProvider, ai_model: aiModel, api_key: getApiKey(aiProvider),
        nine_router_public_url: pubCfg.url || "", nine_router_public_key: pubCfg.key || "",
      });
      setResult(res.data.result);
      setCollapsed(new Set());
      toast.success("API Test Suite generated!");
      setInputText("");
    } catch (error: any) {
      toast.error(error.response?.data?.detail || error.message || "Failed to generate tests");
    } finally {
      setIsLoading(false);
    }
  };

  const mergedCollection = (list: ApiSuite[]): Record<string, any> => {
    if (list.length === 1) return list[0].postman_collection;
    const first = list[0]?.postman_collection || {};
    return {
      ...first,
      info: { ...(first.info || {}), name: `${first.info?.name || "api"}-combined` },
      item: list.flatMap(s => (Array.isArray(s.postman_collection?.item) ? s.postman_collection.item : [])),
    };
  };

  const copyPostman = async (suite?: ApiSuite) => {
    const col = suite ? suite.postman_collection : mergedCollection(suites);
    if (!col || Object.keys(col).length === 0) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(col, null, 2));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const downloadPostman = (suite?: ApiSuite) => {
    const list = suite ? [suite] : suites;
    const col = mergedCollection(list);
    if (!col || Object.keys(col).length === 0) return;
    const blob = new Blob([JSON.stringify(col, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = list.length === 1 ? `${list[0].endpoint || "api"}-postman-collection.json` : "api-combined-postman-collection.json"; a.click();
    URL.revokeObjectURL(url); toast.success("Postman collection downloaded!");
  };

  const downloadCsv = (suite?: ApiSuite) => {
    const list = suite ? [suite] : suites;
    const multi = list.length > 1;
    const headers = multi
      ? ["Endpoint", "ID", "Name", "Category", "Description", "Expected Status", "Priority"]
      : ["ID", "Name", "Category", "Description", "Expected Status", "Priority"];
    const rows = list.flatMap(s => (s.test_cases || []).map(tc => [
      ...(multi ? [s.endpoint] : []),
      tc.id, `"${tc.name.replace(/"/g, '""')}"`, tc.category, `"${tc.description.replace(/"/g, '""')}"`, tc.expected_status, tc.priority,
    ]));
    if (!rows.length) return;
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = list.length === 1 ? `${list[0].endpoint || "api"}-test-cases.csv` : "api-combined-test-cases.csv"; a.click();
    URL.revokeObjectURL(url); toast.success("CSV downloaded!");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
          <Network className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">API Test Workspace</span>
      </div>

      {/* Composer */}
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {FORMATS.map(f => (
            <button key={f.value} type="button" onClick={() => setInputType(f.value)} className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md transition ${inputType === f.value ? "bg-indigo-600 text-white" : "border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <form onSubmit={handleGenerate} className="flex flex-col gap-2">
          <textarea
            rows={5}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
            placeholder="Paste a cURL command, OpenAPI spec, Postman collection, or describe an endpoint..."
            disabled={isLoading}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none p-3"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5" title="Upload .json / .yaml / .yml file">
                <Paperclip className="w-3.5 h-3.5" /> Attach
              </button>
              <button type="button" onClick={loadExample} disabled={isLoading} className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                Example
              </button>
              <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml,application/json,application/x-yaml,application/yaml" className="hidden" onChange={handleFile} />
            </div>
            <button type="submit" disabled={isLoading || !inputText.trim()} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition flex items-center gap-1.5 text-xs font-medium">
              Generate <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
        <p className="text-center text-[10px] text-slate-400 mt-2">AI Agent can make mistakes. Check important info.</p>
      </div>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
            <span>Analyzing API & building test suite...</span>
          </div>
        )}

        {!result && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <Network className="w-8 h-8 text-indigo-300 dark:text-indigo-700 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">No Test Suite Generated</h3>
            <p className="text-sm text-slate-500 mb-6">
              Use the composer above to analyze endpoints, upload OpenAPI specs, or paste cURL commands to generate your API test suites.
            </p>
            <button onClick={loadExample} className="btn-primary flex items-center gap-2 px-4 py-2">Load Example cURL</button>
          </div>
        )}

        {result && (
          <div className="space-y-4 animate-[fadeIn_0.3s_ease-out]">
            {/* Toolbar: view toggle + combined exports */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-1 overflow-x-auto">
                <button onClick={() => setActiveOutputTab("cases")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeOutputTab === "cases" ? "bg-slate-100 dark:bg-slate-800 text-indigo-700" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
                  <FileText className="w-3.5 h-3.5" /> Test Cases
                </button>
                <button onClick={() => setActiveOutputTab("collection")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeOutputTab === "collection" ? "bg-slate-100 dark:bg-slate-800 text-emerald-700" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
                  <FileJson className="w-3.5 h-3.5" /> Postman Collection
                </button>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => downloadCsv()} className="btn-secondary text-xs px-2.5 py-1.5 flex gap-1 items-center"><Download className="w-3 h-3" /> CSV</button>
                <button onClick={() => downloadPostman()} className="btn-primary text-xs px-2.5 py-1.5 flex gap-1 items-center"><Download className="w-3 h-3" /> Postman</button>
              </div>
            </div>

            {suites.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">No test suites in the response.</p>
            ) : suites.map((s, i) => {
              const isCollapsed = collapsed.has(i);
              return (
                <div key={`${s.method}-${s.endpoint}-${i}`} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                  <div className="flex items-center gap-3 bg-slate-50/70 dark:bg-slate-900/60 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <button type="button" onClick={() => toggleSuite(i)} className="flex items-center gap-3 flex-1 text-left min-w-0" aria-expanded={!isCollapsed}>
                      {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                      <span className={`px-2 py-1 rounded text-xs font-bold shrink-0 ${METHOD_COLORS[s.method] || "bg-slate-100 text-slate-600"}`}>{s.method || "API"}</span>
                      <span className="font-mono text-sm text-slate-700 dark:text-slate-200 truncate">{s.endpoint}</span>
                      <span className="text-xs text-slate-400 shrink-0 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{(s.test_cases || []).length} cases</span>
                    </button>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => downloadCsv(s)} className="btn-secondary text-xs px-2.5 py-1.5 flex gap-1.5 items-center"><Download className="w-3.5 h-3.5" /> CSV</button>
                      <button onClick={() => downloadPostman(s)} className="btn-primary text-xs px-2.5 py-1.5 flex gap-1.5 items-center"><Download className="w-3.5 h-3.5" /> Postman</button>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="p-3">
                      {activeOutputTab === "cases" ? (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[720px] text-sm text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="p-3 font-semibold text-slate-600 dark:text-slate-300 w-24">ID</th>
                                <th className="p-3 font-semibold text-slate-600 dark:text-slate-300 w-32">Category</th>
                                <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">Test Case</th>
                                <th className="p-3 font-semibold text-slate-600 dark:text-slate-300 w-24">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {(s.test_cases || []).map(tc => (
                                <tr key={tc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                  <td className="p-3 font-mono text-xs text-slate-500">{tc.id}</td>
                                  <td className="p-3"><span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide ${CATEGORY_COLORS[tc.category] || "bg-slate-100 text-slate-700"}`}>{tc.category}</span></td>
                                  <td className="p-3"><div className="font-medium text-slate-800 dark:text-slate-200">{tc.name}</div><div className="text-xs text-slate-500 mt-1.5 leading-relaxed">{tc.description}</div></td>
                                  <td className="p-3"><span className="font-mono text-xs px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-medium">{tc.expected_status}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="relative bg-slate-950 rounded-lg overflow-hidden p-4 border border-slate-800">
                          <button onClick={() => copyPostman(s)} className="absolute top-3 right-3 px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors flex items-center gap-2 backdrop-blur-sm border border-slate-700">
                            {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-300" />}
                            <span className="text-xs font-medium">{copied ? "Copied!" : "Copy JSON"}</span>
                          </button>
                          <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap overflow-x-auto custom-scrollbar">
                            {JSON.stringify(s.postman_collection || {}, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}