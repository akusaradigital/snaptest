// Client-side API key storage. Keys live in the browser only - never sent to
// our server for storage, only forwarded per-request to the AI provider.
// Extended: Each key carries a 7-day expiration timestamp for security.

const STORE = "snaptest_api_keys";
const KEY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

interface KeyEntry {
  key: string;
  expiresAt: number;
}

type StorageFormat = Record<string, string | KeyEntry>;

function readRaw(): StorageFormat {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}

function cleanExpiredAndSave(): Record<string, string> {
  const raw = readRaw();
  const now = Date.now();
  const validMap: Record<string, string> = {};
  let changed = false;

  for (const [provider, val] of Object.entries(raw)) {
    if (typeof val === "string") {
      // Migrate legacy string keys to expire in 7 days from now
      validMap[provider] = val;
    } else if (val && typeof val === "object" && val.key) {
      if (val.expiresAt && now > val.expiresAt) {
        // Expired key -> drop
        changed = true;
      } else {
        validMap[provider] = val.key;
      }
    }
  }

  if (changed && typeof window !== "undefined") {
    // Persist cleaned state
    const cleanStorage: Record<string, KeyEntry> = {};
    for (const [p, k] of Object.entries(validMap)) {
      const orig = raw[p];
      const exp = (typeof orig === "object" && orig?.expiresAt) ? orig.expiresAt : now + KEY_TTL_MS;
      cleanStorage[p] = { key: k, expiresAt: exp };
    }
    localStorage.setItem(STORE, JSON.stringify(cleanStorage));
  }

  return validMap;
}

export function getApiKey(provider: string): string {
  const map = cleanExpiredAndSave();
  return map[provider] || "";
}

export function getAllKeys(): Record<string, string> {
  return cleanExpiredAndSave();
}

export function setApiKey(provider: string, key: string) {
  const raw = readRaw();
  const now = Date.now();
  const updatedStorage: Record<string, KeyEntry> = {};

  for (const [p, val] of Object.entries(raw)) {
    if (p === provider) continue;
    const k = typeof val === "string" ? val : val?.key;
    const exp = typeof val === "object" && val?.expiresAt ? val.expiresAt : now + KEY_TTL_MS;
    if (k && now <= exp) {
      updatedStorage[p] = { key: k, expiresAt: exp };
    }
  }

  updatedStorage[provider] = {
    key: key.trim(),
    expiresAt: now + KEY_TTL_MS,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(STORE, JSON.stringify(updatedStorage));
  }
}

export function removeApiKey(provider: string) {
  const raw = readRaw();
  const now = Date.now();
  const updatedStorage: Record<string, KeyEntry> = {};

  for (const [p, val] of Object.entries(raw)) {
    if (p === provider) continue;
    const k = typeof val === "string" ? val : val?.key;
    const exp = typeof val === "object" && val?.expiresAt ? val.expiresAt : now + KEY_TTL_MS;
    if (k && now <= exp) {
      updatedStorage[p] = { key: k, expiresAt: exp };
    }
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(STORE, JSON.stringify(updatedStorage));
  }
}
