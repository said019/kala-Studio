---
name: endpoint-auditor
description: Auditoría completa de endpoints/APIs en producción para sistemas Next.js, Fastify, Supabase, Prisma y similares. Descubre todos los endpoints del codebase, construye un inventario completo (path map), audita cada uno contra producción para detectar fallas (status codes, latencia, auth, RLS, webhook signatures, validación de input, manejo de errores, idempotencia), y propone endpoints faltantes para mejorar resiliencia (health checks, recovery flows, observabilidad, admin tools, webhooks). Usa esta skill SIEMPRE que el usuario mencione "auditar endpoints", "audit API", "verificar que no falle en prod", "smoke test", "endpoint health check", "qué endpoints me faltan", "API audit", "revisar mis rutas", "test de producción", o cuando pida revisar la salud, seguridad o cobertura de un backend/API en general — aunque no use la palabra exacta "auditoría".
---

# Endpoint Auditor

Skill para auditar APIs en producción. Descubre los endpoints del codebase, construye un inventario (path map), los prueba contra el entorno de producción, y propone endpoints faltantes que prevengan fallas futuras.

Diseñada para stacks típicos de SaaS multi-tenant: **Next.js 15 App Router**, **Fastify**, **Supabase + PostgreSQL + RLS**, **Prisma**, integraciones con **MercadoPago**, **Stripe Connect**, **Evolution API (WhatsApp)**, **Apple/Google Wallet**, y webhooks de terceros (TotalPass, Wellhub).

## Filosofía

Una auditoría completa cubre cuatro fases en orden. **No saltes fases** — cada una alimenta la siguiente:

1. **Discovery** — Encontrar todos los endpoints del codebase
2. **Inventory** — Construir el path map con metadata por endpoint
3. **Audit** — Probar cada endpoint contra producción y verificar criterios de salud
4. **Recommendations** — Proponer endpoints faltantes para resiliencia, seguridad y observabilidad

Antes de empezar, pregunta brevemente al usuario:
- ¿Cuál es la URL base de producción? (ej. `https://wallet.club`)
- ¿Tiene un archivo `.env.production` o variables con tokens de prueba seguros? (NUNCA usar tokens de admin reales)
- ¿Hay endpoints destructivos (DELETE, payments) que deben excluirse del audit activo?
- ¿Quiere un audit pasivo (solo análisis estático) o activo (hace requests reales)?

Si el usuario no responde, asume audit pasivo + un subconjunto de endpoints GET seguros para el audit activo.

## Fase 1 — Discovery

Antes de escanear, lee `references/discovery-patterns.md` para conocer los patrones exactos por framework. Es crítico porque cada framework esconde endpoints en lugares distintos (App Router vs Pages, decorators de Fastify, RPCs de Supabase).

Resumen ejecutable:

```bash
# Ejecuta el discovery script — auto-detecta el stack
bash scripts/discover.sh > /tmp/endpoints-raw.txt
```

El script busca:
- **Next.js App Router**: `app/**/route.{ts,js}` y extrae los exports `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`
- **Next.js Pages**: `pages/api/**/*.{ts,js}`
- **Fastify**: invocaciones `fastify.{get,post,put,delete}` y `server.route({...})`
- **Express**: `app.{get,post,...}` y `router.{get,...}`
- **Supabase**: funciones RPC en `supabase/migrations/**/*.sql` (`CREATE FUNCTION ... RETURNS`)
- **Edge functions**: `supabase/functions/*/index.ts`
- **Webhooks recibidos**: busca strings como `mercadopago`, `totalpass`, `wellhub`, `stripe`, `webhook` en archivos de rutas

Si el script no detecta nada (proyecto con estructura inusual), cae a búsqueda manual con `grep` por patrones del framework correspondiente y documenta lo que encuentres.

**Output esperado**: lista plana de endpoints con su archivo origen y método HTTP.

## Fase 2 — Inventory (Path Map)

