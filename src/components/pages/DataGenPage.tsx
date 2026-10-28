"use client";

import { useState, useEffect, useRef } from 'react';
import {
  Database,
  Copy,
  Download,
  Loader2,
  Clock,
  PlusCircle,
  Pencil,
  Trash2,
  Check,
  X,
  Search,
  Table,
  Code,
  FileSpreadsheet,
  PanelLeft
} from 'lucide-react';
import { getAiRequestPayload } from '@/lib/keys';
import { getEffectiveAiRules, rememberAiRule } from '@/lib/aiMemory';
import toast from 'react-hot-toast';
import SendToSheetsModal from '@/components/SendToSheetsModal';

interface DataGenPageProps {
  aiProvider: string;
  aiModel: string;
}

interface DataGenSession {
  id: string;
  title: string;
  updatedAt: string;
  prompt: string;
  data: any[] | null;
  loaded?: boolean;
}

const AGENT_TYPE = "datagen";
const DATAGEN_SESSIONS_STORAGE = "snaptest_datagen_sessions_v1";
const ACTIVE_DATAGEN_SESSION_KEY = "snaptest_datagen_active_session_id";
const EXAMPLE_PROMPT = "Generate user payload with valid email, age between 18-60, and strong password";

export default function DataGenPage({ aiProvider, aiModel }: DataGenPageProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "json">("table");
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [sheetsModalOpen, setSheetsModalOpen] = useState(false);

  // Session state
  const [sessions, setSessions] = useState<DataGenSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const historyRef = useRef<HTMLDivElement>(null);

  // Close history dropdown when clicking outside
  useEffect(() => {
    if (!historyOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
        setDeleteConfirmId(null);
        setRenamingId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [historyOpen]);

  // Initial mount: load sessions from cache and server
  useEffect(() => {
    let isMounted = true;

    const initSessions = async () => {
      let localSessions: DataGenSession[] = [];
      try {
        const stored = localStorage.getItem(DATAGEN_SESSIONS_STORAGE);
        if (stored) {
          localSessions = JSON.parse(stored);
          if (Array.isArray(localSessions) && localSessions.length > 0) {
            setSessions(localSessions);
            const hashId = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
            const savedActiveId = localStorage.getItem(ACTIVE_DATAGEN_SESSION_KEY);
            const initialTargetId = hashId && localSessions.some(s => s.id === hashId)
              ? hashId
              : (savedActiveId && localSessions.some(s => s.id === savedActiveId)
                ? savedActiveId
                : localSessions[0]?.id);

            if (initialTargetId) {
              setActiveSessionId(initialTargetId);
              const found = localSessions.find(s => s.id === initialTargetId);
              if (found) {
                if (found.prompt !== undefined) setPrompt(found.prompt);
                if (found.data !== undefined) setData(found.data);
              }
            }
          }
        }
      } catch { /* ignore */ }

      try {
        const res = await fetch(`/api/sessions?agent_type=${AGENT_TYPE}`);
        if (res.ok) {
          const resData = await res.json();
          if (Array.isArray(resData.items)) {
            const localMap = new Map<string, DataGenSession>();
            localSessions.forEach(s => { if (s?.id) localMap.set(s.id, s); });

            const serverSessions: DataGenSession[] = resData.items.map((it: any) => {
              const local = localMap.get(it.id);
              return {
                id: it.id,
                title: it.title || local?.title || 'Untitled Data Set',
                updatedAt: it.updated_at,
                prompt: local?.prompt ?? '',
                data: local?.data ?? null,
                loaded: !!(local?.data || local?.loaded),
              };
            });

            const serverIds = new Set(resData.items.map((i: any) => i.id));
            const localOnly = localSessions.filter(s => !serverIds.has(s.id));
            const merged = [...serverSessions, ...localOnly];

            if (isMounted) {
              setSessions(merged);
              try {
                localStorage.setItem(DATAGEN_SESSIONS_STORAGE, JSON.stringify(merged));
              } catch {}
            }

            const hashId = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
            const savedActiveId = localStorage.getItem(ACTIVE_DATAGEN_SESSION_KEY);
            const targetId = hashId && merged.some(s => s.id === hashId)
              ? hashId
              : (savedActiveId && merged.some(s => s.id === savedActiveId)
                ? savedActiveId
                : merged[0]?.id);

            if (targetId && isMounted) {
              setActiveSessionId(targetId);
              try { localStorage.setItem(ACTIVE_DATAGEN_SESSION_KEY, targetId); } catch {}
              const existing = merged.find(s => s.id === targetId);
              if (existing && existing.data) {
                setPrompt(existing.prompt || '');
                setData(existing.data);
              } else {
                try {
                  const sRes = await fetch(`/api/sessions/${targetId}`);
                  if (sRes.ok) {
                    const sDetail = await sRes.json();
                    const p = sDetail.data?.prompt || '';
                    const d = sDetail.data?.data || null;
                    if (isMounted) {
                      setPrompt(p);
                      setData(d);
                      setSessions(prev => {
                        const updated = prev.map(x => x.id === targetId ? { ...x, prompt: p, data: d, loaded: true } : x);
                        try { localStorage.setItem(DATAGEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
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

    initSessions();

    return () => {
      isMounted = false;
    };
  }, []);

  const persistSession = async (item: DataGenSession) => {
    setSessions(prev => {
      const rest = prev.filter(s => s.id !== item.id);
      const updated = [item, ...rest];
      try {
        localStorage.setItem(DATAGEN_SESSIONS_STORAGE, JSON.stringify(updated));
        localStorage.setItem(ACTIVE_DATAGEN_SESSION_KEY, item.id);
        sessionStorage.removeItem("snaptest_dashboard_cache");
      } catch { /* ignore */ }
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
          data_json: { prompt: item.prompt, data: item.data },
        }),
      });
    } catch { /* offline: localStorage fallback already saved */ }
  };

  const handleNewSession = () => {
    setActiveSessionId(null);
    setPrompt('');
    setData(null);
    setHistoryOpen(false);
    setDeleteConfirmId(null);
    setRenamingId(null);
    try {
      localStorage.removeItem(ACTIVE_DATAGEN_SESSION_KEY);
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch {}
    toast.success('Started new data set');
  };

  const handleDeleteSession = (id: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      try {
        localStorage.setItem(DATAGEN_SESSIONS_STORAGE, JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (activeSessionId === id) {
      setActiveSessionId(null);
      setPrompt('');
      setData(null);
      try {
        localStorage.removeItem(ACTIVE_DATAGEN_SESSION_KEY);
        if (window.location.hash) {
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      } catch {}
    }

    fetch(`/api/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
    setDeleteConfirmId(null);
    toast.success('Session deleted');
  };

  const startRename = (s: DataGenSession) => {
    setRenamingId(s.id);
    setRenameValue(s.title);
  };

  const commitRename = async (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
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
            prompt: detail.data?.prompt || '',
            data: detail.data?.data || null,
            loaded: true,
          };
        }
      } catch {}
    } else if (id === activeSessionId) {
      base = { ...base, prompt, data };
    }

    await persistSession({ ...base, title: trimmed, updatedAt: new Date().toISOString() });
    toast.success('Session renamed');
  };

  const selectSession = async (s: DataGenSession) => {
    setActiveSessionId(s.id);
    setHistoryOpen(false);
    setDeleteConfirmId(null);
    setRenamingId(null);
    try {
      localStorage.setItem(ACTIVE_DATAGEN_SESSION_KEY, s.id);
      window.location.hash = s.id;
    } catch {}

    if (s.loaded && (s.data || s.prompt)) {
      setPrompt(s.prompt || '');
      setData(s.data || null);
      return;
    }

    try {
      const res = await fetch(`/api/sessions/${s.id}`);
      if (!res.ok) throw new Error();
      const detail = await res.json();
      const p = detail.data?.prompt || '';
      const d = detail.data?.data || null;
      const hydrated: DataGenSession = {
        ...s,
        prompt: p,
        data: d,
        loaded: true,
      };
      setSessions(prev => {
        const updated = prev.map(x => x.id === s.id ? hydrated : x);
        try { localStorage.setItem(DATAGEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
        return updated;
      });
      setPrompt(p);
      setData(d);
    } catch {
      toast.error('Failed to load session');
    }
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error('Please provide a schema or field description');
      return;
    }

    if (/^\s*(ingat|remember|catat|mulai sekarang|jangan lupa)\b/i.test(trimmed)) {
      const isGlobal = /semua fitur|global|setiap fitur|all features/i.test(trimmed);
      const cleanRule = trimmed.replace(/^\s*(ingat|remember|catat|mulai sekarang|jangan lupa)\s*(ya\s*)?(:|\b)/i, "").trim() || trimmed;
      rememberAiRule(cleanRule, isGlobal ? "global" : "data");
      toast.success(`🧠 Aturan disimpan ke memori Data Generator: "${cleanRule.slice(0, 50)}..."`, { duration: 5000 });
      setPrompt('');
      return;
    }

    if (!aiProvider || !aiModel) {
      toast.error('Please select an AI provider and model in settings first');
      return;
    }

    setLoading(true);
    try {
      const aiPayload = getAiRequestPayload(aiProvider, aiModel);
      const res = await fetch('/api/data/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          custom_rules: getEffectiveAiRules("data"),
          ...aiPayload
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.detail || resData.error || 'Failed to generate data');

      setData(resData.data);
      toast.success('Test Data generated successfully!');

      const existing = sessions.find(s => s.id === activeSessionId);
      const title = existing?.title || trimmed.slice(0, 50) || 'Test Data';
      const id = activeSessionId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
      setActiveSessionId(id);
      await persistSession({
        id,
        title,
        updatedAt: new Date().toISOString(),
        prompt: trimmed,
        data: resData.data,
        loaded: true,
      });
    } catch (err: any) {
      toast.error(err.message || 'Error generating test data');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    toast.success('Copied JSON to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCsv = () => {
    if (!data || !Array.isArray(data) || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(fieldName => {
          const val = row[fieldName];
          const stringified = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
          return `"${stringified.replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'test-data.csv');
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded CSV!');
  };

  const filteredSessions = sessions.filter(s =>
    !sessionSearch || s.title.toLowerCase().includes(sessionSearch.toLowerCase())
  );

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const dataHeaders = data && Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null
    ? Object.keys(data[0])
    : [];

  return (
    <div className="flex h-full w-full overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm font-sans">
      {/* ── Sessions / History Sidebar (Collapsible) ── */}
      <div className={`transition-all duration-300 ease-in-out border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col shrink-0 ${
        showLeftPanel ? "w-64" : "w-0 overflow-hidden border-r-0"
      }`}>
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Data Sets ({sessions.length})
          </span>
          <button
            type="button"
            onClick={handleNewSession}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="New Data Set"
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
                placeholder="Search datasets..."
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
            filteredSessions.map(s => {
              const isActive = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  onClick={() => renamingId !== s.id && selectSession(s)}
                  className={`group flex items-center gap-1.5 px-2.5 py-2 rounded-xl cursor-pointer text-xs transition ${
                    isActive
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
              );
            })
          )}
        </div>
      </div>

      {/* ── Main Data Generator Workspace ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top bar with Toggle History & Actions */}
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setShowLeftPanel(!showLeftPanel)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition shrink-0"
              title={showLeftPanel ? "Hide History" : "Show History"}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
              <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-sm">
              {activeSession ? activeSession.title : "New Data Set"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {data && (
              <>
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition ${
                      viewMode === "table"
                        ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                    title="Table View"
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>Table</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("json")}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition ${
                      viewMode === "json"
                        ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                    title="JSON View"
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition font-medium border border-slate-200 dark:border-slate-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={downloadCsv}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition font-medium border border-slate-200 dark:border-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSheetsModalOpen(true)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition font-medium"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Spreadsheet</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleNewSession}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition font-medium border border-slate-200 dark:border-slate-700"
            >
              <PlusCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>New Data Set</span>
            </button>
          </div>
        </div>

        {/* ── Scrollable Workspace: Centered Empty State when New, or Data Table/JSON when Result ── */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {loading && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>AI Agent is constructing mock &amp; boundary test data...</span>
              </div>
            </div>
          )}

          {!data && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="max-w-md flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center mb-3 text-indigo-600 dark:text-indigo-400">
                  <Database className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Test Data Generator Workspace
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                  Describe fields or paste a JSON schema (e.g. email, age, role, transactions) below to synthesize comprehensive mock, edge-case, and boundary test datasets.
                </p>
                <button
                  type="button"
                  onClick={() => setPrompt(EXAMPLE_PROMPT)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 transition shadow-xs"
                >
                  Example: User Profiles with Auth &amp; Roles
                </button>
              </div>
            </div>
          )}

          {data && (
            <div className="h-full flex flex-col animate-[fadeIn_0.3s_ease-out]">
              {viewMode === "table" && dataHeaders.length > 0 ? (
                <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 border-b border-slate-200 dark:border-slate-800 z-10">
                      <tr>
                        <th className="p-2.5 font-semibold text-slate-500 w-12 text-center">#</th>
                        {dataHeaders.map(h => (
                          <th key={h} className="p-2.5 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                          <td className="p-2.5 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          {dataHeaders.map(h => {
                            const val = row[h];
                            const displayVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
                            return (
                              <td key={h} className="p-2.5 text-slate-700 dark:text-slate-300 font-mono text-[11px] whitespace-nowrap">
                                {displayVal}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex-1 min-h-0 rounded-lg bg-slate-950 border border-slate-800 overflow-auto">
                  <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap p-4">{JSON.stringify(data, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom Docked Input Composer ── */}
        <div className="shrink-0 px-3 pb-3 pt-2">
          <div className="bg-white dark:bg-slate-800/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-700 p-2.5 shadow-sm">
            <form onSubmit={handleGenerate} className="flex flex-col gap-2">
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    handleGenerate(e);
                  }
                }}
                placeholder="Describe fields or paste JSON schema (e.g. email, age, role, address)..."
                disabled={loading}
                className="w-full text-xs leading-relaxed px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none max-h-36"
              />

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPrompt(EXAMPLE_PROMPT)}
                  disabled={loading}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                >
                  Load example
                </button>

                <button
                  type="submit"
                  disabled={loading || !prompt.trim()}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition flex items-center gap-1.5 text-xs font-semibold shadow-xs"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  <span>{loading ? "Generating..." : "Generate Test Data"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {sheetsModalOpen && data && dataHeaders.length > 0 && (
        <SendToSheetsModal
          isOpen={sheetsModalOpen}
          onClose={() => setSheetsModalOpen(false)}
          title={`Export "${activeSession?.title || 'Test Data'}" to Google Sheet`}
          defaultSheetName="Test Data"
          headers={dataHeaders}
          rows={data.map(row =>
            dataHeaders.map(h => {
              const val = row[h];
              return typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
            })
          )}
        />
      )}
    </div>
  );
}