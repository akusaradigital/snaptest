import assert from "node:assert/strict";
import { validateOutboundUrl, isPrivateOrReservedIp } from "../src/lib/outbound-url";

// isPrivateOrReservedIp — direct IP checks, no network involved.
assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
assert.equal(isPrivateOrReservedIp("10.0.0.5"), true);
assert.equal(isPrivateOrReservedIp("192.168.1.1"), true);
assert.equal(isPrivateOrReservedIp("169.254.169.254"), true); // cloud metadata endpoint
assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
assert.equal(isPrivateOrReservedIp("::1"), true);
assert.equal(isPrivateOrReservedIp("::ffff:127.0.0.1"), true); // IPv4-mapped
assert.equal(isPrivateOrReservedIp("::127.0.0.1"), true); // legacy IPv4-compatible form

async function rejects(input: string, opts?: Parameters<typeof validateOutboundUrl>[1]) {
  await assert.rejects(() => validateOutboundUrl(input, opts));
}
async function resolves(input: string, opts?: Parameters<typeof validateOutboundUrl>[1]) {
  await validateOutboundUrl(input, opts);
}

async function main() {
  await rejects("ftp://example.com"); // non-HTTP(S) scheme
  await rejects("http://user:pass@example.com"); // embedded credentials
  await rejects("http://localhost:3000"); // blocked by default
  await resolves("http://localhost:3000", { allowLocalhost: true }); // allowed opt-in
  await rejects("http://127.0.0.1/"); // loopback literal, no DNS needed
  await rejects("http://169.254.169.254/"); // cloud metadata literal
  await rejects("http://2130706433/"); // decimal-packed 127.0.0.1
  await rejects("http://0x7f000001/"); // hex-packed 127.0.0.1
  await rejects("http://[::1]/"); // IPv6 loopback literal
  await resolves("http://8.8.8.8/"); // public IP literal should pass

  console.log("PASS outbound-url-check");
}

main().catch((err) => {
  console.error("FAIL outbound-url-check:", err);
  process.exit(1);
});
