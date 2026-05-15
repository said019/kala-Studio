# Auditoría — PUT endpoints con lógica (admin + user)

Stack: Express monolítico (`server/index.js`, ~14.5k líneas), PostgreSQL (`pg.Pool`), JWT propio.
Alcance: solo PUT/PATCH con lógica de negocio real (se excluyen los CRUD planos tipo `class-types`, `videos`, `plans`, `instructors`, `products`, `settings`, etc., que son `UPDATE ... COALESCE` sin efectos colaterales).
Modo: auditoría estática (sin requests a producción).

## Endpoints revisados

| Endpoint | Auth | Tx | Idempotente | Estado |
|---|---|---|---|---|
| `PUT /api/users/:id` | own-or-admin ✓ | n/a | sí | ⚠️ 2 hallazgos |
| `PUT /api/classes/:id/cancel` | admin ✓ | ✓ BEGIN/COMMIT/ROLLBACK | sí (guard `status!='cancelled'`) | ✅ sólido |
| `PUT /api/memberships/:id/activate` | admin ✓ | no | **no** | ⚠️ 2 hallazgos |
| `PUT /api/memberships/:id/cancel` | admin ✓ | no | sí | ⚠️ 1 hallazgo |
| `PUT /api/memberships/:id` | admin ✓ | no | sí | ⚠️ 1 hallazgo |
| `PUT /api/bookings/:id/check-in` | admin ✓ | no | sí (guard `wasAlreadyCheckedIn`) | ⚠️ 1 hallazgo (race) |
| `PUT /api/bookings/:id/no-show` | admin ✓ | no | sí (guard) | ✅ ok |
| `PUT /api/admin/orders/:id/verify` | admin ✓ | ✓ + `FOR UPDATE` | sí (guard `status!='approved'`) | ✅ sólido |
| `PUT /api/admin/orders/:id/reject` | admin ✓ | no | **no** | 🔴 1 hallazgo real |
| `PUT /api/admin/reviews/:id/approve` | admin ✓ | no | sí | ⚠️ 1 hallazgo |
| `PUT /api/events/:eventId/registrations/:regId` | admin ✓ | parcial | sí | ⚠️ 1 hallazgo menor |
| `PUT /api/events/:id/register/payment` | own ✓ | no | sí | ⚠️ 2 hallazgos |

---

## Hallazgos por severidad

### 🔴 HIGH

**H1 — `PUT /api/admin/orders/:id/reject` no valida el estado de la orden** · `server/index.js:12651`
El handler hace `UPDATE orders SET status='rejected'` **sin guard de estado**. Si la orden ya estaba `approved` (y por tanto `/verify` ya creó/activó la membresía y descontó el cupo del código de descuento), rechazarla deja el sistema inconsistente: orden = `rejected` pero la membresía sigue `active`. Además se le manda a la clienta el WhatsApp/email de "comprobante no aprobado" cuando en realidad sí lo estaba.
**Fix:** añadir `WHERE id=$1 AND status NOT IN ('approved','rejected')` y devolver 409 si no afectó filas; o si se quiere permitir "deshacer una aprobación", hacerlo en transacción revirtiendo membresía + uso de descuento (igual que el rollback de `/classes/:id/cancel`).
También: `/reject` no setea `verified_by` (sí lo hace `/verify`) — inconsistencia menor de auditoría.

### ⚠️ MEDIUM

**M1 — `PUT /api/memberships/:id/activate` no es idempotente y no valida estado** · `server/index.js:11815`
Activa la membresía sea cual sea su estado actual (incluso `cancelled` tras reembolso) y **cada llamada vuelve a disparar** email + plantilla WhatsApp `membership_activated` + `triggerWalletPassSync`. Doble click del admin = doble spam a la alumna. `catch` además no loguea (`return res.status(500)` a secas) → cero observabilidad.
**Fix:** `UPDATE ... WHERE id=$1 AND status <> 'active' RETURNING ...`; si no afectó filas, devolver el row actual sin reenviar notificaciones. Añadir `console.error` en el catch.

**M2 — `PUT /api/memberships/:id/cancel` no toca reservas futuras ni registra motivo** · `server/index.js:11865`
Solo cambia `status='cancelled'`. A diferencia de `/classes/:id/cancel` (que hace rollback completo) o del flujo de renovación en `/orders/:id/verify` (que setea `cancellation_reason`, `cancelled_at`, `end_date`), aquí las `bookings` futuras asociadas a esa membresía quedan colgando y no se guarda `cancelled_at`/`cancellation_reason`. `catch` sin logging.
**Fix:** decidir política (¿cancelar bookings futuras de esa membresía? ¿restaurar nada?) y al menos setear `cancelled_at=NOW()` + `cancellation_reason` del body para consistencia con el resto del dominio.

**M3 — `PUT /api/memberships/:id` y `PUT /api/events/.../registrations/:regId` aceptan `status` arbitrario** · `server/index.js:11880`, `:14110`
`/memberships/:id` mete `status` directo vía COALESCE sin validar contra un enum — un typo deja la membresía en un estado que ningún query (`status='active'`) reconoce → la alumna "pierde" su membresía silenciosamente. (El de events **sí** valida `valid = [...]`, bien — replicar ese patrón en memberships.) Además `classesRemaining` no tiene cota inferior (puede quedar negativo). `catch` sin logging.
**Fix:** validar `status` contra `['active','expired','cancelled','pending', ...]`; `classes_remaining = GREATEST(0, $2)` o validar `>= 0`.

