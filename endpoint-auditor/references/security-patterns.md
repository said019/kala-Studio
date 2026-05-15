# Security patterns

Patrones recurrentes que aparecen una y otra vez en findings. Conócelos para detectarlos rápido y para escribir el fix correcto en `audit/findings.md`.

## 1. Tenant ID viene del cliente (Critical)

### Síntoma
```ts
// app/api/members/route.ts
export async function GET(req: NextRequest) {
  const gymId = req.nextUrl.searchParams.get('gymId')
  const members = await prisma.member.findMany({ where: { gymId } })
  return Response.json(members)
}
```

Cualquiera con un token válido puede listar miembros de cualquier gimnasio cambiando `?gymId=`. Cross-tenant leak.

### Fix
```ts
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const members = await prisma.member.findMany({
    where: { gymId: session.user.gymId }   // ← del JWT, no del cliente
  })
  return Response.json(members)
}
```

Si el usuario es legítimamente multi-gym (un dueño que opera varios), valida que `gymId` solicitado esté en `session.user.allowedGymIds`.

## 2. RLS apagada en tabla multi-tenant (Critical)

### Síntoma
```sql
CREATE TABLE members (
  id uuid primary key,
  gym_id uuid not null,
  name text,
  phone text
);
-- ¡Sin ENABLE ROW LEVEL SECURITY!
```

Si el anon key alcanza esta tabla, cualquiera con la URL pública del proyecto lee todos los miembros.

### Fix
```sql
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_tenant_isolation" ON members
  FOR ALL
  USING (gym_id = (auth.jwt() ->> 'gym_id')::uuid)
  WITH CHECK (gym_id = (auth.jwt() ->> 'gym_id')::uuid);
```

Verifica que tu JWT incluya `gym_id` como custom claim (en Supabase se hace con un trigger `on_auth_user_created` o con un hook).

## 3. Webhook sin verificación de firma (Critical)

### Síntoma
```ts
// app/api/webhooks/mercadopago/route.ts
export async function POST(req: Request) {
  const body = await req.json()
  if (body.action === 'payment.updated' && body.data.status === 'approved') {
    await prisma.payment.update({
      where: { mpId: body.data.id },
      data: { status: 'approved' }
    })
  }
  return new Response('OK')
}
```

Cualquiera con la URL del webhook puede marcar pagos como aprobados.

### Fix
```ts
import crypto from 'crypto'

export async function POST(req: Request) {
  const rawBody = await req.text()           // ← raw, no parsed
  const signature = req.headers.get('x-signature') ?? ''
  const requestId = req.headers.get('x-request-id') ?? ''

  // x-signature viene en formato: ts=<timestamp>,v1=<hash>
  const parts = Object.fromEntries(
    signature.split(',').map(p => p.split('='))
  )
  const ts = parts.ts
  const expectedHash = parts.v1

  const body = JSON.parse(rawBody)
  const manifest = `id:${body.data.id};request-id:${requestId};ts:${ts};`
  const computed = crypto
    .createHmac('sha256', process.env.MP_WEBHOOK_SECRET!)
    .update(manifest)
    .digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expectedHash))) {
    return new Response('Invalid signature', { status: 401 })
  }

  // Solo ahora procesa
}
```

Nota el `timingSafeEqual` — sin esto, hay timing attack para inferir el hash.

## 4. Monto del pago viene del cliente (Critical)

### Síntoma
```ts
export async function POST(req: Request) {
  const { amount, productId } = await req.json()
  const intent = await mercadopago.payment.create({ transaction_amount: amount, ... })
  return Response.json(intent)
}
```

Cliente envía `amount: 1` y compra una membresía de $1500.

### Fix
```ts
export async function POST(req: Request) {
  const { productId } = await req.json()
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
  // amount sale de la DB, jamás del cliente
  const intent = await mercadopago.payment.create({
    transaction_amount: product.price,
    external_reference: `${session.user.id}:${productId}:${Date.now()}`,
    ...
  })
  return Response.json(intent)
}
```

## 5. Doble cobro por falta de idempotencia (High)

### Síntoma
Usuario hace doble click en "Pagar". Se crean dos charges. Sin idempotency-key, ambos pasan.

