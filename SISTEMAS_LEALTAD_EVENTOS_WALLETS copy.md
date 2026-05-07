# Documentación: Lealtad, Eventos y Notificaciones Wallet

---

## 🎁 Programa de Lealtad (WalletClub)

### Archivos
| Rol | Ruta |
|-----|------|
| Backend routes | `server/src/routes/loyalty.ts` |
| Backend library | `server/src/lib/loyalty.ts` |
| Backend referrals | `server/src/routes/referrals.ts` |
| Frontend cliente | `src/pages/client/Wallet.tsx` |
| Frontend cliente | `src/pages/client/WalletRewards.tsx` |
| Frontend cliente | `src/pages/client/WalletHistory.tsx` |
| Frontend admin | `src/pages/admin/loyalty/LoyaltyConfig.tsx` |
| Frontend admin | `src/pages/admin/loyalty/LoyaltyRewards.tsx` |
| Frontend admin | `src/pages/admin/loyalty/LoyaltyRedemptions.tsx` |
| Frontend admin | `src/pages/admin/loyalty/LoyaltyAdjust.tsx` |

### Endpoints
```
GET    /api/loyalty/config                  → Obtener configuración (admin)
PUT    /api/loyalty/config                  → Actualizar configuración (admin)
GET    /api/loyalty/my-history              → Historial de puntos del usuario
GET    /api/loyalty/points/:userId          → Puntos de un usuario (admin)
POST   /api/loyalty/points/:userId/adjust   → Ajuste manual de puntos (admin)
GET    /api/loyalty/rewards                 → Listar recompensas activas
POST   /api/loyalty/rewards                 → Crear recompensa (admin)
PUT    /api/loyalty/rewards/:id             → Actualizar recompensa (admin)
DELETE /api/loyalty/rewards/:id             → Eliminar recompensa (admin)
GET    /api/loyalty/redemptions             → Listar canjes (admin)
POST   /api/loyalty/redeem                  → Canjear recompensa (cliente)
```

### Tablas de base de datos

**`loyalty_points`**
```sql
id                UUID PK
user_id           UUID FK → users
points            INTEGER
type              ENUM('class_attended', 'referral', 'bonus', 'redemption')
description       TEXT
related_booking_id UUID FK → bookings (nullable)
related_reward_id  UUID FK → loyalty_rewards (nullable)
created_at        TIMESTAMP
```

**`loyalty_rewards`**
```sql
id            UUID PK
name          VARCHAR
description   TEXT
points_cost   INTEGER
reward_type   VARCHAR  -- 'discount', 'free_class', etc
reward_value  DECIMAL
stock         INTEGER
is_active     BOOLEAN
created_at    TIMESTAMP
updated_at    TIMESTAMP
```

**`loyalty_redemptions`**
```sql
id            UUID PK
user_id       UUID FK → users
reward_id     UUID FK → loyalty_rewards
points_spent  INTEGER
status        VARCHAR  -- 'pending', 'completed', 'cancelled'
fulfilled_at  TIMESTAMP
fulfilled_by  UUID FK → users
```

**Campo en `users`:**
```sql
loyalty_points   INTEGER  -- Balance actual
```

### Fuentes de puntos
| Acción | Puntos (default) |
|--------|-----------------|
| Check-in a clase | +10 |
| Bienvenida (registro) | +50 |
| Cumpleaños | +100 |
| Referir a alguien | +200 |
| Canje de recompensa | -X |

### Configuración (system_settings key: `loyalty_config`)
```json
{
  "points_per_class": 10,
  "points_per_peso": 1,
  "enabled": true,
  "welcome_bonus": 50,
  "birthday_bonus": 100,
  "referral_bonus": 200
}
```

### Flujo de puntos por asistencia
```
Usuario hace check-in
  → checkin.ts: awardCheckinPoints(userId, bookingId)
  → Lee loyalty_config desde system_settings
  → INSERT INTO loyalty_points (type = 'class_attended')
  → UPDATE users SET loyalty_points = loyalty_points + X
  → Dispara notificación a Apple Wallet + Google Wallet
  → Envía WhatsApp si está habilitado
```