**M4 — `PUT /api/events/:id/register/payment` guarda el comprobante (base64) en columna de DB sin límite real** · `server/index.js:14223`
`file_data` se persiste tal cual en `payment_proof_url`. El límite global de body es `20mb` (`server/index.js:1884`), así que cada comprobante puede inflar la tabla `event_registrations` con hasta ~20MB de base64 por fila → bloat de DB, backups lentos, `SELECT *` pesados (y varios handlers hacen `SELECT * FROM event_registrations`). Esto ya existe igual en el flujo de comprobantes de órdenes, pero conviene anotarlo.
**Fix:** validar tamaño (`if (file_data && file_data.length > N) return 413`), idealmente subir a Storage/S3 y guardar solo la URL; o al menos `LEFT(file_data, ...)` y un check explícito. También: `payment_method` no se valida — cualquier valor distinto de `'cash'` cae en la rama `'transfer'`.

**M5 — `PUT /api/bookings/:id/check-in`: race de doble puntos** · `server/index.js:12256`
El check de "primer check-in" es read-then-write en dos queries separadas sin transacción ni lock: dos requests concurrentes pueden ambas leer `checked_in_at = NULL` y ambas insertar `+10 pts` en `loyalty_transactions` (y disparar `notifyClassAttended` dos veces). Probabilidad baja (admin escaneando), impacto bajo (10 pts), pero es real.
**Fix:** hacer el UPDATE con `RETURNING (checked_in_at = NOW())` o `RETURNING xmax = 0`-style para saber si *este* statement fue el que lo marcó, y otorgar puntos solo en ese caso. O envolver lookup+update+insert en una transacción con `SELECT ... FOR UPDATE`.

**M6 — Granularidad de roles: `adminMiddleware` deja entrar a `instructor` y `reception` a TODOS estos PUT** · `server/index.js:2505`
`adminMiddleware` admite `["admin","super_admin","instructor","reception"]` sin distinción. Eso significa que una instructora puede aprobar comprobantes de pago (`/orders/:id/verify` → crea membresías y descuenta cupos de códigos), editar membresías arbitrariamente (`/memberships/:id`), editar planes/precios (`PUT /api/plans/:id`, `/api/admin/plans/:id`), códigos de descuento, etc. Solo `PUT /api/users/:id` distingue (`role` solo lo cambia `admin|super_admin`).
**Fix:** introducir un `requireRole(...roles)` y aplicar el subconjunto correcto a operaciones sensibles (pagos, planes, precios, membresías, roles) en vez del `adminMiddleware` genérico.

### ℹ️ LOW / nota

- **L1 — `PUT /api/users/:id`:** `role` lo puede cambiar admin, pero no se valida que sea un valor del enum válido → un admin puede dejar a alguien en un `role` inexistente y romperle el acceso. También: sin validación de input (Zod) en `phone`/`dateOfBirth` etc., a diferencia de `POST /api/auth/register` que sí valida `YYYY-MM-DD` — inconsistencia. (`server/index.js:8077`)
- **L2 — `PUT /api/admin/reviews/:id/approve`:** no chequea 404 — con un id inexistente `r.rows[0]` es `undefined` y responde `200 {data: undefined}` en vez de 404. (`server/index.js:13527`)
- **L3 — Fuga de detalle de error a cliente:** `PUT /api/classes/:id/cancel` (`error: err.message`) y `PUT /api/bookings/:id/check-in` (`error: err?.message?.slice(0,160)`) devuelven el mensaje de error de la DB en la respuesta. Solo admin, riesgo bajo, pero idealmente solo loggear.
- **L4 — Catch sin logging:** `/memberships/:id/activate`, `/memberships/:id/cancel`, `/memberships/:id`, `/bookings/:id/no-show`, `/admin/reviews/:id/approve`, `/admin/orders/:id/reject` hacen `catch (err) { return res.status(500)... }` sin `console.error` → un 500 en prod no deja rastro.
- **L5 — `reason`/`notes` sin sanitizar:** en `/classes/:id/cancel` el `reason` se interpola en el texto de WhatsApp; `notes` en varios sitios sin límite de longitud. Solo admin, riesgo bajo.
- **Nota — patrón COALESCE:** `PUT /api/users/:id`, `/api/memberships/:id`, etc. usan `COALESCE($n, col)` → es imposible *limpiar* un campo (ponerlo a NULL) vía PUT. Probablemente intencional; anotado por si la UI lo necesita.

---

## Resumen ejecutivo

- **12 PUT con lógica** auditados (11 admin, 1–2 de usuario). Los dos flujos más críticos — `/classes/:id/cancel` y `/admin/orders/:id/verify` — están **bien hechos**: transacciones, `FOR UPDATE`, rollback completo (créditos/loyalty/rings), guards de idempotencia y notificaciones fire-and-forget fuera de la transacción. Buen patrón a replicar.
- **1 bug real (HIGH):** `PUT /api/admin/orders/:id/reject` puede rechazar una orden ya aprobada y dejar la membresía activa + mandar el WhatsApp equivocado. Falta guard de estado.
- **Top 3 a arreglar ya:**
  1. `H1` — guard de estado en `/admin/orders/:id/reject` (o rollback transaccional si se quiere "deshacer aprobación").
  2. `M1` — idempotencia + guard de estado en `/memberships/:id/activate` (hoy reenvía email/WA/wallet en cada click).
  3. `M3` — validar enum de `status` en `/memberships/:id` (replicar el patrón que ya usa el endpoint de events) y cota `>= 0` en `classes_remaining`.
- **Transversal:** `M6` (sin granularidad de roles — instructor/recepción pueden aprobar pagos y editar planes/membresías) y `L4` (varios catch sin logging) afectan a más endpoints que solo estos PUT.
