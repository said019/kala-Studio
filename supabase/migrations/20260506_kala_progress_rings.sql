-- Kala Barre Studio: weekly progress rings, retention risk and wallet sync queue.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE plans ADD COLUMN IF NOT EXISTS ring_constancia_goal INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS ring_esfuerzo_goal INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS ring_conexion_goal INTEGER NOT NULL DEFAULT 10;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS reward_description TEXT;

UPDATE plans
   SET ring_constancia_goal = CASE
         WHEN class_limit IS NULL THEN 5
         WHEN class_limit <= 1 THEN 1
         ELSE GREATEST(1, CEIL(class_limit::numeric / 4.0)::int)
       END,
       ring_esfuerzo_goal = CASE
         WHEN class_limit IS NULL THEN 3
         WHEN class_limit <= 1 THEN 1
         ELSE GREATEST(1, CEIL(GREATEST(1, CEIL(class_limit::numeric / 4.0)) * 0.6)::int)
       END,
       ring_conexion_goal = CASE
         WHEN class_limit IS NOT NULL AND class_limit <= 1 THEN 3
         WHEN class_limit IS NOT NULL AND class_limit <= 5 THEN 5
         ELSE 10
       END,
       reward_description = COALESCE(reward_description, 'Recompensa Kala al cerrar tus 3 anillos')
 WHERE is_active = true
    OR reward_description IS NULL;

