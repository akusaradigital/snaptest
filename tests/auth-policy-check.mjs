import assert from "node:assert/strict";
import { isPublicRoute } from "../src/lib/authPolicy.mjs";

for (const path of ["/", "/login", "/share/x", "/api/auth/session", "/api/share/x", "/api/health", "/_next/static/chunk.js", "/favicon.ico"]) {
  assert.equal(isPublicRoute(path), true, `${path} should be public`);
}

for (const path of ["/dashboard", "/api/private", "/share", "/api/share", "/login/extra"]) {
  assert.equal(isPublicRoute(path), false, `${path} should be protected`);
}

console.log("auth policy checks passed");
