# Deploy a Railway

Guía paso a paso para desplegar Kala Barre Studio en Railway con Postgres dedicado.

El stack es **un solo servicio Node** que sirve API (`/api/*`) y frontend buildado (`/`). No es Supabase: la BD es Postgres directo via `pg`.

---

## 0. Requisitos previos

- Cuenta en [railway.app](https://railway.app).
- Repo en GitHub conectado: `said019/kala-Studio` (rama `main`).
- `psql` instalado localmente (`brew install postgresql` en mac) o **Railway CLI** (`npm i -g @railway/cli`).

---

## 1. Crear el proyecto y conectar el repo

1. https://railway.app/new → **Deploy from GitHub repo** → autoriza GitHub si no lo has hecho → escoge `said019/kala-Studio`.
2. Railway lee `nixpacks.toml` y empieza un build automático. La primera build **va a fallar** porque falta `DATABASE_URL`. Es normal, sigue.

## 2. Provisionar Postgres

Dentro del proyecto Railway:

1. **+ New** → **Database** → **Add PostgreSQL**.
2. Esto crea un servicio `Postgres` con `DATABASE_URL` interna disponible como variable de referencia.
3. Vuelve al servicio del **app web** → pestaña **Variables** → **+ New Variable** → modo **Reference** → escoge `DATABASE_URL` desde Postgres. Quedará algo como `${{Postgres.DATABASE_URL}}`.

## 3. Variables de entorno

En el servicio web → **Variables**, copia/pega este bloque (ajusta `JWT_SECRET` y dominios):

```env
# ── Obligatorias ─────────────────────────────────────────────
NODE_ENV=production
JWT_SECRET=<generar con: openssl rand -hex 32>
SITE_URL=https://kala-studio.up.railway.app
APP_URL=https://kala-studio.up.railway.app
CORS_ALLOWED_ORIGINS=https://kala-studio.up.railway.app

# ── Email (Resend) — opcional pero recomendado ───────────────
# RESEND_API_KEY=re_xxx
# EMAIL_FROM=hola@kalabarre.mx

# ── WhatsApp (Evolution API) — opcional ──────────────────────
# EVOLUTION_API_URL=https://evo.example.com
# EVOLUTION_API_KEY=xxx
# EVOLUTION_INSTANCE_NAME=kala
# EVOLUTION_SEND_DELAY_MS=700

# ── Google Drive (videos) — opcional ─────────────────────────
# GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=xxx
# GOOGLE_REFRESH_TOKEN=xxx
# GOOGLE_DRIVE_FOLDER_ID=xxx

# ── Google Wallet — opcional, requiere cuenta aprobada ───────
# GOOGLE_ISSUER_ID=3388xxxx
# GOOGLE_SA_KEY_JSON_BASE64=<base64 del JSON completo de la service account>
# GOOGLE_HEX_BACKGROUND_COLOR=#FFF7F2

# ── Apple Wallet — opcional, requiere certs Apple Developer ──
# APPLE_TEAM_ID=ABCDE12345
# APPLE_PASS_TYPE_ID=pass.com.kala.club
# APPLE_KEY_ID=XXXXXXXXXX
# APPLE_SIGNER_CERT_BASE64=<base64 del .pem del certificado>
# APPLE_SIGNER_KEY_BASE64=<base64 del .pem de la private key>
# APPLE_WWDR_CERT_BASE64=<base64 del .pem del WWDR>
# APPLE_CERT_PASSWORD=<password del cert si tiene>
# APPLE_AUTH_TOKEN=<openssl rand -hex 32>
```

**Notas**:

- `DATABASE_URL` ya viene desde el Reference de Postgres (paso 2). No la pongas a mano.
- `PORT` lo asigna Railway automáticamente. No la pongas.
- Cuando agregues variables, Railway redeploya automáticamente.
- Sin las opcionales, las features caen graciosamente: emails se omiten, wallet abre en modo "web pass", videos privados no funcionan.

## 4. Cargar el esquema de la BD

El proyecto tiene dos formas de aplicar el esquema. **Usa la opción A (recomendada)**.

### Opción A: archivo único consolidado

`supabase/migrations/schema_complete.sql` es **idempotente** (todas las tablas con `IF NOT EXISTS`, todos los índices guardados, seeds con `ON CONFLICT`). Lo puedes correr cuantas veces quieras.

#### Vía Railway CLI (más fácil)

```bash
npm i -g @railway/cli
railway login
railway link              # selecciona tu proyecto Kala
railway service           # selecciona "Postgres"
railway connect           # abre psql conectado a la BD
# Dentro de psql:
\i supabase/migrations/schema_complete.sql
\i supabase/migrations/20260506_kala_progress_rings.sql
\q
```

#### Vía psql con DATABASE_URL pública

1. En Railway → servicio Postgres → pestaña **Variables** → expande `DATABASE_PUBLIC_URL` y copia.
2. Localmente:

```bash
export DB="postgres://...railway.app:..."
psql "$DB" -f supabase/migrations/schema_complete.sql
psql "$DB" -f supabase/migrations/20260506_kala_progress_rings.sql
```

### Orden de migraciones

| # | Archivo | Necesario | Notas |
|---|---|---|---|
| 1 | `schema_complete.sql` | **Sí** | 45 tablas, idempotente, todos los seeds básicos |
| 2 | `20260506_kala_progress_rings.sql` | **Sí** | Tablas de anillos Kala, en su mayoría idempotente |
| 3 | `20260226_fix_plans_real_prices.sql` | Opcional | Reemplaza precios de planes con los reales de los flyers (no idempotente, NO correr dos veces, hace DELETE + INSERT) |
| - | `20260225002519_*.sql` | **No correr** | Esquema original Lovable, ya consolidado en `schema_complete.sql` |
| - | `20260225_seed_classes_schedule_packages.sql` | **No correr** | Archivo vacío |
| - | `20260226_events_module.sql` | **No correr** | Ya consolidado en `schema_complete.sql` |

### Admin user

El server siembra automáticamente `admin@kalabarre.mx / Ophelia2026!` en cada arranque (función al inicio de `server/index.js`). No necesitas crearlo manualmente.

## 5. Re-deploy y verificar

Railway redeploya automático al actualizar variables. Cuando termine:

```bash
# Healthcheck
curl https://kala-studio.up.railway.app/api/health
# Debería devolver {"status":"ok","db":"ok",...}

# Landing
open https://kala-studio.up.railway.app/

# Admin login
# https://kala-studio.up.railway.app/auth/login
# email: admin@kalabarre.mx
# pass: Ophelia2026!
# → debería redirigir a /admin/dashboard
```

Si `/api/health` devuelve `db: "error"`, falta correr migraciones o `DATABASE_URL` está mal apuntada. Si devuelve 200 pero el frontend no carga, revisa **Deploy Logs**.

## 6. Dominio custom (opcional, cuando estés listo)

1. Servicio web → **Settings** → **Domains** → **Custom Domain** → escribe `kalabarre.mx` (y opcional `www.kalabarre.mx`).
2. Railway te muestra el CNAME para apuntar en tu DNS (Cloudflare, Namecheap, etc.).
3. Una vez verificado, **actualiza** las env vars:
   - `SITE_URL=https://kalabarre.mx`
   - `APP_URL=https://kalabarre.mx`
   - `CORS_ALLOWED_ORIGINS=https://kalabarre.mx,https://www.kalabarre.mx,https://kala-studio.up.railway.app`
4. Re-deploy.

## 7. Apple Wallet y Google Wallet en producción

Los assets de marca (ícono K, wordmark) ya están en `wallet-assets/apple-pass/` y `public/`, viajan en el repo. Sólo te falta:

### Apple Wallet (.pkpass real)

Sin certs, el server cae a "web pass" (página HTML imprimible). Para `.pkpass` real necesitas:

1. Cuenta Apple Developer ($99/año).
2. Crear **Pass Type ID** en https://developer.apple.com → Identifiers.
3. Generar **Pass Type Certificate** (.p12), exportar el `.pem` del cert y de la key.
4. Descargar **Apple WWDR Certificate** (G4): https://developer.apple.com/certificationauthority/AppleWWDRCAG4.cer → convertir a `.pem`.
5. Setear las env vars `APPLE_*` (sección 3).
6. Reiniciar Railway. Logs: `[Apple Wallet] ✅ All certs configured — .pkpass mode`.

### Google Wallet

1. Crear cuenta en **Google Pay & Wallet Console** y solicitar Issuer ID.
2. Crear **Service Account** con rol "Wallet Object Issuer".
3. Descargar el JSON de credenciales: `cat sa.json | base64 | tr -d '\n'` → pegar en `GOOGLE_SA_KEY_JSON_BASE64`.
4. Reiniciar Railway. El primer save URL crea la `loyaltyClass` automáticamente.

## 8. Errores comunes

| Síntoma | Causa probable | Fix |
|---|---|---|
| Build falla con `vite: command not found` | `npm install` no instaló devDeps | Ya no debería pasar; `nixpacks.toml` corre `npm install` (incluye dev) |
| `/api/health` devuelve `db: "error"` | `DATABASE_URL` no apuntada o BD vacía | Revisa Reference, corre `schema_complete.sql` |
| 502 / "Application failed to respond" | Server crasheó al arrancar | Deploy Logs → suele ser env var faltante o sintaxis JSON en `GOOGLE_SA_KEY_JSON_BASE64` |
| `error: relation "users" does not exist` | Migraciones no aplicadas | Sección 4 |
| CORS bloqueado en frontend | Dominio no en `CORS_ALLOWED_ORIGINS` | Agrégalo, redeploy |
| `JWT_SECRET` inseguro / login random falla | Secret distinto en cada arranque | Setear `JWT_SECRET` fijo en Railway |
| Frontend abre sin estilos | Build no terminó | Esperar build completo, revisar logs |
| Login `Ophelia2026!` no funciona | El seed no corrió porque el server no arrancó | Resolver causa anterior, reiniciar |

## 9. Operación

- **Logs**: pestaña **Deployments** → click en el deploy activo → tab **Logs**.
- **Reiniciar**: Settings → Restart, o redeploya con un commit vacío.
- **Migrar**: cualquier nuevo SQL agrégalo a `supabase/migrations/`, corre con `railway connect` + `\i ruta.sql`.
- **Seed manual**: el admin se siembra solo. Para alumnas de prueba, usa `/auth/register` desde el navegador.
- **Backup**: Railway Postgres tiene snapshots automáticos en planes pagos. Para Hobby, exporta:
  ```bash
  pg_dump "$DATABASE_PUBLIC_URL" -Fc -f kala-$(date +%F).dump
  ```

## 10. Checklist de smoke test post-deploy

- [ ] `/api/health` → 200, `db: "ok"`
- [ ] `/` → landing carga, ícono K visible en nav
- [ ] `/auth/login` → form responde
- [ ] Login con admin → `/admin/dashboard`
- [ ] Logout → `/auth/login`
- [ ] Registro de alumna nueva → `/app`
- [ ] `/app/wallet` → pase con anillos visibles
- [ ] `/app/classes` → calendario semanal
- [ ] PWA: en móvil, "Add to Home Screen" → ícono K instalado, theme berry
- [ ] OG image: paste de la URL en WhatsApp → preview con wordmark KALA studio

---

Listo. Cualquier cambio futuro: `git push origin main` → Railway redeploya solo.
