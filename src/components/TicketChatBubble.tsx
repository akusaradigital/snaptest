"use client";

import { Ticket, Copy, Check, Pencil, Loader2, Share2, Download, Eye, X, Video, Image as ImageIcon, ExternalLink, RefreshCw, Printer, AlertCircle } from "lucide-react";
import { ChatMessage } from "./pages/TicketPage";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";

const stripStars = (str?: string | null) => (str || "").replace(/\*\*/g, "");

export default function TicketChatBubble({
  msg,
  onPushToJira,
  readOnly = false,
  jiraConfigured = true,
  pushingJira = false,
  onPushToAksora,
  aksoraConfigured = true,
  pushingAksora = false,
  onUpdateTicket,
}: {
  msg: ChatMessage;
  onPushToJira?: (ticketResult: Record<string, any>) => void;
  readOnly?: boolean;
  jiraConfigured?: boolean;
  pushingJira?: boolean;
  onPushToAksora?: (ticketResult: Record<string, any>) => void;
  aksoraConfigured?: boolean;
  pushingAksora?: boolean;
  onUpdateTicket?: (messageId: string, updates: Record<string, any>) => void;
}) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [checkedCriteria, setCheckedCriteria] = useState<Record<number, boolean>>({});
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const startEditing = () => {
    setDraft({
      issue_type: msg.ticket_result?.issue_type || "Bug",
      title: stripStars(msg.ticket_result?.title),
      description: stripStars(msg.ticket_result?.description),
      component: msg.ticket_result?.component || "",
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
    if (t.evidence) lines.push(`\n**Evidence:**\n${t.evidence}`);
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

  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(msg.ticket_result || {}, null, 2);
    const title = (msg.ticket_result?.title || "ticket").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    downloadFile(jsonStr, `${title}.json`, "application/json");
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

  const getEvidenceType = (url?: string) => {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.match(/\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/) || lower.includes("image")) {
      return { label: "Image", icon: <ImageIcon className="w-3 h-3 text-sky-500" /> };
    }
    if (lower.match(/\.(mp4|webm|mov|mkv)(\?.*)?$/) || lower.includes("loom.com") || lower.includes("drive.google.com") || lower.includes("/v/")) {
      return { label: "Video / Screen Recording", icon: <Video className="w-3 h-3 text-rose-500" /> };
    }
    return { label: "Link", icon: <ExternalLink className="w-3 h-3 text-indigo-500" /> };
  };

  const evidenceInfo = getEvidenceType(ticket?.evidence);

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
            </div>

            {/* Timeline Tracking Status */}
            <div className="flex items-center gap-1.5">
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
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Component / Module (Optional)</span>
                <input
                  value={draft.component || ""}
                  onChange={(e) => setDraft({ ...draft, component: e.target.value })}
                  placeholder="e.g. Auth, Payment, Talent Library"
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </label>
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
          ) : (
          <>
          {ticket.title && (
            <p><strong>Title:</strong> {stripStars(ticket.title)}</p>
          )}

          {ticket.component && (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs">Component:</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium">
                {ticket.component}
              </span>
            </div>
          )}

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
              <p className="font-bold mb-1 flex items-center gap-1.5">
                Evidence:
                {evidenceInfo && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[10px] font-normal text-slate-600 dark:text-slate-300">
                    {evidenceInfo.icon}
                    <span>{evidenceInfo.label}</span>
                  </span>
                )}
              </p>
              <a href={ticket.evidence} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 underline break-all text-xs flex items-center gap-1">
                <span>{ticket.evidence}</span>
                <ExternalLink className="w-3 h-3 inline-block shrink-0" />
              </a>
            </div>
          )}
          </>
          )}

          {/* Action Bar inside Chat Bubble */}
          {!isEditing && (
          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {ticket.jira_key && ticket.jira_url ? (
                <a
                  href={ticket.jira_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Pushed ({ticket.jira_key})</span>
                </a>
              ) : !readOnly && !jiraConfigured ? (
                <a
                  href="/settings?tab=integrations"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition"
                >
                  <Ticket className="w-3.5 h-3.5 text-amber-600" />
                  <span>Connect Jira</span>
                </a>
              ) : !readOnly && onPushToJira ? (
                <button
                  type="button"
                  onClick={() => onPushToJira(ticket)}
                  disabled={pushingJira}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pushingJira ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  ) : (
                    <Ticket className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>{pushingJira ? "Pushing to Jira..." : "Push to Jira"}</span>
                </button>
              ) : null}

              {ticket.aksora_pushed ? (
                ticket.aksora_url ? (
                  <a
                    href={ticket.aksora_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pushed to Aksora</span>
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pushed to Aksora</span>
                  </span>
                )
              ) : !readOnly && !aksoraConfigured ? (
                <a
                  href="/settings?tab=integrations"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 transition"
                >
                  <Share2 className="w-3.5 h-3.5 text-slate-600" />
                  <span>Connect Aksora</span>
                </a>
              ) : !readOnly && onPushToAksora ? (
                <button
                  type="button"
                  onClick={() => onPushToAksora(ticket)}
                  disabled={pushingAksora}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pushingAksora ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>{pushingAksora ? "Pushing to Aksora..." : "Push to Aksora"}</span>
                </button>
              ) : null}

              {!readOnly && onUpdateTicket && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 transition"
                  title="Edit ticket fields"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 transition"
                title="Preview side-by-side Jira issue format"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePrintPdf}
                className="p-1.5 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 transition"
                title="Print ticket / Save as PDF"
              >
                <Printer className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDownloadMd}
                className="p-1.5 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 transition"
                title="Download as Markdown (.md)"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDownloadJson}
                className="px-2 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 transition"
                title="Download as JSON (.json)"
              >
                <span>JSON</span>
              </button>
              <button
                type="button"
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-sm"
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

      <span className={`text-[10px] block mt-2 ${isUser ? "text-indigo-200" : "text-slate-400"}`}>
        {msg.timestamp}
      </span>
    </div>
  );
}
