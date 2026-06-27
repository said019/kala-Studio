-- ============================================================================
-- FIX INMEDIATO PARA PRODUCCIÓN (Railway) — Kala Studio
-- Correr en la consola SQL de la base Postgres de Railway.
-- El PASO 1 arregla el check-in/QR AL INSTANTE (sin esperar redeploy).
-- ============================================================================

-- ── PASO 1: arreglar el check-in roto (ring_states.constancia_goal NOT NULL) ──
-- Causa: si la clienta no tiene membresía activa hoy, el SELECT INTO de la
-- función no devuelve fila y deja los *_goal en NULL, violando NOT NULL al
-- insertar en ring_states -> el check-in truena con 500.
-- Este CREATE OR REPLACE agrega la guarda COALESCE que faltaba. Es seguro:
-- solo redefine la función; el trigger trg_bookings_recalculate_kala_rings
-- la sigue usando sin recrearse.

CREATE OR REPLACE FUNCTION recalculate_kala_rings_on_checkin()
RETURNS TRIGGER AS $$
DECLARE
  v_week_start DATE;
  v_membership_id UUID;
  v_constancia_goal INTEGER := 1;
  v_esfuerzo_goal INTEGER := 1;
  v_conexion_goal INTEGER := 10;
  v_intensity TEXT := '';
  v_esfuerzo_increment INTEGER := 0;
BEGIN
  IF NEW.checked_in_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.checked_in_at IS NOT NULL THEN RETURN NEW; END IF;

  v_week_start := date_trunc('week', NEW.checked_in_at AT TIME ZONE 'America/Mexico_City')::date;

  SELECT m.id,
         COALESCE(p.ring_constancia_goal, 1),
         COALESCE(p.ring_esfuerzo_goal, 1),
         COALESCE(p.ring_conexion_goal, 10)
    INTO v_membership_id, v_constancia_goal, v_esfuerzo_goal, v_conexion_goal
    FROM memberships m
    LEFT JOIN plans p ON p.id = m.plan_id
   WHERE m.user_id = NEW.user_id
     AND m.status = 'active'
     AND (m.start_date IS NULL OR m.start_date <= CURRENT_DATE)
     AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
   ORDER BY m.end_date DESC NULLS LAST
   LIMIT 1;

  -- GUARDA QUE FALTABA: sin membresía activa el SELECT INTO deja los goal en NULL.
  v_constancia_goal := COALESCE(v_constancia_goal, 1);
  v_esfuerzo_goal   := COALESCE(v_esfuerzo_goal, 1);
  v_conexion_goal   := COALESCE(v_conexion_goal, 10);

  SELECT COALESCE(ct.intensity, '')
    INTO v_intensity
    FROM classes c
    JOIN class_types ct ON ct.id = c.class_type_id
   WHERE c.id = NEW.class_id
   LIMIT 1;

  v_esfuerzo_increment := CASE
    WHEN lower(v_intensity) IN ('media','alta','intensa','pesada','high','advanced') THEN 1
    ELSE 0
  END;

  INSERT INTO ring_states (
    user_id, membership_id, week_start,
    constancia_progress, constancia_goal,
    esfuerzo_progress, esfuerzo_goal,
    conexion_progress, conexion_goal, source
  )
  VALUES (
    NEW.user_id, COALESCE(NEW.membership_id, v_membership_id), v_week_start,
    1, v_constancia_goal,
    v_esfuerzo_increment, v_esfuerzo_goal,
    0, v_conexion_goal, 'checkin'
  )
  ON CONFLICT (user_id, week_start) DO UPDATE SET
    membership_id = COALESCE(ring_states.membership_id, EXCLUDED.membership_id),
    constancia_progress = ring_states.constancia_progress + 1,
    constancia_goal = GREATEST(ring_states.constancia_goal, EXCLUDED.constancia_goal),
    esfuerzo_progress = ring_states.esfuerzo_progress + EXCLUDED.esfuerzo_progress,
    esfuerzo_goal = GREATEST(ring_states.esfuerzo_goal, EXCLUDED.esfuerzo_goal),
    conexion_goal = GREATEST(ring_states.conexion_goal, EXCLUDED.conexion_goal),
    source = 'checkin', updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── PASO 2 (solo lectura): doble crédito — ¿sigue el trigger legacy en prod? ──
-- El código ya lo dropea al arrancar, pero confirma que NO exista en la BD.
-- Si devuelve 0 filas, el doble cobro ya no ocurre (solo faltaría reparar saldos
-- históricos como el de Andrea).
--   SELECT t.tgname, pg_get_triggerdef(t.oid)
--     FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--    WHERE NOT t.tgisinternal AND c.relname = 'bookings'
--      AND (t.tgname ILIKE '%decrement%' OR t.tgname ILIKE '%class%');

-- Si apareciera un trigger de descuento legacy, eliminarlo:
--   DROP TRIGGER IF EXISTS trigger_decrement_classes ON bookings;
--   DROP FUNCTION IF EXISTS decrement_membership_classes() CASCADE;
