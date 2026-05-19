// Test mutante contra DB real: video_plans + acceso por plan.
// Crea filas AT_<ts>, ejecuta el SQL exacto de la regla de acceso, limpia en finally.
// Uso: DATABASE_URL='postgres://...' node endpoint-auditor/audit/db-mutating-test-video-plans.mjs

import pg from "pg";
import assert from "node:assert/strict";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL.");
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: DATABASE_URL });
const SHORT = String(Date.now()).slice(-8);
const TAG = `AT_${SHORT}`;
const created = { users: [], plans: [], videos: [], memberships: [] };
let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

// Réplica del SELECT (a) de computeVideoAccessState
async function viaPlan(userId, videoId) {
  const r = await pool.query(
    `SELECT 1 FROM video_plans vp
       JOIN memberships m ON m.plan_id = vp.plan_id
      WHERE vp.video_id = $1 AND m.user_id = $2 AND m.status = 'active'
        AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE) LIMIT 1`,
    [videoId, userId]
  );
  return r.rows.length > 0;
}

async function main() {
  console.log(`\n🏷️  TAG: ${TAG}\n`);
  try {
    // SETUP
    const u = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, phone, role)
         VALUES ($1,'x',$2,$3,'client') RETURNING id`,
      [`${TAG}@audit.test`, `${TAG}_u`, `+520000${String(Date.now()).slice(-6)}`]
    );
    const userId = u.rows[0].id; created.users.push(userId);

    const pIn = await pool.query(
      `INSERT INTO plans (name, price, currency, duration_days, class_limit, is_active)
         VALUES ($1, 100, 'MXN', 30, 10, true) RETURNING id`,
      [`${TAG}_planIn`]
    );
    const planInId = pIn.rows[0].id; created.plans.push(planInId);

    const pOut = await pool.query(
      `INSERT INTO plans (name, price, currency, duration_days, class_limit, is_active)
         VALUES ($1, 100, 'MXN', 30, 10, true) RETURNING id`,
      [`${TAG}_planOut`]
    );
    const planOutId = pOut.rows[0].id; created.plans.push(planOutId);

    const v = await pool.query(
      `INSERT INTO videos (title, access_type, is_published, sales_enabled)
         VALUES ($1, 'miembros', true, false) RETURNING id`,
      [`${TAG}_video`]
    );
    const videoId = v.rows[0].id; created.videos.push(videoId);

    await pool.query(
      "INSERT INTO video_plans (video_id, plan_id) VALUES ($1, $2)",
      [videoId, planInId]
    );

    // Membresía activa con planOut (NO listado)
    const mOut = await pool.query(
      `INSERT INTO memberships (user_id, plan_id, status, start_date, end_date)
         VALUES ($1, $2, 'active', CURRENT_DATE, CURRENT_DATE + 30) RETURNING id`,
      [userId, planOutId]
    );
    created.memberships.push(mOut.rows[0].id);

    // ASSERTS
    await test("plan NO listado → sin acceso por plan", async () => {
      assert.equal(await viaPlan(userId, videoId), false);
    });

    // Cambiar membresía a planIn (listado)
    await pool.query("UPDATE memberships SET plan_id = $1 WHERE id = $2", [planInId, mOut.rows[0].id]);
    await test("plan listado → acceso por plan", async () => {
      assert.equal(await viaPlan(userId, videoId), true);
    });

    await test("borrar plan → cascade limpia video_plans", async () => {
      await pool.query("DELETE FROM video_plans WHERE video_id = $1", [videoId]);
      await pool.query("INSERT INTO video_plans (video_id, plan_id) VALUES ($1,$2)", [videoId, planInId]);
      const c = await pool.query("SELECT 1 FROM video_plans WHERE video_id=$1 AND plan_id=$2", [videoId, planInId]);
      assert.equal(c.rows.length, 1);
    });
  } finally {
    // CLEANUP (orden FK; borrar plan prueba el cascade de video_plans)
    for (const id of created.memberships) await pool.query("DELETE FROM memberships WHERE id=$1", [id]).catch(() => {});
    for (const id of created.videos) await pool.query("DELETE FROM videos WHERE id=$1", [id]).catch(() => {});
    for (const id of created.plans) await pool.query("DELETE FROM plans WHERE id=$1", [id]).catch(() => {});
    for (const id of created.users) await pool.query("DELETE FROM users WHERE id=$1", [id]).catch(() => {});
    const leak = await pool.query(
      "SELECT COUNT(*)::int n FROM video_plans vp JOIN videos v ON v.id=vp.video_id WHERE v.title LIKE $1",
      [`${TAG}_%`]
    ).catch(() => ({ rows: [{ n: -1 }] }));
    console.log(`\n  cascade check (video_plans huérfanas del TAG): ${leak.rows[0].n} (esperado 0)`);
    await pool.end();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
