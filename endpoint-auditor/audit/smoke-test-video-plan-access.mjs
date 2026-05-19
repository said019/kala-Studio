// Smoke test de la matriz de acceso per-video. Mock pool, sin DB.
// Patrón espejo de smoke-test-video-access.mjs (copy-paste contract:
// si cambias computeVideoAccessState en server/index.js, cambia la copia de abajo).

import assert from "node:assert/strict";

function makePool(db) {
  const {
    video = {},                 // { access_type, is_trial, sales_enabled }
    videoPlanIds = [],          // plan_ids en video_plans(videoId)
    memberships = [],           // [{ status, end_date, plan: { id, includes_video_library } }]
    purchase = null,            // { has_access } | null
    grantActive = false,
    offers = [],                // planes full-library activos
  } = db;
  return {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, " ").trim();
      if (/SELECT access_type, is_trial, sales_enabled FROM videos WHERE id/.test(s)) {
        return { rows: [video] };
      }
      if (/SELECT 1 FROM video_plans vp JOIN memberships m/.test(s)) {
        const ok = memberships.some(
          (m) =>
            m.status === "active" &&
            (!m.end_date || new Date(m.end_date) >= new Date()) &&
            videoPlanIds.includes(m.plan.id)
        );
        return { rows: ok ? [{ "?column?": 1 }] : [] };
      }
      if (/SELECT 1 FROM memberships m JOIN plans p .* p\.includes_video_library = true/.test(s)) {
        const ok = memberships.some(
          (m) =>
            m.status === "active" &&
            (!m.end_date || new Date(m.end_date) >= new Date()) &&
            m.plan.includes_video_library === true
        );
        return { rows: ok ? [{ "?column?": 1 }] : [] };
      }
      if (/SELECT has_access FROM video_purchases WHERE/.test(s)) {
        return { rows: purchase ? [{ has_access: purchase.has_access }] : [] };
      }
      if (/SELECT 1 FROM video_access_grants WHERE user_id = \$1 AND revoked_at IS NULL/.test(s)) {
        return { rows: grantActive ? [{ "?column?": 1 }] : [] };
      }
      if (/SELECT id, name, price FROM plans WHERE includes_video_library = true/.test(s)) {
        return { rows: offers };
      }
      throw new Error(`mock pool: query no soportada → ${s.slice(0, 140)}`);
    },
  };
}

// ── Copia-contrato de server/index.js (mantener idéntica) ───────────────────
async function computeVideoAccessState(pool, userId, videoId) {
  const vr = await pool.query(
    "SELECT access_type, is_trial, sales_enabled FROM videos WHERE id = $1",
    [videoId]
  );
  const video = vr.rows[0];
  if (!video) return { state: "locked_plan_only", offers: [] };
  if (video.access_type === "gratuito" || video.access_type === "free")
    return { state: "free" };
  if (video.is_trial === true) return { state: "unlocked" };

  const planGranular = await pool.query(
    `SELECT 1 FROM video_plans vp
       JOIN memberships m ON m.plan_id = vp.plan_id
      WHERE vp.video_id = $1 AND m.user_id = $2 AND m.status = 'active'
        AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE) LIMIT 1`,
    [videoId, userId]
  );
  if (planGranular.rows.length) return { state: "unlocked" };

  const fullLib = await pool.query(
    `SELECT 1 FROM memberships m JOIN plans p ON p.id = m.plan_id
      WHERE m.user_id = $1 AND m.status = 'active'
        AND p.includes_video_library = true
        AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE) LIMIT 1`,
    [userId]
  );
  if (fullLib.rows.length) return { state: "unlocked" };

  const purch = await pool.query(
    "SELECT has_access FROM video_purchases WHERE video_id = $1 AND user_id = $2 LIMIT 1",
    [videoId, userId]
  );
  if (purch.rows[0]?.has_access === true) return { state: "unlocked" };

  const grant = await pool.query(
    "SELECT 1 FROM video_access_grants WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1",
    [userId]
  );
  if (grant.rows.length) return { state: "unlocked" };

  if (video.sales_enabled === true) return { state: "locked_purchasable" };
  const offers = await pool.query(
    "SELECT id, name, price FROM plans WHERE includes_video_library = true AND is_active = true ORDER BY price ASC"
  );
  return { state: "locked_plan_only", offers: offers.rows };
}

const U = "user-1";
const V = "video-1";

const cases = [
  ["gratuito → free", { video: { access_type: "gratuito" } }, "free"],
  ["trial → unlocked", { video: { access_type: "miembros", is_trial: true } }, "unlocked"],
  ["plan en video_plans → unlocked", {
    video: { access_type: "miembros" }, videoPlanIds: ["p1"],
    memberships: [{ status: "active", plan: { id: "p1", includes_video_library: false } }],
  }, "unlocked"],
  ["plan full-library no listado → unlocked", {
    video: { access_type: "miembros" }, videoPlanIds: ["p9"],
    memberships: [{ status: "active", plan: { id: "p1", includes_video_library: true } }],
  }, "unlocked"],
  ["compra aprobada → unlocked", {
    video: { access_type: "miembros" }, purchase: { has_access: true },
  }, "unlocked"],
  ["grant cortesía → unlocked", {
    video: { access_type: "miembros" }, grantActive: true,
  }, "unlocked"],
  ["sin acceso + venta on → locked_purchasable", {
    video: { access_type: "miembros", sales_enabled: true },
  }, "locked_purchasable"],
  ["sin acceso + venta off → locked_plan_only", {
    video: { access_type: "miembros", sales_enabled: false },
  }, "locked_plan_only"],
  ["membresía expirada → pierde plan", {
    video: { access_type: "miembros", sales_enabled: false }, videoPlanIds: ["p1"],
    memberships: [{ status: "active", end_date: "2000-01-01", plan: { id: "p1", includes_video_library: false } }],
  }, "locked_plan_only"],
];

let passed = 0, failed = 0;
for (const [name, db, expected] of cases) {
  const out = await computeVideoAccessState(makePool(db), U, V);
  try {
    assert.equal(out.state, expected);
    console.log(`  ✅ ${name}`);
    passed++;
  } catch {
    console.log(`  ❌ ${name} → got "${out.state}", expected "${expected}"`);
    failed++;
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
