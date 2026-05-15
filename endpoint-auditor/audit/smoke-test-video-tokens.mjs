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

console.log("\nGET /api/drive/secure-video/:fileId — gate logic");

function handleSecureVideo(req, res, opts = {}) {
  // Mirrors server/index.js logic without actually streaming.
  const { t: token, exp, u: userId } = req.query;
  if (!token || !exp || !userId) { res._status = 401; return; }
  const ok = verifyStreamToken({
    token: String(token), userId: String(userId), fileId: req.params.fileId, exp: Number(exp),
  }, SECRET);
  if (!ok) { res._status = 401; return; }
  res._status = 200; // would call streamDriveFile in real handler
}

function mockRes() { return { _status: null }; }

test("Token válido → 200", () => {
  const exp = Date.now() + 60_000;
  const t = signStreamToken({ userId: "u1", fileId: "abc1234567", exp }, SECRET);
  const r = mockRes();
  handleSecureVideo({ params: { fileId: "abc1234567" }, query: { t, exp, u: "u1" } }, r);
  assert.equal(r._status, 200);
});

test("Sin token → 401", () => {
  const r = mockRes();
  handleSecureVideo({ params: { fileId: "abc1234567" }, query: {} }, r);
  assert.equal(r._status, 401);
});

test("Token expirado → 401", () => {
  const exp = Date.now() - 1_000;
  const t = signStreamToken({ userId: "u1", fileId: "abc1234567", exp }, SECRET);
  const r = mockRes();
  handleSecureVideo({ params: { fileId: "abc1234567" }, query: { t, exp, u: "u1" } }, r);
  assert.equal(r._status, 401);
});

test("Token de OTRO fileId → 401 (anti-tampering)", () => {
  const exp = Date.now() + 60_000;
  const t = signStreamToken({ userId: "u1", fileId: "OTHER", exp }, SECRET);
  const r = mockRes();
  handleSecureVideo({ params: { fileId: "abc1234567" }, query: { t, exp, u: "u1" } }, r);
  assert.equal(r._status, 401);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
