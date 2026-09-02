// ponytail: in-memory rate limiter (30 req/min per key), reset on restart
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

export function checkRateLimit(key: string, max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= max) return false;
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return true;
}
