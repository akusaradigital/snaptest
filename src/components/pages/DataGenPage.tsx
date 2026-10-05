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
  Code
} from 'lucide-react';
import { getAiRequestPayload } from '@/lib/keys';
import { getEffectiveAiRules, rememberAiRule } from '@/lib/aiMemory';
import toast from 'react-hot-toast';

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
      if (!res.ok) throw new Error(resData.detail || 'Failed to generate data');

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
    <div className="flex h-[calc(100vh-140px)] gap-4 max-w-6xl mx-auto w-full">
      {/* ── LEFT: Configuration panel ── */}
      <div className="w-[360px] shrink-0 h-full flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden relative">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
              <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">Test Data Generator</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0" ref={historyRef}>
            <button
              type="button"
              onClick={() => setHistoryOpen(o => !o)}
              className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 border transition ${
                historyOpen
                  ? "bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
              title="View history"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>History</span>
              {sessions.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold">
                  {sessions.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleNewSession}
              className="p-1 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
              title="New Data Set"
            >
              <PlusCircle className="w-3.5 h-3.5" />
            </button>

            {/* History Dropdown Popover */}
            {historyOpen && (
              <div className="absolute right-4 top-12 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-3 z-30 flex flex-col max-h-[460px]">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Saved Generations ({sessions.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleNewSession}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>New Data Set</span>
                  </button>
                </div>

                {sessions.length > 0 && (
                  <div className="relative mb-2">
                    <input
                      type="text"
                      value={sessionSearch}
                      onChange={e => setSessionSearch(e.target.value)}
                      placeholder="Search datasets..."
                      className="w-full text-xs pl-7 pr-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 placeholder-slate-400"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-[100px]">
                  {filteredSessions.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      {sessions.length === 0 ? "No saved generations yet" : "No matching datasets"}
                    </div>
                  ) : (
                    filteredSessions.map(s => {
                      const isActive = s.id === activeSessionId;
                      return (
                        <div
                          key={s.id}
                          className={`group relative flex items-center justify-between p-2 rounded-lg text-xs transition cursor-pointer border ${
                            isActive
                              ? "bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent"
                          }`}
                          onClick={() => selectSession(s)}
                        >
                          {renamingId === s.id ? (
                            <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                              <input
                                type="text"
                                autoFocus
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') commitRename(s.id);
                                  if (e.key === 'Escape') setRenamingId(null);
                                }}
                                className="flex-1 text-xs px-2 py-1 rounded border border-indigo-400 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => commitRename(s.id)}
                                className="p-1 hover:text-emerald-600 text-slate-400"
                                title="Save"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenamingId(null)}
                                className="p-1 hover:text-red-500 text-slate-400"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-medium truncate ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-200"}`}>
                                    {s.title}
                                  </span>
                                  {s.data && s.data.length > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                                      {s.data.length}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  {new Date(s.updatedAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
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
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => startRename(s)}
                                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-indigo-600 text-slate-400 transition"
                                      title="Rename"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteConfirmId(s.id)}
                                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 text-slate-400 transition"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
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
            )}
          </div>
        </div>

        <form onSubmit={handleGenerate} className="flex-1 flex flex-col min-h-0 p-4">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Fields / Schema</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe fields or paste JSON schema (e.g. email, age, role)..."
            disabled={loading}
            className="flex-1 min-h-[120px] w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none p-2.5"
          />
          <button type="button" onClick={() => setPrompt(EXAMPLE_PROMPT)} disabled={loading} className="self-start mt-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            Load example
          </button>

          <button type="submit" disabled={loading || !prompt.trim()} className="mt-4 w-full py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2 text-sm font-semibold">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            Generate Test Data
          </button>
          <p className="text-center text-[10px] text-slate-400 mt-2">AI Agent can make mistakes. Check important info.</p>
        </form>
      </div>

      {/* ── RIGHT: Results panel ── */}
      <div className="flex-1 min-w-0 h-full flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>AI Agent is constructing mock &amp; boundary test data...</span>
            </div>
          )}

          {!data && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto my-auto">
              <Database className="w-8 h-8 text-indigo-300 dark:text-indigo-700 mb-4" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Start Data Generation</h3>
              <p className="text-xs text-slate-500 mb-4">Paste a JSON schema, API payload, or describe fields (e.g., email, age, password) to generate mock, boundary, and negative payloads.</p>
            </div>
          )}

          {data && (
            <div className="h-full flex flex-col animate-[fadeIn_0.3s_ease-out]">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-3 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                    {activeSession?.title || "Generated Mock Data"}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">· {data.length} records</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Table vs JSON toggle */}
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

                  <button onClick={copyToClipboard} className="btn-secondary text-xs px-2.5 py-1.5 flex gap-1 items-center">
                    <Copy className="w-3.5 h-3.5" /> {copied ? "Copied!" : "Copy JSON"}
                  </button>
                  <button onClick={downloadCsv} className="btn-primary text-xs px-2.5 py-1.5 flex gap-1 items-center">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              </div>

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
      </div>
    </div>
  );
}