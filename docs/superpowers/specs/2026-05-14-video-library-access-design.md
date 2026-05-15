# Video library access — design spec

**Fecha:** 2026-05-14
**Owner del producto:** Karla (dueña del studio)
**Implementador:** Said + Claude
**Estado:** aprobado por el dueño, pendiente de plan de implementación

## Problema y oportunidad

La alumna logueada hoy ve una sección de videos en el admin pero el modelo de acceso es binario (`gratuito` vs `miembros`) y no expone una experiencia de "muestra para captar". La dueña quiere:

1. Que las alumnas vean la **biblioteca completa** dentro de la app (incluso bloqueada — descubribilidad).
2. Que **solo ciertos planes** desbloqueen el acceso real.
3. Que el admin **conceda manualmente** el acceso (control y onboarding humano).
4. Que exista una **clase trial** (~20 min) abierta a cualquier alumna logueada, como gancho de conversión.

Modelo de negocio detrás: la trial muestra calidad de producción + estilo de Karla; quien quiera más se da cuenta de qué planes lo desbloquean y compra; la admin activa cuando ve la orden.

## Decisiones de producto (4 preguntas resueltas en el brainstorming)

1. **Modelo de acceso:** plan elegible + grant manual del admin (ambos requeridos).
2. **Trial:** una (o pocas) clases dedicadas marcadas como `is_trial=true`. Visible a cualquier alumna logueada. NO público anónimo.
3. **UX de bloqueo:** mensaje informativo, sin botón de "solicitar acceso" (el admin se entera por la notif de orden aprobada, no por solicitud reactiva).
4. **Gap del grant** (alumna ya tiene plan pero falta grant): mensaje contextual distinto según estado, badge "pendiente" en admin.

## Storage de videos

**Infraestructura existente:** los videos viven en una cuenta de Google Drive con **5 TB** de almacenamiento. Toda la infra ya está montada:

- `POST /api/drive/init-upload` (admin) — abre sesión resumable de Drive
- `PUT /api/drive/upload-chunk/:sessionId` (admin) — sube chunks de ~5 MB del browser al server al Drive
- `POST /api/drive/make-public/:driveFileId` — hace público el archivo
- `GET /api/drive/video/:fileId` — proxy con soporte de **Range requests** (necesario para seek)
- `videos.drive_file_id` — guarda el ID del archivo en Drive
- URL servida al frontend: `/api/drive/video/{drive_file_id}`

**Estado actual del proxy** (server/index.js:11378): `GET /api/drive/video/:fileId` **no tiene `authMiddleware`**. Hoy sirve los videos del Index público (`homepage_video_cards` — la sección "Mira cómo se vive") y los videos de la biblioteca actual. Cualquiera con el `fileId` puede streamear sin login.

Para la **biblioteca de videos** (este feature) eso es inaceptable — bloquear en UI sería teatro. Pero el proxy también sirve assets que **deben** ser públicos (las cards del Index). Solución: **dos rutas distintas**, una para cada uso.

**Decisión:** crear `/api/drive/secure-video/:fileId` con validación de token firmado. Dejar `/api/drive/video/:fileId` **intacta** sirviendo solo los assets que por diseño son públicos (`homepage_video_cards`). Razones:

1. El proxy se llama múltiples veces por video (cada Range request del `<video>` tag, cada seek). Hacer `computeVideoAccessState` en cada chunk = N queries por play. Token HMAC = cero DB hits por chunk.
2. Un `<video>` tag no manda headers custom — solo cookies o querystring. Bearer JWT directo en el proxy no es ergonómico.
3. Token firmado HMAC en querystring (`?t=...&exp=...`) es estándar, sin estado, fácil de revocar (rotando el secret).
4. **Sin regresión:** las `homepage_video_cards` siguen funcionando con el proxy actual sin cambios. Solo la biblioteca nueva pasa por la ruta segura.

