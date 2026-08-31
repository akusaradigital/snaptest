"use client";

import { useState, useEffect, useRef } from 'react';
import { BookOpen, Download, Loader2, Send, Clock, PlusCircle, Pencil, Trash2, Check, X, Sparkles } from 'lucide-react';
import { getAiRequestPayload } from '@/lib/keys';
import toast from 'react-hot-toast';

interface PlannerPageProps {
  aiProvider: string;
  aiModel: string;
}

interface TestCase {
  id: string;
  category: string;
  scenario: string;
  steps: string[];
  expected: string;
  priority: string;
  effort_hours: number;
}

interface PlannerResult {
  detected_format: string;
  feature_name: string;
  test_matrix: TestCase[];
  total_effort_hours: number;
  coverage_summary: string;
}

interface SessionItem {
  id: string;
  title: string;
  updatedAt: string;
  input?: string;
  result?: PlannerResult;
  loaded?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Positive": "bg-emerald-100 text-emerald-700",
  "Negative": "bg-red-100 text-red-700",
  "Edge Case": "bg-blue-100 text-blue-700",
  "Security": "bg-rose-100 text-rose-700",
  "Boundary": "bg-amber-100 text-amber-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  "Critical": "bg-red-100 text-red-700",
  "High": "bg-orange-100 text-orange-700",
  "Medium": "bg-blue-100 text-blue-700",
  "Low": "bg-slate-100 text-slate-700",
};

const AGENT_TYPE = 'planner';
const LOCAL_FALLBACK_KEY = 'planner-sessions-fallback';

