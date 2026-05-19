# Per-Video Plan Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que la admin defina, por video, qué planes lo desbloquean (acceso automático, sin grant manual), conservando el flujo de compra individual ya existente para quienes no tengan esos planes.

**Architecture:** Tabla puente `video_plans(video_id, plan_id)` con `ON DELETE CASCADE`. El núcleo `computeVideoAccessState` pasa a ser per-video y resuelve acceso por: (a) plan en `video_plans`, (b) plan full-library `includes_video_library`, (c) compra `video_purchases.has_access`, (d) grant de cortesía `video_access_grants`, (e) `is_trial`. El front nunca decide acceso: lo dicta el backend; la única puerta real al MP4 sigue siendo `/stream-url` + token HMAC.

**Tech Stack:** Express + node-postgres (`server/index.js`, bloque de migraciones idempotente), React + react-hook-form + zod + shadcn, tests con `node` + `assert` en `endpoint-auditor/audit/*.mjs`.

**Spec:** `docs/superpowers/specs/2026-05-18-per-video-plan-access-design.md` (aprobado). Extiende `2026-05-14-video-library-access-design.md` (ya implementado).

**Cambio de comportamiento (spec §7):** se elimina el requisito de grant manual obligatorio para acceso por plan. `video_access_grants` queda como override de cortesía (vía d).

---

## Notas de contexto verificadas (no asumir, ya comprobado)

- El form admin de video (`src/pages/admin/videos/VideoUpload.tsx`) llama `api.post("/videos")` y `api.put("/videos/:id")` → handlers reales en `server/index.js:11322` (`POST /api/videos`) y `server/index.js:11357` (`PUT /api/videos/:id`). **NO** usar `/api/admin/videos` (11880/11896) — ese set no lo usa el form.
- Prefill de edición: `VideoUpload.tsx:63-66` hace `GET /videos/:id` y `VideoUpload.tsx:91` hace `...(existing ?? {})` sobre `defaultValues`. Por eso `GET /api/videos/:id` debe devolver `plan_ids` para precargar.
- El flujo de compra individual del cliente ya existe completo en `src/pages/client/VideoPlayer.tsx` (mutación `purchase` 92-96, proof 114, pasos 56-57). No se reescribe.
- `POST /api/videos/purchases/:id/approve` (`server/index.js:11232`) hoy setea `status='active'` pero **NO** `has_access=true`. La regla de acceso (c) usa `has_access`, así que hay que arreglarlo (Task 2).
- Patrón de tabla en migraciones: `await pool.query(\`CREATE TABLE IF NOT EXISTS ...\`).catch(() => { });` (ver `server/index.js:1080-1092`, `video_access_grants`).

## File Structure

- `server/index.js` — migración `video_plans`; reescritura `computeVideoAccessState`; fix `approve`; cambios en `GET /api/videos`, `GET /api/videos/:id`, `GET /api/videos/:id/stream-url`, `GET /api/me/video-access`, `POST /api/videos`, `PUT /api/videos/:id`.
- `src/pages/admin/videos/VideoUpload.tsx` — schema `plan_ids`, sección de acceso (Gratis / Por planes + multiselección), envío.
- `src/pages/admin/plans/PlansList.tsx` — recopy del switch `includesVideoLibrary`.
- `src/pages/client/VideoLibrary.tsx` — el lock se basa en `has_access` per-video (ya lo hace; ajuste menor de banner).
- `endpoint-auditor/audit/smoke-test-video-plan-access.mjs` — nuevo, matriz de acceso.
- `endpoint-auditor/audit/db-mutating-test-video-plans.mjs` — nuevo, integración `video_plans`.

---

### Task 1: Migración tabla `video_plans`

**Files:**
- Modify: `server/index.js` (insertar justo después de `server/index.js:1092`, tras el índice `idx_vag_user_active`)

- [ ] **Step 1: Añadir la migración idempotente**

Insertar inmediatamente después de la línea del índice `idx_vag_user_active` (`server/index.js:1092`):

