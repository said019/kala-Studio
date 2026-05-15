# Audit checklist

Checklist exhaustivo. Cada item tiene severidad. Aplica los chequeos a cada endpoint del inventario y genera un finding por cada violación.

## Severidades

- **Critical** — Permite bypass de auth, leak de datos entre tenants, RCE, o exposición de secrets
- **High** — Puede causar downtime, pérdida de datos, fraude financiero, o violación de LFPDPPP
- **Medium** — Degrada UX, abre vectores de abuso, viola best practices fuertes
- **Low** — Inconsistencia, falta de hardening, mejoras de DX

## 1. Autenticación

| Check | Severidad |
|---|---|
| Endpoint que toca DB sin verificar sesión | Critical |
| Endpoint que confía en un user_id pasado en el body en vez del JWT | Critical |
| JWT verificado sin validar expiración | High |
| Endpoints de admin sin role check (solo verifican que esté logueado) | Critical |
| Service role key de Supabase usada en cliente o expuesta a navegador | Critical |
| Token de Bearer comparado con `===` sin timing-safe-compare | Medium |

### Cómo detectar

Buscar en cada handler:
```bash
# ¿Hay alguna llamada de auth antes de tocar prisma/supabase?
grep -B 2 -E "(prisma\.|supabase\.from|\.rpc\()" <file>
```

Si la primera referencia a DB ocurre antes que cualquier `getServerSession`, `auth()`, `getUser()`, `verifyJwt` — es un finding.

## 2. Tenant isolation (multi-tenant)

Crítico para WalletClub, FisioAll, y cualquier SaaS multi-tenant.

| Check | Severidad |
|---|---|
| Query a Prisma/Supabase sin filtro de tenant cuando la tabla es multi-tenant | Critical |
| Tenant ID viene del query/body en vez del JWT/sesión | Critical |
| Tabla con datos multi-tenant sin RLS habilitada en Supabase | Critical |
| Policy de RLS que se evalúa siempre `true` o usa `auth.role() = 'authenticated'` sin checar tenant | Critical |
| Endpoint que retorna lista sin paginación (potencial leak masivo) | Medium |

### Patrón seguro

```ts
// ❌ MAL
const gymId = req.body.gymId
const members = await prisma.member.findMany({ where: { gymId } })

// ✅ BIEN
const session = await getServerSession(authOptions)
const gymId = session.user.gymId   // viene del JWT
const members = await prisma.member.findMany({ where: { gymId } })
```

## 3. Validación de input

| Check | Severidad |
|---|---|
| Body deserializado sin Zod/Joi/Yup | High |
| Query params usados directamente en queries SQL (incluso vía Prisma raw) | Critical |
| `JSON.parse` sobre input sin try/catch | Medium |
| Upload de archivo sin verificar `Content-Type` y tamaño | High |
| Email/teléfono sin validación de formato antes de mandar OTP/WhatsApp | Medium |
| Parámetros numéricos sin coerción (`parseInt` ausente) | Low |

## 4. Webhooks entrantes

Cada webhook recibido **debe** verificar la firma del emisor. Patrones por proveedor:

### MercadoPago
- Header: `x-signature` (formato `ts=...,v1=...`)
- Algoritmo: HMAC-SHA256 sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con la secret del webhook
- Si no se verifica → **Critical** (cualquiera puede fingir pagos completados)

### Stripe
- Header: `stripe-signature`
- SDK: `stripe.webhooks.constructEvent(body, sig, endpointSecret)`
- Body debe ser **raw**, no parsed. Si parsearon a JSON antes de verificar, la firma falla siempre → bug que esconden con `try/catch` y procesan sin verificar → **Critical**

### Evolution API (WhatsApp)
- No tiene firma estándar; usar IP whitelist o un token compartido en header
- Si está abierto al mundo sin ningún control → **High**

### TotalPass / Wellhub / Gympass
- Usualmente header `X-Hub-Signature` con HMAC-SHA1 sobre el body
- Si no se verifica → **Critical** (alguien puede meter check-ins falsos y vaciar tu billing)

### Apple Push (APNs feedback)
- No aplica firma; valida por mTLS con el cert del push topic

## 5. Manejo de errores

