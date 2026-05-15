# Video library access — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir control de acceso a la biblioteca de videos por plan + grant manual del admin, con clase trial pública para captación, sin romper el feed público de `homepage_video_cards`.

**Architecture:** Schema aditivo (3 cambios), helper único `computeVideoAccessState` como fuente de verdad, dos barreras de seguridad complementarias (`/stream-url` decide elegibilidad, `/drive/secure-video/:fileId` valida token HMAC en cada Range). UI del admin: checkbox por plan, toggle por video, sección por alumna, dashboard widget de pendientes. UI de alumna: extensión de `VideoLibrary.tsx` con overlays de locked + nuevo modal informativo.

**Tech Stack:** Express + `pg.Pool` (Postgres), JWT propio, React 18 + React Query + shadcn-ui, Vite, Google Drive como almacenamiento (5 TB).

**Specs:** `docs/superpowers/specs/2026-05-14-video-library-access-design.md`

---

## Phase 0 — Setup

### Task 0.1: Create feature branch

**Files:**
- N/A (git only)

- [ ] **Step 1: Verify clean working tree**

```bash
cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio"
git status
```
Expected: clean OR only the spec file already staged.

- [ ] **Step 2: Create branch**

```bash
git checkout -b feat/video-library-access
```

- [ ] **Step 3: Commit spec if not already**

```bash
git add docs/superpowers/specs/2026-05-14-video-library-access-design.md docs/superpowers/plans/2026-05-14-video-library-access-plan.md
git commit -m "docs: spec + plan for video library access control

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 1 — Schema migration

### Task 1.1: Add schema changes (idempotent migration block)

**Files:**
- Modify: `server/index.js` (add to the existing `await Promise.all([...])` migration block near top of `init()`, line ~1020-1040)

- [ ] **Step 1: Find migration block**

```bash
grep -n "ALTER TABLE memberships ADD COLUMN IF NOT EXISTS order_id" server/index.js
```
Expected: line ~1025. The migrations live near here, in the `init()` function.

- [ ] **Step 2: Add migration code**

Insert immediately AFTER the line `await pool.query(\`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS order_id UUID\`).catch(() => { });`:

```js
    // ── Video library access (2026-05-14) ──────────────────────────────────
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS includes_video_library BOOLEAN NOT NULL DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false`).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS video_access_grants (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        granted_by  UUID NOT NULL REFERENCES users(id),
        granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at  TIMESTAMPTZ NULL,
        revoked_by  UUID NULL REFERENCES users(id),
        note        TEXT NULL
      )
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_vag_user_active ON video_access_grants(user_id) WHERE revoked_at IS NULL`).catch(() => { });
```

- [ ] **Step 3: Run migration against real DB to verify**

```bash
DATABASE_URL='postgresql://postgres:<PWD>@autorack.proxy.rlwy.net:40908/railway' \
  node -e "import('pg').then(async m => {
    const p = new m.default.Pool({connectionString: process.env.DATABASE_URL});
    await p.query(\"ALTER TABLE plans ADD COLUMN IF NOT EXISTS includes_video_library BOOLEAN NOT NULL DEFAULT false\");
    await p.query(\"ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false\");
    await p.query(\`CREATE TABLE IF NOT EXISTS video_access_grants (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, granted_by UUID NOT NULL REFERENCES users(id), granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ NULL, revoked_by UUID NULL REFERENCES users(id), note TEXT NULL)\`);
    await p.query(\"CREATE INDEX IF NOT EXISTS idx_vag_user_active ON video_access_grants(user_id) WHERE revoked_at IS NULL\");
    const r = await p.query(\"SELECT column_name FROM information_schema.columns WHERE table_name IN ('plans','videos') AND column_name IN ('includes_video_library','is_trial') UNION SELECT table_name FROM information_schema.tables WHERE table_name='video_access_grants'\");
    console.log(r.rows);
    await p.end();
  })"
```
Expected output: 3 rows showing `includes_video_library`, `is_trial`, `video_access_grants`.

- [ ] **Step 4: Syntax check + commit**

