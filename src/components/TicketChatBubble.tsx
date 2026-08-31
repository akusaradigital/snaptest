"use client";

import { Ticket, Copy, Check, Pencil, Loader2, Share2 } from "lucide-react";
import { ChatMessage } from "./pages/TicketPage";
import { useState } from "react";
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

  const startEditing = () => {
    setDraft({
      title: stripStars(msg.ticket_result?.title),
      description: stripStars(msg.ticket_result?.description),
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

  const copyToClipboard = async () => {
    try {
      let text = msg.ticket_result?.markdown || "";
      if (!text && msg.ticket_result) {
        const lines: string[] = [];
        if (msg.ticket_result.issue_type) lines.push(`**Issue Type:** ${msg.ticket_result.issue_type}`);
        if (msg.ticket_result.title) lines.push(`**Title:** ${msg.ticket_result.title}`);
        if (msg.ticket_result.description) lines.push(`\n**Description:**\n${msg.ticket_result.description}`);
        if (msg.ticket_result.current_behavior) lines.push(`\n**Current Behavior:**\n${msg.ticket_result.current_behavior}`);
        if (msg.ticket_result.expected_result) lines.push(`\n**Expected Result:**\n${msg.ticket_result.expected_result}`);
        if (msg.ticket_result.actual_result) lines.push(`\n**Actual Result:**\n${msg.ticket_result.actual_result}`);
        if (msg.ticket_result.acceptance_criteria?.length) {
          lines.push(`\n**Acceptance Criteria:**\n${msg.ticket_result.acceptance_criteria.map((c: string) => `- [ ] ${c}`).join('\n')}`);
        }
        if (msg.ticket_result.evidence) lines.push(`\n**Evidence:**\n${msg.ticket_result.evidence}`);
        text = lines.join('\n');
      }
      await navigator.clipboard.writeText(text || msg.content || "");
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
      toast.success("Copied ticket to clipboard!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const isUser = msg.role === "user";
  const hasTicket = Boolean(
    !isUser &&
    msg.ticket_result &&
    (msg.ticket_result.has_ticket_data !== false ||
     msg.ticket_result.title ||
     msg.ticket_result.description ||
     msg.ticket_result.expected_result ||
     msg.ticket_result.issue_type)
  );

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

      {hasTicket && msg.ticket_result ? (
        <div className="space-y-3.5 leading-relaxed">
          {msg.content && <p className="text-slate-600 dark:text-slate-300 italic mb-3">{msg.content}</p>}

          {msg.ticket_result.issue_type && (
            <p><strong>Issue Type:</strong> {msg.ticket_result.issue_type}</p>
          )}

          {isEditing ? (
            <div className="space-y-2.5">
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Title</span>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Description</span>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={3}
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Current Behavior</span>
                <textarea
                  value={draft.current_behavior}
                  onChange={(e) => setDraft({ ...draft, current_behavior: e.target.value })}
                  rows={2}
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Expected Result</span>
                <textarea
                  value={draft.expected_result}
                  onChange={(e) => setDraft({ ...draft, expected_result: e.target.value })}
                  rows={2}
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Actual Result</span>
                <textarea
                  value={draft.actual_result}
                  onChange={(e) => setDraft({ ...draft, actual_result: e.target.value })}
                  rows={2}
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500">Evidence URL</span>
                <input
                  value={draft.evidence}
                  onChange={(e) => setDraft({ ...draft, evidence: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium"
                  placeholder="https://..."
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={saveEditing}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
          <>
          {msg.ticket_result.title && (
            <p><strong>Title:</strong> {stripStars(msg.ticket_result.title)}</p>
          )}
          {msg.ticket_result.description && (
            <div>
              <p className="font-bold mb-1">Description:</p>
              <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{stripStars(msg.ticket_result.description)}</p>
            </div>
          )}
          {msg.ticket_result.steps_to_reproduce?.length > 0 && (
            <div>
              <p className="font-bold mb-1">Steps to Reproduce:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-slate-200">
                {msg.ticket_result.steps_to_reproduce.map((step: string, idx: number) => (
                  <li key={idx} className="pl-1">{stripStars(step)}</li>
                ))}
              </ol>
            </div>
          )}
          {msg.ticket_result.current_behavior && (
            <div>
              <p className="font-bold mb-1">Current Behavior:</p>
              <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{stripStars(msg.ticket_result.current_behavior)}</p>
            </div>
          )}
          {msg.ticket_result.expected_result && (
            <div>
              <p className="font-bold mb-1">Expected Result:</p>
              <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{stripStars(msg.ticket_result.expected_result)}</p>
            </div>
          )}
          {msg.ticket_result.actual_result && (
            <div>
              <p className="font-bold mb-1">Actual Result:</p>
              <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{stripStars(msg.ticket_result.actual_result)}</p>
            </div>
          )}
          {msg.ticket_result.acceptance_criteria?.length > 0 && (
            <div>
              <p className="font-bold mb-1">Acceptance Criteria:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-200">
                {msg.ticket_result.acceptance_criteria.map((c: string, idx: number) => (
                  <li key={idx} className="pl-1">{stripStars(c)}</li>
                ))}
              </ul>
            </div>
          )}
          {msg.ticket_result.evidence && (
            <div>
              <p className="font-bold mb-1">Evidence:</p>
              <a href={msg.ticket_result.evidence} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 underline break-all">
                {msg.ticket_result.evidence}
              </a>
            </div>
          )}
          </>
          )}

          {/* Action Bar inside Chat Bubble */}
          {!isEditing && (
          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center gap-2">
            {msg.ticket_result?.jira_key && msg.ticket_result?.jira_url ? (
              <a
                href={msg.ticket_result.jira_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
              >
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Pushed ({msg.ticket_result.jira_key})</span>
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
                onClick={() => onPushToJira(msg.ticket_result!)}
                disabled={pushingJira}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-50"
              >
                {pushingJira ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                ) : (
                  <Ticket className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>{pushingJira ? "Pushing to Jira..." : "Push to Jira"}</span>
              </button>
            ) : null}

            {msg.ticket_result?.aksora_pushed ? (
              msg.ticket_result?.aksora_url ? (
                <a
                  href={msg.ticket_result.aksora_url}
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
                onClick={() => onPushToAksora(msg.ticket_result!)}
                disabled={pushingAksora}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-50"
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}

            <button
              type="button"
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-sm"
            >
              {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedAll ? "Copied" : "Copy Ticket"}</span>
            </button>
          </div>
          )}
        </div>
      ) : (
        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
      )}

      <span className={`text-[10px] block mt-2 ${isUser ? "text-indigo-200" : "text-slate-400"}`}>
        {msg.timestamp}
      </span>
    </div>
  );
}