### Flujo de canje
```
Cliente solicita canje → POST /api/loyalty/redeem
  → Valida puntos suficientes y stock disponible
  → UPDATE users SET loyalty_points = loyalty_points - X
  → UPDATE loyalty_rewards SET stock = stock - 1
  → INSERT INTO loyalty_redemptions (status = 'pending')
  → Admin confirma → status = 'completed', fulfilled_at = NOW()
```

---

## 🎟️ Sistema de Eventos

### Archivos
| Rol | Ruta |
|-----|------|
| Backend routes | `server/src/routes/events.ts` |
| Backend emails | `server/src/services/email.ts` |
| Frontend cliente | `src/pages/client/Events.tsx` |
| Frontend admin | `src/pages/admin/events/EventsManager.tsx` |
| Migración DB | `database/migrations/012_event_config_columns.sql` |

### Endpoints
```
GET    /api/events                              → Eventos publicados (público)
GET    /api/events/:id                          → Detalle de evento
GET    /api/events/admin/all                    → Todos los eventos (admin)
POST   /api/events                              → Crear evento (admin)
PUT    /api/events/:id                          → Actualizar evento (admin)
DELETE /api/events/:id                          → Eliminar evento (admin)
POST   /api/events/:id/register                 → Registrarse en evento
DELETE /api/events/:id/register                 → Cancelar registro
GET    /api/events/:id/registrations            → Ver registros del evento (admin)
POST   /api/events/:eventId/registrations       → Agregar asistente manual (admin)
POST   /api/events/notify                       → Notificación masiva por email (admin)
GET    /api/events/registrations/pending        → Pagos pendientes de eventos
```

### Tablas de base de datos

**`events`**
```sql
id                  UUID PK
title               VARCHAR
description         TEXT
type                ENUM('masterclass','workshop','retreat','challenge','openhouse','special')
status              ENUM('draft','published','cancelled','completed')
date                DATE
start_time          TIME
end_time            TIME
location            VARCHAR
capacity            INTEGER
registered          INTEGER  -- actualizado automáticamente por trigger
price               DECIMAL
early_bird_price    DECIMAL  -- nullable
early_bird_deadline DATE     -- nullable
member_discount     INTEGER  -- % de descuento para miembros
image               TEXT     -- URL
instructor_id       UUID
instructor_name     VARCHAR
instructor_photo    TEXT
requirements        TEXT
includes            TEXT
tags                JSONB
-- Campos especiales (migración 012)
waitlist_enabled    BOOLEAN
required_payment    BOOLEAN
wallet_pass         BOOLEAN  -- Crear wallet pass automático
auto_reminders      BOOLEAN
allow_cancellations BOOLEAN
created_by          UUID FK → users
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

**`event_registrations`**
```sql
id                  UUID PK
event_id            UUID FK → events
user_id             UUID FK → users (nullable si registro externo)
name                VARCHAR
email               VARCHAR
phone               VARCHAR
status              ENUM('confirmed','pending','waitlist','cancelled','no_show')
amount              DECIMAL
payment_method      ENUM('card','transfer','cash','free')
payment_reference   VARCHAR
paid_at             TIMESTAMP
checked_in          BOOLEAN
checked_in_at       TIMESTAMP
checked_in_by       UUID FK → users
waitlist_position   INTEGER
notes               TEXT
created_at          TIMESTAMP
updated_at          TIMESTAMP
UNIQUE (event_id, email)
```

**Trigger automático:**
```sql
-- Al insertar/actualizar event_registrations:
-- Si status IN ('confirmed', 'pending') → incrementa events.registered
-- Si status = 'cancelled' → decrementa events.registered
update_event_registration_count()
```

### Flujo de registro
```
POST /api/events/:id/register
  → Verifica que evento esté publicado y no esté ya registrado
  → Calcula precio:
      if (early_bird && dentro_de_deadline) → early_bird_price
      if (es_miembro) → precio * (1 - member_discount/100)
  → Determina estado:
      if (amount == 0) → 'confirmed' (gratis)
      if (registered >= capacity && waitlist_enabled) → 'waitlist'
      if (registered < capacity) → 'pending'
  → Si confirmado y gratis:
      Actualiza wallet passes
      Notifica dispositivos
  → Retorna: { id, status, amount, isFree, waitlistPosition, message }
