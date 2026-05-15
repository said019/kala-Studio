# Endpoints recomendados (catálogo)

Catálogo organizado por dominio. Compara el inventario contra esto y reporta lo que falte en `audit/recommendations.md`.

Cada endpoint incluye **por qué importa** y un esqueleto base. Adáptalo al framework detectado.

## Health & observability

### `GET /api/health`
**Por qué**: Vercel/Railway/uptime monitors necesitan un endpoint barato para alertar. Sin esto, te enteras de downtime por WhatsApp del cliente.
**Prioridad**: P0

```ts
// app/api/health/route.ts
export async function GET() {
  return Response.json({ status: 'ok', timestamp: Date.now() })
}
```

### `GET /api/health/db`
**Por qué**: Detecta si Supabase está caído antes que los usuarios. Mide latencia de la query más simple posible.
**Prioridad**: P0

```ts
export async function GET() {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({ status: 'ok', latency_ms: Date.now() - start })
  } catch (e) {
    return Response.json({ status: 'error', error: String(e) }, { status: 503 })
  }
}
```

### `GET /api/health/external`
**Por qué**: Pinguea cada dependencia externa (MercadoPago, Evolution, Apple APNs, Google Wallet) y reporta cuál está caída. Te ahorra debug a las 2 AM.
**Prioridad**: P1

### `GET /api/version`
**Por qué**: Saber qué commit/build está en prod sin pedirle al cliente que abra devtools. Útil para confirmar deploys.
**Prioridad**: P2

```ts
export async function GET() {
  return Response.json({
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    deployedAt: process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE,
    branch: process.env.VERCEL_GIT_COMMIT_REF,
  })
}
```

## Recovery flows (auth)

### `POST /api/auth/password-reset/request`
**Por qué**: Sin esto, usuarios bloqueados te escriben por WhatsApp. Mata productividad.
**Prioridad**: P0

### `POST /api/auth/password-reset/confirm`
**Por qué**: Token verificado server-side, expira en 1h, single-use.
**Prioridad**: P0

### `POST /api/auth/email-verify/send`
### `POST /api/auth/email-verify/confirm`
**Por qué**: Sin email verificado, los recovery flows son fáciles de exploit.
**Prioridad**: P1

### `POST /api/auth/magic-link`
**Por qué**: En sistemas con usuarios poco tech-savvy (clientes de spa, gimnasios), reduce fricción enormemente. Pao Ríos de Kaya Kalp es buen caso.
**Prioridad**: P1

### `GET /api/auth/session`
**Por qué**: El cliente necesita saber si la sesión sigue válida sin tener que pegar a un endpoint protegido y manejar 401.
**Prioridad**: P1

### `POST /api/auth/logout`
**Por qué**: Invalidar refresh token server-side, no solo borrar cookie.
**Prioridad**: P1

## Membership / subscription lifecycle (WalletClub)

### `POST /api/memberships/activate`
**Por qué**: Activación manual cuando el cobro fue offline. Necesita audit log de quién activó.
**Prioridad**: P0

### `POST /api/memberships/{id}/pause`
### `POST /api/memberships/{id}/resume`
**Por qué**: Pause/resume es operación común en pilates/gym. Sin estos endpoints, el admin lo hace por SQL y se descuadra el billing.
**Prioridad**: P1

### `POST /api/memberships/{id}/cancel`
**Por qué**: Cancelación con razón (capturada), fecha efectiva, y posible refund prorrateado.
**Prioridad**: P1

### `GET /api/memberships/{id}/usage`
**Por qué**: "Cuántas clases me quedan este mes". Cliente puede consultarlo sin spam al admin.
**Prioridad**: P1

### `POST /api/subscriptions/sync`
**Por qué**: Reconciliar estado local con el provider (Stripe/MercadoPago). Corre como cron o se llama bajo demanda.
**Prioridad**: P1

## Pagos

### `POST /api/payments/intent`
**Por qué**: Crear intent server-side con monto calculado server-side. El cliente nunca debería decir cuánto pagar.
**Prioridad**: P0

### `POST /api/payments/{id}/refund`
**Por qué**: Refunds parciales o totales, con audit log obligatorio.
**Prioridad**: P0

### `POST /api/payments/reconcile`
**Por qué**: Job nocturno o on-demand. Lista pagos en estado pendiente >24h, los consulta en MP/Stripe, actualiza estado. Salva ventas perdidas por webhooks que no llegaron.
**Prioridad**: P0

### `GET /api/payments/{id}/receipt`
**Por qué**: Genera PDF/HTML del recibo. Necesario para LFPDPPP y para clientes que piden factura/comprobante.
**Prioridad**: P1

## Webhooks (recibidos)

Por cada webhook entrante, agrega también:

### `GET /api/webhooks/{provider}/logs`
**Por qué**: Auditar webhooks recibidos cuando algo se descuadra. Sin esto, "no me llegó el pago" es imposible de debuggear.
**Prioridad**: P0

```ts
// Tabla webhook_events (event_id unique, provider, payload jsonb, received_at, processed_at, status)
// El endpoint solo lee con paginación + filtro por provider y status
```

### `POST /api/webhooks/{provider}/replay/{event_id}`
**Por qué**: Re-procesar un webhook que falló por bug, race condition, o downtime.
**Prioridad**: P1

### `GET /api/webhooks/dead-letter`
**Por qué**: Listar eventos que fallaron 3+ veces y necesitan intervención manual.
**Prioridad**: P1

## Wallet (Apple/Google)