CREATE TABLE IF NOT EXISTS ring_states (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_id       UUID REFERENCES memberships(id) ON DELETE SET NULL,
  week_start          DATE NOT NULL,
  constancia_progress INTEGER NOT NULL DEFAULT 0 CHECK (constancia_progress >= 0),
  constancia_goal     INTEGER NOT NULL DEFAULT 1 CHECK (constancia_goal > 0),
  esfuerzo_progress   INTEGER NOT NULL DEFAULT 0 CHECK (esfuerzo_progress >= 0),
  esfuerzo_goal       INTEGER NOT NULL DEFAULT 1 CHECK (esfuerzo_goal > 0),
  conexion_progress   INTEGER NOT NULL DEFAULT 0 CHECK (conexion_progress >= 0),
  conexion_goal       INTEGER NOT NULL DEFAULT 10 CHECK (conexion_goal > 0),
  rings_closed        INTEGER GENERATED ALWAYS AS (
    (CASE WHEN constancia_progress >= constancia_goal THEN 1 ELSE 0 END) +
    (CASE WHEN esfuerzo_progress >= esfuerzo_goal THEN 1 ELSE 0 END) +
    (CASE WHEN conexion_progress >= conexion_goal THEN 1 ELSE 0 END)
  ) STORED,
  reward_unlocked     BOOLEAN GENERATED ALWAYS AS (
    constancia_progress >= constancia_goal
    AND esfuerzo_progress >= esfuerzo_goal
    AND conexion_progress >= conexion_goal
  ) STORED,
  reward_claimed_at   TIMESTAMP WITH TIME ZONE,
  source              VARCHAR(40) NOT NULL DEFAULT 'system',
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_ring_states_user_week ON ring_states(user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_ring_states_week ON ring_states(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_ring_states_membership ON ring_states(membership_id);
CREATE INDEX IF NOT EXISTS idx_ring_states_reward ON ring_states(reward_unlocked, reward_claimed_at);

CREATE TABLE IF NOT EXISTS community_events (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points_awarded INTEGER NOT NULL DEFAULT 1 CHECK (points_awarded > 0),
  event_type     VARCHAR(40) NOT NULL DEFAULT 'community',
  description    TEXT,
  occurred_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_community_events_user_time ON community_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_events_type ON community_events(event_type);

CREATE TABLE IF NOT EXISTS risk_scores (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  computed_for_date DATE NOT NULL DEFAULT CURRENT_DATE,
  score             NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  risk_level        VARCHAR(20) NOT NULL CHECK (risk_level IN ('low','medium','high')),
  signals           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, computed_for_date)
);

CREATE INDEX IF NOT EXISTS idx_risk_scores_user_date ON risk_scores(user_id, computed_for_date DESC);
CREATE INDEX IF NOT EXISTS idx_risk_scores_level ON risk_scores(risk_level);

CREATE TABLE IF NOT EXISTS wallet_update_queue (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  reason       VARCHAR(80) NOT NULL DEFAULT 'ring_state_change',
  status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  detail       JSONB NOT NULL DEFAULT '{}'::jsonb,
  available_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_update_queue_status ON wallet_update_queue(status, available_at);
CREATE INDEX IF NOT EXISTS idx_wallet_update_queue_user ON wallet_update_queue(user_id);

CREATE OR REPLACE FUNCTION update_ring_states_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ring_states_updated_at ON ring_states;
CREATE TRIGGER trg_ring_states_updated_at
BEFORE UPDATE ON ring_states
FOR EACH ROW EXECUTE FUNCTION update_ring_states_updated_at();

CREATE OR REPLACE FUNCTION enqueue_wallet_update_from_ring_state()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wallet_update_queue (user_id, reason, detail)
  VALUES (
    NEW.user_id,
    'ring_state_change',
    jsonb_build_object(
      'ring_state_id', NEW.id,
      'week_start', NEW.week_start,
      'rings_closed', NEW.rings_closed,
      'reward_unlocked', NEW.reward_unlocked
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ring_states_wallet_queue ON ring_states;
CREATE TRIGGER trg_ring_states_wallet_queue
AFTER INSERT OR UPDATE ON ring_states
FOR EACH ROW EXECUTE FUNCTION enqueue_wallet_update_from_ring_state();

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
  IF NEW.checked_in_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.checked_in_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

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
    conexion_progress, conexion_goal,
    source
  )
  VALUES (
    NEW.user_id, COALESCE(NEW.membership_id, v_membership_id), v_week_start,
    1, v_constancia_goal,
    v_esfuerzo_increment, v_esfuerzo_goal,
    0, v_conexion_goal,
    'checkin'
  )
  ON CONFLICT (user_id, week_start) DO UPDATE SET
    membership_id = COALESCE(ring_states.membership_id, EXCLUDED.membership_id),
    constancia_progress = ring_states.constancia_progress + 1,
    constancia_goal = GREATEST(ring_states.constancia_goal, EXCLUDED.constancia_goal),
    esfuerzo_progress = ring_states.esfuerzo_progress + EXCLUDED.esfuerzo_progress,
    esfuerzo_goal = GREATEST(ring_states.esfuerzo_goal, EXCLUDED.esfuerzo_goal),
    conexion_goal = GREATEST(ring_states.conexion_goal, EXCLUDED.conexion_goal),
    source = 'checkin',
    updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_recalculate_kala_rings ON bookings;
CREATE TRIGGER trg_bookings_recalculate_kala_rings
AFTER INSERT OR UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION recalculate_kala_rings_on_checkin();

CREATE OR REPLACE FUNCTION recalculate_kala_rings_on_community_event()
RETURNS TRIGGER AS $$
DECLARE
  v_week_start DATE;
  v_membership_id UUID;
  v_constancia_goal INTEGER := 1;
  v_esfuerzo_goal INTEGER := 1;
  v_conexion_goal INTEGER := 10;
BEGIN
  v_week_start := date_trunc('week', COALESCE(NEW.occurred_at, CURRENT_TIMESTAMP) AT TIME ZONE 'America/Mexico_City')::date;

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

  INSERT INTO ring_states (
    user_id, membership_id, week_start,
    constancia_progress, constancia_goal,
    esfuerzo_progress, esfuerzo_goal,
    conexion_progress, conexion_goal,
    source
  )
  VALUES (
    NEW.user_id, v_membership_id, v_week_start,
    0, v_constancia_goal,
    0, v_esfuerzo_goal,
    NEW.points_awarded, v_conexion_goal,
    'community'
  )
  ON CONFLICT (user_id, week_start) DO UPDATE SET
    membership_id = COALESCE(ring_states.membership_id, EXCLUDED.membership_id),
    constancia_goal = GREATEST(ring_states.constancia_goal, EXCLUDED.constancia_goal),
    esfuerzo_goal = GREATEST(ring_states.esfuerzo_goal, EXCLUDED.esfuerzo_goal),
    conexion_progress = ring_states.conexion_progress + EXCLUDED.conexion_progress,
    conexion_goal = GREATEST(ring_states.conexion_goal, EXCLUDED.conexion_goal),
    source = 'community',
    updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_events_recalculate_kala_rings ON community_events;
CREATE TRIGGER trg_community_events_recalculate_kala_rings
AFTER INSERT ON community_events
FOR EACH ROW EXECUTE FUNCTION recalculate_kala_rings_on_community_event();