**Mecanismo:**
- `GET /api/videos/:id/stream-url` (autenticado normal con Bearer JWT) computa el state, y si está unlocked/trial firma un token: `HMAC(userId + driveFileId + exp, SECRET)`. Devuelve `{ url: "/api/drive/secure-video/{driveFileId}?t={token}&exp={ts}" }`.
- `GET /api/drive/secure-video/:fileId` valida `?t=` y `?exp=` contra el HMAC del server. Si firma OK + `exp` en futuro + `driveFileId` coincide → stream Range. Si no → 401.
- **Trial usa la misma ruta segura.** Si bien el trial es "público para logueadas", igual se beneficia del rate-limit-via-TTL y del audit (qué `userId` consumió qué video). El gate de elegibilidad solo es distinto en `/stream-url`, no en el proxy.
- **TTL del token:** 60 min. Suficiente para una clase de 50 min sin interrupción, corto para que un compartir-URL no sirva mañana. El client refresca al pasar 30 min si la alumna sigue viendo.

**Cuotas Drive:** la cuenta tiene 5 TB. A 500 MB por video promedio = ~10K videos posibles. No es restricción inmediata. La API de Drive sí tiene rate limits (1B requests/día, 1K req/100s/usuario) — el proxy ya consume token de servicio compartido, así que monitorear si crece.

## Estados de acceso (fuente de verdad)

Computados en cada request por `computeVideoAccessState(userId)`. **Nunca almacenados.**

| Condición | Estado | Mensaje al usuario |
|---|---|---|
| Video con `is_trial = true` | `unlocked` (override) | "🎁 Clase muestra" — reproducible |
| Plan elegible activo + grant activo | `unlocked` | Reproducible sin restricción |
| Plan elegible activo, sin grant | `locked_pending_grant` | "Tu acceso está en revisión, te avisaremos." |
| Sin plan elegible | `locked_no_plan` | "Adquiere [Plan A] o [Plan B] para acceder a todas las clases." |

"Plan elegible" = plan con `includes_video_library = true`.
"Activo" = `memberships.status = 'active'` AND `(end_date IS NULL OR end_date >= CURRENT_DATE)`.
"Grant activo" = row en `video_access_grants` con `revoked_at IS NULL`.

## Modelo de datos

**Cambios aditivos. Cero migraciones de datos. Cero breaking.**

```sql
-- 1. Marca qué planes incluyen acceso a la biblioteca
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS includes_video_library BOOLEAN NOT NULL DEFAULT false;

-- 2. Marca qué videos son "trial" (visible a todas las logueadas)
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false;

-- 3. Grants manuales del admin
CREATE TABLE IF NOT EXISTS video_access_grants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by  UUID NOT NULL REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ NULL,
  revoked_by  UUID NULL REFERENCES users(id),
  note        TEXT NULL
);

-- Índice parcial para acelerar el lookup más común (¿esta alumna tiene grant activo?)
CREATE INDEX IF NOT EXISTS idx_vag_user_active
  ON video_access_grants(user_id) WHERE revoked_at IS NULL;
```

**Decisiones explicadas:**

- `videos.access_type` (`gratuito | miembros`) **se queda intacta** — backward compat. La nueva regla es `is_trial=true` desbloquea regardless. Los `gratuito` legacy siguen siendo libres.
- **Grant es a nivel de biblioteca completa**, no per-video. Suficiente para el volumen actual; migrar a per-video sería aditivo después.
- **Soft-delete** en grants (`revoked_at` en vez de DELETE) → audit trail completo.
- **Re-grant después de revoke crea un nuevo row**, no des-revoca el viejo. Historial completo.
- **Estado calculado, no almacenado.** Si plan vence, el grant queda dormant en DB pero `computeVideoAccessState` la regresa a `locked_no_plan` automáticamente. Si vuelve a comprar, se reactiva sin trabajo extra. (Decisión explícita del dueño: "dejemos el grant dormant".)
- **`granted_by`/`revoked_by` no usan ON DELETE CASCADE.** Si el admin se borra, el row queda con id huérfano y los reportes muestran "Admin eliminado" — audit trail intacto.

## Backend

### Helper compartido (núcleo de toda la lógica)

```js
// server/index.js — al lado de otros helpers de dominio
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

  if (eligiblePlan && hasGrant) {
    return { state: "unlocked", planName: eligiblePlan.name };
  }
  if (eligiblePlan) {
    return { state: "locked_pending_grant", planName: eligiblePlan.name };
  }

  // Lista de planes elegibles para mostrar "adquiere X o Y"
  const offers = await pool.query(
    `SELECT id, name, price FROM plans
      WHERE includes_video_library = true AND is_active = true
      ORDER BY price ASC`
  );
  return { state: "locked_no_plan", offers: offers.rows };
}
```