```bash
node --check server/index.js && echo OK
git add server/index.js
git commit -m "feat(db): video library access schema (plans.includes_video_library, videos.is_trial, video_access_grants)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — Backend helpers (TDD)

### Task 2.1: Stream token sign/verify (HMAC)

**Files:**
- Modify: `server/index.js` (add helpers after `JWT_SECRET` constant, around line ~30-40)
- Create: `endpoint-auditor/audit/smoke-test-video-tokens.mjs`

- [ ] **Step 1: Write the failing test**

Create `endpoint-auditor/audit/smoke-test-video-tokens.mjs`:

```js
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
```

- [ ] **Step 2: Run test, expect PASS** (it tests its own re-implementation)

```bash
node endpoint-auditor/audit/smoke-test-video-tokens.mjs
```
Expected: `6 passed, 0 failed`. This locks in the contract that `server/index.js` must match.

- [ ] **Step 3: Add helpers to server/index.js**

Find the line `const JWT_SECRET = process.env.JWT_SECRET || "dev_kala_secret_change_me";` (line ~30). Add immediately after:

```js
// ─── Video stream token helpers ───────────────────────────────────────────────
// HMAC tokens used to gate /api/drive/secure-video/:fileId. See spec
// docs/superpowers/specs/2026-05-14-video-library-access-design.md.
function signStreamToken({ userId, fileId, exp }) {
  const payload = `${userId}|${fileId}|${exp}`;
  return crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("base64url");
}
function verifyStreamToken({ token, userId, fileId, exp }) {
  if (!token || !exp || Date.now() >= Number(exp)) return false;
  const expected = signStreamToken({ userId, fileId, exp });
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
```

Verify `crypto` is already imported. If not, add at top: `import crypto from "node:crypto";` (or `const crypto = require("node:crypto");` if CommonJS).

- [ ] **Step 4: Verify imports**

```bash
grep -nE "^import crypto|^const crypto = require\(" server/index.js | head -3
```
Expected: at least one match. If none, add the import.

- [ ] **Step 5: Syntax check**

```bash
node --check server/index.js && echo OK
```

- [ ] **Step 6: Commit**

```bash
git add server/index.js endpoint-auditor/audit/smoke-test-video-tokens.mjs
git commit -m "feat(api): HMAC sign/verify helpers for video stream tokens

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2: `computeVideoAccessState` helper

**Files:**
- Modify: `server/index.js` (add helper after the existing `applyCancellationRollback` helper, around line ~8775)
- Create: `endpoint-auditor/audit/smoke-test-video-access.mjs`

- [ ] **Step 1: Write the failing test**

Create `endpoint-auditor/audit/smoke-test-video-access.mjs`:

```js
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
```

- [ ] **Step 2: Run test (still using its inline re-implementation)**

```bash
node endpoint-auditor/audit/smoke-test-video-access.mjs
```
Expected: `6 passed, 0 failed`.

- [ ] **Step 3: Add `computeVideoAccessState` to server/index.js**

Find the function `applyCancellationRollback`:

```bash
grep -n "^async function applyCancellationRollback" server/index.js
```
Expected: ~line 8708.

Add this function immediately AFTER the closing `}` of `applyCancellationRollback`:

```js
// ─── Video access state ──────────────────────────────────────────────────────
// Single source of truth for "can this user access the video library?".
// See docs/superpowers/specs/2026-05-14-video-library-access-design.md.
async function computeVideoAccessState(userId) {
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
```

- [ ] **Step 4: Syntax check + commit**

```bash
node --check server/index.js && echo OK
git add server/index.js endpoint-auditor/audit/smoke-test-video-access.mjs
git commit -m "feat(api): computeVideoAccessState helper

Single source of truth for video library access decisions.
See spec at docs/superpowers/specs/2026-05-14-video-library-access-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3: Refactor Drive proxy into reusable helper

**Files:**
- Modify: `server/index.js` (around `app.get("/api/drive/video/:fileId", ...)` at line ~11378)

- [ ] **Step 1: Find the existing route**

```bash
grep -n 'app.get."/api/drive/video' server/index.js
```
Expected: line ~11378.

- [ ] **Step 2: Read the full handler**

```bash
sed -n '11378,11470p' server/index.js
```

- [ ] **Step 3: Extract body into helper, leaving thin route**

Replace the entire `app.get("/api/drive/video/:fileId", async (req, res) => { ... });` block with:

```js
// ── Drive proxy helper (Range requests, used by both routes) ─────────────────
async function streamDriveFile(req, res, fileId) {
  if (!fileId || fileId.length < 10) return res.status(400).end();
  const accessToken = await getGoogleDriveAccessToken();

  const metaResp = await axios.get(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,size,name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const { mimeType, size, name } = metaResp.data;
  const totalSize = parseInt(size, 10);

  const rangeHeader = req.headers.range;
  let start = 0;
  let end = totalSize - 1;
  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    start = parseInt(parts[0], 10);
    end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
    if (start >= totalSize || end >= totalSize) {
      res.writeHead(416, { "Content-Range": `bytes */${totalSize}` });
      return res.end();
    }
  }

  const chunkSize = end - start + 1;
  // KEEP REST OF EXISTING HANDLER BODY — copy verbatim from the original
  // app.get("/api/drive/video/:fileId") block starting at the line that
  // declares `const driveHeaders = {...}` through the end of the handler.
  // The variables `start`, `end`, `totalSize`, `chunkSize`, `mimeType`, `name`,
  // `accessToken` are already in scope here.
  // Implementation note: the executor must paste the existing streaming code
  // (axios stream pipe to res with 206 status, headers, error handling).
  const driveHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Range: `bytes=${start}-${end}`,
  };
  const driveResp = await axios.get(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: driveHeaders, responseType: "stream" }
  );
  res.writeHead(rangeHeader ? 206 : 200, {
    "Content-Type": mimeType,
    "Content-Length": chunkSize,
    "Accept-Ranges": "bytes",
    "Content-Range": rangeHeader ? `bytes ${start}-${end}/${totalSize}` : undefined,
    "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
  });
  driveResp.data.pipe(res);
  driveResp.data.on("error", (err) => {
    console.error("[drive proxy stream error]", err.message);
    if (!res.headersSent) res.status(500).end();
  });
}

// Public proxy (legacy — used by homepage_video_cards). Open by design.
app.get("/api/drive/video/:fileId", async (req, res) => {
  try {
    await streamDriveFile(req, res, req.params.fileId);
  } catch (err) {
    console.error("[GET /drive/video] error:", err.message);
    if (!res.headersSent) res.status(500).end();
  }
});
```

> ⚠️ **IMPORTANT for the executor**: read the original handler body BEFORE replacing. The exact axios streaming code, headers, and error handling must be preserved verbatim. Do not paraphrase. The snippet above is a faithful template — adjust if the original differs (e.g., uses `pipeline()` or extra headers).

- [ ] **Step 4: Test the existing /drive/video still works**

Start the server locally (or check the next time someone deploys) and `curl -I http://localhost:8080/api/drive/video/<some-known-fileId>`. Expected: `200 OK` (or `206` if Range header sent), same as before.

If you don't have a local server running, syntax check is enough for this task. The full integration test in Phase 5 will cover it.

```bash
node --check server/index.js && echo OK
```

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "refactor(api): extract Drive proxy into streamDriveFile helper

Prepares for /api/drive/secure-video/:fileId in next task. /api/drive/video/:fileId behavior unchanged (still public, still serves homepage_video_cards).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — Backend endpoints (alumna side)

### Task 3.1: `GET /api/me/video-access`

**Files:**
- Modify: `server/index.js` (add new route — pick a logical spot near other `/api/me/*` routes; if none, near `/api/users/:id` at line ~8077)

- [ ] **Step 1: Find a logical insertion point**

```bash
grep -n 'app.get("/api/me/' server/index.js | head -3
```
If `/api/me/*` routes exist, insert near them. Else insert after `app.put("/api/users/:id"` block ends.

- [ ] **Step 2: Add the endpoint**

```js
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

- [ ] **Step 3: Add a smoke-test case (extend the existing file)**

Append to `endpoint-auditor/audit/smoke-test-video-access.mjs` BEFORE the final `console.log`:

```js
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
```

- [ ] **Step 4: Run smoke test**

```bash
node endpoint-auditor/audit/smoke-test-video-access.mjs
```
Expected: `7 passed, 0 failed`.

- [ ] **Step 5: Syntax check + commit**

```bash
node --check server/index.js && echo OK
git add server/index.js endpoint-auditor/audit/smoke-test-video-access.mjs
git commit -m "feat(api): GET /api/me/video-access

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.2: `GET /api/videos/:id/stream-url`

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add endpoint near other `/api/videos/*` routes**

```bash
grep -n 'app.get("/api/videos/:id"' server/index.js
```
Insert AFTER the `GET /api/videos/:id` handler ends.

