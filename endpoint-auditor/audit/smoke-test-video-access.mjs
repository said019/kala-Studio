// Smoke test for computeVideoAccessState with mocked pool.
// Mirrors the pattern of smoke-test-puts.mjs.

import assert from "node:assert/strict";

function makePool({ memberships = [], grants = [], plans = [] }) {
  return {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, " ").trim();
      // Eligible plan lookup
      if (/SELECT p\.id, p\.name FROM memberships m JOIN plans p/.test(s)) {
        const [userId] = params;
        const m = memberships.find((m) =>
          m.user_id === userId &&
          m.status === "active" &&
          m.plan?.includes_video_library === true &&
          (!m.end_date || new Date(m.end_date) >= new Date())
        );
        return m ? { rows: [{ id: m.plan.id, name: m.plan.name }] } : { rows: [] };
      }
      // Active grant lookup
      if (/SELECT id, granted_at FROM video_access_grants WHERE user_id = \$1 AND revoked_at IS NULL/.test(s)) {
        const [userId] = params;
        const g = grants.find((g) => g.user_id === userId && !g.revoked_at);
        return g ? { rows: [{ id: g.id, granted_at: g.granted_at }] } : { rows: [] };
      }
      // Offers (plans with includes_video_library = true)
      if (/SELECT id, name, price FROM plans WHERE includes_video_library = true/.test(s)) {
        return { rows: plans.filter((p) => p.includes_video_library && p.is_active !== false) };
      }
      throw new Error(`mock pool: query no soportada → ${s.slice(0, 120)}`);
    },
  };
}