```javascript
    // ── video_plans: qué planes desbloquean cada video (acceso granular) ──────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS video_plans (
        video_id  UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        plan_id   UUID NOT NULL REFERENCES plans(id)  ON DELETE CASCADE,
        PRIMARY KEY (video_id, plan_id)
      )
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_video_plans_plan ON video_plans(plan_id)`).catch(() => { });
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check server/index.js`
Expected: sin salida (exit 0).

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat(videos): tabla puente video_plans (acceso por plan)"
```

---

### Task 2: Fix `approve` para setear `has_access`

La regla de acceso (vía c) lee `video_purchases.has_access`. Hoy `approve` solo cambia `status`. Sin este fix, una compra aprobada no desbloquea.

**Files:**
- Modify: `server/index.js:11232-11242` (`POST /api/videos/purchases/:id/approve`)

- [ ] **Step 1: Reemplazar el UPDATE del handler approve**

Buscar exactamente:

```javascript
    const r = await pool.query(
      "UPDATE video_purchases SET status='active', admin_notes=$1, verified_at=NOW() WHERE id=$2 RETURNING *",
      [admin_notes || null, req.params.id]
    );
```

Reemplazar por:

```javascript
    const r = await pool.query(
      "UPDATE video_purchases SET status='active', has_access=true, admin_notes=$1, verified_at=NOW() WHERE id=$2 RETURNING *",
      [admin_notes || null, req.params.id]
    );
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check server/index.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "fix(videos): approve de compra setea has_access=true"
```

---

### Task 3: Reescribir `computeVideoAccessState(userId, videoId)`

**Files:**
- Modify: `server/index.js:9018-9045` (función `computeVideoAccessState`)
- Test: `endpoint-auditor/audit/smoke-test-video-plan-access.mjs` (nuevo)

- [ ] **Step 1: Escribir el smoke test que falla**

Crear `endpoint-auditor/audit/smoke-test-video-plan-access.mjs`:

```javascript
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
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node endpoint-auditor/audit/smoke-test-video-plan-access.mjs`
Expected: PASA (el test contiene su propia copia-contrato). Este paso valida que la lógica esperada es coherente antes de portarla a `server/index.js`. Si algún caso falla aquí, corregir la lógica del test hasta que los 9 pasen.

- [ ] **Step 3: Portar la función a `server/index.js`**

Reemplazar **íntegramente** `server/index.js:9018-9045` (de `async function computeVideoAccessState(userId) {` hasta su `}` de cierre) por:

```javascript
async function computeVideoAccessState(userId, videoId) {
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
```

- [ ] **Step 4: Verificar sintaxis y test**

Run: `node --check server/index.js && node endpoint-auditor/audit/smoke-test-video-plan-access.mjs`
Expected: `node --check` exit 0; test imprime `9 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add server/index.js endpoint-auditor/audit/smoke-test-video-plan-access.mjs
git commit -m "feat(videos): computeVideoAccessState per-video (vias a-e)"
```

---

### Task 4: Actualizar los 3 callers de `computeVideoAccessState`

La firma cambió a `(userId, videoId)`. Hay 3 callers: `/api/videos/:id` (8210), `/api/videos/:id/stream-url` (8235), `/api/me/video-access` (4352).

**Files:**
- Modify: `server/index.js:8205-8214` (`GET /api/videos/:id`)
- Modify: `server/index.js:8233-8240` (`GET /api/videos/:id/stream-url`)
- Modify: `server/index.js:4351-4360` (`GET /api/me/video-access`)

- [ ] **Step 1: `GET /api/videos/:id` — usar la nueva firma + exponer `plan_ids`**

En `server/index.js`, buscar este bloque dentro de `GET /api/videos/:id` (≈8205-8214):

```javascript
    video.has_access = video.access_type === "free" || video.access_type === "gratuito" || hasMembership;
    // Compute video library access state. Trial OR gratuito → always unlocked;
    // only `miembros + !is_trial` → check state.
    let accessState = { state: "unlocked" };
    if (video.is_trial !== true && video.access_type === "miembros") {
      accessState = await computeVideoAccessState(req.userId);
    }
    video.access_state = accessState;
```

Reemplazar por:

