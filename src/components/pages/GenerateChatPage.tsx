"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getAiRequestPayload, getApiKey } from "@/lib/keys";
import { getEffectiveAiRules, rememberAiRule, buildFeedbackDirectives } from "@/lib/aiMemory";
import { useServerSessions } from "@/lib/useServerSessions";
import { classifyUnifiedQaIntent, createSseParser, withTestCaseClientIds } from "@/lib/unifiedQaChat.mjs";
import type { UnifiedQaArtifacts, UnifiedQaIntent, UnifiedQaSession } from "@/types/unifiedQaChat";
import toast from "react-hot-toast";
import TestCaseTable from "@/components/TestCaseTable";
import ScriptViewer from "@/components/ScriptViewer";
import ScriptDiffViewer from "@/components/ScriptDiffViewer";
import SpreadsheetModal from "@/components/SpreadsheetModal";
import { generatePlaywrightConfig } from "@/lib/playwrightConfig";
import { GenerateResponse, ScriptFile, TestCase } from "@/types";
import {
  Clock,
  X,
  PlusCircle,
  Trash2,
  Bot,
  Loader2,
  Send,
  Upload,
  Globe,
  FileText,
  Download,
  Search,
  Edit2,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  MoreHorizontal,
  Sparkles,
  Maximize2,
  PanelLeft,
  RotateCcw,
  Zap,
} from "lucide-react";

// ── types ──────────────────────────────────────────────────────────────────

interface GenMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image_preview?: string;
  status?: "generating" | "complete" | "error";
  result?: GenerateResponse;
  timestamp: string;
  feedback?: "like" | "dislike";
  retryAction?: {
    type: "script" | "generate";
    framework?: "playwright" | "cypress" | "gherkin";
    text?: string;
    file?: UploadedFile | null;
  };
}

interface GenSession extends UnifiedQaSession, Record<string, unknown> {
  messages: GenMessage[];
  artifacts?: UnifiedQaArtifacts;
}

interface UploadedFile {
  type: "pdf" | "image";
  name: string;
  text?: string;
  imageBase64?: string;
  preview?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────

const GEN_SESSIONS_STORAGE = "snaptest_generate_sessions_v1";
const ACTIVE_SESSION_STORAGE = "snaptest_generate_active_session_id";

function sanitizeSession(session: GenSession): GenSession {
  const defaultArtifacts: UnifiedQaArtifacts = {
    cases: [],
    playwright: [],
    gherkin: "",
    tab: "cases",
    selectedIds: [],
    runStates: {},
    progress: [],
  };

  const artifacts: UnifiedQaArtifacts = {
    ...defaultArtifacts,
    ...(session.artifacts || {}),
  };

  const hasAnyCases = Boolean(artifacts.cases && artifacts.cases.length > 0);

  const messages = (session.messages || []).map((m): GenMessage => {
    if (m.status === "generating") {
      const hasResultCases = Boolean(m.result?.test_cases && m.result.test_cases.length > 0);
      if (m.result || hasResultCases || hasAnyCases) {
        return {
          ...m,
          status: "complete",
        };
      }
      return {
        ...m,
        status: "error",
        content:
          "Generation was interrupted (browser was reloaded or closed). You can generate again or enter a new request below.",
      };
    }
    return m;
  });

  return {
    ...session,
    artifacts,
    messages,
  };
}

function readStoredObject(key: string): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function looksLikeFigmaUrl(text: string) {
  return /figma\.com\/(file|design)\/[a-zA-Z0-9]+/.test(text.trim());
}
function looksLikeUrl(text: string) {
  return (
    /^https?:\/\//i.test(text.trim()) ||
    /^[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}/.test(text.trim())
  );
}
function ensureProtocol(url: string) {
  const t = url.trim();
  if (!t || /^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(/\b(?:https?:\/\/|www\.)[^\s"'<>)\]]+/i);
  if (!match) return null;
  let url = match[0].replace(/[)\]"'>.,;]+$/, '').trim();
  if (/^www\./i.test(url)) url = `https://${url}`;
  return url;
}

function detectKind(text: string, file: UploadedFile | null) {
  if (!text.trim() && !file) return "empty";
  const urlInText = extractFirstUrl(text);
  if (file && urlInText) return "hybrid";
  if (file) return "file";
  if (looksLikeFigmaUrl(text)) return "figma";
  if (urlInText || looksLikeUrl(text)) return "url";
  return "goal";
}

function dlBlob(filename: string, mime: string, content: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── component ──────────────────────────────────────────────────────────────

interface Props {
  aiProvider: string;
  aiModel: string;
}

export default function GenerateChatPage({ aiProvider, aiModel }: Props) {
  // ── sidebar / sessions ──────────────────────────────────────────────────
  const [sessions, setSessions] = useState<GenSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHistorySidebar, setShowHistorySidebar] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false); // kept for possible future use
  const historyRef = useRef<HTMLDivElement>(null); // kept for possible future use

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

  const [sessionSearch, setSessionSearch] = useState("");

  // ── input dock ──────────────────────────────────────────────────────────
  const [inputText, setInputText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [parsingDoc, setParsingDoc] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── right panel ─────────────────────────────────────────────────────────
  const [workspaceTab, setWorkspaceTab] = useState<"cases" | "playwright" | "gherkin">("cases");
  const [playwrightScripts, setPlaywrightScripts] = useState<ScriptFile[] | null>(null);
  const [gherkinContent, setGherkinContent] = useState<string | null>(null);
  const [generatingScript, setGeneratingScript] = useState<"playwright" | "gherkin" | null>(null);
  const [scriptFramework, setScriptFramework] = useState<"playwright" | "cypress">("playwright");
  const [scriptLanguage, setScriptLanguage] = useState<"typescript" | "javascript">("typescript");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmation, setConfirmation] = useState<"repair" | "jira" | "aksora" | null>(null);
  const [isFullModalOpen, setIsFullModalOpen] = useState(false);
  const [selectedModalResult, setSelectedModalResult] = useState<GenerateResponse | null>(null);
  const setActiveResult = setSelectedModalResult;
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [messageFeedback, setMessageFeedback] = useState<Record<string, "like" | "dislike">>({});
  const [activeMenuMsgId, setActiveMenuMsgId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close message options menu on click outside
  useEffect(() => {
    if (!activeMenuMsgId) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuMsgId(null);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [activeMenuMsgId]);

  const serverSessions = useServerSessions<GenSession>("unified-qa-chat", "snaptest_generate_summaries_cache_v1");

  // ── load sessions ────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GEN_SESSIONS_STORAGE);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) throw new Error("Invalid saved sessions");
        const sanitized = parsed.map(sanitizeSession);
        setSessions(sanitized);

        // Read URL hash or localStorage for active session restoration
        const hashSessionId = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
        const storedSessionId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_SESSION_STORAGE) : null;

        const targetId = (hashSessionId && sanitized.some((s) => s.id === hashSessionId))
          ? hashSessionId
          : (storedSessionId && sanitized.some((s) => s.id === storedSessionId))
          ? storedSessionId
          : (sanitized[0]?.id || null);

        setActiveSessionId(targetId);
      }
    } catch {}
  }, []);