### Endpoints

| Método | Path | Auth | Notas |
|---|---|---|---|
| `GET` | `/api/me/video-access` | auth | **Nuevo.** Devuelve `computeVideoAccessState(req.userId)`. Para mostrar el banner correcto en `/videos`. |
| `GET` | `/api/videos` | auth | (existente) **Modificar:** anexar `is_trial` a cada video del payload. |
| `GET` | `/api/videos/:id` | auth | (existente) **Modificar:** anexar `access_state` ya resuelto para este video específico (`unlocked` si trial; si no, el state global). |
| `GET` | `/api/videos/:id/stream-url` | auth | **Nuevo.** Si trial OR usuario unlocked: firma token HMAC(userId+driveFileId+exp) y devuelve `{ url: "/api/drive/secure-video/{driveFileId}?t={token}&exp={ts}" }`. 403 con `{ reason: "no_plan" \| "pending_grant" }` si no. **Una de las dos barreras de seguridad** (la otra es la validación del token en el proxy). |
| `GET` | `/api/drive/secure-video/:fileId` | token | **Nuevo.** Mismo mecanismo de Range/proxy que `/api/drive/video/:fileId`, pero exige token firmado. Sin token o inválido/expirado → 401. La biblioteca usa esta ruta. |
| `GET` | `/api/drive/video/:fileId` | público | (existente) Se queda **sin cambios**. Sigue sirviendo `homepage_video_cards` (la sección "Mira cómo se vive" del Index público). El "agujero" preexistente se reduce a esos assets que de todas formas son públicos por diseño. |
| `POST` | `/api/admin/users/:userId/video-access` | admin | **Nuevo.** Crea grant. Body `{ note? }`. Idempotente: si ya existe activo, devuelve `{ alreadyGranted: true }`. Dispara WA `video_access_granted` fire-and-forget. |
| `DELETE` | `/api/admin/users/:userId/video-access` | admin | **Nuevo.** Marca `revoked_at = NOW()`, `revoked_by = req.userId` en el grant activo. Idempotente: si no hay grant activo devuelve 200 con `{ alreadyRevoked: true }` (no 404 — la intención del admin se cumplió). 404 solo si el `userId` no existe. |
| `GET` | `/api/admin/video-access/pending` | admin | **Nuevo.** Lista alumnas con plan elegible activo Y sin grant activo. Para el dashboard widget + filtro de la lista. |
| `PUT` | `/api/admin/videos/:id` | admin | (existente) **Modificar:** aceptar `is_trial` en el body. |
| `PUT` | `/api/admin/plans/:id` | admin | (existente) **Modificar:** aceptar `includes_video_library` en el body. |

### Decisiones de seguridad

- **Dos barreras complementarias:** `/stream-url` decide si la alumna tiene derecho hoy (computa state, una sola vez); el proxy `/drive/secure-video/:fileId` valida el token firmado en cada Range request. La UI es informativa; las dos barreras de servidor son lo que de verdad bloquea.
- **Token HMAC con `JWT_SECRET` existente** (o un secret propio rotable). Payload: `userId|driveFileId|exp`. No requiere DB ni Redis.
- **TTL del token = 60 min.** Suficiente para una clase de 50 min sin interrupción. Cliente refresca al pasar 30 min si la alumna sigue viendo (`useQuery` con `refetchInterval: 30 * 60 * 1000`).
- **Grant es idempotente** (mismo patrón que aplicamos en `/memberships/:id/activate` esta semana).
- **Lookup de grants usa el índice parcial** `idx_vag_user_active` — query se mantiene <1ms incluso a escala.

### Notificaciones

- Al hacer grant → WA template nueva `video_access_granted` con fallback. Variables: `{ name, planName }`. Mensaje base: "Hola {name}, ya tienes acceso a la biblioteca de clases en video. Disfruta. 💜"
- Al aprobar orden de plan elegible (`PUT /api/admin/orders/:id/verify`) → push de notif al admin (bell + opcional WA): "Nueva alumna con acceso pendiente: {name}". Reutilizar el sistema de notif admin existente.

## Admin UX

### A) Página de Planes