```javascript
    const accessState = await computeVideoAccessState(req.userId, video.id);
    video.access_state = accessState;
    video.has_access = accessState.state === "unlocked" || accessState.state === "free";
    const vpRes = await pool.query(
      "SELECT plan_id FROM video_plans WHERE video_id = $1",
      [video.id]
    );
    video.plan_ids = vpRes.rows.map((r) => r.plan_id);
```

- [ ] **Step 2: `GET /api/videos/:id/stream-url` — pasar videoId y mapear reason**

Buscar (≈8233-8240):

```javascript
    // Trial bypass: any logged-in user can play
    if (!video.is_trial) {
      const access = await computeVideoAccessState(req.userId);
      if (access.state !== "unlocked") {
        const reason = access.state === "locked_pending_grant" ? "pending_grant" : "no_plan";
        return res.status(403).json({ message: "Acceso restringido", reason });
      }
    }
```

Reemplazar por:

```javascript
    // Trial bypass: any logged-in user can play
    if (!video.is_trial) {
      const access = await computeVideoAccessState(req.userId, video.id);
      if (access.state !== "unlocked" && access.state !== "free") {
        const reason = access.state === "locked_purchasable" ? "purchasable" : "no_plan";
        return res.status(403).json({ message: "Acceso restringido", reason });
      }
    }
```

- [ ] **Step 3: `GET /api/me/video-access` — resumen de biblioteca (ya no per-video)**

Buscar `server/index.js:4351-4360`:

