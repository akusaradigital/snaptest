export interface AiMemorySettings {
  globalCustomPrompt?: string;
  ticketCustomPrompt?: string;
  customPrompt?: string;
  plannerCustomPrompt?: string;
  dataCustomPrompt?: string;
  apiCustomPrompt?: string;
}

export function getStoredAiMemory(): AiMemorySettings {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("snaptest_settings");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getEffectiveAiRules(target: "ticket" | "generator" | "planner" | "data" | "api"): string {
  const mem = getStoredAiMemory();
  const parts: string[] = [];

  if (mem.globalCustomPrompt?.trim()) {
    parts.push(`[Global Preference - All Features]:\n${mem.globalCustomPrompt.trim()}`);
  }

  if (target === "ticket" && mem.ticketCustomPrompt?.trim()) {
    parts.push(`[Ticket Agent Specific Rules]:\n${mem.ticketCustomPrompt.trim()}`);
  } else if (target === "generator" && mem.customPrompt?.trim()) {
    parts.push(`[Test Generator Specific Rules]:\n${mem.customPrompt.trim()}`);
  } else if (target === "planner" && mem.plannerCustomPrompt?.trim()) {
    parts.push(`[Test Planner Specific Rules]:\n${mem.plannerCustomPrompt.trim()}`);
  } else if (target === "data" && mem.dataCustomPrompt?.trim()) {
    parts.push(`[Data Generator Specific Rules]:\n${mem.dataCustomPrompt.trim()}`);
  } else if (target === "api" && mem.apiCustomPrompt?.trim()) {
    parts.push(`[API Agent Specific Rules]:\n${mem.apiCustomPrompt.trim()}`);
  }

  return parts.join("\n\n");
}

export function rememberAiRule(
  rule: string,
  target: "global" | "ticket" | "generator" | "planner" | "data" | "api" = "ticket"
): boolean {
  if (typeof window === "undefined" || !rule.trim()) return false;
  try {
    const current = getStoredAiMemory();
    const cleanRule = rule.trim();

    const keyMap: Record<string, keyof AiMemorySettings> = {
      global: "globalCustomPrompt",
      ticket: "ticketCustomPrompt",
      generator: "customPrompt",
      planner: "plannerCustomPrompt",
      data: "dataCustomPrompt",
      api: "apiCustomPrompt",
    };

    const targetKey = keyMap[target] || "ticketCustomPrompt";
    const existing = (current[targetKey] || "").trim();

    if (!existing) {
      current[targetKey] = cleanRule.startsWith("-") ? cleanRule : `- ${cleanRule}`;
    } else if (!existing.toLowerCase().includes(cleanRule.toLowerCase())) {
      current[targetKey] = `${existing}\n- ${cleanRule}`;
    }

    localStorage.setItem("snaptest_settings", JSON.stringify(current));
    return true;
  } catch (err) {
    console.error("Failed to persist AI rule in memory:", err);
    return false;
  }
}

export function buildFeedbackDirectives(
  messages: Array<{ role: string; feedback?: "like" | "dislike" | null }>
): string {
  if (!messages || messages.length === 0) return "";
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  const hasDislike = assistantMsgs.some((m) => m.feedback === "dislike");
  const hasLike = assistantMsgs.some((m) => m.feedback === "like");

  const directives: string[] = [];
  if (hasDislike) {
    directives.push(
      "[USER FEEDBACK - QUALITY IMPROVEMENT]: The user previously marked an assistant response as unsatisfactory (👎). Do NOT repeat shallow test steps, vague assertions, or generic placeholders. Strive for higher accuracy, comprehensive edge cases, clear step-by-step logic, and robust details."
    );
  }
  if (hasLike) {
    directives.push(
      "[USER FEEDBACK - PREFERRED QUALITY]: The user gave positive feedback (👍) to earlier responses. Maintain the thoroughness, clear structure, and high-quality formatting."
    );
  }
  return directives.join("\n\n");
}
