// Smoke test for stream token sign/verify helpers (HMAC).
// Tests the pure functions in isolation by importing crypto directly.

import assert from "node:assert/strict";
import crypto from "node:crypto";

const SECRET = "test_secret_kala";

// Re-implementation matching what server/index.js will export.
// If signStreamToken/verifyStreamToken in server/index.js diverges, copy here too.
function signStreamToken({ userId, fileId, exp }, secret) {
  const payload = `${userId}|${fileId}|${exp}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return sig;
}
function verifyStreamToken({ token, fileId, exp, userId }, secret) {
  if (!token || !exp || Date.now() >= Number(exp)) return false;
  const expected = signStreamToken({ userId, fileId, exp }, secret);
  // timing-safe compare
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

console.log("Stream tokens — sign/verify");

test("sign + verify round-trip → true", () => {
  const exp = Date.now() + 60_000;
  const t = signStreamToken({ userId: "u1", fileId: "f1", exp }, SECRET);
  assert.equal(verifyStreamToken({ token: t, userId: "u1", fileId: "f1", exp }, SECRET), true);
});

test("verify with wrong fileId → false (anti-tampering)", () => {
  const exp = Date.now() + 60_000;
  const t = signStreamToken({ userId: "u1", fileId: "f1", exp }, SECRET);
  assert.equal(verifyStreamToken({ token: t, userId: "u1", fileId: "OTHER", exp }, SECRET), false);
});

test("verify with wrong userId → false", () => {
  const exp = Date.now() + 60_000;
  const t = signStreamToken({ userId: "u1", fileId: "f1", exp }, SECRET);
  assert.equal(verifyStreamToken({ token: t, userId: "u2", fileId: "f1", exp }, SECRET), false);
});

test("verify with expired exp → false", () => {
  const exp = Date.now() - 1_000;
  const t = signStreamToken({ userId: "u1", fileId: "f1", exp }, SECRET);
  assert.equal(verifyStreamToken({ token: t, userId: "u1", fileId: "f1", exp }, SECRET), false);
});

test("verify with empty token → false", () => {
  assert.equal(verifyStreamToken({ token: "", userId: "u1", fileId: "f1", exp: Date.now() + 60_000 }, SECRET), false);
});

test("verify with wrong secret → false", () => {
  const exp = Date.now() + 60_000;
  const t = signStreamToken({ userId: "u1", fileId: "f1", exp }, SECRET);
  assert.equal(verifyStreamToken({ token: t, userId: "u1", fileId: "f1", exp }, "WRONG_SECRET"), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