### Fix
```ts
export async function POST(req: Request) {
  const idemKey = req.headers.get('idempotency-key')
  if (!idemKey) return new Response('Missing idempotency-key', { status: 400 })

  // Intenta crear el registro; si ya existe, devuelve el mismo resultado
  const existing = await prisma.paymentAttempt.findUnique({ where: { idemKey } })
  if (existing) return Response.json(existing.result)

  const result = await processPayment(...)

  await prisma.paymentAttempt.create({
    data: { idemKey, result, userId: session.user.id }
  })

  return Response.json(result)
}
```

## 6. SECURITY DEFINER sin tenant check (Critical)

### Síntoma
```sql
CREATE FUNCTION get_gym_revenue(p_gym_id uuid)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT sum(amount) FROM payments WHERE gym_id = p_gym_id
$$;
```

Esta función corre con privilegios del owner — *salta* RLS. Cualquiera puede llamarla con cualquier `gym_id`.

### Fix
```sql
CREATE OR REPLACE FUNCTION get_gym_revenue(p_gym_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_gym_id uuid;
BEGIN
  v_caller_gym_id := (auth.jwt() ->> 'gym_id')::uuid;
  IF v_caller_gym_id != p_gym_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN (SELECT sum(amount) FROM payments WHERE gym_id = p_gym_id);
END;
$$;
```

## 7. Service role key expuesta al cliente (Critical)

### Síntoma
```ts
// lib/supabase.ts
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE!   // ❌
)
```

Cualquier prefijo `NEXT_PUBLIC_` se incluye en el bundle del navegador.

### Fix
- Service role **solo** en código server-side, sin prefijo `NEXT_PUBLIC_`
- En cliente, solo el anon key
- Si el sistema necesita escalar privilegios desde el cliente, crea una route handler que verifica auth y entonces usa service role del lado del servidor

## 8. Stack trace expuesto (High)

### Síntoma
```ts
try { ... } catch (e) {
  return Response.json({ error: e }, { status: 500 })   // ← serializa el Error completo
}
```

Expone líneas, paths del filesystem, queries SQL.

### Fix
```ts
try { ... } catch (e) {
  console.error('[orders.create]', e)   // log full server-side
  const message = e instanceof KnownBusinessError ? e.message : 'Internal error'
  return Response.json({ error: message }, { status: 500 })
}
```

## 9. Trust en el header `Authorization` sin validación (Critical)

### Síntoma
```ts
const userId = req.headers.get('x-user-id')
// usa userId directo
```

Cualquiera manda `x-user-id: <victim>` y entra como víctima.

### Fix
Nunca confíes en un header que pueda venir del cliente. Saca el `userId` de:
- El JWT verificado server-side
- La sesión validada (`getServerSession`, `auth()`)
- Una llamada explícita a `supabase.auth.getUser(token)` que valida la firma

## 10. CORS abierto en endpoint autenticado (Critical)

### Síntoma
```ts
return Response.json(data, {
  headers: { 'Access-Control-Allow-Origin': '*' }
})
```

Combinado con cookies de auth → cualquier sitio en internet puede leer datos del usuario logueado.

### Fix
- Endpoints autenticados: CORS estricto, solo tu dominio
- Endpoints públicos: CORS abierto es OK
- Si necesitas múltiples dominios (multi-tenant con dominios custom), valida contra una whitelist en DB

## 11. Logs con PII en claro (Medium / LFPDPPP)

### Síntoma
```ts
console.log('Login attempt:', email, password)
console.log('User signup:', JSON.stringify(body))   // body incluye CURP, teléfono
```

Vercel/Datadog/Supabase logs persisten estos datos.

### Fix
```ts
console.log('Login attempt:', maskEmail(email))   // m***@example.com
console.log('User signup:', { id: body.id })       // solo el ID
```

Documenta qué se logea y qué no, y respeta el período de retención de logs.

## 12. JWT sin validar expiración (High)

### Síntoma
```ts
const decoded = jwt.decode(token)   // ❌ decode no verifica
```

`decode` NO valida firma ni expiración. Permite tokens robados o caducados.

### Fix
```ts
const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] })
```

Y mejor aún: usa la librería del proveedor (NextAuth, Supabase) que ya maneja esto correctamente.

## Resumen para el fix-up automático

Cuando detectes uno de estos patrones, escribe el finding con el snippet exacto del código vulnerable + el fix copy-paste-ready adaptado al framework detectado. Said implementa rápido cuando el fix está listo para pegar; reduce friction al máximo.