```

### Flujo de publicación de evento
```
PUT /api/events/:id → status: 'published'
  → cancelOverlappingClasses()   → cancela clases que se superponen
  → sendAlertToAllDevices()      → push a todos los Apple Wallet
  → sendMessageToAllGoogleObjects() → push a todos los Google Wallet
```

### Flujo de cancelación de registro
```
DELETE /api/events/:id/register
  → Valida allow_cancellations = true en evento
  → Valida que falten más de 48h para el evento
  → UPDATE event_registrations SET status = 'cancelled'
```

---

## 📲 Notificaciones Push a Wallets

### Archivos
| Rol | Ruta |
|-----|------|
| Apple Wallet | `server/src/lib/apple-wallet.ts` |
| Google Wallet | `server/src/lib/google-wallet.ts` |
| Notificaciones unificadas | `server/src/lib/notifications.ts` |
| Wallet routes | `server/src/routes/wallet.ts` |
| Migración DB | `database/migrations/003_wallet_tables.sql` |

### Endpoints
```
POST /api/wallet/pass/apple                    → Generar Apple Wallet pass
GET  /api/wallet/download/apple/:token         → Descargar pass (token temporal)
POST /api/wallet/devices/apple/register        → Registrar dispositivo iOS
POST /api/wallet/devices/apple/unregister      → Desregistrar dispositivo
POST /api/wallet/pass/google                   → Generar URL Google Wallet
GET  /api/wallet/objects/google/:objectId      → Obtener objeto de lealtad
GET  /api/wallet/notifications                 → Historial de notificaciones
POST /api/wallet/notify/custom                 → Notificación personalizada (admin)
```

### Tablas de base de datos

**`apple_wallet_devices`**
```sql
id             UUID PK
device_id      VARCHAR          -- Device Library Identifier de iOS
push_token     VARCHAR          -- APNs Push Token
pass_type_id   VARCHAR          -- Pass Type Identifier
membership_id  UUID FK → memberships
created_at     TIMESTAMP
updated_at     TIMESTAMP
UNIQUE (device_id, pass_type_id, membership_id)
```

**`apple_wallet_updates`**
```sql
id             UUID PK
membership_id  UUID FK → memberships
classes_old    INTEGER
classes_new    INTEGER
updated_at     TIMESTAMP
```

**`wallet_passes`**
```sql
id                     UUID PK
user_id                UUID FK → users
membership_id          UUID FK → memberships
platform               VARCHAR  -- 'apple' | 'google'
serial_number          VARCHAR UNIQUE
pass_type_identifier   VARCHAR
google_object_id       VARCHAR  -- ID del objeto en Google Wallet API
auth_token             VARCHAR
```

**`wallet_pass_updates`**
```sql
id              UUID PK
wallet_pass_id  UUID FK → wallet_passes
membership_id   UUID FK → memberships
classes_old     INTEGER
classes_new     INTEGER
updated_at      TIMESTAMP
```

**`notification_logs`**
```sql
id             UUID PK
membership_id  UUID FK → memberships
title          VARCHAR
message        TEXT
channel        ENUM('apple', 'google')
status         ENUM('pending', 'sent', 'failed')
error          TEXT
created_at     TIMESTAMP
```

### Flujo Apple Wallet

```
1. Generar Pass:
   POST /api/wallet/pass/apple
     → getMembershipData(membershipId)
     → buildQrPayload(userId, membershipId)
         payload: { t: 'checkin', m: userId, ms: membershipId, e: expiresAt, h: hash }
         → Base64URL encoded
     → passkit-generator crea archivo .pkpass
     → Retorna descarga o token temporal

2. Registrar Dispositivo:
   iOS instala el pass → llama POST /api/wallet/devices/apple/register
     → INSERT INTO apple_wallet_devices (device_id, push_token, membership_id)