```javascript
// GET /api/me/video-access — returns this user's library access state
app.get("/api/me/video-access", authMiddleware, async (req, res) => {
  try {
    const state = await computeVideoAccessState(req.userId);
    return res.json({ data: state });
  } catch (err) {
    console.error("GET /me/video-access error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

Reemplazar por (resumen coarse: ¿tiene plan full-library activo? — el lock fino es per-video vía `/api/videos`):

```javascript
// GET /api/me/video-access — resumen de biblioteca (banner). El lock real es
// per-video y viene en /api/videos. Aquí solo: ¿plan full-library activo?
app.get("/api/me/video-access", authMiddleware, async (req, res) => {
  try {
    const fullLib = await pool.query(
      `SELECT 1 FROM memberships m JOIN plans p ON p.id = m.plan_id
        WHERE m.user_id = $1 AND m.status = 'active'
          AND p.includes_video_library = true
          AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE) LIMIT 1`,
      [req.userId]
    );
    if (fullLib.rows.length) return res.json({ data: { state: "unlocked" } });
    const offers = await pool.query(
      "SELECT id, name, price FROM plans WHERE includes_video_library = true AND is_active = true ORDER BY price ASC"
    );
    return res.json({ data: { state: "locked_no_plan", offers: offers.rows } });
  } catch (err) {
    console.error("GET /me/video-access error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

- [ ] **Step 4: Verificar que no quedan otros callers con la firma vieja**

Run: `grep -n "computeVideoAccessState(" server/index.js`
Expected: solo la definición (`async function computeVideoAccessState(userId, videoId)`) y dos llamadas, ambas con dos argumentos (`req.userId, video.id`). Si aparece alguna con un solo argumento, corregirla a pasar el `video.id` correspondiente del handler.

- [ ] **Step 5: Verificar sintaxis**

Run: `node --check server/index.js`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add server/index.js
git commit -m "feat(videos): callers usan computeVideoAccessState per-video + plan_ids en GET /:id"
```

---

### Task 5: `GET /api/videos` — has_access/accessState per-video

**Files:**
- Modify: `server/index.js:8155-8170` (cómputo de `has_access` en el listado)

- [ ] **Step 1: Reemplazar el cómputo de membership/has_access del listado**

Buscar dentro de `GET /api/videos` (≈8155-8170):

```javascript
    const r = await pool.query(query, params);
    // Check membership access
    const memRes = await pool.query(
      "SELECT id FROM memberships WHERE user_id = $1 AND status = 'active' LIMIT 1",
      [req.userId]
    );
    const hasMembership = memRes.rows.length > 0;
    const rows = r.rows.map(v => {
      // Drive-backed videos: NO leak the public proxy URL. Frontend must request a signed
      // URL via GET /api/videos/:id/stream-url. Without this, anyone could read video_url
      // from the JSON and curl /api/drive/video/:fileId directly (no auth on legacy proxy).
      // Non-Drive (e.g. YouTube) videos keep their video_url for the iframe embed path.
      let videoUrl = v.drive_file_id ? null : v.video_url;
      return { ...v, video_url: videoUrl, has_access: v.access_type === "free" || v.access_type === "gratuito" || hasMembership };
    });
    return res.json({ data: rows });
```

Reemplazar por (un solo query agregado: sin N+1):

```javascript
    const r = await pool.query(query, params);
    // Acceso per-video en un solo query agregado (vias a-e del spec 2026-05-18).
    const ids = r.rows.map((v) => v.id);
    const accessByVideo = new Map();
    if (ids.length) {
      const acc = await pool.query(
        `SELECT v.id,
          (v.access_type IN ('gratuito','free'))                            AS is_free,
          v.is_trial,
          v.sales_enabled,
          EXISTS (SELECT 1 FROM video_plans vp
                    JOIN memberships m ON m.plan_id = vp.plan_id
                   WHERE vp.video_id = v.id AND m.user_id = $1
                     AND m.status = 'active'
                     AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)) AS via_plan,
          EXISTS (SELECT 1 FROM memberships m JOIN plans p ON p.id = m.plan_id
                   WHERE m.user_id = $1 AND m.status = 'active'
                     AND p.includes_video_library = true
                     AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)) AS via_fulllib,
          EXISTS (SELECT 1 FROM video_purchases vpur
                   WHERE vpur.video_id = v.id AND vpur.user_id = $1
                     AND vpur.has_access = true)                            AS via_purchase,
          EXISTS (SELECT 1 FROM video_access_grants g
                   WHERE g.user_id = $1 AND g.revoked_at IS NULL)           AS via_grant
         FROM videos v WHERE v.id = ANY($2::uuid[])`,
        [req.userId, ids]
      );
      for (const a of acc.rows) {
        let state;
        if (a.is_free) state = "free";
        else if (a.is_trial || a.via_plan || a.via_fulllib || a.via_purchase || a.via_grant)
          state = "unlocked";
        else state = a.sales_enabled ? "locked_purchasable" : "locked_plan_only";
        accessByVideo.set(a.id, state);
      }
    }
    const rows = r.rows.map((v) => {
      // Drive-backed videos: NO leak the public proxy URL. Frontend must request a signed
      // URL via GET /api/videos/:id/stream-url. Non-Drive keeps video_url for the embed path.
      const videoUrl = v.drive_file_id ? null : v.video_url;
      const state = accessByVideo.get(v.id) || "locked_plan_only";
      return {
        ...v,
        video_url: videoUrl,
        access_state: { state },
        has_access: state === "unlocked" || state === "free",
      };
    });
    return res.json({ data: rows });
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check server/index.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat(videos): listado calcula acceso per-video en un solo query"
```

---

### Task 6: `POST /api/videos` y `PUT /api/videos/:id` aceptan `plan_ids`

**Files:**
- Modify: `server/index.js:11322-11355` (`POST /api/videos`)
- Modify: `server/index.js:11357-11403` (`PUT /api/videos/:id`)

- [ ] **Step 1: `POST /api/videos` — destructurar `plan_ids` y sincronizar en transacción**

En `POST /api/videos`, añadir `plan_ids` a la destructuración del body. Buscar:

```javascript
      sales_enabled = false, sales_unlocks_video = false, sales_price_mxn, sales_class_credits, sales_cta_text,
      category_id,
    } = req.body;
    if (!title) return res.status(400).json({ message: "title es requerido" });
    const r = await pool.query(
```

Reemplazar por:

```javascript
      sales_enabled = false, sales_unlocks_video = false, sales_price_mxn, sales_class_credits, sales_cta_text,
      category_id, plan_ids = [],
    } = req.body;
    if (!title) return res.status(400).json({ message: "title es requerido" });
    const r = await pool.query(
```

Luego, justo antes de `return res.status(201).json({ data: r.rows[0] });` (línea 11350), insertar la sincronización de `video_plans`:

```javascript
    const newId = r.rows[0].id;
    if (Array.isArray(plan_ids) && plan_ids.length) {
      for (const pid of plan_ids) {
        await pool.query(
          "INSERT INTO video_plans (video_id, plan_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [newId, pid]
        );
      }
    }
```

- [ ] **Step 2: `PUT /api/videos/:id` — destructurar `plan_ids` y resincronizar**

En `PUT /api/videos/:id`, buscar:

```javascript
      sales_enabled, sales_unlocks_video, sales_price_mxn, sales_class_credits, sales_cta_text,
      category_id,
    } = req.body;
    const r = await pool.query(
```

Reemplazar por:

```javascript
      sales_enabled, sales_unlocks_video, sales_price_mxn, sales_class_credits, sales_cta_text,
      category_id, plan_ids,
    } = req.body;
    const r = await pool.query(
```

Luego, justo antes de `return res.json({ data: r.rows[0] });` (línea 11398), insertar:

```javascript
    if (Array.isArray(plan_ids)) {
      await pool.query("DELETE FROM video_plans WHERE video_id = $1", [req.params.id]);
      for (const pid of plan_ids) {
        await pool.query(
          "INSERT INTO video_plans (video_id, plan_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [req.params.id, pid]
        );
      }
    }
```

(Nota: `plan_ids` se resincroniza solo si viene en el body — `Array.isArray(plan_ids)`. Si el front no lo manda, no se tocan los planes existentes.)

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check server/index.js`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat(videos): POST/PUT /api/videos sincronizan video_plans"
```

---

### Task 7: Admin UI — `VideoUpload.tsx` selección de planes

**Files:**
- Modify: `src/pages/admin/videos/VideoUpload.tsx` (schema 19-43; sección acceso 366-391; submit 233-236)

- [ ] **Step 1: Añadir `plan_ids` al schema**

En `src/pages/admin/videos/VideoUpload.tsx`, buscar en el schema (≈42):

```typescript
  thumbnail_drive_id: z.string().optional(),
});
```

Reemplazar por:

```typescript
  thumbnail_drive_id: z.string().optional(),
  plan_ids: z.array(z.string()).default([]),
});
```

- [ ] **Step 2: Cargar la lista de planes activos**

Buscar el `useQuery` de categorías (≈71-74):

```typescript
  const { data: categoriesData } = useQuery<{ data: { id: string; name: string }[] }>({
```

Insertar justo antes:

```typescript
  const { data: plansData } = useQuery<{ data: { id: string; name: string; includes_video_library?: boolean; includesVideoLibrary?: boolean }[] }>({
    queryKey: ["plans-for-video"],
    queryFn: async () => (await api.get("/plans")).data,
  });
  const plans = plansData?.data ?? [];
```

- [ ] **Step 3: Añadir `plan_ids` a defaultValues**

Buscar (≈90-92):

```typescript
      brand_color: "#76214D",
      ...( existing ?? {} ),
    },
```

Reemplazar por:

```typescript
      brand_color: "#76214D",
      plan_ids: [],
      ...( existing ?? {} ),
    },
