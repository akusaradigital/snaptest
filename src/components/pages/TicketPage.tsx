"use client";

import { useState, useEffect, useRef } from "react";
import { get9RouterPublicConfig, getAiRequestPayload, getApiKey } from "@/lib/keys";
import toast from "react-hot-toast";
import TicketChatBubble from "@/components/TicketChatBubble";
import {
  Clock,
  X,
  PlusCircle,
  Trash2,
  PanelLeft,
  Ticket,
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

const toTicketResult = (data: Record<string, any>) => data.ticket_data || {
  has_ticket_data: data.has_ticket_data,
  fields: data.fields,
  issue_type: data.issue_type,
  title: data.title,
  description: data.description,
  current_behavior: data.current_behavior,
  expected_result: data.expected_result,
  actual_result: data.actual_result,
  acceptance_criteria: data.acceptance_criteria,
  evidence: data.evidence,
  markdown: data.markdown,
};

export default function TicketPage({ aiProvider, aiModel }: TicketPageProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHistorySidebar, setShowHistorySidebar] = useState(true);

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
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("jira_config") || "{}");
      const isConnected = !!(
        (saved.access_token || (saved.domain && saved.email && saved.token)) &&
        saved.project_key
      );
      setJiraConfigured(isConnected);
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
        const saved = localStorage.getItem(TICKET_SESSIONS_STORAGE);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSessions(parsed);
            const hashSessionId = window.location.hash.replace("#", "");
            const targetId = hashSessionId && parsed.find((s: any) => s.id === hashSessionId) ? hashSessionId : parsed[0].id;
            setActiveSessionId(targetId);
          }
        }
      } catch {}

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
              : serverSessions[0].id;
            
            setActiveSessionId(targetId);
            // Fetch full message details for the selected session
            loadFullSession(targetId);
            return;
          }
        }
      } catch (err) {
        console.warn("Failed to load ticket sessions from server, using local fallback", err);
      }

      // LocalStorage fallback
      try {
        const saved = localStorage.getItem(TICKET_SESSIONS_STORAGE);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSessions(parsed);
            const hashSessionId = window.location.hash.replace("#", "");
            const targetId = hashSessionId && parsed.find((s: any) => s.id === hashSessionId)
              ? hashSessionId
              : parsed[0].id;
            setActiveSessionId(targetId);
          }
        }
      } catch {}
    };

    fetchServerSessions();
  }, []);

  const loadFullSession = async (id: string) => {
    try {
      const res = await fetch(`/api/tickets/${id}`);
      if (res.ok) {
        const data = await res.json();
        // data directly returns the record object, not data.session
        if (data && data.id) {
          setSessions(prev => prev.map(s => s.id === id ? {
            id: data.id,
            title: data.title,
            updatedAt: new Date(data.updated_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
            messages: data.messages || [],
          } : s));
        }
      }
    } catch (err) {
      console.warn(`Failed to load full session ${id}`, err);
    }
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    window.location.hash = id;
    const s = sessions.find(s => s.id === id);
    if (!s || s.messages.length === 0) {
      loadFullSession(id);
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession ? activeSession.messages : [];

  // Identify latest ticket result msg for docked canvas
  const latestTicketMsg = [...messages].reverse().find(
    (m) => m.role === "assistant" && m.ticket_result && m.ticket_result.has_ticket_data !== false
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const saveSessionsToStorage = (updated: ChatSession[], targetSessionToSync?: ChatSession) => {
    setSessions(updated);
    try {
      localStorage.setItem(TICKET_SESSIONS_STORAGE, JSON.stringify(updated));
      sessionStorage.removeItem("snaptest_dashboard_cache");
    } catch {}

    // Async sync to server API
    if (targetSessionToSync) {
      fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetSessionToSync.id,
          title: targetSessionToSync.title,
          messages: targetSessionToSync.messages,
        }),
      }).catch((err) => console.warn("Failed to sync ticket session to server:", err));
    }
  };

  const handleCreateNewSession = () => {
    const newSession: ChatSession = {
      id: "sess_" + Date.now(),
      title: "New Ticket Chat",
      updatedAt: new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      messages: [],
    };
    const updated = [newSession, ...sessions];
    setActiveSessionId(newSession.id);
    window.location.hash = newSession.id;
    saveSessionsToStorage(updated, newSession);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);

    const updated = sessions.filter((s) => s.id !== id);
    setSessions(updated);
    try {
      localStorage.setItem(TICKET_SESSIONS_STORAGE, JSON.stringify(updated));
      sessionStorage.removeItem("snaptest_dashboard_cache");
    } catch {}

    if (activeSessionId === id) {
      const nextId = updated.length > 0 ? updated[0].id : null;
      setActiveSessionId(nextId);
      if (nextId) {
        window.location.hash = nextId;
        loadFullSession(nextId);
      } else {
        window.location.hash = "";
      }
    }

    // Call server DELETE
    try {
      await fetch(`/api/tickets/${id}`, { method: "DELETE" });
      toast.success("Chat session deleted");
    } catch (err) {
      console.warn("Failed to delete session on server", err);
    }
  };

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentTitle);
  };

  const handleSaveRename = (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    const updated = sessions.map(s => s.id === id ? { ...s, title: trimmed } : s);
    const target = updated.find(s => s.id === id);
    saveSessionsToStorage(updated, target);
    setRenamingId(null);
    toast.success("Renamed chat");
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Screenshot too large (max 5MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setImageBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (!file) continue;

        if (file.size > 5 * 1024 * 1024) {
          toast.error("Pasted image too large (max 5MB)");
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          setImagePreview(result);
          setImageBase64(result);
          toast.success("Screenshot attached from clipboard!");
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  const handleUpdateTicket = (messageId: string, updates: Record<string, any>) => {
    if (!activeSessionId) return;

    const nextSessions = sessions.map((s) => {
      if (s.id !== activeSessionId) return s;

      const nextMessages = s.messages.map((m) => {
        if (m.id !== messageId) return m;

        const currentResult = m.ticket_result || {};
        const mergedResult = {
          ...currentResult,
          ...updates,
        };

        const markdown = `### ${mergedResult.title || ""}
**Type:** ${mergedResult.issue_type || "Bug"}
**Severity:** ${mergedResult.severity || "Medium"}

**Description:**
${mergedResult.description || ""}

${mergedResult.steps_to_reproduce?.length ? `**Steps to Reproduce:**\n${mergedResult.steps_to_reproduce.map((step: string, i: number) => `${i + 1}. ${step}`).join("\n")}\n` : ""}
**Current Behavior:**
${mergedResult.current_behavior || ""}

**Expected Result:**
${mergedResult.expected_result || ""}

**Actual Result:**
${mergedResult.actual_result || ""}

${mergedResult.acceptance_criteria?.length ? `**Acceptance Criteria:**\n${mergedResult.acceptance_criteria.map((c: string) => `- ${c}`).join("\n")}\n` : ""}
${mergedResult.evidence ? `**Evidence:**\n${mergedResult.evidence}` : ""}`;

        mergedResult.markdown = markdown;

        return {
          ...m,
          ticket_result: mergedResult,
        };
      });

      return { ...s, messages: nextMessages };
    });

    const updatedTarget = nextSessions.find((s) => s.id === activeSessionId);
    saveSessionsToStorage(nextSessions, updatedTarget);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
      toast.success("Copied full ticket to clipboard!");
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

    const isOAuth = config.auth_type === "oauth2" && !!config.access_token && !!config.cloud_id;
    if (!config.project_key || (!isOAuth && (!config.domain || !config.email || !config.token))) {
      toast.error("Jira configuration is incomplete. Please check Settings.");
      return;
    }

    setPushingJira(true);
    setJiraLink(null);

    try {
      if (isOAuth && config.expires_at && Date.now() >= Number(config.expires_at) - 60_000) {
        const refreshRes = await fetch("/api/jira/oauth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: config.refresh_token }),
        });
        const refreshed = await refreshRes.json();
        if (!refreshRes.ok) throw new Error(refreshed.detail || "Jira authorization expired");
        config = { ...config, ...refreshed };
        localStorage.setItem("jira_config", JSON.stringify(config));
      }

      const res = await fetch("/api/jira/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...result,
          auth_type: config.auth_type,
          access_token: config.access_token,
          cloud_id: config.cloud_id,
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
    messagesForRequest: ChatMessage[],
    apiKey: string
  ) => {
    setIsLoading(true);
    try {
      const formattedHistory = messagesForRequest.map((m) => ({
        role: m.role,
        content: m.content,
        image_base64: m.image_base64,
      }));

      let customRules = "";
      try {
        const snapSettings = JSON.parse(localStorage.getItem("snaptest_settings") || "{}");
        customRules = snapSettings.ticketCustomPrompt || "";
      } catch {}

      const aiPayload = getAiRequestPayload(aiProvider, aiModel);
      const res = await fetch("/api/ticket/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: formattedHistory,
          custom_rules: customRules,
          ...aiPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to generate ticket");

      const ticketResult = toTicketResult(data);
      const isActualTicket = Boolean(
        ticketResult.title ||
        ticketResult.description ||
        ticketResult.expected_result ||
        ticketResult.actual_result ||
        ticketResult.has_ticket_data === true
      );

      const botMsg: ChatMessage = {
        id: "msg_" + Date.now(),
        role: "assistant",
        content: data.assistant_reply || "Here is the updated Jira ticket.",
        ticket_result: isActualTicket ? ticketResult : undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      const finalSessions = currentSessions.map((s) => {
        if (s.id !== currentSessionId) return s;
        // Auto-generate title from first ticket draft or input
        let newTitle = s.title;
        if (s.title === "New Ticket Chat" && ticketResult.title) {
          newTitle = ticketResult.title.substring(0, 30);
        }
        return {
          ...s,
          title: newTitle,
          updatedAt: new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
          messages: [...messagesForRequest, botMsg],
        };
      });

      const target = finalSessions.find((s) => s.id === currentSessionId);
      saveSessionsToStorage(finalSessions, target);
    } catch (err: any) {
      toast.error(err.message || "Failed to communicate with AI Agent");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !imageBase64) return;

    const publicCfg = aiProvider === "9router-public" ? get9RouterPublicConfig() : null;
    let apiKey = getApiKey(aiProvider);
    if (aiProvider === "9router-public" && !publicCfg?.url) {
      toast.error("Please connect 9Router Public URL in Settings first");
      return;
    }
    if (!apiKey && aiProvider !== "9router") {
      toast.error(`Please set an API key for ${aiProvider} in Settings`);
      return;
    }

    // Determine current session
    let currentSessionId = activeSessionId;
    let currentSessions = [...sessions];

    if (!currentSessionId) {
      const newSession: ChatSession = {
        id: "sess_" + Date.now(),
        title: inputText.trim() ? inputText.trim().substring(0, 24) : "Ticket Inspection",
        updatedAt: new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        messages: [],
      };
      currentSessions = [newSession, ...currentSessions];
      currentSessionId = newSession.id;
      setActiveSessionId(newSession.id);
      window.location.hash = newSession.id;
    }

    const userMsg: ChatMessage = {
      id: "msg_" + Date.now(),
      role: "user",
      content: inputText.trim(),
      image_preview: imagePreview || undefined,
      image_base64: imageBase64 || undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    // Append user message immediately
    const sessionMessages = (currentSessions.find((s) => s.id === currentSessionId)?.messages || []);
    const messagesWithUser = [...sessionMessages, userMsg];

    const updatedSessions = currentSessions.map((s) => {
      if (s.id !== currentSessionId) return s;
      return {
        ...s,
        updatedAt: new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        messages: messagesWithUser,
      };
    });

    const targetSession = updatedSessions.find((s) => s.id === currentSessionId);
    saveSessionsToStorage(updatedSessions, targetSession);

    // Reset input dock
    setInputText("");
    setImageBase64(null);
    setImagePreview(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    await requestAssistantReply(updatedSessions, currentSessionId, messagesWithUser, apiKey || "");
  };

  const handleRegenerate = async () => {
    if (!activeSessionId || isLoading || isRegenerating) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session || session.messages.length === 0) return;

    // Drop the trailing assistant reply (and any dangling assistant replies) to get back to user turn
    const msgs = session.messages;
    const lastUserIdx = msgs.map((m) => m.role).lastIndexOf("user");
    if (lastUserIdx === -1) {
      toast.error("No user message to regenerate from");
      return;
    }

    const truncatedMessages = msgs.slice(0, lastUserIdx + 1);
    const publicCfg = aiProvider === "9router-public" ? get9RouterPublicConfig() : null;
    let apiKey = getApiKey(aiProvider);
    if (aiProvider === "9router-public" && !publicCfg?.url) {
      toast.error("Please connect 9Router Public URL in Settings first");
      return;
    }
    if (!apiKey && aiProvider !== "9router") {
      toast.error(`Please set an API key for ${aiProvider} in Settings`);
      return;
    }

    setIsRegenerating(true);
    const updatedSessions = sessions.map((s) =>
      s.id === activeSessionId ? { ...s, messages: truncatedMessages } : s
    );
    const target = updatedSessions.find((s) => s.id === activeSessionId);
    saveSessionsToStorage(updatedSessions, target);

    try {
      await requestAssistantReply(updatedSessions, activeSessionId, truncatedMessages, apiKey || "");
      toast.success("Regenerated reply");
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] w-full overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm font-sans">
      {/* Sessions / History Sidebar — Collapsible */}
      <div className={`transition-all duration-300 ease-in-out border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col shrink-0 ${
        showHistorySidebar ? "w-64" : "w-0 overflow-hidden border-r-0"
      }`}>
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Ticket Chats
          </span>
          <button
            type="button"
            onClick={handleCreateNewSession}
            className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition"
            title="New Chat"
          >
            <PlusCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Type Filter */}
        <div className="p-2 border-b border-slate-200/60 dark:border-slate-800/60 space-y-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-8 pr-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px] font-semibold">
            {[
              { id: "all", label: "All" },
              { id: "bug", label: "Bug" },
              { id: "improvement", label: "Improvement" },
              { id: "feature", label: "Feature" }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTypeFilter(f.id)}
                className={`px-2 py-0.5 rounded-md transition whitespace-nowrap ${
                  typeFilter === f.id
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No previous chats</p>
          ) : (
            (() => {
              const filtered = sessions.filter(s => {
                const matchSearch = !sessionSearch ||
                  s.title.toLowerCase().includes(sessionSearch.toLowerCase()) ||
                  s.messages.some(m => m.content.toLowerCase().includes(sessionSearch.toLowerCase()));
                if (!matchSearch) return false;
                if (typeFilter === "all") return true;
                return s.messages.some(m => {
                  const issueType = (m.ticket_result?.issue_type || "").toLowerCase();
                  if (typeFilter === "bug") return issueType === "bug";
                  if (typeFilter === "improvement") return issueType === "improvement";
                  if (typeFilter === "feature") return issueType.includes("feature");
                  return true;
                });
              });
              if (filtered.length === 0) {
                return <p className="text-xs text-slate-400 text-center py-6">No matching chats</p>;
              }
              return filtered.map((s) => {
                const isSelected = s.id === activeSessionId;
                const isRenaming = renamingId === s.id;

                return (
                  <div
                    key={s.id}
                    onClick={() => handleSelectSession(s.id)}
                    className={`group relative p-2.5 rounded-xl cursor-pointer transition flex items-center justify-between text-xs ${
                      isSelected
                        ? "bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 font-semibold"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      {isRenaming ? (
                        <form onSubmit={(e) => handleSaveRename(s.id, e)} onClick={(e) => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => handleSaveRename(s.id)}
                            className="w-full px-1.5 py-0.5 rounded border border-indigo-500 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                          />
                        </form>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="truncate font-medium">{s.title}</p>
                          </div>
                          <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400">
                            <span>{s.updatedAt}</span>
                            {(() => {
                              const lastTicket = [...s.messages].reverse().find(m => m.ticket_result?.issue_type);
                              const type = lastTicket?.ticket_result?.issue_type;
                              if (!type) return null;
                              return (
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                  type === "Bug" ? "bg-rose-100 dark:bg-rose-950 text-rose-600" : type === "Improvement" ? "bg-amber-100 dark:bg-amber-950 text-amber-600" : "bg-emerald-100 dark:bg-emerald-950 text-emerald-600"
                                }`}>
                                  {type}
                                </span>
                              );
                            })()}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(s.id, s.title, e)}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
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

      {/* Main Ticket Chat — single column, scrolls independently */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top bar with Toggle History */}
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHistorySidebar(!showHistorySidebar)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
              title={showHistorySidebar ? "Hide History" : "Show History"}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-sm">
              {activeSession ? activeSession.title : "New Ticket Chat"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCreateNewSession}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-slate-800 dark:text-indigo-400 hover:bg-indigo-100 transition font-medium"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>New Chat</span>
            </button>
          </div>
        </div>

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
                    pushingJira={pushingJira}
                    onPushToAksora={handlePushToAksora}
                    aksoraConfigured={aksoraConfigured}
                    pushingAksora={pushingAksora}
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
                  if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || (e.key === "Enter" && !e.shiftKey)) {
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
                title="Send message (Enter or Ctrl+Enter)"
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
