"use client";

import { useState, useEffect } from "react";
import { X, Check, Loader2, ExternalLink, FileSpreadsheet, LogIn } from "lucide-react";
import toast from "react-hot-toast";

export interface SendToSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  defaultSheetName: string;
  headers: string[];
  rows: (string | number | boolean | null)[][];
  onSuccess?: (sheetUrl: string) => void;
}

export default function SendToSheetsModal({
  isOpen,
  onClose,
  title = "Send to Google Spreadsheet",
  defaultSheetName,
  headers,
  rows,
  onSuccess,
}: SendToSheetsModalProps) {
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetName, setSheetName] = useState(defaultSheetName);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncedUrl, setSyncedUrl] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [hasWebhook, setHasWebhook] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSyncedUrl(null);
    setSheetName(defaultSheetName);
    try {
      const saved = localStorage.getItem("sheets_config");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.sheet_url) setSheetUrl(parsed.sheet_url);
        if (parsed.google_email) setGoogleEmail(parsed.google_email);
        setHasToken(Boolean(parsed.access_token));
        setHasWebhook(Boolean(parsed.webhook_url));
      }
    } catch {}
  }, [isOpen, defaultSheetName]);

  if (!isOpen) return null;

  const handleConnectGoogle = () => {
    // Save current draft sheet URL to storage first so it is preserved
    try {
      const saved = JSON.parse(localStorage.getItem("sheets_config") || "{}");
      localStorage.setItem("sheets_config", JSON.stringify({ ...saved, sheet_url: sheetUrl.trim() }));
    } catch {}
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `/api/sheets/oauth/login?return_url=${encodeURIComponent(currentPath)}`;
  };

  const handleSend = async () => {
    if (!sheetUrl.trim() && !hasWebhook) {
      toast.error("Please paste your Google Spreadsheet link first.");
      return;
    }

    setIsSyncing(true);
    try {
      const saved = JSON.parse(localStorage.getItem("sheets_config") || "{}");
      const accessToken = saved.access_token;
      const refreshToken = saved.refresh_token;
      const webhookUrl = saved.webhook_url;

      const res = await fetch("/api/sheets/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet_url: sheetUrl.trim(),
          sheet_name: sheetName.trim() || defaultSheetName,
          headers,
          rows,
          access_token: accessToken,
          refresh_token: refreshToken,
          webhook_url: webhookUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.need_auth) {
          toast.error("Please connect your Google Account first to allow writing to this spreadsheet.");
          return;
        }
        throw new Error(data.detail || "Failed to sync to Google Spreadsheet");
      }

      // Save spreadsheet link to localStorage for all future sends
      try {
        localStorage.setItem(
          "sheets_config",
          JSON.stringify({
            ...saved,
            sheet_url: sheetUrl.trim(),
            sheet_name: sheetName.trim(),
          })
        );
      } catch {}

      const finalUrl = data.sheet_url || sheetUrl.trim();
      setSyncedUrl(finalUrl);
      toast.success(`Successfully synced ${rows.length} rows to Google Spreadsheet!`);
      onSuccess?.(finalUrl);
    } catch (err: any) {
      toast.error(err.message || "Failed to send data to Spreadsheet");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
              <p className="text-[11px] text-slate-500">{rows.length} rows ready to export</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success State */}
        {syncedUrl ? (
          <div className="py-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Export Complete!</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {rows.length} rows were appended to tab &quot;<strong>{sheetName}</strong>&quot;.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <a
                href={syncedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
              >
                <span>Open Google Sheet</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary text-xs px-3.5 py-2"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Form State */
          <div className="space-y-3.5 text-xs">
            {/* Google Connection Status Banner */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${hasToken ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {hasToken
                    ? `Google Connected${googleEmail ? ` (${googleEmail})` : ""}`
                    : hasWebhook
                    ? "Webhook Connected"
                    : "Google Account Not Connected"}
                </span>
              </div>
              {!hasToken && (
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-100 flex items-center gap-1 transition shadow-xs"
                >
                  <LogIn className="w-3 h-3 text-indigo-500" />
                  <span>Connect Google</span>
                </button>
              )}
            </div>

            {/* Google Spreadsheet URL Input */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Google Spreadsheet Link <span className="text-rose-500">*</span>
              </label>
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Paste the URL of any Google Sheet you have access to. It will be saved for all future exports.
              </p>
            </div>

            {/* Target Tab Name Input */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Target Sheet Tab
              </label>
              <input
                type="text"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder={defaultSheetName}
                className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                If the tab does not exist in your spreadsheet, SnapTest will automatically create it.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isSyncing}
                onClick={onClose}
                className="btn-secondary text-xs px-3.5 py-2 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSyncing || (!sheetUrl.trim() && !hasWebhook)}
                onClick={handleSend}
                className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 shadow-sm"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending to Sheet...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Send to Spreadsheet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