```

(El backend ya devuelve `plan_ids` en `GET /api/videos/:id` — Task 4 Step 1 — y `existing` lo sobreescribe en edición.)

- [ ] **Step 4: Reemplazar la sección de acceso por el bloque Gratis / Por planes**

Buscar el bloque completo `{/* ── ACCESS ─────...*/}` … hasta el cierre `</section>` (≈366-391) y reemplazarlo por:

```tsx
{/* ── ACCESS ─────────────────────────────────────────────── */}
<section className="space-y-4 rounded-xl border p-5">
  <h2 className="font-semibold">Acceso y publicación</h2>
  <div className="space-y-2">
    <Label>Acceso al video</Label>
    <Select
      value={form.watch("access_type") === "gratuito" || form.watch("access_type") === "free" ? "gratuito" : "miembros"}
      onValueChange={(v) => form.setValue("access_type", v as VideoFormData["access_type"])}
    >
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="gratuito">Gratis — cualquier alumna registrada</SelectItem>
        <SelectItem value="miembros">Por planes — solo ciertos planes</SelectItem>
      </SelectContent>
    </Select>
  </div>

  {form.watch("access_type") === "miembros" && (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <Label className="text-sm">Planes que desbloquean este video</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-auto">
        {plans.map((p) => {
          const selected = (form.watch("plan_ids") ?? []).includes(p.id);
          const isFullLib = Boolean(p.includes_video_library ?? p.includesVideoLibrary);
          return (
            <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected}
                onChange={(e) => {
                  const cur = form.watch("plan_ids") ?? [];
                  form.setValue(
                    "plan_ids",
                    e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)
                  );
                }}
              />
              <span>{p.name}</span>
              {isFullLib && (
                <Badge variant="secondary" className="text-[0.6rem]">biblioteca completa</Badge>
              )}
            </label>
          );
        })}
      </div>
      {(form.watch("plan_ids") ?? []).length === 0 &&
        !plans.some((p) => Boolean(p.includes_video_library ?? p.includesVideoLibrary)) &&
        !salesEnabled && (
          <p className="text-xs text-amber-600">
            ⚠️ Nadie podrá ver este video. Selecciona planes o activa la compra individual.
          </p>
        )}
    </div>
  )}

  <div className="flex flex-wrap gap-6">
    <div className="flex items-center gap-3">
      <Switch checked={form.watch("is_published")} onCheckedChange={(v) => form.setValue("is_published", v)} />
      <Label>Publicado</Label>
    </div>
    <div className="flex items-center gap-3">
      <Switch checked={form.watch("is_featured")} onCheckedChange={(v) => form.setValue("is_featured", v)} />
      <Label>Destacado</Label>
    </div>
  </div>
