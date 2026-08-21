export const UNIFIED_QA_SESSION_VERSION = 2;

const INTENTS = [
  ["apply_repair", /\b(?:apply|accept|use)\s+(?:the\s+)?(?:suggested\s+)?(?:repair|fix|patch)\b/i],
  ["generate_playwright", /\b(?:generate|create|write|make)\b.*\bplaywright\b|\bplaywright\b.*\b(?:script|test|spec)\b/i],
  ["generate_gherkin", /\b(?:generate|create|write|make)\b.*\bgherkin\b|\bgherkin\b.*\b(?:feature|scenario)\b/i],
  ["jira_draft", /\b(?:draft|prepare|write)\b.*\bjira\b|\bjira\b.*\bdraft\b/i],
  ["jira_create", /\b(?:create|submit|file|post)\b.*\bjira\b|\bjira\b.*\b(?:create|submit|file|post)\b/i],
  ["jira_open", /\b(?:open|view|show)\b.*\bjira\b|\bjira\b.*\b(?:open|view|show)\b/i],
  ["aksora_create", /\b(?:create|submit|file|post|push)\b.*\baksora\b|\baksora\b.*\b(?:create|submit|file|post|push)\b/i],
  ["dedupe", /\b(?:dedupe|de-duplicate|remove duplicates?|merge duplicates?)\b/i],
  ["prioritize", /\b(?:prioriti[sz]e|rank|reorder by priority)\b/i],
  ["retry", /\b(?:retry|rerun|run again|try again)\b/i],
  ["analyze", /\b(?:analy[sz]e|inspect|diagnose|explain failure)\b/i],
  ["repair", /\b(?:repair|fix|heal)\b/i],
  ["remove", /\b(?:remove|delete|drop)\b/i],
  ["edit", /\b(?:edit|update|change|modify|rename)\b/i],
  ["export", /\b(?:export|download)\b/i],
  ["run", /\b(?:run|execute)\b/i],
  ["generate", /\b(?:generate|create|write|make|add)\b/i],
];

export function classifyUnifiedQaIntent(input) {
  const text = typeof input === "string" ? input.trim() : "";
  return INTENTS.find(([, pattern]) => pattern.test(text))?.[0] ?? "unknown";
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter(key => key !== "clientId").map(key => [key, canonicalize(value[key])]));
  return value;
}

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0).toString(36);
}

export function testCaseClientId(testCase) {
  if (!testCase || typeof testCase !== "object" || Array.isArray(testCase)) throw new TypeError("Test case must be an object");
  return `tc_${hash(JSON.stringify(canonicalize(testCase)))}`;
}

export function withTestCaseClientIds(testCases) {
  if (!Array.isArray(testCases)) throw new TypeError("Test cases must be an array");
  const counts = new Map();
  return testCases.map(testCase => {
    const base = testCaseClientId(testCase);
    const occurrence = counts.get(base) ?? 0;
    counts.set(base, occurrence + 1);
    return { ...testCase, clientId: occurrence ? `${base}_${occurrence + 1}` : base };
  });
}

function isSession(value) {
  return value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string" && typeof value.title === "string" && typeof value.updatedAt === "string" && Array.isArray(value.messages);
}

export function migrateUnifiedQaSessions(value) {
  let sessions;
  if (Array.isArray(value)) sessions = value;
  else if (value && typeof value === "object" && value.version === UNIFIED_QA_SESSION_VERSION && Array.isArray(value.sessions)) sessions = value.sessions;
  else throw new TypeError("Unsupported Unified QA session data");
  if (!sessions.every(isSession)) throw new TypeError("Invalid Unified QA session");
  return { version: UNIFIED_QA_SESSION_VERSION, sessions };
}

export function parseUnifiedQaSessionsJson(json) {
  if (typeof json !== "string") throw new TypeError("Session JSON must be a string");
  return migrateUnifiedQaSessions(JSON.parse(json));
}

export function createSseParser(onEvent) {
  if (typeof onEvent !== "function") throw new TypeError("SSE handler must be a function");
  let buffer = "";
  const dispatch = block => {
    block = block.replace(/\r\n?/g, "\n");
    let event = "message";
    let id;
    const data = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "data") data.push(value);
      else if (field === "event") event = value;
      else if (field === "id" && !value.includes("\0")) id = value;
    }
    if (data.length) onEvent({ event, data: data.join("\n"), ...(id === undefined ? {} : { id }) });
  };
  return {
    push(chunk) {
      if (typeof chunk !== "string") throw new TypeError("SSE chunk must be a string");
      buffer += chunk;
      let match;
      while ((match = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
        dispatch(buffer.slice(0, match.index).replace(/\r\n?/g, "\n"));
        buffer = buffer.slice(match.index + match[0].length);
      }
    },
    end() {
      if (buffer) dispatch(buffer);
      buffer = "";
    },
  };
}