Para cada endpoint descubierto, lee el archivo y extrae:

| Campo | Cómo extraerlo |
|---|---|
| `method` | Del export en App Router, o de la invocación |
| `path` | De la ubicación del archivo (App Router) o del primer arg |
| `auth` | Buscar `getServerSession`, `supabase.auth.getUser()`, `Bearer`, middleware aplicado |
| `tenant_scope` | Buscar `gym_id`, `org_id`, `studio_id` en query/body/JWT |
| `input_schema` | Si usa Zod (`z.object`), capturar el shape; si no, anotar `unvalidated` |
| `db_operations` | Buscar llamadas `prisma.*`, `supabase.from(...)`, `.rpc(...)` |
| `external_calls` | `fetch(`, `axios.`, SDK calls (MercadoPago, Stripe, Evolution) |
| `side_effects` | Envío de email/WhatsApp, generación de pases Wallet, escrituras a Storage |
| `error_handling` | `try/catch` presente? `NextResponse.json({error})` consistente? |
| `idempotent` | Sí para GET; para POST/PUT verificar idempotency-key, unique constraints, upserts |
| `is_webhook` | True si recibe de terceros — flag para verificar signature |

Guarda el inventario en `audit/inventory.json` siguiendo el schema de `assets/inventory-template.md`.

Luego genera `audit/inventory.md` (versión humana del path map) con tabla agrupada por dominio (auth, pagos, citas, wallet, webhooks, admin, …).

## Fase 3 — Audit

Lee `references/audit-checklist.md` para el detalle de cada chequeo. Los chequeos se dividen en **estáticos** (análisis del código) y **dinámicos** (requests reales contra producción).

### Chequeos estáticos (siempre se corren)

Para cada endpoint en el inventario, evalúa:

- **Auth**: ¿Verifica sesión antes de tocar la DB? ¿O confía ciegamente en el body?
- **Tenant isolation**: ¿Filtra por `gym_id` / `org_id` antes de leer/escribir? Si usa Supabase, ¿hay RLS en la tabla además del filtro app-level?
- **Validación de input**: ¿Hay Zod/Joi/Yup? Los endpoints sin validación son flag rojo automático.
- **Webhook signature**: Para webhooks entrantes (MercadoPago, Stripe, TotalPass), ¿verifica HMAC/firma antes de procesar?
- **Manejo de errores**: ¿`try/catch` con respuesta uniforme? ¿Filtra mensajes sensibles? (no exponer stack traces, queries SQL, secrets)
- **Logging**: ¿Logea errores? ¿Logea sin filtrar PII (LFPDPPP, emails, teléfonos)?
- **Rate limiting**: Endpoints públicos sensibles (login, signup, password reset, búsqueda) deben tenerlo
- **Idempotencia**: Endpoints de pagos y creación de recursos deben aceptar idempotency-key
- **Timeouts**: Llamadas a APIs externas (Evolution, MercadoPago) tienen timeout configurado?
- **Secrets en código**: Grep por `sk_`, `whsec_`, `eyJ`, `mp_`, `APP_USR-` directamente en código fuente

### Chequeos dinámicos (si el usuario autorizó audit activo)

Genera y ejecuta `scripts/audit_runner.py`:

```bash
python scripts/audit_runner.py \
  --inventory audit/inventory.json \
  --base-url <PROD_URL> \
  --env-file .env.audit \
  --output audit/results.json \
  --safe-mode   # excluye DELETE, payments, y POSTs marcados como destructivos
```

Para cada endpoint el runner verifica:

