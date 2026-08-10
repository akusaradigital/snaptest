export const SESSION_LIMITS = {
  id: 128,
  agentType: 64,
  title: 200,
  dataBytes: 1_000_000,
} as const;

export type SessionData = Record<string, unknown> | unknown[];
export interface VersionedSessionData<T extends SessionData = SessionData> {
  version: 1;
  data: T;
}

export interface SessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface SessionDetail<T extends SessionData = SessionData> {
  id: string;
  title: string;
  updated_at: string;
  data: T;
  version: 1;
}

export interface SessionUpsert<T extends SessionData = SessionData> {
  id: string;
  agent_type: string;
  title?: string;
  data_json: T | VersionedSessionData<T>;
}

export function isSessionData(value: unknown): value is SessionData {
  return Array.isArray(value) || (value !== null && typeof value === "object");
}

export function decodeSessionData(value: unknown): VersionedSessionData {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "version" in value
  ) {
    const candidate = value as { version?: unknown; data?: unknown };
    if (candidate.version !== 1) throw new Error("Unsupported session data version");
    if (!isSessionData(candidate.data)) throw new Error("Session data must be an object or array");
    return { version: 1, data: candidate.data };
  }
  if (!isSessionData(value)) throw new Error("Session data must be an object or array");
  return { version: 1, data: value };
}