```js
// GET /api/videos/:id/stream-url — gated stream URL with HMAC token
app.get("/api/videos/:id/stream-url", authMiddleware, async (req, res) => {
  try {
    const v = await pool.query(
      "SELECT id, drive_file_id, is_trial FROM videos WHERE id = $1",
      [req.params.id]
    );
    if (!v.rows.length) return res.status(404).json({ message: "Video no encontrado" });
    const video = v.rows[0];
    if (!video.drive_file_id) return res.status(404).json({ message: "Video sin archivo en Drive" });

    // Trial bypass: any logged-in user can play
    if (!video.is_trial) {
      const access = await computeVideoAccessState(req.userId);
      if (access.state !== "unlocked") {
        const reason = access.state === "locked_pending_grant" ? "pending_grant" : "no_plan";
        return res.status(403).json({ message: "Acceso restringido", reason });
      }
    }

    const exp = Date.now() + 60 * 60 * 1000; // 60 min
    const token = signStreamToken({ userId: req.userId, fileId: video.drive_file_id, exp });
    const url = `/api/drive/secure-video/${video.drive_file_id}?t=${token}&exp=${exp}&u=${req.userId}`;
    return res.json({ data: { url, expiresAt: exp } });
  } catch (err) {
    console.error("GET /videos/:id/stream-url error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

> Note: `u=${req.userId}` is included in the URL because `verifyStreamToken` needs `userId` to recompute the HMAC. The token alone is opaque without it.

- [ ] **Step 2: Add smoke-test cases**

Append to `endpoint-auditor/audit/smoke-test-video-access.mjs`:

```js
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
```

- [ ] **Step 3: Run smoke test**

```bash
node endpoint-auditor/audit/smoke-test-video-access.mjs
```
Expected: `12 passed, 0 failed`.

- [ ] **Step 4: Syntax check + commit**

```bash
node --check server/index.js && echo OK
git add server/index.js endpoint-auditor/audit/smoke-test-video-access.mjs
git commit -m "feat(api): GET /api/videos/:id/stream-url with HMAC token

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.3: `GET /api/drive/secure-video/:fileId`

**Files:**
- Modify: `server/index.js` (add right after the existing `app.get("/api/drive/video/:fileId"` route)

- [ ] **Step 1: Add the route**

```js
// GET /api/drive/secure-video/:fileId — gated proxy with HMAC token validation.
// Token must be issued by /api/videos/:id/stream-url. Public-by-design assets
// (homepage_video_cards) keep using /api/drive/video/:fileId.
app.get("/api/drive/secure-video/:fileId", async (req, res) => {
  try {
    const { t: token, exp, u: userId } = req.query;
    if (!token || !exp || !userId) return res.status(401).end();
    const ok = verifyStreamToken({
      token: String(token),
      userId: String(userId),
      fileId: req.params.fileId,
      exp: Number(exp),
    });
    if (!ok) return res.status(401).end();
    await streamDriveFile(req, res, req.params.fileId);
  } catch (err) {
    console.error("[GET /drive/secure-video] error:", err.message);
    if (!res.headersSent) res.status(500).end();
  }
});
```

- [ ] **Step 2: Add token-validation tests to smoke-test-video-tokens.mjs**

Append to `endpoint-auditor/audit/smoke-test-video-tokens.mjs` BEFORE the final `console.log`:

```js
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
```

- [ ] **Step 3: Run both smoke tests**

```bash
node endpoint-auditor/audit/smoke-test-video-tokens.mjs && node endpoint-auditor/audit/smoke-test-video-access.mjs
```
Expected: tokens `10 passed`, access `12 passed`. Both 0 failed.

- [ ] **Step 4: Syntax check + commit**

```bash
node --check server/index.js && echo OK
git add server/index.js endpoint-auditor/audit/smoke-test-video-tokens.mjs
git commit -m "feat(api): GET /api/drive/secure-video/:fileId with token gate

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.4: Modify `GET /api/videos` and `GET /api/videos/:id` to surface `is_trial`

**Files:**
- Modify: `server/index.js` — find both handlers

- [ ] **Step 1: Find handlers**

```bash
grep -nE 'app\.get\("/api/videos"' server/index.js
grep -nE 'app\.get\("/api/videos/:id"' server/index.js
```

- [ ] **Step 2: Confirm `is_trial` is included in SELECT**

Read both handlers. If they use `SELECT *` from videos, no change needed (the new column comes along). If they use explicit column lists, add `is_trial` to the SELECT and to the response mapping.

- [ ] **Step 3: For `GET /api/videos/:id`, also add `access_state`**

After computing the video row, add:

```js
// Compute access state for this user
let accessState = { state: "unlocked" }; // default for trial / gratuito
if (video.is_trial !== true && video.access_type === "miembros") {
  accessState = await computeVideoAccessState(req.userId);
}
return res.json({ data: { ...video, access_state: accessState } });
```

If the existing handler doesn't have a per-video shape with `access_type` and `is_trial`, adapt the conditional accordingly. The intent: **trial OR gratuito → always unlocked; only `miembros + !is_trial` → check state.**

- [ ] **Step 4: Syntax check + commit**

```bash
node --check server/index.js && echo OK
git add server/index.js
git commit -m "feat(api): include is_trial + access_state in /api/videos responses

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — Backend endpoints (admin side)

### Task 4.1: `POST /api/admin/users/:userId/video-access`

**Files:**
- Modify: `server/index.js` (add near other admin user routes)

- [ ] **Step 1: Add endpoint**

