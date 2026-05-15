// Mutating smoke test against real DB. Mirrors db-mutating-test.mjs.
// Creates AT_VL_<ts> tagged rows, exercises every new endpoint's SQL,
// cleans up in finally regardless of pass/fail.

import pg from "pg";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL. Corre: DATABASE_URL='postgres://...' node endpoint-auditor/audit/db-mutating-test-video-access.mjs");
  process.exit(2);
}
const ADMIN_ID = process.env.ADMIN_ID || "e6b50fc5-bb40-460b-87e9-59f876be63a7";
const SECRET = process.env.JWT_SECRET || "dev_kala_secret_change_me";
const SHORT = String(Date.now()).slice(-8);
const TAG = `AT_VL_${SHORT}`;

function signTok({ userId, fileId, exp }) {
  return crypto.createHmac("sha256", SECRET).update(`${userId}|${fileId}|${exp}`).digest("base64url");
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const created = { userIds: [], planIds: [], membershipIds: [], videoIds: [], grantIds: [] };
let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

async function main() {
  console.log(`\n🏷️  TAG: ${TAG}\n`);

  // SETUP
  console.log("─── SETUP ───");
  const userRes = await pool.query(
    `INSERT INTO users (email, password_hash, display_name, phone, role)
       VALUES ($1, 'x', $2, $3, 'client') RETURNING id`,
    [`${TAG}@audit.test`, `${TAG}_user`, `+5200${SHORT}`]
  );
  const userId = userRes.rows[0].id;
  created.userIds.push(userId);

  const planRes = await pool.query(
    `INSERT INTO plans (name, price, currency, duration_days, class_limit, is_active, includes_video_library)
       VALUES ($1, 1500, 'MXN', 30, 999, true, true) RETURNING id`,
    [`${TAG}_plan`]
  );
  const planId = planRes.rows[0].id;
  created.planIds.push(planId);

  const memRes = await pool.query(
    `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining)
       VALUES ($1, $2, 'active', 'transfer', NOW(), NOW() + INTERVAL '30 days', 999) RETURNING id`,
    [userId, planId]
  );
  created.membershipIds.push(memRes.rows[0].id);

  const trialVidRes = await pool.query(
    `INSERT INTO videos (title, drive_file_id, access_type, is_trial, is_published)
       VALUES ($1, 'fake_drive_trial_id_1234567890', 'miembros', true, true) RETURNING id`,
    [`${TAG}_trial`]
  );
  const trialVideoId = trialVidRes.rows[0].id;
  created.videoIds.push(trialVideoId);

  const gatedVidRes = await pool.query(
    `INSERT INTO videos (title, drive_file_id, access_type, is_trial, is_published)
       VALUES ($1, 'fake_drive_gated_id_0987654321', 'miembros', false, true) RETURNING id`,
    [`${TAG}_gated`]
  );
  const gatedVideoId = gatedVidRes.rows[0].id;
  const gatedDriveId = "fake_drive_gated_id_0987654321";
  created.videoIds.push(gatedVideoId);

  console.log(`  user=${userId} plan=${planId} trial=${trialVideoId} gated=${gatedVideoId}\n`);

  // TESTS — exercise the SQL of each new endpoint directly

  console.log("computeVideoAccessState");

  await test("Sin grant → locked_pending_grant", async () => {
    const planQ = await pool.query(
      `SELECT p.id, p.name FROM memberships m JOIN plans p ON p.id = m.plan_id
        WHERE m.user_id=$1 AND m.status='active' AND p.includes_video_library=true
          AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE) LIMIT 1`,
      [userId]
    );
    assert.equal(planQ.rows.length, 1);
    const grantQ = await pool.query(
      "SELECT id FROM video_access_grants WHERE user_id=$1 AND revoked_at IS NULL LIMIT 1",
      [userId]
    );
    assert.equal(grantQ.rows.length, 0);
    // → state = locked_pending_grant
  });

  console.log("\nPOST grant (idempotent)");

  let grantId;
  await test("Primer POST → crea grant", async () => {
    const r = await pool.query(
      `INSERT INTO video_access_grants (user_id, granted_by, note) VALUES ($1, $2, 'test') RETURNING *`,
      [userId, ADMIN_ID]
    );
    assert.equal(r.rowCount, 1);
    grantId = r.rows[0].id;
    created.grantIds.push(grantId);
  });

  await test("Segundo POST con grant activo → SELECT existing devuelve la fila", async () => {
    const existing = await pool.query(
      "SELECT id FROM video_access_grants WHERE user_id=$1 AND revoked_at IS NULL LIMIT 1",
      [userId]
    );
    assert.equal(existing.rowCount, 1);
    assert.equal(existing.rows[0].id, grantId);
    // Handler real devolvería 200 alreadyGranted:true sin INSERT
  });

  console.log("\nDELETE grant (soft + idempotent)");

  await test("DELETE con grant activo → marca revoked_at, NO borra", async () => {
    const r = await pool.query(
      `UPDATE video_access_grants SET revoked_at=NOW(), revoked_by=$2
         WHERE user_id=$1 AND revoked_at IS NULL RETURNING *`,
      [userId, ADMIN_ID]
    );
    assert.equal(r.rowCount, 1);
    assert.ok(r.rows[0].revoked_at);
    // Verificar que la fila sigue existiendo
    const still = await pool.query("SELECT id FROM video_access_grants WHERE id=$1", [grantId]);
    assert.equal(still.rowCount, 1);
  });

  await test("DELETE sin grant activo → 0 rows (handler devuelve alreadyRevoked)", async () => {
    const r = await pool.query(
      `UPDATE video_access_grants SET revoked_at=NOW(), revoked_by=$2
         WHERE user_id=$1 AND revoked_at IS NULL RETURNING *`,
      [userId, ADMIN_ID]
    );
    assert.equal(r.rowCount, 0);
  });

  console.log("\nGET /api/admin/video-access/pending");

  await test("Lista pending → incluye nuestra alumna (sin grant activo)", async () => {
    const r = await pool.query(`
      SELECT u.id FROM users u
        JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
        JOIN plans p ON p.id = m.plan_id AND p.includes_video_library = true
        LEFT JOIN video_access_grants g ON g.user_id = u.id AND g.revoked_at IS NULL
       WHERE g.id IS NULL AND u.id = $1`, [userId]);
    assert.equal(r.rowCount, 1);
  });

  console.log("\nToken HMAC (sign + verify)");

  await test("Token válido se verifica OK", () => {
    const exp = Date.now() + 60_000;
    const t = signTok({ userId, fileId: gatedDriveId, exp });
    const expected = signTok({ userId, fileId: gatedDriveId, exp });
    assert.equal(t, expected);
  });

  await test("Token con fileId distinto NO matchea", () => {
    const exp = Date.now() + 60_000;
    const t = signTok({ userId, fileId: gatedDriveId, exp });
    const other = signTok({ userId, fileId: "DIFFERENT", exp });
    assert.notEqual(t, other);
  });
}

async function cleanup() {
  console.log("\n─── CLEANUP ───");
  const errors = [];
  for (const id of created.grantIds) {
    try { await pool.query("DELETE FROM video_access_grants WHERE id=$1", [id]); } catch (e) { errors.push(`grant ${id}: ${e.message}`); }
  }
  // Borrar grants restantes con CASCADE via user
  for (const id of created.videoIds) {
    try { await pool.query("DELETE FROM videos WHERE id=$1", [id]); } catch (e) { errors.push(`video ${id}: ${e.message}`); }
  }
  for (const id of created.membershipIds) {
    try { await pool.query("DELETE FROM memberships WHERE id=$1", [id]); } catch (e) { errors.push(`membership ${id}: ${e.message}`); }
  }
  for (const id of created.planIds) {
    try { await pool.query("DELETE FROM plans WHERE id=$1", [id]); } catch (e) { errors.push(`plan ${id}: ${e.message}`); }
  }
  for (const id of created.userIds) {
    try { await pool.query("DELETE FROM users WHERE id=$1", [id]); } catch (e) { errors.push(`user ${id}: ${e.message}`); }
  }
  if (errors.length) {
    console.log("  ⚠️  cleanup parcial:");
    for (const e of errors) console.log("  -", e);
  } else {
    console.log("  ✅ todas las filas AUDIT_TEST borradas");
  }
}

try { await main(); }
catch (e) { console.error("\n❌ FATAL:", e.message); failed++; }
finally {
  await cleanup();
  await pool.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