// Re-implementation matching server/index.js (copy-paste contract).
async function computeVideoAccessState(pool, userId) {
  const planRes = await pool.query(
    `SELECT p.id, p.name FROM memberships m
       JOIN plans p ON p.id = m.plan_id
      WHERE m.user_id = $1
        AND m.status = 'active'
        AND p.includes_video_library = true
        AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
      LIMIT 1`,
    [userId]
  );
  const eligiblePlan = planRes.rows[0] || null;

  const grantRes = await pool.query(
    `SELECT id, granted_at FROM video_access_grants
      WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1`,
    [userId]
  );
  const hasGrant = grantRes.rows.length > 0;

  if (eligiblePlan && hasGrant) return { state: "unlocked", planName: eligiblePlan.name };
  if (eligiblePlan) return { state: "locked_pending_grant", planName: eligiblePlan.name };

  const offers = await pool.query(
    `SELECT id, name, price FROM plans WHERE includes_video_library = true AND is_active = true ORDER BY price ASC`
  );
  return { state: "locked_no_plan", offers: offers.rows };
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

console.log("computeVideoAccessState");

const planUnlimited = { id: "p-unl", name: "Mensual Ilimitado", price: 1500, includes_video_library: true, is_active: true };
const planBasic = { id: "p-basic", name: "Barre 4 Clases", price: 800, includes_video_library: false, is_active: true };

await test("Sin plan elegible → locked_no_plan + offers", async () => {
  const pool = makePool({ plans: [planUnlimited, planBasic] });
  const r = await computeVideoAccessState(pool, "u1");
  assert.equal(r.state, "locked_no_plan");
  assert.equal(r.offers.length, 1);
  assert.equal(r.offers[0].id, "p-unl");
});

await test("Plan elegible activo, sin grant → locked_pending_grant", async () => {
  const pool = makePool({
    memberships: [{ user_id: "u1", status: "active", plan: planUnlimited, end_date: "2099-01-01" }],
    plans: [planUnlimited],
  });
  const r = await computeVideoAccessState(pool, "u1");
  assert.equal(r.state, "locked_pending_grant");
  assert.equal(r.planName, "Mensual Ilimitado");
});

await test("Plan elegible + grant activo → unlocked", async () => {
  const pool = makePool({
    memberships: [{ user_id: "u1", status: "active", plan: planUnlimited, end_date: "2099-01-01" }],
    grants: [{ id: "g1", user_id: "u1", granted_at: new Date(), revoked_at: null }],
    plans: [planUnlimited],
  });
  const r = await computeVideoAccessState(pool, "u1");
  assert.equal(r.state, "unlocked");
  assert.equal(r.planName, "Mensual Ilimitado");
});

await test("Plan vencido (end_date pasada) → locked_no_plan", async () => {
  const pool = makePool({
    memberships: [{ user_id: "u1", status: "active", plan: planUnlimited, end_date: "2020-01-01" }],
    grants: [{ id: "g1", user_id: "u1", granted_at: new Date(), revoked_at: null }],
    plans: [planUnlimited],
  });
  const r = await computeVideoAccessState(pool, "u1");
  assert.equal(r.state, "locked_no_plan");
});

await test("Plan no elegible (includes_video_library=false) → locked_no_plan", async () => {
  const pool = makePool({
    memberships: [{ user_id: "u1", status: "active", plan: planBasic, end_date: "2099-01-01" }],
    grants: [{ id: "g1", user_id: "u1", granted_at: new Date(), revoked_at: null }],
    plans: [planBasic, planUnlimited],
  });
  const r = await computeVideoAccessState(pool, "u1");
  assert.equal(r.state, "locked_no_plan");
});

await test("Grant revocado → mismo trato que sin grant", async () => {
  const pool = makePool({
    memberships: [{ user_id: "u1", status: "active", plan: planUnlimited, end_date: "2099-01-01" }],
    grants: [{ id: "g1", user_id: "u1", granted_at: new Date(), revoked_at: new Date() }],
    plans: [planUnlimited],
  });
  const r = await computeVideoAccessState(pool, "u1");
  assert.equal(r.state, "locked_pending_grant");
});

// ── Endpoint: GET /api/me/video-access ──────────────────────────────────────
async function handleMeVideoAccess(pool, req, res) {
  try {
    const state = await computeVideoAccessState(pool, req.userId);
    return res.json({ data: state });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
}

function makeRes() {
  const res = { _status: 200, _body: null };
  res.status = (s) => { res._status = s; return res; };
  res.json = (b) => { res._body = b; return res; };
  return res;
}

console.log("\nGET /api/me/video-access");

await test("Devuelve state con planName cuando unlocked", async () => {
  const pool = makePool({
    memberships: [{ user_id: "u1", status: "active", plan: planUnlimited, end_date: "2099-01-01" }],
    grants: [{ id: "g1", user_id: "u1", granted_at: new Date(), revoked_at: null }],
    plans: [planUnlimited],
  });
  const res = makeRes();
  await handleMeVideoAccess(pool, { userId: "u1" }, res);
  assert.equal(res._status, 200);
  assert.equal(res._body.data.state, "unlocked");
});

// ── Endpoint: GET /api/videos/:id/stream-url ────────────────────────────────
import crypto from "node:crypto";
const TEST_SECRET = "test_secret";
function _signTok({ userId, fileId, exp }) {
  return crypto.createHmac("sha256", TEST_SECRET).update(`${userId}|${fileId}|${exp}`).digest("base64url");
}

async function handleStreamUrl(pool, req, res, opts = {}) {
  try {
    const v = opts.video; // injected for the mock
    if (!v) return res.status(404).json({ message: "Video no encontrado" });
    if (!v.drive_file_id) return res.status(404).json({ message: "Video sin archivo en Drive" });

    if (!v.is_trial) {
      const access = await computeVideoAccessState(pool, req.userId);
      if (access.state !== "unlocked") {
        const reason = access.state === "locked_pending_grant" ? "pending_grant" : "no_plan";
        return res.status(403).json({ message: "Acceso restringido", reason });
      }
    }

    const exp = Date.now() + 60 * 60 * 1000;
    const token = _signTok({ userId: req.userId, fileId: v.drive_file_id, exp });
    const url = `/api/drive/secure-video/${v.drive_file_id}?t=${token}&exp=${exp}&u=${req.userId}`;
    return res.json({ data: { url, expiresAt: exp } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
}

console.log("\nGET /api/videos/:id/stream-url");

await test("Trial siempre da 200 con URL firmada", async () => {
  const pool = makePool({});
  const res = makeRes();
  await handleStreamUrl(pool, { userId: "u1" }, res, { video: { id: "v1", drive_file_id: "abc1234567", is_trial: true } });
  assert.equal(res._status, 200);
  assert.match(res._body.data.url, /\/api\/drive\/secure-video\/abc1234567\?t=/);
});

await test("Sin acceso (no_plan) → 403 reason=no_plan", async () => {
  const pool = makePool({ plans: [planUnlimited] });
  const res = makeRes();
  await handleStreamUrl(pool, { userId: "u1" }, res, { video: { id: "v1", drive_file_id: "abc1234567", is_trial: false } });
  assert.equal(res._status, 403);
  assert.equal(res._body.reason, "no_plan");
});

await test("Plan elegible sin grant → 403 reason=pending_grant", async () => {
  const pool = makePool({
    memberships: [{ user_id: "u1", status: "active", plan: planUnlimited, end_date: "2099-01-01" }],
    plans: [planUnlimited],
  });
  const res = makeRes();
  await handleStreamUrl(pool, { userId: "u1" }, res, { video: { id: "v1", drive_file_id: "abc1234567", is_trial: false } });
  assert.equal(res._status, 403);
  assert.equal(res._body.reason, "pending_grant");
});

await test("Unlocked → 200 con URL firmada", async () => {
  const pool = makePool({
    memberships: [{ user_id: "u1", status: "active", plan: planUnlimited, end_date: "2099-01-01" }],
    grants: [{ id: "g1", user_id: "u1", revoked_at: null }],
    plans: [planUnlimited],
  });
  const res = makeRes();
  await handleStreamUrl(pool, { userId: "u1" }, res, { video: { id: "v1", drive_file_id: "abc1234567", is_trial: false } });
  assert.equal(res._status, 200);
  assert.match(res._body.data.url, /t=.+&exp=/);
});

await test("Video sin drive_file_id → 404", async () => {
  const pool = makePool({});
  const res = makeRes();
  await handleStreamUrl(pool, { userId: "u1" }, res, { video: { id: "v1", drive_file_id: null, is_trial: true } });
  assert.equal(res._status, 404);
});

console.log("\nPOST /api/admin/users/:userId/video-access");

function makePoolForGrants({ users = [], grants = [] }) {
  return {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, " ").trim();
      if (/SELECT id, display_name, phone FROM users WHERE id = \$1/.test(s)) {
        const u = users.find((u) => u.id === params[0]);
        return u ? { rows: [u] } : { rows: [] };
      }
      if (/SELECT id, granted_at, granted_by FROM video_access_grants WHERE user_id = \$1 AND revoked_at IS NULL/.test(s)) {
        const g = grants.find((g) => g.user_id === params[0] && !g.revoked_at);
        return g ? { rows: [g] } : { rows: [] };
      }
      if (/INSERT INTO video_access_grants/.test(s)) {
        const ng = { id: `g-${grants.length + 1}`, user_id: params[0], granted_by: params[1], note: params[2], granted_at: new Date(), revoked_at: null };
        grants.push(ng);
        return { rows: [ng] };
      }
      throw new Error(`mock pool: query no soportada → ${s.slice(0, 120)}`);
    },
  };
}

async function handleGrant(pool, req, res) {
  try {
    const { note } = req.body || {};
    const { userId } = req.params;
    const u = await pool.query("SELECT id, display_name, phone FROM users WHERE id = $1", [userId]);
    if (!u.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    const existing = await pool.query(
      "SELECT id, granted_at, granted_by FROM video_access_grants WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1",
      [userId]
    );
    if (existing.rows.length) return res.json({ data: existing.rows[0], alreadyGranted: true });
    const r = await pool.query(
      `INSERT INTO video_access_grants (user_id, granted_by, note) VALUES ($1, $2, $3) RETURNING *`,
      [userId, req.userId, note || null]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
}

await test("Grant a usuario existente sin grant previo → 201 con row nuevo", async () => {
  const pool = makePoolForGrants({ users: [{ id: "u1", display_name: "Ana", phone: "+5215555555555" }] });
  const res = makeRes();
  await handleGrant(pool, { params: { userId: "u1" }, body: { note: "test" }, userId: "admin1" }, res);
  assert.equal(res._status, 201);
  assert.equal(res._body.data.user_id, "u1");
});

await test("Grant a usuario inexistente → 404", async () => {
  const pool = makePoolForGrants({ users: [] });
  const res = makeRes();
  await handleGrant(pool, { params: { userId: "u-missing" }, body: {}, userId: "admin1" }, res);
  assert.equal(res._status, 404);
});

await test("Re-grant cuando ya hay activo → 200 con alreadyGranted:true (idempotente)", async () => {
  const grants = [{ id: "g1", user_id: "u1", granted_at: new Date(), granted_by: "admin1", revoked_at: null }];
  const pool = makePoolForGrants({ users: [{ id: "u1", display_name: "Ana", phone: null }], grants });
  const res = makeRes();
  await handleGrant(pool, { params: { userId: "u1" }, body: {}, userId: "admin1" }, res);
  assert.equal(res._status, 200);
  assert.equal(res._body.alreadyGranted, true);
});

console.log("\nDELETE /api/admin/users/:userId/video-access");

async function handleRevoke(pool, req, res) {
  try {
    const { userId } = req.params;
    const u = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (!u.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    const r = await pool.query(
      `UPDATE video_access_grants SET revoked_at = NOW(), revoked_by = $2 WHERE user_id = $1 AND revoked_at IS NULL RETURNING *`,
      [userId, req.userId]
    );
    if (!r.rows.length) return res.json({ alreadyRevoked: true });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
}

function makePoolForRevoke({ users = [], grants = [] }) {
  return {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, " ").trim();
      if (/SELECT id FROM users WHERE id = \$1/.test(s)) {
        const u = users.find((u) => u.id === params[0]);
        return u ? { rows: [u] } : { rows: [] };
      }
      if (/UPDATE video_access_grants SET revoked_at = NOW\(\), revoked_by = \$2 WHERE user_id = \$1/.test(s)) {
        const g = grants.find((g) => g.user_id === params[0] && !g.revoked_at);
        if (!g) return { rows: [] };
        g.revoked_at = new Date(); g.revoked_by = params[1];
        return { rows: [g] };
      }
      throw new Error(`mock pool: query no soportada → ${s.slice(0, 120)}`);
    },
  };
}

await test("Revoke con grant activo → 200 con row actualizado", async () => {
  const grants = [{ id: "g1", user_id: "u1", revoked_at: null }];
  const pool = makePoolForRevoke({ users: [{ id: "u1" }], grants });
  const res = makeRes();
  await handleRevoke(pool, { params: { userId: "u1" }, userId: "admin1" }, res);
  assert.equal(res._status, 200);
  assert.ok(res._body.data.revoked_at);
});

await test("Revoke sin grant activo → 200 con alreadyRevoked:true", async () => {
  const pool = makePoolForRevoke({ users: [{ id: "u1" }], grants: [] });
  const res = makeRes();
  await handleRevoke(pool, { params: { userId: "u1" }, userId: "admin1" }, res);
  assert.equal(res._status, 200);
  assert.equal(res._body.alreadyRevoked, true);
});

await test("Revoke a usuario inexistente → 404", async () => {
  const pool = makePoolForRevoke({ users: [] });
  const res = makeRes();
  await handleRevoke(pool, { params: { userId: "missing" }, userId: "admin1" }, res);
  assert.equal(res._status, 404);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