En el formulario de cada plan, debajo del precio:

```
☐ Incluye acceso a biblioteca de videos
   Las alumnas con este plan podrán acceder a las clases grabadas (requiere
   conceder acceso manualmente).
```

En la card listada del plan: badge `📹 Videos` cuando esté activo.

### B) Página de Videos (`/admin/videos`)

Cada video en la grid recibe un toggle inline:

- Default `is_trial = false` → sin badge
- Marcado → badge dorado `🎁 Clase muestra` arriba del thumbnail
- Toggle aparte de "Editar/Eliminar" (no requiere abrir el editor completo)

**Aviso suave** (no bloqueante): si el admin marca >2 videos como trial → toast "El trial funciona mejor con 1-2 videos como gancho. ¿Seguro?".

### C) Ficha de Alumna

Sección nueva "Acceso a biblioteca de videos". Tres estados, tres CTAs distintas:

```
┌──────────────────────────────────────────────────┐
│ 📹 Acceso a biblioteca de videos                 │
│                                                  │
│ Estado: [BADGE]                                  │
│                                                  │
│ ─ Si Activo ─                                    │
│ • Activo (otorgado el 14 may 2026 por Karla)     │
│   ↳ Plan vigente: Mensual Ilimitado              │
│   [ Revocar acceso ]                             │
│                                                  │
│ ─ Si Pendiente ─                                 │
│ • Pendiente (tiene plan elegible, falta grant)   │
│   ↳ Plan: Mensual Ilimitado (vence 14 jun)       │
│   [ ✓ Conceder acceso ]                          │
│                                                  │
│ ─ Si Sin plan ─                                  │
│ • Sin plan elegible                              │
│   ↳ Sus planes activos no incluyen videos.       │
│   [ Conceder acceso de todas formas ]            │
└──────────────────────────────────────────────────┘
```

### D) Discoverability del trabajo pendiente (decisión: dashboard + badge sutil)

**Dashboard** — card que aparece SOLO si hay >=1 pendiente:

```
┌────────────────────────────────────┐
│ 📹 3 alumnas esperan acceso a      │
│    videos                          │
│    María, Ana, Sofía               │
│    [ Ver lista ]                   │
└────────────────────────────────────┘
```

**Sidebar** — badge naranja sutil junto al item existente "Alumnas":

```
👥 Alumnas    ●3
```

**Lista de alumnas** — tab/toggle arriba "Pendientes de acceso (3)" que filtra. Botón "Conceder" inline en cada fila para despachar en serie sin abrir cada ficha.

NO se crea un item nuevo en sidebar. Decisión explícita: el sidebar ya tiene 12+ items, agregar uno más se convierte en ruido.

## Member UX (alumna)

### Página `/videos`

Header dinámico según `state` global (de `/api/me/video-access`):

- `unlocked` → "Biblioteca de clases" / "Reproduce todas las clases cuando quieras"
- `locked_pending_grant` → banner naranja "Tu acceso está en revisión. Te avisaremos en cuanto esté listo." (sin CTA, neutro)
- `locked_no_plan` → banner rosa "Adquiere {Plan A} o {Plan B} para acceder a todas las clases" + botón "Ver planes" → `/planes`

Grid de videos:

- **Trial** (`is_trial=true`): thumbnail normal, badge dorado "🎁 Clase muestra", play directo
- **Unlocked** para esta alumna: thumbnail normal, play directo
- **Locked**: thumbnail con overlay oscuro + 🔒 + texto contextual:
  - `locked_no_plan` → "Adquiere {Plan A}" o "Adquiere alguno: {Plan A}, {Plan B}"
  - `locked_pending_grant` → "Acceso en revisión"

### Click en video locked

Abre un sheet/modal (no toda una página) con state explicado:

- `locked_no_plan` → botones "Ver Plan A" "Ver Plan B" → `/planes#plan-a`
- `locked_pending_grant` → texto sereno "Estamos activando tu acceso." (sin CTA — decisión explícita del dueño: no quiere saturarse de mensajes)

### Player

Llama `GET /api/videos/:id/stream-url` justo antes de cargar el `<video>`:
- 200 → URL devuelta va al `src`
- 403 → muestra el modal de locked correspondiente

