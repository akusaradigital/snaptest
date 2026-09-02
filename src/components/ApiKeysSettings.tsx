"use client";

import { useState, useEffect } from "react";
import { Key, Plus, Trash2, Copy, Check, Loader2, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function ApiKeysSettings() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<{ rawKey: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/api-keys");
      const data = await res.json();
      if (res.ok) {
        setKeys(data.keys || []);
      } else {
        toast.error(data.error || "Failed to load API keys");
      }
    } catch {
      toast.error("Network error while loading API keys");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create API key");

      setRevealedKey({ rawKey: data.key.rawKey, name: data.key.name });
      setNewKeyName("");
      toast.success("API key generated!");
      await loadKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this API key? Any tools using it will lose access immediately.")) {
      return;
    }
    setRevokingId(id);
    try {
      const res = await fetch(`/api/settings/api-keys?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke API key");
      toast.success("API key revoked");
      await loadKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke key");
    } finally {
      setRevokingId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("API key copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Revealed Key Banner (only shown once right after generation) */}
      {revealedKey && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Save your API Key for &ldquo;{revealedKey.name}&rdquo;</span>
          </div>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
            This key will never be shown again. Copy it now and paste it into BugSnap Chrome Extension options.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <code className="flex-1 px-3 py-2 bg-black/10 dark:bg-black/40 rounded-lg text-xs font-mono select-all overflow-x-auto">
              {revealedKey.rawKey}
            </code>
            <button
              onClick={() => copyToClipboard(revealedKey.rawKey)}
              className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={() => setRevealedKey(null)}
              className="px-3 py-2 bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 rounded-lg text-xs font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create New Key Form */}
      <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Inbound API Keys</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Create an API key to let BugSnap and other external tools push tickets directly into your SnapTest QA workspace.
        </p>
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            placeholder="Key name (e.g. BugSnap Chrome Extension)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800/60 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          <button
            type="submit"
            disabled={creating || !newKeyName.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors shrink-0"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Generate Key
          </button>
        </form>
      </div>

      {/* Keys List */}
      <div className="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm space-y-4">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
          Active API Keys
        </h4>

        {loading ? (
          <div className="py-6 flex items-center justify-center text-gray-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading keys...</span>
          </div>
        ) : keys.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center italic">
            No API keys yet. Generate one above to connect BugSnap.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {keys.map((k) => (
              <div key={k.id} className="py-3 flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {k.name}
                    </span>
                    <code className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-gray-600 dark:text-gray-400">
                      {k.prefix}...
                    </code>
                  </div>
                  <div className="text-[11px] text-gray-400">
                    Created: {new Date(k.createdAt).toLocaleDateString()} &bull; Last used:{" "}
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(k.id)}
                  disabled={revokingId === k.id}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                  title="Revoke API key"
                >
                  {revokingId === k.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
