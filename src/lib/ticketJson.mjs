// Finds the end of the JSON object starting at `start` by tracking brace depth and
// string state, instead of a naive lastIndexOf("}") — which grabs the wrong brace if
// the model appends any trailing text (e.g. a conversational aside) after the object.
function findMatchingBrace(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function parseTicketJson(raw) {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cleaned = (fenced?.[1] || text).trim();
  const start = cleaned.indexOf("{");
  const end = start < 0 ? -1 : findMatchingBrace(cleaned, start);

  if (start < 0 || end < start) {
    throw new Error("AI returned incomplete ticket data. Please retry.");
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("AI returned invalid ticket data. Please retry.");
  }
}
