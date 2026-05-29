-- ─── Fix alta manual de clientas + listado de membresías ─────────────────────
-- Corrige 3 errores observados en producción:
--   1. users.phone NOT NULL bloquea el alta de clientas sin teléfono.
--   2. memberships.notes no existe (el código intenta insertar en esa columna).
--   3. enum membership_status no acepta "expiring" (estado calculado, no real).
-- Idempotente: se puede correr varias veces sin efecto secundario.
--
-- NOTA: en este proyecto las migraciones reales se aplican en el ARRANQUE del
-- servidor vía ensureSchema() (server/index.js). Los puntos 1 y 2 ya quedaron
-- ahí en el mismo cambio:
--   - users.phone DROP NOT NULL   (junto a los ALTER de users)
--   - memberships.notes TEXT      (junto a los ALTER de memberships)
-- El punto 3 es solo de código (filtro en GET /api/memberships).
-- Este archivo es un RESPALDO MANUAL: úsalo solo si quieres aplicar los
-- cambios directo a la BD (Supabase) sin esperar a un redeploy.

BEGIN;

-- 1. Permitir clientas sin teléfono ──────────────────────────────────────────
--   null value in column "phone" of relation "users" violates not-null constraint
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- 2. Agregar columna notes a memberships ──────────────────────────────────────
--   column "notes" of relation "memberships" does not exist
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS notes TEXT;

COMMIT;

-- 3. enum membership_status: "expiring" ──────────────────────────────────────
-- NO requiere cambio de esquema. "expiring" (por vencer) es un estado CALCULADO
-- (membresía 'active' que vence en ≤7 días), no un estado almacenable.
-- Se resolvió en el código: GET /api/memberships traduce el filtro a una
-- consulta por fecha en vez de pasarlo al enum. No se agrega 'expiring' al enum.
