# Discovery patterns por framework

Patrones exactos para encontrar endpoints en cada framework. Lee esto antes de Fase 1 si el script automático no detecta bien tu stack.

## Next.js 15 App Router (más común en este stack)

### Estructura

Cada archivo `app/**/route.{ts,js}` es un endpoint. El path se deriva de la ruta del archivo:

- `app/api/health/route.ts` → `/api/health`
- `app/api/gyms/[gymId]/members/route.ts` → `/api/gyms/:gymId/members`
- `app/api/(auth)/login/route.ts` → `/api/login` (grupos entre paréntesis no afectan el path)

### Detección

Buscar archivos:
```bash
find app -type f \( -name "route.ts" -o -name "route.js" -o -name "route.tsx" \) 2>/dev/null
```

Y dentro de cada archivo, los métodos HTTP son exports nombrados:
```bash
grep -E "^export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)" <file>
```

O en formato const:
```bash
grep -E "^export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*=" <file>
```

### Parámetros dinámicos

- `[gymId]` → `:gymId`
- `[...slug]` → `*slug` (catch-all)
- `[[...slug]]` → `*slug?` (optional catch-all)

### Middleware

Revisa `middleware.ts` en la raíz. Aplica antes que `route.ts`. Suele hacer la auth.

## Next.js Pages Router (legacy)

Archivos en `pages/api/**/*.{ts,js}`. El `default export` maneja todos los métodos; suele haber un `switch(req.method)` adentro.

```bash
find pages/api -type f \( -name "*.ts" -o -name "*.js" \) 2>/dev/null
```

Para extraer métodos soportados, busca dentro:
```bash
grep -E "req\.method\s*===\s*['\"](GET|POST|PUT|PATCH|DELETE)" <file>
```

## Fastify (Pollón SJR usa esto)

### Patrones de registro

```ts
fastify.get('/orders', handler)
fastify.post('/orders/:id/pay', { schema, preHandler }, handler)
server.route({ method: 'POST', url: '/webhook', handler })
```

### Detección

```bash
grep -rEn "fastify\.(get|post|put|patch|delete|head|options|all)\(" src/ routes/ api/ 2>/dev/null
grep -rEn "(server|app)\.route\(\{" src/ routes/ api/ 2>/dev/null
```

Si los handlers están agrupados con `register`, sigue el archivo del plugin:
```bash
grep -rEn "fastify\.register\(" src/ 2>/dev/null
```

### Schema validation

Fastify valida con JSON Schema en el segundo argumento. Si lo tiene, el endpoint está validado. Si no, está crudo.

## Express

```bash
grep -rEn "(app|router)\.(get|post|put|patch|delete|all|use)\(['\"]" src/ routes/ 2>/dev/null
```

Express mete la auth con `app.use(middleware)` antes de los routers. Trackea qué middleware corre para cada path.

## Supabase

### Edge Functions

```bash
find supabase/functions -name "index.ts" 2>/dev/null
```

Cada carpeta dentro de `supabase/functions/` es una edge function. El path público es `https://<project>.supabase.co/functions/v1/<folder-name>`.

### RPC (Postgres functions)

```bash
grep -rEn "CREATE\s+(OR\s+REPLACE\s+)?FUNCTION" supabase/migrations/ db/ 2>/dev/null
```

Las funciones marcadas con `SECURITY DEFINER` se ejecutan con permisos del owner — son las más peligrosas y deben auditarse con extra cuidado. Bandera roja si una función `SECURITY DEFINER` no valida el `auth.uid()` o el tenant del caller adentro.

### Tablas expuestas vía PostgREST

Cualquier tabla con RLS activa y policies se vuelve un endpoint automático en `/rest/v1/<table>`. Lista las tablas:

```bash
grep -rEn "CREATE TABLE" supabase/migrations/ db/ 2>/dev/null
grep -rEn "ENABLE ROW LEVEL SECURITY" supabase/migrations/ 2>/dev/null
```

Si una tabla **no** tiene RLS habilitada pero es accesible via anon key, es un leak. Bandera roja inmediata.

## Webhooks recibidos de terceros

Estos son endpoints normales pero entrantes desde servicios externos. Búscalos por strings:

```bash
grep -rEn -i "(mercadopago|mp[._-]?webhook|stripe[._-]?webhook|totalpass|wellhub|gympass|evolution[._-]?webhook|whatsapp[._-]?webhook|twilio[._-]?webhook|apns|fcm|googlewallet|passkit)" app/ pages/ src/ 2>/dev/null
```

Cada uno necesita verificación de firma específica. Ver `security-patterns.md`.

## Server actions de Next.js (también son endpoints)

Las server actions (`'use server'`) son endpoints internos accesibles vía POST con un payload codificado. Búscalas:

```bash
grep -rEn "'use server'" app/ src/ 2>/dev/null
```

No son tan auditables externamente, pero merecen aparecer en el inventario porque pueden ser invocadas con curl si se conoce el ID de la action.

## tRPC

Si encuentras `trpc/router` o `appRouter`:

```bash
grep -rEn "\.(query|mutation|subscription)\(" src/server/ src/trpc/ 2>/dev/null
```

Cada query/mutation es un endpoint accesible en `/api/trpc/<router>.<procedure>`.

## NestJS

```bash
grep -rEn "@(Get|Post|Put|Patch|Delete|All|Options|Head)\(" src/ 2>/dev/null
grep -rEn "@Controller\(" src/ 2>/dev/null
```

El path completo es `Controller path` + `decorator path`.

## Apple Wallet / Google Wallet endpoints requeridos

Si el proyecto usa pases, Apple **requiere** estos endpoints en el servidor web del pase:

- `GET /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}` — listar pases registrados
- `POST /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}` — registrar device
- `DELETE /v1/devices/{deviceLibraryIdentifier}/registrations/{passTypeIdentifier}/{serialNumber}` — desregistrar
- `GET /v1/passes/{passTypeIdentifier}/{serialNumber}` — descargar pase actualizado
- `POST /v1/log` — Apple manda logs aquí cuando un pase falla

Si faltan, los pases dejan de actualizarse silenciosamente en los devices. Esto es un finding **High** en cualquier sistema que use Wallet.
