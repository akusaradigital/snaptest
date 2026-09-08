"use client";

import { useEffect, useState } from "react";
import { Camera, ExternalLink, RefreshCw } from "lucide-react";

interface OEmbedData {
  title?: string;
  description?: string;
  thumbnail_url?: string | null;
  capture_type?: string;
  provider_name?: string;
  author_name?: string;
}

const embedCache = new Map<string, OEmbedData | null>();

export function BugSnapPreviewCard({ url }: { url: string }) {
  const cleanUrl = (url || "").trim().replace(/[)\]"'>.,;]+$/, "");
  const [data, setData] = useState<OEmbedData | null>(() => embedCache.get(cleanUrl) || null);
  const [loading, setLoading] = useState(!embedCache.has(cleanUrl));
  const [retrying, setRetrying] = useState(false);

  const fetchOEmbed = async (targetUrl: string) => {
    const bugsnapBase = process.env.NEXT_PUBLIC_BUGSNAP_URL || "https://bugsnap.akusaraproject.my.id";
    const oembedUrl = `${bugsnapBase.replace(/\/+$/, "")}/api/oembed?url=${encodeURIComponent(targetUrl)}`;
    try {
      const res = await fetch(oembedUrl);
      const json = res.ok ? await res.json() : null;
      embedCache.set(targetUrl, json);
      setData(json);
    } catch {
      embedCache.set(targetUrl, null);
      setData(null);
    }
  };

  const handleRetry = async () => {
    if (retrying || !cleanUrl) return;
    setRetrying(true);
    embedCache.delete(cleanUrl);
    await fetchOEmbed(cleanUrl);
    setRetrying(false);
  };

  useEffect(() => {
    if (!cleanUrl) {
      setLoading(false);
      return;
    }

    if (embedCache.has(cleanUrl)) {
      setData(embedCache.get(cleanUrl) || null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchOEmbed(cleanUrl).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [cleanUrl]);

  if (loading) {
    return (
      <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-500">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Camera className="w-4 h-4 text-sky-500 animate-pulse shrink-0" />
          <span className="truncate text-slate-600 dark:text-slate-300 font-mono text-[11px]">{cleanUrl}</span>
        </div>
        <span className="text-[11px] text-sky-600 dark:text-sky-400 font-medium shrink-0 animate-pulse">Loading preview...</span>
      </div>
    );
  }

  // Graceful fallback if oEmbed fails or is unavailable — NEVER return null
  if (!data) {
    return (
      <div className="mt-1 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/80 p-3 shadow-xs text-left">
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
            <Camera className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span>BugSnap Capture</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              title="Retry fetching preview"
              className="inline-flex items-center gap-1 rounded-md bg-white dark:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 transition cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 text-slate-500 ${retrying ? "animate-spin" : ""}`} />
              <span>{retrying ? "Retrying..." : "Retry"}</span>
            </button>
            <a
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-white dark:bg-slate-700 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-600 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-600 shrink-0 transition"
            >
              <span>Open Capture</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 underline break-all hover:text-blue-800 dark:hover:text-blue-300 font-mono"
          >
            {cleanUrl}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/80 p-3 shadow-xs text-left">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-700/80 pb-1.5 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
          <Camera className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span>BugSnap Capture</span>
          {data.capture_type && (
            <span className="rounded bg-sky-100 dark:bg-sky-950/60 px-1 py-0.2 text-[10px] uppercase font-bold text-sky-800 dark:text-sky-300">
              {data.capture_type}
            </span>
          )}
        </div>
        <a
          href={cleanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
        >
          <span>Open</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="mt-2 flex gap-3">
        {data.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.thumbnail_url}
            alt={data.title || "Capture thumbnail"}
            className="h-16 w-24 rounded object-cover border border-slate-200 dark:border-slate-700 bg-slate-900 flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{data.title || "BugSnap Capture"}</h4>
          {data.description && (
            <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">{data.description}</p>
          )}
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline break-all block truncate font-mono"
          >
            {cleanUrl}
          </a>
        </div>
      </div>
    </div>
  );
}