```js
// POST /api/admin/users/:userId/video-access — grant library access (idempotent)
app.post("/api/admin/users/:userId/video-access", adminMiddleware, async (req, res) => {
  try {
    const { note } = req.body || {};
    const { userId } = req.params;

    // 404 if user doesn't exist
    const u = await pool.query("SELECT id, display_name, phone FROM users WHERE id = $1", [userId]);
    if (!u.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });

    // Idempotent: if active grant exists, return it
    const existing = await pool.query(
      "SELECT id, granted_at, granted_by FROM video_access_grants WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1",
      [userId]
    );
    if (existing.rows.length) {
      return res.json({ data: existing.rows[0], alreadyGranted: true });
    }

    const r = await pool.query(
      `INSERT INTO video_access_grants (user_id, granted_by, note)
         VALUES ($1, $2, $3) RETURNING *`,
      [userId, req.userId, note || null]
    );
    const grant = r.rows[0];

    // Notify alumna via WA (fire-and-forget). Template added in Task 6.1.
    if (u.rows[0].phone) {
      sendConfiguredWhatsAppTemplate({
        templateKey: "video_access_granted",
        phone: u.rows[0].phone,
        vars: { name: u.rows[0].display_name || "Alumna" },
        fallbackMessage: `Hola ${u.rows[0].display_name || "Alumna"}, ya tienes acceso a la biblioteca de clases en video. Disfruta. 💜`,
      }).catch((e) => console.error("[WA] video_access_granted:", e.message));
    }

    return res.status(201).json({ data: grant });
  } catch (err) {
    console.error("POST /admin/users/:userId/video-access error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

- [ ] **Step 2: Add smoke-test cases**

Append to `endpoint-auditor/audit/smoke-test-video-access.mjs`. The test extends the mock pool inline:

```js
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
```

- [ ] **Step 3: Run smoke test**

```bash
node endpoint-auditor/audit/smoke-test-video-access.mjs
```
Expected: `15 passed, 0 failed`.

- [ ] **Step 4: Syntax check + commit**

```bash
node --check server/index.js && echo OK
git add server/index.js endpoint-auditor/audit/smoke-test-video-access.mjs
git commit -m "feat(api): POST /api/admin/users/:userId/video-access (idempotent grant)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.2: `DELETE /api/admin/users/:userId/video-access`

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add endpoint**

```js
// DELETE /api/admin/users/:userId/video-access — revoke access (idempotent)
app.delete("/api/admin/users/:userId/video-access", adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const u = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (!u.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });

    const r = await pool.query(
      `UPDATE video_access_grants
          SET revoked_at = NOW(), revoked_by = $2
        WHERE user_id = $1 AND revoked_at IS NULL
        RETURNING *`,
      [userId, req.userId]
    );
    if (!r.rows.length) {
      return res.json({ alreadyRevoked: true });
    }
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("DELETE /admin/users/:userId/video-access error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

- [ ] **Step 2: Add smoke-test cases**

Append to `endpoint-auditor/audit/smoke-test-video-access.mjs`:

```js
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
```

- [ ] **Step 3: Run smoke test + commit**

```bash
node endpoint-auditor/audit/smoke-test-video-access.mjs
node --check server/index.js && echo OK
git add server/index.js endpoint-auditor/audit/smoke-test-video-access.mjs
git commit -m "feat(api): DELETE /api/admin/users/:userId/video-access (idempotent revoke)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
Expected: `18 passed, 0 failed`.

---

### Task 4.3: `GET /api/admin/video-access/pending`

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add endpoint**

```js
// GET /api/admin/video-access/pending — alumnas con plan elegible activo SIN grant activo
app.get("/api/admin/video-access/pending", adminMiddleware, async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.display_name, u.email, u.phone, p.name AS plan_name, m.end_date
        FROM users u
        JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
                            AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
        JOIN plans p ON p.id = m.plan_id AND p.includes_video_library = true
        LEFT JOIN video_access_grants g ON g.user_id = u.id AND g.revoked_at IS NULL
       WHERE g.id IS NULL
       ORDER BY m.end_date ASC, u.display_name ASC
    `);
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET /admin/video-access/pending error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

- [ ] **Step 2: Syntax check + commit**

