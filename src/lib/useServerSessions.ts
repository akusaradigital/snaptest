"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import type { Dispatch, SetStateAction } from "react";
import type { SessionData, SessionDetail, SessionSummary } from "./serverSessionContract";

interface ApiErrorBody { detail?: string; error?: string }

async function apiError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null) as ApiErrorBody | null;
  return new Error(body?.detail || body?.error || `Session request failed (${response.status})`);
}

function readCache<T>(key: string): T[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

export interface UseServerSessions<TData extends SessionData, TSummary extends SessionSummary = SessionSummary> {
  sessions: TSummary[];
  setSessions: Dispatch<SetStateAction<TSummary[]>>;
  loading: boolean;
  error: Error | null;
  isAuthed: boolean;
  loadSessions: () => Promise<void>;
  fetchSessionData: (id: string) => Promise<TData | null>;
  saveToServer: (id: string, title: string, data: TData) => Promise<void>;
  deleteFromServer: (id: string) => Promise<void>;
}

export function useServerSessions<TData extends SessionData = SessionData, TSummary extends SessionSummary = SessionSummary>(
  agentType: string,
  localStorageKey: string,
): UseServerSessions<TData, TSummary> {
  const { data: session, status } = useSession();
  const [sessions, setSessions] = useState<TSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isAuthed = status === "authenticated" && !!session?.user;

  const loadSessions = useCallback(async () => {
    if (status === "loading") return;
    setLoading(true);
    setError(null);
    try {
      if (!isAuthed) {
        setSessions(readCache<TSummary>(localStorageKey));
        return;
      }
      const response = await fetch(`/api/sessions?agent_type=${encodeURIComponent(agentType)}`);
      if (!response.ok) throw await apiError(response);
      const body: unknown = await response.json();
      const items = body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)
        ? (body as { items: TSummary[] }).items
        : [];
      setSessions(items);
      try { localStorage.setItem(localStorageKey, JSON.stringify(items)); } catch {}
    } catch (cause) {
      const nextError = cause instanceof Error ? cause : new Error("Failed to load sessions");
      setError(nextError);
      // ponytail: cache is an offline fallback only; add stale-state UI if callers need to distinguish it.
      setSessions(readCache<TSummary>(localStorageKey));
    } finally {
      setLoading(false);
    }
  }, [status, isAuthed, agentType, localStorageKey]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  const fetchSessionData = useCallback(async (id: string): Promise<TData | null> => {
    if (!isAuthed) return null;
    const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
    if (!response.ok) throw await apiError(response);
    const detail = await response.json() as SessionDetail<TData>;
    return detail.data;
  }, [isAuthed]);

  const saveToServer = useCallback(async (id: string, title: string, data: TData): Promise<void> => {
    if (!isAuthed) return;
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, agent_type: agentType, title, data_json: { version: 1, data } }),
    });
    if (!response.ok) throw await apiError(response);
  }, [isAuthed, agentType]);

  const deleteFromServer = useCallback(async (id: string): Promise<void> => {
    if (!isAuthed) return;
    const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) throw await apiError(response);
  }, [isAuthed]);

  return { sessions, setSessions, loading, error, isAuthed, loadSessions, fetchSessionData, saveToServer, deleteFromServer };
}