### `GET /api/wallet/v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}`
### `POST /api/wallet/v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}`
### `DELETE /api/wallet/v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}`
### `GET /api/wallet/v1/passes/{passTypeIdentifier}/{serialNumber}`
### `POST /api/wallet/v1/log`

**Por qué**: Apple los **requiere** para que los pases se actualicen en el device. Sin estos, los pases dejan de refrescar push notifications y los clientes no ven sus sellos/membresías al día.
**Prioridad**: P0 si hay pases Apple en el sistema, P3 si no.

### `POST /api/wallet/passes/issue`
### `GET /api/wallet/passes/{serial}/download`
### `POST /api/wallet/passes/{serial}/push`
**Por qué**: Endpoints internos para emitir, descargar, y forzar push update de pases.
**Prioridad**: P1

## Admin / soporte

### `POST /api/admin/impersonate/{userId}`
**Por qué**: Soporte real necesita "ver lo que ve el cliente". Debe loggear quién impersonó a quién y cuándo. Session corta (max 1h), no extiende al refresh.
**Prioridad**: P1

### `GET /api/admin/audit-log`
**Por qué**: Toda acción destructiva o de admin queda registrada. Imprescindible para LFPDPPP y para postmortems.
**Prioridad**: P0

### `POST /api/admin/users/{id}/recover`
**Por qué**: Reactivar cuenta borrada por error dentro de la ventana de retención.
**Prioridad**: P2

## LFPDPPP / ARCO

Obligatorio en México para cualquier sistema con PII.

### `GET /api/me/export`
**Por qué**: Derecho de acceso. El usuario descarga todos sus datos en JSON/CSV.
**Prioridad**: P0

### `POST /api/me/delete`
**Por qué**: Derecho de cancelación. Borrado lógico inmediato + borrado físico tras período legal (usualmente 30-180 días).
**Prioridad**: P0

### `POST /api/me/correct`
**Por qué**: Derecho de rectificación. El usuario corrige datos suyos sin pasar por soporte.
**Prioridad**: P1

### `GET /api/me/consents`
### `POST /api/me/consents`
**Por qué**: Lista y actualiza los consentimientos (marketing, cookies, datos sensibles). Auditable con timestamp.
**Prioridad**: P0

## Multi-tenant operations

### `POST /api/tenants/{id}/transfer-owner`
**Por qué**: Cambiar dueño de un gym/estudio sin tocar SQL. Audit log obligatorio.
**Prioridad**: P2

### `GET /api/tenants/{id}/billing`
**Por qué**: Dueño de tenant ve su billing (subscriptions, application_fee, próximo cobro).
**Prioridad**: P1

### `POST /api/tenants/{id}/invite`
### `DELETE /api/tenants/{id}/members/{userId}`
**Por qué**: Onboarding y offboarding de miembros del staff de un tenant.
**Prioridad**: P1

## Citas / scheduling (FisioAll, Catarsis, Venus)

### `GET /api/availability`
**Por qué**: Calcular slots libres considerando terapeuta + sala + horario. Sin esto cada cliente intenta agendar y se topa con conflictos.
**Prioridad**: P0

### `POST /api/appointments/{id}/confirm`
### `POST /api/appointments/{id}/cancel`
### `POST /api/appointments/{id}/reschedule`
**Por qué**: Flujos disparados desde WhatsApp (Evolution API). Cada uno debe ser idempotente para tolerar mensajes duplicados.
**Prioridad**: P0

### `POST /api/appointments/{id}/no-show`
**Por qué**: Marcar no-show penaliza el depósito ($200 stored credit en Kaya Kalp). Sin esto se hace manual.
**Prioridad**: P1

## Comunicación (WhatsApp / Email)

### `POST /api/messages/whatsapp/send`
**Por qué**: Endpoint interno con rate limit propio. Centraliza el envío para tener logs y poder migrar de Evolution a otro proveedor sin tocar el resto.
**Prioridad**: P1

### `GET /api/messages/queue`
### `POST /api/messages/queue/retry`
**Por qué**: Ver mensajes pendientes y reintentar fallidos.
**Prioridad**: P2

## Reportes / exports

### `POST /api/reports/generate`
### `GET /api/reports/{id}/status`
### `GET /api/reports/{id}/download`
**Por qué**: Reportes grandes (corte mensual, lista de clientes activos) no pueden ser síncronos. Patrón async con job queue.
**Prioridad**: P2

## Feature flags / kill switches

### `GET /api/flags`
**Por qué**: El cliente lee qué features tiene habilitadas sin hardcodear.
**Prioridad**: P2

### `POST /api/admin/kill-switch/{feature}`
**Por qué**: Apagar rápido un módulo si rompe en prod, sin redeploy.
**Prioridad**: P1

---

## Cómo escribir las recomendaciones

Para cada endpoint que falte, escribe en `audit/recommendations.md`:

```markdown
### [Prioridad] METHOD /path

**Contexto detectado**: <referencia al hallazgo concreto en el sistema, ej. "Vi 3 endpoints de pagos sin endpoint de reconciliación; cuando un webhook se pierde no hay recuperación.">

**Por qué importa aquí**: <específico, no genérico>

**Esqueleto sugerido**:
\`\`\`ts
// código copy-paste-ready en el framework detectado
\`\`\`

**Cambios adicionales**:
- DB: migración necesaria
- Env vars necesarias
- Cron/job a configurar
```

No propongas endpoints que ya existan en el inventario (revísalo dos veces antes de listar). Tampoco propongas todo el catálogo de golpe — prioriza por riesgo real para *este* sistema.