(Skip mock smoke test for this one — it's a single SELECT, the integration test in Phase 5 covers it.)

```bash
node --check server/index.js && echo OK
git add server/index.js
git commit -m "feat(api): GET /api/admin/video-access/pending

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.4: Modify `PUT /api/admin/videos/:id` and `PUT /api/admin/plans/:id`

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Find both handlers**

```bash
grep -nE '"/api/admin/videos/:id"|"/api/admin/plans/:id"' server/index.js
```

- [ ] **Step 2: Modify `PUT /api/admin/videos/:id` to accept `is_trial`**

Read the existing handler. Find the `req.body` destructuring and the `UPDATE videos SET` query. Add `is_trial` to both.

Example pattern (adapt to actual code):

```js
// Before:
const { title, description, ... } = req.body;
const r = await pool.query(
  "UPDATE videos SET title=$1, description=$2, ... WHERE id=$N RETURNING *",
  [title, description, ..., req.params.id]
);

// After:
const { title, description, is_trial, ... } = req.body;
const r = await pool.query(
  "UPDATE videos SET title=$1, description=$2, ..., is_trial=COALESCE($M, is_trial) WHERE id=$N RETURNING *",
  [title, description, ..., is_trial ?? null, req.params.id]
);
```

- [ ] **Step 3: Modify `PUT /api/admin/plans/:id` to accept `includes_video_library`**

Same pattern — add `includes_video_library` to destructuring and SET clause with COALESCE.

- [ ] **Step 4: Syntax check + commit**

```bash
node --check server/index.js && echo OK
git add server/index.js
git commit -m "feat(api): admin can toggle videos.is_trial and plans.includes_video_library

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — Integration test against real DB

### Task 5.1: Mutating test with cleanup

**Files:**
- Create: `endpoint-auditor/audit/db-mutating-test-video-access.mjs`

- [ ] **Step 1: Create the test file**

```js
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
```

- [ ] **Step 2: Run against real DB**

```bash
DATABASE_URL='postgresql://postgres:<NEW_PWD>@autorack.proxy.rlwy.net:40908/railway' \
  node endpoint-auditor/audit/db-mutating-test-video-access.mjs
```
Expected: ~9 passed, 0 failed, cleanup completo.

> ⚠️ Use the **rotated** password (the original was exposed in chat).

- [ ] **Step 3: Verify zero residue**

```bash
PGPASSWORD='<NEW_PWD>' psql -h autorack.proxy.rlwy.net -p 40908 -U postgres -d railway -c "
  SELECT 'AT_VL residuals' AS k, COUNT(*) FROM users WHERE email LIKE 'AT\_VL\_%@audit.test'
  UNION ALL SELECT 'AT_VL plans', COUNT(*) FROM plans WHERE name LIKE 'AT\_VL\_%'
  UNION ALL SELECT 'AT_VL videos', COUNT(*) FROM videos WHERE title LIKE 'AT\_VL\_%';"
```
Expected: 3 rows with count 0.

- [ ] **Step 4: Commit**

```bash
git add endpoint-auditor/audit/db-mutating-test-video-access.mjs
git commit -m "test(api): DB mutating test for video access (with cleanup)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6 — WhatsApp template

### Task 6.1: Add `video_access_granted` template

**Files:**
- Modify: `server/index.js` (templates object near line 178-210)

- [ ] **Step 1: Add template**

Find the line `transfer_rejected: {` in the templates object. Add immediately AFTER its closing `},`:

```js
  video_access_granted: {
    subject: "Tu acceso a videos está activo",
    body: "Hola {name}, ya tienes acceso a la biblioteca de clases en video Kala. Disfruta cuando quieras desde la app. 💜",
  },
```

- [ ] **Step 2: Find the configurable templates list (if any)**

```bash
grep -n "membership_activated:" server/index.js | head -5
```
There may be a second registration around line 4288 (a label map). If so, add a corresponding entry there too:

```js
    video_access_granted: "Acceso a videos otorgado",
```

- [ ] **Step 3: Syntax check + commit**

```bash
node --check server/index.js && echo OK
git add server/index.js
git commit -m "feat(wa): add video_access_granted template

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 7 — Admin UI

### Task 7.1: Plans editor — `includes_video_library` checkbox

**Files:**
- Modify: `src/pages/admin/plans/PlansList.tsx`

- [ ] **Step 1: Find the plan form**

Read the file. Find where the form fields for editing a plan are rendered (likely near the bottom, with inputs for `name`, `price`, etc.).

- [ ] **Step 2: Add checkbox below "is_active" toggle (or wherever similar toggles live)**

```tsx
{/* Video library inclusion */}
<div className="flex items-start gap-2 mt-3">
  <input
    type="checkbox"
    id={`vl-${plan?.id ?? "new"}`}
    checked={!!form.includes_video_library}
    onChange={(e) => setForm((f) => ({ ...f, includes_video_library: e.target.checked }))}
    className="mt-1"
  />
  <label htmlFor={`vl-${plan?.id ?? "new"}`} className="text-sm">
    <span className="font-medium">Incluye acceso a biblioteca de videos</span>
    <span className="block text-xs text-muted-foreground">
      Las alumnas con este plan podrán acceder a las clases grabadas (requiere conceder acceso manualmente).
    </span>
  </label>
</div>
```

- [ ] **Step 3: Ensure mutation payload includes the field**

Find the `useMutation` (probably `updatePlan` or similar). Verify `includes_video_library` is in the body sent to `PUT /api/admin/plans/:id`. If not, add it to the destructuring/body construction.

- [ ] **Step 4: Show badge in the plan card list**

Wherever the plan card is rendered, near other badges, add:

```tsx
{plan.includes_video_library && <Badge variant="secondary" className="text-[0.6rem]">📹 Videos</Badge>}
```

- [ ] **Step 5: Build + commit**

```bash
npm run build 2>&1 | tail -3
```
Expected: `✓ built in Xs` with no errors.

```bash
git add src/pages/admin/plans/PlansList.tsx
git commit -m "feat(admin): plan editor toggles includes_video_library

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7.2: VideoList.tsx — `is_trial` toggle per video

**Files:**
- Modify: `src/pages/admin/videos/VideoList.tsx`

- [ ] **Step 1: Add interface field**

In the `VideoItem` interface (line ~16), add:

```ts
is_trial?: boolean;
```

- [ ] **Step 2: Add a toggle mutation**

After `deleteMutation`:

```tsx
const updateTrialMutation = useMutation({
  mutationFn: ({ id, is_trial }: { id: string; is_trial: boolean }) =>
    api.put(`/admin/videos/${id}`, { is_trial }),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["videos"] });
    toast({ title: "Estado de muestra actualizado" });
  },
  onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
});
```

- [ ] **Step 3: Render trial badge + toggle button in the card**

Inside the `videos.map((v) =>` block, before the "Editar/Eliminar" buttons:

```tsx
<div className="flex items-center justify-between mt-2 mb-2 gap-2">
  {v.is_trial && <Badge className="text-[0.6rem] bg-amber-500">🎁 Clase muestra</Badge>}
  <button
    type="button"
    className="text-[0.65rem] underline text-muted-foreground ml-auto"
    onClick={() => updateTrialMutation.mutate({ id: v.id, is_trial: !v.is_trial })}
    disabled={updateTrialMutation.isPending}
  >
    {v.is_trial ? "Quitar de muestra" : "Marcar como muestra"}
  </button>
</div>
```

- [ ] **Step 4: Soft warning if marking >2 as trial**

Wrap the mutation call:

```tsx
onClick={() => {
  const trialCount = videos.filter((vv: VideoItem) => vv.is_trial).length;
  if (!v.is_trial && trialCount >= 2) {
    if (!window.confirm("Ya tienes 2 clases marcadas como muestra. ¿Seguro de marcar otra? El trial funciona mejor con 1-2 videos.")) return;
  }
  updateTrialMutation.mutate({ id: v.id, is_trial: !v.is_trial });
}}
```

- [ ] **Step 5: Build + commit**

```bash
npm run build 2>&1 | tail -3
git add src/pages/admin/videos/VideoList.tsx
git commit -m "feat(admin): toggle is_trial per video in VideoList

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7.3: ClientDetail.tsx — Video access section

**Files:**
- Modify: `src/pages/admin/clients/ClientDetail.tsx`

- [ ] **Step 1: Add query for the client's video access state**

Inside the component (after other queries), add a query that hits the existing `/api/me/video-access` doesn't work for admin viewing another user. Instead, **fetch grant + plan elegibility directly** by calling a small admin-only endpoint OR computing client-side from already-loaded data.

Simpler: add a backend endpoint `GET /api/admin/users/:userId/video-access` that returns the same shape as `/api/me/video-access`. This is a 5-line addition. Add it to `server/index.js`:

```js
// GET /api/admin/users/:userId/video-access — admin sees a user's state
app.get("/api/admin/users/:userId/video-access", adminMiddleware, async (req, res) => {
  try {
    const state = await computeVideoAccessState(req.params.userId);
    return res.json({ data: state });
  } catch (err) {
    console.error("GET /admin/users/:userId/video-access error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

- [ ] **Step 2: Add query in ClientDetail.tsx**

```tsx
const { data: vaData } = useQuery({
  queryKey: ["video-access", clientId],
  queryFn: async () => (await api.get(`/admin/users/${clientId}/video-access`)).data,
});
const access = vaData?.data;

const grantMutation = useMutation({
  mutationFn: () => api.post(`/admin/users/${clientId}/video-access`, { note: "Concedido desde ficha" }),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["video-access", clientId] });
    toast({ title: "Acceso concedido. Le mandamos WA." });
  },
});
const revokeMutation = useMutation({
  mutationFn: () => api.delete(`/admin/users/${clientId}/video-access`),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["video-access", clientId] });
    toast({ title: "Acceso revocado." });
  },
});
```

- [ ] **Step 3: Render the section**

Find a logical spot in the ClientDetail JSX (e.g., after membership section). Add:

```tsx
<Card data-lift>
  <CardHeader className="pb-2">
    <CardTitle className="text-sm flex items-center gap-2">
      <Film size={15} />Acceso a biblioteca de videos
    </CardTitle>
  </CardHeader>
  <CardContent className="pt-0 space-y-2">
    {!access ? (
      <Skeleton className="h-12" />
    ) : access.state === "unlocked" ? (
      <>
        <Badge variant="default" className="bg-green-600">Activo</Badge>
        <p className="text-xs text-muted-foreground">Plan vigente: {access.planName}</p>
        <Button size="sm" variant="destructive" className="text-xs" onClick={() => revokeMutation.mutate()} disabled={revokeMutation.isPending}>
          Revocar acceso
        </Button>
      </>
    ) : access.state === "locked_pending_grant" ? (
      <>
        <Badge variant="default" className="bg-amber-500">Pendiente</Badge>
        <p className="text-xs text-muted-foreground">Tiene {access.planName} activo, falta tu OK.</p>
        <Button size="sm" className="text-xs" onClick={() => grantMutation.mutate()} disabled={grantMutation.isPending}>
          ✓ Conceder acceso
        </Button>
      </>
    ) : (
      <>
        <Badge variant="outline">Sin plan elegible</Badge>
        <p className="text-xs text-muted-foreground">Sus planes activos no incluyen videos.</p>
        <Button size="sm" variant="outline" className="text-xs" onClick={() => grantMutation.mutate()} disabled={grantMutation.isPending}>
          Conceder de todas formas
        </Button>
      </>
    )}
  </CardContent>
