// Mutating smoke test contra la DB REAL.
// Crea filas marcadas como AUDIT_TEST_<timestamp>, ejecuta el SQL EXACTO que
// usan los handlers modificados (H1/M1/M2/M3), verifica resultados, y limpia
// SIEMPRE (try/finally). Si el cleanup falla, el script lo grita y deja la
// lista de IDs para borrar a mano.

import pg from "pg";
import assert from "node:assert/strict";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL. Corre: DATABASE_URL='postgres://...' node endpoint-auditor/audit/db-mutating-test.mjs");
  process.exit(2);
}
const PLAN_ID = "846f0069-9701-4ae2-991b-a7384f5cae6e"; // Barre — 2 Clases por semana (real)
const ADMIN_ID = "e6b50fc5-bb40-460b-87e9-59f876be63a7"; // admin@kalabarre.mx (real, para verified_by)
// TAG corto porque order_number es varchar(20). Usamos solo los últimos 8
// caracteres del timestamp para identificar la corrida sin pasarnos del límite.
const SHORT = String(Date.now()).slice(-8);
const TAG = `AT_${SHORT}`; // p.ej. "AT_01300455" (11 chars) → cabe con sufijos

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const created = { userIds: [], orderIds: [], membershipIds: [], bookingIds: [], classIds: [] };
let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

