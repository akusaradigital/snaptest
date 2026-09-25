"use client";

import { Ticket, Copy, Check, Pencil, Loader2, Share2, Eye, X, ExternalLink, RefreshCw, Printer, AlertCircle, FileSpreadsheet, FileText, MoreHorizontal, RotateCcw, Send, Tag, Link2 } from "lucide-react";
import { ChatMessage } from "./pages/TicketPage";
import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";

const stripStars = (str?: string | null) => (str || "").replace(/\*\*/g, "");

const isPlaceholderEvidence = (str?: string | null) => {
  if (!str) return true;
  const s = str.trim().toLowerCase();
  return (
    s === "none" ||
    s === "n/a" ||
    s === "placeholder" ||
    s === "null" ||
    s === "undefined" ||
    s === "-" ||
    s === "https://example.com/evidence" ||
    s.includes("exact url")
  );
};

const parseEvidenceUrls = (raw?: string) => {
  if (!raw) return [];
  const urls = String(raw).match(/https?:\/\/[^\s,]+/gi) || [];
  if (urls.length > 0) {
    return Array.from(new Set(urls.map((u) => u.replace(/[)\]"'>.,;]+$/, "").trim()))).filter(Boolean);
  }
  const clean = String(raw).trim();
  return clean ? [clean] : [];
};

const removeStepsFromText = (text?: string | null): string => {
  if (!text) return "";
  const pattern = /(?:\n\s*)?(?:\*?\s*(?:Langkah-langkah\s+Reproduksi|Steps?\s+to\s+Reproduce)[^:\n]*:?)(?:[\s\S]*?)(?=(?:\n\s*\*?\s*(?:Catatan\s+Teknis|Technical\s+Notes|Environment|Catatan|Hasil|Expected|Actual)[\s\S]*:)|$)/i;
  const replaced = text.replace(pattern, "").trim();
  return replaced.replace(/\n{3,}/g, "\n\n");
};

function AutoResizeTextarea({
  value,
  onChange,
  className = "",
  placeholder = "",
  onKeyDown,
}: {
  value?: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const adjust = () => {
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 44)}px`;
    };
    adjust();
    window.addEventListener("resize", adjust);
    return () => window.removeEventListener("resize", adjust);
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value || ""}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={`w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none overflow-hidden resize-none leading-relaxed ${className}`}
    />
  );
}

export default function TicketChatBubble({
  msg,
  onPushToJira,
  onUpdateToJira,
  readOnly = false,
  jiraConfigured = true,
  jiraMembers = [],
  pushingJira = false,
  updatingJira = false,
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
  onEditUserMessage,
  onResendUserMessage,
  isRegenerating = false,
  isLoading = false,
}: {
  msg: ChatMessage;
  onPushToJira?: (ticketResult: Record<string, any>) => void;
  onUpdateToJira?: (ticketResult: Record<string, any>) => void;
  readOnly?: boolean;
  jiraConfigured?: boolean;
  jiraMembers?: Array<{ accountId: string; displayName: string; emailAddress?: string; avatarUrl?: string }>;
  pushingJira?: boolean;
  updatingJira?: boolean;
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
  onEditUserMessage?: (messageId: string, newContent: string) => void;
  onResendUserMessage?: (messageId: string) => void;
  isRegenerating?: boolean;
  isLoading?: boolean;
}) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [checkedCriteria, setCheckedCriteria] = useState<Record<number, boolean>>({});
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isCompactView, setIsCompactView] = useState(false);
  const [syncingStatus, setSyncingStatus] = useState(false);
  const [jiraLiveStatus, setJiraLiveStatus] = useState<{ status: string; assignee_name?: string } | null>(null);
  const [syncToJira, setSyncToJira] = useState(true);
  const [isSyncingJira, setIsSyncingJira] = useState(false);

  // ChatGPT-style User Message Edit & Resend states
  const [isEditingUserMsg, setIsEditingUserMsg] = useState(false);
  const [userMsgDraft, setUserMsgDraft] = useState(msg.content);
  const [copiedUserMsg, setCopiedUserMsg] = useState(false);

  useEffect(() => {
    setUserMsgDraft(msg.content);
  }, [msg.content]);

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
      priority: msg.ticket_result?.priority || "P1",
      title: stripStars(msg.ticket_result?.title),
      description: stripStars(msg.ticket_result?.description),
      component: msg.ticket_result?.component || "",
      assignee_id: msg.ticket_result?.assignee_id || "",
      assignee_name: msg.ticket_result?.assignee_name || "",
      jira_label: msg.ticket_result?.jira_label || "Development",
      current_behavior: stripStars(msg.ticket_result?.current_behavior),
      expected_result: stripStars(msg.ticket_result?.expected_result),
      actual_result: stripStars(msg.ticket_result?.actual_result),
      evidence: msg.ticket_result?.evidence || "",
    });
    setSyncToJira(Boolean(msg.ticket_result?.jira_key));
    setIsEditing(true);
  };

  const saveEditing = async () => {
    const hasJiraKey = Boolean(msg.ticket_result?.jira_key);
    if (hasJiraKey && syncToJira) {
      setIsSyncingJira(true);
      try {
        const config = JSON.parse(localStorage.getItem("jira_config") || "{}");
        const res = await fetch("/api/jira/update", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            issue_key: msg.ticket_result?.jira_key,
            auth_type: config.auth_type,
            access_token: config.access_token,
            cloud_id: config.cloud_id,
            jira_domain: config.domain,
            jira_email: config.email,
            jira_token: config.token,
            title: draft.title,
            description: draft.description,
            current_behavior: draft.current_behavior,
            expected_result: draft.expected_result,
            actual_result: draft.actual_result,
            acceptance_criteria: msg.ticket_result?.acceptance_criteria,
            evidence: draft.evidence,
            priority: draft.priority || msg.ticket_result?.priority || "P1",
            issue_type: draft.issue_type || msg.ticket_result?.issue_type || "Bug",
            assignee_id: draft.assignee_id,
            jira_label: draft.jira_label || "Development",
            label: draft.jira_label || "Development",
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.detail || "Failed to update Jira issue");
        }
        toast.success(`Jira issue ${msg.ticket_result?.jira_key} updated in Jira!`);
      } catch (err: any) {
        toast.error(err.message || "Failed to sync updates to Jira");
      } finally {
        setIsSyncingJira(false);
      }
    }

    onUpdateTicket?.(msg.id, draft);
    setIsEditing(false);
    toast.success("Ticket updated locally");
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
    if (t.priority) lines.push(`**Priority:** ${t.priority}`);
    if (t.title) lines.push(`**Title:** ${stripStars(t.title)}`);
    if (t.component) lines.push(`**Component:** ${t.component}`);
    if (t.jira_label) lines.push(`**Environment:** ${t.jira_label}`);
    if (t.description) lines.push(`\n**Description:**\n${stripStars(t.description)}`);
    if (t.current_behavior) lines.push(`\n**Current Behavior:**\n${stripStars(t.current_behavior)}`);
    if (t.expected_result) lines.push(`\n**Expected Result:**\n${stripStars(t.expected_result)}`);
    if (t.actual_result) lines.push(`\n**Actual Result:**\n${stripStars(t.actual_result)}`);
    if (t.acceptance_criteria?.length) {
      lines.push(`\n**Acceptance Criteria:**\n${t.acceptance_criteria.map((c: string) => `- [ ] ${stripStars(c).replace(/^[-*]\s*(\[[ xX]\]\s*)?/, "")}`).join("\n")}`);
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
    const headers = [
      "Issue Type",
      "Priority",
      "Title",
      "Assignee",
      "Component",
      "Environment",
      "Description",
      "Current Behavior",
      "Expected Result",
      "Actual Result",
      "Acceptance Criteria",
      "Evidence",
      "Jira Key",
    ];
    const escapeCsv = (str?: string | null) => `"${(str || "").replace(/"/g, '""')}"`;
    const acStr = Array.isArray(t.acceptance_criteria)
      ? t.acceptance_criteria.map((c: string) => stripStars(c).replace(/^[-*]\s*(\[[ xX]\]\s*)?/, "")).join("; ")
      : stripStars(t.acceptance_criteria || "");
    const row = [
      escapeCsv(t.issue_type || "Bug"),
      escapeCsv(t.priority || "P1"),
      escapeCsv(stripStars(t.title)),
      escapeCsv(t.assignee_name || "Unassigned"),
      escapeCsv(t.component || ""),
      escapeCsv(t.jira_label || ""),
      escapeCsv(stripStars(t.description)),
      escapeCsv(stripStars(t.current_behavior)),
      escapeCsv(stripStars(t.expected_result)),
      escapeCsv(stripStars(t.actual_result)),
      escapeCsv(acStr),
      escapeCsv(t.evidence || ""),
      escapeCsv(t.jira_key || ""),
    ];
    const csvContent = headers.join(",") + "\n" + row.join(",");
    const title = (stripStars(t.title) || "ticket").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    downloadFile(csvContent, `${title}.csv`, "text/csv");
  };

  const handlePrintPdf = () => {
    const t = msg.ticket_result || {};
    const title = stripStars(t.title) || "QA Issue Ticket";
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocked. Please allow popups to print PDF.");
      return;
    }
    const escapeHtml = (str?: string | null) =>
      (str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const issueType = escapeHtml(t.issue_type || "Bug");
    const priority = escapeHtml(t.priority || "P1");
    const component = escapeHtml(t.component || "");
    const environment = escapeHtml(t.jira_label || "");
    const assignee = escapeHtml(t.assignee_name || "");
    const jiraKey = escapeHtml(t.jira_key || "");
    const description = escapeHtml(stripStars(t.description));
    const currentBehavior = escapeHtml(stripStars(t.current_behavior));
    const expectedResult = escapeHtml(stripStars(t.expected_result));
    const actualResult = escapeHtml(stripStars(t.actual_result));
    const evidenceUrls = parseEvidenceUrls(t.evidence);

    const typeBadgeBg = issueType === "Bug" ? "#ffe4e6" : issueType === "Improvement" ? "#fef3c7" : "#d1fae5";
    const typeBadgeColor = issueType === "Bug" ? "#be123c" : issueType === "Improvement" ? "#b45309" : "#047857";

    const criteriaHtml = Array.isArray(t.acceptance_criteria) && t.acceptance_criteria.length > 0
      ? `<div class="section"><div class="section-title">Acceptance Criteria</div><ul class="criteria-list">${t.acceptance_criteria
          .map((c: string) => `<li><span class="checkbox"></span><span>${escapeHtml(stripStars(c).replace(/^[-*]\s*(\[[ xX]\]\s*)?/, ""))}</span></li>`)
          .join("")}</ul></div>`
      : "";

    const evidenceHtml = evidenceUrls.length > 0
      ? `<div class="section"><div class="section-title">Evidence</div><ul class="evidence-list">${evidenceUrls
          .map((u: string) => `<li><a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u)}</a></li>`)
          .join("")}</ul></div>`
      : "";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            @page { margin: 15mm; size: A4; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; line-height: 1.5; color: #1e293b; max-width: 800px; margin: 0 auto; background: #fff; }
            .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
            .branding { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
            .badges { display: flex; gap: 8px; }
            .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
            .badge-type { background: ${typeBadgeBg}; color: ${typeBadgeColor}; }
            .badge-priority { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
            h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0; line-height: 1.3; }
            .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 20px; font-size: 12px; }
            .meta-item { display: flex; flex-direction: column; }
            .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
            .meta-value { font-weight: 600; color: #1e293b; }
            .section { margin-bottom: 18px; }
            .section-title { font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #f1f5f9; text-transform: uppercase; letter-spacing: 0.025em; }
            .section-content { font-size: 13px; color: #334155; white-space: pre-wrap; line-height: 1.6; }
            .criteria-list { list-style: none; padding: 0; margin: 0; }
            .criteria-list li { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; font-size: 13px; color: #334155; }
            .checkbox { width: 14px; height: 14px; border: 1.5px solid #94a3b8; border-radius: 3px; display: inline-block; shrink: 0; margin-top: 3px; }
            .evidence-list { margin: 0; padding-left: 20px; font-size: 12px; }
            .evidence-list li { margin-bottom: 4px; word-break: break-all; }
            .evidence-list a { color: #2563eb; text-decoration: underline; }
            @media print {
              body { padding: 0; }
              .meta-grid { background: #fff !important; border-color: #cbd5e1 !important; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <span class="branding">TestGen Studio &bull; QA Ticket</span>
            <div class="badges">
              <span class="badge badge-type">${issueType}</span>
              <span class="badge badge-priority">${priority}</span>
              ${jiraKey ? `<span class="badge badge-priority">${jiraKey}</span>` : ""}
            </div>
          </div>
          <h1>${escapeHtml(title)}</h1>
          ${(component || environment || assignee || jiraKey) ? `
          <div class="meta-grid">
            ${component ? `<div class="meta-item"><span class="meta-label">Component</span><span class="meta-value">${component}</span></div>` : ""}
            ${environment ? `<div class="meta-item"><span class="meta-label">Environment</span><span class="meta-value">${environment}</span></div>` : ""}
            ${assignee ? `<div class="meta-item"><span class="meta-label">Assignee</span><span class="meta-value">${assignee}</span></div>` : ""}
            ${jiraKey ? `<div class="meta-item"><span class="meta-label">Jira Key</span><span class="meta-value">${jiraKey}</span></div>` : ""}
          </div>` : ""}
          ${description ? `<div class="section"><div class="section-title">Description</div><div class="section-content">${description}</div></div>` : ""}
          ${currentBehavior ? `<div class="section"><div class="section-title">Current Behavior</div><div class="section-content">${currentBehavior}</div></div>` : ""}
          ${expectedResult ? `<div class="section"><div class="section-title">Expected Result</div><div class="section-content">${expectedResult}</div></div>` : ""}
          ${actualResult ? `<div class="section"><div class="section-title">Actual Result</div><div class="section-content">${actualResult}</div></div>` : ""}
          ${criteriaHtml}
          ${evidenceHtml}
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
    ticket.has_ticket_data === true &&
    (ticket.title || ticket.description)
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
    if (!ticket) return;
    if (!ticket.jira_label) ticket.jira_label = "Development";
    onPushToJira?.(ticket);
  };

  return (
    <div className={`p-4 rounded-2xl text-sm ${
      isUser
        ? "bg-slate-900 text-white rounded-br-none shadow-sm dark:bg-slate-700 dark:text-slate-100 min-w-[260px]"
        : "bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-none shadow-sm font-sans"
    }`}>
      {msg.image_preview && (
        <div className="mb-3 rounded-xl overflow-hidden max-w-sm border border-white/20">
          <img src={msg.image_preview} alt="Attached screenshot" className="max-h-48 object-contain" />
        </div>
      )}

      {hasTicket && ticket ? (
        <div className="space-y-3.5 leading-relaxed">
          {/* Header Status & Key Badges — Minimal & Clean */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-700/60">
            <div className="flex flex-wrap items-center gap-2">
              {/* Type Badge */}
              <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold tracking-wide ${
                ticket.issue_type === "Bug"
                  ? "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800"
                  : ticket.issue_type === "Improvement"
                  ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
              }`}>
                {ticket.issue_type || "Bug"}
              </span>

              {/* Priority Badge */}
              <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                ticket.priority === "P0"
                  ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800"
                  : ticket.priority === "P1"
                  ? "bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800"
                  : "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
              }`}>
                {ticket.priority || "P1"}
              </span>

              {/* Assignee (if set) */}
              {ticket.assignee_name && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  {ticket.assignee_name}
                </span>
              )}

              {/* Environment label (if set and not default Development) */}
              {ticket.jira_label && ticket.jira_label !== "Development" && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <Tag className="w-3 h-3 text-slate-400" />
                  <span>{ticket.jira_label}</span>
                </span>
              )}
            </div>

            {/* Right side: Status indicator */}
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                isPushed
                  ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                  : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isPushed ? "bg-emerald-500" : "bg-blue-500 animate-pulse"}`} />
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
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300">
                      <Link2 className="w-3 h-3" />
                      <span>Linked to {similarTicket.jiraKey}</span>
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
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
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

              {/* Type and Priority Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-500">Issue Type</span>
                  <div className="flex items-center gap-1 mt-1 bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                    {["Bug", "Improvement", "New Feature"].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setDraft({ ...draft, issue_type: type })}
                        className={`flex-1 py-1 rounded-md transition text-center text-[11px] ${
                          draft.issue_type === type
                            ? type === "Bug"
                              ? "bg-rose-500 text-white shadow-xs font-bold"
                              : type === "Improvement"
                              ? "bg-amber-500 text-white shadow-xs font-bold"
                              : "bg-emerald-500 text-white shadow-xs font-bold"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-500">Priority</span>
                  <div className="flex items-center gap-1 mt-1 bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold">
                    {["P0", "P1", "P2", "P3"].map((p) => {
                      const active = draft.priority === p;
                      const activeColor = p === "P0" ? "bg-red-600 text-white" : p === "P1" ? "bg-orange-500 text-white" : p === "P2" ? "bg-amber-500 text-white" : "bg-slate-600 text-white";
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setDraft({ ...draft, priority: p })}
                          className={`flex-1 py-1 rounded-md transition text-center text-[11px] ${active ? `${activeColor} shadow-xs font-bold` : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-bold text-slate-500">Title</span>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">Component</span>
                  <input
                    value={draft.component || ""}
                    onChange={(e) => setDraft({ ...draft, component: e.target.value })}
                    placeholder="e.g. Talent Library"
                    className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
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
                      className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
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

                {jiraConfigured && (
                  <label className="block">
                    <span className="text-xs font-bold text-slate-500">Environment</span>
                    <select
                      value={draft.jira_label || "Development"}
                      onChange={(e) => setDraft({ ...draft, jira_label: e.target.value })}
                      className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="Development">Development</option>
                      <option value="UAT">UAT</option>
                      <option value="Production">Production</option>
                    </select>
                  </label>
                )}
              </div>
              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Description</span>
                  {/langkah|step/i.test(draft.description || "") && (
                    <button
                      type="button"
                      onClick={() => {
                        const cleaned = removeStepsFromText(draft.description);
                        setDraft({ ...draft, description: cleaned });
                        toast.success("Langkah-langkah reproduksi dihapus dari draf!");
                      }}
                      className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-1.5 py-0.5 rounded transition flex items-center gap-1"
                      title="Hapus bagian Langkah-langkah Reproduksi dari draf"
                    >
                      ✕ Hapus Steps
                    </button>
                  )}
                </div>
                <AutoResizeTextarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Ticket description or reproduction steps..."
                />
              </label>
              {draft.issue_type === "Improvement" && (
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">Current Behavior</span>
                  <AutoResizeTextarea
                    value={draft.current_behavior}
                    onChange={(e) => setDraft({ ...draft, current_behavior: e.target.value })}
                    placeholder="Current behavior before improvement..."
                  />
                </label>
              )}
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Expected Result</span>
                <AutoResizeTextarea
                  value={draft.expected_result}
                  onChange={(e) => setDraft({ ...draft, expected_result: e.target.value })}
                  placeholder="Expected behavior or outcome..."
                />
              </label>
              {draft.issue_type === "Bug" && (
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">Actual Result</span>
                  <AutoResizeTextarea
                    value={draft.actual_result}
                    onChange={(e) => setDraft({ ...draft, actual_result: e.target.value })}
                    placeholder="Actual error or behavior observed..."
                  />
                </label>
              )}
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Evidence URL</span>
                <input
                  value={draft.evidence}
                  onChange={(e) => setDraft({ ...draft, evidence: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  placeholder="https://example.com/screenshot.png or recording URL"
                />
              </label>
              {msg.ticket_result?.jira_key && (
                <label className="flex items-center gap-2 pt-1 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncToJira}
                    onChange={(e) => setSyncToJira(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Update Jira issue on save ({msg.ticket_result.jira_key})</span>
                </label>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSyncingJira}
                  onClick={saveEditing}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSyncingJira ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating Jira...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isSyncingJira}
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs disabled:opacity-50"
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
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 text-xs font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  {ticket.assignee_name}
                </span>
              </div>
            )}
          </div>

          {ticket.description && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold">Description:</p>
                {!readOnly && onUpdateTicket && /langkah|step/i.test(ticket.description) && (
                  <button
                    type="button"
                    onClick={() => {
                      const cleaned = removeStepsFromText(ticket.description);
                      onUpdateTicket(msg.id, { description: cleaned });
                      toast.success("Langkah-langkah reproduksi dihapus dari tiket!");
                    }}
                    className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-1.5 py-0.5 rounded transition flex items-center gap-1"
                    title="Hapus bagian Langkah-langkah Reproduksi dari tiket ini"
                  >
                    ✕ Hapus Steps
                  </button>
                )}
              </div>
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
              <p className="font-bold mb-1">Expected Result:</p>
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
                        className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
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

          {ticket.evidence && !isPlaceholderEvidence(ticket.evidence) && (
            <div>
              <p className="font-bold mb-1.5">Evidence:</p>
              <div className="space-y-1">
                {parseEvidenceUrls(ticket.evidence).map((url: string, idx: number) => {
                  const isLink = /^https?:\/\//i.test(url);
                  return (
                    <div key={idx} className="flex items-center gap-1.5 flex-wrap">
                      {isLink ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 underline break-all text-xs inline-flex items-center gap-1 hover:text-blue-800 dark:hover:text-blue-300"
                        >
                          <span>{url}</span>
                          <ExternalLink className="w-3 h-3 inline-block shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-700 dark:text-slate-200 break-all">{url}</span>
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
              {/* Jira Push / Status / Update */}
              {ticket.jira_key ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {ticket.jira_url ? (
                    <a
                      href={ticket.jira_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                      title="Open Jira Issue"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Pushed ({ticket.jira_key})</span>
                    </a>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Pushed ({ticket.jira_key})</span>
                    </span>
                  )}

                  {!readOnly && onUpdateToJira && (
                    <button
                      type="button"
                      onClick={() => onUpdateToJira(ticket)}
                      disabled={updatingJira}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 transition disabled:opacity-50"
                      title={`Update existing Jira ticket ${ticket.jira_key} with current changes`}
                    >
                      {updatingJira ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      )}
                      <span>{updatingJira ? "Updating..." : `Update Jira (${ticket.jira_key})`}</span>
                    </button>
                  )}

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
                      <RefreshCw className={`w-3 h-3 ${syncingStatus ? "animate-spin text-blue-600" : ""}`} />
                    </button>
                  )}
                </div>
              ) : !readOnly && onPushToJira ? (
                <button
                  type="button"
                  onClick={handlePushClick}
                  disabled={pushingJira}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 transition disabled:opacity-50"
                  title="Push this issue to Jira Cloud"
                >
                  {pushingJira ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  ) : (
                    <Ticket className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  )}
                  <span>{pushingJira ? "Pushing..." : "Push to Jira"}</span>
                </button>
              ) : null}

              {/* Aksora Pushed Status Badge (Action is inside ... menu) */}
              {ticket.aksora_pushed && (
                ticket.aksora_url ? (
                  <a
                    href={ticket.aksora_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pushed (Aksora)</span>
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pushed (Aksora)</span>
                  </span>
                )
              )}

              {/* Google Sheets Synced Status Badge (Action is inside ... menu) */}
              {ticket.sheets_synced && (
                ticket.sheets_url ? (
                  <a
                    href={ticket.sheets_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Synced (Sheets)</span>
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Synced (Sheets)</span>
                  </span>
                )
              )}
            </div>

            {/* Right side: Edit, Copy Ticket, More (...) */}
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

              {/* Primary Action: Copy Markdown */}
              <button
                type="button"
                onClick={copyToClipboard}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition shadow-xs ${
                  copiedAll
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                }`}
                title="Copy ticket as Markdown to clipboard"
              >
                {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAll ? "Copied" : "Copy Markdown"}</span>
              </button>

              {/* More (...) dropdown: Preview, Export, Share, Aksora, Sheets */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 transition"
                  title="More options"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {showMoreMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                    <div className="absolute right-0 bottom-full mb-1.5 w-52 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl z-50 py-1 text-xs animate-in fade-in zoom-in-95 duration-150">
                      {/* Compact View Toggle */}
                      <button
                        type="button"
                        onClick={() => { setShowMoreMenu(false); setIsCompactView(!isCompactView); }}
                        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                      >
                        <div className="flex items-center gap-2">
                          <Eye className="w-3.5 h-3.5 text-blue-500" />
                          <span>{isCompactView ? "Show Full View" : "Show Compact View"}</span>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {isCompactView ? "Full View" : "Compact"}
                        </span>
                      </button>

                      {/* Preview Modal */}
                      <button
                        type="button"
                        onClick={() => { setShowMoreMenu(false); setShowPreviewModal(true); }}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        <span>Preview Jira Issue</span>
                      </button>

                      {/* Divider */}
                      <div className="border-t border-slate-100 dark:border-slate-700 my-0.5" />

                      {/* Export options */}
                      <button
                        type="button"
                        onClick={() => { setShowMoreMenu(false); handlePrintPdf(); }}
                        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                      >
                        <div className="flex items-center gap-2">
                          <Printer className="w-3.5 h-3.5 text-rose-500" />
                          <span>Print / Export PDF</span>
                        </div>
                        <span className="px-1.5 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-600">PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowMoreMenu(false); handleDownloadMd(); }}
                        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-blue-500" />
                          <span>Markdown (.md)</span>
                        </div>
                        <span className="px-1.5 rounded text-[9px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-600">MD</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowMoreMenu(false); handleDownloadCsv(); }}
                        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                      >
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Spreadsheet (.csv)</span>
                        </div>
                        <span className="px-1.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-600">CSV</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowMoreMenu(false); handleDownloadJson(); }}
                        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 text-center font-mono font-bold text-[10px] text-amber-500">{`{}`}</span>
                          <span>JSON (.json)</span>
                        </div>
                        <span className="px-1.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-600">JSON</span>
                      </button>

                      {/* Divider */}
                      <div className="border-t border-slate-100 dark:border-slate-700 my-0.5" />

                      {/* Share */}
                      <button
                        type="button"
                        onClick={() => { setShowMoreMenu(false); handleShareTicket(); }}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                      >
                        <Share2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Share</span>
                      </button>

                      {/* Aksora (if configured and not yet pushed) */}
                      {!readOnly && aksoraConfigured && onPushToAksora && !ticket.aksora_pushed && (
                        <button
                          type="button"
                          onClick={() => { setShowMoreMenu(false); onPushToAksora(ticket); }}
                          disabled={pushingAksora}
                          className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition disabled:opacity-50"
                        >
                          {pushingAksora ? <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" /> : <Share2 className="w-3.5 h-3.5 text-purple-500" />}
                          <span>{pushingAksora ? "Pushing..." : "Push to Aksora"}</span>
                        </button>
                      )}

                      {/* Sheets (if configured and not yet synced) */}
                      {!readOnly && sheetsConfigured && onSyncToSheets && !ticket.sheets_synced && (
                        <button
                          type="button"
                          onClick={() => { setShowMoreMenu(false); onSyncToSheets(ticket); }}
                          disabled={syncingSheets}
                          className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition disabled:opacity-50"
                        >
                          {syncingSheets ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" /> : <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />}
                          <span>{syncingSheets ? "Syncing..." : "Sync to Sheets"}</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      ) : isUser ? (
        isEditingUserMsg ? (
          <div className="space-y-2.5">
            <AutoResizeTextarea
              value={userMsgDraft}
              onChange={(e) => setUserMsgDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (!userMsgDraft.trim() || isRegenerating || isLoading) return;
                  setIsEditingUserMsg(false);
                  onEditUserMessage?.(msg.id, userMsgDraft.trim());
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setIsEditingUserMsg(false);
                  setUserMsgDraft(msg.content);
                }
              }}
              className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-blue-500"
              placeholder="Edit your message..."
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <span className="text-[10px] text-slate-300/80">Ctrl+Enter kirim • Esc batal</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingUserMsg(false);
                    setUserMsgDraft(msg.content);
                  }}
                  disabled={isRegenerating || isLoading}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!userMsgDraft.trim() || isRegenerating || isLoading) return;
                    setIsEditingUserMsg(false);
                    onEditUserMessage?.(msg.id, userMsgDraft.trim());
                  }}
                  disabled={!userMsgDraft.trim() || isRegenerating || isLoading}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {isRegenerating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  <span>Simpan & Kirim</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

            {/* ChatGPT-style Action Bar on User Message */}
            <div className="flex items-center justify-end gap-1.5 pt-2 mt-2 border-t border-white/10 text-xs">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(msg.content);
                  setCopiedUserMsg(true);
                  setTimeout(() => setCopiedUserMsg(false), 2000);
                }}
                className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition"
                title="Salin teks pesan"
              >
                {copiedUserMsg ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {onEditUserMessage && !readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    setUserMsgDraft(msg.content);
                    setIsEditingUserMsg(true);
                  }}
                  disabled={isRegenerating || isLoading}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-300 hover:text-white hover:bg-white/10 transition disabled:opacity-50"
                  title="Edit pesan ini & AI akan respons ulang"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              )}

              {onResendUserMessage && !readOnly && (
                <button
                  type="button"
                  onClick={() => onResendUserMessage(msg.id)}
                  disabled={isRegenerating || isLoading}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-300 hover:text-white hover:bg-white/10 transition disabled:opacity-50"
                  title="Kirim ulang pesan ini & AI akan respons ulang"
                >
                  <RotateCcw className={`w-3 h-3 ${isRegenerating ? "animate-spin" : ""}`} />
                  <span>Kirim Ulang</span>
                </button>
              )}
            </div>
          </div>
        )
      ) : (
        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
      )}

      {/* Side-by-side Jira issue visual preview modal */}
      {showPreviewModal && ticket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-blue-600" />
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

      <span className={`text-[10px] block mt-2 ${isUser ? "text-slate-400" : "text-slate-400"}`}>
        {msg.timestamp}
      </span>
    </div>
  );
}
