# Video library access — deferred follow-ups

Tracking doc for items the final code review surfaced that were **intentionally not fixed** before merge. The feature shipped on `main` (commits `3eba13e` + `f84963b` + `c7ac1d1`). Blockers B1/B2 and Important I1/I2/I3/I4 were fixed. Everything below is deferred.

Spec: `docs/superpowers/specs/2026-05-14-video-library-access-design.md`
Plan: `docs/superpowers/plans/2026-05-14-video-library-access-plan.md`

---

## Important — should fix when convenient

### I5 — POST grant doesn't verify the target is a client
**File:** `server/index.js` (`POST /api/admin/users/:userId/video-access`)
The handler 404s if the user doesn't exist, but will happily create a grant for an admin/instructor's own `user_id`. Not security-critical — `computeVideoAccessState` returns `locked_no_plan` for anyone without an eligible membership, so the grant is dormant and inert. Worth a `role = 'client'` guard (or at least a warning) only if it causes confusion in the admin UI.
**Effort:** ~3 lines. **Priority:** low.

---

## Nits / polish

### N1 — Spec mentions `reason: "revoked"` that backend never emits
**Files:** spec §"Errores devueltos", `server/index.js` (`/stream-url`), `src/pages/client/VideoPlayer.tsx`
`computeVideoAccessState` collapses a revoked grant into `locked_pending_grant` (still has plan) or `locked_no_plan` (no plan). The `/stream-url` 403 `reason` is therefore only ever `pending_grant` or `no_plan`. Either remove `"revoked"` from the spec, or emit it server-side when the user *had* a grant that was explicitly revoked (nicer copy for the alumna).
**Effort:** small (spec edit) or medium (distinguish revoked in helper). **Priority:** low.

### N2 — DB mutating test exercises SQL, not HTTP handlers
**File:** `endpoint-auditor/audit/db-mutating-test-video-access.mjs`
The test re-implements each endpoint's SQL inline against the real DB. It validates queries but **not** the JS handler logic (status codes, 23505 catch, missing-field branches, idempotency response shapes). A bug in handler branching would pass this test. Upgrade to `supertest` (or `fetch` against a locally-booted server with a test JWT) so the actual Express handlers are exercised end-to-end.
**Effort:** medium (needs server boot + auth token in test harness). **Priority:** medium — this is the biggest test-quality gap.

### N3 — Mobile bottom nav went 5 → 6 columns
**File:** `src/components/app/AppShell.tsx`
Adding the "Videos" tab makes each tab ~62px wide on a 375px iPhone SE — readable but tight. Verify on small viewports; if cramped, move a lower-priority tab (e.g. Wallet or Perfil) behind a "Más" overflow menu.
**Effort:** small (verify) / medium (overflow menu). **Priority:** low — confirm visually on a real phone first.

### N4 — Toast titles use raw emoji, inconsistent with rest of admin
**Files:** `src/pages/admin/clients/ClientDetail.tsx`, `ClientsList.tsx` (e.g. `"✅ Acceso dado a..."`)
Rest of the admin toasts are plain text. Cosmetic consistency only.
**Effort:** trivial. **Priority:** very low.

### N5 — `streamData` query: staleTime + refetchInterval both 30 min
**File:** `src/pages/client/VideoPlayer.tsx`
If the tab is open 30 min without playing, a refetch replaces a still-valid token — wasted call, harmless. Could set `staleTime: Infinity` and rely solely on `refetchInterval`.
**Effort:** trivial. **Priority:** very low.

### N6 — `["video-access-pending"]` polled with different intervals per component
**Files:** `AdminLayout.tsx` (`refetchInterval: 120_000`), `Dashboard.tsx` (none), `ClientsList.tsx` (none)
Same query key, so whichever mounts first sets the cache and the others read it. Works fine; the per-component `refetchInterval` just reads as arbitrary. Consider centralizing the polling config or documenting why 120s.
**Effort:** trivial. **Priority:** very low.

### N7 — `verifyStreamToken` uses `Buffer.from(token)` without encoding
**File:** `server/index.js` (`verifyStreamToken`)
Works because both sides default to utf-8 and the token is base64url ASCII. `Buffer.from(token, "base64url")` on both sign output and verify input would be more semantic. No behavior change; clarity only.
**Effort:** trivial. **Priority:** very low.

---

