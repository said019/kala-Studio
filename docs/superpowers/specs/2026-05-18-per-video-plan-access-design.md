# Acceso a videos por plan (granular) + compra individual — design spec

**Fecha:** 2026-05-18
**Owner del producto:** Said (dueño)
**Implementador:** Said + Claude
**Estado:** aprobado en brainstorming, pendiente de plan de implementación
**Extiende:** [`2026-05-14-video-library-access-design.md`](./2026-05-14-video-library-access-design.md) (ya implementado)

## Contexto

El spec del 2026-05-14 ya está implementado: existe `computeVideoAccessState`,
`video_access_grants`, `is_trial`, el proxy seguro `/api/drive/secure-video/:fileId`,
y el flujo de compra individual (`video_purchases` + aprobación admin). Ese spec
declaró explícitamente como **No-goal** el "acceso per-video (granular)".

Este spec implementa precisamente ese siguiente paso. Es **aditivo** sobre lo
existente salvo por **un cambio de comportamiento deliberado** (§7).

## Problema

Hoy el acceso a un video es binario: `gratuito` (libre) o `miembros`
(= cualquier plan con `includes_video_library=true` **+ grant manual**). No se
puede decir "este video lo desbloquean solo los planes A y B; quien no los tenga
lo compra aparte". El dueño quiere granularidad por video y que el acceso por
plan sea automático.

## Decisiones de producto (resueltas en brainstorming)

1. **Granularidad:** por planes específicos. Al subir/editar un video la admin
   marca exactamente qué planes lo desbloquean.
2. **Concesión:** **automática**. Plan activo elegible → acceso inmediato, sin
   grant manual. (Cambio de comportamiento vs. 2026-05-14, ver §7.)
3. **Config por video:** `GRATIS` ó `POR PLANES`; si es por planes, venta
   individual **opcional** con precio.
4. **Planes ↔ biblioteca:** mixto. Un plan puede ser *biblioteca completa*
   (`includes_video_library=true` → ve todos los videos por planes) **ó** normal
   (solo desbloquea los videos que lo listan explícitamente).
5. **Compra individual:** acceso **permanente** al video comprado tras aprobación
   de la admin.

## Modelo de datos

Cambio aditivo. Cero migración de datos. Cero breaking en el esquema.

```sql
-- Tabla puente video ↔ planes (patrón idéntico a discount_code_plans)
CREATE TABLE IF NOT EXISTS video_plans (
  video_id  UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  plan_id   UUID NOT NULL REFERENCES plans(id)  ON DELETE CASCADE,
  PRIMARY KEY (video_id, plan_id)
);
CREATE INDEX IF NOT EXISTS idx_video_plans_plan ON video_plans(plan_id);
```

Va en el bloque de migraciones idempotente de `server/index.js`
(`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`), mismo patrón que
el resto del esquema. Re-arrancar el server es seguro.

**Campos reutilizados (no se crean):**

- `videos.access_type` — se normaliza a 2 valores efectivos: `'gratuito'`
  (= GRATIS) y `'miembros'` (= POR PLANES). Legacy `'free'`→`'gratuito'`,
  `'members'`→`'miembros'`: se mapea en lectura; al guardar desde el form nuevo
  se persiste el valor canónico. No se reescribe masivamente la columna.
- `videos.sales_enabled`, `videos.sales_price_mxn`, `videos.sales_cta_text` —
  venta individual opcional (flujo `video_purchases` ya existente).
- `plans.includes_video_library` — se **reinterpreta** como "biblioteca
  completa": desbloquea todos los videos `'miembros'` sin estar en `video_plans`.
  No cambia el tipo ni los datos de la columna; solo cambia el copy en el form
  admin (§ Admin UX).
- `video_access_grants` — se conserva como override manual opcional (acceso de
  cortesía). Ya **no es obligatorio** para acceso por plan.
- `video_purchases.has_access` — acceso permanente del video comprado. Sin
  cambios; ya es permanente.