  // Sync activeSessionId with localStorage and URL hash
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeSessionId) {
      try { localStorage.setItem(ACTIVE_SESSION_STORAGE, activeSessionId); } catch {}
      const currentHash = window.location.hash.replace("#", "");
      if (currentHash !== activeSessionId) {
        window.history.replaceState(null, "", "#" + activeSessionId);
      }
    } else {
      try { localStorage.removeItem(ACTIVE_SESSION_STORAGE); } catch {}
      if (window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, [activeSessionId]);

  const saveSessions = (next: GenSession[], bump?: GenSession) => {
    let ordered = next;
    if (bump) ordered = [bump, ...next.filter((s) => s.id !== bump.id)];
    setSessions(ordered);
    try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(ordered)); } catch {}
    if (bump) void serverSessions.saveToServer(bump.id, bump.title, bump).catch(() => toast.error("Saved locally; server sync failed"));
  };

  const updateArtifacts = (patch: Partial<UnifiedQaArtifacts>) => {
    if (!activeSession) return;
    const artifacts: UnifiedQaArtifacts = {
      cases: [], playwright: [], gherkin: "", tab: "cases", selectedIds: [], runStates: {}, progress: [],
      ...activeSession.artifacts, ...patch,
    };
    const updated = { ...activeSession, updatedAt: fmtDate(), artifacts };
    saveSessions(sessions.map(s => s.id === updated.id ? updated : s), updated);
  };

  useEffect(() => {
    if (!serverSessions.isAuthed || serverSessions.loading) return;
    void Promise.all(serverSessions.sessions.map(async (summary) => {
      try { return await serverSessions.fetchSessionData(summary.id); } catch { return null; }
    })).then((remote) => {
      const loaded = remote
        .filter((s): s is GenSession => !!s && Array.isArray(s.messages))
        .map(sanitizeSession);

      if (!loaded.length) return;

      setSessions((currentLocal) => {
        const merged: GenSession[] = [];
        const processedIds = new Set<string>();

        // Merge local with remote
        for (const loc of currentLocal) {
          processedIds.add(loc.id);
          const rem = loaded.find((r) => r.id === loc.id);
          if (!rem) {
            merged.push(loc);
          } else {
            const locCases = loc.artifacts?.cases?.length || 0;
            const remCases = rem.artifacts?.cases?.length || 0;
            const locComplete = loc.messages?.some((m) => m.status === "complete") || false;
            const remComplete = rem.messages?.some((m) => m.status === "complete") || false;

            if ((locComplete || locCases > 0) && (!remComplete || locCases > remCases)) {
              // Local version has completed cases / messages or richer state; keep local and sync to server
              merged.push(loc);
              void serverSessions.saveToServer(loc.id, loc.title, loc).catch(() => {});
            } else {
              merged.push(rem);
            }
          }
        }

        // Add any remote-only sessions
        for (const rem of loaded) {
          if (!processedIds.has(rem.id)) {
            merged.push(rem);
            processedIds.add(rem.id);
          }
        }

        try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(merged)); } catch {}

        // If activeSessionId is still null and sessions exist, select the first session!
        setActiveSessionId((prevId) => prevId || (merged[0]?.id ?? null));

        return merged;
      });
    });
  }, [serverSessions.isAuthed, serverSessions.loading, serverSessions.sessions]);

  // ── derived ─────────────────────────────────────────────────────────────
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const messages = activeSession?.messages ?? [];
  const rawActiveResult = [...messages].reverse().find((m) => m.result)?.result ?? null;
  const activeResult: GenerateResponse | null = rawActiveResult || (
    activeSession?.artifacts?.cases && activeSession.artifacts.cases.length > 0
      ? {
          url: extractFirstUrl(activeSession.messages.find((m) => m.role === "user")?.content || "") || "",
          page_title: activeSession.title || "Generated Tests",
          elements_found: 0,
          test_case_table: "",
          test_cases: activeSession.artifacts.cases as TestCase[],
          scripts: (activeSession.artifacts.playwright as ScriptFile[]) || [],
        }
      : null
  );
  const selectedCount = activeSession?.artifacts?.selectedIds?.length || 0;

  const recoveredSessionsRef = useRef<Set<string>>(new Set());

  // Automatic history recovery for sessions that lost cases
  useEffect(() => {
    if (!activeSession || isLoading) return;
    const casesCount = activeSession.artifacts?.cases?.length || 0;
    if (casesCount > 0) return;
    if (recoveredSessionsRef.current.has(activeSession.id)) return;

    const firstUserMsg = activeSession.messages?.find((m) => m.role === "user");
    if (!firstUserMsg) return;
    const urlInMsg = extractFirstUrl(firstUserMsg.content);
    if (!urlInMsg) return;

    recoveredSessionsRef.current.add(activeSession.id);

    void (async () => {
      try {
        const res = await fetch(`/api/history?search=${encodeURIComponent(urlInMsg)}&limit=5`);
        if (!res.ok) return;
        const data = await res.json();
        const items = data.items || [];
        if (!items.length) return;

        const match = items.find((it: any) => it.url && (it.url.includes(urlInMsg) || urlInMsg.includes(it.url))) || items[0];
        if (!match?.id) return;

        const detailRes = await fetch(`/api/history/${encodeURIComponent(match.id)}`);
        if (!detailRes.ok) return;
        const detail = await detailRes.json();

        if (detail.test_cases && Array.isArray(detail.test_cases) && detail.test_cases.length > 0) {
          const clientCases = withTestCaseClientIds(detail.test_cases);
          const scripts = (detail.scripts || []) as ScriptFile[];
          const recoveredResult: GenerateResponse = {
            url: detail.url || urlInMsg,
            page_title: detail.page_title || activeSession.title || "Restored Tests",
            elements_found: detail.elements_found || 0,
            test_case_table: detail.test_case_table || "",
            test_cases: clientCases,
            scripts: scripts,
          };

          setSessions((prev) => {
            const updated = prev.map((s) => {
              if (s.id !== activeSession.id) return s;
              const nextArtifacts: UnifiedQaArtifacts = {
                playwright: scripts.length ? scripts : (s.artifacts?.playwright || []),
                gherkin: s.artifacts?.gherkin || "",
                tab: "cases",
                selectedIds: s.artifacts?.selectedIds || [],
                runStates: s.artifacts?.runStates || {},
                progress: s.artifacts?.progress || [],
                ...s.artifacts,
                cases: clientCases,
              };
              const updatedMessages = s.messages.map((m) => {
                if (m.role === "assistant" && !m.result) {
                  return { ...m, status: "complete" as const, result: recoveredResult };
                }
                return m;
              });
              const updatedSession = { ...s, messages: updatedMessages, artifacts: nextArtifacts, updatedAt: fmtDate() };
              void serverSessions.saveToServer(s.id, s.title, updatedSession).catch(() => {});
              return updatedSession;
            });
            try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
            return updated;
          });
          toast.success(`Recovered ${clientCases.length} test cases from history!`);
        }
      } catch {
        // Recovery failed silently
      }
    })();
  }, [activeSession?.id, activeSession?.artifacts?.cases?.length, isLoading]);

  // reset script tabs when session changes
  useEffect(() => {
    setPlaywrightScripts((activeSession?.artifacts?.playwright as ScriptFile[] | undefined) || null);
    setGherkinContent(activeSession?.artifacts?.gherkin || null);
    setWorkspaceTab(activeSession?.artifacts?.tab || "cases");
  }, [activeSessionId]);

  // scroll to bottom
  useEffect(() => {
    const t = setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 100);
    return () => clearTimeout(t);
  }, [messages, isLoading, activeSessionId]);

  // textarea auto-height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [inputText]);

  // close modal on escape key
  useEffect(() => {
    if (!isFullModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullModalOpen]);

  // ── file handling ────────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    if (file.size > 15 * 1024 * 1024) { toast.error("File too large (max 15MB)"); return; }
    if (file.name.endsWith(".pdf")) {
      setParsingDoc(true);
      try {
        const fd = new FormData(); fd.append("file", file);
        const res = await fetch("/api/upload/parse", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to parse PDF");
        setUploadedFile({ type: "pdf", name: file.name, text: data.text });
        toast.success(`Extracted ${data.pages} page(s)`);
      } catch (err: any) { toast.error(err.message); }
      finally { setParsingDoc(false); }
    } else if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setUploadedFile({ type: "image", name: file.name, imageBase64: dataUrl.replace(/^data:image\/[a-z]+;base64,/, ""), preview: dataUrl });
      };
      reader.readAsDataURL(file);
    } else {
      toast.error("Unsupported file. Use PDF, PNG, JPG, or WEBP.");
    }
  }, []);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imgItem = items.find((i) => i.type.startsWith("image/"));
    if (!imgItem) return;
    e.preventDefault();
    const file = imgItem.getAsFile();
    if (file) processFile(new File([file], "screenshot.png", { type: file.type }));
  }, [processFile]);

  // ── session management ───────────────────────────────────────────────────
  const handleNewSession = () => {
    const id = crypto.randomUUID();
    const s: GenSession = { id, title: "New Generate Chat", updatedAt: fmtDate(), messages: [] };
    saveSessions([s, ...sessions], s);
    setActiveSessionId(id);
    setInputText("");
    setUploadedFile(null);
    toast.success("New session started!");
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (!deleteConfirmId) return;
    const deletingId = deleteConfirmId;
    const next = sessions.filter((s) => s.id !== deletingId);
    saveSessions(next);
    void serverSessions.deleteFromServer(deletingId).catch(() => {});
    if (activeSessionId === deletingId) setActiveSessionId(next[0]?.id ?? null);
    toast.success("Session deleted");
    setDeleteConfirmId(null);
  };

  const commitRename = (session: GenSession) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed || trimmed === session.title) return;
    const nextSessions = sessions.map((s) => (s.id === session.id ? { ...s, title: trimmed } : s));
    saveSessions(nextSessions, { ...session, title: trimmed });
  };

  // ── message feedback & actions (matching Image #9) ────────────────────────
  const handleToggleFeedback = (msgId: string, rating: "like" | "dislike") => {
    const current = messageFeedback[msgId];
    const next = current === rating ? undefined : rating;

    setMessageFeedback((prev) => {
      const copy = { ...prev };
      if (next) copy[msgId] = next;
      else delete copy[msgId];
      return copy;
    });

    setSessions((prev) => {
      const updated = prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const updatedSession = {
          ...s,
          messages: s.messages.map((m) => (m.id === msgId ? { ...m, feedback: next } : m)),
        };
        void serverSessions.saveToServer(s.id, s.title, updatedSession).catch(() => {});
        return updatedSession;
      });
      try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
      return updated;
    });

    if (next === "like") {
      toast.success("Helpful response recorded! 👍 (AI will maintain this format)");
    } else if (next === "dislike") {
      toast("Marked as needs improvement 👎 (AI will refine future answers)", { icon: "👎" });
    } else {
      toast("Feedback removed", { icon: "↩️" });
    }
  };

  const handleCopyMessage = async (msg: GenMessage, asMarkdown = false) => {
    let text = msg.content;
    if (asMarkdown && msg.result?.test_cases?.length) {
      text += "\n\n### Generated Test Cases\n\n";
      text += "| # | Test Name | Type | Priority | Expected Result |\n";
      text += "|---|-----------|------|----------|-----------------|\n";
      text += msg.result.test_cases
        .map(
          (tc, i) =>
            `| ${i + 1} | ${(tc.name || "").replace(/\|/g, "-")} | ${tc.type || "POSITIVE"} | ${tc.priority || "P1"} | ${(tc.expected_result || "-").replace(/\|/g, "-")} |`
        )
        .join("\n");
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(msg.id);
      setTimeout(() => setCopiedMsgId(null), 2000);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleDeleteMessage = (msgId: string) => {
    if (!activeSessionId) return;
    setSessions((prev) => {
      const updated = prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const filtered = s.messages.filter((m) => m.id !== msgId);
        const updatedSession = { ...s, messages: filtered, updatedAt: fmtDate() };
        void serverSessions.saveToServer(s.id, s.title, updatedSession).catch(() => {});
        return updatedSession;
      });
      try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
      return updated;
    });
    toast.success("Message deleted");
  };

  // ── send / SSE ───────────────────────────────────────────────────────────
  const handleSend = async (e?: React.FormEvent, customPrompt?: string, customFile?: UploadedFile | null) => {
    if (e) e.preventDefault();

    const promptText = (customPrompt !== undefined ? customPrompt : inputText).trim();
    const fileToUse = customFile !== undefined ? customFile : uploadedFile;

    const kind = detectKind(promptText, fileToUse);
    if (kind === "empty") { toast.error("Enter a URL, paste a screenshot, or upload a file."); return; }
    if (!aiProvider || !aiModel) { toast.error("Select AI Provider & Model in AI Settings (top-right) first."); return; }

    const intent = classifyUnifiedQaIntent(promptText) as UnifiedQaIntent;
    const isCypressIntent = /\bcypress\b/i.test(promptText);
    if ((intent === "generate_playwright" || intent === "generate_gherkin" || isCypressIntent) && activeResult) {
      if (isCypressIntent) setScriptFramework("cypress");
      else if (intent === "generate_playwright") setScriptFramework("playwright");
      await handleScriptGeneration(intent === "generate_gherkin" ? "gherkin" : isCypressIntent ? "cypress" : "playwright");
      if (customPrompt === undefined) setInputText("");
      return;
    }
    if (intent === "run" && activeSession?.artifacts?.selectedIds.length) {
      await runSelected(); if (customPrompt === undefined) setInputText(""); return;
    }
    if (intent === "repair" || intent === "analyze") {
      await proposeRepair(); if (customPrompt === undefined) setInputText(""); return;
    }
    if (intent === "apply_repair") {
      if (!activeSession?.artifacts?.repair) toast.error("No repair proposal is ready.");
      else setConfirmation("repair");
      if (customPrompt === undefined) setInputText(""); return;
    }
    if (intent === "jira_draft") { await draftJira(); if (customPrompt === undefined) setInputText(""); return; }
    if (intent === "jira_create") {
      if (!activeSession?.artifacts?.jiraDraft) toast.error("Create a Jira draft first."); else setConfirmation("jira");
      if (customPrompt === undefined) setInputText(""); return;
    }
    if (intent === "aksora_create") {
      if (!activeSession?.artifacts?.jiraDraft) toast.error('Create a ticket draft first (e.g. "draft jira").'); else setConfirmation("aksora");
      if (customPrompt === undefined) setInputText(""); return;
    }

    // create session if needed
    let sessionId = activeSessionId;
    let currentSessions = [...sessions];

    if (!sessionId || !currentSessions.find((s) => s.id === sessionId)) {
      const id = crypto.randomUUID();
      const s: GenSession = { id, title: promptText.substring(0, 40) || "New Generate Chat", updatedAt: fmtDate(), messages: [] };
      currentSessions = [s, ...currentSessions];
      sessionId = id;
      setActiveSessionId(id);
    }

    const userMsg: GenMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: fileToUse ? `${promptText || "Analyze this file"} (${fileToUse.name})` : promptText,
      image_preview: fileToUse?.type === "image" ? fileToUse.preview : undefined,
      timestamp: fmtTime(),
    };

    const aiPlaceholder: GenMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Starting generation...",
      status: "generating",
      timestamp: fmtTime(),
      retryAction: {
        type: "generate",
        text: promptText,
        file: fileToUse,
      },
    };

    const target = currentSessions.find((s) => s.id === sessionId)!;
    if (target.messages.length === 0) {
      target.title = promptText.substring(0, 40) || (fileToUse?.name ?? "Generate Chat");
    }
    target.messages = [...target.messages, userMsg, aiPlaceholder];
    target.updatedAt = fmtDate();

    saveSessions(currentSessions, { ...target });

    const currentInputText = promptText;
    if (customPrompt === undefined) {
      setInputText("");
      setUploadedFile(null);
    }
    setIsLoading(true);

    const updatePlaceholder = (content: string, extra?: Partial<GenMessage>) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === aiPlaceholder.id ? { ...m, content, ...extra } : m
            ),
          };
        })
      );
    };

    const aiPayload = getAiRequestPayload(aiProvider, aiModel);

    // Conversational Chat (Chatbase-style)
    // If not a URL, Figma link, file upload, or explicit test generation request,
    // handle it as a natural conversational QA turn (questions, memory instructions, greetings).
    const isExplicitGenerate = intent === "generate" || /^\s*(generate|buatkan|bikin|test|uji|buat)\s+(test|skenario|scenario|kasus|spec|e2e)\b/i.test(currentInputText);
    const isConversational = !uploadedFile && kind !== "url" && kind !== "figma" && !isExplicitGenerate;

    if (isConversational) {
      updatePlaceholder("Thinking...", { status: "generating" });
      try {
        const feedbackDirectives = buildFeedbackDirectives(activeSession?.messages || []);
        const combinedRules = [getEffectiveAiRules("generator"), feedbackDirectives].filter(Boolean).join("\n\n");
        const chatRes = await fetch("/api/generate/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: currentInputText,
            custom_rules: combinedRules,
            active_test_cases: activeResult?.test_cases?.slice(0, 10).map((tc: any) => `${tc.id || tc.number}: ${tc.name || tc.scenario}`).join("\n"),
            ...aiPayload,
          }),
        });

        const chatData = await chatRes.json();
        if (!chatRes.ok) throw new Error(chatData.detail || "Failed to process chat message");

        if (chatData.remember_rule) {
          const isGlobal = /semua fitur|global|setiap fitur|all features/i.test(currentInputText);
          rememberAiRule(chatData.remember_rule, isGlobal ? "global" : "generator");
          toast.success(`🧠 Aturan baru disimpan: "${chatData.remember_rule.slice(0, 60)}..."`, { duration: 5000 });
        }

        const replyText = chatData.reply || "Done.";
        updatePlaceholder(replyText, { status: "complete" });

        setSessions((prev) => {
          const updated = prev.map((s) => {
            if (s.id !== sessionId) return s;
            const updatedMessages = s.messages.map((m) =>
              m.id === aiPlaceholder.id ? { ...m, content: replyText, status: "complete" as const } : m
            );
            const updatedSession: GenSession = { ...s, messages: updatedMessages, updatedAt: fmtDate() };
            void serverSessions.saveToServer(sessionId, updatedSession.title, updatedSession).catch(() => {});
            return updatedSession;
          });
          try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
          return updated;
        });
      } catch (err: any) {
        const errText = `⚠️ ${err.message || "Failed to get AI response"}`;
        updatePlaceholder(errText, { status: "error" });
        setSessions((prev) => {
          const updated = prev.map((s) => {
            if (s.id !== sessionId) return s;
            const updatedMessages = s.messages.map((m) =>
              m.id === aiPlaceholder.id ? { ...m, content: errText, status: "error" as const } : m
            );
            const updatedSession: GenSession = { ...s, messages: updatedMessages, updatedAt: fmtDate() };
            void serverSessions.saveToServer(sessionId, updatedSession.title, updatedSession).catch(() => {});
            return updatedSession;
          });
          try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
          return updated;
        });
        toast.error(err.message || "Chat failed");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const urlInText = extractFirstUrl(currentInputText);
    const resolvedUrl =
      urlInText ? ensureProtocol(urlInText)
      : kind === "url" ? ensureProtocol(currentInputText)
      : kind === "figma" ? currentInputText
      : "document://input";

    const isImage = fileToUse?.type === "image";
    const hasLiveUrl = Boolean(resolvedUrl && /^https?:\/\//i.test(resolvedUrl));

    const crawlMode = (hasLiveUrl && isImage)
      ? "hybrid"
      : isImage
      ? "vision"
      : (fileToUse?.type === "pdf" || kind === "goal")
      ? "document"
      : "static";

    const body: Record<string, any> = {
      url: resolvedUrl,
      user_context: currentInputText.trim()
        ? currentInputText.trim()
        : (fileToUse ? `Test the ${fileToUse.name}` : `Test the ${resolvedUrl}`),
      document_title: fileToUse?.name,
      document_text: fileToUse?.type === "pdf" ? (fileToUse.text || "") : undefined,
      document_image_base64: isImage ? fileToUse.imageBase64 : undefined,
      ...aiPayload,
      custom_prompt: [getEffectiveAiRules("generator"), buildFeedbackDirectives(activeSession?.messages || [])].filter(Boolean).join("\n\n"),
      framework: "playwright",
      language: "typescript",
      fast_mode: false,
      generation_mode: "standard",
      output_mode: "cases",
      crawl_mode: crawlMode,
    };

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/generate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${res.status}`); }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      const resultBox: { value: GenerateResponse | null } = { value: null };
      let streamError: Error | null = null;
      const progress: string[] = [];
      const parser = createSseParser(({ data }: { data: string }) => {
        const ev = JSON.parse(data);
        if (ev.step === "error") { streamError = new Error(ev.message || "Generation failed"); return; }
        if (ev.message) { progress.push(ev.message); updatePlaceholder(ev.message); }
        if (ev.step === "script_complete") updatePlaceholder(`Script ${ev.completed}/${ev.total}`);
        if (ev.step === "complete" && ev.result) resultBox.value = ev.result;
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
      parser.end();
      if (streamError) throw streamError;
      const result = resultBox.value;
      if (!result) throw new Error("Generation ended without result");

      let summaryText = `Here is the test case analysis for **${result.page_title || "the page"}**:\n\n`;
      if (result.test_cases && Array.isArray(result.test_cases)) {
        const topCases = result.test_cases.slice(0, 5);
        topCases.forEach((tc: TestCase, i: number) => {
          const emoji = tc.type === 'SECURITY' ? '🔒' : tc.type === 'NEGATIVE' ? '❌' : '✅';
          summaryText += `${i + 1}. ${emoji} **${tc.name}**: ${tc.expected_result} [${tc.priority}]\n`;
        });
        if (result.test_cases.length > 5) {
          summaryText += `\n*...and ${result.test_cases.length - 5} more test cases.*\n`;
        }
      }
      summaryText += `\nThe complete test cases and automation scripts have been added to your Workspace.`;

      const finalMsg: GenMessage = {
        ...aiPlaceholder,
        content: summaryText,
        status: "complete",
        result,
      };

      setSessions((prev) => {
        const updated = prev.map((s) => {
          if (s.id !== sessionId) return s;
          const cases = withTestCaseClientIds(result!.test_cases || []);
          const updatedSession: GenSession = {
            ...s,
            updatedAt: fmtDate(),
            messages: s.messages.map((m) => (m.id === aiPlaceholder.id ? finalMsg : m)),
            artifacts: {
              cases,
              playwright: result!.scripts || [],
              gherkin: "",
              tab: "cases" as const,
              selectedIds: [],
              runStates: {},
              progress,
            },
          };
          void serverSessions.saveToServer(sessionId, updatedSession.title, updatedSession).catch(() => {});
          return updatedSession;
        });
        try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
        return updated;
      });

    } catch (err: any) {
      if (err.name === "AbortError") {
        setSessions((prev) => {
          const updated = prev.map((s) => {
            if (s.id !== sessionId) return s;
            const updatedSession: GenSession = {
              ...s,
              updatedAt: fmtDate(),
              messages: s.messages.map((m) =>
                m.id === aiPlaceholder.id ? { ...m, content: "Generation cancelled.", status: "error" as const } : m
              ),
            };
            void serverSessions.saveToServer(sessionId, updatedSession.title, updatedSession).catch(() => {});
            return updatedSession;
          });
          try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
          return updated;
        });
        return;
      }
      const errMsg = err.message || "Generation failed";
      toast.error(errMsg);
      setSessions((prev) => {
        const updated = prev.map((s) => {
          if (s.id !== sessionId) return s;
          const updatedSession: GenSession = {
            ...s,
            updatedAt: fmtDate(),
            messages: s.messages.map((m) =>
              m.id === aiPlaceholder.id ? { ...m, content: `Error: ${errMsg}`, status: "error" as const } : m
            ),
          };
          void serverSessions.saveToServer(sessionId, updatedSession.title, updatedSession).catch(() => {});
          return updatedSession;
        });
        try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
        return updated;
      });
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  // ── on-demand script generation ──────────────────────────────────────────
  const handleScriptGeneration = async (type?: "playwright" | "cypress" | "gherkin") => {
    const allCases = (activeSession?.artifacts?.cases && activeSession.artifacts.cases.length > 0)
      ? activeSession.artifacts.cases
      : (activeResult?.test_cases || []);

    if (!allCases.length) {
      toast.error("No test cases available to generate scripts.");
      return;
    }

    const fw = type === "gherkin" ? "gherkin" : (type || scriptFramework);
    if (fw === "cypress") setScriptFramework("cypress");
    else if (fw === "playwright") setScriptFramework("playwright");

    const selectedIds = activeSession?.artifacts?.selectedIds || [];
    const selectedCases = allCases.filter(tc => selectedIds.includes((tc as any).clientId || String(tc.number)));
    const hasSelection = selectedIds.length > 0 && selectedCases.length > 0;
    const targetCases = hasSelection ? selectedCases : allCases;

    const fwLabel = fw === "cypress" ? "Cypress" : fw === "gherkin" ? "Gherkin" : "Playwright";
    const langLabel = scriptLanguage === "javascript" ? "JavaScript" : "TypeScript";
    const scopeLabel = hasSelection ? `(${targetCases.length} selected)` : "(All)";
    const scopeDescription = hasSelection ? `for ${targetCases.length} selected test case(s)` : "for all test cases";

    setGeneratingScript(fw === "gherkin" ? "gherkin" : "playwright");

    const userMsg: GenMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: fw === "gherkin"
        ? `Generate Gherkin feature file ${scopeDescription}.`
        : `Generate ${fwLabel} (${langLabel}) scripts ${scopeDescription}.`,
      timestamp: fmtTime(),
    };
    const aiPlaceholder: GenMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: fw === "gherkin"
        ? `Generating Gherkin feature file ${scopeLabel}...`
        : `Generating ${fwLabel} ${langLabel} scripts ${scopeLabel}...`,
      status: "generating",
      timestamp: fmtTime(),
      retryAction: {
        type: "script",
        framework: fw as "playwright" | "cypress" | "gherkin",
      },
    };

    setSessions((prev) => {
      const updated = prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const updatedSession = { ...s, messages: [...s.messages, userMsg, aiPlaceholder], updatedAt: fmtDate() };
        void serverSessions.saveToServer(updatedSession.id, updatedSession.title, updatedSession).catch(() => {});
        return updatedSession;
      });
      try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
      return updated;
    });

    try {
      const aiPayload = getAiRequestPayload(aiProvider, aiModel);

      if (fw === "playwright" || fw === "cypress") {
        const res = await fetch("/api/generate/script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: activeResult?.url,
            user_context: activeResult?.page_title,
            test_cases: targetCases,
            framework: fw,
            language: scriptLanguage,
            ...aiPayload,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Script generation failed");

        const scripts: ScriptFile[] = (data.scripts || []).map((s: any) => ({
          file_name: s.file_name,
          script_location: s.script_location,
          content: s.content || s.code || "",
        }));
        setPlaywrightScripts(scripts);
        setWorkspaceTab("playwright");

        setSessions((prev) => {
          const updated = prev.map((s) => {
            if (s.id !== activeSessionId) return s;
            const updatedSession: GenSession = {
              ...s,
              updatedAt: fmtDate(),
              messages: s.messages.map((m) =>
                m.id === aiPlaceholder.id
                  ? { ...m, content: `${fwLabel} (${langLabel}) scripts ready! Generated ${scripts.length} script file(s) ${scopeLabel}.`, status: "complete" as const }
                  : m
              ),
              artifacts: {
                cases: [],
                gherkin: "",
                selectedIds: [],
                runStates: {},
                progress: [],
                ...s.artifacts,
                playwright: scripts,
                tab: "playwright" as const,
              },
            };
            void serverSessions.saveToServer(updatedSession.id, updatedSession.title, updatedSession).catch(() => {});
            return updatedSession;
          });
          try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
          return updated;
        });
        toast.success(`Generated ${scripts.length} ${fwLabel} script(s)!`);
      } else {
        // gherkin: build from targetCases locally (no dedicated endpoint needed)
        const lines: string[] = ["Feature: Generated Test Scenarios\n"];
        for (const tc of targetCases) {
          lines.push(`  Scenario: ${tc.name}`);
          if (tc.pre_condition) lines.push(`    Given ${tc.pre_condition}`);
          for (const step of tc.test_steps || []) lines.push(`    When ${step}`);
          if (tc.expected_result) lines.push(`    Then ${tc.expected_result}`);
          lines.push("");
        }
        const feature = lines.join("\n");
        setGherkinContent(feature);
        setWorkspaceTab("gherkin");

        setSessions((prev) => {
          const updated = prev.map((s) => {
            if (s.id !== activeSessionId) return s;
            const updatedSession: GenSession = {
              ...s,
              updatedAt: fmtDate(),
              messages: s.messages.map((m) =>
                m.id === aiPlaceholder.id
                  ? { ...m, content: `Gherkin feature file ready ${scopeLabel}!`, status: "complete" as const }
                  : m
              ),
              artifacts: {
                cases: [],
                playwright: [],
                selectedIds: [],
                runStates: {},
                progress: [],
                ...s.artifacts,
                gherkin: feature,
                tab: "gherkin" as const,
              },
            };
            void serverSessions.saveToServer(updatedSession.id, updatedSession.title, updatedSession).catch(() => {});
            return updatedSession;
          });
          try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
          return updated;
        });
        toast.success("Generated Gherkin feature file!");
      }
    } catch (err: any) {
      toast.error(err.message || "Script generation failed");
      setSessions((prev) => {
        const updated = prev.map((s) => {
          if (s.id !== activeSessionId) return s;
          const updatedSession: GenSession = {
            ...s,
            updatedAt: fmtDate(),
            messages: s.messages.map((m) =>
              m.id === aiPlaceholder.id ? { ...m, content: `Error: ${err.message}`, status: "error" as const } : m
            ),
          };
          void serverSessions.saveToServer(updatedSession.id, updatedSession.title, updatedSession).catch(() => {});
          return updatedSession;
        });
        try { localStorage.setItem(GEN_SESSIONS_STORAGE, JSON.stringify(updated)); } catch {}
        return updated;
      });
    } finally {
      setGeneratingScript(null);
    }
  };

  // ── restart / retry AI agent ───────────────────────────────────────────────
  const handleRetryAgent = async (msg: GenMessage, idx: number) => {
    if (isLoading || !!generatingScript) return;

    // Check if this was a script generation failure
    const isScript =
      msg.retryAction?.type === "script" ||
      msg.content.toLowerCase().includes("script") ||
      msg.content.toLowerCase().includes("playwright") ||
      msg.content.toLowerCase().includes("cypress") ||
      msg.content.toLowerCase().includes("gherkin");

    if (isScript) {
      let fw: "playwright" | "cypress" | "gherkin" = "playwright";
      if (msg.retryAction?.framework) fw = msg.retryAction.framework;
      else if (msg.content.toLowerCase().includes("cypress")) fw = "cypress";
      else if (msg.content.toLowerCase().includes("gherkin")) fw = "gherkin";
      toast.loading(`Restarting AI agent: ${fw} generation...`, { duration: 1500 });
      await handleScriptGeneration(fw);
      return;
    }

    // Otherwise, it was prompt / test case generation
    const textToRetry =
      msg.retryAction?.text ||
      activeSession?.messages
        .slice(0, idx)
        .reverse()
        .find((m) => m.role === "user")?.content;

    if (!textToRetry) {
      toast.error("Could not find previous prompt to retry.");
      return;
    }

    const isDisliked = msg.feedback === "dislike" || messageFeedback[msg.id] === "dislike";
    const promptToSend = isDisliked
      ? `[Instruction: The previous response was marked unsatisfactory (👎). Please regenerate a higher-quality response with complete test coverage, precise assertions, robust locators, and realistic edge cases.]\n\n${textToRetry}`
      : textToRetry;

    toast.loading(isDisliked ? "Regenerating improved AI response..." : "Restarting AI agent...", { duration: 1500 });
    await handleSend(undefined, promptToSend, msg.retryAction?.file || null);
  };

  const runSelected = async () => {
    const artifacts = activeSession?.artifacts;
    if (!artifacts) return;
    const selected = artifacts.cases.filter(tc => artifacts.selectedIds.includes(tc.clientId));
    if (!selected.length) { toast.error("Select at least one test case."); return; }
    let states = { ...artifacts.runStates };
    for (const tc of selected) {
      const script = (artifacts.playwright as ScriptFile[] || []).find(s => s.file_name === tc.file_name);
      if (!script) { states[tc.clientId] = { status: "blocked", actual: "No Playwright script" }; continue; }
      states[tc.clientId] = { status: "running" }; updateArtifacts({ runStates: states });
      try {
        const response = await fetch("/api/run-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script_content: script.content, file_name: script.file_name }) });
        const data = await response.json();
        const passed = response.ok && !data.error && data.failed === 0 && data.passed > 0;
        states = { ...states, [tc.clientId]: { status: passed ? "passed" : "failed", actual: passed ? `Passed in ${data.duration}s` : data.error || `${data.failed || 0} test(s) failed` } };
      } catch (error) { states = { ...states, [tc.clientId]: { status: "failed", actual: error instanceof Error ? error.message : "Execution failed" } }; }
      updateArtifacts({ runStates: states });
    }
  };

  const proposeRepair = async () => {
    const a = activeSession?.artifacts;
    const failed = a?.cases.find(tc => a.runStates[tc.clientId]?.status === "failed");
    const script = failed && (a?.playwright as ScriptFile[] || []).find(s => s.file_name === failed.file_name);
    if (!failed || !script) { toast.error("Run a scripted case and select a failed result first."); return; }
    const aiPayload = getAiRequestPayload(aiProvider, aiModel);
    const response = await fetch("/api/unified-chat/repair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script: script.content,
        error: a!.runStates[failed.clientId].actual,
        context: failed.name,
        ...aiPayload,
      }),
    });
    const data = await response.json();
    if (!response.ok) { toast.error(data.error || "Analysis failed"); return; }
    updateArtifacts({ repair: { caseId: failed.clientId, ...data } });
  };

  const draftJira = async () => {
    const a = activeSession?.artifacts; const failed = a?.cases.find(tc => a.runStates[tc.clientId]?.status === "failed");
    if (!failed) { toast.error("A failed test is required for a Jira draft."); return; }
    const aiPayload = getAiRequestPayload(aiProvider, aiModel);
    const response = await fetch("/api/ticket/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `Failed test: ${failed.name}. Expected: ${failed.expected_result}. Actual: ${a!.runStates[failed.clientId].actual}`,
        ...aiPayload,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.has_ticket_data) { toast.error(data.detail || "Could not create a complete Jira draft"); return; }
    updateArtifacts({ jiraDraft: data });
  };

  const confirmAction = async () => {
    const a = activeSession?.artifacts;
    if (confirmation === "repair" && a?.repair) {
      const scripts = (a.playwright as ScriptFile[] || []).map(s => a.cases.find(tc => tc.clientId === a.repair!.caseId)?.file_name === s.file_name ? { ...s, content: a.repair!.proposed_script } : s);
      setPlaywrightScripts(scripts); updateArtifacts({ playwright: scripts, repair: undefined });
    } else if (confirmation === "jira" && a?.jiraDraft) {
      const config = JSON.parse(localStorage.getItem("jira_config") || "{}");
      const isOAuth = config.auth_type === "oauth2" && !!config.access_token && !!config.cloud_id;
      if (!config.project_key || (!isOAuth && (!config.domain || !config.email || !config.token))) {
        toast.error("Jira configuration is incomplete. Please check Settings.");
        setConfirmation(null);
        return;
      }
      const response = await fetch("/api/jira/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...a.jiraDraft,
          auth_type: config.auth_type,
          access_token: config.access_token,
          cloud_id: config.cloud_id,
          jira_domain: config.domain,
          jira_email: config.email,
          jira_token: config.token,
          jira_project_key: config.project_key,
        }),
      });
      const data = await response.json(); if (!response.ok) { toast.error(data.detail || "Jira creation failed"); return; }
      updateArtifacts({ jiraIssue: { key: data.issue_key, url: data.issue_url } });
      if (data.warning) toast(data.warning, { icon: "⚠️" });
    } else if (confirmation === "aksora" && a?.jiraDraft) {
      const config = JSON.parse(localStorage.getItem("aksora_config") || "{}");
      if (!config.apiKey || !config.url) { toast.error("Configure Aksora integration in Settings first."); setConfirmation(null); return; }
      const draft = a.jiraDraft as Record<string, any>;
      const response = await fetch("/api/aksora/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        aksora_url: config.url,
        aksora_key: config.apiKey,
        title: draft.title,
        issue_type: draft.issue_type,
        description: draft.description,
        expected_result: draft.expected_result,
        actual_result: draft.actual_result,
        current_behavior: draft.current_behavior,
        acceptance_criteria: draft.acceptance_criteria,
        evidence: draft.evidence,
      }) });
      const data = await response.json(); if (!response.ok) { toast.error(data.detail || "Aksora push failed"); return; }
      updateArtifacts({ aksoraPushed: { message: data.message || "Pushed to Aksora!", url: data.url } });
      toast.success(data.message || "Pushed to Aksora!");
      if (data.warning) toast(data.warning, { icon: "⚠️" });
    }
    setConfirmation(null);
  };

  // ── download all ZIP ─────────────────────────────────────────────────────
  const handleDownloadAll = async () => {
    if (!activeResult) return;
    const { default: JSZip } = await import("jszip"); // ponytail: dynamic import to keep it out of page bundle
    const zip = new JSZip();
    if (activeResult.test_case_table) zip.file("test-cases.csv", activeResult.test_case_table);
    if (playwrightScripts) {
      const dir = zip.folder("playwright");
      for (const s of playwrightScripts) dir?.file(s.file_name, s.content);
      const configContent = generatePlaywrightConfig(activeResult.url);
      zip.file("playwright.config.ts", configContent);
    }
    if (gherkinContent) zip.file("scenarios.feature", gherkinContent);
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "test-suite.zip";
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Downloaded test-suite.zip");
  };

  // ── copy all files as text ────────────────────────────────────────────────
  const handleCopyAll = async () => {
    if (!activeResult) return;
    let content = "";
    if (activeResult.test_case_table) content += `# Test Cases\n\n${activeResult.test_case_table}\n\n`;
    if (playwrightScripts) {
      content += `# Playwright Scripts\n\n`;
      for (const s of playwrightScripts) content += `## ${s.file_name}\n\n${s.content}\n\n`;
    }
    if (gherkinContent) content += `# Gherkin\n\n${gherkinContent}\n`;
    try {
      await navigator.clipboard.writeText(content || "No files to copy.");
      toast.success("All files copied to clipboard!");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const busy = isLoading || parsingDoc || !!generatingScript;
  const filteredSessions = sessions.filter((s) =>
    !sessionSearch || s.title.toLowerCase().includes(sessionSearch.toLowerCase())
  );

  return (
    <div className="flex h-full w-full overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm font-sans">
      {/* ── LEFT PANEL: sessions list (collapsible) ── */}
      <div className={`transition-all duration-300 ease-in-out border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col shrink-0 ${
        showHistorySidebar ? "w-64" : "w-0 overflow-hidden border-r-0"
      }`}>
        {/* Header */}
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Test Chats ({sessions.length})</span>
          </div>
          <button
            type="button"
            onClick={handleNewSession}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="New Generation Chat"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        {sessions.length > 0 && (
          <div className="relative px-3 pt-2.5 pb-1 shrink-0">
            <Search className="w-3 h-3 text-slate-400 absolute left-5.5 top-1/2 translate-y-0.5 pointer-events-none" style={{ left: "1.25rem", top: "1.35rem" }} />
            <input
              type="text"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full text-xs pl-7 pr-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        )}

        {/* Session list */}
        <div className="flex-1 min-h-0 overflow-y-auto py-2 px-2 space-y-1">
          {filteredSessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-3">
              <Sparkles className="w-6 h-6 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs text-slate-400">No saved chats yet.</p>
            </div>
          )}
          {filteredSessions.map((s) => {
            const isRenaming = renamingId === s.id;
            return (
              <div
                key={s.id}
                onClick={() => !isRenaming && setActiveSessionId(s.id)}
                onDoubleClick={() => { setRenamingId(s.id); setRenameValue(s.title || ""); }}
                className={`group px-3 py-2.5 rounded-xl text-left cursor-pointer transition flex items-center justify-between ${
                  s.id === activeSessionId
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800"
                    : "hover:bg-white dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 border border-transparent"
                }`}
              >
                <div className="min-w-0 flex-1 mr-1">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => commitRename(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commitRename(s); }
                        if (e.key === "Escape") { setRenamingId(null); }
                      }}
                      className="w-full text-xs px-1.5 py-0.5 rounded border border-indigo-300 focus:outline-none bg-white dark:bg-slate-800 font-normal"
                    />
                  ) : (
                    <p className={`text-xs truncate font-medium ${s.id === activeSessionId ? "text-indigo-900 dark:text-indigo-200" : "text-slate-700 dark:text-slate-300"}`}>{s.title || "Untitled Chat"}</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-0.5">{s.updatedAt}</p>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setRenamingId(s.id); setRenameValue(s.title || ""); }}
                    className="p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-slate-400 hover:text-indigo-600 transition"
                    title="Rename"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-500 transition"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── CENTER: CHAT + COMPOSER ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* Top bar with Toggle History */}
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
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-sm">
              {activeSession ? activeSession.title : "New Test Chat"}
            </span>
          </div>

          <button
            type="button"
            onClick={handleNewSession}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition font-medium border border-slate-200 dark:border-slate-700 shrink-0"
          >
            <PlusCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Chat Feed */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin min-h-0 text-xs">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <div className="max-w-md flex flex-col items-center">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center mb-3 text-indigo-600 dark:text-indigo-400">
                    <Zap className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Test Case Agent Workspace
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                    Paste a web URL, upload a PDF / screenshot, or describe test goals below to generate test cases, Playwright scripts, and Gherkin scenarios.
                  </p>
                  <button
                    type="button"
                    onClick={() => setInputText("https://example.com/login")}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:text-indigo-600 transition shadow-xs"
                  >
                    Example: https://example.com/login
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
              <div key={msg.id} className={`group flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div className={`max-w-[90%] space-y-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  {msg.image_preview && (
                    <img src={msg.image_preview} alt="Attachment" className="max-h-32 rounded border border-slate-200/20" />
                  )}

                  <div
                    className={`p-2.5 rounded-xl ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white rounded-br-none"
                        : msg.status === "error"
                        ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                        : msg.status === "generating" && !isLoading
                        ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
                        : "bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-bl-none text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {msg.status === "generating" ? (
                      isLoading ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                          {msg.content}
                        </span>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                            <span>⚠️ Generation interrupted</span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300">
                            The generation was interrupted (browser was reloaded or closed). You can restart the AI agent below.
                          </p>
                        </div>
                      )
                    ) : (
                      <span className="whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                    )}

                    {/* Restart / Retry AI Agent Button */}
                    {msg.role === "assistant" && (msg.status === "error" || (msg.status === "generating" && !isLoading)) && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-red-200/60 dark:border-red-900/40">
                        <button
                          type="button"
                          onClick={() => handleRetryAgent(msg, idx)}
                          disabled={isLoading || !!generatingScript}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                          title="Restart hit AI Agent"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restart AI Agent</span>
                        </button>
                        <span className="text-[11px] text-red-600 dark:text-red-400 font-medium">
                          Click to restart AI agent
                        </span>
                      </div>
                    )}
                  </div>

                  {msg.status === "complete" && msg.result && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          if (msg.result) setActiveResult(msg.result);
                          setWorkspaceTab("cases");
                          setIsFullModalOpen(true);
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition flex items-center gap-1.5 shadow-sm"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>View Test Cases ({msg.result.test_cases?.length || 0})</span>
                      </button>

                      {/* Framework / Language */}
                      <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
                        <div className="flex items-center bg-white dark:bg-slate-700 rounded-md p-0.5 shadow-xs border border-slate-200 dark:border-slate-600">
                          {(["playwright", "cypress"] as const).map((fw) => (
                            <button key={fw} type="button" onClick={() => setScriptFramework(fw)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition capitalize ${scriptFramework === fw ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300 hover:text-indigo-600"}`}
                            >{fw}</button>
                          ))}
                        </div>
                        <div className="flex items-center bg-white dark:bg-slate-700 rounded-md p-0.5 shadow-xs border border-slate-200 dark:border-slate-600">
                          {(["typescript", "javascript"] as const).map((lang) => (
                            <button key={lang} type="button" onClick={() => setScriptLanguage(lang)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition ${scriptLanguage === lang ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-300 hover:text-indigo-600"}`}
                            >{lang === "typescript" ? "TS" : "JS"}</button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleScriptGeneration(scriptFramework)}
                        disabled={!!generatingScript}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1 font-medium border border-slate-200 dark:border-slate-700"
                      >
                        {generatingScript === "playwright" ? <Loader2 className="w-3 h-3 animate-spin" /> : `+ ${scriptFramework === "cypress" ? "Cypress" : "Playwright"} (${selectedCount > 0 ? `${selectedCount} selected` : "All"})`}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleScriptGeneration("gherkin")}
                        disabled={!!generatingScript || !!gherkinContent}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1 border border-slate-200 dark:border-slate-700 disabled:opacity-50"
                      >
                        {generatingScript === "gherkin" ? <Loader2 className="w-3 h-3 animate-spin" /> : `+ Gherkin (${selectedCount > 0 ? `${selectedCount} selected` : "All"})`}
                      </button>

                      {playwrightScripts && (
                        <button
                          type="button"
                          onClick={() => { setWorkspaceTab("playwright"); setIsFullModalOpen(true); }}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition flex items-center gap-1 font-medium"
                          title="View scripts in full popup"
                        >
                          <Maximize2 className="w-3 h-3" />
                          <span>View Scripts ({playwrightScripts.length})</span>
                        </button>
                      )}

                      {gherkinContent && (
                        <button
                          type="button"
                          onClick={() => { setWorkspaceTab("gherkin"); setIsFullModalOpen(true); }}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition flex items-center gap-1 font-medium"
                          title="View Gherkin in full popup"
                        >
                          <Maximize2 className="w-3 h-3" />
                          <span>View Gherkin</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Bottom row: Timestamp + Hover Action Bar (Matching Image #9) */}
                  <div className={`flex items-center gap-2 mt-1 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <span className="text-[9px] text-slate-400 block">{msg.timestamp}</span>

                    {/* Action Bar (ThumbsUp, ThumbsDown, Copy, MoreHorizontal) */}
                    <div
                      className={`relative flex items-center gap-0.5 px-1 py-0.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-xs backdrop-blur-xs transition-all duration-200 ${
                        activeMenuMsgId === msg.id || (messageFeedback[msg.id] || msg.feedback)
                          ? "opacity-100 translate-y-0"
                          : "opacity-0 group-hover:opacity-100 translate-y-0.5 group-hover:translate-y-0"
                      }`}
                    >
                      {msg.role === "assistant" && (
                        <>
                          {/* 1. Thumbs Up */}
                          <button
                            type="button"
                            onClick={() => handleToggleFeedback(msg.id, "like")}
                            className={`p-1 rounded-md transition cursor-pointer ${
                              (messageFeedback[msg.id] || msg.feedback) === "like"
                                ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60"
                                : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700"
                            }`}
                            title="Helpful response"
                          >
                            <ThumbsUp
                              className={`w-3.5 h-3.5 ${
                                (messageFeedback[msg.id] || msg.feedback) === "like" ? "fill-current" : ""
                              }`}
                            />
                          </button>

                          {/* 2. Thumbs Down */}
                          <button
                            type="button"
                            onClick={() => handleToggleFeedback(msg.id, "dislike")}
                            className={`p-1 rounded-md transition cursor-pointer ${
                              (messageFeedback[msg.id] || msg.feedback) === "dislike"
                                ? "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60"
                                : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700"
                            }`}
                            title="Needs improvement"
                          >
                            <ThumbsDown
                              className={`w-3.5 h-3.5 ${
                                (messageFeedback[msg.id] || msg.feedback) === "dislike" ? "fill-current" : ""
                              }`}
                            />
                          </button>
                        </>
                      )}

                      {/* 3. Copy Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition cursor-pointer"
                        title="Copy message text"
                      >
                        {copiedMsgId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* 4. More Options (...) */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setActiveMenuMsgId(activeMenuMsgId === msg.id ? null : msg.id)}
                          className={`p-1 rounded-md transition cursor-pointer ${
                            activeMenuMsgId === msg.id
                              ? "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                              : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700"
                          }`}
                          title="More options"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        {/* Dropdown Menu */}
                        {activeMenuMsgId === msg.id && (
                          <div
                            ref={menuRef}
                            className={`absolute bottom-full mb-1.5 z-40 w-44 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl py-1 text-xs animate-[fadeIn_0.15s_ease-out] ${
                              msg.role === "user" ? "right-0" : "left-0"
                            }`}
                          >
                            {msg.role === "assistant" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuMsgId(null);
                                  handleRetryAgent(msg, idx);
                                }}
                                className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                                <span>Regenerate Response</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuMsgId(null);
                                  setInputText(msg.content);
                                  if (textareaRef.current) textareaRef.current.focus();
                                  toast("Prompt loaded into composer", { icon: "✏️" });
                                }}
                                className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                                <span>Edit Prompt</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuMsgId(null);
                                handleCopyMessage(msg, true);
                              }}
                              className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                            >
                              <FileText className="w-3.5 h-3.5 text-slate-400" />
                              <span>Copy as Markdown</span>
                            </button>

                            {msg.result && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuMsgId(null);
                                  if (msg.result) setActiveResult(msg.result);
                                  setWorkspaceTab("cases");
                                  setIsFullModalOpen(true);
                                }}
                                className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                              >
                                <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
                                <span>View Full Spreadsheet</span>
                              </button>
                            )}

                            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuMsgId(null);
                                handleDeleteMessage(msg.id);
                              }}
                              className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              <span>Delete Message</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Dock: pinned at the bottom */}
        <div className="shrink-0 p-2.5 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
          {uploadedFile && (
            <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-white dark:bg-slate-800 rounded border border-slate-200 text-xs">
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate flex-1 text-[11px]">{uploadedFile.name}</span>
              <button type="button" onClick={() => setUploadedFile(null)} className="text-slate-400 hover:text-red-400">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <form onSubmit={handleSend} className="flex items-center gap-1.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-1.5 shadow-sm">
            <label
              className={`p-1.5 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 cursor-pointer transition shrink-0 ${busy ? "opacity-40 cursor-not-allowed" : ""}`}
              title="Attach PDF or image"
            >
              {parsingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFilePick} disabled={busy || parsingDoc} />
            </label>

            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); handleSend(); }
              }}
              placeholder="Ask AI or give target URL..."
              disabled={busy}
              className="flex-1 bg-transparent border-none text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-0 resize-none max-h-32 py-1 px-0.5"
            />

            <button
              type="submit"
              disabled={busy || (!inputText.trim() && !uploadedFile)}
              className="p-1.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition shrink-0"
              title="Send"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </form>
        </div>
      </div>


      {confirmation === "repair" && activeSession?.artifacts?.repair && (
        (() => {
          const rep = activeSession.artifacts.repair;
          const original = (activeSession.artifacts.playwright as ScriptFile[] || []).find(
            s => activeSession.artifacts?.cases?.find(tc => tc.clientId === rep.caseId)?.file_name === s.file_name
          ) || (activeSession.artifacts.playwright as ScriptFile[] || [])[0];
          return (
            <ScriptDiffViewer
              originalScript={original?.content || ""}
              proposedScript={rep.proposed_script}
              fileName={original?.file_name || "test.spec.ts"}
              rationale={rep.rationale}
              confidence={rep.confidence}
              analysis={rep.analysis as any}
              onConfirm={confirmAction}
              onCancel={() => setConfirmation(null)}
            />
          );
        })()
      )}

      {confirmation && confirmation !== "repair" && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-900/50 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <h3 id="confirm-title" className="text-lg font-bold">Confirm {confirmation === "aksora" ? "Aksora push" : "Jira creation"}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{confirmation === "aksora" ? "This pushes the ticket draft to Aksora using credentials from Settings." : "This creates a real Jira issue using credentials from Settings."}</p>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConfirmation(null)} className="btn-ghost">Cancel</button><button type="button" onClick={confirmAction} className="btn-primary">Confirm</button></div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl max-w-sm w-full mx-4 border border-slate-200 dark:border-slate-700 animate-[slideIn_0.2s_ease-out]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Delete Session?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Are you sure you want to permanently delete this session? This action cannot be undone.
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

      {/* ── 100% Fullscreen Google Sheets Spreadsheet Modal (Matching Image #6) ── */}
      <SpreadsheetModal
        isOpen={isFullModalOpen}
        onClose={() => {
          setIsFullModalOpen(false);
          setSelectedModalResult(null);
        }}
        title={(selectedModalResult || activeResult)?.page_title || (selectedModalResult || activeResult)?.url || "Saucedemo"}
        testCases={
          selectedModalResult?.test_cases && selectedModalResult.test_cases.length > 0
            ? selectedModalResult.test_cases
            : (activeSession?.artifacts?.cases && activeSession.artifacts.cases.length > 0)
            ? activeSession.artifacts.cases
            : (activeResult?.test_cases || [])
        }
        scripts={
          selectedModalResult?.scripts && selectedModalResult.scripts.length > 0
            ? selectedModalResult.scripts
            : (activeSession?.artifacts?.playwright as ScriptFile[]) || activeResult?.scripts || playwrightScripts || []
        }
        gherkinContent={gherkinContent || ""}
        baseUrl={(selectedModalResult || activeResult)?.url || ""}
        initialTab={workspaceTab === "playwright" ? "playwright" : workspaceTab === "gherkin" ? "gherkin" : "cases"}
      />
    </div>
  );
}

// ── small subcomponents ────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
        active
          ? "bg-indigo-600 text-white shadow-sm"
          : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function GherkinViewer({ content }: { content: string }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };
  const handleDownload = () => dlBlob("scenarios.feature", "text/plain", content);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-700 shrink-0">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">scenarios.feature</span>
        <div className="flex gap-2">
          <button type="button" onClick={handleCopy} className="text-xs text-slate-500 hover:text-indigo-600 transition">Copy</button>
          <button type="button" onClick={handleDownload} className="text-xs text-slate-500 hover:text-indigo-600 transition">Download</button>
        </div>
      </div>
      <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed scrollbar-thin">
        {content}
      </pre>
    </div>
  );
}

// ── tiny helpers ───────────────────────────────────────────────────────────

function fmtTime() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function fmtDate() { return new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