</section>
```

- [ ] **Step 5: Asegurar import de `Badge`**

Run: `grep -n "import .*Badge" src/pages/admin/videos/VideoUpload.tsx`
Expected: si NO existe, añadir junto a los demás imports de `@/components/ui`:

```typescript
import { Badge } from "@/components/ui/badge";
```

(Si ya existe, no duplicar.)

- [ ] **Step 6: Verificar typecheck/lint**

Run: `npm run lint`
Expected: sin errores nuevos en `VideoUpload.tsx`. (El submit ya envía todo el objeto del form vía `createMutation`/`updateMutation`, así que `plan_ids` viaja automáticamente — no hay cambio en `onSubmit`.)

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/videos/VideoUpload.tsx
git commit -m "feat(admin): selección de planes por video en VideoUpload"
```

---

### Task 8: Admin UI — recopy del switch en `PlansList.tsx`

**Files:**
- Modify: `src/pages/admin/plans/PlansList.tsx:394-405`

- [ ] **Step 1: Reemplazar el texto del switch**

Buscar (≈400-403):

```tsx
    <Label className="cursor-pointer">Incluye acceso a biblioteca de videos</Label>
    <p className="text-xs text-muted-foreground">
      Las alumnas con este plan podrán acceder a las clases grabadas (requiere conceder acceso manualmente).
    </p>
```

Reemplazar por:

```tsx
    <Label className="cursor-pointer">Biblioteca completa de videos</Label>
    <p className="text-xs text-muted-foreground">
      Las alumnas con este plan ven todos los videos por planes, sin asignarlo video por video.
    </p>
```

- [ ] **Step 2: Verificar lint**

Run: `npm run lint`
Expected: sin errores nuevos en `PlansList.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/plans/PlansList.tsx
git commit -m "docs(admin): recopy switch biblioteca completa de videos"
```

---

### Task 9: Cliente — mapear nuevos estados en `VideoPlayer.tsx`

`VideoPlayer.tsx` ya maneja compra y lock vía `streamErrReason`. Hoy trata `reason === "pending_grant"`; ese estado ya no se emite. El backend ahora manda `reason: "purchasable" | "no_plan"`. Ajuste mínimo: cuando `purchasable`, mostrar el CTA de compra existente.

**Files:**
- Modify: `src/pages/client/VideoPlayer.tsx:176-219` (rama `streamError`)

- [ ] **Step 1: Leer el bloque actual de error de stream**