- `videos.is_trial` — se conserva como bypass de preview. Sin cambios.

## Regla de acceso a un video

Resuelta en cada request, nunca almacenada.

```
access_type = 'gratuito'  → free   (cualquier usuaria logueada)
access_type = 'miembros'  → unlocked si CUALQUIERA de:
   (a) membresía activa con plan en video_plans(video_id)        [granular]
   (b) membresía activa con plan.includes_video_library = true   [full-library]
   (c) video_purchases.has_access = true para (video, user)      [compra]
   (d) video_access_grants activo para user                      [cortesía]
   (e) videos.is_trial = true                                    [preview]
   en otro caso → bloqueado
```

"Membresía activa" = patrón existente del codebase:
`m.status = 'active' AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)`.

## Backend

### `computeVideoAccessState(userId, videoId)` — reescritura

Hoy la función es por-usuario y exige plan elegible **+** grant manual. Cambios:

- Recibe también `videoId` (el acceso ahora depende del video).
- Se elimina el requisito de `video_access_grant` para acceso por plan; el grant
  queda solo como override (vía d).
- Una sola query (sin N+1) que evalúa las vías a–e.

Estados devueltos:

| Estado | Cuándo | UX clienta |
|---|---|---|
| `free` | `access_type='gratuito'` | reproduce (solo login) |
| `unlocked` | vía a, b, c, d o e | reproduce |
| `locked_purchasable` | sin acceso, `sales_enabled=true` | CTA "Comprar — $X" |
| `locked_plan_only` | sin acceso, `sales_enabled=false` | "Exclusivo de planes: …" + ver planes |

### Endpoints

| Método | Path | Auth | Cambio |
|---|---|---|---|
| `GET` | `/api/videos` | auth | **Modificar:** `has_access` + `accessState` por video con la nueva regla (LEFT JOIN `video_plans`, membresía activa, purchases) en un solo query agregado. |
| `GET` | `/api/videos/:id` | auth | **Modificar:** `accessState` resuelto para ese video. |
| `GET` | `/api/videos/:id/stream-url` | auth | **Modificar:** barrera dura — si `accessState ∉ {unlocked, free}` → `403 { reason }`. Token HMAC sin cambios. |
| `GET` | `/api/drive/secure-video/:fileId` | token | Sin cambios (valida token firmado). |
| `GET` | `/api/admin/videos/:id` | admin | **Modificar:** incluir `plan_ids` actuales para precargar el form. |
| `POST` | `/api/admin/videos` | admin | **Modificar:** aceptar `plan_ids: string[]`. Transacción: insert video + insert `video_plans`. |
| `PUT` | `/api/admin/videos/:id` | admin | **Modificar:** aceptar `plan_ids`. Transacción: update video + `DELETE FROM video_plans WHERE video_id=$1` + re-insert. |
| `POST` | `/api/videos/:id/purchase` | auth | Sin cambios (flujo `video_purchases` existente). |
| `POST` | `/api/videos/purchases/:id/proof` | auth | Sin cambios. |
| `POST` | `/api/videos/purchases/:id/approve` | admin | Sin cambios (set `has_access=true`, permanente). |
| `POST` | `/api/videos/purchases/:id/reject` | admin | Sin cambios. |

No hace falta endpoint de borrado de `video_plans`: el `ON DELETE CASCADE`
limpia al borrar video o plan.

### Seguridad

- El front nunca decide acceso: lo dicta `accessState` del backend.
- Única puerta real al MP4: `/stream-url` (computa estado) + token HMAC validado
  en `/drive/secure-video` por cada Range request. Sin cambios respecto a
  2026-05-14.

## Admin UX

### Formulario de video (`src/pages/admin/videos/VideoUpload.tsx`)

Reemplaza el selector libre de `access_type` por dos estados:

