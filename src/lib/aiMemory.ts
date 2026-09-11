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