async function main() {
  console.log(`\n🏷️  TAG: ${TAG}\n`);

  // ── SETUP ─────────────────────────────────────────────────────────────────
  console.log("─── SETUP ───");
  // 1 user de prueba
  const userRes = await pool.query(
    `INSERT INTO users (email, password_hash, display_name, phone, role)
       VALUES ($1, 'x', $2, $3, 'client') RETURNING id`,
    [`${TAG}@audit.test`, `${TAG}_user`, `+520000${String(Date.now()).slice(-6)}`]
  );
  const userId = userRes.rows[0].id;
  created.userIds.push(userId);
  console.log(`  user: ${userId}`);

  // 2 órdenes: una pending_verification (la voy a rechazar), una approved (intento rechazar y debe fallar con 409)
  const orderPendRes = await pool.query(
    `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, tax_amount, total_amount, discount_amount, bank_info, expires_at, order_number)
       VALUES ($1, $2, 'pending_verification', 'transfer', 100, 0, 100, 0, '{}', NOW() + INTERVAL '7 days', $3) RETURNING id`,
    [userId, PLAN_ID, `${TAG}_pend`]
  );
  const orderPendId = orderPendRes.rows[0].id;
  created.orderIds.push(orderPendId);
  console.log(`  order pending: ${orderPendId}`);

  const orderApprovedRes = await pool.query(
    `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, tax_amount, total_amount, discount_amount, bank_info, expires_at, order_number, notes)
       VALUES ($1, $2, 'approved', 'transfer', 100, 0, 100, 0, '{}', NOW() + INTERVAL '7 days', $3, 'original notes') RETURNING id`,
    [userId, PLAN_ID, `${TAG}_appr`]
  );
  const orderApprovedId = orderApprovedRes.rows[0].id;
  created.orderIds.push(orderApprovedId);
  console.log(`  order approved: ${orderApprovedId}`);

  // 2 memberships: una pending_activation (M1), una active (M2)
  const memPendRes = await pool.query(
    `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining)
       VALUES ($1, $2, 'pending_activation', 'transfer', NOW(), NOW() + INTERVAL '30 days', 8) RETURNING id`,
    [userId, PLAN_ID]
  );
  const memPendId = memPendRes.rows[0].id;
  created.membershipIds.push(memPendId);
  console.log(`  membership pending_activation: ${memPendId}`);

  const memActiveRes = await pool.query(
    `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining)
       VALUES ($1, $2, 'active', 'transfer', NOW(), NOW() + INTERVAL '30 days', 5) RETURNING id`,
    [userId, PLAN_ID]
  );
  const memActiveId = memActiveRes.rows[0].id;
  created.membershipIds.push(memActiveId);
  console.log(`  membership active: ${memActiveId}`);

  // 1 clase futura + 1 booking confirmed atada a memActive (para probar cascada de M2)
  const classTypeId = (await pool.query("SELECT id FROM class_types LIMIT 1")).rows[0]?.id;
  const instructorId = (await pool.query("SELECT id FROM instructors LIMIT 1")).rows[0]?.id;
  if (!classTypeId || !instructorId) throw new Error("Necesito al menos 1 class_type y 1 instructor en DB");

  const classRes = await pool.query(
    `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, current_bookings, status)
       VALUES ($1, $2, CURRENT_DATE + INTERVAL '7 days', '10:00', '11:00', 10, 1, 'scheduled') RETURNING id, current_bookings`,
    [classTypeId, instructorId]
  );
  const classId = classRes.rows[0].id;
  created.classIds.push(classId);
  const initialBookings = classRes.rows[0].current_bookings;
  console.log(`  class futura: ${classId} (current_bookings=${initialBookings})`);

  const bookingRes = await pool.query(
    `INSERT INTO bookings (user_id, class_id, membership_id, status)
       VALUES ($1, $2, $3, 'confirmed') RETURNING id`,
    [userId, classId, memActiveId]
  );
  const bookingId = bookingRes.rows[0].id;
  created.bookingIds.push(bookingId);
  console.log(`  booking confirmed (atada a memActive): ${bookingId}\n`);

  // ── TESTS ─────────────────────────────────────────────────────────────────

  console.log("H1 — /admin/orders/:id/reject (SQL real)");

  await test("rechaza pending_verification → 1 row, status='rejected', verified_by seteado", async () => {
    const r = await pool.query(
      `UPDATE orders SET status = 'rejected', verified_at = NOW(), verified_by = $3, notes = $2
         WHERE id = $1 AND status NOT IN ('approved','rejected') RETURNING *, user_id`,
      [orderPendId, "Comprobante ilegible (AUDIT_TEST)", ADMIN_ID]
    );
    assert.equal(r.rowCount, 1);
    assert.equal(r.rows[0].status, "rejected");
    assert.equal(r.rows[0].verified_by, ADMIN_ID);
    assert.equal(r.rows[0].notes, "Comprobante ilegible (AUDIT_TEST)");
  });

  await test("re-rechazar la misma orden (ya rejected) → 0 rows (guard funciona)", async () => {
    const r = await pool.query(
      `UPDATE orders SET status = 'rejected', verified_at = NOW(), verified_by = $3, notes = $2
         WHERE id = $1 AND status NOT IN ('approved','rejected') RETURNING *, user_id`,
      [orderPendId, "segundo intento", ADMIN_ID]
    );
    assert.equal(r.rowCount, 0);
  });

  await test("intentar rechazar order APPROVED → 0 rows, fila intacta (bug original prevenido)", async () => {
    const r = await pool.query(
      `UPDATE orders SET status = 'rejected', verified_at = NOW(), verified_by = $3, notes = $2
         WHERE id = $1 AND status NOT IN ('approved','rejected') RETURNING *, user_id`,
      [orderApprovedId, "no debería pasar", ADMIN_ID]
    );
    assert.equal(r.rowCount, 0);
    // Verificar que la fila quedó EXACTAMENTE como estaba
    const check = await pool.query("SELECT status, notes FROM orders WHERE id = $1", [orderApprovedId]);
    assert.equal(check.rows[0].status, "approved");
    assert.equal(check.rows[0].notes, "original notes");
  });

  console.log("\nM1 — /memberships/:id/activate (SQL real)");

  await test("activar pending_activation → 1 row, status='active'", async () => {
    const r = await pool.query(
      `UPDATE memberships SET status = 'active', updated_at = NOW()
         WHERE id = $1 AND status <> 'active'
         RETURNING *, (SELECT name FROM plans WHERE id = memberships.plan_id) AS plan_name`,
      [memPendId]
    );
    assert.equal(r.rowCount, 1);
    assert.equal(r.rows[0].status, "active");
    assert.ok(r.rows[0].plan_name);
  });

  await test("re-activar (ya active) → 0 rows, NO se reenviarían notificaciones", async () => {
    const r = await pool.query(
      `UPDATE memberships SET status = 'active', updated_at = NOW()
         WHERE id = $1 AND status <> 'active' RETURNING *`,
      [memPendId]
    );
    assert.equal(r.rowCount, 0);
  });

  console.log("\nM2 — /memberships/:id/cancel (SQL real, con cascada en transacción)");

  await test("cancel active con bookings futuras → cascada cancela booking + decrementa current_bookings", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `UPDATE memberships SET status = 'cancelled', cancellation_reason = $2, cancelled_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status <> 'cancelled' RETURNING *`,
        [memActiveId, "Refund test (AUDIT_TEST)"]
      );
      assert.equal(r.rowCount, 1);
      assert.equal(r.rows[0].cancellation_reason, "Refund test (AUDIT_TEST)");
      assert.ok(r.rows[0].cancelled_at);

      const future = await client.query(
        `SELECT b.id, b.class_id FROM bookings b JOIN classes c ON c.id = b.class_id
          WHERE b.membership_id = $1 AND b.status = 'confirmed'
            AND (c.date > CURRENT_DATE OR (c.date = CURRENT_DATE AND c.start_time > CURRENT_TIME))`,
        [memActiveId]
      );
      assert.equal(future.rowCount, 1, "debería encontrar 1 booking futura");
      assert.equal(future.rows[0].id, bookingId);

      for (const b of future.rows) {
        await client.query("UPDATE bookings SET status='cancelled', cancelled_at=NOW() WHERE id = $1", [b.id]);
        await client.query("UPDATE classes SET current_bookings = GREATEST(current_bookings - 1, 0) WHERE id = $1", [b.class_id]);
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }

    // Post-condiciones
    const b = await pool.query("SELECT status, cancelled_at FROM bookings WHERE id = $1", [bookingId]);
    assert.equal(b.rows[0].status, "cancelled");
    assert.ok(b.rows[0].cancelled_at);
    const c = await pool.query("SELECT current_bookings FROM classes WHERE id = $1", [classId]);
    assert.equal(c.rows[0].current_bookings, initialBookings - 1,
      `current_bookings esperado ${initialBookings - 1}, fue ${c.rows[0].current_bookings}`);
  });

  await test("re-cancelar (ya cancelled) → 0 rows", async () => {
    const r = await pool.query(
      `UPDATE memberships SET status = 'cancelled', cancellation_reason = $2, cancelled_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status <> 'cancelled' RETURNING *`,
      [memActiveId, "no aplica"]
    );
    assert.equal(r.rowCount, 0);
  });

  console.log("\nM3 — /memberships/:id (validación + UPDATE genérico)");

  await test("UPDATE con status='pending_payment' (valor real del enum) → 1 row", async () => {
    // Reactivar memPend a pending_payment para probar
    const r = await pool.query(
      `UPDATE memberships SET status = COALESCE($1, status), updated_at = NOW()
         WHERE id = $2 RETURNING status`,
      ["pending_payment", memPendId]
    );
    assert.equal(r.rowCount, 1);
    assert.equal(r.rows[0].status, "pending_payment");
  });

  await test("UPDATE con status='pending' (NO existe en enum) → ERROR de Postgres", async () => {
    let threw = false;
    try {
      await pool.query(
        `UPDATE memberships SET status = COALESCE($1, status), updated_at = NOW() WHERE id = $2 RETURNING *`,
        ["pending", memPendId]
      );
    } catch (e) {
      threw = true;
      assert.match(e.message, /invalid input value for enum/);
    }
    assert.ok(threw, "Postgres debería rechazar 'pending'. La validación JS del handler lo atrapa antes y devuelve 400 — sin la validación, esto sería un 500 en prod.");
  });

  await test("UPDATE con classes_remaining=0 → 1 row, valor 0 persiste", async () => {
    const r = await pool.query(
      `UPDATE memberships SET classes_remaining = COALESCE($1, classes_remaining), updated_at = NOW()
         WHERE id = $2 RETURNING classes_remaining`,
      [0, memPendId]
    );
    assert.equal(r.rowCount, 1);
    assert.equal(r.rows[0].classes_remaining, 0);
  });
}