- **Status code** — los GET sin auth deben dar 200/204 con datos válidos, los protegidos 401/403 sin token
- **Latencia P50/P95** — flag si > 1s para reads, > 3s para writes
- **Schema de respuesta** — si hay un schema esperado, valida; si no, captura una muestra
- **Headers de seguridad** — `Strict-Transport-Security`, `X-Content-Type-Options`, `Content-Security-Policy`
- **CORS** — ¿`Access-Control-Allow-Origin: *` en endpoints autenticados? (flag rojo)
- **Error path** — manda inputs malformados a propósito (a endpoints idempotentes) y verifica que responda 4xx, no 500
- **Tenant cross-leak** — si el usuario provee dos tokens de tenants distintos, intenta acceder a recursos del tenant A con token de B; debe dar 403/404
- **Webhook replay** — si hay webhooks expuestos, verifica que rechacen sin firma o con firma vieja

> **Importante**: el audit dinámico jamás manda requests destructivas a producción salvo permiso explícito del usuario, y aún así prefiere un entorno de staging si existe. Pregunta antes de mandar cualquier POST/PUT/DELETE.

## Fase 4 — Recommendations

Lee `references/recommended-endpoints.md` para el catálogo completo. La idea es comparar el inventario contra el catálogo y reportar lo que falta.

Las categorías a revisar siempre:

- **Health & observability** — `/api/health`, `/api/health/db`, `/api/health/external` (verifica MercadoPago, Evolution, Supabase ping)
- **Recovery flows** — `password-reset/request`, `password-reset/confirm`, `email-verify`, `magic-link`, `account-recovery`
- **Wallet/pass lifecycle** — `wallet/register-device`, `wallet/unregister-device`, `wallet/passes/{id}`, `wallet/log` (Apple lo requiere)
- **Webhook reliability** — `webhooks/replay`, `webhooks/dead-letter`, registro de webhooks recibidos para auditoría posterior
- **Admin / soporte** — `admin/users/impersonate` (con audit log), `admin/refunds`, `admin/audit-log`
- **Idempotencia y reconciliación** — `payments/reconcile`, `subscriptions/sync`
- **Backups y exports (LFPDPPP)** — `me/export` (derecho ARCO de acceso), `me/delete` (derecho ARCO de cancelación)
- **Rate limit recovery** — `auth/lockout-status`, captcha challenge
- **Multi-tenant operations** — `tenants/{id}/transfer`, `tenants/{id}/merge`

Para cada endpoint propuesto que falte, escribe en `audit/recommendations.md`:
- Path sugerido
- Por qué importa para *este* sistema (no genérico, sino referenciando el contexto detectado)
- Prioridad (P0 crítico, P1 importante, P2 nice-to-have)
- Esqueleto de implementación copy-paste-ready en el framework detectado

## Output final

Al terminar, presenta al usuario tres archivos en la carpeta `audit/`:

1. **`audit/inventory.md`** — Path map completo (tabla agrupada por dominio)
2. **`audit/findings.md`** — Hallazgos de la auditoría priorizados por severidad (Critical → High → Medium → Low), con archivo y línea afectada, descripción del riesgo, y fix sugerido en código
3. **`audit/recommendations.md`** — Endpoints faltantes con esqueletos listos para implementar

Cierra con un resumen ejecutivo de 5-10 líneas: cuántos endpoints, cuántos findings por severidad, top 3 cosas urgentes a arreglar, top 3 endpoints a agregar.

## Modo iterativo

Si el usuario solo quiere una fase, ofrece correr esa fase aislada:
- "Solo el discovery" → corre Fase 1 + 2 y para
- "Solo proponme endpoints faltantes" → corre Fase 1 + 2 + 4 (sin audit activo)
- "Audita solo el módulo de pagos" → filtra el inventario antes de la Fase 3

## Referencias

- `references/discovery-patterns.md` — Patrones de discovery por framework
- `references/audit-checklist.md` — Checklist exhaustivo de auditoría
- `references/recommended-endpoints.md` — Catálogo de endpoints recomendados por dominio
- `references/security-patterns.md` — Patrones de seguridad multi-tenant y LFPDPPP

## Scripts

- `scripts/discover.sh` — Auto-detección de endpoints
- `scripts/audit_runner.py` — Runner de chequeos dinámicos
- `scripts/generate_report.py` — Genera los .md finales desde el JSON
