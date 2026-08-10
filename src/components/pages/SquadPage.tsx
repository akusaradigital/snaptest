"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { getApiKey } from "@/lib/keys";
import toast from "react-hot-toast";
import {
  Clock, X, PlusCircle, Trash2, PanelLeft,
  Sparkles, Bot, Loader2, Send, Search, Edit2,
  CheckCircle2, Copy, Download, FileText, Layers,
} from "lucide-react";

// ── types ──────────────────────────────────────────────────────────────────

interface SquadStep {
  step_number: number;
  agent: string;
  agent_name: string;
  action_summary: string;
  output_preview: string;
}

interface SquadResult {
  plan_summary: string;
  steps: SquadStep[];
  unified_markdown: string;
}

interface SquadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "generating" | "complete" | "error";
  result?: SquadResult;
  steps_completed?: number;
  steps_total?: number;
  timestamp: string;
}

interface SquadSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: SquadMessage[];
}

// ── constants ──────────────────────────────────────────────────────────────

const SQUAD_SESSIONS_STORAGE = "snaptest_squad_sessions";

const AGENT_COLORS: Record<string, string> = {
  test_cases: "bg-blue-100 text-blue-700 border-blue-300",
  test_data: "bg-emerald-100 text-emerald-700 border-emerald-300",
  api_test: "bg-purple-100 text-purple-700 border-purple-300",
  test_planner: "bg-amber-100 text-amber-700 border-amber-300",
  script_repair: "bg-rose-100 text-rose-700 border-rose-300",
  coverage_check: "bg-cyan-100 text-cyan-700 border-cyan-300",
};

// ── helpers ────────────────────────────────────────────────────────────────

function fmtTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate() {
  return new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function dlBlob(filename: string, mime: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── component ──────────────────────────────────────────────────────────────

interface SquadPageProps {
  aiProvider: string;
  aiModel: string;
}

export default function SquadPage({ aiProvider, aiModel }: SquadPageProps) {
  // ── state ──────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SquadSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<"report" | "steps">("report");
  const [copiedAll, setCopiedAll] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── load sessions ──────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SQUAD_SESSIONS_STORAGE);
      if (saved) {
        const parsed: SquadSession[] = JSON.parse(saved);
        setSessions(parsed);
      }
    } catch {
      /* empty */
    }
  }, []);

  const saveSessions = (next: SquadSession[], bump?: SquadSession) => {
    let ordered = next;
    if (bump) ordered = [bump, ...next.filter((s) => s.id !== bump.id)];
    setSessions(ordered);
    try {
      localStorage.setItem(SQUAD_SESSIONS_STORAGE, JSON.stringify(ordered));
    } catch {
      /* empty */
    }
  };

  // ── derived ────────────────────────────────────────────────────────────
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const messages = activeSession?.messages ?? [];
  const activeResult = [...messages].reverse().find((m) => m.result)?.result ?? null;

  useEffect(() => {
    const t = setTimeout(
      () => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
      100
    );
    return () => clearTimeout(t);
  }, [messages, isLoading, activeSessionId]);

  // ── session management ─────────────────────────────────────────────────
  const handleNewSession = () => {
    const id = crypto.randomUUID();
    const s: SquadSession = {
      id,
      title: "New Squad Command",
      updatedAt: fmtDate(),
      messages: [],
    };
    saveSessions([s, ...sessions], s);
    setActiveSessionId(id);
    setInputText("");
    toast.success("New squad command started!");
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (!deleteConfirmId) return;
    const next = sessions.filter((s) => s.id !== deleteConfirmId);
    saveSessions(next);
    if (activeSessionId === deleteConfirmId) setActiveSessionId(next[0]?.id ?? null);
    toast.success("Session deleted");
    setDeleteConfirmId(null);
  };

  const commitRename = (session: SquadSession) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed || trimmed === session.title) return;
    const next = sessions.map((s) =>
      s.id === session.id ? { ...s, title: trimmed } : s
    );
    saveSessions(next, { ...session, title: trimmed });
  };

  // ── send / orchestrate ─────────────────────────────────────────────────
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    if (!aiProvider || !aiModel) {
      toast.error("Please select an AI provider and model first");
      return;
    }

    // create session if needed
    let sessionId = activeSessionId;
    let currentSessions = [...sessions];

    if (!sessionId || !currentSessions.find((s) => s.id === sessionId)) {
      const id = crypto.randomUUID();
      const s: SquadSession = {
        id,
        title: inputText.trim().substring(0, 40),
        updatedAt: fmtDate(),
        messages: [],
      };
      currentSessions = [s, ...currentSessions];
      sessionId = id;
      setActiveSessionId(id);
    }

    const userMsg: SquadMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputText.trim(),
      timestamp: fmtTime(),
    };

    const stepsCount = 4; // placeholder until LLM responds
    const aiPlaceholder: SquadMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Squad Leader is planning the orchestration...",
      status: "generating",
      steps_total: stepsCount,
      steps_completed: 0,
      timestamp: fmtTime(),
    };

    const target = currentSessions.find((s) => s.id === sessionId)!;
    if (target.messages.length === 0) {
      target.title = inputText.trim().substring(0, 40) || "Squad Command";
    }
    target.messages = [...target.messages, userMsg, aiPlaceholder];
    target.updatedAt = fmtDate();
    saveSessions(currentSessions, { ...target });

    setInputText("");
    setIsLoading(true);

    try {
      const pubCfg = JSON.parse(
        localStorage.getItem("9router_public") || "{}"
      );
      const res = await axios.post("/api/squad/orchestrate", {
        command: inputText.trim(),
        ai_provider: aiProvider,
        ai_model: aiModel,
        api_key: getApiKey(aiProvider),
        nine_router_public_url: pubCfg.url || "",
        nine_router_public_key: pubCfg.key || "",
      });

      const result: SquadResult = res.data.result;
      const steps = result.steps || [];

      // Build a readable summary for the chat bubble
      let summaryText = `## ${result.plan_summary}\n\n`;
      steps.forEach((step, i) => {
        summaryText += `**Step ${step.step_number} — ${step.agent_name}**\n${step.action_summary}\n\n`;
      });

      const finalMsg: SquadMessage = {
        ...aiPlaceholder,
        content: summaryText,
        status: "complete",
        result,
        steps_completed: steps.length,
        steps_total: steps.length,
      };

      setSessions((prev) => {
        const updated = prev.map((s) => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === aiPlaceholder.id ? finalMsg : m
            ),
          };
        });
        try {
          localStorage.setItem(SQUAD_SESSIONS_STORAGE, JSON.stringify(updated));
        } catch {
          /* empty */
        }
        return updated;
      });

      toast.success("Squad orchestration complete!");
    } catch (error: any) {
      const errMsg =
        error.response?.data?.error || error.message || "Orchestration failed";
      toast.error(errMsg);
      setSessions((prev) => {
        const updated = prev.map((s) => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === aiPlaceholder.id
                ? { ...m, content: `Error: ${errMsg}`, status: "error" as const }
                : m
            ),
          };
        });
        try {
          localStorage.setItem(SQUAD_SESSIONS_STORAGE, JSON.stringify(updated));
        } catch {
          /* empty */
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ── download / copy ────────────────────────────────────────────────────
  const handleDownloadReport = () => {
    if (!activeResult) return;
    const content = activeResult.unified_markdown || buildFallbackMarkdown(activeResult);
    dlBlob("squad-report.md", "text/markdown", content);
    toast.success("Report downloaded!");
  };

  const handleCopyAll = () => {
    if (!activeResult) return;
    const content = activeResult.unified_markdown || buildFallbackMarkdown(activeResult);
    navigator.clipboard.writeText(content);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
    toast.success("Copied to clipboard!");
  };

  function buildFallbackMarkdown(r: SquadResult): string {
    let md = `# QA Squad Report\n\n**Plan:** ${r.plan_summary}\n\n`;
    (r.steps || []).forEach((step) => {
      md += `## Step ${step.step_number}: ${step.agent_name}\n\n`;
      md += `**Action:** ${step.action_summary}\n\n`;
      if (step.output_preview) {
        md += `### Output\n\n${step.output_preview}\n\n`;
      }
    });
    return md;
  }

  // ── rendering ──────────────────────────────────────────────────────────
  const filteredSessions = sessions.filter((s) =>
    !sessionSearch || s.title.toLowerCase().includes(sessionSearch.toLowerCase())
  );
  const busy = isLoading;

  return (
    <div className="flex h-[calc(100vh-140px)]">
      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────── */}
      {showSidebar && (
        <div className="w-[280px] border-r border-slate-200 dark:border-slate-700 p-4 flex flex-col shrink-0 h-full overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> CHAT HISTORY ({sessions.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowSidebar(false)}
              className="p-1 rounded hover:bg-slate-100 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleNewSession}
            className="w-full btn-primary text-xs flex items-center justify-center gap-2 py-2 mb-3"
          >
            <PlusCircle className="w-4 h-4" /> <span>New Squad Command</span>
          </button>

          {sessions.length > 0 && (
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder="Search chats..."
                className="w-full text-xs pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
            {filteredSessions.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">
                No saved squad commands yet.
              </p>
            )}
            {filteredSessions.map((s) => {
              const isRenaming = renamingId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => !isRenaming && setActiveSessionId(s.id)}
                  onDoubleClick={() => {
                    setRenamingId(s.id);
                    setRenameValue(s.title || "");
                  }}
                  className={`group p-2.5 rounded-xl text-left cursor-pointer transition flex items-center justify-between ${
                    s.id === activeSessionId
                      ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-200 font-semibold border border-indigo-200 dark:border-indigo-800"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="min-w-0 flex-1 mr-2">
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => commitRename(s)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename(s);
                          }
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="w-full text-xs px-1.5 py-0.5 rounded border border-indigo-300 focus:outline-none bg-white dark:bg-slate-800 font-normal"
                      />
                    ) : (
                      <p className="text-xs truncate">{s.title || "Untitled"}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {s.updatedAt}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(s.id);
                        setRenameValue(s.title || "");
                      }}
                      className="p-1 rounded hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition"
                      title="Rename session"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(s.id, e)}
                      className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition"
                      title="Delete session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MAIN CHAT AREA ───────────────────────────────────────────── */}
      <div className="flex flex-col min-w-0 flex-1 max-w-4xl mx-auto h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-700 shrink-0">
          {!showSidebar && (
            <button
              type="button"
              onClick={() => setShowSidebar(true)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition"
              title="Show sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            QA Squad Orchestrator
          </span>
          {busy && (
            <Loader2 className="w-4 h-4 text-indigo-500 animate-spin ml-auto" />
          )}
        </div>

        {/* Chat Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin flex flex-col">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 my-auto">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mb-3">
                <Bot className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1">
                Command Your AI QA Squad
              </h3>
              <p className="text-xs text-slate-500 max-w-md mb-4">
                Type a single command (e.g. &apos;Test login flow on example.com,
                generate mock user data, and check API test suite&apos;). AI Squad
                Leader will orchestrate all sub-agents.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  type="button"
                  onClick={() =>
                    setInputText(
                      "Test login flow & generate mock user data"
                    )
                  }
                  className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 hover:border-indigo-300 transition"
                >
                  💡 Example: Test login flow &amp; generate mock user data
                </button>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-1 shadow-sm">
                  <Sparkles className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] ${
                  msg.role === "user" ? "" : ""
                }`}
              >
                <div
                  className={`p-3.5 rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-none"
                      : msg.status === "error"
                      ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                      : msg.status === "generating"
                      ? "bg-white border border-slate-200 dark:border-slate-700 rounded-bl-none text-slate-700 dark:text-slate-200 shadow-sm"
                      : "bg-white border border-slate-200 dark:border-slate-700 rounded-bl-none text-slate-700 dark:text-slate-200 shadow-sm"
                  }`}
                >
                  {msg.status === "generating" ? (
                    <div className="space-y-2">
                      <span className="flex items-center gap-2 text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                        Squad Leader is orchestrating...
                      </span>
                      {msg.steps_total && msg.steps_total > 0 && (
                        <div className="flex flex-col gap-1.5 pt-1">
                          {Array.from(
                            { length: msg.steps_total },
                            (_, i) => (
                              <div
                                key={i}
                                className={`flex items-center gap-2 text-xs ${
                                  (msg.steps_completed ?? 0) > i
                                    ? "text-emerald-600"
                                    : (msg.steps_completed ?? 0) === i
                                    ? "text-indigo-600 font-medium"
                                    : "text-slate-300"
                                }`}
                              >
                                {(msg.steps_completed ?? 0) > i ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                ) : (msg.steps_completed ?? 0) === i ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" />
                                )}
                                <span>
                                  Step {i + 1}:{" "}
                                  {[
                                    "Test Case Agent",
                                    "Test Data Generator",
                                    "API Test Agent",
                                    "Test Planner",
                                    "Script Repair",
                                    "Coverage Checker",
                                  ][i] || `Agent ${i + 1}`}{" "}
                                  {(msg.steps_completed ?? 0) > i
                                    ? "complete"
                                    : (msg.steps_completed ?? 0) === i
                                    ? "running..."
                                    : "pending"}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span
                      className="whitespace-pre-wrap leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: msg.content.replace(
                          /\*\*(.*?)\*\*/g,
                          "<strong>$1</strong>"
                        ),
                      }}
                    />
                  )}
                </div>

                <span className="text-[10px] text-slate-400 mt-1 block">
                  {msg.timestamp}
                </span>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input Dock */}
        <div className="shrink-0 px-4 pb-4 pt-2">
          <div className="bg-white dark:bg-slate-800/95 backdrop-blur-md rounded-3xl border border-slate-200 dark:border-slate-700 p-2.5">
            <form onSubmit={handleSend} className="flex items-center gap-2">
              <textarea
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Command your QA squad (e.g. 'Test login flow on example.com, generate mock user data, and check API test suite')..."
                disabled={busy}
                className="flex-1 bg-transparent border-none text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-0 resize-none max-h-44 leading-relaxed py-1.5 px-1"
              />
              <button
                type="submit"
                disabled={busy || !inputText.trim()}
                className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition shrink-0"
                title="Send (Enter)"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
          <p className="text-center text-[11px] text-slate-400 mt-2">
            AI Agent can make mistakes. Check important info.
          </p>
        </div>

        {/* ── INLINE WORKSPACE (below composer) ─────────────────────── */}
        {activeResult && (
          <div className="shrink-0 max-h-[45vh] min-h-0 flex flex-col border-t border-slate-200 dark:border-slate-700 overflow-hidden">
            {/* Tab Bar */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-2 py-1.5 shrink-0">
            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                onClick={() => setWorkspaceTab("report")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  workspaceTab === "report"
                    ? "bg-white shadow-sm border border-slate-200 text-indigo-700"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Generated Plan
              </button>
              <button
                onClick={() => setWorkspaceTab("steps")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  workspaceTab === "steps"
                    ? "bg-white shadow-sm border border-slate-200 text-emerald-700"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> Generated Steps
              </button>
            </div>
            <div className="flex gap-2 px-2">
              <button
                onClick={handleDownloadReport}
                className="btn-secondary text-xs px-2.5 py-1.5 flex gap-1 items-center"
              >
                <Download className="w-3 h-3" /> Report (MD)
              </button>
              <button
                onClick={handleCopyAll}
                className="btn-primary text-xs px-2.5 py-1.5 flex gap-1 items-center"
              >
                {copiedAll ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                {copiedAll ? "Copied!" : "Copy All"}
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto p-4 min-h-0">
            {workspaceTab === "report" ? (
              <div className="prose prose-sm max-w-none">
                <h2 className="text-lg font-bold text-slate-800 mb-2">
                  Squad Report
                </h2>
                <div className="flex flex-wrap gap-2 mb-4">
                  {activeResult.steps.map((step) => {
                    const colorClass =
                      AGENT_COLORS[step.agent] ||
                      "bg-slate-100 text-slate-700 border-slate-300";
                    return (
                      <span
                        key={step.step_number}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${colorClass}`}
                      >
                        #{step.step_number} {step.agent_name}
                      </span>
                    );
                  })}
                </div>
                <div className="text-sm text-slate-700 leading-relaxed">
                  {activeResult.unified_markdown
                    ? renderMarkdown(activeResult.unified_markdown)
                    : renderMarkdown(buildFallbackMarkdown(activeResult))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-800 mb-1">
                  Generated Steps ({activeResult.steps.length})
                </h3>
                {activeResult.steps.map((step) => {
                  const colorClass =
                    AGENT_COLORS[step.agent] ||
                    "bg-slate-100 text-slate-700 border-slate-300";
                  return (
                    <details
                      key={step.step_number}
                      className="group border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
                    >
                      <summary className="flex items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-900/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition text-sm font-medium text-slate-700 dark:text-slate-200">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${colorClass}`}
                        >
                          Step {step.step_number}
                        </span>
                        <span className="flex-1">{step.agent_name}</span>
                      </summary>
                      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700">
                        <p className="text-xs text-slate-500 mb-2">
                          <strong>Action:</strong> {step.action_summary}
                        </p>
                        {step.output_preview && (
                          <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 rounded-lg p-3 whitespace-pre-wrap max-h-64 overflow-auto border border-slate-200 dark:border-slate-700">
                            {step.output_preview}
                          </pre>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl max-w-sm w-full mx-4 border border-slate-200 dark:border-slate-700 animate-[slideIn_0.2s_ease-out]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
              Delete Session?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Are you sure you want to permanently delete this session? This
              action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 shadow-sm shadow-red-600/20 transition"
              >
                Delete Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── small markdown render helper ───────────────────────────────────────────

function renderMarkdown(text: string) {
  // minimal markdown-to-HTML for the workspace report
  const html = text
    .split("\n")
    .map((line) => {
      if (line.startsWith("### ")) return `<h3 class="text-base font-bold text-slate-800 mt-4 mb-1">${line.slice(4)}</h3>`;
      if (line.startsWith("## ")) return `<h2 class="text-lg font-bold text-slate-800 mt-5 mb-2">${line.slice(3)}</h2>`;
      if (line.startsWith("# ")) return `<h1 class="text-xl font-bold text-slate-800 mt-5 mb-2">${line.slice(2)}</h1>`;
      if (line.startsWith("- **")) {
        const rest = line.slice(2);
        return `<li class="text-sm text-slate-700 ml-4 list-disc">${rest.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`;
      }
      if (line.startsWith("- ")) {
        return `<li class="text-sm text-slate-700 ml-4 list-disc">${line.slice(2)}</li>`;
      }
      if (/^\d+\.\s/.test(line)) {
        return `<li class="text-sm text-slate-700 ml-4 list-decimal">${line.replace(/^\d+\.\s/, "")}</li>`;
      }
      if (line.startsWith("|")) return line; // skip raw table lines in minimal render
      if (line.trim() === "") return "<br />";
      return `<p class="text-sm text-slate-700 leading-relaxed mb-1">${line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</p>`;
    })
    .join("\n");
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
