import type { ClientTestCase, UnifiedQaIntent, UnifiedQaSessionEnvelope } from "../types/unifiedQaChat";
import type { TestCase } from "../types";

export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

export interface SseParser {
  push(chunk: string): void;
  end(): void;
}

export const UNIFIED_QA_SESSION_VERSION: 2;
export function classifyUnifiedQaIntent(input: unknown): UnifiedQaIntent;
export function testCaseClientId(testCase: object): string;
export function withTestCaseClientIds(testCases: TestCase[]): ClientTestCase[];
export function migrateUnifiedQaSessions(value: unknown): UnifiedQaSessionEnvelope;
export function parseUnifiedQaSessionsJson(json: string): UnifiedQaSessionEnvelope;
export function createSseParser(onEvent: (event: SseEvent) => void): SseParser;
