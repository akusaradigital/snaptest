export interface ScriptFile {
  file_name: string;
  script_location: string;
  content: string;
}

export interface TestCase {
  number: number;
  name: string;
  type: 'POSITIVE' | 'NEGATIVE' | 'EDGE' | 'SECURITY' | 'BOUNDARY';
  pre_condition: string;
  test_steps: string[];
  expected_result: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  file_name: string;
  script_location: string;
  relevant_indices: number[];
}

export interface GenerateResponse {
  url?: string;
  history_id?: string;
  test_case_table: string;
  test_cases?: TestCase[];
  scripts: ScriptFile[];
  page_title: string;
  elements_found: number;
  tokens_used?: number;
}

export interface GenerateRequest {
  url: string;
  user_context: string;
  ai_provider?: string;
  ai_model?: string;
}

export interface ModelsResponse {
  providers: Record<string, string[]>;
  configured: Record<string, boolean>;
  status: Record<string, "connected" | "has_key" | "disconnected">;
  labels: Record<string, string>;
  current_provider: string;
  current_model: string;
}

export interface HistoryItem {
  id: string;
  url: string;
  user_context: string;
  page_title: string;
  elements_found: number;
  ai_provider: string;
  ai_model: string;
  scripts_count: number;
  test_cases_count?: number;
  user_id?: string;
  created_at: string;
}

export interface HistoryDetail extends HistoryItem {
  test_case_table: string;
  test_cases?: TestCase[];
  scripts: ScriptFile[];
}

export interface HistoryListResponse {
  items: HistoryItem[];
  count: number;
}

export interface TicketResult {
  fields: string[];
  issue_type: string | null;
  title: string | null;
  description: string | null;
  current_behavior: string | null;
  expected_result: string | null;
  actual_result: string | null;
  evidence: string | null;
  acceptance_criteria: string[] | null;
  markdown: string;
  tokens_used?: number;
}

export interface MonitoredUrl {
  id: string;
  url: string;
  last_checked: string;
  selectors_total: number;
  selectors_broken: number;
  status: 'healthy' | 'warning' | 'broken';
  created_at: string;
}

export interface MonitorListResponse {
  items: MonitoredUrl[];
}