Stream-url se cachea client-side por 30 min (50% del TTL del token de 60 min) para no spamear el endpoint en cada seek; refetch automático al pasar 30 min si la alumna sigue viendo.

### Discoverability dentro de la app de alumna

- Item nuevo en menú principal: "🎬 Clases en video"
- Card en home/dashboard de alumna (solo si state != `locked_no_plan`): "Tienes acceso a la biblioteca de videos →"

### Lo que NO se hace (YAGNI explícito)

- Botón "Solicitar acceso" — descartado en pregunta 3
- Countdown / timer de trial — el trial es una clase específica, no una ventana
- Watch progress / continue watching
- Favoritos / playlist
- WhatsApp escape en pending_grant — descartado para no saturar al admin

## Edge cases

| Caso | Comportamiento |
|---|---|
| Alumna borra cuenta | `ON DELETE CASCADE` en `video_access_grants.user_id` → grant se va con ella |
| Admin (granted_by/revoked_by) se borra | Sin CASCADE, queda colgando. Reporte muestra "Admin eliminado". Audit intacto |
| Plan deja de tener `includes_video_library` | Alumnas con grant + ese plan pasan auto a `locked_no_plan`. Si el plan vuelve a marcarse, se reactiva solo |
| 0 videos marcados como trial | Página `/videos` no muestra preview. Banner cambia a "Próximamente: clase muestra". No rompe nada |
| Alumna sin login en `/videos` | Redirect a login. Standard auth guard |
| Re-grant después de revoke | Crea nuevo row. `computeVideoAccessState` solo mira el más reciente con `revoked_at IS NULL` |
| Doble click en "Conceder" | Idempotente. Segundo POST → `{ alreadyGranted: true }` |
| Stream URL de Drive expira mid-play | Frontend captura error de `<video>`, refetch automático |
| Alumna comparte URL del MP4 (con `?t=`) | El receptor puede ver hasta que expire el token (60 min). Después → 401. Para clases live no es problema; si se vuelve uno, bajar TTL a 15 min |
| Alumna comparte URL sin `?t=` | El proxy responde 401. Compartir el plain URL del proxy ya no funciona (cierra el hueco preexistente) |
| Race: admin concede + alumna refresca al mismo tiempo | Refetch (`useQuery`) la trae al estado correcto |
| Plan vence mientras alumna ve un video | Reproducción actual continúa (URL ya emitida); siguiente request a `/stream-url` da 403 |

## Errores devueltos

- `/stream-url` → 403 con `{ reason: "no_plan" \| "pending_grant" \| "revoked" }` para que el frontend traduzca a copy correcta
- `POST grant` → 404 si `userId` no existe en `users`
- `POST grant` → no valida que tenga plan (admin puede dar grant "de todas formas" — caso opcional documentado)
- Todos los handlers nuevos: `try/catch` con `console.error` (mismo patrón que pulimos esta semana en M1/M2/M3)

## Testing

### Smoke tests con mock pool

Mismo formato y archivo pattern que `endpoint-auditor/audit/smoke-test-puts.mjs`. Casos:

- `computeVideoAccessState` con las 4 combinaciones (sin plan, plan sin grant, sin plan con grant, plan + grant)
- `computeVideoAccessState` con plan vencido (`end_date < CURRENT_DATE`) → `locked_no_plan`
- `computeVideoAccessState` con plan elegible pero `is_active=false` → tratamos como sin plan
- `is_trial=true` siempre da `unlocked` regardless del state global
- POST grant idempotencia (segundo call no duplica)
- DELETE grant marca `revoked_at`, no DELETE
- POST → DELETE → POST crea nuevo row, no des-revoca el viejo

### Mutating test contra DB real

Mismo formato que `endpoint-auditor/audit/db-mutating-test.mjs`. Setup → assertions → cleanup en `finally`. Cubre:

