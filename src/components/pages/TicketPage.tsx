"use client";

import { useState, useEffect, useRef } from "react";
import { getApiKey } from "@/lib/keys";
import toast from "react-hot-toast";
import TicketChatBubble from "@/components/TicketChatBubble";
import {
  Clock,
  X,
  PlusCircle,
  Trash2,
  Bot,
  User,
  Loader2,
  Upload,
  Send,
  Search,
  RotateCcw,
  Edit2,
} from "lucide-react";

interface TicketPageProps {
  aiProvider: string;
  aiModel: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image_preview?: string;
  image_base64?: string;
  ticket_result?: Record<string, any>;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

const TICKET_SESSIONS_STORAGE = "snaptest_ticket_sessions_v2";

const stripStars = (str?: string | null) => (str || "").replace(/\*\*/g, "");

export default function TicketPage({ aiProvider, aiModel }: TicketPageProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
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

  const [inputText, setInputText] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [pushingJira, setPushingJira] = useState(false);
  const [jiraLink, setJiraLink] = useState<{ key: string; url: string } | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [jiraConfigured, setJiraConfigured] = useState(false);
  const [pushingAksora, setPushingAksora] = useState(false);
  const [aksoraConfigured, setAksoraConfigured] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("jira_config") || "{}");
      setJiraConfigured(!!(saved.domain && saved.email && saved.token && saved.project_key));
    } catch {
      setJiraConfigured(false);
    }
    try {
      const saved = JSON.parse(localStorage.getItem("aksora_config") || "{}");
      setAksoraConfigured(!!(saved.apiKey && saved.url));
    } catch {
      setAksoraConfigured(false);
    }
  }, []);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputText]);

  // Load sessions from server API (with fallback to localStorage)
  useEffect(() => {
    const fetchServerSessions = async () => {
      try {
        const res = await fetch("/api/tickets");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items) && data.items.length > 0) {
            // Map light server summary items to session stubs
            const serverSessions: ChatSession[] = data.items.map((item: any) => ({
              id: item.id,
              title: item.title || "Untitled Chat",
              updatedAt: new Date(item.updated_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
              messages: [],
            }));
            setSessions(serverSessions);

            // Read URL hash for session ID jump
            const hashSessionId = window.location.hash.replace("#", "");
            const targetId = hashSessionId && serverSessions.find(s => s.id === hashSessionId) 
              ? hashSessionId 
              : null; // Always blank start unless coming from a deep link
            setActiveSessionId(targetId);

            // Fetch detail for active session only if jumped via hash
            if (targetId) {
              const detailRes = await fetch(`/api/tickets/${targetId}`);
              if (detailRes.ok) {
                const detail = await detailRes.json();
                setSessions((prev) =>
                  prev.map((s) => (s.id === detail.id ? { ...s, messages: detail.messages || [] } : s))
                );
              }
            }
            return;
          }
        }
      } catch {}

      // Fallback to localStorage if unauthenticated or offline
      try {
        const saved = localStorage.getItem(TICKET_SESSIONS_STORAGE);
        if (saved) {
          const parsed: ChatSession[] = JSON.parse(saved);
          setSessions(parsed);
          const hashSessionId = window.location.hash.replace("#", "");
          const targetId = hashSessionId && parsed.find(s => s.id === hashSessionId) ? hashSessionId : null;
          setActiveSessionId(targetId);
        }
      } catch {}
    };

    fetchServerSessions();
  }, []);

  // Fetch full messages when switching active session if messages empty
  useEffect(() => {
    if (!activeSessionId) return;
    const target = sessions.find((s) => s.id === activeSessionId);
    if (target && target.messages.length === 0) {
      fetch(`/api/tickets/${activeSessionId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((detail) => {
          if (detail) {
            setSessions((prev) =>
              prev.map((s) => (s.id === detail.id ? { ...s, messages: detail.messages || [] } : s))
            );
          }
        })
        .catch(() => {});
    }
  }, [activeSessionId]);

  const saveSessionsToStorage = (updatedSessions: ChatSession[], targetSession?: ChatSession) => {
    let reordered = [...updatedSessions];
    if (targetSession) {
      reordered = [
        targetSession,
        ...reordered.filter(s => s.id !== targetSession.id)
      ];
    }
    setSessions(reordered);
    try {
      localStorage.setItem(TICKET_SESSIONS_STORAGE, JSON.stringify(reordered));
    } catch {}

    // Sync active session to server asynchronously
    if (targetSession) {
      const cleanMessages = (targetSession.messages || []).map((m) => {
        const copy = { ...m };
        delete copy.image_base64;
        return copy;
      });

      fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetSession.id,
          title: targetSession.title,
          messages: cleanMessages,
        }),
      }).catch(() => {});
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;
  const messages = activeSession ? activeSession.messages : [];

  // Scroll to bottom on new messages
  useEffect(() => {
    // Delay slightly to ensure React has flushed the DOM
    const timer = setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, isLoading, activeSessionId]);

  const handleCreateNewSession = () => {
    const newId = crypto.randomUUID();
    const newSession: ChatSession = {
      id: newId,
      title: "New Ticket Chat",
      updatedAt: new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      messages: [],
    };

    const nextSessions = [newSession, ...sessions];
    saveSessionsToStorage(nextSessions, newSession);
    setActiveSessionId(newId);
    setInputText("");
    setImageBase64(null);
    setImagePreview(null);
    toast.success("New ticket chat session started!");
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (!deleteConfirmId) return;
    const nextSessions = sessions.filter((s) => s.id !== deleteConfirmId);
    saveSessionsToStorage(nextSessions);
    fetch(`/api/tickets/${deleteConfirmId}`, { method: "DELETE" }).catch(() => {});

    if (activeSessionId === deleteConfirmId) {
      setActiveSessionId(nextSessions[0]?.id || null);
    }
    toast.success("Session deleted");
    setDeleteConfirmId(null);
  };

  const commitRename = (session: ChatSession) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed || trimmed === session.title) return;
    const nextSessions = sessions.map((s) => (s.id === session.id ? { ...s, title: trimmed } : s));
    saveSessionsToStorage(nextSessions, { ...session, title: trimmed });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image size must be less than 10MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImagePreview(dataUrl);
      const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imgItem = items.find(i => i.type.startsWith('image/'));
    if (!imgItem) return;
    const file = imgItem.getAsFile();
    if (file) {
      e.preventDefault();
      if (file.size > 15 * 1024 * 1024) { toast.error("Image too large (max 15MB)"); return; }
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setImagePreview(dataUrl);
        const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");
        setImageBase64(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
      toast.success("Copied ticket to clipboard!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handlePushToJira = async (result: Record<string, any>) => {
    const savedJira = localStorage.getItem("jira_config");
    if (!savedJira) {
      toast.error("Please configure Jira integration in Settings first.");
      return;
    }
    let config: any = {};
    try { config = JSON.parse(savedJira); } catch {}

    if (!config.domain || !config.email || !config.token || !config.project_key) {
      toast.error("Jira configuration is incomplete. Please check Settings.");
      return;
    }

    setPushingJira(true);
    setJiraLink(null);

    try {
      const res = await fetch("/api/jira/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...result,
          jira_domain: config.domain,
          jira_email: config.email,
          jira_token: config.token,
          jira_project_key: config.project_key,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create Jira issue");

      setJiraLink({ key: data.issue_key, url: data.issue_url });
      toast.success(`Created Jira issue ${data.issue_key}!`);

      // Opsi 3: Simpan jira_key & jira_url ke ticket_result pesan yang dipush
      if (activeSessionId) {
        const nextSessions = sessions.map(s => {
          if (s.id !== activeSessionId) return s;
          const nextMessages = s.messages.map(m => {
            if (m.role !== "assistant" || !m.ticket_result || m.ticket_result !== result) return m;
            return { ...m, ticket_result: { ...m.ticket_result, jira_key: data.issue_key, jira_url: data.issue_url } };
          });
          return { ...s, messages: nextMessages };
        });
        const updatedTarget = nextSessions.find(s => s.id === activeSessionId);
        saveSessionsToStorage(nextSessions, updatedTarget);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to push to Jira");
    } finally {
      setPushingJira(false);
    }
  };

  const handlePushToAksora = async (result: Record<string, any>) => {
    const savedAksora = localStorage.getItem("aksora_config");
    if (!savedAksora) {
      toast.error("Please configure Aksora integration in Settings first.");
      return;
    }
    let config: any = {};
    try { config = JSON.parse(savedAksora); } catch {}

    if (!config.apiKey || !config.url) {
      toast.error("Aksora configuration is incomplete. Please check Settings.");
      return;
    }

    setPushingAksora(true);

    try {
      const res = await fetch("/api/aksora/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aksora_url: config.url,
          aksora_key: config.apiKey,
          title: result.title,
          issue_type: result.issue_type,
          description: result.description,
          expected_result: result.expected_result,
          actual_result: result.actual_result,
          current_behavior: result.current_behavior,
          acceptance_criteria: result.acceptance_criteria,
          evidence: result.evidence,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create Aksora record");

      toast.success(data.message || "Pushed to Aksora!");

      if (activeSessionId) {
        const nextSessions = sessions.map(s => {
          if (s.id !== activeSessionId) return s;
          const nextMessages = s.messages.map(m => {
            if (m.role !== "assistant" || !m.ticket_result || m.ticket_result !== result) return m;
            return { ...m, ticket_result: { ...m.ticket_result, aksora_pushed: true, aksora_url: data.url || undefined } };
          });
          return { ...s, messages: nextMessages };
        });
        const updatedTarget = nextSessions.find(s => s.id === activeSessionId);
        saveSessionsToStorage(nextSessions, updatedTarget);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to push to Aksora");
    } finally {
      setPushingAksora(false);
    }
  };

  // Sends `messagesForRequest` (full conversation so far) to the agent and appends the reply
  // to the session. Shared by handleSendMessage (new user turn) and handleRegenerate (retry last turn).
  const requestAssistantReply = async (
    currentSessions: ChatSession[],
    currentSessionId: string,
    messagesForRequest: ChatMessage[]
  ) => {
    try {
      const routerPublic = aiProvider === "9router-public"
        ? JSON.parse(localStorage.getItem("9router_public") || "{}")
        : {};

      const res = await fetch("/api/ticket/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesForRequest.map(m => {
            const item: any = { role: m.role, content: m.content };
            if (m.image_base64) item.image_base64 = m.image_base64;
            return item;
          }),
          ai_provider: aiProvider,
          ai_model: aiModel,
          api_key: getApiKey(aiProvider),
          nine_router_public_url: routerPublic.url || "",
          nine_router_public_key: routerPublic.key || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to generate ticket");

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.assistant_reply || "Here is the updated Jira ticket.",
        ticket_result: data,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      let updatedTargetSession: ChatSession | undefined;
      const finalSessions = currentSessions.map(s => {
        if (s.id === currentSessionId) {
          // Keep initial title once set, don't overwrite on subsequent turns
          const existingTitle = (s.title && s.title !== "New Ticket Chat" && s.title !== "Untitled Chat") ? s.title : null;
          const smartTitle = existingTitle || data.chat_title || data.title || s.title;
          const updated = {
            ...s,
            title: smartTitle,
            messages: [...messagesForRequest, assistantMessage],
          };
          updatedTargetSession = updated;
          return updated;
        }
        return s;
      });

      saveSessionsToStorage(finalSessions, updatedTargetSession);
    } catch (err: any) {
      const errMsg = err.message || "Something went wrong";
      toast.error(errMsg);

      // Append assistant error message so user can see it in chat & retry easily
      const errMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `❌ Error: ${errMsg}. Please check your AI provider/key settings and try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const finalSessions = currentSessions.map(s => {
        if (s.id === currentSessionId) {
          return {
            ...s,
            messages: [...messagesForRequest, errMessage],
          };
        }
        return s;
      });

      saveSessionsToStorage(finalSessions);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !imageBase64) return;

    if (!aiProvider || !aiModel) {
      toast.error("Please select your AI Provider and Model from 'AI Settings' (top-right) first.");
      return;
    }

    // Ensure active session
    let currentSessionId = activeSessionId;
    let currentSessions = [...sessions];

    if (!currentSessionId || !currentSessions.find(s => s.id === currentSessionId)) {
      const newId = crypto.randomUUID();
      const newSession: ChatSession = {
        id: newId,
        title: inputText.trim().substring(0, 30) || "Screenshot Ticket",
        updatedAt: new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        messages: [],
      };
      currentSessions = [newSession, ...currentSessions];
      currentSessionId = newId;
      setActiveSessionId(newId);
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputText.trim(),
      image_preview: imagePreview || undefined,
      image_base64: imageBase64 || undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const targetSession = currentSessions.find(s => s.id === currentSessionId)!;
    const updatedMessages = [...targetSession.messages, userMessage];

    if (targetSession.messages.length === 0) {
      // Title is set ONCE from the very first user message — never changed again
      targetSession.title = inputText.trim().substring(0, 40) || "Screenshot Ticket";
    }

    targetSession.messages = updatedMessages;
    targetSession.updatedAt = new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

    saveSessionsToStorage(currentSessions, { ...targetSession });

    setInputText("");
    setImageBase64(null);
    setImagePreview(null);
    setIsLoading(true);
    try {
      await requestAssistantReply(currentSessions, currentSessionId, updatedMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTicket = (messageId: string, updates: Record<string, any>) => {
    if (!activeSession || !activeSessionId) return;
    const nextSessions = sessions.map((s) => {
      if (s.id !== activeSessionId) return s;
      const nextMessages = s.messages.map((m) => {
        if (m.id !== messageId || !m.ticket_result) return m;
        const tr = { ...m.ticket_result, ...updates };
        // Rebuild the copyable markdown from the edited fields, same shape as the server builds it.
        const lines: string[] = [];
        if (tr.issue_type) lines.push(`**Issue Type:** ${tr.issue_type}`);
        if (tr.title) lines.push(`**Title:** ${tr.title}`);
        if (tr.description) lines.push(`\n**Description:**\n${tr.description}`);
        if (tr.current_behavior && tr.issue_type === "Improvement") lines.push(`\n**Current Behavior:**\n${tr.current_behavior}`);
        if (tr.expected_result) lines.push(`\n**${tr.issue_type === "Improvement" ? "Expected / Proposed Result" : "Expected Result"}:**\n${tr.expected_result}`);
        if (tr.actual_result && tr.issue_type === "Bug") lines.push(`\n**Actual Result:**\n${tr.actual_result}`);
        if (tr.acceptance_criteria?.length && tr.issue_type === "New Feature") {
          lines.push(`\n**Acceptance Criteria:**\n${tr.acceptance_criteria.map((c: string) => `- [ ] ${c}`).join('\n')}`);
        }
        if (tr.evidence) lines.push(`\n**Evidence:**\n${tr.evidence}`);
        tr.markdown = lines.join('\n');
        return { ...m, ticket_result: tr };
      });
      return { ...s, messages: nextMessages };
    });
    const updatedTarget = nextSessions.find((s) => s.id === activeSessionId);
    saveSessionsToStorage(nextSessions, updatedTarget);
  };

  const handleRegenerate = async () => {
    if (!activeSession || !activeSessionId || isLoading || isRegenerating) return;
    const msgs = activeSession.messages;
    if (msgs.length === 0 || msgs[msgs.length - 1].role !== "assistant") return;

    // Drop the last assistant reply, resend everything up to (and including) the last user turn
    const messagesUpToUser = msgs.slice(0, -1);
    const trimmedSessions = sessions.map(s =>
      s.id === activeSessionId ? { ...s, messages: messagesUpToUser } : s
    );
    setSessions(trimmedSessions);

    setIsRegenerating(true);
    try {
      await requestAssistantReply(trimmedSessions, activeSessionId, messagesUpToUser);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)]">
      {/* Sessions History Rail — narrow strip; click to open the drawer, click outside to close */}
      <div ref={historyRef} className="relative shrink-0 h-full z-20">
        <div
          onClick={() => setHistoryOpen((o) => !o)}
          className="w-12 h-full border-r border-slate-200 dark:border-slate-700 flex flex-col items-center py-4 gap-2 bg-white dark:bg-slate-800 cursor-pointer"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleCreateNewSession(); }}
            className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition"
            title="New Ticket Chat"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
          <div className="w-6 h-px bg-slate-100 dark:bg-slate-700 my-1" />
          <div className="flex flex-col items-center gap-1 text-slate-400" title={`${sessions.length} saved chats`}>
            <Clock className="w-4 h-4" />
            <span className="text-[10px] font-semibold">{sessions.length}</span>
          </div>
        </div>

        <div className={`absolute left-0 top-0 w-[280px] h-full border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl p-4 flex flex-col overflow-hidden transition-all duration-150 ${historyOpen ? "opacity-100 visible translate-x-0" : "opacity-0 invisible -translate-x-1 pointer-events-none"}`}>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Clock className="w-3.5 h-3.5" />
            Chat History ({sessions.length})
          </h3>

          <button
            type="button"
            onClick={handleCreateNewSession}
            className="w-full btn-primary text-xs flex items-center justify-center gap-2 py-2 mb-3"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Ticket Chat</span>
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
            {sessions.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No saved ticket chats yet.</p>
            ) : (
              (() => {
                const filtered = sessions.filter((s) =>
                  (s.title || "Untitled Chat").toLowerCase().includes(sessionSearch.trim().toLowerCase())
                );
                if (filtered.length === 0) {
                  return <p className="text-xs text-slate-400 text-center py-6">No chats match "{sessionSearch}".</p>;
                }
                return filtered.map((s) => {
                const isActive = s.id === activeSessionId;
                const isRenaming = renamingId === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => !isRenaming && setActiveSessionId(s.id)}
                    onDoubleClick={() => { setRenamingId(s.id); setRenameValue(s.title || ""); }}
                    className={`group p-2.5 rounded-xl text-left cursor-pointer transition flex items-center justify-between ${
                      isActive
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
                            if (e.key === "Enter") { e.preventDefault(); commitRename(s); }
                            if (e.key === "Escape") { setRenamingId(null); }
                          }}
                          className="w-full text-xs px-1.5 py-0.5 rounded border border-indigo-300 focus:outline-none bg-white dark:bg-slate-800"
                        />
                      ) : (
                        <p className="text-xs truncate">{s.title || "Untitled Chat"}</p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5">{s.updatedAt}</p>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setRenamingId(s.id); setRenameValue(s.title || ""); }}
                        className="p-1 rounded hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition"
                        title="Rename chat"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSession(s.id, e)}
                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition"
                        title="Delete chat"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
                });
              })()
            )}
          </div>
        </div>
      </div>

      {/* Main Ticket Chat — single column, scrolls independently */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Chat Messages Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[45vh] text-center p-4">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mb-3">
                <Bot className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                Start a Ticket Conversation
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Describe a bug, paste a link, or drop a screenshot. AI auto-detects issue type and builds your Jira ticket.
              </p>
              <button
                type="button"
                onClick={() => setInputText("https://example.com/checkout bug: checkout page fails to apply discount code")}
                className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 hover:border-indigo-300 transition"
              >
                💡 Example: Checkout Discount Bug
              </button>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div className={`max-w-[85%] space-y-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <TicketChatBubble
                    msg={
                      msg.role === "assistant" && msg.ticket_result
                        ? { ...msg, image_base64: undefined }
                        : msg
                    }
                    onPushToJira={handlePushToJira}
                    jiraConfigured={jiraConfigured}
                    onPushToAksora={handlePushToAksora}
                    aksoraConfigured={aksoraConfigured}
                    onUpdateTicket={handleUpdateTicket}
                  />
                  {msg.role === "assistant" && idx === messages.length - 1 && !isLoading && (
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      disabled={isRegenerating}
                      className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-indigo-600 transition disabled:opacity-50"
                    >
                      <RotateCcw className={`w-3 h-3 ${isRegenerating ? "animate-spin" : ""}`} />
                      <span>{isRegenerating ? "Regenerating..." : "Regenerate reply"}</span>
                    </button>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex gap-2 justify-start items-center">
              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>AI Agent is analyzing context &amp; preparing reply...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Dock — pinned above draft */}
        <div className="shrink-0 px-3 pb-3 pt-2">
          <div className="bg-white dark:bg-slate-800/95 backdrop-blur-md rounded-3xl border border-slate-200 dark:border-slate-700 p-2.5">
            {imagePreview && (
              <div className="mb-2 relative inline-block border rounded-xl overflow-hidden bg-slate-100 max-w-xs">
                <img src={imagePreview} alt="Screenshot preview" className="max-h-28 object-contain" />
                <button
                  type="button"
                  onClick={() => { setImagePreview(null); setImageBase64(null); }}
                  className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/70 text-white hover:bg-slate-900 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <label className="p-2 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 cursor-pointer transition shrink-0" title="Attach screenshot">
                <Upload className="w-5 h-5" />
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              </label>

              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="What is the issue? (Attach screenshot, paste link, or describe the bug)"
                className="flex-1 bg-transparent border-none text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-0 resize-none max-h-44 leading-relaxed py-1.5 px-1"
                disabled={isLoading}
              />

              <button
                type="submit"
                disabled={isLoading || (!inputText.trim() && !imageBase64)}
                className="p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
                title="Send message (Enter)"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-2">
            AI Agent can make mistakes. Check important info.
          </p>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl max-w-sm w-full mx-4 border border-slate-200 dark:border-slate-700 animate-[slideIn_0.2s_ease-out]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Delete Chat Session?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Are you sure you want to permanently delete this ticket chat? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 shadow-sm shadow-red-600/20 transition"
              >
                Delete Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