```
Acceso al video
( ) Gratis — cualquier alumna registrada puede verlo
(•) Por planes — solo alumnas con ciertos planes

   Planes que desbloquean este video  (multiselección, planes activos)
   [✓] Barre — 4 Clases por semana        [chip: biblioteca completa si aplica]
   [✓] Ilimitado mensual
   [ ] Barre — 2 Clases al mes

   [✓] Permitir compra individual
       Precio (MXN): [ 199 ]   CTA: [ Comprar clase ]
```

- "Gratis" → oculta selección de planes y venta (no aplican).
- "Por planes" + 0 planes + sin full-library + venta off → **warning inline**
  (no bloquea guardar): "Nadie podrá ver este video."
- Planes con `includes_video_library=true` muestran chip "biblioteca completa"
  para explicar por qué ya ven todo.
- `plan_ids` se envía en crear y editar; en editar se precarga con
  `GET /api/admin/videos/:id`.

### Lista de videos admin

Badge de acceso por video: `GRATIS` · `N planes` · `+ venta`.

### Formulario de planes (`src/pages/admin/plans/PlansList.tsx`)

Mismo `Switch` `includes_video_library`, **reetiquetado** para claridad:

- Label: "Biblioteca completa de videos"
- Texto: "Las alumnas con este plan ven **todos** los videos por planes, sin
  asignarlo video por video."

Sin cambios de datos ni de endpoint para planes.

## Member UX (clienta)

### Tarjeta de video (listado)

| `accessState` | Tarjeta | Acción |
|---|---|---|
| `unlocked` / `free` | normal | "Ver" → reproduce |
| `locked_purchasable` | candado + `$199` | "Comprar este video" |
| `locked_plan_only` | candado + "Exclusivo de planes" | "Ver planes" → `/planes` |

### Detalle del video

