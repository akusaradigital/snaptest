"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { getAiRequestPayload } from "@/lib/keys";
import { getEffectiveAiRules, rememberAiRule } from "@/lib/aiMemory";
import {
  Network, FileJson, FileText, Loader2, Copy,
  CheckCircle2, Download, Paperclip,
  ChevronDown, ChevronRight, Clock, PlusCircle,
  Pencil, Trash2, Check, X, FileSpreadsheet, PanelLeft, Search,
  Globe2
} from "lucide-react";
import toast from "react-hot-toast";
import SendToSheetsModal from "@/components/SendToSheetsModal";

interface ApiAgentPageProps {
  aiProvider: string;
  aiModel: string;
}

type InputType = "curl" | "openapi" | "postman" | "manual";

interface TestCase {
  id: string;
  name: string;
  category: string;
  description: string;
  request: { headers: Record<string, string>; body: any; params: Record<string, string> };
  expected_status: number;
  expected_response: string;
  priority: string;
}

interface ApiSuite {
  endpoint: string;
  method: string;
  base_url: string;
  test_cases: TestCase[];
  postman_collection: Record<string, any>;
}

interface ApiAgentResult {
  suites?: ApiSuite[];
  endpoint?: string;
  method?: string;
  base_url?: string;
  test_cases?: TestCase[];
  postman_collection?: Record<string, any>;
}

interface ApiSession {
  id: string;
  title: string;
  updatedAt: string;
  format: InputType;
  input: string;
  result: ApiAgentResult | null;
  loaded?: boolean;
}

