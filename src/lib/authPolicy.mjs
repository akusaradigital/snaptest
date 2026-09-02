const PUBLIC_EXACT = new Set(["/", "/login", "/api/health", "/privacy", "/terms"]);
const PUBLIC_PREFIXES = ["/share/", "/api/auth/", "/api/share/", "/_next/", "/api/public/"];
const STATIC_ASSET = /\.[a-zA-Z0-9]+$/;

export function isPublicRoute(pathname) {
  return PUBLIC_EXACT.has(pathname)
    || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    || STATIC_ASSET.test(pathname);
}