| Check | Severidad |
|---|---|
| Stack trace expuesto en respuesta de producción | High |
| Mensaje de error que filtra estructura de DB (`"column X of relation Y..."`) | Medium |
| `console.error` con objetos completos incluyendo PII | Medium (LFPDPPP) |
| Sin `try/catch` → 500 sin contexto al cliente | Medium |
| Mismo status 200 para éxito y error (anti-patrón) | High |
| Error de DB devuelto como 200 con `{error: "..."}` (cliente no sabe que falló) | Medium |

## 6. Rate limiting

Endpoints que **deben** tener rate limit:

- `POST /auth/login` — 5/min por IP, 10/hora por email
- `POST /auth/signup` — 3/hora por IP
- `POST /auth/password-reset` — 3/hora por email
- `POST /otp/send` — 3/hora por teléfono
- `GET /search` o búsquedas públicas — 30/min
- Cualquier endpoint que mande WhatsApp/SMS (cuesta dinero) — 10/min
- Endpoints públicos que tocan APIs externas pagas

Sin rate limit en estos → **High**

## 7. Idempotencia

| Endpoint tipo | Necesita idempotency-key |
|---|---|
| `POST /payments` o `POST /charges` | Sí — alto riesgo de doble cobro |
| `POST /orders` | Sí |
| `POST /subscriptions` | Sí |
| `POST /memberships/activate` | Sí |
| `POST /webhooks/*` | El handler debe ser idempotente por sí mismo (mismo event_id procesado 2 veces = no-op) |
| `PUT /resource/:id` | Naturalmente idempotente, pero verifica que sea verdad |

Sin idempotency en POST de pagos → **High**.

## 8. Timeouts y circuit breakers

| Check | Severidad |
|---|---|
| `fetch()` a API externa sin `AbortController` y timeout | Medium |
| SDK de MercadoPago/Stripe sin timeout configurado | Medium |
| Evolution API call sin timeout (WhatsApp puede quedarse colgado) | High |
| Retry sin backoff exponencial | Medium |
| Retry sin límite de intentos | High |

## 9. Headers de seguridad

Para endpoints que sirven HTML o JSON al navegador:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: <restrictiva>
```

CORS:
- `Access-Control-Allow-Origin: *` en endpoint autenticado → **Critical** (CSRF + leak)
- CORS reflejando arbitrariamente cualquier origin → **High**

## 10. PII / LFPDPPP

Aplica a cualquier endpoint que maneje datos de clientes:

| Check | Severidad |
|---|---|
| Endpoint que retorna teléfono/email/CURP/RFC sin que el usuario sea el dueño o admin | High |
| Logs con PII en claro (revisar Vercel logs, Supabase logs) | High |
| No hay endpoint para que el usuario exporte sus datos (ARCO acceso) | High |
| No hay endpoint para que el usuario borre sus datos (ARCO cancelación) | High |
| Consentimientos no auditables (sin tabla de consents con timestamp) | Medium |
| Datos sensibles (mental health para FisioAll) sin encriptación at-rest | High |

## 11. Pagos y billing

Específico para sistemas con MercadoPago / Stripe Connect:

| Check | Severidad |
|---|---|
| Monto del pago viene del cliente en vez de calcularse en el servidor | Critical |
| Webhook de pago confirmado no verifica que el `external_reference` exista en tu DB | High |
| `application_fee` no validado contra configuración del tenant | High |
| Refunds sin audit log con quién, cuándo, por qué | High |
| Status del pago no se reconcilia con la API del provider (solo confías en el webhook) | Medium |

## 12. Apple/Google Wallet

| Check | Severidad |
|---|---|
| Endpoint de descarga de pase sin verificar que el usuario sea dueño | Critical |
| `passTypeIdentifier` o `serialNumber` no validados | High |
| Push update mandando datos de otros usuarios por error de scope | Critical |
| Endpoint `/v1/log` no implementado → no hay manera de saber por qué fallan pases | Medium |

## Cómo reportar findings

Cada finding va a `audit/findings.md` con este formato:

```markdown
### [Severidad] Título corto

**Endpoint**: `METHOD /path`
**Archivo**: `app/api/.../route.ts:42`
**Riesgo**: Explicación de qué pasa si se explota.
**Evidencia**: Snippet del código vulnerable.
**Fix**: Snippet copy-paste-ready del código corregido.
```

Ordena por severidad descendente. Critical primero, Low al final.
