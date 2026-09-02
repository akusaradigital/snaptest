"use client";

import { useEffect, useState } from "react";
import { Camera, ExternalLink } from "lucide-react";

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
  const [data, setData] = useState<OEmbedData | null>(() => embedCache.get(url) || null);
  const [loading, setLoading] = useState(!embedCache.has(url));

  useEffect(() => {
    if (embedCache.has(url)) {
      setData(embedCache.get(url) || null);
      setLoading(false);
      return;
    }

    const bugsnapBase = process.env.NEXT_PUBLIC_BUGSNAP_URL || "https://bugsnap.akusaraproject.my.id";
    const oembedUrl = `${bugsnapBase.replace(/\/+$/, "")}/api/oembed?url=${encodeURIComponent(url)}`;

    let cancelled = false;
    fetch(oembedUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return;
        embedCache.set(url, json);
        setData(json);
      })
      .catch(() => {
        if (!cancelled) {
          embedCache.set(url, null);
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500 animate-pulse">
        <Camera className="w-4 h-4" />
        <span>Loading BugSnap preview...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 shadow-sm text-left">
      <div className="flex items-center justify-between gap-2 border-b border-indigo-100 pb-1.5 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-indigo-700">
          <Camera className="w-3.5 h-3.5" />
          <span>BugSnap Capture</span>
          {data.capture_type && (
            <span className="rounded bg-indigo-100 px-1 py-0.2 text-[10px] uppercase font-bold text-indigo-800">
              {data.capture_type}
            </span>
          )}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
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
            className="h-16 w-24 rounded object-cover border border-slate-200 bg-slate-900 flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <h4 className="text-xs font-semibold text-slate-900 truncate">{data.title}</h4>
          {data.description && (
            <p className="text-[11px] text-slate-600 line-clamp-2">{data.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
