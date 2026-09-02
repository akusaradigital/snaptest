"use client";

import { Ticket, Copy, Check, Pencil, Loader2, Share2, Download, Eye, X, ExternalLink, RefreshCw, Printer, AlertCircle, FileSpreadsheet, ChevronDown, FileText } from "lucide-react";
import { ChatMessage } from "./pages/TicketPage";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { BugSnapPreviewCard } from "./BugSnapPreviewCard";

const stripStars = (str?: string | null) => (str || "").replace(/\*\*/g, "");

const parseEvidenceUrls = (raw?: string) => {
  if (!raw) return [];
  const urls = String(raw).match(/https?:\/\/[^\s,]+/gi) || [];
  if (urls.length > 0) {
    return Array.from(new Set(urls));
  }
  const clean = String(raw).trim();
  return clean ? [clean] : [];
};

export default function TicketChatBubble({
  msg,
  onPushToJira,
  readOnly = false,
  jiraConfigured = true,
  jiraMembers = [],
  pushingJira = false,
  onPushToAksora,
  aksoraConfigured = true,
  pushingAksora = false,
  onSyncToSheets,
  sheetsConfigured = true,
  syncingSheets = false,
  onUpdateTicket,
  allSessions = [],
  currentSessionId,
  onSelectSession,
}: {
  msg: ChatMessage;
  onPushToJira?: (ticketResult: Record<string, any>) => void;
  readOnly?: boolean;
  jiraConfigured?: boolean;
  jiraMembers?: Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string }>;
  pushingJira?: boolean;
  onPushToAksora?: (ticketResult: Record<string, any>) => void;
  aksoraConfigured?: boolean;
  pushingAksora?: boolean;
  onSyncToSheets?: (ticketResult: Record<string, any>) => void;
  sheetsConfigured?: boolean;
  syncingSheets?: boolean;
  onUpdateTicket?: (messageId: string, updates: Record<string, any>) => void;
  allSessions?: Array<{ id: string; title: string; messages: ChatMessage[] }>;
  currentSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
}) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [checkedCriteria, setCheckedCriteria] = useState<Record<number, boolean>>({});
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showUnassignedWarningModal, setShowUnassignedWarningModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isCompactView, setIsCompactView] = useState(false);
  const [syncingStatus, setSyncingStatus] = useState(false);
  const [jiraLiveStatus, setJiraLiveStatus] = useState<{ status: string; assignee_name?: string } | null>(null);

  const handleSyncJiraStatus = async (issueKey: string) => {
    setSyncingStatus(true);
    try {
      const config = JSON.parse(localStorage.getItem("jira_config") || "{}");
      const res = await fetch("/api/jira/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue_key: issueKey,
          auth_type: config.auth_type,
          access_token: config.access_token,
          cloud_id: config.cloud_id,
          domain: config.domain,
          email: config.email,
          token: config.token,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || "Failed to fetch status");
      setJiraLiveStatus({ status: data.status, assignee_name: data.assignee_name });
      toast.success(`Jira Status: ${data.status}${data.assignee_name ? ` (${data.assignee_name})` : ""}`);
    } catch (err: any) {
      toast.error(err.message || "Could not sync status");
    } finally {
      setSyncingStatus(false);
    }
  };

  const startEditing = () => {
    setDraft({
      issue_type: msg.ticket_result?.issue_type || "Bug",
      title: stripStars(msg.ticket_result?.title),
      description: stripStars(msg.ticket_result?.description),
      component: msg.ticket_result?.component || "",
      assignee_id: msg.ticket_result?.assignee_id || "",
      assignee_name: msg.ticket_result?.assignee_name || "",
      current_behavior: stripStars(msg.ticket_result?.current_behavior),
      expected_result: stripStars(msg.ticket_result?.expected_result),
      actual_result: stripStars(msg.ticket_result?.actual_result),
      evidence: msg.ticket_result?.evidence || "",
    });
    setIsEditing(true);
  };

  const saveEditing = () => {
    onUpdateTicket?.(msg.id, draft);
    setIsEditing(false);
    toast.success("Ticket updated");
  };

  // Keyboard shortcut Escape to cancel editing
  useEffect(() => {
    if (!isEditing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsEditing(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditing]);

  const generateMarkdown = () => {
    const lines: string[] = [];
    const t = msg.ticket_result || {};
    if (t.issue_type) lines.push(`**Issue Type:** ${t.issue_type}`);
    if (t.title) lines.push(`**Title:** ${stripStars(t.title)}`);
    if (t.component) lines.push(`**Component:** ${t.component}`);
    if (t.description) lines.push(`\n**Description:**\n${stripStars(t.description)}`);
    if (t.current_behavior) lines.push(`\n**Current Behavior:**\n${stripStars(t.current_behavior)}`);
    if (t.expected_result) lines.push(`\n**Expected Result:**\n${stripStars(t.expected_result)}`);
    if (t.actual_result) lines.push(`\n**Actual Result:**\n${stripStars(t.actual_result)}`);
    if (t.acceptance_criteria?.length) {
      lines.push(`\n**Acceptance Criteria:**\n${t.acceptance_criteria.map((c: string) => `- [ ] ${stripStars(c)}`).join("\n")}`);
    }
    if (t.evidence) {
      const urls = parseEvidenceUrls(t.evidence);
      if (urls.length > 0) {
        lines.push(`\n**Evidence:**\n${urls.join("\n")}`);
      }
    }
    return lines.join("\n");
  };

  const copyToClipboard = async () => {
    try {
      const text = msg.ticket_result?.markdown || generateMarkdown();
      await navigator.clipboard.writeText(text || msg.content || "");
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
      toast.success("Copied ticket markdown to clipboard!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  };

  const handleDownloadMd = () => {
    const md = msg.ticket_result?.markdown || generateMarkdown();
    const title = (msg.ticket_result?.title || "ticket").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    downloadFile(md, `${title}.md`, "text/markdown");
  };

  const handleShareTicket = async () => {
    try {
      const shareData = {
        title: msg.ticket_result?.title || "QA Ticket",
        text: generateMarkdown(),
        url: window.location.href,
      };
      if (navigator.share && typeof navigator.canShare === "function" && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${window.location.origin}/ticket#${currentSessionId || ""}`);
        toast.success("Ticket link copied to clipboard!");
      }
    } catch {
      await navigator.clipboard.writeText(`${window.location.origin}/ticket#${currentSessionId || ""}`);
      toast.success("Ticket link copied to clipboard!");
    }
  };

  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(msg.ticket_result || {}, null, 2);
    const title = (msg.ticket_result?.title || "ticket").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    downloadFile(jsonStr, `${title}.json`, "application/json");
  };

  const handleDownloadCsv = () => {
    const t = msg.ticket_result || {};
    const headers = ["Issue Type", "Priority", "Title", "Assignee", "Component", "Description", "Expected Result", "Actual Result", "Acceptance Criteria", "Evidence", "Jira Key"];
    const escapeCsv = (str: string) => `"${(str || "").replace(/"/g, '""')}"`;
    const acStr = Array.isArray(t.acceptance_criteria) ? t.acceptance_criteria.join("; ") : (t.acceptance_criteria || "");
    const row = [
      escapeCsv(t.issue_type || "Bug"),
      escapeCsv(t.priority || "P1"),
      escapeCsv(t.title || ""),
      escapeCsv(t.assignee_name || "Unassigned"),
      escapeCsv(t.component || ""),
      escapeCsv(t.description || ""),
      escapeCsv(t.expected_result || ""),
      escapeCsv(t.actual_result || t.current_behavior || ""),
      escapeCsv(acStr),
      escapeCsv(t.evidence || ""),
      escapeCsv(t.jira_key || ""),
    ];
    const csvContent = headers.join(",") + "\n" + row.join(",");
    const title = (t.title || "ticket").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    downloadFile(csvContent, `${title}.csv`, "text/csv");
  };

  const toggleIssueType = (newType: string) => {
    if (readOnly || !onUpdateTicket) return;
    onUpdateTicket(msg.id, { issue_type: newType });
    toast.success(`Switched to ${newType}`);
  };

  const togglePriority = (newPriority: string) => {
    if (readOnly || !onUpdateTicket) return;
    onUpdateTicket(msg.id, { priority: newPriority });
    toast.success(`Priority updated to ${newPriority}`);
  };

  const handlePrintPdf = () => {
    const md = msg.ticket_result?.markdown || generateMarkdown();
    const title = msg.ticket_result?.title || "QA Issue Ticket";
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocked. Please allow popups to print PDF.");
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; line-height: 1.6; color: #1e293b; max-width: 800px; margin: 0 auto; }
            h1 { font-size: 20px; border-bottom: 2px solid #6366f1; padding-bottom: 8px; color: #0f172a; }
            pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; font-family: monospace; white-space: pre-wrap; font-size: 13px; }
            .badge { display: inline-block; padding: 4px 8px; background: #e0e7ff; color: #4338ca; border-radius: 4px; font-size: 12px; font-weight: bold; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="badge">SnapTest QA Export</div>
          <h1>${title}</h1>
          <pre>${md}</pre>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const isUser = msg.role === "user";
  const ticket = msg.ticket_result;
  const hasTicket = Boolean(
    !isUser &&
    ticket &&
    (ticket.has_ticket_data !== false ||
     ticket.title ||
     ticket.description ||
     ticket.expected_result ||
     ticket.issue_type)
  );

  const isPushed = Boolean(ticket?.jira_key || ticket?.aksora_pushed);

  // Auto-detect similar past tickets from other chat sessions (Feature 9)
  const similarTicket = (() => {
    if (!ticket?.title || allSessions.length <= 1) return null;
    const currentWords = stripStars(ticket.title).toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (currentWords.length === 0) return null;

    for (const session of allSessions) {
      if (session.id === currentSessionId) continue;
      for (const m of session.messages) {
        if (m.role === "assistant" && m.ticket_result?.title) {
          const otherTitle = stripStars(m.ticket_result.title).toLowerCase();
          const matchCount = currentWords.filter(w => otherTitle.includes(w)).length;
          const matchRatio = matchCount / currentWords.length;
          if (matchRatio >= 0.5) {
            return {
              sessionId: session.id,
              sessionTitle: session.title,
              ticketTitle: m.ticket_result.title,
              jiraKey: m.ticket_result.jira_key,
              jiraUrl: m.ticket_result.jira_url,
            };
          }
        }
      }
    }
    return null;
  })();

  const handlePushClick = () => {
    if (!ticket?.assignee_id && jiraConfigured) {
      setShowUnassignedWarningModal(true);
    } else if (ticket) {
      onPushToJira?.(ticket);
    }
  };

  return (
    <div className={`p-4 rounded-2xl text-sm ${
      isUser
        ? "bg-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-600/10"
        : "bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-none shadow-sm font-sans"
    }`}>
      {msg.image_preview && (
        <div className="mb-3 rounded-xl overflow-hidden max-w-sm border border-white/20">
          <img src={msg.image_preview} alt="Attached screenshot" className="max-h-48 object-contain" />
        </div>
      )}

      {hasTicket && ticket ? (
        <div className="space-y-3.5 leading-relaxed">
          {/* Header Status & Issue Type Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-700/60">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Type:</span>
                {!readOnly ? (
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700/60 p-0.5 rounded-lg text-xs font-semibold">
                    {["Bug", "Improvement", "New Feature"].map((type) => {
                      const active = (ticket.issue_type || "Bug") === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleIssueType(type)}
                          className={`px-2 py-0.5 rounded-md transition ${
                            active
                              ? type === "Bug"
                                ? "bg-rose-500 text-white shadow-xs"
                                : type === "Improvement"
                                ? "bg-amber-500 text-white shadow-xs"
                                : "bg-emerald-500 text-white shadow-xs"
                              : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                          }`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                    ticket.issue_type === "Bug" ? "bg-rose-100 text-rose-700" : ticket.issue_type === "Improvement" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {ticket.issue_type || "Bug"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Priority:</span>
                {!readOnly ? (
                  <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700/60 p-0.5 rounded-lg text-[11px] font-bold">
                    {["P0", "P1", "P2", "P3"].map((p) => {
                      const active = (ticket.priority || "P1") === p;
                      const activeColor = p === "P0" ? "bg-red-600 text-white" : p === "P1" ? "bg-orange-500 text-white" : p === "P2" ? "bg-amber-500 text-white" : "bg-slate-500 text-white";
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePriority(p)}
                          className={`px-1.5 py-0.5 rounded transition ${active ? activeColor : "text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}
                          title={`Set priority to ${p}`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                    {ticket.priority || "P1"}
                  </span>
                )}
              </div>

              {jiraConfigured && jiraMembers && jiraMembers.length > 0 && !readOnly && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Assignee:</span>
                  <select
                    value={ticket.assignee_id || ""}
                    onChange={(e) => {
                      const selectedUser = jiraMembers.find(u => u.accountId === e.target.value);
                      onUpdateTicket?.(msg.id, {
                        assignee_id: e.target.value,
                        assignee_name: selectedUser?.displayName || "",
                      });
                      if (selectedUser) {
                        toast.success(`Assigned to ${selectedUser.displayName}`);
                      } else {
                        toast.success("Set to Unassigned");
                      }
                    }}
                    className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium border-none focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">👤 Unassigned</option>
                    {jiraMembers.map(u => (
                      <option key={u.accountId} value={u.accountId}>
                        👤 {u.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Timeline Tracking Status & Compact View Toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCompactView(!isCompactView)}
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition"
                title={isCompactView ? "Switch to detailed ticket view" : "Switch to compact 1-paragraph view"}
              >
                {isCompactView ? "Full View" : "Compact"}
              </button>

              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                isPushed
                  ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                  : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isPushed ? "bg-emerald-500" : "bg-indigo-500 animate-pulse"}`}></span>
                {isPushed ? "Pushed" : "Ready to Push"}
              </span>
            </div>
          </div>

          {/* Similar Duplicate Ticket Detected Banner (Feature 9) */}
          {similarTicket && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="truncate">
                  Similar past ticket: <strong>{stripStars(similarTicket.ticketTitle)}</strong>
                  {similarTicket.jiraKey ? ` (${similarTicket.jiraKey})` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {similarTicket.jiraKey && !readOnly && onUpdateTicket && (
                  ticket.linked_issue_key === similarTicket.jiraKey ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300">
                      🔗 Linked to {similarTicket.jiraKey}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateTicket(msg.id, { linked_issue_key: similarTicket.jiraKey });
                        toast.success(`Will link to ${similarTicket.jiraKey} on push`);
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 hover:bg-amber-300 transition"
                      title="Link this issue to previous Jira issue as related work item"
                    >
                      + Link to {similarTicket.jiraKey} in Jira
                    </button>
                  )
                )}
                {onSelectSession && (
                  <button
                    type="button"
                    onClick={() => onSelectSession(similarTicket.sessionId)}
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                  >
                    View Chat
                  </button>
                )}
              </div>
            </div>
          )}

          {msg.content && <p className="text-slate-600 dark:text-slate-300 italic mb-2 text-xs">{msg.content}</p>}

          {isEditing ? (
            <div className="space-y-2.5 bg-slate-50/50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Edit Ticket Draft</span>
                <span className="text-[10px] text-slate-400">Press Esc to cancel</span>
              </div>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Title</span>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">Component / Module</span>
                  <input
                    value={draft.component || ""}
                    onChange={(e) => setDraft({ ...draft, component: e.target.value })}
                    placeholder="e.g. Talent Library"
                    className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </label>

                {jiraConfigured && jiraMembers && jiraMembers.length > 0 && (
                  <label className="block">
                    <span className="text-xs font-bold text-slate-500">Jira Assignee</span>
                    <select
                      value={draft.assignee_id || ""}
                      onChange={(e) => {
                        const selectedUser = jiraMembers.find(u => u.accountId === e.target.value);
                        setDraft({
                          ...draft,
                          assignee_id: e.target.value,
                          assignee_name: selectedUser?.displayName || "",
                        });
                      }}
                      className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">Unassigned</option>
                      {jiraMembers.map(user => (
                        <option key={user.accountId} value={user.accountId}>
                          {user.displayName} {user.emailAddress ? `(${user.emailAddress})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Description</span>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={3}
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </label>
              {draft.issue_type === "Improvement" && (
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">Current Behavior</span>
                  <textarea
                    value={draft.current_behavior}
                    onChange={(e) => setDraft({ ...draft, current_behavior: e.target.value })}
                    rows={2}
                    className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </label>
              )}
              <label className="block">
                <span className="text-xs font-bold text-slate-500">
                  {draft.issue_type === "Improvement" ? "Expected / Proposed Result" : "Expected Result"}
                </span>
                <textarea
                  value={draft.expected_result}
                  onChange={(e) => setDraft({ ...draft, expected_result: e.target.value })}
                  rows={2}
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </label>
              {draft.issue_type === "Bug" && (
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">Actual Result</span>
                  <textarea
                    value={draft.actual_result}
                    onChange={(e) => setDraft({ ...draft, actual_result: e.target.value })}
                    rows={2}
                    className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </label>
              )}
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Evidence URL</span>
                <input
                  value={draft.evidence}
                  onChange={(e) => setDraft({ ...draft, evidence: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  placeholder="https://..."
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={saveEditing}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs"
                >
                  Cancel (Esc)
                </button>
              </div>
            </div>
          ) : isCompactView ? (
            /* Compact 1-Paragraph View Mode */
            <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 text-xs space-y-1.5 leading-relaxed">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {stripStars(ticket.title)}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                {stripStars(ticket.description)}
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                <strong>Expected:</strong> {stripStars(ticket.expected_result)}
                {ticket.actual_result ? ` — Actual: ${stripStars(ticket.actual_result)}` : ""}
              </p>
            </div>
          ) : (
          <>
          {ticket.title && (
            <p><strong>Title:</strong> {stripStars(ticket.title)}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {ticket.component && (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs">Component:</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium">
                  {ticket.component}
                </span>
              </div>
            )}

            {ticket.assignee_name && (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs">Assignee:</span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  {ticket.assignee_name}
                </span>
              </div>
            )}
          </div>

          {ticket.description && (
            <div>
              <p className="font-bold mb-1">Description:</p>
              <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{stripStars(ticket.description)}</p>
            </div>
          )}

          {ticket.current_behavior && (
            <div>
              <p className="font-bold mb-1">Current Behavior:</p>
              <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{stripStars(ticket.current_behavior)}</p>
            </div>
          )}

          {ticket.expected_result && (
            <div>
              <p className="font-bold mb-1">{ticket.issue_type === "Improvement" ? "Expected / Proposed Result:" : "Expected Result:"}</p>
              <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{stripStars(ticket.expected_result)}</p>
            </div>
          )}

          {ticket.actual_result && (
            <div>
              <p className="font-bold mb-1">Actual Result:</p>
              <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{stripStars(ticket.actual_result)}</p>
            </div>
          )}

          {ticket.acceptance_criteria && Array.isArray(ticket.acceptance_criteria) && ticket.acceptance_criteria.length > 0 && (
            <div>
              <p className="font-bold mb-1.5">Acceptance Criteria:</p>
              <div className="space-y-1.5">
                {ticket.acceptance_criteria.map((c: string, idx: number) => {
                  const isChecked = !!checkedCriteria[idx];
                  return (
                    <label key={idx} className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => setCheckedCriteria({ ...checkedCriteria, [idx]: e.target.checked })}
                        className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className={`text-xs transition leading-relaxed ${isChecked ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}`}>
                        {stripStars(c)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {ticket.evidence && (
            <div>
              <p className="font-bold mb-1.5">Evidence:</p>
              <div className="space-y-1.5">
                {parseEvidenceUrls(ticket.evidence).map((url: string, idx: number) => {
                  const isLink = /^https?:\/\//i.test(url);
                  const isBugSnap = isLink && /bugsnap[^\s]*\/v\/[a-zA-Z0-9_-]+/i.test(url);
                  return (
                    <div key={idx} className="space-y-1">
                      {isBugSnap ? (
                        <BugSnapPreviewCard url={url} />
                      ) : isLink ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 dark:text-indigo-400 underline break-all text-xs flex items-center gap-1 hover:text-indigo-800"
                          >
                            <span>{url}</span>
                            <ExternalLink className="w-3 h-3 inline-block shrink-0" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-700 dark:text-slate-200">{url}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </>
          )}

          {/* Action Bar inside Chat Bubble — Simplified & Grouped */}
          {!isEditing && (
          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2">
            {/* Left side: Active Push Integrations & Statuses */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Jira Push / Status */}
              {ticket.jira_key && ticket.jira_url ? (
                <div className="flex items-center gap-1">
                  <a
                    href={ticket.jira_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pushed ({ticket.jira_key})</span>
                  </a>
                  {jiraLiveStatus ? (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                      {jiraLiveStatus.status}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSyncJiraStatus(ticket.jira_key)}
                      disabled={syncingStatus}
                      className="p-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 border border-slate-200 dark:border-slate-600 transition"
                      title="Sync live status from Jira"
                    >
                      <RefreshCw className={`w-3 h-3 ${syncingStatus ? "animate-spin text-indigo-600" : ""}`} />
                    </button>
                  )}
                </div>
              ) : !readOnly && jiraConfigured && onPushToJira ? (
                <button
                  type="button"
                  onClick={handlePushClick}
                  disabled={pushingJira}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition disabled:opacity-50"
                  title="Push this issue to Jira Cloud"
                >
                  {pushingJira ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  ) : (
                    <Ticket className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>{pushingJira ? "Pushing..." : "Push to Jira"}</span>
                </button>
              ) : null}

              {/* Aksora Push / Status */}
              {ticket.aksora_pushed ? (
                ticket.aksora_url ? (
                  <a
                    href={ticket.aksora_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Aksora</span>
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Aksora</span>
                  </span>
                )
              ) : !readOnly && aksoraConfigured && onPushToAksora ? (
                <button
                  type="button"
                  onClick={() => onPushToAksora(ticket)}
                  disabled={pushingAksora}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition disabled:opacity-50"
                  title="Push to Aksora Workspace"
                >
                  {pushingAksora ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5 text-purple-600" />
                  )}
                  <span>{pushingAksora ? "Pushing..." : "Push to Aksora"}</span>
                </button>
              ) : null}

              {/* Google Sheets Sync / Status */}
              {ticket.sheets_synced ? (
                ticket.sheets_url ? (
                  <a
                    href={ticket.sheets_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Sheets</span>
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Sheets</span>
                  </span>
                )
              ) : !readOnly && sheetsConfigured && onSyncToSheets ? (
                <button
                  type="button"
                  onClick={() => onSyncToSheets(ticket)}
                  disabled={syncingSheets}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-50"
                  title="Append row to Google Spreadsheet"
                >
                  {syncingSheets ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  <span>{syncingSheets ? "Syncing..." : "Sync to Sheet"}</span>
                </button>
              ) : null}
            </div>

            {/* Right side: Edit, Preview, Export dropdown & Primary Copy */}
            <div className="flex items-center gap-1.5">
              {!readOnly && onUpdateTicket && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 transition"
                  title="Edit ticket fields"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 transition"
                title="Preview Jira issue format"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>

              {/* Simplified Export Dropdown with Badges & Hover Popover */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 transition"
                  title="Export ticket to various formats (PDF, Markdown, CSV, JSON)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showExportMenu ? "rotate-180" : ""}`} />
                </button>

                {showExportMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowExportMenu(false)}
                    />
                    <div className="absolute right-0 bottom-full mb-1.5 w-48 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl z-50 py-1 text-xs animate-in fade-in zoom-in-95 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setShowExportMenu(false);
                          handlePrintPdf();
                        }}
                        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                      >
                        <div className="flex items-center gap-2">
                          <Printer className="w-3.5 h-3.5 text-rose-500" />
                          <span>Print to PDF</span>
                        </div>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-600">PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowExportMenu(false);
                          handleDownloadMd();
                        }}
                        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Markdown (.md)</span>
                        </div>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-600">MD</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowExportMenu(false);
                          handleDownloadCsv();
                        }}
                        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                      >
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Spreadsheet (.csv)</span>
                        </div>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-600">CSV</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowExportMenu(false);
                          handleDownloadJson();
                        }}
                        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition border-t border-slate-100 dark:border-slate-700"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 text-center font-mono font-bold text-[10px] text-amber-500">{`{}`}</span>
                          <span>JSON Object (.json)</span>
                        </div>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-600">JSON</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Share Read-only Link Button (Feature 7) */}
              <button
                type="button"
                onClick={handleShareTicket}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 transition"
                title="Share or copy direct ticket link"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>

              {/* Primary Action: Copy Ticket */}
              <button
                type="button"
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-xs"
                title="Copy markdown formatted ticket to clipboard"
              >
                {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAll ? "Copied" : "Copy Ticket"}</span>
              </button>
            </div>
          </div>
          )}
        </div>
      ) : (
        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
      )}

      {/* Side-by-side Jira issue visual preview modal */}
      {showPreviewModal && ticket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 dark:text-white">Jira Issue Preview</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl space-y-3 font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap border border-slate-200 dark:border-slate-700">
              {generateMarkdown()}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={copyToClipboard}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Markdown</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unassigned Confirmation Warning Modal (Feature 4) */}
      {showUnassignedWarningModal && ticket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Push as Unassigned?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  This issue does not have an Assignee selected yet.
                </p>
              </div>
            </div>

            {jiraMembers && jiraMembers.length > 0 && (
              <div className="space-y-1 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Select Assignee now (optional):</span>
                <select
                  value={ticket.assignee_id || ""}
                  onChange={(e) => {
                    const u = jiraMembers.find(m => m.accountId === e.target.value);
                    onUpdateTicket?.(msg.id, {
                      assignee_id: e.target.value,
                      assignee_name: u?.displayName || "",
                    });
                  }}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">Leave Unassigned</option>
                  {jiraMembers.map(u => (
                    <option key={u.accountId} value={u.accountId}>
                      👤 {u.displayName} {u.emailAddress ? `(${u.emailAddress})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowUnassignedWarningModal(false)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUnassignedWarningModal(false);
                  onPushToJira?.(ticket);
                }}
                className="btn-primary text-xs"
              >
                {ticket.assignee_id ? "Push to Jira" : "Push without Assignee"}
              </button>
            </div>
          </div>
        </div>
      )}

      <span className={`text-[10px] block mt-2 ${isUser ? "text-indigo-200" : "text-slate-400"}`}>
        {msg.timestamp}
      </span>
    </div>
  );
}