- `unlocked`/`free`: reproductor (pide `stream-url`, igual que hoy).
- `locked_purchasable`: bloque de compra (precio, "acceso permanente a este
  video", botón Comprar).
- `locked_plan_only`: lista de planes que lo desbloquean (nombre + precio) + CTA
  a planes. Sin botón de compra.

### Flujo de compra individual (reutiliza el existente)

1. `POST /api/videos/:id/purchase` → `video_purchases` (`pending_payment`) +
   datos bancarios.
2. Sube comprobante → `POST /api/videos/purchases/:id/proof` →
   `pending_verification`.
3. Admin aprueba → `POST /api/videos/purchases/:id/approve` → `has_access=true`,
   **permanente**.
4. Email de confirmación vía `emailService` (mismo patrón que aprobaciones
   existentes; si no hay plantilla "video desbloqueado", se añade — a verificar
   en el plan de implementación).

Estados intermedios para un video con compra en curso:

- `pending_payment` → "Sube tu comprobante".
- `pending_verification` → "Pago en revisión." (sin botón comprar duplicado).
- `rejected` → motivo + "Reintentar compra".

## §7 — Cambio de comportamiento respecto a 2026-05-14

**Antes (implementado):** plan elegible **+ grant manual obligatorio** →
`locked_pending_grant` hasta que la admin concede.

**Ahora:** plan activo elegible (vía a o b) → `unlocked` **automático**, sin
grant. El estado `locked_pending_grant` deja de emitirse para acceso por plan.
`video_access_grants` sigue existiendo como override de cortesía (vía d).

**Efecto:** alumnas con plan full-library que hoy esperan grant manual pasarán a
ver los videos sin intervención al desplegar. Es el comportamiento deseado
(decisión de producto #2), documentado aquí explícitamente como cambio de
comportamiento que hay que comunicar al dueño antes del rollout.

## Migración / compatibilidad

- `video_plans` arranca vacía. Un video `'miembros'` sin filas = "solo planes
  full-library" → idéntico al comportamiento actual. Cero regresión en la
  videoteca existente.
- `video_access_grants` y `video_purchases` existentes siguen funcionando
  (vías d y c). No se borran.
- `includes_video_library` no cambia de datos; solo de copy en UI.
- ALTER/CREATE aditivos con default seguro → deploy directo, sin downtime,
  sin backfill.
- Rollout: (1) deploy schema + backend (nadie nota); (2) admin asigna planes a
  videos; (3) se comunica el cambio §7; (4) clientas sin plan ven CTA de compra.

## Edge cases

| Caso | Comportamiento |
|---|---|
| Compró el video y luego adquiere plan que lo incluye | Sigue `unlocked` (cualquiera de las vías basta), sin doble cobro |
| Admin quita un plan de `video_plans` | Alumnas de ese plan pierden acceso al próximo request; las que compraron lo conservan (vía c) |
| Membresía expira | Pierde vía a/b; conserva lo comprado (c) y trial (e) |
| Video `'miembros'` sin planes y sin venta | `locked_plan_only` con lista vacía → mensaje genérico "No disponible por ahora" (degradación segura) |
| Borrar plan | `ON DELETE CASCADE` limpia `video_plans` |
| Borrar video | `ON DELETE CASCADE` limpia `video_plans` |
| `access_type` legacy `'free'`/`'members'` | Mapeado en lectura a `'gratuito'`/`'miembros'`; canonizado al guardar desde el form nuevo |
| Stream-url con estado ≠ unlocked/free | `403 { reason }` |
| Doble click en "Comprar" con compra en curso | Estado `pending_*` no muestra botón duplicado |

## Testing

### Matriz de acceso (`computeVideoAccessState`) — núcleo

- `gratuito` + logueada sin membresía → `free`.
- `miembros`, plan en `video_plans`, membresía activa → `unlocked` (a).
- `miembros`, plan **no** en lista y **no** full-library, venta on →
  `locked_purchasable`; venta off → `locked_plan_only`.
- `miembros`, plan full-library no listado → `unlocked` (b).
- `video_purchases.has_access=true` sin membresía → `unlocked` (c).
- Membresía expirada → pierde a/b, conserva c.
- Grant activo → `unlocked` (d); grant revocado → no cuenta.
- `is_trial=true` → `unlocked` (e) regardless.
- `stream-url` con estado ≠ unlocked/free → `403`.

### Integración

- Crear video con `plan_ids` → filas en `video_plans`.
- Editar quitando un plan → fila borrada.
- Borrar plan → cascade limpia `video_plans`.
- Borrar video → cascade limpia `video_plans`.

Seguir el patrón de tests existente del repo (runner exacto a confirmar en el
plan de implementación; el repo usa `endpoint-auditor/audit/*.mjs`).

### QA manual

- Admin: subir video, asignar planes, activar venta.
- Clienta sin plan: bloqueado → comprar → comprobante → aprobación →
  desbloqueado permanente.
- Clienta con plan listado: acceso automático sin grant.

## No-goals

- Tiers/niveles de acceso (descartado en brainstorming).
- Acceso temporal por compra (se decidió permanente).
- Plan-ids como array en `videos` (se eligió tabla puente, enfoque A).
- Pasarela de pago automática (sigue siendo transferencia + aprobación manual).
- Watch progress, favoritos, playlists, ratings, descarga offline.

## Archivos que se tocarán (estimación)

**Backend:**
- `server/index.js` — migración `video_plans`, reescritura
  `computeVideoAccessState(userId, videoId)`, modificación de
  `/api/videos`, `/api/videos/:id`, `/api/videos/:id/stream-url`,
  `/api/admin/videos` (POST/PUT/GET).

**Frontend admin:**
- `src/pages/admin/videos/VideoUpload.tsx` — bloque acceso + multiselección de
  planes + venta.
- Lista de videos admin — badge de acceso.
- `src/pages/admin/plans/PlansList.tsx` — recopy del switch.

**Frontend clienta:**
- Biblioteca/detalle de videos — estados `locked_purchasable` /
  `locked_plan_only` + flujo de compra.

**Testing:**
- Suite nueva para la matriz de acceso + integración `video_plans`
  (formato `endpoint-auditor/audit/*.mjs`).