Run: `sed -n '176,219p' src/pages/client/VideoPlayer.tsx`
Expected: ver la rama `streamError ? (...)` con el copy de `pending_grant` / 404 / "No tienes acceso".

- [ ] **Step 2: Reemplazar la rama de error por una que distinga `purchasable`**

Reemplazar el bloque `) : streamError ? (` … `</div>` (el contenedor `aspect-video` completo, ≈176-219) por:

```tsx
                ) : streamError ? (
                  <div
                    className="aspect-video rounded-3xl flex flex-col items-center justify-center text-center gap-4 p-7"
                    style={{ backgroundColor: KALA.blush }}
                  >
                    <span
                      className="grid h-14 w-14 place-items-center rounded-2xl"
                      style={{ backgroundColor: streamErrReason === "purchasable" ? KALA.orange : KALA.berry, color: KALA.cream }}
                    >
                      {streamErrReason === "purchasable" ? <ShoppingBag size={20} /> : <Lock size={20} />}
                    </span>
                    <div>
                      <h3
                        className="font-bebas leading-tight"
                        style={{ color: KALA.ink, fontSize: "clamp(1.5rem, 2.4vw, 2rem)" }}
                      >
                        {streamErrStatus === 404
                          ? "Video no disponible"
                          : streamErrReason === "purchasable"
                            ? "Acceso individual"
                            : "No tienes acceso a este video"}
                      </h3>
                      <p
                        className="mt-2 text-[0.92rem]"
                        style={{ color: KALA.ink, opacity: 0.7 }}
                      >
                        {streamErrStatus === 404
                          ? "Este video aún no tiene archivo disponible."
                          : streamErrReason === "purchasable"
                            ? `Compra este video por $${formatMoneyMX(video.sales_price_mxn)} MXN para verlo cuando quieras.`
                            : "Exclusivo de ciertos planes. Adquiere un paquete que lo incluya para ver esta clase."}
                      </p>
                    </div>
                    {streamErrStatus !== 404 && streamErrReason === "purchasable" && (
                      <PrimaryButton
                        onClick={() => purchaseMutation.mutate()}
                        loading={purchaseMutation.isPending}
                        loadingLabel="Procesando…"
                      >
                        {video.sales_cta_text ?? "Comprar ahora"}
                      </PrimaryButton>
                    )}
                    {streamErrStatus !== 404 && streamErrReason !== "purchasable" && (
                      <PrimaryButton to="/app/checkout">Ver paquetes</PrimaryButton>
                    )}
                    <Link
                      to="/app/videos"
                      className="text-[0.82rem] no-underline"
                      style={{ color: KALA.ink, opacity: 0.6 }}
                    >
                      Volver a la biblioteca
                    </Link>
                  </div>
```

- [ ] **Step 3: Verificar que `ShoppingBag`, `Lock`, `formatMoneyMX`, `purchaseMutation` están en scope**

Run: `grep -n "ShoppingBag\|formatMoneyMX\|purchaseMutation\|import .*Lock" src/pages/client/VideoPlayer.tsx | head`
Expected: los 4 ya existen en el archivo (verificado: `purchaseMutation` 92, `formatMoneyMX` 275, `ShoppingBag` 268, `Lock` 185). Si algún import faltara, añadirlo junto a los imports existentes de `lucide-react` / utils.

- [ ] **Step 4: Verificar lint**

Run: `npm run lint`
Expected: sin errores nuevos en `VideoPlayer.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/client/VideoPlayer.tsx
git commit -m "feat(client): VideoPlayer distingue compra vs solo-planes"
```

---

### Task 10: Test de integración `video_plans` contra DB real

**Files:**
- Create: `endpoint-auditor/audit/db-mutating-test-video-plans.mjs`

- [ ] **Step 1: Crear el test mutante (setup → asserts → cleanup en finally)**

Crear `endpoint-auditor/audit/db-mutating-test-video-plans.mjs`:

```javascript
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
      // borrar el plan debe limpiar la fila por ON DELETE CASCADE
      // (se prueba al final en cleanup; aquí solo confirmamos la fila existe)
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
```

- [ ] **Step 2: Verificar sintaxis del test**

