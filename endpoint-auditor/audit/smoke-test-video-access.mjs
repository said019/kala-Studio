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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