export default function PlannerPage({ aiProvider, aiModel }: PlannerPageProps) {
  const [input, setInput] = useState('');
  const [refine, setRefine] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlannerResult | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const saveToLocalFallback = (updated: SessionItem[]) => {
    try {
      localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(updated));
      sessionStorage.removeItem("snaptest_dashboard_cache");
    } catch { /* ignore */ }
  };

  // Load sessions from server (with fallback to localStorage if offline/unauthenticated)
  useEffect(() => {
    const load = async () => {
      try {
        const stored = localStorage.getItem(LOCAL_FALLBACK_KEY);
        if (stored) setSessions(JSON.parse(stored));
      } catch { /* ignore */ }

      try {
        const res = await fetch(`/api/sessions?agent_type=${AGENT_TYPE}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items)) {
            const items: SessionItem[] = data.items.map((it: any) => ({
              id: it.id,
              title: it.title || 'Untitled Plan',
              updatedAt: it.updated_at,
            }));
            setSessions(items);
            if (items[0]) fetch(`/api/sessions/${items[0].id}`).catch(() => {});
            return;
          }
        }
      } catch { /* fall through to local fallback */ }

      try {
        const stored = localStorage.getItem(LOCAL_FALLBACK_KEY);
        if (stored) setSessions(JSON.parse(stored));
      } catch { /* ignore */ }
    };
    load();
  }, []);

  const persistSession = async (item: SessionItem) => {
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
          data_json: { input: item.input || '', result: item.result || null },
        }),
      });
    } catch { /* offline: local fallback already saved above */ }
  };

  const deleteSession = (id: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      saveToLocalFallback(updated);
      return updated;
    });
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setResult(null);
      setInput('');
    }
    fetch(`/api/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
    setDeleteConfirmId(null);
    toast.success('Session deleted');
  };

  const startRename = (s: SessionItem) => {
    setRenamingId(s.id);
    setRenameValue(s.title);
  };

  const commitRename = async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    const trimmed = renameValue.trim();
    setRenamingId(null);

    const existing = sessions.find(s => s.id === id);
    if (!existing) return;

    // Renaming a session we haven't loaded the full result for yet — fetch it first
    // so the rename POST (which re-saves the whole record) doesn't wipe its data.
    let base = existing;
    if (!base.loaded && id !== activeSessionId) {
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (res.ok) {
          const detail = await res.json();
          base = { ...base, input: detail.data?.input, result: detail.data?.result, loaded: true };
        }
      } catch { /* best-effort */ }
    } else if (id === activeSessionId) {
      base = { ...base, input, result: result || undefined };
    }

    await persistSession({ ...base, title: trimmed, updatedAt: new Date().toISOString() });
    toast.success('Session renamed');
  };

  const selectSession = async (s: SessionItem) => {
    setActiveSessionId(s.id);
    setHistoryOpen(false);
    if (s.loaded) {
      setInput(s.input || '');
      setResult(s.result || null);
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${s.id}`);
      if (!res.ok) throw new Error();
      const detail = await res.json();
      const hydrated: SessionItem = { ...s, input: detail.data?.input || '', result: detail.data?.result || null, loaded: true };
      setSessions(prev => prev.map(x => x.id === s.id ? hydrated : x));
      setResult(hydrated.result || null);
      setInput('');
    } catch {
      toast.error('Failed to load session');
    }
  };

  const filteredSessions = sessions.filter(s =>
    !sessionSearch || s.title.toLowerCase().includes(sessionSearch.toLowerCase())
  );

  const runGenerate = async (text: string, clear: () => void) => {
    if (!text.trim()) {
      toast.error('Please paste some text to analyze');
      return;
    }
    if (!aiProvider || !aiModel) {
      toast.error('Please select an AI provider and model in settings first');
      return;
    }

    setLoading(true);
    try {
      const aiPayload = getAiRequestPayload(aiProvider, aiModel);
      const res = await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          ...aiPayload,
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to generate test plan');

      setResult(resData.result);
      toast.success('Test plan generated successfully!');

      // Keep the session's original title once set; only the very first generate names it.
      const existing = sessions.find(s => s.id === activeSessionId);
      const title = existing?.title || resData.result.feature_name || text.slice(0, 60);
      const id = activeSessionId || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      setActiveSessionId(id);
      await persistSession({ id, title, updatedAt: new Date().toISOString(), input: text, result: resData.result, loaded: true });

      clear();
    } catch (err: any) {
      toast.error(err.message || 'Error generating test plan');
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!result?.test_matrix?.length) return;
    const rows = result.test_matrix.map(tc => [
      tc.id,
      tc.category,
      tc.scenario,
      tc.expected,
      tc.priority,
      tc.effort_hours,
    ]);
    const header = 'ID,Category,Scenario,Expected Result,Priority,Effort Hours';
    const csvRows = [
      header,
      ...rows.map(row =>
        row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'test-matrix.csv');
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded CSV!');
  };

  const downloadXlsx = async () => {
    if (!result?.test_matrix?.length) return;
    const XLSX = await import('xlsx'); // ponytail: dynamic import to keep it out of page bundle
    const rows = result.test_matrix.map(tc => ({
      ID: tc.id,
      Category: tc.category,
      Scenario: tc.scenario,
      'Expected Result': tc.expected,
      Priority: tc.priority,
      'Effort Hours': tc.effort_hours,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Test Matrix');
    XLSX.writeFile(wb, 'test-matrix.xlsx');
    toast.success('Downloaded XLSX!');
  };

  return (
    <div className="flex h-[calc(100vh-140px)]">
      {/* ── LEFT SIDEBAR: narrow rail that expands into the full drawer on hover ── */}
      <div ref={historyRef} className="relative shrink-0 h-full z-20">
        <div
          onClick={() => setHistoryOpen((o) => !o)}
          className="w-12 h-full border-r border-slate-200 dark:border-slate-700 flex flex-col items-center py-4 gap-2 cursor-pointer"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setActiveSessionId(null); setResult(null); setInput(''); setRefine(''); }}
            className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition"
            title="New Test Plan"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
          <div className="w-6 h-px bg-slate-200 dark:bg-slate-700 my-1" />
          <div className="flex flex-col items-center gap-1 text-slate-400" title={`${sessions.length} saved sessions`}>
            <Clock className="w-4 h-4" />
            <span className="text-[10px] font-semibold">{sessions.length}</span>
          </div>
        </div>

        <div className={`absolute left-0 top-0 w-[280px] h-full border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl p-4 flex flex-col overflow-hidden transition-all duration-150 ${historyOpen ? "opacity-100 visible translate-x-0" : "opacity-0 invisible -translate-x-1 pointer-events-none"}`}>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Clock className="w-3.5 h-3.5" /> CHAT HISTORY ({sessions.length})
          </h3>
          <button type="button" onClick={() => { setActiveSessionId(null); setResult(null); setInput(''); setRefine(''); }} className="w-full btn-primary text-xs flex items-center justify-center gap-2 py-2 mb-3">
            <PlusCircle className="w-4 h-4" /> <span>New Test Plan</span>
          </button>

          {/* Session search */}
          {sessions.length > 0 && (
            <input
              type="text"
              value={sessionSearch}
              onChange={e => setSessionSearch(e.target.value)}
              placeholder="Search sessions..."
              className="w-full text-xs px-3 py-1.5 mb-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          )}

          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
            {filteredSessions.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No saved history yet.</p>
            ) : (
              filteredSessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => renamingId !== s.id && selectSession(s)}
                  className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer text-xs ${
                    s.id === activeSessionId
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-200 font-semibold"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  {renamingId === s.id ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(s.id); if (e.key === 'Escape') setRenamingId(null); }}
                        className="flex-1 text-xs px-1 py-0.5 border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                        autoFocus
                      />
                      <button onClick={() => commitRename(s.id)} className="p-0.5 text-emerald-600 hover:text-emerald-700"><Check className="w-3 h-3" /></button>
                      <button onClick={() => setRenamingId(null)} className="p-0.5 text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{s.title}</span>
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); startRename(s); }} className="p-0.5 rounded text-slate-400 hover:text-slate-600"><Pencil className="w-3 h-3" /></button>
                        {deleteConfirmId === s.id ? (
                          <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="p-0.5 rounded text-red-500 hover:text-red-700"><Trash2 className="w-3 h-3" /></button>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(s.id); }} className="p-0.5 rounded text-slate-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── MAIN COLUMN: Composer → Results ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden animate-[fadeIn_0.3s_ease-out]">
        {/* Composer */}
        <div className="shrink-0 border-b border-slate-100 dark:border-slate-700 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Requirement Input</span>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); runGenerate(input, () => setInput('')); }} className="flex flex-col gap-2">
            <textarea
              rows={5}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (((e.key === 'Enter' && (e.metaKey || e.ctrlKey)) || (e.key === 'Enter' && !e.shiftKey))) { e.preventDefault(); runGenerate(input, () => setInput('')); } }}
              placeholder="Paste a PRD, User Story, Acceptance Criteria, Gherkin, or plain text..."
              disabled={loading}
              className="w-full text-sm leading-relaxed px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-y min-h-[96px]"
            />
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setInput('As a user I can login with email and password')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium transition">
                Use example
              </button>
              <button type="submit" disabled={loading || !input.trim()} className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 disabled:opacity-40">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {loading ? 'Generating...' : 'Generate Plan'}
              </button>
            </div>
          </form>
        </div>

        {/* Results */}
        <div className="flex-1 min-h-0 flex flex-col">
          {result ? (
            <>
              <div className="flex-1 overflow-auto min-h-0">
                {/* Summary strip */}
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{result.feature_name}</span>
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700 uppercase tracking-wide">{result.detected_format}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{result.coverage_summary}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{result.test_matrix.length} test cases</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{result.total_effort_hours}h estimated effort</span>
                </div>

                {/* Toolbar */}
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Test Matrix</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={downloadCsv} className="btn-secondary text-xs px-2.5 py-1.5 flex gap-1 items-center"><Download className="w-3.5 h-3.5" /> CSV</button>
                    <button type="button" onClick={downloadXlsx} className="btn-primary text-xs px-2.5 py-1.5 flex gap-1 items-center"><Download className="w-3.5 h-3.5" /> XLSX</button>
                  </div>
                </div>

                {/* Matrix */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="p-3 font-semibold text-slate-600">#</th>
                        <th className="p-3 font-semibold text-slate-600">Category</th>
                        <th className="p-3 font-semibold text-slate-600">Scenario</th>
                        <th className="p-3 font-semibold text-slate-600">Expected Result</th>
                        <th className="p-3 font-semibold text-slate-600">Priority</th>
                        <th className="p-3 font-semibold text-slate-600">Effort</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.test_matrix.map(tc => (
                        <tr key={tc.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="p-3 font-mono text-xs text-slate-500">{tc.id}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${CATEGORY_COLORS[tc.category] || 'bg-slate-100 text-slate-700'}`}>
                              {tc.category}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-slate-800">{tc.scenario}</div>
                          </td>
                          <td className="p-3 text-xs text-slate-600">{tc.expected}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${PRIORITY_COLORS[tc.priority] || 'bg-slate-100 text-slate-700'}`}>
                              {tc.priority}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-slate-500">{tc.effort_hours}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Compact refine input */}
              <div className="shrink-0 border-t border-slate-100 dark:border-slate-700 px-4 py-3 bg-slate-50/40 dark:bg-slate-900/40">
                <form onSubmit={(e) => { e.preventDefault(); runGenerate(refine, () => setRefine('')); }} className="flex items-end gap-2">
                  <textarea
                    rows={2}
                    value={refine}
                    onChange={(e) => setRefine(e.target.value)}
                    onKeyDown={(e) => { if (((e.key === 'Enter' && (e.metaKey || e.ctrlKey)) || (e.key === 'Enter' && !e.shiftKey))) { e.preventDefault(); runGenerate(refine, () => setRefine('')); } }}
                    placeholder="Refine plan — e.g. 'Add edge cases for empty and invalid input'..."
                    disabled={loading}
                    className="flex-1 text-xs leading-relaxed px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none max-h-32"
                  />
                  <button type="submit" disabled={loading || !refine.trim()} className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition shrink-0" title="Refine (Enter)">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
                <p className="text-[10px] text-slate-400 mt-1.5 text-center">AI Agent can make mistakes. Check important info.</p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
              {loading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  Analyzing document and building matrix...
                </div>
              ) : (
                <>
                  <BookOpen className="w-10 h-10 text-indigo-500 mb-3 opacity-80" />
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Test Planner Workspace</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">Paste a PRD, User Story, Acceptance Criteria, Gherkin, or plain text above and click Generate Plan. The test matrix will appear here.</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
