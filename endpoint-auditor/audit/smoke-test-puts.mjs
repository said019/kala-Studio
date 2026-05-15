// Smoke test de los handlers modificados (H1, M1, M2, M3) con pool mockeado.
// Re-implementa exactamente la lógica de los handlers tal como quedó en
// server/index.js y la corre contra un mock que simula Postgres.
// Esto NO importa server/index.js (que requiere DATABASE_URL real).
// Si alguna assertion falla, el script termina con código != 0.

import assert from "node:assert/strict";

// ── Mock de res ──────────────────────────────────────────────────────────────
function makeRes() {
  const res = { _status: 200, _body: null };
  res.status = (s) => { res._status = s; return res; };
  res.json = (b) => { res._body = b; return res; };
  return res;
}

// ── Mock de pool.query / pool.connect ────────────────────────────────────────
function makePool({ table }) {
  // table = { orders: Map<id, row>, memberships: Map<id, row>, bookings: [], classes: Map<id, row> }
  let inTx = false;
  const log = [];
  function exec(sql, params = []) {
    log.push({ sql: sql.replace(/\s+/g, " ").trim().slice(0, 80), params });
    const s = sql.replace(/\s+/g, " ").trim();

    // ─ orders ─
    if (/^UPDATE orders SET status = 'rejected'/i.test(s)) {
      const [id, reason, verifiedBy] = params;
      const o = table.orders.get(id);
      if (!o) return { rows: [], rowCount: 0 };
      if (["approved", "rejected"].includes(o.status)) return { rows: [], rowCount: 0 };
      o.status = "rejected"; o.notes = reason; o.verified_by = verifiedBy; o.verified_at = new Date();
      return { rows: [{ ...o }], rowCount: 1 };
    }
    if (/^SELECT status FROM orders WHERE id = \$1/i.test(s)) {
      const o = table.orders.get(params[0]);
      return o ? { rows: [{ status: o.status }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }

    // ─ memberships activate ─
    if (/^UPDATE memberships SET status = 'active', updated_at = NOW\(\) WHERE id = \$1 AND status <> 'active'/i.test(s)) {
      const m = table.memberships.get(params[0]);
      if (!m || m.status === "active") return { rows: [], rowCount: 0 };
      m.status = "active";
      return { rows: [{ ...m, plan_name: "Test Plan", plan_class_limit: 4 }], rowCount: 1 };
    }
    if (/^SELECT m\.\*, .*FROM memberships m WHERE m\.id = \$1/i.test(s)) {
      const m = table.memberships.get(params[0]);
      return m ? { rows: [{ ...m, plan_name: "Test Plan", plan_class_limit: 4 }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }

    // ─ memberships cancel ─
    if (/^UPDATE memberships SET status = 'cancelled', cancellation_reason = \$2/i.test(s)) {
      const [id, reason] = params;
      const m = table.memberships.get(id);
      if (!m || m.status === "cancelled") return { rows: [], rowCount: 0 };
      m.status = "cancelled"; m.cancellation_reason = reason; m.cancelled_at = new Date();
      return { rows: [{ ...m }], rowCount: 1 };
    }
    if (/^SELECT \* FROM memberships WHERE id = \$1/i.test(s)) {
      const m = table.memberships.get(params[0]);
      return m ? { rows: [{ ...m }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/^SELECT b\.id, b\.class_id, b\.user_id FROM bookings b JOIN classes c/i.test(s)) {
      const [memId] = params;
      const out = table.bookings.filter((b) => b.membership_id === memId && b.status === "confirmed" && b.future);
      return { rows: out.map((b) => ({ id: b.id, class_id: b.class_id, user_id: b.user_id })), rowCount: out.length };
    }
    if (/^UPDATE bookings SET status='cancelled'/i.test(s)) {
      const b = table.bookings.find((x) => x.id === params[0]);
      if (b) b.status = "cancelled";
      return { rows: [], rowCount: b ? 1 : 0 };
    }
    if (/^UPDATE classes SET current_bookings = GREATEST/i.test(s)) {
      const c = table.classes.get(params[0]);
      if (c) c.current_bookings = Math.max(0, (c.current_bookings ?? 0) - 1);
      return { rows: [], rowCount: c ? 1 : 0 };
    }

    // ─ memberships PUT generic ─
    if (/^UPDATE memberships SET status = COALESCE/i.test(s)) {
      const [status, classesRem, endDate, payMethod, id] = params;
      const m = table.memberships.get(id);
      if (!m) return { rows: [], rowCount: 0 };
      if (status) m.status = status;
      if (classesRem !== null && classesRem !== undefined) m.classes_remaining = classesRem;
      if (endDate) m.end_date = endDate;
      if (payMethod) m.payment_method = payMethod;
      return { rows: [{ ...m }], rowCount: 1 };
    }

    if (/^BEGIN$/i.test(s)) { inTx = true; return { rows: [] }; }
    if (/^COMMIT$/i.test(s)) { inTx = false; return { rows: [] }; }
    if (/^ROLLBACK$/i.test(s)) { inTx = false; return { rows: [] }; }

    throw new Error(`mock pool: query no soportada → ${s.slice(0, 100)}`);
  }
  const pool = {
    query: async (sql, params) => exec(sql, params),
    connect: async () => ({
      query: async (sql, params) => exec(sql, params),
      release: () => {},
    }),
    _log: log,
  };
  return pool;
}

// Stub fire-and-forget
const triggerWalletPassSync = () => {};

// ── Handlers (copia 1:1 de la lógica que quedó en server/index.js) ──────────

async function handleOrderReject(pool, req, res) {
  try {
    const { notes, reason } = req.body;
    const rejectionReason = reason || notes || "No especificado";
    const r = await pool.query(
      `UPDATE orders SET status = 'rejected', verified_at = NOW(), verified_by = $3, notes = $2
         WHERE id = $1 AND status NOT IN ('approved','rejected')
         RETURNING *, user_id`,
      [req.params.id, rejectionReason, req.userId]
    );
    if (!r.rows.length) {
      const exists = await pool.query("SELECT status FROM orders WHERE id = $1", [req.params.id]);
      if (!exists.rows.length) return res.status(404).json({ message: "Orden no encontrada" });
      return res.status(409).json({
        message: `La orden ya está '${exists.rows[0].status}' y no se puede rechazar`,
        currentStatus: exists.rows[0].status,
      });
    }
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
}

async function handleMembershipActivate(pool, req, res) {
  try {
    const r = await pool.query(
      `UPDATE memberships SET status = 'active', updated_at = NOW()
         WHERE id = $1 AND status <> 'active'
         RETURNING *, (SELECT name FROM plans WHERE id = memberships.plan_id) AS plan_name,
                      (SELECT class_limit FROM plans WHERE id = memberships.plan_id) AS plan_class_limit`,
      [req.params.id]
    );
    if (!r.rows.length) {
      const cur = await pool.query(
        `SELECT m.*, (SELECT name FROM plans WHERE id = m.plan_id) AS plan_name,
                     (SELECT class_limit FROM plans WHERE id = m.plan_id) AS plan_class_limit
           FROM memberships m WHERE m.id = $1`,
        [req.params.id]
      );
      if (!cur.rows.length) return res.status(404).json({ message: "Membresía no encontrada" });
      return res.json({ data: cur.rows[0], alreadyActive: true });
    }
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
}

async function handleMembershipCancel(pool, req, res) {
  const { reason } = req.body || {};
  const cancellationReason = (reason && String(reason).trim()) || "Cancelada por admin";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `UPDATE memberships SET status = 'cancelled', cancellation_reason = $2, cancelled_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status <> 'cancelled' RETURNING *`,
      [req.params.id, cancellationReason]
    );
    if (!r.rows.length) {
      const cur = await client.query("SELECT * FROM memberships WHERE id = $1", [req.params.id]);
      await client.query("ROLLBACK");
      if (!cur.rows.length) return res.status(404).json({ message: "Membresía no encontrada" });
      return res.json({ data: cur.rows[0], alreadyCancelled: true });
    }
    const membership = r.rows[0];
    const futureBookings = await client.query(
      `SELECT b.id, b.class_id, b.user_id FROM bookings b JOIN classes c ON c.id = b.class_id
        WHERE b.membership_id = $1 AND b.status = 'confirmed'
          AND (c.date > CURRENT_DATE OR (c.date = CURRENT_DATE AND c.start_time > CURRENT_TIME))`,
      [req.params.id]
    );
    let bookingsCancelled = 0;
    for (const b of futureBookings.rows) {
      await client.query(`UPDATE bookings SET status='cancelled', cancelled_at=NOW() WHERE id = $1`, [b.id]);
      await client.query(`UPDATE classes SET current_bookings = GREATEST(current_bookings - 1, 0) WHERE id = $1`, [b.class_id]);
      bookingsCancelled++;
    }
    await client.query("COMMIT");
    triggerWalletPassSync(membership.user_id, "membership_cancelled");
    return res.json({ data: membership, bookings_cancelled: bookingsCancelled, reason: cancellationReason });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(500).json({ message: "Error interno" });
  } finally { client.release(); }
}

async function handleMembershipPut(pool, req, res) {
  try {
    const { status, classesRemaining, endDate, paymentMethod } = req.body;
    const VALID_STATUS = ["pending_payment", "pending_activation", "active", "expired", "paused", "cancelled"];
    if (status !== undefined && status !== null && !VALID_STATUS.includes(status)) {
      return res.status(400).json({ message: `status inválido. Debe ser uno de: ${VALID_STATUS.join(", ")}` });
    }
    if (classesRemaining !== undefined && classesRemaining !== null) {
      const n = Number(classesRemaining);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: "classesRemaining debe ser >= 0" });
    }
    const r = await pool.query(
      `UPDATE memberships SET status = COALESCE($1, status), classes_remaining = COALESCE($2, classes_remaining),
         end_date = COALESCE($3, end_date), payment_method = COALESCE($4, payment_method), updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [status || null, classesRemaining ?? null, endDate || null, paymentMethod || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Membresía no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
}

// ── Tests ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     ${e.message}`); failed++; }
}

console.log("\nH1 — PUT /api/admin/orders/:id/reject");
{
  const t = { orders: new Map([["o1", { id: "o1", status: "pending_verification", user_id: "u1" }],
                                ["o2", { id: "o2", status: "approved", user_id: "u2" }]]),
              memberships: new Map(), bookings: [], classes: new Map() };
  const pool = makePool({ table: t });

  await test("rechaza una orden pending_verification → 200 con verified_by seteado", async () => {
    const res = makeRes();
    await handleOrderReject(pool, { params: { id: "o1" }, body: { reason: "Comprobante ilegible" }, userId: "admin-1" }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.data.status, "rejected");
    assert.equal(res._body.data.verified_by, "admin-1");
    assert.equal(res._body.data.notes, "Comprobante ilegible");
  });

  await test("rechazar orden ya 'approved' → 409 (NO la pisa, NO inconsistencia)", async () => {
    const res = makeRes();
    await handleOrderReject(pool, { params: { id: "o2" }, body: {}, userId: "admin-1" }, res);
    assert.equal(res._status, 409);
    assert.equal(res._body.currentStatus, "approved");
    // Verificar que el row real NO fue mutado
    assert.equal(t.orders.get("o2").status, "approved");
  });

  await test("rechazar orden inexistente → 404", async () => {
    const res = makeRes();
    await handleOrderReject(pool, { params: { id: "o-missing" }, body: {}, userId: "admin-1" }, res);
    assert.equal(res._status, 404);
  });

  await test("rechazar orden ya 'rejected' (segundo click) → 409", async () => {
    const res = makeRes();
    await handleOrderReject(pool, { params: { id: "o1" }, body: {}, userId: "admin-1" }, res);
    assert.equal(res._status, 409);
    assert.equal(res._body.currentStatus, "rejected");
  });
}

console.log("\nM1 — PUT /api/memberships/:id/activate");
{
  const t = { orders: new Map(),
              memberships: new Map([["m1", { id: "m1", status: "pending", user_id: "u1", plan_id: "p1" }],
                                    ["m2", { id: "m2", status: "active", user_id: "u2", plan_id: "p1" }]]),
              bookings: [], classes: new Map() };
  const pool = makePool({ table: t });

  await test("activa una membresía pending → 200, status=active", async () => {
    const res = makeRes();
    await handleMembershipActivate(pool, { params: { id: "m1" } }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.data.status, "active");
    assert.equal(res._body.alreadyActive, undefined);
  });

  await test("activar de nuevo (ya active) → 200 con alreadyActive:true, SIN re-disparar side effects", async () => {
    const res = makeRes();
    await handleMembershipActivate(pool, { params: { id: "m2" } }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.alreadyActive, true);
    assert.equal(res._body.data.status, "active");
  });

  await test("activar inexistente → 404", async () => {
    const res = makeRes();
    await handleMembershipActivate(pool, { params: { id: "missing" } }, res);
    assert.equal(res._status, 404);
  });
}

console.log("\nM2 — PUT /api/memberships/:id/cancel (con cascada)");
{
  const t = { orders: new Map(),
              memberships: new Map([["m1", { id: "m1", status: "active", user_id: "u1", plan_id: "p1" }],
                                    ["m2", { id: "m2", status: "cancelled", user_id: "u2", plan_id: "p1" }]]),
              bookings: [
                { id: "b1", membership_id: "m1", class_id: "c1", user_id: "u1", status: "confirmed", future: true },
                { id: "b2", membership_id: "m1", class_id: "c2", user_id: "u1", status: "confirmed", future: true },
                { id: "b3", membership_id: "m1", class_id: "c3", user_id: "u1", status: "checked_in", future: false }, // ya pasó
                { id: "b4", membership_id: "m1", class_id: "c4", user_id: "u1", status: "cancelled", future: true },   // ya cancelada
              ],
              classes: new Map([
                ["c1", { id: "c1", current_bookings: 5 }],
                ["c2", { id: "c2", current_bookings: 1 }],
                ["c3", { id: "c3", current_bookings: 3 }],
                ["c4", { id: "c4", current_bookings: 2 }],
              ]) };
  const pool = makePool({ table: t });

  await test("cancela activa con reason → 200, cascada cancela 2 bookings futuras y decrementa current_bookings", async () => {
    const res = makeRes();
    await handleMembershipCancel(pool, { params: { id: "m1" }, body: { reason: "Refund solicitado" } }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.bookings_cancelled, 2);
    assert.equal(res._body.reason, "Refund solicitado");
    assert.equal(res._body.data.cancellation_reason, "Refund solicitado");
    // b1 y b2 cancelled, b3 (checked_in pasada) intacta, b4 (ya cancelled) intacta
    assert.equal(t.bookings.find((b) => b.id === "b1").status, "cancelled");
    assert.equal(t.bookings.find((b) => b.id === "b2").status, "cancelled");
    assert.equal(t.bookings.find((b) => b.id === "b3").status, "checked_in");
    // current_bookings decrementado solo en c1 y c2
    assert.equal(t.classes.get("c1").current_bookings, 4);
    assert.equal(t.classes.get("c2").current_bookings, 0);
    assert.equal(t.classes.get("c3").current_bookings, 3);
    assert.equal(t.classes.get("c4").current_bookings, 2);
  });

  await test("cancelar de nuevo (ya cancelled) → 200 alreadyCancelled, sin tocar bookings", async () => {
    const res = makeRes();
    await handleMembershipCancel(pool, { params: { id: "m2" }, body: {} }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.alreadyCancelled, true);
  });

  await test("cancelar inexistente → 404", async () => {
    const res = makeRes();
    await handleMembershipCancel(pool, { params: { id: "missing" }, body: {} }, res);
    assert.equal(res._status, 404);
  });

  await test("default reason cuando body vacío", async () => {
    // m1 ya está cancelled de la primera llamada, así que cae en alreadyCancelled.
    // Hago un caso fresco:
    t.memberships.set("m3", { id: "m3", status: "active", user_id: "u3", plan_id: "p1" });
    const res = makeRes();
    await handleMembershipCancel(pool, { params: { id: "m3" }, body: {} }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.reason, "Cancelada por admin");
  });
}

console.log("\nM3 — PUT /api/memberships/:id (validación)");
{
  const t = { orders: new Map(),
              memberships: new Map([["m1", { id: "m1", status: "active", user_id: "u1", plan_id: "p1", classes_remaining: 4 }]]),
              bookings: [], classes: new Map() };
  const pool = makePool({ table: t });

  await test("status inválido → 400", async () => {
    const res = makeRes();
    await handleMembershipPut(pool, { params: { id: "m1" }, body: { status: "frozn" } }, res);
    assert.equal(res._status, 400);
    assert.match(res._body.message, /status inválido/);
  });

  await test("classesRemaining negativo → 400", async () => {
    const res = makeRes();
    await handleMembershipPut(pool, { params: { id: "m1" }, body: { classesRemaining: -3 } }, res);
    assert.equal(res._status, 400);
    assert.match(res._body.message, />= 0/);
  });

  await test("classesRemaining no-numérico → 400", async () => {
    const res = makeRes();
    await handleMembershipPut(pool, { params: { id: "m1" }, body: { classesRemaining: "abc" } }, res);
    assert.equal(res._status, 400);
  });

  await test("status válido + classesRemaining 0 → 200", async () => {
    const res = makeRes();
    await handleMembershipPut(pool, { params: { id: "m1" }, body: { status: "paused", classesRemaining: 0 } }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.data.status, "paused");
    assert.equal(res._body.data.classes_remaining, 0);
  });

  await test("status='pending_payment' (valor REAL del enum) → 200, no 400", async () => {
    const res = makeRes();
    await handleMembershipPut(pool, { params: { id: "m1" }, body: { status: "pending_payment" } }, res);
    assert.equal(res._status, 200);
    assert.equal(res._body.data.status, "pending_payment");
  });

  await test("status='pending' (típico typo, no existe en enum real) → 400", async () => {
    const res = makeRes();
    await handleMembershipPut(pool, { params: { id: "m1" }, body: { status: "pending" } }, res);
    assert.equal(res._status, 400);
  });

  await test("body vacío (solo updated_at) → 200, sin cambiar nada relevante", async () => {
    const res = makeRes();
    await handleMembershipPut(pool, { params: { id: "m1" }, body: {} }, res);
    assert.equal(res._status, 200);
  });

  await test("inexistente → 404", async () => {
    const res = makeRes();
    await handleMembershipPut(pool, { params: { id: "missing" }, body: { status: "active" } }, res);
    assert.equal(res._status, 404);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