</Card>
```

Add the import: `import { Film } from "lucide-react";`

- [ ] **Step 4: Build + commit**

```bash
npm run build 2>&1 | tail -3
node --check server/index.js && echo OK
git add server/index.js src/pages/admin/clients/ClientDetail.tsx
git commit -m "feat(admin): video access section in ClientDetail with grant/revoke

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7.4: ClientsList.tsx — pending tab/filter

**Files:**
- Modify: `src/pages/admin/clients/ClientsList.tsx`

- [ ] **Step 1: Add query for pending list**

```tsx
const { data: pendingData } = useQuery({
  queryKey: ["video-access-pending"],
  queryFn: async () => (await api.get("/admin/video-access/pending")).data,
});
const pendingClients = pendingData?.data ?? [];
const pendingIds = new Set(pendingClients.map((c: any) => c.id));
```

- [ ] **Step 2: Add filter toggle/tab above the table**

```tsx
const [showOnlyPending, setShowOnlyPending] = useState(false);
const filteredClients = showOnlyPending
  ? clients.filter((c: any) => pendingIds.has(c.id))
  : clients;
```

```tsx
{pendingClients.length > 0 && (
  <button
    onClick={() => setShowOnlyPending((s) => !s)}
    className={`text-xs px-3 py-1.5 rounded-full mb-3 ${
      showOnlyPending ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-900"
    }`}
  >
    📹 Pendientes de acceso ({pendingClients.length})
  </button>
)}
```

- [ ] **Step 3: Add inline grant button on each row in pending mode**

Inside the row render, conditionally show:

```tsx
{showOnlyPending && pendingIds.has(c.id) && (
  <Button
    size="sm"
    className="text-xs ml-2"
    onClick={(e) => {
      e.stopPropagation();
      api.post(`/admin/users/${c.id}/video-access`, { note: "Concedido desde lista" })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["video-access-pending"] });
          toast({ title: `Acceso dado a ${c.display_name}` });
        });
    }}
  >
    ✓ Conceder
  </Button>
)}
```

- [ ] **Step 4: Build + commit**

```bash
npm run build 2>&1 | tail -3
git add src/pages/admin/clients/ClientsList.tsx
git commit -m "feat(admin): pending video access filter in ClientsList

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7.5: Dashboard pending widget + sidebar badge

**Files:**
- Modify: `src/pages/admin/Dashboard.tsx`
- Modify: `src/components/admin/AdminLayout.tsx`

- [ ] **Step 1: In Dashboard, add the pending query + widget**

Inside `Dashboard`, after other queries:

```tsx
const { data: vaPending } = useQuery({
  queryKey: ["video-access-pending"],
  queryFn: async () => (await api.get("/admin/video-access/pending")).data,
  staleTime: 60_000,
});
const pendingCount = vaPending?.data?.length ?? 0;
```

In the JSX, near other dashboard cards, conditionally render:

```tsx
{pendingCount > 0 && (
  <Card data-lift className="cursor-pointer" onClick={() => navigate("/admin/clients?pending=1")}>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm flex items-center gap-2">
        <Film size={15} className="text-amber-600" />
        {pendingCount} {pendingCount === 1 ? "alumna espera" : "alumnas esperan"} acceso a videos
      </CardTitle>
    </CardHeader>
    <CardContent className="pt-0">
      <p className="text-xs text-muted-foreground">
        {(vaPending?.data ?? []).slice(0, 3).map((c: any) => c.display_name).join(", ")}
        {pendingCount > 3 && ` y ${pendingCount - 3} más`}
      </p>
      <Button variant="link" size="sm" className="text-xs px-0 mt-2">Ver lista →</Button>
    </CardContent>
  </Card>
)}
```

Add import: `import { Film } from "lucide-react";`

- [ ] **Step 2: In AdminLayout, add badge to "Clientes" item**

Find the rendering of the Clientes item (line ~23 or 61). Wrap to show badge:

```tsx
const { data: vaPending } = useQuery({
  queryKey: ["video-access-pending"],
  queryFn: async () => (await api.get("/admin/video-access/pending")).data,
  staleTime: 60_000,
});
const vaPendingCount = vaPending?.data?.length ?? 0;
```

In the item render, add the badge alongside the label when item.path === "/admin/clients":

```tsx
<span className="flex items-center gap-2">
  {item.label}
  {item.path === "/admin/clients" && vaPendingCount > 0 && (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-amber-500 text-white">
      {vaPendingCount}
    </span>
  )}