## Done (for reference — do not re-do)

- **B1** — `/api/videos*` no longer leak the public proxy URL for Drive videos (`video_url=null` when `drive_file_id` present). Fixed in `f84963b`.
- **B2** — `/stream-url` filters `is_published=true`. Fixed in `f84963b`.
- **I1** — `POST /api/admin/plans` accepts `includes_video_library`. Fixed in `f84963b`.
- **I2** — `is_trial` toggle + grant/revoke invalidate the right caches incl. `me-video-access`. Fixed in `c7ac1d1`.
- **I3** — `<video>` `onError` refresh + position restore on token expiry. Fixed in `c7ac1d1`.
- **I4** — `ClientsList` syncs `showOnlyPending` with `?pending=1` via `useEffect`. Fixed in `c7ac1d1`.

## Google Drive storage — configuration runbook (REQUIRED for uploads to work)

The video upload is a **passthrough**: the file streams browser → our server (5 MB
chunks) → Google Drive, stored as-is with **no transcoding/recompression**. Quality
is whatever the source file is. Max size raised to **8 GB** (commit `572813c`):
`server/index.js` `VIDEO_MAX_MB=8192` + `src/pages/admin/videos/VideoUpload.tsx`
`MAX_MB=8192`.

For uploads to work, the Drive account (the 5 TB one) must be wired via **Railway
environment variables** (code already reads them; nothing to change in code).
`POST /api/drive/init-upload` returns `503 "Google Drive no configurado"` until all
of these are set:

| Env var | What it is |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID of a Google Cloud project with the Drive API enabled |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret for that client |
| `GOOGLE_REFRESH_TOKEN` | Refresh token for the Google account that owns the 5 TB Drive, with scope `https://www.googleapis.com/auth/drive` |
| `GOOGLE_DRIVE_FOLDER_ID` | ID of the destination folder in that Drive (the part after `/folders/` in the folder URL). If empty, files land in My Drive root. |

### How to obtain them (one-time)

1. **Google Cloud Console** → create/select a project → **APIs & Services** →
   enable **Google Drive API**.
2. **Credentials** → Create Credentials → **OAuth client ID** → type *Web
   application*. Add `https://developers.google.com/oauthplayground` as an
   authorized redirect URI. Copy the **Client ID** and **Client Secret**.
3. **OAuth Playground** (`developers.google.com/oauthplayground`) → gear icon →
   "Use your own OAuth credentials" → paste client ID + secret. In the scope box
   enter `https://www.googleapis.com/auth/drive` → Authorize → sign in with the
   **account that owns the 5 TB Drive** → Exchange authorization code for tokens →
   copy the **Refresh token**.
4. In the 5 TB Drive, create the destination folder (e.g. "Kala Videos"), open it,
   copy the **folder ID** from the URL.
5. **Railway** → the API service → **Variables** → add the 4 vars → redeploy.

### Verify after setting

- Admin → `/admin/videos/upload` → pick a small test clip → it should upload and
  appear in the library, and the file should show up in the Drive folder.
- Or hit `POST /api/drive/init-upload` with an admin JWT; a 200 with `{sessionId}`
  means Drive is wired; 503 means a var is still missing.

### Notes / risks at 8 GB

- The multer path (`/api/videos/upload`, legacy homepage-card upload) writes the
  temp file to `os.tmpdir()` on Railway's ephemeral disk. An 8 GB upload needs
  ~8 GB free tmp space transiently. The **chunked Drive path** (what
  `VideoUpload.tsx` uses) does NOT — it streams 5 MB at a time and never lands the
  whole file on our server.
- Upload time at 8 GB is long (45-90 min on typical connections). The chunked
  path resumes on interruption (Drive 308), but the in-memory session map
  (`driveUploadSessions`) is cleared after **6 hours** (`init-upload` handler,
  raised from 2h in commit `f2f3aef`) and on server restart — an upload that
  exceeds that window, or that straddles a deploy/restart, will fail. If uploads
  still routinely time out, the next step is persisting sessions (DB/Redis)
  rather than the in-memory `Map` so they survive restarts.

## Operational reminder

The Postgres connection string used during this feature's development/testing was exposed in the build session. **Rotate it** (Railway → Postgres service → Connect → Reset Password) if not already done. The DB test reads `DATABASE_URL` from env, so no code change needed after rotation.