const toSuites = (r: ApiAgentResult | null): ApiSuite[] => {
  if (!r) return [];
  if (Array.isArray(r.suites) && r.suites.length) return r.suites;
  if (!r.endpoint && !r.test_cases?.length) return [];
  return [{
    endpoint: r.endpoint || "",
    method: r.method || "",
    base_url: r.base_url || "",
    test_cases: r.test_cases || [],
    postman_collection: r.postman_collection || {},
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

const AGENT_TYPE = "api_agent";
const API_SESSIONS_STORAGE = "snaptest_api_agent_sessions_v1";
const ACTIVE_API_SESSION_KEY = "snaptest_api_agent_active_session_id";

export default function ApiAgentPage({ aiProvider, aiModel }: ApiAgentPageProps) {
  const [inputText, setInputText] = useState("");
  const [inputType, setInputType] = useState<InputType>("curl");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ApiAgentResult | null>(null);
  const [activeOutputTab, setActiveOutputTab] = useState<"cases" | "collection">("cases");
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [showHistorySidebar, setShowHistorySidebar] = useState(true);
  const [showConfigPanel, setShowConfigPanel] = useState(true);
  const [sheetsModalOpen, setSheetsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Session state
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);

  // Close history dropdown on click outside
  useEffect(() => {
    if (!historyOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [historyOpen]);

  // Synchronize activeSessionId with localStorage and URL hash
  useEffect(() => {
    try {
      if (activeSessionId) {
        localStorage.setItem(ACTIVE_API_SESSION_KEY, activeSessionId);
      } else {
        localStorage.removeItem(ACTIVE_API_SESSION_KEY);
      }
    } catch { /* ignore */ }
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", activeSessionId ? "#" + activeSessionId : window.location.pathname);
    }
  }, [activeSessionId]);

  const saveToLocalFallback = (updated: ApiSession[]) => {
    try {
      localStorage.setItem(API_SESSIONS_STORAGE, JSON.stringify(updated));
      sessionStorage.removeItem("snaptest_dashboard_cache");
    } catch { /* ignore */ }
  };

  // Load sessions on mount
  const loadSessions = async () => {
    let localFallbackItems: ApiSession[] = [];
    try {
      const stored = localStorage.getItem(API_SESSIONS_STORAGE);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) localFallbackItems = parsed;
      }
    } catch { /* ignore */ }

    const hashId = typeof window !== 'undefined' ? window.location.hash.replace("#", "") : "";
    let storedId: string | null = null;
    try {
      storedId = localStorage.getItem(ACTIVE_API_SESSION_KEY);
    } catch { /* ignore */ }

    let items: ApiSession[] = [];
    let loadedFromServer = false;

    try {
      const res = await fetch(`/api/sessions?agent_type=${AGENT_TYPE}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          items = data.items.map((it: any) => ({
            id: it.id,
            title: it.title || "Untitled Spec",
            updatedAt: it.updated_at,
            format: "curl" as InputType,
            input: "",
            result: null,
          }));
          loadedFromServer = true;
        }
      }
    } catch { /* fallback to local */ }

    if (!loadedFromServer) {
      items = localFallbackItems;
    }

    setSessions(items);

    const targetId = (hashId && items.some(s => s.id === hashId))
      ? hashId
      : (storedId && items.some(s => s.id === storedId))
      ? storedId
      : items[0]?.id || null;

    if (targetId) {
      let hydratedFormat: InputType = "curl";
      let hydratedInput = "";
      let hydratedResult: ApiAgentResult | null = null;
      let fetchedDetail = false;

      if (loadedFromServer) {
        try {
          const res = await fetch(`/api/sessions/${targetId}`);
          if (res.ok) {
            const detail = await res.json();
            hydratedFormat = (detail.data?.format as InputType) || "curl";
            hydratedInput = detail.data?.input || "";
            hydratedResult = detail.data?.result || null;
            fetchedDetail = true;
          }
        } catch { /* fallback to local */ }
      }

      if (!fetchedDetail) {
        const localMatch = localFallbackItems.find(s => s.id === targetId);
        if (localMatch) {
          hydratedFormat = localMatch.format || "curl";
          hydratedInput = localMatch.input || "";
          hydratedResult = localMatch.result || null;
          fetchedDetail = true;
        }
      }

      setActiveSessionId(targetId);
      setInputType(hydratedFormat);
      setInputText(hydratedInput);
      setResult(hydratedResult);
      setSessions(prev =>
        prev.map(s =>
          s.id === targetId
            ? { ...s, format: hydratedFormat, input: hydratedInput, result: hydratedResult, loaded: true }
            : s
        )
      );
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const persistSession = async (item: ApiSession) => {
    setSessions(prev => {
      const rest = prev.filter(s => s.id !== item.id);
      const updated = [item, ...rest];
      saveToLocalFallback(updated);
      return updated;
    });

    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          agent_type: AGENT_TYPE,
          title: item.title,
          data_json: {
            format: item.format,
            input: item.input,
            result: item.result,
          },
        }),
      });
    } catch { /* offline fallback already saved */ }
  };

  const selectSession = async (s: ApiSession) => {
    setActiveSessionId(s.id);
    setHistoryOpen(false);
    if (s.loaded) {
      setInputType(s.format || 'curl');
      setInputText(s.input || '');
      setResult(s.result || null);
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${s.id}`);
      if (!res.ok) throw new Error();
      const detail = await res.json();
      const hydratedFormat = (detail.data?.format as InputType) || 'curl';
      const hydratedInput = detail.data?.input || '';
      const hydratedResult = detail.data?.result || null;
      const hydrated: ApiSession = {
        ...s,
        format: hydratedFormat,
        input: hydratedInput,
        result: hydratedResult,
        loaded: true,
      };
      setSessions(prev => prev.map(x => x.id === s.id ? hydrated : x));
      setInputType(hydratedFormat);
      setInputText(hydratedInput);
      setResult(hydratedResult);
    } catch {
      try {
        const stored = localStorage.getItem(API_SESSIONS_STORAGE);
        if (stored) {
          const locals: ApiSession[] = JSON.parse(stored);
          const found = locals.find(x => x.id === s.id);
          if (found) {
            const hydrated: ApiSession = {
              ...s,
              format: found.format || 'curl',
              input: found.input || '',
              result: found.result || null,
              loaded: true,
            };
            setSessions(prev => prev.map(x => x.id === s.id ? hydrated : x));
            setInputType(hydrated.format);
            setInputText(hydrated.input);
            setResult(hydrated.result);
            return;
          }
        }
      } catch { /* ignore */ }
      toast.error('Failed to load session');
    }
  };

  const handleNewSession = () => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setActiveSessionId(id);
    setInputText("");
    setInputType("curl");
    setResult(null);
    setHistoryOpen(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "#" + id);
    }
  };

  const handleDeleteSession = async (id: string) => {
    const nextSessions = sessions.filter(s => s.id !== id);
    setSessions(nextSessions);
    saveToLocalFallback(nextSessions);

    if (activeSessionId === id) {
      const nextSession = nextSessions[0] || null;
      const nextId = nextSession ? nextSession.id : null;
      setActiveSessionId(nextId);
      if (nextSession) {
        if (nextSession.loaded) {
          setInputType(nextSession.format || 'curl');
          setInputText(nextSession.input || '');
          setResult(nextSession.result || null);
        } else {
          selectSession(nextSession);
        }
      } else {
        setInputText("");
        setInputType("curl");
        setResult(null);
      }
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", nextId ? "#" + nextId : window.location.pathname);
      }
    }

    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    } catch { /* best-effort */ }
    setDeleteConfirmId(null);
    toast.success("Session deleted");
  };

  const startRename = (s: ApiSession) => {
    setRenamingId(s.id);
    setRenameValue(s.title);
  };

  const commitRename = async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    const trimmed = renameValue.trim();
    setRenamingId(null);

    const existing = sessions.find(s => s.id === id);
    if (!existing) return;

    let base = existing;
    if (!base.loaded && id !== activeSessionId) {
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (res.ok) {
          const detail = await res.json();
          base = {
            ...base,
            format: (detail.data?.format as InputType) || base.format || 'curl',
            input: detail.data?.input ?? base.input,
            result: detail.data?.result ?? base.result,
            loaded: true,
          };
        }
      } catch { /* best-effort */ }
    } else if (id === activeSessionId) {
      base = {
        ...base,
        format: inputType,
        input: inputText,
        result: result,
        loaded: true,
      };
    }

    await persistSession({ ...base, title: trimmed, updatedAt: new Date().toISOString() });
    toast.success("Session renamed");
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);

  const filteredSessions = sessions.filter(s =>
    !sessionSearch || s.title.toLowerCase().includes(sessionSearch.toLowerCase())
  );

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
    const trimmed = inputText.trim();
    if (!trimmed) return;

    if (/^\s*(ingat|remember|catat|mulai sekarang|jangan lupa)\b/i.test(trimmed)) {
      const isGlobal = /semua fitur|global|setiap fitur|all features/i.test(trimmed);
      const cleanRule = trimmed.replace(/^\s*(ingat|remember|catat|mulai sekarang|jangan lupa)\s*(ya\s*)?(:|\b)/i, "").trim() || trimmed;
      rememberAiRule(cleanRule, isGlobal ? "global" : "api");
      toast.success(`🧠 Aturan disimpan ke memori API Agent: "${cleanRule.slice(0, 50)}..."`, { duration: 5000 });
      setInputText("");
      return;
    }

    if (!aiProvider || !aiModel) { toast.error("Please select an AI provider and model first"); return; }

    setIsLoading(true);
    try {
      const res = await axios.post("/api/api-agent/generate", {
        input: inputText,
        input_type: inputType,
        custom_rules: getEffectiveAiRules("api"),
        ...getAiRequestPayload(aiProvider, aiModel),
      });
      setResult(res.data.result);
      setCollapsed(new Set());
      toast.success("API Test Suite generated!");

      const existing = sessions.find(s => s.id === activeSessionId);
      const suitesList = toSuites(res.data.result);
      const generatedTitle = suitesList[0]?.endpoint
        ? `${suitesList[0].method || inputType.toUpperCase()} ${suitesList[0].endpoint}`
        : trimmed.slice(0, 50);
      const title = existing?.title || generatedTitle || "Untitled API Spec";
      const id = activeSessionId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
      setActiveSessionId(id);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "#" + id);
      }
      await persistSession({
        id,
        title,
        updatedAt: new Date().toISOString(),
        format: inputType,
        input: trimmed,
        result: res.data.result,
        loaded: true,
      });
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.detail || error.message || "Failed to generate tests");
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
    <div className="flex h-[calc(100vh-6rem)] w-full overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm font-sans">
      {/* ── Sessions / History Sidebar (Collapsible) ── */}
      <div className={`transition-all duration-300 ease-in-out border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col shrink-0 ${
        showHistorySidebar ? "w-64" : "w-0 overflow-hidden border-r-0"
      }`}>
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            API Sessions ({sessions.length})
          </span>
          <button
            type="button"
            onClick={handleNewSession}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="New API Spec"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        {sessions.length > 0 && (
          <div className="p-2 border-b border-slate-200/60 dark:border-slate-800/60 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={sessionSearch}
                onChange={e => setSessionSearch(e.target.value)}
                placeholder="Search sessions..."
                className="w-full pl-8 pr-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        {/* Sessions list */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1 scrollbar-thin">
          {filteredSessions.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No saved history yet.</p>
          ) : (
            filteredSessions.map(s => (
              <div
                key={s.id}
                onClick={() => renamingId !== s.id && selectSession(s)}
                className={`group flex items-center gap-1.5 px-2.5 py-2 rounded-xl cursor-pointer text-xs transition ${
                  s.id === activeSessionId
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-200 font-semibold border border-indigo-200/60 dark:border-indigo-800/60"
                    : "hover:bg-slate-100/70 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                }`}
              >
                {renamingId === s.id ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(s.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-indigo-500 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                      autoFocus
                    />
                    <button onClick={() => commitRename(s.id)} className="p-0.5 text-emerald-600 hover:text-emerald-700"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setRenamingId(null)} className="p-0.5 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{s.title}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(s.updatedAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0" onClick={e => e.stopPropagation()}>
                      {deleteConfirmId === s.id ? (
                        <>
                          <button onClick={() => handleDeleteSession(s.id)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded"><Check className="w-3 h-3" /></button>
                          <button onClick={() => setDeleteConfirmId(null)} className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"><X className="w-3 h-3" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startRename(s)} className="p-1 hover:text-indigo-600 text-slate-400 rounded transition" title="Rename"><Pencil className="w-3 h-3" /></button>
                          <button onClick={() => setDeleteConfirmId(s.id)} className="p-1 hover:text-red-500 text-slate-400 rounded transition" title="Delete"><Trash2 className="w-3 h-3" /></button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Main API Workspace ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top bar with Toggle History & Actions */}
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setShowHistorySidebar(!showHistorySidebar)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition shrink-0"
              title={showHistorySidebar ? "Hide History" : "Show History"}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
              <Network className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-sm">
              {activeSession ? activeSession.title : "New API Test"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {suites.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setSheetsModalOpen(true)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition font-medium"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Spreadsheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadCsv()}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition font-medium border border-slate-200 dark:border-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadPostman()}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Postman</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleNewSession}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition font-medium border border-slate-200 dark:border-slate-700"
            >
              <PlusCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>New Spec</span>
            </button>
          </div>
        </div>

        {/* ── Scrollable Workspace: Centered Empty State when New, or Test Suites when Result ── */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {isLoading && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>AI Agent is analyzing the API &amp; building your test suite...</span>
              </div>
            </div>
          )}

          {!result && !isLoading && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="max-w-md flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center mb-3 text-indigo-600 dark:text-indigo-400">
                  <Globe2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  API Test Agent Workspace
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                  Paste a cURL command, OpenAPI / Swagger spec, Postman collection, or describe an endpoint below to synthesize comprehensive test cases and executable Postman collections.
                </p>
                <button
                  type="button"
                  onClick={loadExample}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 transition shadow-xs"
                >
                  Example: Login Endpoint cURL
                </button>
              </div>
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
                    <button
                      type="button"
                      onClick={() => setSheetsModalOpen(true)}
                      className="btn-secondary text-xs px-2.5 py-1.5 flex gap-1 items-center text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Spreadsheet</span>
                    </button>
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

        {/* ── Bottom Docked Input Composer ── */}
        <div className="shrink-0 px-3 pb-3 pt-2">
          <div className="bg-white dark:bg-slate-800/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-700 p-2.5 shadow-sm">
            {/* Format selector chips */}
            <div className="flex items-center gap-1.5 px-1 pb-2 mb-1.5 border-b border-slate-100 dark:border-slate-700/60 overflow-x-auto">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-0.5">Format:</span>
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setInputType(f.value)}
                  className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full transition-colors shrink-0 ${
                    inputType === f.value
                      ? "bg-indigo-600 text-white font-semibold shadow-xs"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleGenerate} className="flex flex-col gap-2">
              <textarea
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    handleGenerate(e);
                  }
                }}
                placeholder="Paste a cURL command, OpenAPI spec, Postman collection, or describe an endpoint..."
                disabled={isLoading}
                className="w-full text-xs leading-relaxed px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none max-h-36"
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5"
                    title="Upload .json / .yaml / .yml file"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>Attach spec</span>
                  </button>
                  <button
                    type="button"
                    onClick={loadExample}
                    disabled={isLoading}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Load example
                  </button>
                  <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml,application/json,application/x-yaml,application/yaml" className="hidden" onChange={handleFile} />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !inputText.trim()}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition flex items-center gap-1.5 text-xs font-semibold shadow-xs"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Network className="w-3.5 h-3.5" />}
                  <span>{isLoading ? "Generating..." : "Generate Suite"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {sheetsModalOpen && suites.length > 0 && (
        <SendToSheetsModal
          isOpen={sheetsModalOpen}
          onClose={() => setSheetsModalOpen(false)}
          title="Export API Test Suite to Google Sheet"
          defaultSheetName="API Tests"
          headers={
            suites.length > 1
              ? ["Endpoint", "ID", "Name", "Category", "Description", "Expected Status", "Priority"]
              : ["ID", "Name", "Category", "Description", "Expected Status", "Priority"]
          }
          rows={suites.flatMap(s =>
            (s.test_cases || []).map(tc => [
              ...(suites.length > 1 ? [s.endpoint] : []),
              tc.id,
              tc.name,
              tc.category,
              tc.description,
              tc.expected_status,
              tc.priority,
            ])
          )}
        />
      )}
    </div>
  );
}