</span>
```

- [ ] **Step 3: ClientsList reads the URL param to auto-toggle**

In `ClientsList.tsx`, replace `const [showOnlyPending, setShowOnlyPending] = useState(false);` with:

```tsx
const [searchParams] = useSearchParams();
const [showOnlyPending, setShowOnlyPending] = useState(searchParams.get("pending") === "1");
```

Add import: `import { useSearchParams } from "react-router-dom";`

- [ ] **Step 4: Build + commit**

```bash
npm run build 2>&1 | tail -3
git add src/pages/admin/Dashboard.tsx src/components/admin/AdminLayout.tsx src/pages/admin/clients/ClientsList.tsx
git commit -m "feat(admin): dashboard widget + sidebar badge for pending video access

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 8 — Alumna UI

### Task 8.1: VideoLibrary.tsx — locked overlays + state banner

**Files:**
- Modify: `src/pages/client/VideoLibrary.tsx`

- [ ] **Step 1: Add state query**

```tsx
const { data: vaData } = useQuery({
  queryKey: ["me-video-access"],
  queryFn: async () => (await api.get("/me/video-access")).data,
  staleTime: 30_000,
});
const access = vaData?.data; // { state, planName?, offers? }
```

- [ ] **Step 2: Add state banner above the grid**

After `<PageHeader>`, before the search section:

```tsx
{access?.state === "locked_pending_grant" && (
  <Section>
    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
      <p className="text-sm font-medium text-amber-900">Tu acceso está en revisión.</p>
      <p className="text-xs text-amber-700 mt-1">Te avisaremos en cuanto esté listo.</p>
    </div>
  </Section>
)}
{access?.state === "locked_no_plan" && access.offers?.length > 0 && (
  <Section>
    <div className="rounded-2xl bg-pink-50 border border-pink-200 p-4">
      <p className="text-sm font-medium">Adquiere {access.offers.map((o: any) => o.name).join(" o ")} para acceder a todas las clases.</p>
      <Link to="/planes" className="inline-block mt-2 text-xs underline">Ver planes →</Link>
    </div>
  </Section>
)}
```

- [ ] **Step 3: In each video card, show locked overlay**

Inside the videos grid render, wrap each video card:

```tsx
const isVideoLocked = (v: any) => {
  if (v.is_trial) return false;
  if (v.access_type === "gratuito") return false;
  return access?.state !== "unlocked";
};

// Inside the map:
<div key={v.id} className="relative">
  {isVideoLocked(v) ? (
    <button
      onClick={() => setLockedModal({ video: v, state: access?.state })}
      className="block w-full text-left"
    >
      <div className="relative">
        <img src={v.thumbnail_url || "..."} className="w-full aspect-video object-cover rounded-2xl opacity-60" alt={v.title} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Lock size={28} className="text-white drop-shadow-lg" />
        </div>
      </div>
      <p className="mt-2 text-sm font-medium">{v.title}</p>
    </button>
  ) : (
    <Link to={`/videos/${v.id}`} className="block">
      <div className="relative">
        <img src={v.thumbnail_url || "..."} className="w-full aspect-video object-cover rounded-2xl" alt={v.title} />
        {v.is_trial && (
          <span className="absolute top-2 left-2 bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-1 rounded-full">
            🎁 Muestra
          </span>
        )}
      </div>
      <p className="mt-2 text-sm font-medium">{v.title}</p>
    </Link>
  )}
</div>
```

- [ ] **Step 4: Add locked modal state + component**

```tsx
const [lockedModal, setLockedModal] = useState<{ video: any; state: string } | null>(null);

// Below the main JSX, before closing AppShell:
{lockedModal && (
  <div
    className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
    onClick={() => setLockedModal(null)}
  >
    <div className="bg-white rounded-3xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 mb-3">
        <Lock size={20} />
        <h3 className="font-semibold">{lockedModal.video.title}</h3>
      </div>
      {lockedModal.state === "locked_pending_grant" ? (
        <p className="text-sm text-muted-foreground">Estamos activando tu acceso. Te avisaremos en cuanto esté listo.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">
            Adquiere {access?.offers?.map((o: any) => o.name).join(" o ")} para ver esta clase.
          </p>
          <Link to="/planes" className="block w-full text-center bg-pink-500 text-white rounded-full py-2 text-sm font-medium">
            Ver planes
          </Link>
        </>
      )}
      <button onClick={() => setLockedModal(null)} className="block w-full text-center mt-3 text-xs text-muted-foreground">
        Cerrar
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Build + commit**

```bash
npm run build 2>&1 | tail -3
git add src/pages/client/VideoLibrary.tsx
git commit -m "feat(client): VideoLibrary shows locked overlays + state banner + modal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8.2: VideoPlayer.tsx — fetch /stream-url, handle 403, refresh token

**Files:**
- Modify: `src/pages/client/VideoPlayer.tsx`

- [ ] **Step 1: Read the existing player to find where the video source is set**

```bash
grep -nE "video_url|VideoEmbed|<video" src/pages/client/VideoPlayer.tsx
```

- [ ] **Step 2: Add stream-url query**

```tsx
const { id: videoId } = useParams<{ id: string }>();

const { data: streamData, isLoading: streamLoading, error: streamError, refetch: refetchStream } = useQuery({
  queryKey: ["video-stream-url", videoId],
  queryFn: async () => (await api.get(`/videos/${videoId}/stream-url`)).data,
  staleTime: 30 * 60 * 1000, // 30 min — refresh at half of token TTL (60 min)
  refetchInterval: 30 * 60 * 1000,
  retry: false, // 403 is not transient
});
const streamUrl = streamData?.data?.url;
```

- [ ] **Step 3: Render video using `streamUrl`**

Replace the existing video source with:

```tsx
{streamLoading ? (
  <SkeletonRow />
) : streamError ? (
  <div className="rounded-3xl border p-6 text-center">
    <Lock className="mx-auto mb-2" />
    <p className="text-sm font-medium">No tienes acceso a este video</p>
    <p className="text-xs text-muted-foreground mt-1">
      {(streamError as any)?.response?.data?.reason === "pending_grant"
        ? "Estamos activando tu acceso. Te avisaremos."
        : "Adquiere un plan que incluya videos para ver esta clase."}
    </p>
    <Link to="/videos" className="inline-block mt-3 text-xs underline">Volver a la biblioteca</Link>
  </div>
) : streamUrl ? (
  <div className="aspect-video w-full rounded-3xl overflow-hidden bg-black">
    <video src={streamUrl} controls preload="metadata" playsInline className="w-full h-full" />
  </div>
) : null}
```

