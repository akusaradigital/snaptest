"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Activity,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Globe,
  X,
  Trash2,
  Loader2,
} from "lucide-react";
import { MonitoredUrl, MonitorListResponse } from "@/types";
import toast from "react-hot-toast";

const API_URL = "";

export default function MonitorPage() {
  const [monitoredUrls, setMonitoredUrls] = useState<MonitoredUrl[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const fetchMonitors = useCallback(async () => {
    try {
      const res = await axios.get<MonitorListResponse>(`${API_URL}/api/monitor`);
      setMonitoredUrls(res.data.items);
    } catch {
      toast.error("Failed to load monitors");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonitors();
  }, [fetchMonitors]);

  const handleAddUrl = async () => {
    if (!newUrl.trim()) return;
    setIsAdding(true);
    try {
      const res = await axios.post(`${API_URL}/api/monitor`, { url: newUrl.trim() });
      toast.success(`Monitoring ${res.data.title} (${res.data.selectors_total} selectors)`);
      setNewUrl("");
      setShowAddForm(false);
      await fetchMonitors();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to add URL");
    } finally {
      setIsAdding(false);
    }
  };

  const handleCheck = async (id: string) => {
    setCheckingId(id);
    try {
      const res = await axios.post(`${API_URL}/api/monitor/${id}/check`);
      toast.success(
        `Check complete: ${res.data.status} (${res.data.selectors_broken}/${res.data.selectors_total} broken)`
      );
      await fetchMonitors();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Health check failed");
    } finally {
      setCheckingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this URL from monitoring?")) return;
    try {
      await axios.delete(`${API_URL}/api/monitor/${id}`);
      setMonitoredUrls((prev) => prev.filter((item) => item.id !== id));
      toast.success("Monitor removed");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const getStatusIcon = (status: MonitoredUrl["status"]) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case "broken":
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: MonitoredUrl["status"]) => {
    const styles = {
      healthy: "bg-emerald-50 text-emerald-700",
      warning: "bg-amber-50 text-amber-700",
      broken: "bg-red-50 text-red-700",
    };
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "Never";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 lg:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-xl lg:text-2xl font-semibold text-slate-900 mb-2">
              Selector Health Monitor
            </h2>
            <p className="text-sm lg:text-base text-slate-500 max-w-xl">
              Track selector stability across your pages. Get alerted when selectors break
              after deployments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className={`flex items-center gap-2 self-start ${
              showAddForm
                ? "btn-ghost text-red-500 hover:text-red-700 hover:bg-red-50"
                : "btn-primary"
            }`}
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showAddForm ? "Cancel" : "Add URL"}
          </button>
        </div>
      </div>

      {/* Add URL Form */}
      {showAddForm && (
        <div className="card p-4 sm:p-5 mb-4 sm:mb-6">
          <label htmlFor="monitor-url" className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
            <Globe className="w-4 h-4 text-slate-400" />
            URL to Monitor
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="monitor-url"
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/login"
              className="input-field flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddUrl();
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddUrl}
              disabled={isAdding || !newUrl.trim()}
              className="btn-primary sm:w-auto flex items-center justify-center gap-2"
            >
              {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {isAdding ? "Adding..." : "Start Monitoring"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            We&apos;ll crawl this page and track all interactive element selectors over time.
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && monitoredUrls.length === 0 && !showAddForm && (
        <div className="card p-8 sm:p-12 text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Activity className="w-7 h-7 sm:w-8 sm:h-8 text-slate-400" />
          </div>
          <h3 className="text-base sm:text-lg font-medium text-slate-700 mb-2">No monitored pages</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-4">
            Add URLs to monitor their selector health. You&apos;ll be notified when selectors
            change or break after deployments.
          </p>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add your first URL
          </button>
        </div>
      )}

      {/* Monitored URLs List */}
      {!isLoading && monitoredUrls.length > 0 && (
        <div className="space-y-3">
          {monitoredUrls.map((item) => (
            <div key={item.id} className="card p-4 hover:shadow-elevated transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getStatusIcon(item.status)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{item.url}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Last checked: {formatDate(item.last_checked)} · {item.selectors_total} selectors tracked
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-7 sm:ml-0">
                  {getStatusBadge(item.status)}
                  {item.selectors_broken > 0 && (
                    <span className="text-xs text-red-600 font-medium">
                      {item.selectors_broken} broken
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCheck(item.id)}
                    disabled={checkingId === item.id}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition disabled:opacity-50"
                    aria-label="Re-check URL"
                    title="Re-check"
                  >
                    <RefreshCw className={`w-4 h-4 ${checkingId === item.id ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition"
                    aria-label="Delete monitor"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