- Setup: alumna test + plan elegible test (con `includes_video_library=true`) + membresía activa + 1 video trial + 1 video gated
- `/api/me/video-access` con la alumna sin grant → `locked_pending_grant`
- POST `/api/admin/users/:id/video-access` → state pasa a `unlocked`
- POST otra vez → `{ alreadyGranted: true }` (no duplica)
- DELETE → state vuelve a `locked_pending_grant`, row con `revoked_at IS NOT NULL`
- DELETE otra vez → `{ alreadyRevoked: true }`, no error
- `/videos/:idGated/stream-url` con grant → 200 con URL firmada; sin grant → 403
- `/videos/:idTrial/stream-url` siempre 200 con URL firmada
- `/api/drive/secure-video/:fileId` sin token → 401
- `/api/drive/secure-video/:fileId` con token válido → 200 (solo verifica firma, no DB)
- `/api/drive/secure-video/:fileId` con token expirado → 401
- `/api/drive/secure-video/:fileId` con token de OTRO `driveFileId` → 401 (firma no coincide)
- `/api/drive/video/:fileId` (público, legacy) sigue funcionando sin auth para `homepage_video_cards` → 200
- Cleanup: borrar grants, video, membership, plan, user en orden FK

### QA manual antes de prod

- Crear plan de prueba con `includes_video_library=true`
- Comprar desde cuenta test → verificar banner "pendiente" en `/videos`
- Verificar notif al admin de "nueva alumna con acceso pendiente"
- Conceder desde admin → verificar WA `video_access_granted` llega
- Revocar → verificar el video se bloquea inmediatamente al refrescar `/videos`
- Marcar 0 videos como trial → verificar fallback "Próximamente"

## Migración / rollout

- Las 3 ALTER TABLE son **aditivas con DEFAULT seguro** → cero downtime, deploy directo
- Por default todos los planes existentes quedan con `includes_video_library=false` y todos los videos con `is_trial=false` → nada cambia para nadie hasta que el admin marque algo
- No hay backfill necesario
- Rollout gradual posible:
  1. Deploy schema + endpoints (nadie nota nada)
  2. Admin marca 1 video como trial → la sección `/videos` aparece en la app de alumnas con un solo video reproducible
  3. Admin marca 1-2 planes con `includes_video_library=true`
  4. Admin empieza a aprobar grants conforme las alumnas compran esos planes

## Componentes a reutilizar

- `Badge`, `Switch`, `Button` (shadcn ya en uso)
- `useQuery` con `staleTime: 30s` para video-access state
- Patrón de toggle inline + confirm que ya existe en otras partes del admin
- Patrón de badge de unread (recién implementado en sidebar) → reusar para badge de pendientes
- `sendConfiguredWhatsAppTemplate` con fallback (ya en uso)
- `triggerWalletPassSync` no aplica aquí (no son passes)

## Archivos que se tocarán (estimación)

**Backend:**
- `server/index.js` — helper `computeVideoAccessState`, helper `signStreamToken`/`verifyStreamToken`, ~8 endpoints (4 nuevos puros: `/me/video-access`, `/videos/:id/stream-url`, `/admin/users/:id/video-access` POST + DELETE, `/admin/video-access/pending`, `/drive/secure-video/:fileId`; 3 modificados: `/videos`, `/videos/:id`, `/admin/videos/:id`, `/admin/plans/:id`)

**Frontend admin:**
- `src/pages/admin/videos/VideoList.tsx` — toggle is_trial por video
- `src/pages/admin/plans/*` (donde sea que se editen planes) — checkbox includes_video_library
- `src/pages/admin/clients/[id].tsx` (o equivalente) — sección de acceso
- `src/pages/admin/clients/index.tsx` — tab/filter de pendientes
- `src/pages/admin/Dashboard.tsx` — card de pendientes
- `src/components/admin/AdminLayout.tsx` — badge en item Alumnas

**Frontend alumna:**
- `src/pages/Videos.tsx` (nuevo) — biblioteca + gate UX
- Menú de alumna (donde sea) — item "Clases en video"
- Home/dashboard de alumna — card "Tienes acceso a..."

**Testing:**
- `endpoint-auditor/audit/smoke-test-video-access.mjs` (nuevo)
- `endpoint-auditor/audit/db-mutating-test-video-access.mjs` (nuevo)

## No-goals (qué queda fuera)

- Acceso per-video (granular). Si se necesita después, migración aditiva (agregar tabla `video_grants` per-video).
- Time-windowed trial (7 días gratis). Modelo distinto, evaluar después.
- Watch progress, favoritos, playlists.
- Comentarios o ratings en videos.
- Descarga offline.
- Acceso público anónimo a la trial (sin login). Decisión explícita: trial requiere login.
