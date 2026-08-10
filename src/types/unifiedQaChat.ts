import type { GenerateResponse, TestCase } from "./index.ts";

export const UNIFIED_QA_SESSION_VERSION = 2 as const;

export type UnifiedQaIntent =
  | "generate"
  | "edit"
  | "remove"
  | "dedupe"
  | "prioritize"
  | "generate_playwright"
  | "generate_gherkin"
  | "run"
  | "retry"
  | "analyze"
  | "repair"
  | "apply_repair"
  | "jira_draft"
  | "jira_create"
  | "jira_open"
  | "export"
  | "unknown";

export interface UnifiedQaMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image_preview?: string;
  status?: "generating" | "complete" | "error";
  result?: GenerateResponse;
  timestamp: string;
}

export type UnifiedQaRunState = { status: "pending" | "running" | "passed" | "failed" | "blocked" | "cancelled"; actual?: string };
export type UnifiedQaRepair = { caseId: string; analysis: Record<string, unknown>; proposed_script: string; diff: string; rationale: string; confidence: number };
export type UnifiedQaJiraDraft = Record<string, unknown> & { title?: string; markdown?: string };

export interface UnifiedQaArtifacts {
  cases: ClientTestCase[];
  playwright: GenerateResponse["scripts"];
  gherkin: string;
  tab: "cases" | "playwright" | "gherkin";
  selectedIds: string[];
  runStates: Record<string, UnifiedQaRunState>;
  progress: string[];
  repair?: UnifiedQaRepair;
  jiraDraft?: UnifiedQaJiraDraft;
  jiraIssue?: { key: string; url: string };
}

export interface UnifiedQaSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: UnifiedQaMessage[];
  artifacts?: UnifiedQaArtifacts;
}

export interface UnifiedQaSessionEnvelope {
  version: typeof UNIFIED_QA_SESSION_VERSION;
  sessions: UnifiedQaSession[];
}

export type ClientTestCase = TestCase & { clientId: string };