3. Enviar Push:
   notifyAllDevices(membershipId)
     → SELECT push_token FROM apple_wallet_devices WHERE membership_id = X
     → sendAPNsAlertNotification(pushToken, title, body) vía HTTP/2
     → INSERT INTO notification_logs

4. Actualizar Pass:
   recordPassUpdate(membershipId, oldClasses, newClasses)
     → INSERT INTO apple_wallet_updates
     → iOS descarga nueva versión del pass y actualiza el display
```

### Flujo Google Wallet

```
1. Crear Objeto de Lealtad:
   upsertGoogleLoyaltyObject(membershipId)
     → OAuth2 con Google Service Account
     → Crea/actualiza Loyalty Object con:
         - Número de referencia (membershipId)
         - Información personal del usuario
         - Puntos de lealtad actuales
         - Código QR (mismo que Apple)
         - Vigencia (start_date → end_date)
     → Guarda google_object_id en wallet_passes

2. Enviar Mensaje:
   sendGoogleWalletMessage({ membershipId, title, body })
     → upsertGoogleLoyaltyObject() (actualiza datos)
     → Envía mensaje via Google Wallet API
     → Usuario recibe notificación en app Google Wallet

3. Generar URL:
   buildGoogleSaveUrl(membershipId)
     → https://pay.google.com/gp/v/save/class/{loyaltyClassId}?object={objectId}
```

### Funciones de notificación unificadas (`notifications.ts`)

```typescript
// Check-in completado
notifyClassAttended(membershipId, oldClasses, newClasses)

// Puntos ganados
notifyPointsEarned(membershipId, pointsEarned, totalPoints)

// Membresía por vencer (cron job)
notifyMembershipExpiring(membershipId, daysRemaining)

// Membresía renovada
notifyMembershipRenewed(membershipId)

// Personalizada (desde admin)
sendCustomNotification({ membershipId, title, message, sendApple, sendGoogle })
```

**Flujo interno de cada notificación:**
```
1. Calcula datos de membresía
2. Genera título y mensaje
3. Rama Apple → recordPassUpdate() + sendAPNsAlertNotification()
4. Rama Google → upsertGoogleLoyaltyObject() + sendGoogleWalletMessage()
5. INSERT INTO notification_logs
```

### Integración con Check-in
```typescript
// En checkin.ts, al completar un check-in:
awardCheckinPoints(userId, bookingId)
  → INSERT INTO loyalty_points
  → UPDATE users.loyalty_points
  → notifyClassAttended(membershipId, oldClasses, newClasses)
      → Apple: actualiza pass + push APNs
      → Google: actualiza objeto + push Google API
  → Envía WhatsApp si está configurado
```

### Variables de entorno

**Apple Wallet (APNs):**
```env
APPLE_TEAM_ID=
APPLE_PASS_TYPE_ID=com.catarsis.membership
APPLE_KEY_ID=
APPLE_APNS_KEY_BASE64=      # Clave P8 en Base64
APPLE_ORG_NAME=Catarsis Studio
```

**Google Wallet:**
```env
GOOGLE_ISSUER_ID=
GOOGLE_SA_EMAIL=             # Service Account email
GOOGLE_SA_PRIVATE_KEY=       # JSON de la clave privada
```

**Check-in / QR:**
```env
CHECKIN_SECRET=walletclub-dev
BUSINESS_LATITUDE=19.4326
BUSINESS_LONGITUDE=-99.1332
```

---

## Resumen de integraciones

| Trigger | Función | Canales |
|---------|---------|---------|
| Check-in a clase | `notifyClassAttended()` | Apple + Google |
| Puntos ganados | `notifyPointsEarned()` | Apple + Google |
| Membresía por vencer | `notifyMembershipExpiring()` | Apple + Google |
| Membresía renovada | `notifyMembershipRenewed()` | Apple + Google |
| Evento publicado | `sendAlertToAllDevices()` | Apple + Google |
| Referral completado | — | WhatsApp |
| Notificación manual (admin) | `sendCustomNotification()` | Apple + Google |
| Anuncio de evento (admin) | `sendEventAnnouncementEmail()` | Email (Resend) |
