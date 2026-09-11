import assert from "node:assert/strict";

// Mock localStorage for node environment
const storage: Record<string, string> = {};
(globalThis as any).window = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => storage[key] || null,
  setItem: (key: string, val: string) => { storage[key] = val; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { for (const k in storage) delete storage[k]; },
};

import { rememberAiRule, getEffectiveAiRules, getStoredAiMemory } from "../src/lib/aiMemory";

// 1. Cross-Feature AI Memory persistence across all 5 modules + global
rememberAiRule("Format bahasa Indonesia profesional", "global");
rememberAiRule("Tidak perlu langkah reproduksi", "ticket");
rememberAiRule("Gunakan TypeScript & Page Object Model", "generator");
rememberAiRule("Prioritaskan security test matrix", "planner");
rememberAiRule("Mock email harus format @company.com", "data");
rememberAiRule("Wajib sertakan assertion HTTP 401 & 403", "api");

const mem = getStoredAiMemory();
assert.match(mem.globalCustomPrompt || "", /bahasa Indonesia/i);
assert.match(mem.ticketCustomPrompt || "", /langkah reproduksi/i);
assert.match(mem.customPrompt || "", /TypeScript/i);
assert.match(mem.plannerCustomPrompt || "", /security test/i);
assert.match(mem.dataCustomPrompt || "", /company\.com/i);
assert.match(mem.apiCustomPrompt || "", /401 & 403/i);

// 2. Test getEffectiveAiRules combines Global + Module Specific
const ticketRules = getEffectiveAiRules("ticket");
assert.match(ticketRules, /Global Preference/i);
assert.match(ticketRules, /Ticket Agent Specific Rules/i);

const generatorRules = getEffectiveAiRules("generator");
assert.match(generatorRules, /Global Preference/i);
assert.match(generatorRules, /Test Generator Specific Rules/i);

const apiRules = getEffectiveAiRules("api");
assert.match(apiRules, /Global Preference/i);
assert.match(apiRules, /API Agent Specific Rules/i);

const dataRules = getEffectiveAiRules("data");
assert.match(dataRules, /Global Preference/i);
assert.match(dataRules, /Data Generator Specific Rules/i);

const plannerRules = getEffectiveAiRules("planner");
assert.match(plannerRules, /Global Preference/i);
assert.match(plannerRules, /Test Planner Specific Rules/i);

// 3. Conversational vs Generation Intent Disambiguation Logic
function isTestGenerationRequest(text: string, hasFile: boolean, isUrl: boolean) {
  if (hasFile || isUrl) return true;
  const isExplicitGenerate = /^\s*(generate|buatkan|bikin|test|uji|buat)\s+(test|skenario|scenario|kasus|spec|e2e)\b/i.test(text.trim());
  return isExplicitGenerate;
}

assert.equal(isTestGenerationRequest("ingat format test case harus pakai Gherkin", false, false), false);
assert.equal(isTestGenerationRequest("apa bedanya playwright vs cypress?", false, false), false);
assert.equal(isTestGenerationRequest("bagaimana cara handle popup auth?", false, false), false);
assert.equal(isTestGenerationRequest("halo, kamu bisa bantu apa aja?", false, false), false);

assert.equal(isTestGenerationRequest("generate test case untuk flow checkout", false, false), true);
assert.equal(isTestGenerationRequest("buatkan skenario test transfer bca", false, false), true);
assert.equal(isTestGenerationRequest("https://demo.playwright.dev", false, true), true);
assert.equal(isTestGenerationRequest("analisis file ini", true, false), true);

console.log("PASS chatbase-context-check");