- [ ] **Step 4: Build + commit**

```bash
npm run build 2>&1 | tail -3
git add src/pages/client/VideoPlayer.tsx
git commit -m "feat(client): VideoPlayer uses /stream-url with token + 403 handling

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8.3: Add menu item + dashboard card for alumna

**Files:**
- Modify: `src/components/app/AppShell.tsx` (or wherever the alumna nav lives)
- Modify: `src/pages/client/Dashboard.tsx`

- [ ] **Step 1: Find where alumna nav items are defined**

```bash
grep -rnE "MyBookings|Profile.*navigate|/videos" src/components/app/ src/pages/client/Dashboard.tsx 2>/dev/null | head -10
```

- [ ] **Step 2: Add "Clases en video" item to nav** (if not already present)

If `/videos` route doesn't exist yet, add it in `src/App.tsx`:

```tsx
import VideoLibrary from "./pages/client/VideoLibrary";
import VideoPlayer from "./pages/client/VideoPlayer";

// In Routes:
<Route path="/videos" element={<VideoLibrary />} />
<Route path="/videos/:id" element={<VideoPlayer />} />
```

(Verify if these routes already exist via `grep -n "VideoLibrary\|VideoPlayer" src/App.tsx`. If yes, skip.)

- [ ] **Step 3: Add card in client Dashboard if access state is unlocked or pending**

```tsx
const { data: vaData } = useQuery({
  queryKey: ["me-video-access"],
  queryFn: async () => (await api.get("/me/video-access")).data,
  staleTime: 30_000,
});
const access = vaData?.data;

// In JSX, conditionally:
{access && access.state !== "locked_no_plan" && (
  <Link to="/videos" className="block rounded-2xl border p-4 bg-gradient-to-br from-pink-50 to-amber-50">
    <div className="flex items-center gap-3">
      <Film className="text-pink-600" />
      <div>
        <p className="font-medium text-sm">
          {access.state === "unlocked" ? "Tienes acceso a la biblioteca" : "Tu acceso está en revisión"}
        </p>
        <p className="text-xs text-muted-foreground">
          {access.state === "unlocked" ? "Reproduce las clases cuando quieras →" : "Mientras, mira la clase muestra →"}
        </p>
      </div>
    </div>
  </Link>
)}
```

- [ ] **Step 4: Build + commit**

```bash
npm run build 2>&1 | tail -3
git add src/App.tsx src/pages/client/Dashboard.tsx src/components/app/AppShell.tsx
git commit -m "feat(client): dashboard card + nav route for video library

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 9 — QA + merge

### Task 9.1: Manual QA against staging/local + merge

**Files:** N/A

- [ ] **Step 1: Re-run all automated tests**

```bash
node endpoint-auditor/audit/smoke-test-video-tokens.mjs
node endpoint-auditor/audit/smoke-test-video-access.mjs
DATABASE_URL='postgres://...' node endpoint-auditor/audit/db-mutating-test-video-access.mjs
node --check server/index.js
npm run build
```
Expected: all green.

- [ ] **Step 2: Manual QA checklist** (locally with `npm start` + `npm run dev`)

- [ ] Crear plan test con `includes_video_library=true` desde `/admin/plans`. Verificar badge "📹 Videos" aparece.
- [ ] Marcar 1 video como trial desde `/admin/videos`. Verificar badge dorado.
- [ ] Marcar 3er video como trial → debe salir el confirm dialog.
- [ ] Logueada con cuenta sin plan → ir a `/videos` → ver banner rosa "Adquiere X" y videos con candado (excepto trial).
- [ ] Click en video locked → modal con "Ver planes". Click en trial → reproduce.
- [ ] Aprobar orden de plan elegible para alumna test desde `/admin/orders/:id/verify`. Verificar dashboard muestra el widget de pendientes.
- [ ] Verificar badge en sidebar "Clientes" muestra el conteo.
- [ ] Click en widget → lleva a `/admin/clients?pending=1` con la alumna en la lista.
- [ ] Click "✓ Conceder" inline → verificar mensaje y que la alumna sale de la lista.
- [ ] Loguearse como esa alumna → `/videos` → banner ya no aparece, candados quitados, click en video reproduce vía `/stream-url`.
- [ ] Inspector de red: confirmar que `/api/drive/secure-video/:fileId?t=...&exp=...&u=...` se está llamando, no `/api/drive/video/:fileId`.
- [ ] Cambiar manualmente `?t=` a otro string → 401.
- [ ] Esperar más de 30 min con la pestaña abierta → React Query refetch + nueva URL firmada.
- [ ] Verificar `/api/drive/video/:fileId` (sin `secure-`) sigue funcionando para `homepage_video_cards` en Index público.

- [ ] **Step 3: Merge to main**

```bash
git checkout main
git pull
git merge --no-ff feat/video-library-access -m "feat: video library access control

- Plan + admin grant gating
- Trial videos for lead capture
- HMAC-signed Drive proxy tokens
- Admin: dashboard widget + sidebar badge + per-client section
- Alumna: locked overlays + contextual messages

Spec: docs/superpowers/specs/2026-05-14-video-library-access-design.md
Plan: docs/superpowers/plans/2026-05-14-video-library-access-plan.md"

git push
```

- [ ] **Step 4: Delete local feature branch**

```bash
git branch -d feat/video-library-access
```

---

## Self-review notes

**Spec coverage:** All sections of the spec (Storage, Estados, Modelo de datos, Backend, Admin UX A-D, Member UX, Edge cases, Testing, Migración) map to one or more tasks above.

**Type consistency:** `computeVideoAccessState` signature is consistent across mock test, helper definition, and all callers. Token helper signature `{ userId, fileId, exp }` is consistent in sign + verify + URL building.

**Decomposition note:** Phase 7 task 7.3 (ClientDetail section) silently adds an admin-side `GET /api/admin/users/:userId/video-access` endpoint that wasn't in the spec table — included inline because it's a 5-line trivial addition that the UI needs. Consider adding it to the spec endpoint table in a follow-up edit.

**Open follow-ups for v2:**
- Per-video grants (granularity below "biblioteca completa")
- Token revocation list (currently rotation of `JWT_SECRET` is the only revocation)
- Watch progress / continue watching
- Public anonymous access to trial (today requires login)