async function cleanup() {
  console.log("\n─── CLEANUP ───");
  const errors = [];
  // Orden de FK: bookings → memberships/classes/orders → users
  for (const id of created.bookingIds) {
    try { await pool.query("DELETE FROM bookings WHERE id = $1", [id]); } catch (e) { errors.push(`booking ${id}: ${e.message}`); }
  }
  for (const id of created.membershipIds) {
    try { await pool.query("DELETE FROM memberships WHERE id = $1", [id]); } catch (e) { errors.push(`membership ${id}: ${e.message}`); }
  }
  for (const id of created.orderIds) {
    try { await pool.query("DELETE FROM orders WHERE id = $1", [id]); } catch (e) { errors.push(`order ${id}: ${e.message}`); }
  }
  for (const id of created.classIds) {
    try { await pool.query("DELETE FROM classes WHERE id = $1", [id]); } catch (e) { errors.push(`class ${id}: ${e.message}`); }
  }
  for (const id of created.userIds) {
    try { await pool.query("DELETE FROM users WHERE id = $1", [id]); } catch (e) { errors.push(`user ${id}: ${e.message}`); }
  }
  if (errors.length) {
    console.log("  ⚠️  cleanup parcial. IDs a borrar a mano:");
    console.log(JSON.stringify(created, null, 2));
    for (const e of errors) console.log("  -", e);
  } else {
    console.log(`  ✅ borradas todas las filas AUDIT_TEST (${created.userIds.length + created.orderIds.length + created.membershipIds.length + created.classIds.length + created.bookingIds.length} filas)`);
  }
}

try {
  await main();
} catch (e) {
  console.error("\n❌ FATAL:", e.message);
  failed++;
} finally {
  await cleanup();
  await pool.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