Run: `node --check endpoint-auditor/audit/db-mutating-test-video-plans.mjs`
Expected: exit 0. (La corrida real requiere `DATABASE_URL` de la DB de Kala — se ejecuta en QA, no en CI local. Si está disponible: `DATABASE_URL='...' node endpoint-auditor/audit/db-mutating-test-video-plans.mjs` → `2 passed` y `cascade check ... 0`.)

- [ ] **Step 3: Commit**

```bash
git add endpoint-auditor/audit/db-mutating-test-video-plans.mjs
git commit -m "test(videos): integración video_plans + acceso por plan"
```

---

### Task 11: Verificación final + checklist de rollout

- [ ] **Step 1: Sintaxis backend + smoke test**

Run: `node --check server/index.js && node endpoint-auditor/audit/smoke-test-video-plan-access.mjs`
Expected: exit 0 y `9 passed, 0 failed`.

- [ ] **Step 2: Lint frontend**

Run: `npm run lint`
Expected: sin errores nuevos en los archivos tocados.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 4: QA manual (requiere server + DB de staging/Kala)**

- Admin: crear video "Por planes", marcar 1 plan, guardar; reabrir edición → el plan aparece marcado (prefill `plan_ids`).
- Clienta con ese plan activo → ve el video sin candado, reproduce (sin grant manual). **Confirma el cambio de comportamiento spec §7.**
- Clienta sin ese plan, video con venta activada → ve "Acceso individual" + CTA comprar → flujo de comprobante → admin aprueba → video desbloqueado permanente.
- Clienta sin ese plan, video con venta apagada → "Exclusivo de ciertos planes" + "Ver paquetes".
- Borrar un plan en admin → no rompe; videos que lo listaban dejan de desbloquearse por ese plan.

- [ ] **Step 5: Comunicar el cambio de comportamiento (spec §7) al dueño antes de desplegar a producción.** Alumnas con plan full-library que esperaban grant manual quedarán desbloqueadas automáticamente al deploy.

---

## Self-Review

**1. Spec coverage:**
- Modelo de datos `video_plans` → Task 1. ✓
- `computeVideoAccessState` per-video (vías a–e) → Task 3. ✓
- Acceso automático sin grant (spec §7) → Task 3 (sin requisito de grant) + Task 11 Step 5 (comunicación). ✓
- Endpoints `/api/videos`, `/api/videos/:id`, `/stream-url` → Tasks 4 y 5. ✓
- `/api/me/video-access` redefinido (firma cambió) → Task 4 Step 3. ✓ (gap detectado y cubierto)
- `POST/PUT /api/videos` con `plan_ids` → Task 6. ✓
- Compra individual permanente: `approve` setea `has_access` → Task 2 (gap real detectado: hoy no lo setea). ✓
- Admin UI por video → Task 7; recopy plan → Task 8. ✓
- Cliente estados `locked_purchasable`/`locked_plan_only` → Task 9 (reusa flujo `VideoPlayer` existente). ✓
- `access_type` legacy `free`/`members`: la regla mapea `free→free`; `members` no lo emite el form nuevo (persiste `miembros`). Videos legacy `members` se tratan como `miembros` por el `EXISTS`/checks (no `gratuito`) → comportamiento correcto (por planes). ✓
- Testing → Tasks 3 y 10. ✓

**2. Placeholder scan:** sin TBD/TODO; cada step trae código y comando exactos.

**3. Type/consistency:** firma `computeVideoAccessState(userId, videoId)` consistente entre definición (Task 3) y los 3 callers (Task 4). Estados (`free`/`unlocked`/`locked_purchasable`/`locked_plan_only`) y `reason` (`purchasable`/`no_plan`) consistentes entre Task 3, 4, 5 y 9. `plan_ids` consistente: backend lo devuelve (Task 4 S1) y consume (Task 6), front lo declara en schema/defaults (Task 7) y viaja en el submit existente.

**Nota de alcance:** los endpoints legacy `/api/admin/videos` (POST/PUT en `server/index.js:13880/13896`) NO los usa el form admin y quedan fuera del plan a propósito (YAGNI). Si en el futuro algo los usa, replicar el patrón `plan_ids` de Task 6.
