import "dotenv/config";
import express from "express";
import cors from "cors";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import multer from "multer";
import axios from "axios";
import crypto from "crypto";
import http2 from "http2";
import archiver from "archiver";
import sharp from "sharp";
import { execSync } from "child_process";
import {
  sendMembershipActivated,
  sendBookingConfirmed,
  sendBookingCancelled,
  sendWeeklyReminder,
  sendRenewalReminder,
  sendPasswordResetEmail,
} from "./emailService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || "dev_kala_secret_change_me";
const APP_PUBLIC_URL = String(process.env.APP_URL || process.env.SITE_URL || "https://kala-barre-studio.com.mx").replace(/\/+$/, "");

// ─── Evolution API (WhatsApp) config ────────────────────────────────────────
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || "kala-barre-studio";
const evolutionApi = axios.create({
  baseURL: EVOLUTION_API_URL,
  headers: { apikey: EVOLUTION_API_KEY },
  timeout: 20000,
});

const DEFAULT_GENERAL_SETTINGS = {
  studio_name: "Kala Barre Studio",
  address: "Av. Nicolas Zapata #845 int. 4, Plaza San Martin, Col. Tequisquiapan, San Luis Potosi",
  phone: "4443073266",
  instagram: "@kalabarre_slp",
  facebook: "Kala Barre studio SLP",
  timezone: "America/Mexico_City",
  currency: "MXN",
  maintenance_mode: false,
  venue_media_url: "",
  venue_media_type: "",
  venue_media_drive_id: "",
  venue_media_name: "",
  venue_media_updated_at: "",
};

const DEFAULT_BANK_INFO = Object.freeze({
  bank: "BBVA",
  account_holder: "Karla Cruz",
  account_number: "",
  clabe: "012 700 01539444488 8",
});

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatClabe(value) {
  const digits = digitsOnly(value);
  if (digits.length !== 18) return String(value || "").trim();
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 17)} ${digits.slice(17)}`;
}

function formatAccountNumber(value) {
  const digits = digitsOnly(value);
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return String(value || "").trim();
}

function normalizeBankInfo(rawValue) {
  const raw = rawValue && typeof rawValue === "object" ? rawValue : {};
  const candidate = {
    bank: String(raw.bank || raw.bank_name || raw.banco || "").trim(),
    account_holder: String(raw.account_holder || raw.accountHolder || raw.titular || raw.holder || "").trim(),
    account_number: String(raw.account_number || raw.accountNumber || raw.cuenta || raw.account || "").trim(),
    clabe: String(raw.clabe || raw.clabe_interbancaria || "").trim(),
  };

  const holderLower = candidate.account_holder.toLowerCase();
  const clabeDigits = digitsOnly(candidate.clabe);
  const accountDigits = digitsOnly(candidate.account_number);
  const shouldUseDefault =
    !candidate.bank ||
    !candidate.account_holder ||
    clabeDigits.length !== 18 ||
    (accountDigits && accountDigits.length < 10) ||
    clabeDigits === "012180001234567890" ||
    clabeDigits === "012180012345678901" ||
    clabeDigits === "710180000068980" ||
    holderLower.includes("balance studio") ||
    holderLower.includes("ophelia jump studio sa de cv") ||
    holderLower.includes("balance studio");

  const base = shouldUseDefault ? DEFAULT_BANK_INFO : candidate;
  const formattedAccount = formatAccountNumber(base.account_number || DEFAULT_BANK_INFO.account_number);
  const formattedClabe = formatClabe(base.clabe || DEFAULT_BANK_INFO.clabe);
  const holder = String(base.account_holder || DEFAULT_BANK_INFO.account_holder).trim();
  const bank = String(base.bank || DEFAULT_BANK_INFO.bank).trim();

  return {
    bank,
    bank_name: bank,
    account_holder: holder,
    accountHolder: holder,
    account_number: formattedAccount,
    accountNumber: formattedAccount,
    clabe: formattedClabe,
  };
}

async function getConfiguredBankInfo(dbClient = pool) {
  try {
    const settingsRes = await dbClient.query(
      "SELECT value FROM system_settings WHERE key = 'bank_info' LIMIT 1"
    );
    const raw = settingsRes.rows.length > 0 ? settingsRes.rows[0].value : null;
    return normalizeBankInfo(raw);
  } catch (_) {
    return normalizeBankInfo(DEFAULT_BANK_INFO);
  }
}

const DEFAULT_POLICIES_SETTINGS = {
  cancellation_policy: "Alumnas nuevas pueden cancelar de 4 a 5 horas antes de la clase. Comunidad KALA puede cancelar hasta 2 horas antes sin penalizacion. Cancelaciones tardias o no-show se consideran clase tomada.",
  terms_of_service: "Al reservar o comprar en Kala Barre Studio aceptas el reglamento interno, la vigencia mensual de paquetes, las politicas de cancelacion y el uso personal e intransferible de tus clases.",
  privacy_policy: "Tus datos se usan para gestionar reservas, pagos, asistencias, recompensas y comunicacion operativa del studio. No compartimos tu informacion personal con terceros sin autorizacion.",
};

const DEFAULT_NOTIFICATION_SETTINGS = {
  email_reminders: true,
  whatsapp_reminders: true,
  reminder_hours_before: 2,
};

const DEFAULT_NOTIFICATION_TEMPLATES = {
  booking_confirmed: {
    subject: "Reserva confirmada",
    body: "Hola {name}, tu reserva para {class} el {date} a las {time} está confirmada.",
  },
  booking_cancelled: {
    subject: "Reserva cancelada",
    body: "Hola {name}, tu reserva de {class} del {date} fue cancelada. Crédito devuelto: {creditRestored}.",
  },
  membership_activated: {
    subject: "Membresía activada",
    body: "Hola {name}, tu membresía {plan} ya está activa. Vigencia: {startDate} al {endDate}.",
  },
  transfer_rejected: {
    subject: "Transferencia rechazada",
    body: "Hola {name}, no pudimos aprobar tu comprobante. Motivo: {reason}.",
  },
  class_reminder: {
    subject: "Recordatorio de clase",
    body: "Hola {name}, te recordamos tu clase {class} a las {time}.",
  },
  renewal_reminder: {
    subject: "Recordatorio de renovación",
    body: "Hola {name}, tu plan {plan} está por vencer el {expiresAt}.",
  },
  welcome: {
    subject: "Bienvenida a Kala",
    body: "Hola {name}, bienvenida a Kala Barre Studio. Este es un paso mas hacia tus objetivos.",
  },
  password_reset: {
    subject: "Recuperación de contraseña",
    body: "Hola {name}, usa este enlace para restablecer tu contraseña: {link}",
  },
};

const DEFAULT_SETTINGS_BY_KEY = {
  general_settings: DEFAULT_GENERAL_SETTINGS,
  policies_settings: DEFAULT_POLICIES_SETTINGS,
  notification_settings: DEFAULT_NOTIFICATION_SETTINGS,
  notification_templates: DEFAULT_NOTIFICATION_TEMPLATES,
};

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(baseValue, overrideValue) {
  if (!isPlainObject(baseValue)) {
    return overrideValue === undefined ? baseValue : overrideValue;
  }
  if (!isPlainObject(overrideValue)) {
    return baseValue;
  }
  const output = { ...baseValue };
  for (const [key, val] of Object.entries(overrideValue)) {
    const baseEntry = output[key];
    output[key] = isPlainObject(baseEntry) && isPlainObject(val)
      ? deepMerge(baseEntry, val)
      : val;
  }
  return output;
}

function mergeSettingsWithDefaults(key, rawValue) {
  const defaults = DEFAULT_SETTINGS_BY_KEY[key];
  if (!defaults) return rawValue ?? null;
  if (!isPlainObject(rawValue)) return JSON.parse(JSON.stringify(defaults));
  const merged = deepMerge(defaults, rawValue);
  if (key === "policies_settings") {
    for (const [fieldKey, defaultValue] of Object.entries(defaults)) {
      const current = merged[fieldKey];
      if (typeof defaultValue === "string" && (!current || !String(current).trim())) {
        merged[fieldKey] = defaultValue;
      }
    }
  }
  return merged;
}

// ─── File upload (memory storage, max 10 MB) ────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── File upload for videos (disk storage, max 500 MB) ─────────────────────
// Use disk storage so large videos don't fill Node.js RAM
const VIDEO_MAX_MB = 500;
const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `ophelia_vid_${Date.now()}_${file.originalname}`),
  }),
  limits: { fileSize: VIDEO_MAX_MB * 1024 * 1024 },
});

// ─── Google Drive helpers ────────────────────────────────────────────────────
async function getGoogleDriveAccessToken() {
  const resp = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN || "",
    grant_type: "refresh_token",
  }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  return resp.data.access_token;
}

async function makeGoogleDriveFilePublic(fileId, accessToken) {
  await axios.post(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    { role: "reader", type: "anyone" },
    { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
  ).catch(() => { }); // best-effort
}

/** Upload a Buffer to Google Drive using simple multipart (for small files like thumbnails) */
async function uploadBufferToDrive(buffer, fileName, mimeType, accessToken) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
  const metadata = { name: fileName, ...(folderId ? { parents: [folderId] } : {}) };
  // Build multipart body manually
  const boundary = "ophelia_boundary_" + Date.now();
  const metaPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
  );
  const filePart = Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const endPart = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([metaPart, filePart, buffer, endPart]);

  const resp = await axios.post(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    body,
    { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary="${boundary}"` }, maxBodyLength: Infinity, maxContentLength: Infinity }
  );
  return resp.data; // { id, webViewLink }
}

/**
 * Upload a file from disk to Google Drive using Resumable Upload (streams in 5 MB chunks).
 * Works for files of any size without loading them entirely into memory.
 * @param {string} filePath  - absolute path to the temp file on disk
 * @param {string} fileName  - desired file name in Drive
 * @param {string} mimeType  - e.g. "video/mp4"
 * @param {string} accessToken - Google OAuth2 access token
 * @returns {{ id: string, webViewLink?: string }}
 */
async function uploadFileToDriveResumable(filePath, fileName, mimeType, accessToken) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
  const metadata = { name: fileName, ...(folderId ? { parents: [folderId] } : {}) };
  const fileSize = fs.statSync(filePath).size;

  // Step 1: Initiate resumable upload session
  const initResp = await axios.post(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
    metadata,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(fileSize),
      },
    }
  );
  const uploadUri = initResp.headers.location; // resumable session URI

  // Step 2: Upload file in chunks of 5 MB (must be multiples of 256 KB)
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
  let offset = 0;
  const fd = fs.openSync(filePath, "r");

  try {
    while (offset < fileSize) {
      const bytesToRead = Math.min(CHUNK_SIZE, fileSize - offset);
      const chunk = Buffer.alloc(bytesToRead);
      fs.readSync(fd, chunk, 0, bytesToRead, offset);

      const endByte = offset + bytesToRead - 1;
      const contentRange = `bytes ${offset}-${endByte}/${fileSize}`;

      const resp = await axios.put(uploadUri, chunk, {
        headers: {
          "Content-Length": String(bytesToRead),
          "Content-Range": contentRange,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        // 308 Resume Incomplete is expected for intermediate chunks
        validateStatus: (status) => status === 200 || status === 201 || status === 308,
      });

      if (resp.status === 200 || resp.status === 201) {
        // Final chunk — upload complete
        return resp.data; // { id, webViewLink }
      }

      // 308: read next range from Range header
      const rangeHeader = resp.headers.range; // e.g. "bytes=0-5242879"
      if (rangeHeader) {
        offset = parseInt(rangeHeader.split("-")[1], 10) + 1;
      } else {
        offset += bytesToRead;
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  throw new Error("Resumable upload ended without a final 200/201 response");
}


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : false,
});

// Ensure users table has password_hash column (idempotent migration)
async function ensureSchema() {
  try {
    // ── Ensure all users columns the app needs ────────────────────────────
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accepts_terms BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accepts_communications BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS health_notes TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_reminders BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_promotions BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_weekly_summary BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`).catch(() => { });
    // ── Password reset tokens ───────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token       VARCHAR(255) NOT NULL UNIQUE,
        expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
        used        BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });
    await pool.query(`ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT false`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens(expires_at)`).catch(() => { });
    // Cleanup best-effort to keep table compact.
    await pool.query(`
      DELETE FROM password_reset_tokens
      WHERE used = true OR expires_at < NOW() - INTERVAL '7 days'
    `).catch(() => { });
    // Ensure referrals table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referral_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code VARCHAR(20) NOT NULL UNIQUE,
        uses_count INTEGER DEFAULT 0,
        reward_points INTEGER DEFAULT 200,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code)`).catch(() => { });
    // Ensure discount_codes table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code VARCHAR(50) NOT NULL UNIQUE,
        discount_type VARCHAR(20) NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
        discount_value DECIMAL(10,2) NOT NULL,
        max_uses INTEGER,
        uses_count INTEGER DEFAULT 0,
        class_category VARCHAR(20),
        channel VARCHAR(20) NOT NULL DEFAULT 'all',
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // ── class_types (tipos de clase editables desde admin) ──────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS class_types (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name         VARCHAR(100) NOT NULL,
        subtitle     VARCHAR(150),
        description  TEXT,
        category     VARCHAR(20)  NOT NULL DEFAULT 'jumping' CHECK (category IN ('jumping','pilates')),
        intensity    VARCHAR(20)  DEFAULT 'media' CHECK (intensity IN ('ligera','media','pesada','todas')),
        level        VARCHAR(50)  DEFAULT 'Todos los niveles',
        duration_min INTEGER      DEFAULT 50,
        capacity     INTEGER      DEFAULT 10,
        color        VARCHAR(50)  DEFAULT '#c026d3',
        emoji        VARCHAR(10)  DEFAULT '🏃',
        is_active    BOOLEAN      DEFAULT true,
        sort_order   INTEGER      DEFAULT 0,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS subtitle VARCHAR(150)`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'jumping'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS intensity VARCHAR(20) DEFAULT 'media'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS level VARCHAR(50) DEFAULT 'Todos los niveles'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS duration_min INTEGER DEFAULT 50`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 10`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ALTER COLUMN capacity SET DEFAULT 10`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT '#c026d3'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS emoji VARCHAR(10) DEFAULT '🏃'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`).catch(() => { });
    // ── schedule_slots (horario semanal editable desde admin) ───────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedule_slots (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        time_slot       VARCHAR(20) NOT NULL,
        day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
        class_type_id   UUID REFERENCES class_types(id) ON DELETE SET NULL,
        class_type_name VARCHAR(100),
        instructor_name VARCHAR(100),
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_schedule_slots_day ON schedule_slots(day_of_week)`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS class_type_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS class_type_name VARCHAR(100)`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS instructor_name VARCHAR(100)`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_slots_slot ON schedule_slots(time_slot, day_of_week) WHERE is_active = true`).catch(() => { });
    // ── schedule_templates (plantilla simple con class_label) ───────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedule_templates (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        time_slot   VARCHAR(10)  NOT NULL,
        day_of_week SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
        class_label VARCHAR(50)  NOT NULL,
        shift       VARCHAR(10)  NOT NULL DEFAULT 'morning' CHECK (shift IN ('morning','evening')),
        is_active   BOOLEAN      DEFAULT true,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (time_slot, day_of_week)
      );
    `);
    // ── packages (paquetes de precios barre Kala) ────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS packages (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name          VARCHAR(100) NOT NULL,
        num_classes   VARCHAR(20)  NOT NULL,
        price         DECIMAL(10,2) NOT NULL,
        category      VARCHAR(20)  NOT NULL DEFAULT 'barre' CHECK (category IN ('barre','jumping','pilates','mixtos')),
        validity_days INTEGER      DEFAULT 30,
        is_active     BOOLEAN      DEFAULT true,
        sort_order    INTEGER      DEFAULT 0,
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_category_check`).catch(() => { });
    await pool.query(`ALTER TABLE packages ADD CONSTRAINT packages_category_check CHECK (category IN ('barre','jumping','pilates','mixtos'))`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_packages_category ON packages(category)`).catch(() => { });
    // ── Seed packages si la tabla está vacía ──────────────────────────────
    const pkgCount = await pool.query("SELECT COUNT(*) FROM packages");
    if (parseInt(pkgCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO packages (name, num_classes, price, category, validity_days, is_active, sort_order) VALUES
          ('2 Clases al mes',       '2',  230,  'barre', 30, true, 1),
          ('3 Clases al mes',       '3',  355,  'barre', 30, true, 2),
          ('4 Clases al mes',       '4',  470,  'barre', 30, true, 3),
          ('5 Clases al mes',       '5',  585,  'barre', 30, true, 4),
          ('2 Clases por semana',   '8',  880,  'barre', 30, true, 5),
          ('3 Clases por semana',   '12', 1080, 'barre', 30, true, 6),
          ('4 Clases por semana',   '16', 1200, 'barre', 30, true, 7),
          ('5 Clases por semana',   '20', 1300, 'barre', 30, true, 8),
          ('Clase suelta',          '1',  125,  'barre', 30, true, 9)
        ON CONFLICT DO NOTHING;
      `);
      console.log("✅ Seeded Kala Barre packages");
    }
    // ── Seed class_types – ensure Kala Barre exists ───────────────────────
    await pool.query(`ALTER TABLE class_types DROP CONSTRAINT IF EXISTS class_types_category_check`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD CONSTRAINT class_types_category_check CHECK (category IN ('barre','jumping','pilates','mixto'))`).catch(() => { });
    const hasKalaTypes = await pool.query("SELECT 1 FROM class_types WHERE name = 'Barre' LIMIT 1");
    if (hasKalaTypes.rows.length === 0) {
      const kalaNames = ['Barre'];
      await pool.query("DELETE FROM class_types WHERE name != ALL($1::text[])", [kalaNames]);
      await pool.query(`
        INSERT INTO class_types (name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, sort_order, is_active) VALUES
          ('Barre', 'Fuerza, postura y comunidad', 'Clase cercana, energetica y personalizada para todos los niveles. Cada sesion cambia para que avances con compromiso y disfrutes el proceso.', 'barre', 'Media', 'all', 50, 5, '#76214D', 'sparkles', 1, true)
        ON CONFLICT DO NOTHING;
      `);
      console.log("✅ Seeded Kala Barre class type");
    }
    // ── Seed schedule_slots si la tabla está vacía ─────────────────────────
    const ssCount = await pool.query("SELECT COUNT(*) FROM schedule_slots");
    if (parseInt(ssCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO schedule_slots (time_slot, day_of_week, class_type_name) VALUES
          ('7:00 am', 1, 'Barre'), ('8:00 am', 1, 'Barre'), ('7:00 pm', 1, 'Barre'), ('8:00 pm', 1, 'Barre'),
          ('7:00 am', 2, 'Barre'), ('8:00 am', 2, 'Barre'), ('7:00 pm', 2, 'Barre'), ('8:00 pm', 2, 'Barre'),
          ('7:00 am', 3, 'Barre'), ('8:00 am', 3, 'Barre'), ('7:00 pm', 3, 'Barre'), ('8:00 pm', 3, 'Barre'),
          ('7:00 am', 4, 'Barre'), ('8:00 am', 4, 'Barre'), ('7:00 pm', 4, 'Barre'), ('8:00 pm', 4, 'Barre'),
          ('7:00 am', 5, 'Barre'), ('8:00 am', 5, 'Barre'), ('7:00 pm', 5, 'Barre'), ('8:00 pm', 5, 'Barre'),
          ('7:00 am', 6, 'Barre'), ('8:00 am', 6, 'Barre'), ('9:00 am', 6, 'Barre')
        ON CONFLICT DO NOTHING;
      `);
    }
    // ── Ensure plans columns exist ───────────────────────────────────────
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS description TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MXN'`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS class_limit INTEGER`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS class_category VARCHAR(20) DEFAULT 'all'`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_non_transferable BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_non_repeatable BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS repeat_key VARCHAR(80)`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS ring_constancia_goal INTEGER NOT NULL DEFAULT 1`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS ring_esfuerzo_goal INTEGER NOT NULL DEFAULT 1`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS ring_conexion_goal INTEGER NOT NULL DEFAULT 10`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS reward_description TEXT`).catch(() => { });
    await pool.query(`
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
          OR reward_description IS NULL
    `).catch(() => { });
    // ── Migrate class_types: prefer barre for Kala defaults ───────────────
    await pool.query(`
      UPDATE class_types SET category = 'barre' WHERE name = 'Barre';
    `).catch(() => { });
    // ── Migrate plans: 'mixto' class_category means both, keep as 'mixto' for logic ──
    // (mixto plans are still valid — the booking endpoint allows them on both categories)
    // ── Seed plans: deactivate old schema_complete.sql plans & ensure only correct ones ──
    // Soft-delete (deactivate) old plans that came from the migration seed (wrong data)
    // Using UPDATE instead of DELETE to avoid FK constraint from orders table
    await pool.query(`
      UPDATE plans SET is_active = false WHERE name IN (
        'Inscripción (Pago Anual)',
        'Sesión Muestra o Individual',
        'Sesión Extra (Socias o Inscritas)',
        'Una Sesión (4 al Mes)',
        'Dos Sesiones (8 al Mes)',
        'Tres Sesiones (12 al Mes)',
        'Cuatro Sesiones (16 al Mes)',
        'Cinco Sesiones (20 al Mes)',
        'Seis Sesiones (24 al Mes)',
        'Siete Sesiones (28 al Mes)'
      );
    `).catch(() => { });
    // Remove legacy plan "Sesión Extra (Socias o Inscritas)" and all related data.
    // This keeps admin clean and avoids accidental reuse of an obsolete plan.
    try {
      const legacyPlanName = "Sesión Extra (Socias o Inscritas)";
      const legacyRes = await pool.query(`SELECT id FROM plans WHERE name = $1`, [legacyPlanName]);
      if (legacyRes.rows.length) {
        const legacyIds = legacyRes.rows.map((row) => row.id);
        const cleanupClient = await pool.connect();
        try {
          await cleanupClient.query("BEGIN");
          await cleanupClient.query(
            `UPDATE memberships
                SET order_id = NULL
              WHERE order_id IN (SELECT id FROM orders WHERE plan_id = ANY($1::uuid[]))`,
            [legacyIds]
          ).catch(() => {});
          await cleanupClient.query(`DELETE FROM discount_codes WHERE plan_id = ANY($1::uuid[])`, [legacyIds]).catch(() => {});
          await cleanupClient.query(`DELETE FROM memberships WHERE plan_id = ANY($1::uuid[])`, [legacyIds]).catch(() => {});
          await cleanupClient.query(`DELETE FROM orders WHERE plan_id = ANY($1::uuid[])`, [legacyIds]).catch(() => {});
          await cleanupClient.query(`DELETE FROM plans WHERE id = ANY($1::uuid[])`, [legacyIds]);
          await cleanupClient.query("COMMIT");
        } catch (legacyErr) {
          await cleanupClient.query("ROLLBACK").catch(() => {});
          console.warn("[schema] Legacy session cleanup skipped:", legacyErr?.message || legacyErr);
        } finally {
          cleanupClient.release();
        }
      }
    } catch (legacyTopErr) {
      console.warn("[schema] Legacy session lookup failed:", legacyTopErr?.message || legacyTopErr);
    }
    const plCount = await pool.query("SELECT COUNT(*) FROM plans WHERE is_active = true");
    if (parseInt(plCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO plans (name, price, currency, duration_days, class_limit, class_category, is_active, sort_order) VALUES
          ('Barre — 2 Clases al mes',      230,  'MXN', 30, 2,  'all', true, 1),
          ('Barre — 3 Clases al mes',      355,  'MXN', 30, 3,  'all', true, 2),
          ('Barre — 4 Clases al mes',      470,  'MXN', 30, 4,  'all', true, 3),
          ('Barre — 5 Clases al mes',      585,  'MXN', 30, 5,  'all', true, 4),
          ('Barre — 2 Clases por semana',  880,  'MXN', 30, 8,  'all', true, 5),
          ('Barre — 3 Clases por semana',  1080, 'MXN', 30, 12, 'all', true, 6),
          ('Barre — 4 Clases por semana',  1200, 'MXN', 30, 16, 'all', true, 7),
          ('Barre — 5 Clases por semana',  1300, 'MXN', 30, 20, 'all', true, 8),
          ('Barre — Clase suelta',         125,  'MXN', 30, 1,  'all', true, 9)
        ON CONFLICT DO NOTHING;
      `);
    }
    // ── Backfill class_category on existing plans that have no category set ──
    await pool.query(`UPDATE plans SET class_category = 'jumping' WHERE (class_category IS NULL OR class_category = 'all') AND (name ILIKE '%jumping%' OR name ILIKE '%jump%' OR name ILIKE '%strong%' OR name ILIKE '%dance%' OR name ILIKE '%tone%' OR name ILIKE '%mindful jump%')`).catch(() => { });
    await pool.query(`UPDATE plans SET class_category = 'pilates' WHERE (class_category IS NULL OR class_category = 'all') AND (name ILIKE '%pilates%' OR name ILIKE '%mat%' OR name ILIKE '%flow%' OR name ILIKE '%hot%')`).catch(() => { });
    await pool.query(`UPDATE plans SET class_category = 'mixto'   WHERE (class_category IS NULL OR class_category = 'all') AND name ILIKE '%mixto%'`).catch(() => { });
    // ── Ensure sample single-session plans exist (MXN 65, non-transferable, non-repeatable) ──
    const samplePlans = [
      {
        name: "Clase muestra Barre",
        classCategory: "all",
        repeatKey: "trial_single_session_barre",
        sortOrder: 0,
      }
    ];
    for (const sp of samplePlans) {
      const features = JSON.stringify(["1 clase de muestra", "No transferible", "No repetible"]);
      const updateRes = await pool.query(
        `UPDATE plans
           SET price = 50,
               currency = 'MXN',
               duration_days = 7,
               class_limit = 1,
               class_category = $2,
               features = $3::jsonb,
               is_active = true,
               is_non_transferable = true,
               is_non_repeatable = true,
               repeat_key = $4,
               sort_order = $5,
               updated_at = NOW()
         WHERE name = $1`,
        [sp.name, sp.classCategory, features, sp.repeatKey, sp.sortOrder]
      );
      if (updateRes.rowCount === 0) {
        await pool.query(
          `INSERT INTO plans
            (name, description, price, currency, duration_days, class_limit, class_category, features, is_active, sort_order, is_non_transferable, is_non_repeatable, repeat_key)
           VALUES
            ($1, $2, 50, 'MXN', 7, 1, $3, $4::jsonb, true, $5, true, true, $6)`,
          [
            sp.name,
            "Clase muestra individual. No transferible y no repetible.",
            sp.classCategory,
            features,
            sp.sortOrder,
            sp.repeatKey,
          ]
        );
      }
    }
    // ── Ensure "Clase suelta — Visita" $125 plan exists ──
    {
      const visitaFeatures = JSON.stringify(["1 clase cualquier disciplina", "No transferible"]);
      const visitaUpdate = await pool.query(
        `UPDATE plans SET price = 125, currency = 'MXN', duration_days = 30, class_limit = 1,
                class_category = 'all', features = $1::jsonb, is_active = true,
                is_non_transferable = true, is_non_repeatable = false, sort_order = -1, updated_at = NOW()
         WHERE name = 'Clase suelta — Visita'`,
        [visitaFeatures]
      );
      if (visitaUpdate.rowCount === 0) {
        await pool.query(
          `INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, features, is_active, sort_order, is_non_transferable, is_non_repeatable)
           VALUES ('Clase suelta — Visita', 'Una clase de barre. Pago por sesion.', 125, 'MXN', 30, 1, 'all', $1::jsonb, true, -1, true, false)`,
          [visitaFeatures]
        );
      }
    }
    // ── Products table ─────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name       VARCHAR(150) NOT NULL,
        price      DECIMAL(10,2) DEFAULT 0,
        category   VARCHAR(50) DEFAULT 'accesorios',
        stock      INTEGER DEFAULT 0,
        sku        VARCHAR(100),
        is_active  BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // ── Order items table ───────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        quantity   INTEGER NOT NULL DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    `);
    // ── Payment proofs table ────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_proofs (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        file_url    TEXT NOT NULL,
        file_name   VARCHAR(255),
        mime_type   VARCHAR(100),
        status      VARCHAR(30) NOT NULL DEFAULT 'pending',
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT uq_payment_proofs_order UNIQUE (order_id)
      );
      CREATE INDEX IF NOT EXISTS idx_payment_proofs_order ON payment_proofs(order_id);
    `);
    // ── Instructors table ──────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS instructors (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        display_name VARCHAR(150) NOT NULL,
        email        VARCHAR(255),
        phone        VARCHAR(30),
        bio          TEXT,
        specialties  TEXT,
        photo_url    TEXT,
        is_active    BOOLEAN DEFAULT true,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`ALTER TABLE instructors ADD COLUMN IF NOT EXISTS photo_focus_x SMALLINT DEFAULT 50`).catch(() => {});
    await pool.query(`ALTER TABLE instructors ADD COLUMN IF NOT EXISTS photo_focus_y SMALLINT DEFAULT 50`).catch(() => {});
    // ── Reviews table ──────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
        rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment     TEXT,
        class_id    UUID,
        is_approved BOOLEAN DEFAULT false,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
    `);
    // Ensure all review columns exist even if table was created by an older schema
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id UUID`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS rating SMALLINT`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS overall_rating SMALLINT`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS comment TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS class_id UUID`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`).catch(() => {});
    await pool.query(`UPDATE reviews SET rating = COALESCE(rating, overall_rating, 5) WHERE rating IS NULL`).catch(() => {});
    await pool.query(`UPDATE reviews SET overall_rating = COALESCE(overall_rating, rating, 5) WHERE overall_rating IS NULL`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ALTER COLUMN rating SET DEFAULT 5`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ALTER COLUMN overall_rating SET DEFAULT 5`).catch(() => {});
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'reviews_rating_check'
            AND conrelid = 'reviews'::regclass
        ) THEN
          ALTER TABLE reviews ADD CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5);
        END IF;
      END $$;
    `).catch(() => {});
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='reviews' AND column_name='overall_rating'
        ) AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'reviews_overall_rating_check'
            AND conrelid = 'reviews'::regclass
        ) THEN
          ALTER TABLE reviews ADD CONSTRAINT reviews_overall_rating_check CHECK (overall_rating BETWEEN 1 AND 5);
        END IF;
      END $$;
    `).catch(() => {});
    await pool.query(`ALTER TABLE reviews ALTER COLUMN rating SET NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ALTER COLUMN overall_rating SET NOT NULL`).catch(() => {});
    await pool.query(`
      CREATE OR REPLACE FUNCTION reviews_sync_overall_rating()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.overall_rating := COALESCE(NEW.overall_rating, NEW.rating, 5);
        NEW.rating := COALESCE(NEW.rating, NEW.overall_rating, 5);
        RETURN NEW;
      END;
      $$;
    `).catch(() => {});
    await pool.query(`DROP TRIGGER IF EXISTS trg_reviews_sync_overall_rating ON reviews`).catch(() => {});
    await pool.query(`
      CREATE TRIGGER trg_reviews_sync_overall_rating
      BEFORE INSERT OR UPDATE ON reviews
      FOR EACH ROW
      EXECUTE FUNCTION reviews_sync_overall_rating();
    `).catch(() => {});
    // Add booking_id, instructor_id, tag_ids columns to reviews if missing
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS booking_id UUID`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS instructor_id UUID`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tag_ids UUID[] DEFAULT '{}'`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reviews_booking ON reviews(booking_id)`).catch(() => {});
    await pool.query(`
      DELETE FROM reviews a
      USING reviews b
      WHERE a.booking_id IS NOT NULL
        AND a.booking_id = b.booking_id
        AND a.created_at < b.created_at
    `).catch(() => {});
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_booking_unique
      ON reviews(booking_id)
      WHERE booking_id IS NOT NULL
    `).catch((err) => {
      console.warn("[DB] Could not create unique review index on booking_id:", err?.message || err);
    });
    // ── Review-tag links (many-to-many) ────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS review_tag_links (
        review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
        tag_id    UUID REFERENCES review_tags(id) ON DELETE CASCADE,
        PRIMARY KEY (review_id, tag_id)
      );
    `).catch(() => {});
    // ── Loyalty transactions table ─────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        VARCHAR(10) NOT NULL CHECK (type IN ('earn','redeem','adjust')),
        points      INTEGER NOT NULL,
        description TEXT,
        created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_loyalty_tx_user ON loyalty_transactions(user_id)`).catch(() => { });
    // ── referrals table (tracks which users were referred) ─────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        referral_code_id UUID REFERENCES referral_codes(id) ON DELETE CASCADE,
        referred_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        rewarded         BOOLEAN DEFAULT false,
        created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code_id)`).catch(() => { });
    // ── orders: add missing columns if needed ─────────────────────────────
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code_id UUID REFERENCES discount_codes(id) ON DELETE SET NULL`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(30) DEFAULT 'web'`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS plan_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS verified_by UUID`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(20)`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number) WHERE order_number IS NOT NULL`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_discount_code_id ON orders(discount_code_id)`).catch(() => { });
    // Make plan_id nullable (POS orders don't always have a plan)
    await pool.query(`ALTER TABLE orders ALTER COLUMN plan_id DROP NOT NULL`).catch(() => { });
    // Make user_id nullable (walk-in POS sales may not have a user)
    await pool.query(`ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL`).catch(() => { });
    // ── memberships: add order_id column ─────────────────────────────────
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS order_id UUID`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_order ON memberships(order_id) WHERE order_id IS NOT NULL`).catch(() => { });
    // ── memberships: add fallback name/limit override columns ─────────────
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS plan_name_override VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS class_limit_override INTEGER`).catch(() => { });
    // Fix existing 9999 unlimited sentinel values → NULL
    await pool.query(`
      UPDATE memberships SET classes_remaining = NULL WHERE classes_remaining >= 9999;
    `).catch(() => { });
    // ── memberships: track how many times a user has cancelled ────────────
    await pool.query(`
      ALTER TABLE memberships ADD COLUMN IF NOT EXISTS cancellations_used INTEGER NOT NULL DEFAULT 0;
    `).catch(() => { });
    // ── Reconcile cancellations_used with actual cancelled bookings ────────
    await pool.query(`
      UPDATE memberships m
      SET cancellations_used = sub.cnt
      FROM (
        SELECT b.membership_id, COUNT(*) AS cnt
        FROM bookings b
        WHERE b.status = 'cancelled' AND b.membership_id IS NOT NULL
        GROUP BY b.membership_id
      ) sub
      WHERE m.id = sub.membership_id AND m.cancellations_used != sub.cnt;
    `).catch(() => { });
    // ── homepage_video_cards: editable 3-card section on landing page ──────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS homepage_video_cards (
        id          SERIAL PRIMARY KEY,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        title       VARCHAR(120) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        emoji       VARCHAR(10)  NOT NULL DEFAULT '🎬',
        video_url   TEXT,
        updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });
    // Add video_url column if table already existed
    await pool.query(`ALTER TABLE homepage_video_cards ADD COLUMN IF NOT EXISTS video_url TEXT`).catch(() => { });
    // Add thumbnail_url column for custom poster images
    await pool.query(`ALTER TABLE homepage_video_cards ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`).catch(() => { });
    // seed default cards only when table is empty
    await pool.query(`
      INSERT INTO homepage_video_cards (sort_order, title, description, emoji)
      SELECT * FROM (VALUES
        (1, 'Jumping Fitness', 'Cardio de alta intensidad en trampolín con música que te hará volar.', 'dumbbell'),
        (2, 'Jumping Dance',   'Coreografías sobre el trampolín que combinan ritmo y diversión.',     'music'),
        (3, 'Pilates Flow',    'Secuencias fluidas para fortalecer tu core y mejorar postura.',        'waves')
      ) AS v(sort_order, title, description, emoji)
      WHERE NOT EXISTS (SELECT 1 FROM homepage_video_cards LIMIT 1);
    `).catch(() => { });
    // Migrate old emoji values to icon keys
    await pool.query(`
      UPDATE homepage_video_cards SET emoji = CASE emoji
        WHEN '🏋️' THEN 'dumbbell' WHEN '🏋' THEN 'dumbbell'
        WHEN '💃' THEN 'music' WHEN '🧘' THEN 'waves'
        WHEN '🔥' THEN 'flame' WHEN '⚡' THEN 'zap'
        WHEN '❤️' THEN 'heart' WHEN '💪' THEN 'activity'
        WHEN '✨' THEN 'sparkles' WHEN '🎬' THEN 'activity'
        ELSE emoji END
      WHERE emoji NOT IN ('dumbbell','music','waves','flame','zap','heart','activity','sparkles');
    `).catch(() => { });
    // ── discount_codes: normalise discount_type values ────────────────────
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS min_order_amount DECIMAL(10,2) DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id) ON DELETE SET NULL`).catch(() => { });
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS class_category VARCHAR(20)`).catch(() => { });
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'all'`).catch(() => { });
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_discount_codes_plan ON discount_codes(plan_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_discount_codes_category ON discount_codes(class_category)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_discount_codes_channel ON discount_codes(channel)`).catch(() => { });
    await pool.query(`UPDATE discount_codes SET discount_type = 'percent' WHERE discount_type IN ('percentage', 'porcentaje', '%')`).catch(() => { });
    await pool.query(`UPDATE discount_codes SET channel = 'all' WHERE channel IS NULL OR channel = ''`).catch(() => { });
    await pool.query(`UPDATE discount_codes SET class_category = NULL WHERE class_category NOT IN ('all','jumping','pilates','mixto')`).catch(() => { });
    // ── bookings: add checked_in_at column ────────────────────────────────
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP WITH TIME ZONE`).catch(() => { });
    // ── Kala progress rings: weekly goals, community actions, risk and wallet sync ──
    await pool.query(`
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
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ring_states_user_week ON ring_states(user_id, week_start DESC)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ring_states_week ON ring_states(week_start DESC)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ring_states_membership ON ring_states(membership_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ring_states_reward ON ring_states(reward_unlocked, reward_claimed_at)`).catch(() => { });
    await pool.query(`
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
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_community_events_user_time ON community_events(user_id, occurred_at DESC)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_community_events_type ON community_events(event_type)`).catch(() => { });
    await pool.query(`
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
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_risk_scores_user_date ON risk_scores(user_id, computed_for_date DESC)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_risk_scores_level ON risk_scores(risk_level)`).catch(() => { });
    await pool.query(`
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
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_update_queue_status ON wallet_update_queue(status, available_at)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_update_queue_user ON wallet_update_queue(user_id)`).catch(() => { });
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_ring_states_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `).catch(() => { });
    await pool.query(`DROP TRIGGER IF EXISTS trg_ring_states_updated_at ON ring_states`).catch(() => { });
    await pool.query(`
      CREATE TRIGGER trg_ring_states_updated_at
      BEFORE UPDATE ON ring_states
      FOR EACH ROW EXECUTE FUNCTION update_ring_states_updated_at();
    `).catch(() => { });
    await pool.query(`
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
    `).catch(() => { });
    await pool.query(`DROP TRIGGER IF EXISTS trg_ring_states_wallet_queue ON ring_states`).catch(() => { });
    await pool.query(`
      CREATE TRIGGER trg_ring_states_wallet_queue
      AFTER INSERT OR UPDATE ON ring_states
      FOR EACH ROW EXECUTE FUNCTION enqueue_wallet_update_from_ring_state();
    `).catch(() => { });
    await pool.query(`
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
    `).catch(() => { });
    await pool.query(`DROP TRIGGER IF EXISTS trg_bookings_recalculate_kala_rings ON bookings`).catch(() => { });
    await pool.query(`
      CREATE TRIGGER trg_bookings_recalculate_kala_rings
      AFTER INSERT OR UPDATE ON bookings
      FOR EACH ROW EXECUTE FUNCTION recalculate_kala_rings_on_checkin();
    `).catch(() => { });
    await pool.query(`
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
    `).catch(() => { });
    await pool.query(`DROP TRIGGER IF EXISTS trg_community_events_recalculate_kala_rings ON community_events`).catch(() => { });
    await pool.query(`
      CREATE TRIGGER trg_community_events_recalculate_kala_rings
      AFTER INSERT ON community_events
      FOR EACH ROW EXECUTE FUNCTION recalculate_kala_rings_on_community_event();
    `).catch(() => { });
    // ── Settings table ─────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key        VARCHAR(100) PRIMARY KEY,
        value      JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      ["general_settings", JSON.stringify(DEFAULT_GENERAL_SETTINGS)],
    ).catch(() => { });
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      ["policies_settings", JSON.stringify(DEFAULT_POLICIES_SETTINGS)],
    ).catch(() => { });
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      ["notification_settings", JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS)],
    ).catch(() => { });
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      ["notification_templates", JSON.stringify(DEFAULT_NOTIFICATION_TEMPLATES)],
    ).catch(() => { });
    for (const [settingKey, defaults] of Object.entries(DEFAULT_SETTINGS_BY_KEY)) {
      await pool.query(
        `UPDATE settings
            SET value = $2::jsonb || COALESCE(value, '{}'::jsonb),
                updated_at = NOW()
          WHERE key = $1 AND jsonb_typeof(value) = 'object'`,
        [settingKey, JSON.stringify(defaults)],
      ).catch(() => { });
    }
    // ── Loyalty rewards table ──────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loyalty_rewards (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name         VARCHAR(150) NOT NULL,
        description  TEXT,
        points_cost  INTEGER NOT NULL,
        reward_type  VARCHAR(30) NOT NULL DEFAULT 'custom',
        reward_value VARCHAR(150),
        stock        INTEGER,
        is_active    BOOLEAN DEFAULT true,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // ── Loyalty rewards: add new columns if table already exists ───────────
    await pool.query(`ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS reward_type  VARCHAR(30) NOT NULL DEFAULT 'custom'`).catch(() => { });
    await pool.query(`ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS reward_value VARCHAR(150)`).catch(() => { });
    await pool.query(`ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS stock        INTEGER`).catch(() => { });
    // ── Apple Wallet device registration table ────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS apple_wallet_devices (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id      VARCHAR(255) NOT NULL,
        push_token     VARCHAR(255) NOT NULL DEFAULT '',
        pass_type_id   VARCHAR(255) NOT NULL,
        serial_number  VARCHAR(255) NOT NULL,
        created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(device_id, pass_type_id, serial_number)
      );
    `).catch(() => { });
    // Backward compatibility: some DBs still have the old wallet schema
    // (device_id, pass_type_id, membership_id) without serial_number.
    await pool.query(`ALTER TABLE apple_wallet_devices ADD COLUMN IF NOT EXISTS serial_number VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE apple_wallet_devices ADD COLUMN IF NOT EXISTS pass_type_id VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE apple_wallet_devices ADD COLUMN IF NOT EXISTS push_token VARCHAR(255) NOT NULL DEFAULT ''`).catch(() => { });
    await pool.query(`
      UPDATE apple_wallet_devices
      SET serial_number = CONCAT(
        'legacy_',
        REPLACE(COALESCE(membership_id::text, id::text), '-', '')
      )
      WHERE serial_number IS NULL OR serial_number = ''
    `).catch(() => { });
    await pool.query(`ALTER TABLE apple_wallet_devices ALTER COLUMN serial_number SET NOT NULL`).catch(() => { });
    await pool.query(`ALTER TABLE apple_wallet_devices ALTER COLUMN membership_id DROP NOT NULL`).catch(() => { });
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_apple_wallet_devices_device_pass_serial
      ON apple_wallet_devices(device_id, pass_type_id, serial_number)
    `).catch(() => { });
    // ── Wallet push notifications log ─────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_notification_logs (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
        reason         VARCHAR(160) NOT NULL DEFAULT 'wallet_update',
        apple_sent     INTEGER NOT NULL DEFAULT 0,
        apple_failed   INTEGER NOT NULL DEFAULT 0,
        google_synced  BOOLEAN NOT NULL DEFAULT false,
        google_mode    VARCHAR(40),
        status         VARCHAR(20) NOT NULL DEFAULT 'ok',
        detail         JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_notification_logs_user ON wallet_notification_logs(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_notification_logs_created_at ON wallet_notification_logs(created_at DESC)`).catch(() => { });
    // ── Review tags table ──────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS review_tags (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name       VARCHAR(100) NOT NULL,
        color      VARCHAR(20) DEFAULT '#c026d3',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // ── Videos: add price column (may fail if videos table not yet created) ─
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS price DECIMAL(10,2)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(500)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS cloudinary_id VARCHAR(500)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_drive_id VARCHAR(500)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS subtitle VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS tagline VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS days VARCHAR(100)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS brand_color VARCHAR(7)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS sales_enabled BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS sales_unlocks_video BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS sales_price_mxn DECIMAL(10,2)`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS sales_class_credits INTEGER`).catch(() => { });
    await pool.query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS sales_cta_text VARCHAR(100)`).catch(() => { });
    // ── Video purchases: add admin_notes and verified_at ──────────────────
    await pool.query(`ALTER TABLE video_purchases ADD COLUMN IF NOT EXISTS admin_notes TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE video_purchases ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE`).catch(() => { });

    // ── Módulo de Eventos ────────────────────────────────────────────────
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE event_type AS ENUM (
          'masterclass','workshop','retreat','challenge','openhouse','special'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type                event_type NOT NULL,
        title               VARCHAR(200) NOT NULL,
        description         TEXT NOT NULL,
        instructor_name     VARCHAR(100) NOT NULL,
        instructor_photo    TEXT,
        date                DATE NOT NULL,
        start_time          TIME NOT NULL,
        end_time            TIME NOT NULL,
        location            VARCHAR(200) NOT NULL,
        capacity            INTEGER NOT NULL DEFAULT 1,
        registered          INTEGER DEFAULT 0,
        price               NUMERIC(10,2) NOT NULL DEFAULT 0,
        currency            VARCHAR(3) DEFAULT 'MXN',
        early_bird_price    NUMERIC(10,2),
        early_bird_deadline DATE,
        member_discount     NUMERIC(5,2) DEFAULT 0,
        image               TEXT,
        requirements        VARCHAR(500) DEFAULT '',
        includes            JSONB DEFAULT '[]',
        tags                JSONB DEFAULT '[]',
        status              VARCHAR(20) DEFAULT 'draft',
        created_by          UUID,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_registrations (
        id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_id                UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_id                 UUID,
        name                    VARCHAR(100) NOT NULL,
        email                   VARCHAR(255) NOT NULL,
        phone                   VARCHAR(20) DEFAULT '',
        status                  VARCHAR(20) DEFAULT 'pending',
        amount                  NUMERIC(10,2) DEFAULT 0,
        payment_method          VARCHAR(20),
        payment_reference       VARCHAR(200),
        payment_proof_url       TEXT,
        payment_proof_file_name VARCHAR(255),
        transfer_date           DATE,
        paid_at                 TIMESTAMPTZ,
        checked_in              BOOLEAN DEFAULT false,
        checked_in_at           TIMESTAMPTZ,
        checked_in_by           UUID,
        waitlist_position       INTEGER,
        notes                   TEXT,
        created_at              TIMESTAMPTZ DEFAULT NOW(),
        updated_at              TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_status    ON events(status)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_date       ON events(date)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_type       ON events(type)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_regs_event  ON event_registrations(event_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_regs_user   ON event_registrations(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_regs_status ON event_registrations(status)`).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_passes (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        registration_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
        user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pass_code      VARCHAR(60) NOT NULL UNIQUE,
        status         VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','used','cancelled')),
        issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        used_at        TIMESTAMPTZ,
        cancelled_at   TIMESTAMPTZ,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_passes_user ON event_passes(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_passes_event ON event_passes(event_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_passes_status ON event_passes(status)`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_event_passes_registration_unique ON event_passes(registration_id) WHERE registration_id IS NOT NULL`).catch(() => { });

    console.log("✅ Schema ensured");
  } catch (err) {
    console.error("Schema migration warning:", err.message);
  }

  // ── Seed demo classes for the next 4 weeks (only if classes table is empty) ──
  try {
    // First ensure at least one instructor exists
    const instCount = await pool.query("SELECT COUNT(*) FROM instructors");
    if (parseInt(instCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO instructors (display_name, email, bio, specialties, is_active) VALUES
          ('Valeria Mendoza',  'valeria@kalabarre.mx',  'Instructora certificada de Jumping Fitness con 5 años de experiencia.', 'Jumping Fitness,Jumping Dance,Strong Jump', true),
          ('Daniela Reyes',    'daniela@kalabarre.mx',  'Especialista en Pilates y movimiento consciente.', 'Hot Pilates,Flow Pilates,Pilates Mat,Mindful Jump', true),
          ('Sofía Torres',     'sofia@kalabarre.mx',    'Instructora de Jump & Tone y entrenamientos funcionales.', 'Jump & Tone,Strong Jump,Jumping Fitness', true),
          ('Camila Vargas',    'camila@kalabarre.mx',   'Certificada en Pilates mat y reformer.', 'Pilates Mat,Flow Pilates,Hot Pilates', true)
        ON CONFLICT DO NOTHING;
      `);
      console.log("✅ Seeded 4 demo instructors");
    }

    const classCount = await pool.query("SELECT COUNT(*) FROM classes");
    if (parseInt(classCount.rows[0].count) === 0) {
      // Fetch real class_type ids and instructor ids from DB
      const typesRes = await pool.query(
        "SELECT id, name FROM class_types WHERE is_active = true ORDER BY sort_order ASC LIMIT 8"
      );
      const instRes = await pool.query(
        "SELECT id FROM instructors WHERE is_active = true ORDER BY created_at ASC LIMIT 4"
      );

      if (typesRes.rows.length > 0 && instRes.rows.length > 0) {
        const types = typesRes.rows;       // [{id, name}, ...]
        const insts = instRes.rows;        // [{id}, ...]
        const getType = (i) => types[i % types.length].id;
        const getInst = (i) => insts[i % insts.length].id;

        // Build classes for Mon–Sat for the next 4 weeks
        const today = new Date();
        // Find Monday of current week
        const dayOfWeek = today.getDay(); // 0=Sun
        const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMon);

        // Time slots: morning + evening
        const SLOTS = [
          { hour: 7, min: 0, dur: 55 },
          { hour: 9, min: 0, dur: 55 },
          { hour: 11, min: 0, dur: 60 },
          { hour: 18, min: 0, dur: 55 },
          { hour: 19, min: 30, dur: 55 },
        ];
        // Days: Mon(1)–Sat(6), no Sunday
        const DAYS = [0, 1, 2, 3, 4, 5]; // offset from monday

        let typeIdx = 0;
        let instIdx = 0;
        const inserts = [];

        for (let week = 0; week < 4; week++) {
          for (const dayOffset of DAYS) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + week * 7 + dayOffset);
            const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD

            // Not every slot on every day — skip some to feel realistic
            const slotsToday = SLOTS.filter((_, si) => {
              // Weekends (Sat = offset 5) only morning slots
              if (dayOffset === 5 && si > 2) return false;
              // Some variety: skip slot if typeIdx+dayOffset+si is divisible by 7
              if ((typeIdx + dayOffset + si) % 7 === 0) return false;
              return true;
            });

            for (const slot of slotsToday) {
              const startH = String(slot.hour).padStart(2, "0");
              const startM = String(slot.min).padStart(2, "0");
              const totalMin = slot.hour * 60 + slot.min + slot.dur;
              const endH = String(Math.floor(totalMin / 60)).padStart(2, "0");
              const endM = String(totalMin % 60).padStart(2, "0");
              inserts.push({
                classTypeId: getType(typeIdx),
                instructorId: getInst(instIdx),
                date: dateStr,
                startTime: `${startH}:${startM}`,
                endTime: `${endH}:${endM}`,
                maxCapacity: 10,
              });
              typeIdx++;
              instIdx++;
            }
          }
        }

        for (const c of inserts) {
          await pool.query(
            `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
             VALUES ($1,$2,$3,$4,$5,$6,'scheduled') ON CONFLICT DO NOTHING`,
            [c.classTypeId, c.instructorId, c.date, c.startTime, c.endTime, c.maxCapacity]
          );
        }
        console.log(`✅ Seeded ${inserts.length} demo classes for the next 4 weeks`);
      }
    }
  } catch (err) {
    console.error("Demo classes seed warning:", err.message);
  }


  try {
    const adminHash = await bcrypt.hash("Ophelia2026!", 12);
    await pool.query(
      `INSERT INTO users (display_name, email, phone, password_hash, role, accepts_terms, accepts_communications)
       VALUES ('Admin Ophelia', 'admin@kalabarre.mx', '0000000000', $1, 'admin', true, false)
       ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = $1`,
      [adminHash]
    );
    console.log("✅ Admin user ready: admin@kalabarre.mx / Ophelia2026!");
  } catch (err) {
    console.error("Admin seed warning:", err.message);
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────
const CORS_ALLOWED_ORIGINS = String(
  process.env.CORS_ALLOWED_ORIGINS ||
  "https://kala-barre-studio.com.mx,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080",
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const SECURITY_RATE_LIMIT_WINDOW_MS = Math.max(10_000, Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000));
const SECURITY_RATE_LIMIT_MAX = Math.max(30, Number(process.env.API_RATE_LIMIT_MAX || 180));
const SECURITY_AUTH_WINDOW_MS = Math.max(10_000, Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000));
const SECURITY_AUTH_MAX = Math.max(5, Number(process.env.AUTH_RATE_LIMIT_MAX || 20));

app.disable("x-powered-by");
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser / same-origin server requests (no Origin header).
    if (!origin) return callback(null, true);
    if (CORS_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error("Origen no permitido por CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

const rateLimitBuckets = new Map();
function getRateLimitIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (forwarded) return forwarded;
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}
function createSimpleRateLimiter({ windowMs, max, keyPrefix, shouldApply }) {
  return (req, res, next) => {
    if (!shouldApply(req)) return next();
    const ip = getRateLimitIp(req);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const current = rateLimitBuckets.get(key);
    if (!current || current.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (current.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ message: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." });
    }
    current.count += 1;
    return next();
  };
}
// Best-effort in-memory cleanup to avoid unbounded map growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitBuckets.entries()) {
    if (!value || value.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, 60_000).unref();

app.use(createSimpleRateLimiter({
  windowMs: SECURITY_RATE_LIMIT_WINDOW_MS,
  max: SECURITY_RATE_LIMIT_MAX,
  keyPrefix: "api",
  shouldApply: (req) =>
    req.path.startsWith("/api/") &&
    !req.path.startsWith("/api/wallet/v1/") &&
    req.path !== "/api/webhook/evolution",
}));
app.use(createSimpleRateLimiter({
  windowMs: SECURITY_AUTH_WINDOW_MS,
  max: SECURITY_AUTH_MAX,
  keyPrefix: "auth",
  shouldApply: (req) =>
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/register" ||
    req.path === "/api/auth/forgot-password" ||
    req.path === "/api/auth/reset-password",
}));

// Skip JSON body parsing for binary upload-chunk endpoint
app.use((req, res, next) => {
  if (req.path.startsWith("/api/drive/upload-chunk/")) return next();
  express.json({ limit: "20mb" })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path.startsWith("/api/drive/upload-chunk/")) return next();
  express.urlencoded({ extended: true, limit: "20mb" })(req, res, next);
});

// ─── Helper: snake_case → camelCase row mapper ──────────────────────────────
function camelRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}
function camelRows(rows) { return rows.map(camelRow); }

function normalizeDiscountType(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "percent" || raw === "percentage" || raw === "%") return "percent";
  if (raw === "fixed" || raw === "amount" || raw === "monto") return "fixed";
  return null;
}

function calculateDiscountAmount(type, value, subtotal) {
  const safeSubtotal = Number(subtotal || 0);
  const safeValue = Number(value || 0);
  if (safeSubtotal <= 0 || safeValue <= 0) return 0;
  const normalized = normalizeDiscountType(type);
  const amount = normalized === "percent"
    ? safeSubtotal * (safeValue / 100)
    : safeValue;
  return Math.max(0, Math.min(amount, safeSubtotal));
}

function normalizeClassCategory(value, fallback = "all") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["jumping", "pilates", "mixto", "all"].includes(raw)) return raw;
  return fallback;
}

function normalizeDiscountChannel(value, fallback = "all") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["all", "membership", "pos", "event"].includes(raw)) return raw;
  return fallback;
}

function isUnlimitedClasses(value) {
  return value === null || value === undefined || Number(value) >= 9999;
}

function isMembershipCategoryCompatible(membershipCategory, classCategory) {
  const memCat = normalizeClassCategory(membershipCategory, "all");
  const clsCat = normalizeClassCategory(classCategory, "all");
  if (clsCat === "all") return true;
  if (memCat === "all" || memCat === "mixto") return true;
  return memCat === clsCat;
}

async function selectMembershipForClass({ userId, classCategory, client = null }) {
  if (!userId) return null;
  const q = client ?? pool;
  const clsCat = normalizeClassCategory(classCategory, "all");
  const r = await q.query(
    `SELECT m.id,
            m.user_id,
            m.classes_remaining,
            m.end_date,
            m.created_at,
            COALESCE(p.class_category, 'all') AS class_category
       FROM memberships m
       LEFT JOIN plans p ON p.id = m.plan_id
      WHERE m.user_id = $1
        AND m.status = 'active'
        AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
        AND (
          COALESCE(p.class_category, 'all') IN ('all', 'mixto')
          OR COALESCE(p.class_category, 'all') = $2
        )
        AND (
          m.classes_remaining IS NULL
          OR m.classes_remaining >= 9999
          OR m.classes_remaining > 0
        )
      ORDER BY
        CASE
          WHEN COALESCE(p.class_category, 'all') = $2 THEN 0
          WHEN COALESCE(p.class_category, 'all') = 'mixto' THEN 1
          WHEN COALESCE(p.class_category, 'all') = 'all' THEN 2
          ELSE 3
        END ASC,
        CASE WHEN m.end_date IS NULL THEN 1 ELSE 0 END ASC,
        m.end_date ASC,
        CASE WHEN m.classes_remaining IS NULL OR m.classes_remaining >= 9999 THEN 1 ELSE 0 END ASC,
        m.created_at ASC
      LIMIT 1`,
    [userId, clsCat]
  );
  return r.rows[0] ?? null;
}

async function findApplicableDiscountCode({
  code,
  subtotal,
  planId = null,
  classCategory = "all",
  channel = "all",
  client = null,
}) {
  if (!code) return null;
  const q = client ?? pool;
  const normalizedCode = String(code).toUpperCase().trim();
  const normalizedChannel = normalizeDiscountChannel(channel, "all");
  const normalizedCategory = normalizeClassCategory(classCategory, "all");
  const r = await q.query(
    `SELECT *
       FROM discount_codes
      WHERE code = $1
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (max_uses IS NULL OR uses_count < max_uses)
        AND (channel = 'all' OR channel = $2)
        AND (plan_id IS NULL OR plan_id = $3)
        AND (
          class_category IS NULL
          OR class_category = 'all'
          OR class_category = $4
          OR (class_category = 'mixto' AND $4 IN ('jumping','pilates'))
        )
      ORDER BY
        CASE WHEN plan_id IS NULL THEN 1 ELSE 0 END ASC,
        CASE WHEN class_category IS NULL OR class_category = 'all' THEN 1 ELSE 0 END ASC
      LIMIT 1`,
    [normalizedCode, normalizedChannel, planId, normalizedCategory]
  );
  if (!r.rows.length) return null;
  const dc = r.rows[0];
  const safeSubtotal = Number(subtotal || 0);
  const minOrderAmount = Number(dc.min_order_amount || 0);
  if (safeSubtotal < minOrderAmount) {
    return {
      code: dc,
      discountAmount: 0,
      minOrderAmount,
      rejectedByMinOrder: true,
    };
  }
  const discountAmount = calculateDiscountAmount(dc.discount_type, dc.discount_value, safeSubtotal);
  return {
    code: dc,
    discountAmount,
    minOrderAmount,
    rejectedByMinOrder: false,
  };
}

async function incrementDiscountUsage(discountId, client = null) {
  if (!discountId) return null;
  const q = client ?? pool;
  const r = await q.query(
    `UPDATE discount_codes
        SET uses_count = uses_count + 1,
            updated_at = NOW()
      WHERE id = $1
        AND (max_uses IS NULL OR uses_count < max_uses)
    RETURNING id, uses_count, max_uses`,
    [discountId]
  );
  if (!r.rows.length) {
    const usageErr = new Error("El código de descuento alcanzó su límite de usos");
    usageErr.status = 409;
    throw usageErr;
  }
  return r.rows[0];
}

function buildEventPassCode(eventId, userId) {
  const eventPart = String(eventId || "").replace(/-/g, "").slice(0, 6).toUpperCase();
  const userPart = String(userId || "").replace(/-/g, "").slice(-4).toUpperCase();
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `EV-${eventPart}-${userPart}-${randomPart}`;
}

async function ensureEventPassForRegistration({ eventId, registrationId, userId, client = null }) {
  if (!eventId || !registrationId || !userId) return null;
  const q = client ?? pool;

  const existing = await q.query(
    "SELECT * FROM event_passes WHERE registration_id = $1 LIMIT 1",
    [registrationId]
  );
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.status === "issued") return row;
    const updated = await q.query(
      `UPDATE event_passes
          SET event_id = $1,
              user_id = $2,
              status = 'issued',
              issued_at = NOW(),
              used_at = NULL,
              cancelled_at = NULL,
              updated_at = NOW()
        WHERE id = $3
      RETURNING *`,
      [eventId, userId, row.id]
    );
    return updated.rows[0] ?? row;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const passCode = buildEventPassCode(eventId, userId);
    try {
      const inserted = await q.query(
        `INSERT INTO event_passes (event_id, registration_id, user_id, pass_code, status, issued_at)
         VALUES ($1, $2, $3, $4, 'issued', NOW())
         RETURNING *`,
        [eventId, registrationId, userId, passCode]
      );
      return inserted.rows[0] ?? null;
    } catch (err) {
      if (err?.code !== "23505") throw err;
    }
  }

  throw new Error("No se pudo generar un pase único para el evento");
}

async function cancelEventPassByRegistration({ registrationId, client = null }) {
  if (!registrationId) return null;
  const q = client ?? pool;
  const r = await q.query(
    `UPDATE event_passes
        SET status = 'cancelled',
            cancelled_at = NOW(),
            updated_at = NOW()
      WHERE registration_id = $1
        AND status <> 'cancelled'
    RETURNING *`,
    [registrationId]
  );
  return r.rows[0] ?? null;
}

async function markEventPassUsedByRegistration({ registrationId, client = null }) {
  if (!registrationId) return null;
  const q = client ?? pool;
  const r = await q.query(
    `UPDATE event_passes
        SET status = 'used',
            used_at = NOW(),
            updated_at = NOW()
      WHERE registration_id = $1
        AND status = 'issued'
    RETURNING *`,
    [registrationId]
  );
  return r.rows[0] ?? null;
}

function normalizePosItems(items) {
  const qtyByProduct = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const productId = String(raw?.productId ?? "").trim();
    const qty = Number(raw?.qty ?? 0);
    if (!productId || !Number.isFinite(qty) || qty <= 0) continue;
    qtyByProduct.set(productId, (qtyByProduct.get(productId) || 0) + Math.floor(qty));
  }
  return Array.from(qtyByProduct.entries()).map(([productId, qty]) => ({ productId, qty }));
}

async function processPosSale({ userId, items, paymentMethod = "efectivo", discountCode = null }) {
  const normalizedItems = normalizePosItems(items);
  if (!normalizedItems.length) {
    return { error: { status: 400, message: "Se requieren artículos válidos" } };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const productIds = normalizedItems.map((item) => item.productId);
    const productsRes = await client.query(
      "SELECT * FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE",
      [productIds]
    );
    const productsById = new Map(productsRes.rows.map((p) => [p.id, p]));
    if (productsById.size !== productIds.length) {
      const missing = productIds.find((id) => !productsById.has(id));
      await client.query("ROLLBACK");
      return { error: { status: 404, message: `Producto ${missing} no encontrado` } };
    }

    let subtotal = 0;
    for (const item of normalizedItems) {
      const product = productsById.get(item.productId);
      if (Number(product.stock) < item.qty) {
        await client.query("ROLLBACK");
        return { error: { status: 400, message: `Stock insuficiente para ${product.name}` } };
      }
      subtotal += Number(product.price) * item.qty;
    }

    let discountAmount = 0;
    let discountCodeRow = null;
    if (discountCode) {
      const discount = await findApplicableDiscountCode({
        code: discountCode,
        subtotal,
        channel: "pos",
        classCategory: "all",
        client,
      });
      if (!discount) {
        await client.query("ROLLBACK");
        return { error: { status: 400, message: "Código de descuento no válido para POS" } };
      }
      if (discount.rejectedByMinOrder) {
        await client.query("ROLLBACK");
        return {
          error: {
            status: 400,
            message: `Compra mínima requerida: $${Number(discount.minOrderAmount || 0).toFixed(2)} MXN`,
          },
        };
      }
      discountAmount = discount.discountAmount;
      discountCodeRow = discount.code;
    }

    const total = Math.max(0, subtotal - discountAmount);
    const orderRes = await client.query(
      `INSERT INTO orders (
         user_id, subtotal, tax_amount, total_amount, payment_method,
         status, discount_amount, discount_code_id, channel
       )
       VALUES ($1,$2,0,$3,$4,'approved',$5,$6,'pos')
       RETURNING *`,
      [userId || null, subtotal, total, paymentMethod, discountAmount, discountCodeRow?.id ?? null]
    );
    const order = orderRes.rows[0];

    for (const item of normalizedItems) {
      const product = productsById.get(item.productId);
      await client.query(
        "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)",
        [order.id, item.productId, item.qty, product.price]
      );
      const stockUpdate = await client.query(
        "UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1",
        [item.qty, item.productId]
      );
      if (stockUpdate.rowCount === 0) {
        const stockErr = new Error(`Stock insuficiente para ${product.name}`);
        stockErr.status = 400;
        throw stockErr;
      }
    }

    if (discountCodeRow?.id) {
      await incrementDiscountUsage(discountCodeRow.id, client);
    }

    if (userId && total > 0) {
      const cfgRes = await client.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
      const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
      const pts = Math.floor(total * (cfg.points_per_peso ?? 1));
      if (cfg.enabled !== false && pts > 0) {
        await client.query(
          "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
          [userId, pts, `Venta POS — $${total}`]
        );
      }
    }

    await client.query("COMMIT");
    if (userId) {
      triggerWalletPassSync(userId, "pos_sale_approved");
    }
    return { data: order };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    throw err;
  } finally {
    client.release();
  }
}

async function awardBirthdayBonusIfEligible(userId, client = null) {
  if (!userId) return null;
  const q = client ?? pool;
  const userRes = await q.query(
    "SELECT date_of_birth FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  const dob = userRes.rows[0]?.date_of_birth;
  if (!dob) return null;

  const today = new Date();
  const birth = new Date(dob);
  const isBirthdayToday =
    birth.getUTCDate() === today.getUTCDate() &&
    birth.getUTCMonth() === today.getUTCMonth();
  if (!isBirthdayToday) return null;

  const cfgRes = await q.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
  const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
  const points = Number(cfg.birthday_bonus ?? 0);
  if (cfg.enabled === false || points <= 0) return null;

  const year = today.getUTCFullYear();
  const desc = `Bono de cumpleaños ${year}`;
  const exists = await q.query(
    "SELECT id FROM loyalty_transactions WHERE user_id = $1 AND description = $2 LIMIT 1",
    [userId, desc]
  );
  if (exists.rows.length) return null;

  const inserted = await q.query(
    "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3) RETURNING *",
    [userId, points, desc]
  );
  return inserted.rows[0] ?? null;
}

const NON_REPEATABLE_ORDER_BLOCK_STATUSES = ["pending_payment", "pending_verification", "approved"];

function parseBooleanFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return ["true", "1", "yes", "si", "sí", "t"].includes(v);
  }
  return false;
}

function getPlanRepeatKey(plan) {
  const raw = plan?.repeat_key ?? plan?.repeatKey;
  if (raw === null || raw === undefined) return null;
  const key = String(raw).trim();
  return key || null;
}

function getPlanFlags(plan) {
  return {
    isNonTransferable: parseBooleanFlag(plan?.is_non_transferable ?? plan?.isNonTransferable),
    isNonRepeatable: parseBooleanFlag(plan?.is_non_repeatable ?? plan?.isNonRepeatable),
    repeatKey: getPlanRepeatKey(plan),
  };
}

async function findNonRepeatablePlanConflict({
  userId,
  plan,
  excludeOrderId = null,
  client = null,
}) {
  if (!userId || !plan?.id) return null;
  const { isNonRepeatable, repeatKey } = getPlanFlags(plan);
  if (!isNonRepeatable) return null;

  const q = client ?? pool;
  const key = repeatKey || `plan:${plan.id}`;

  const memConflict = await q.query(
    `SELECT m.id, m.status, p.name AS plan_name
       FROM memberships m
       LEFT JOIN plans p ON p.id = m.plan_id
      WHERE m.user_id = $1
        AND (
          m.plan_id = $2
          OR (COALESCE(p.repeat_key, '') <> '' AND p.repeat_key = $3)
        )
      ORDER BY m.created_at DESC
      LIMIT 1`,
    [userId, plan.id, key]
  );
  if (memConflict.rows.length) {
    return {
      source: "membership",
      message: `La "${plan.name}" es de un solo uso, no transferible y no se puede repetir.`,
      detail: memConflict.rows[0],
    };
  }

  const params = [userId, plan.id, key, NON_REPEATABLE_ORDER_BLOCK_STATUSES];
  let orderSql = `
    SELECT o.id, o.status, p.name AS plan_name
      FROM orders o
      JOIN plans p ON p.id = o.plan_id
     WHERE o.user_id = $1
       AND (
         o.plan_id = $2
         OR (COALESCE(p.repeat_key, '') <> '' AND p.repeat_key = $3)
       )
       AND o.status::text = ANY($4::text[])
  `;
  if (excludeOrderId) {
    params.push(excludeOrderId);
    orderSql += ` AND o.id <> $${params.length}`;
  }
  orderSql += " ORDER BY o.created_at DESC LIMIT 1";

  const orderConflict = await q.query(orderSql, params);
  if (orderConflict.rows.length) {
    const status = orderConflict.rows[0].status;
    if (status === "pending_payment" || status === "pending_verification") {
      return {
        source: "order",
        message: "Ya tienes una sesión muestra en proceso. No puede repetirse.",
        detail: orderConflict.rows[0],
      };
    }
    return {
      source: "order",
      message: `La "${plan.name}" ya fue utilizada y no se puede repetir.`,
      detail: orderConflict.rows[0],
    };
  }

  return null;
}

function serializeSpecialtiesForDb(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const items = value.map((v) => String(v).trim()).filter(Boolean);
    return items.length ? JSON.stringify(items) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Already JSON string? keep as-is if parseable.
    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
      try {
        JSON.parse(trimmed);
        return trimmed;
      } catch (_) {
        // fall through and normalize as csv list
      }
    }
    const items = trimmed.split(",").map((v) => v.trim()).filter(Boolean);
    return JSON.stringify(items);
  }
  return JSON.stringify(value);
}

function normalizeQrDataUrl(raw) {
  if (!raw) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

function pickEvolutionQrPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  // Evolution often returns both "code" and "base64".
  // "code" is not always an image payload, so prefer explicit base64/image fields.
  const candidates = [
    payload?.base64,
    payload?.qrcode?.base64,
    payload?.qrCode?.base64,
    payload?.qr?.base64,
    payload?.instance?.qrcode?.base64,
    payload?.instance?.qrCode?.base64,
    payload?.instance?.qr?.base64,
    payload?.code,
    payload?.qrcode?.code,
    payload?.qrCode?.code,
    payload?.qr?.code,
  ];

  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("data:image/")) return trimmed;
    // Raw base64 image strings should not include separators like comma + '@'
    // seen in non-image "code" values.
    const looksLikeRawBase64Image =
      !trimmed.includes(",") &&
      !trimmed.includes("@") &&
      /^[A-Za-z0-9+/=]+$/.test(trimmed) &&
      trimmed.length > 120;
    if (looksLikeRawBase64Image) return trimmed;
  }
  return null;
}

// ─── Auth helpers ────────────────────────────────────────────────────────────
function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "30d" });
}

function normalizeEmailAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function isStrongPassword(password) {
  const candidate = String(password || "");
  return candidate.length >= 8 && /[A-Z]/.test(candidate) && /[0-9]/.test(candidate);
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "No autorizado" });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
}

async function adminMiddleware(req, res, next) {
  authMiddleware(req, res, async () => {
    try {
      const r = await pool.query("SELECT role FROM users WHERE id = $1", [req.userId]);
      if (!r.rows.length || !["admin", "super_admin", "instructor", "reception"].includes(r.rows[0].role)) {
        return res.status(403).json({ message: "Acceso restringido" });
      }
      next();
    } catch { return res.status(500).json({ message: "Error interno" }); }
  });
}

function mapUser(u) {
  return {
    id: u.id,
    displayName: u.display_name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    gender: u.gender ?? null,
    photoUrl: u.photo_url ?? null,
    dateOfBirth: u.date_of_birth ?? null,
    emergencyContactName: u.emergency_contact_name ?? null,
    emergencyContactPhone: u.emergency_contact_phone ?? null,
    healthNotes: u.health_notes ?? null,
    receiveReminders: u.receive_reminders ?? true,
    receivePromotions: u.receive_promotions ?? false,
    receiveWeeklySummary: u.receive_weekly_summary ?? false,
    createdAt: u.created_at,
  };
}

// ─── Routes: /api/auth ───────────────────────────────────────────────────────

// POST /api/auth/register
app.post("/api/auth/register", async (req, res) => {
  const { email, password, displayName, phone, gender, dateOfBirth, acceptsTerms, acceptsCommunications } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ message: "Nombre, email y contraseña son requeridos" });
  }
  // Normalize/validate dateOfBirth: YYYY-MM-DD or null. Reject impossible dates.
  let normalizedDob = null;
  if (dateOfBirth) {
    const m = String(dateOfBirth).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return res.status(400).json({ message: "Fecha de nacimiento inválida (YYYY-MM-DD)" });
    const year = Number(m[1]);
    const dt = new Date(dateOfBirth + "T00:00:00Z");
    const now = new Date();
    if (Number.isNaN(dt.getTime()) || year < 1900 || dt > now) {
      return res.status(400).json({ message: "Fecha de nacimiento inválida" });
    }
    normalizedDob = dateOfBirth;
  }
  try {
    const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ message: "Este email ya está registrado" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (display_name, email, phone, gender, date_of_birth, password_hash, accepts_terms, accepts_communications, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'client')
       RETURNING *`,
      [displayName.trim(), email.toLowerCase().trim(), phone || null, gender || null, normalizedDob, passwordHash, acceptsTerms ?? false, acceptsCommunications ?? false]
    );
    const user = result.rows[0];
    // Auto-create referral code (best-effort: nunca debe tirar el registro).
    try {
      const code = "KALA" + Math.random().toString(36).slice(2, 7).toUpperCase();
      await pool.query(
        "INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [user.id, code]
      );
    } catch (e) {
      console.warn("[register] referral_codes insert skipped:", e.message);
    }
    // Award welcome bonus loyalty points (best-effort).
    try {
      const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
      const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
      const pts = cfg.welcome_bonus ?? 50;
      if (cfg.enabled !== false && pts > 0) {
        await pool.query(
          "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, 'Bono de bienvenida')",
          [user.id, pts]
        );
      }
    } catch (e) {
      console.warn("[register] loyalty bonus skipped:", e.message);
    }
    const token = signToken(user.id);
    return res.status(201).json({ user: mapUser(user), token });
  } catch (err) {
    console.error("[register] FAILED:", {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      column: err?.column,
      constraint: err?.constraint,
      table: err?.table,
      stack: String(err?.stack || "").split("\n").slice(0, 4).join("\n"),
    });
    return res.status(500).json({
      message: "No pudimos crear tu cuenta",
      detail: process.env.NODE_ENV === "production" ? undefined : err?.message,
    });
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email y contraseña requeridos" });
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
    if (result.rows.length === 0) return res.status(401).json({ message: "Credenciales incorrectas" });
    const user = result.rows[0];
    if (!user.password_hash) return res.status(401).json({ message: "Credenciales incorrectas" });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: "Credenciales incorrectas" });
    try {
      await awardBirthdayBonusIfEligible(user.id);
    } catch (bonusErr) {
      console.error("[Loyalty] birthday bonus login:", bonusErr?.message || bonusErr);
    }
    const token = signToken(user.id);
    return res.json({ user: mapUser(user), token });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /api/auth/me
app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({ user: mapUser(result.rows[0]) });
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST /api/auth/forgot-password
app.post("/api/auth/forgot-password", async (req, res) => {
  const email = normalizeEmailAddress(req.body?.email);
  if (!email) return res.status(400).json({ message: "Email es requerido" });

  try {
    const user = await pool.query("SELECT id, display_name FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0) {
      // Return 200 to prevent user enumeration
      return res.json({ message: "Si el correo existe, recibirás un enlace de recuperación." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    // Expiration set to 2 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 2);

    // Invalidate older active reset links before creating a new one.
    await pool.query(
      `UPDATE password_reset_tokens
       SET used = true
       WHERE user_id = $1 AND used = false`,
      [user.rows[0].id],
    );
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.rows[0].id, token, expiresAt]
    );

    await sendPasswordResetEmail({
      to: email,
      name: user.rows[0].display_name || "Clienta",
      token,
      resetUrl: `${APP_PUBLIC_URL}/auth/reset-password?token=${encodeURIComponent(token)}`,
    });

    return res.json({ message: "Si el correo existe, recibirás un enlace de recuperación." });
  } catch (err) {
    console.error("Auth /forgot-password error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST /api/auth/reset-password
app.post("/api/auth/reset-password", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");
  if (!token || !password) return res.status(400).json({ message: "Datos incompletos" });
  if (!isStrongPassword(password)) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres, una mayúscula y un número." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Check token validity
    const t = await client.query(
      `SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token = $1 FOR UPDATE`,
      [token]
    );
    if (t.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El enlace es inválido o ha expirado." });
    }

    const dbToken = t.rows[0];
    if (dbToken.used) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Este enlace ya fue utilizado. Solicita uno nuevo." });
    }
    if (new Date() > new Date(dbToken.expires_at)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Este enlace ha expirado." });
    }

    // Hash new password and update
    const hash = await bcrypt.hash(password, 12);
    const userUpdate = await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, dbToken.user_id]);
    if (!userUpdate.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El enlace es inválido o ha expirado." });
    }

    // Mark current and any still-active tokens as used for this user.
    await client.query(
      `UPDATE password_reset_tokens
       SET used = true
       WHERE user_id = $1 AND used = false`,
      [dbToken.user_id],
    );

    await client.query("COMMIT");

    return res.json({ message: "Contraseña restablecida con éxito." });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("Auth /reset-password error:", err);
    return res.status(500).json({ message: "Error al actualizar la contraseña." });
  } finally {
    client.release();
  }
});

// ─── Routes: /api/plans ─────────────────────────────────────────────────────

// GET /api/plans
app.get("/api/plans", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM plans ORDER BY sort_order ASC, price ASC"
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    console.error("Plans error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/memberships ───────────────────────────────────────────────

// GET /api/memberships/my
app.get("/api/memberships/my", authMiddleware, async (req, res) => {
  try {
    // Ensure optional columns exist (idempotent, safe to run on every request)
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS plan_name_override VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS class_limit_override INTEGER`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS cancellations_used INTEGER NOT NULL DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS order_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS class_category VARCHAR(20) DEFAULT 'all'`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS class_limit INTEGER`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 30`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb`).catch(() => { });

    const r = await pool.query(
      `SELECT m.id, m.user_id, m.plan_id, m.status, m.start_date, m.end_date,
              m.classes_remaining, m.payment_method, m.created_at, m.updated_at,
              m.order_id, m.cancellations_used,
              COALESCE(m.plan_name_override, '') AS plan_name_override,
              m.class_limit_override,
              COALESCE(p.name, m.plan_name_override, 'Membresía') AS plan_name,
              COALESCE(p.class_limit, m.class_limit_override)      AS class_limit,
              COALESCE(p.duration_days, 30)                        AS duration_days,
              p.features,
              COALESCE(p.class_category, 'all')                    AS class_category
       FROM memberships m
       LEFT JOIN plans p ON m.plan_id = p.id
       WHERE m.user_id = $1
       ORDER BY CASE m.status
         WHEN 'active'              THEN 1
         WHEN 'pending_activation'  THEN 2
         WHEN 'pending_payment'     THEN 3
         ELSE 4 END,
         CASE
           WHEN m.status = 'active' AND (m.classes_remaining IS NULL OR m.classes_remaining >= 9999) THEN 1
           ELSE 0
         END ASC,
         CASE
           WHEN m.status = 'active' AND m.end_date IS NULL THEN 1
           ELSE 0
         END ASC,
         m.end_date ASC NULLS LAST,
         m.created_at DESC
       LIMIT 1`,
      [req.userId]
    );
    if (!r.rows[0]) return res.json({ data: null });
    const row = camelRows([r.rows[0]])[0];
    // Treat 9999 or very large numbers as unlimited (null)
    if (row.classesRemaining >= 9999) row.classesRemaining = null;
    if (row.classLimit >= 9999) row.classLimit = null;
    return res.json({ data: row });
  } catch (err) {
    console.error("Memberships/my error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/classes ───────────────────────────────────────────────────

// GET /api/classes?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/api/classes", async (req, res) => {
  try {
    const { start, end, limit } = req.query;
    let query = `
      SELECT c.*,
             c.max_capacity                         AS capacity,
             (c.date || 'T' || c.start_time)        AS start_time_full,
             (c.date || 'T' || c.end_time)          AS end_time_full,
             ct.name  AS class_type_name,
             ct.color AS class_type_color,
             ct.icon  AS class_type_icon,
             ct.level AS class_type_level,
             i.display_name AS instructor_name,
             i.photo_url    AS instructor_photo,
             f.name         AS facility_name
      FROM classes c
      JOIN class_types ct   ON c.class_type_id  = ct.id
      JOIN instructors i    ON c.instructor_id   = i.id
      LEFT JOIN facilities f ON c.facility_id    = f.id
      WHERE c.status != 'cancelled'
    `;
    const params = [];
    if (start) { params.push(start); query += ` AND c.date >= $${params.length}`; }
    if (end) { params.push(end); query += ` AND c.date <= $${params.length}`; }
    query += " ORDER BY c.date ASC, c.start_time ASC";
    if (limit) { params.push(parseInt(limit)); query += ` LIMIT $${params.length}`; }
    const r = await pool.query(query, params);
    // Normalise: expose start_time / end_time as full ISO strings for front-end consumers
    const rows = r.rows.map((row) => ({
      ...row,
      // Ensure date is always a plain YYYY-MM-DD string (pg returns Date objects for DATE columns)
      date: row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : (typeof row.date === "string" ? row.date.slice(0, 10) : row.date),
      start_time: row.start_time_full ?? row.start_time,
      end_time: row.end_time_full ?? row.end_time,
    }));
    return res.json({ data: rows });
  } catch (err) {
    console.error("Classes error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/classes/:id
app.get("/api/classes/:id", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT c.*,
              (c.date || 'T' || c.start_time) AS start_time,
              (c.date || 'T' || c.end_time)   AS end_time,
              ct.name  AS class_type_name,
              ct.color AS class_type_color,
              ct.icon  AS class_type_icon,
              ct.level AS class_type_level,
              i.display_name AS instructor_name,
              i.photo_url    AS instructor_photo,
              i.bio          AS instructor_bio,
              f.name         AS facility_name
       FROM classes c
       JOIN class_types ct   ON c.class_type_id  = ct.id
       JOIN instructors i    ON c.instructor_id   = i.id
       LEFT JOIN facilities f ON c.facility_id    = f.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "Clase no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("Class/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/bookings ──────────────────────────────────────────────────

// GET /api/bookings/my-bookings
app.get("/api/bookings/my-bookings", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.*,
              c.date,
              (c.date || 'T' || c.start_time) AS start_time,
              (c.date || 'T' || c.end_time)   AS end_time,
              c.status AS class_status,
              ct.name  AS class_type_name,
              ct.color AS class_color,
              i.display_name AS instructor_name,
              i.photo_url    AS instructor_photo,
              EXISTS(
                SELECT 1
                FROM reviews rv
                WHERE rv.booking_id = b.id
              ) AS has_review,
              f.name         AS facility_name
       FROM bookings b
       JOIN classes c       ON b.class_id       = c.id
       JOIN class_types ct  ON c.class_type_id  = ct.id
       JOIN instructors i   ON c.instructor_id  = i.id
       LEFT JOIN facilities f ON c.facility_id  = f.id
       WHERE b.user_id = $1
       ORDER BY c.date DESC, c.start_time DESC`,
      [req.userId]
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("Bookings/my error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/bookings
app.post("/api/bookings", authMiddleware, async (req, res) => {
  const { classId } = req.body;
  if (!classId) return res.status(400).json({ message: "classId requerido" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock class row to avoid overbooking in concurrent requests
    const classRes = await client.query(
      `SELECT c.id, c.max_capacity, c.current_bookings, c.status, c.date, c.start_time,
              ct.category AS class_category
       FROM classes c
       JOIN class_types ct ON c.class_type_id = ct.id
       WHERE c.id = $1
       FOR UPDATE`,
      [classId]
    );
    if (classRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada" });
    }
    const cls = classRes.rows[0];
    if (cls.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Esta clase fue cancelada" });
    }

    const clsCategory = normalizeClassCategory(cls.class_category, "all");
    const membership = await selectMembershipForClass({
      userId: req.userId,
      classCategory: clsCategory,
      client,
    });
    if (!membership) {
      await client.query("ROLLBACK");
      const label = clsCategory === "jumping" ? "Jumping" : clsCategory === "pilates" ? "Pilates" : "esta";
      return res.status(403).json({
        message: `No tienes membresía activa con créditos para clases de ${label}.`,
      });
    }

    // Lock selected membership row to prevent double consumption
    const lockedMembershipRes = await client.query(
      "SELECT id, classes_remaining FROM memberships WHERE id = $1 FOR UPDATE",
      [membership.id]
    );
    const lockedMembership = lockedMembershipRes.rows[0];
    if (!lockedMembership) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No se encontró una membresía válida para esta reserva." });
    }

    if (!isMembershipCategoryCompatible(membership.class_category, clsCategory)) {
      await client.query("ROLLBACK");
      const label = clsCategory === "jumping" ? "Jumping" : "Pilates";
      return res.status(403).json({
        message: `Tu membresía no incluye clases de ${label}. Necesitas una membresía ${label} o Mixta.`,
      });
    }

    if (!isUnlimitedClasses(lockedMembership.classes_remaining) && Number(lockedMembership.classes_remaining) <= 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Ya no tienes clases disponibles en tu paquete. Renueva o adquiere un nuevo plan.",
      });
    }

    const dupRes = await client.query(
      "SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled'",
      [classId, req.userId]
    );
    if (dupRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Ya tienes una reserva para esta clase" });
    }

    const isWaitlist = cls.current_bookings >= cls.max_capacity;
    const status = isWaitlist ? "waitlist" : "confirmed";
    const result = await client.query(
      `INSERT INTO bookings (class_id, user_id, membership_id, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [classId, req.userId, membership.id, status]
    );

    if (!isWaitlist) {
      await client.query(
        "UPDATE classes SET current_bookings = current_bookings + 1 WHERE id = $1",
        [classId]
      );
      if (!isUnlimitedClasses(lockedMembership.classes_remaining)) {
        await client.query(
          "UPDATE memberships SET classes_remaining = GREATEST(classes_remaining - 1, 0), updated_at = NOW() WHERE id = $1",
          [membership.id]
        );
      }
    }
    await client.query("COMMIT");

    // ── Email: booking confirmed / waitlist ────────────────────────────────
    try {
      const userRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [req.userId]);
      const classFullRes = await pool.query(
        `SELECT c.date, c.start_time, ct.name AS class_type_name,
                i.display_name AS instructor_name
         FROM classes c
         JOIN class_types ct ON c.class_type_id = ct.id
         LEFT JOIN instructors i ON c.instructor_id = i.id
         WHERE c.id = $1`,
        [classId]
      );
      const memAfter = await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [membership.id]);
      const classesLeft = memAfter.rows[0]?.classes_remaining ?? null;

      if (userRes.rows[0] && classFullRes.rows[0]) {
        const u = userRes.rows[0];
        const cl = classFullRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendBookingConfirmed({
            to: u.email,
            name: u.display_name || "Alumna",
            className: cl.class_type_name,
            date: cl.date,
            startTime: cl.start_time,
            instructor: cl.instructor_name,
            classesLeft,
            isWaitlist,
          }).catch((e) => console.error("[Email] booking confirmed:", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "booking_confirmed",
          phone: u.phone,
          vars: {
            name: u.display_name || "Alumna",
            class: cl.class_type_name || "Clase",
            date: cl.date ? new Date(cl.date).toLocaleDateString("es-MX") : "",
            time: cl.start_time ? String(cl.start_time).slice(0, 5) : "",
          },
          fallbackMessage: isWaitlist
            ? `Hola ${u.display_name || "Alumna"}, quedaste en lista de espera para ${cl.class_type_name || "tu clase"} (${cl.date || ""} ${String(cl.start_time || "").slice(0, 5)}).`
            : `Hola ${u.display_name || "Alumna"}, tu reserva para ${cl.class_type_name || "tu clase"} (${cl.date || ""} ${String(cl.start_time || "").slice(0, 5)}) está confirmada.`,
        }).catch((e) => console.error("[WA] booking confirmed:", e.message));
      }
    } catch (emailErr) {
      console.error("[Email] booking confirmed query error:", emailErr.message);
    }

    const msg = isWaitlist ? "Añadido a lista de espera" : "Reserva confirmada";
    triggerWalletPassSync(req.userId, isWaitlist ? "booking_waitlist_created" : "booking_created");
    return res.status(201).json({ message: msg, booking: result.rows[0] });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("POST bookings error:", err);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// DELETE /api/bookings/:id
app.delete("/api/bookings/:id", authMiddleware, async (req, res) => {
  try {
    // Load booking
    const r = await pool.query(
      `SELECT b.*, c.date, c.start_time, ct.name AS class_type_name
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       WHERE b.id = $1 AND b.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    const booking = r.rows[0];

    if (booking.status === "cancelled") {
      return res.status(400).json({ message: "Esta reserva ya fue cancelada" });
    }

    // ── Check membership cancellation limit (max 2 per membership period) ──
    let membership = null;
    if (booking.membership_id) {
      const memRes = await pool.query(
        "SELECT id, classes_remaining, cancellations_used, plan_id FROM memberships WHERE id = $1",
        [booking.membership_id]
      );
      membership = memRes.rows[0] ?? null;
    }

    if (membership && (membership.cancellations_used ?? 0) >= 2) {
      return res.status(403).json({
        message: "Has alcanzado el límite de 2 cancelaciones permitidas en tu membresía actual. Contacta con el studio si necesitas ayuda.",
      });
    }

    // ── Check 2-hour advance notice window ─────────────────────────────────
    // Classes are in Mexico City time; use the DB's start_time timestamp directly
    // booking.date comes from the classes table (type DATE) and start_time is TIMESTAMPTZ
    // We read the class start as Mexico City local time to compare correctly
    const classStartRes = await pool.query(
      `SELECT (c.date + c.start_time::time) AT TIME ZONE 'America/Mexico_City' AS class_start_utc
       FROM classes c WHERE c.id = $1`,
      [booking.class_id]
    );
    const classStartUTC = classStartRes.rows[0]?.class_start_utc
      ? new Date(classStartRes.rows[0].class_start_utc)
      : null;
    const now = new Date();
    const minutesUntilClass = classStartUTC
      ? (classStartUTC.getTime() - now.getTime()) / 60_000
      : 999; // if we can't determine, assume on-time
    const isLate = minutesUntilClass < 120; // less than 2 hours

    // Cancel the booking
    await pool.query(
      "UPDATE bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1",
      [req.params.id]
    );

    if (booking.status === "confirmed") {
      // Always free the class spot
      await pool.query(
        "UPDATE classes SET current_bookings = GREATEST(current_bookings - 1, 0) WHERE id = $1",
        [booking.class_id]
      );

      if (membership) {
        // Increment cancellations_used regardless of timing
        await pool.query(
          "UPDATE memberships SET cancellations_used = COALESCE(cancellations_used, 0) + 1 WHERE id = $1",
          [membership.id]
        );

        if (isLate) {
          // Late cancellation: credit is LOST — do not restore
          // Email: cancelled, no credit restored
          try {
            const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [req.userId]);
            const memAfter = await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [membership.id]);
            if (uRes.rows[0]) {
              const u = uRes.rows[0];
              if (await areEmailNotificationsEnabled()) {
                sendBookingCancelled({
                  to: u.email,
                  name: u.display_name || "Alumna",
                  className: booking.class_type_name || "tu clase",
                  date: booking.date,
                  startTime: booking.start_time,
                  creditRestored: false,
                  isLate: true,
                  classesLeft: memAfter.rows[0]?.classes_remaining ?? null,
                }).catch((e) => console.error("[Email] booking cancelled late:", e.message));
              }
              sendConfiguredWhatsAppTemplate({
                templateKey: "booking_cancelled",
                phone: u.phone,
                vars: {
                  name: u.display_name || "Alumna",
                  class: booking.class_type_name || "tu clase",
                  date: booking.date ? new Date(booking.date).toLocaleDateString("es-MX") : "",
                  time: booking.start_time ? String(booking.start_time).slice(0, 5) : "",
                  creditRestored: "No",
                },
                fallbackMessage: `Hola ${u.display_name || "Alumna"}, cancelamos tu reserva de ${booking.class_type_name || "tu clase"}. Por cancelación tardía, la clase no se devolvió.`,
              }).catch((e) => console.error("[WA] booking cancelled late:", e.message));
            }
          } catch (emailErr) {
            console.error("[Email] cancelled late query:", emailErr.message);
          }
          triggerWalletPassSync(req.userId, "booking_cancelled_late");
          return res.json({
            message: "Reserva cancelada. Por ser con menos de 2 horas de anticipación, la clase NO se devuelve a tu paquete.",
            creditRestored: false,
          });
        }

        // On-time cancellation: restore credit only if membership has a counted limit
        if (membership.classes_remaining !== null && membership.classes_remaining < 9999) {
          await pool.query(
            "UPDATE memberships SET classes_remaining = classes_remaining + 1 WHERE id = $1",
            [membership.id]
          );
        }
      }
    }

    // ── Email: booking cancelled ───────────────────────────────────────────
    try {
      const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [req.userId]);
      const memAfter = membership
        ? await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [membership.id])
        : null;
      if (uRes.rows[0]) {
        const u = uRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendBookingCancelled({
            to: u.email,
            name: u.display_name || "Alumna",
            className: booking.class_type_name || "tu clase",
            date: booking.date,
            startTime: booking.start_time,
            creditRestored: !isLate,
            isLate,
            classesLeft: memAfter?.rows[0]?.classes_remaining ?? null,
          }).catch((e) => console.error("[Email] booking cancelled:", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "booking_cancelled",
          phone: u.phone,
          vars: {
            name: u.display_name || "Alumna",
            class: booking.class_type_name || "tu clase",
            date: booking.date ? new Date(booking.date).toLocaleDateString("es-MX") : "",
            time: booking.start_time ? String(booking.start_time).slice(0, 5) : "",
            creditRestored: !isLate ? "Sí" : "No",
          },
          fallbackMessage: isLate
            ? `Hola ${u.display_name || "Alumna"}, cancelaste tu reserva de ${booking.class_type_name || "tu clase"}. La clase no se devolvió por cancelación tardía.`
            : `Hola ${u.display_name || "Alumna"}, cancelaste tu reserva de ${booking.class_type_name || "tu clase"}. Tu crédito fue devuelto.`,
        }).catch((e) => console.error("[WA] booking cancelled:", e.message));
      }
    } catch (emailErr) {
      console.error("[Email] cancelled query:", emailErr.message);
    }

    triggerWalletPassSync(req.userId, "booking_cancelled");
    return res.json({
      message: isLate
        ? "Reserva cancelada. La clase no se devolvió al paquete (cancelación tardía)."
        : "Reserva cancelada. Se devolvió el crédito a tu paquete.",
      creditRestored: !isLate,
    });
  } catch (err) {
    console.error("DELETE bookings error:", err.message, err.stack);
    return res.status(500).json({ message: "Error interno", detail: err.message });
  }
});

// POST /api/reviews
app.post("/api/reviews", authMiddleware, async (req, res) => {
  const { bookingId, rating, comment, tagIds } = req.body;
  if (!bookingId || !rating) return res.status(400).json({ message: "bookingId y rating requeridos" });
  try {
    const safeRating = Math.max(1, Math.min(5, Number(rating)));
    if (!Number.isFinite(safeRating)) {
      return res.status(400).json({ message: "rating inválido" });
    }
    // Verify booking belongs to user and was attended
    const bRes = await pool.query(
      `SELECT b.id, b.status, c.id AS class_id, c.instructor_id
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       WHERE b.id = $1 AND b.user_id = $2`,
      [bookingId, req.userId]
    );
    if (bRes.rows.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    const booking = bRes.rows[0];

    // Check if already reviewed
    const existing = await pool.query("SELECT id FROM reviews WHERE booking_id = $1", [bookingId]);
    if (existing.rows.length > 0) return res.status(409).json({ message: "Ya dejaste una reseña para esta clase" });

    // Compatible insert for both schemas:
    // - reviews.rating (legacy/current)
    // - reviews.overall_rating (production variants)
    const colRes = await pool.query(
      `SELECT a.attname AS column_name
       FROM pg_attribute a
       JOIN pg_class c ON a.attrelid = c.oid
       JOIN pg_namespace n ON c.relnamespace = n.oid
       WHERE n.nspname='public'
         AND c.relname='reviews'
         AND a.attnum > 0
         AND NOT a.attisdropped
         AND a.attname = ANY($1::text[])`,
      [["rating", "overall_rating", "tag_ids"]]
    );
    const hasRating = colRes.rows.some((r) => r.column_name === "rating");
    const hasOverallRating = colRes.rows.some((r) => r.column_name === "overall_rating");
    const hasTagIds = colRes.rows.some((r) => r.column_name === "tag_ids");

    const insertCols = ["user_id", "booking_id", "class_id", "instructor_id"];
    const insertVals = [req.userId, bookingId, booking.class_id, booking.instructor_id || null];

    if (hasRating) {
      insertCols.push("rating");
      insertVals.push(safeRating);
    }
    if (hasOverallRating) {
      insertCols.push("overall_rating");
      insertVals.push(safeRating);
    }

    insertCols.push("comment");
    insertVals.push(comment || null);

    if (hasTagIds) {
      insertCols.push("tag_ids");
      insertVals.push(tagIds || []);
    }

    const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");

    let review;
    try {
      const rRes = await pool.query(
        `INSERT INTO reviews (${insertCols.join(", ")})
         VALUES (${placeholders}) RETURNING *`,
        insertVals
      );
      review = rRes.rows[0];
    } catch (insertErr) {
      // Safety retry for schemas where overall_rating exists but wasn't detected
      const shouldRetry =
        insertErr?.code === "23502" &&
        insertErr?.column === "overall_rating" &&
        !insertCols.includes("overall_rating");

      if (!shouldRetry) throw insertErr;

      const retryCols = [...insertCols];
      const retryVals = [...insertVals];
      const insertAt = hasRating ? retryCols.indexOf("rating") + 1 : 4;
      retryCols.splice(insertAt, 0, "overall_rating");
      retryVals.splice(insertAt, 0, safeRating);
      const retryPlaceholders = retryCols.map((_, i) => `$${i + 1}`).join(", ");

      const retryRes = await pool.query(
        `INSERT INTO reviews (${retryCols.join(", ")})
         VALUES (${retryPlaceholders}) RETURNING *`,
        retryVals
      );
      review = retryRes.rows[0];
    }

    // Insert tag links
    if (Array.isArray(tagIds) && tagIds.length > 0) {
      for (const tagId of tagIds) {
        await pool.query(
          "INSERT INTO review_tag_links (review_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [review.id, tagId]
        ).catch(() => {});
      }
    }

    return res.json({ message: "Reseña enviada — gracias por tu opinión", data: review });
  } catch (err) {
    if (
      err?.code === "23505" &&
      String(err?.detail || err?.message || "").toLowerCase().includes("booking_id")
    ) {
      return res.status(409).json({ message: "Ya dejaste una reseña para esta clase" });
    }
    console.error("POST reviews error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/orders ────────────────────────────────────────────────────

// GET /api/orders
app.get("/api/orders", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.*, p.name AS plan_name, p.duration_days
       FROM orders o
       JOIN plans p ON o.plan_id = p.id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [req.userId]
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET orders error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/orders/:id
app.get("/api/orders/:id", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.*, p.name AS plan_name, p.duration_days, p.features,
              pp.file_url AS proof_url, pp.status AS proof_status, pp.uploaded_at AS proof_uploaded_at
       FROM orders o
       JOIN plans p ON o.plan_id = p.id
       LEFT JOIN payment_proofs pp ON pp.order_id = o.id
       WHERE o.id = $1 AND o.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "Orden no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("GET orders/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── Generate short order number: OPH-YYMM-XXXX ──
async function generateOrderNumber(client) {
  const now = new Date();
  const prefix = `OPH-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const res = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM orders WHERE order_number LIKE $1`,
    [prefix + "-%"]
  );
  const seq = (res.rows[0]?.cnt ?? 0) + 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

// POST /api/orders
app.post("/api/orders", authMiddleware, async (req, res) => {
  const { planId, discountCode, paymentMethod = "transfer" } = req.body;
  if (!planId) return res.status(400).json({ message: "planId requerido" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const planRes = await client.query("SELECT * FROM plans WHERE id = $1 AND is_active = true", [planId]);
    if (planRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Plan no encontrado" });
    }
    const plan = planRes.rows[0];
    const nonRepeatableConflict = await findNonRepeatablePlanConflict({ userId: req.userId, plan, client });
    if (nonRepeatableConflict) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: nonRepeatableConflict.message });
    }

    const subtotal = parseFloat(plan.price);
    let discount = 0;
    let appliedDiscountCode = null;

    if (discountCode) {
      const discountResult = await findApplicableDiscountCode({
        code: discountCode,
        subtotal,
        planId,
        classCategory: normalizeClassCategory(plan.class_category, "all"),
        channel: "membership",
        client,
      });
      if (!discountResult) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Código de descuento no válido para este plan" });
      }
      if (discountResult.rejectedByMinOrder) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Compra mínima requerida: $${Number(discountResult.minOrderAmount || 0).toFixed(2)} MXN`,
        });
      }
      discount = discountResult.discountAmount;
      appliedDiscountCode = discountResult.code;
    }

    const total = subtotal - discount;
    const bankInfo = await getConfiguredBankInfo(client);
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h
    const orderNumber = await generateOrderNumber(client);
    const orderRes = await client.query(
      `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, tax_amount, total_amount, discount_amount, discount_code_id, bank_info, expires_at, order_number)
       VALUES ($1, $2, 'pending_payment', $3, $4, 0, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.userId,
        planId,
        paymentMethod,
        subtotal,
        total,
        discount,
        appliedDiscountCode?.id ?? null,
        JSON.stringify(bankInfo),
        expires,
        orderNumber,
      ]
    );

    await client.query("COMMIT");

    const order = orderRes.rows[0];
    return res.status(201).json({
      data: {
        ...order,
        plan_name: plan.name,
        bank_details: { ...bankInfo, amount: total, currency: "MXN" },
      }
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("POST orders error:", err);
    return res.status(500).json({ message: err?.message || "Error interno" });
  } finally {
    client.release();
  }
});

// POST /api/orders/:id/proof  (multipart)
app.post("/api/orders/:id/proof", authMiddleware, upload.any(), async (req, res) => {
  try {
    const orderRes = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    if (orderRes.rows.length === 0) return res.status(404).json({ message: "Orden no encontrada" });

    // Accept any uploaded field name ("proof", "file", etc.)
    const uploadedFile = req.files?.[0] ?? req.file ?? null;

    let fileUrl, fileName, mimeType;
    if (uploadedFile) {
      mimeType = uploadedFile.mimetype;
      fileName = uploadedFile.originalname;
      fileUrl = `data:${mimeType};base64,${uploadedFile.buffer.toString("base64")}`;
    } else if (req.body.fileUrl) {
      fileUrl = req.body.fileUrl;
      fileName = req.body.fileName || "comprobante";
      mimeType = req.body.mimeType || "application/octet-stream";
    } else {
      return res.status(400).json({ message: "No se recibió ningún archivo" });
    }

    const updateRes = await pool.query(
      `UPDATE payment_proofs 
       SET file_url = $2, file_name = $3, mime_type = $4, status = 'pending', uploaded_at = NOW()
       WHERE order_id = $1 RETURNING id`,
      [req.params.id, fileUrl, fileName, mimeType]
    );

    if (updateRes.rowCount === 0) {
      await pool.query(
        `INSERT INTO payment_proofs (order_id, file_url, file_name, mime_type, status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [req.params.id, fileUrl, fileName, mimeType]
      );
    }
    await pool.query(
      "UPDATE orders SET status = 'pending_verification', paid_at = COALESCE(paid_at, NOW()) WHERE id = $1",
      [req.params.id]
    );
    return res.json({ message: "Comprobante recibido — estamos verificando tu pago" });
  } catch (err) {
    console.error("POST orders/proof error:", err.message, err.stack);
    return res.status(500).json({ message: "Error interno", detail: err.message });
  }
});

// ─── Routes: /api/discount-codes ────────────────────────────────────────────

// POST /api/discount-codes/validate
app.post("/api/discount-codes/validate", authMiddleware, async (req, res) => {
  const { code, planId, classCategory, channel } = req.body;
  if (!code) return res.status(400).json({ message: "Código requerido" });
  try {
    const planRes = await pool.query("SELECT price, class_category FROM plans WHERE id = $1", [planId || null]);
    const originalPrice = planRes.rows.length > 0 ? parseFloat(planRes.rows[0].price) : 0;
    const effectiveCategory = normalizeClassCategory(
      classCategory ?? planRes.rows[0]?.class_category ?? "all",
      "all"
    );
    const discountResult = await findApplicableDiscountCode({
      code,
      subtotal: originalPrice,
      planId: planId || null,
      classCategory: effectiveCategory,
      channel: channel || "membership",
    });
    if (!discountResult) return res.status(404).json({ message: "Código no válido o expirado" });
    if (discountResult.rejectedByMinOrder) {
      return res.status(400).json({
        message: `Compra mínima requerida: $${Number(discountResult.minOrderAmount || 0).toFixed(2)} MXN`,
      });
    }
    const dc = discountResult.code;
    const discount = discountResult.discountAmount;
    return res.json({
      data: {
        code: dc.code,
        discount_type: dc.discount_type,
        discount_value: parseFloat(dc.discount_value),
        discount_amount: Math.min(discount, originalPrice),
        final_price: Math.max(originalPrice - discount, 0),
      }
    });
  } catch (err) {
    console.error("Discount validate error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/wallet ────────────────────────────────────────────────────

// GET /api/wallet/pass
app.get("/api/wallet/pass", authMiddleware, async (req, res) => {
  try {
    const userRes = await pool.query("SELECT email, display_name FROM users WHERE id = $1 LIMIT 1", [req.userId]);
    const userName = userRes.rows[0]?.display_name || userRes.rows[0]?.email || "Miembro Kala";
    const pointsRes = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points WHEN type='adjust' THEN points ELSE -points END), 0) AS total FROM loyalty_transactions WHERE user_id = $1",
      [req.userId]
    );
    const total = parseInt(pointsRes.rows[0].total);
    const passesRes = await pool.query(
      `SELECT ep.id,
              ep.pass_code,
              ep.status,
              ep.issued_at,
              ep.used_at,
              e.id AS event_id,
              e.title AS event_title,
              e.date AS event_date,
              e.start_time AS event_start_time
         FROM event_passes ep
         JOIN events e ON e.id = ep.event_id
        WHERE ep.user_id = $1
          AND ep.status <> 'cancelled'
        ORDER BY e.date DESC, e.start_time DESC
        LIMIT 20`,
      [req.userId]
    );
    let membership = null;
    try {
      const memRes = await pool.query(
        `SELECT m.id, m.status, m.classes_remaining, m.start_date, m.end_date,
                m.plan_name_override, m.class_limit_override,
                p.name AS plan_name, p.class_limit AS plan_class_limit,
                p.class_category, p.is_non_transferable, p.is_non_repeatable, p.repeat_key
           FROM memberships m
      LEFT JOIN plans p ON p.id = m.plan_id
          WHERE m.user_id = $1
            AND m.status = 'active'
            AND m.end_date >= CURRENT_DATE
       ORDER BY m.end_date DESC
          LIMIT 1`,
        [req.userId]
      );
      if (memRes.rows.length > 0) {
        const m = memRes.rows[0];
        membership = {
          id: m.id,
          status: m.status,
          plan_name: m.plan_name_override || m.plan_name || "Plan Activo",
          class_limit: m.class_limit_override ?? m.plan_class_limit,
          classes_remaining: m.classes_remaining,
          start_date: m.start_date,
          end_date: m.end_date,
          class_category: normalizeClassCategory(m.class_category, "all"),
          is_non_transferable: parseBooleanFlag(m.is_non_transferable),
          is_non_repeatable: parseBooleanFlag(m.is_non_repeatable),
          repeat_key: m.repeat_key || null,
        };
      }
    } catch (memErr) {
      console.error("Wallet/pass membership error:", memErr.message);
    }
    let nextBooking = null;
    try {
      const bookRes = await pool.query(
        `SELECT c.date, c.start_time, ct.name AS class_name, i.display_name AS instructor_name
           FROM bookings b
           JOIN classes c ON b.class_id = c.id
           JOIN class_types ct ON c.class_type_id = ct.id
      LEFT JOIN instructors i ON c.instructor_id = i.id
          WHERE b.user_id = $1
            AND b.status IN ('confirmed', 'waitlist')
            AND c.date >= CURRENT_DATE
       ORDER BY c.date ASC, c.start_time ASC
          LIMIT 1`,
        [req.userId],
      );
      if (bookRes.rows.length > 0) nextBooking = bookRes.rows[0];
    } catch (bookErr) {
      console.error("Wallet/pass next booking error:", bookErr.message);
    }
    // QR data: user ID encoded
    const qrData = Buffer.from(req.userId).toString("base64");
    const rings = await getKalaWeeklyRingStateForUser(req.userId, membership, total);
    return res.json({
      data: {
        user_name: userName,
        points: total,
        qr_code: qrData,
        membership,
        rings,
        next_booking: nextBooking,
        event_passes: passesRes.rows.map((row) => ({
          id: row.id,
          passCode: row.pass_code,
          status: row.status,
          issuedAt: row.issued_at,
          usedAt: row.used_at,
          eventId: row.event_id,
          eventTitle: row.event_title,
          eventDate: row.event_date ? String(row.event_date).slice(0, 10) : null,
          eventStartTime: row.event_start_time ? String(row.event_start_time).slice(0, 5) : null,
        })),
      },
    });
  } catch (err) {
    console.error("Wallet/pass error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/me/rings
app.get("/api/me/rings", authMiddleware, async (req, res) => {
  try {
    const snapshot = await getWalletSnapshotForUser(req.userId).catch(() => null);
    const current = await getKalaWeeklyRingStateForUser(
      req.userId,
      snapshot?.membership || null,
      snapshot?.points || 0,
    );
    let history = [];
    try {
      const historyRes = await pool.query(
        `SELECT week_start,
                constancia_progress,
                constancia_goal,
                esfuerzo_progress,
                esfuerzo_goal,
                conexion_progress,
                conexion_goal,
                rings_closed,
                reward_unlocked,
                reward_claimed_at,
                source
           FROM ring_states
          WHERE user_id = $1
          ORDER BY week_start DESC
          LIMIT 12`,
        [req.userId],
      );
      history = historyRes.rows.map((row) => ({
        week_start: row.week_start,
        constancia: {
          progress: Number(row.constancia_progress || 0),
          goal: Number(row.constancia_goal || 1),
        },
        esfuerzo: {
          progress: Number(row.esfuerzo_progress || 0),
          goal: Number(row.esfuerzo_goal || 1),
        },
        conexion: {
          progress: Number(row.conexion_progress || 0),
          goal: Number(row.conexion_goal || 10),
        },
        rings_closed: Number(row.rings_closed || 0),
        reward_unlocked: parseBooleanFlag(row.reward_unlocked),
        reward_claimed_at: row.reward_claimed_at || null,
        source: row.source || "ring_states",
      }));
    } catch (historyErr) {
      console.warn("[Rings] History unavailable:", historyErr?.message || historyErr);
    }

    return res.json({ data: { current, history } });
  } catch (err) {
    console.error("GET /api/me/rings error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/rings/users/:id
app.get("/api/admin/rings/users/:id", adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    const historyRes = await pool.query(
      `SELECT week_start,
              constancia_progress,
              constancia_goal,
              esfuerzo_progress,
              esfuerzo_goal,
              conexion_progress,
              conexion_goal,
              rings_closed,
              reward_unlocked,
              reward_claimed_at,
              source,
              updated_at
         FROM ring_states
        WHERE user_id = $1
        ORDER BY week_start DESC
        LIMIT 12`,
      [userId],
    );
    const eventsRes = await pool.query(
      `SELECT id, points_awarded, event_type, description, occurred_at, created_at
         FROM community_events
        WHERE user_id = $1
        ORDER BY occurred_at DESC
        LIMIT 20`,
      [userId],
    );
    return res.json({
      data: {
        current: historyRes.rows[0] || null,
        history: historyRes.rows,
        communityEvents: eventsRes.rows,
      },
    });
  } catch (err) {
    console.error("GET admin/rings/users/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/rings/community-events
app.post("/api/admin/rings/community-events", adminMiddleware, async (req, res) => {
  try {
    const userId = req.body.userId || req.body.user_id;
    const pointsAwarded = Math.max(1, Number(req.body.pointsAwarded ?? req.body.points_awarded ?? 1));
    const eventType = String(req.body.eventType ?? req.body.event_type ?? "community").trim() || "community";
    const description = String(req.body.description ?? "").trim() || null;
    if (!userId) return res.status(400).json({ message: "userId requerido" });
    const r = await pool.query(
      `INSERT INTO community_events (user_id, points_awarded, event_type, description, created_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [userId, pointsAwarded, eventType, description, req.userId || null],
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    console.error("POST admin/rings/community-events error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/loyalty ───────────────────────────────────────────────────

// GET /api/loyalty/my-history
app.get("/api/loyalty/my-history", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT lt.*,
              CASE WHEN lt.type = 'earn' OR lt.points > 0 THEN 'earned' ELSE 'redeemed' END AS movement_type
       FROM loyalty_transactions lt
       WHERE lt.user_id = $1
       ORDER BY lt.created_at DESC
       LIMIT 100`,
      [req.userId]
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("Loyalty/my-history error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/loyalty/rewards
app.get("/api/loyalty/rewards", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM loyalty_rewards WHERE is_active = true ORDER BY points_cost ASC"
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("Loyalty/rewards error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/loyalty/redeem
app.post("/api/loyalty/redeem", authMiddleware, async (req, res) => {
  const { rewardId } = req.body;
  if (!rewardId) return res.status(400).json({ message: "rewardId requerido" });
  try {
    const rewardRes = await pool.query(
      "SELECT * FROM loyalty_rewards WHERE id = $1 AND is_active = true",
      [rewardId]
    );
    if (rewardRes.rows.length === 0) return res.status(404).json({ message: "Recompensa no encontrada" });
    const reward = rewardRes.rows[0];
    // Check user balance from loyalty_transactions
    const balanceRes = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points WHEN type='adjust' THEN points ELSE -points END), 0) AS balance FROM loyalty_transactions WHERE user_id = $1",
      [req.userId]
    );
    const balance = parseInt(balanceRes.rows[0].balance);
    if (balance < reward.points_cost) {
      return res.status(400).json({ message: `Necesitas ${reward.points_cost} puntos. Tienes ${balance}.` });
    }
    // Deduct points via loyalty_transactions (type=redeem)
    await pool.query(
      "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'redeem', $2, $3)",
      [req.userId, reward.points_cost, `Canje: ${reward.name}`]
    );
    // Decrement stock if limited
    if (reward.stock !== null) {
      await pool.query("UPDATE loyalty_rewards SET stock = stock - 1 WHERE id = $1 AND stock > 0", [rewardId]);
    }
    triggerWalletPassSync(req.userId, "loyalty_redeem");
    return res.json({ message: `¡Recompensa canjeada! ${reward.name}` });
  } catch (err) {
    console.error("Loyalty/redeem error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Google Wallet helpers ──────────────────────────────────────────────────

const SITE_URL = process.env.SITE_URL || "https://kala-barre-studio.com.mx";
const GW_ISSUER_ID = process.env.GOOGLE_ISSUER_ID || "";
const GW_ISSUER_NAME = process.env.GOOGLE_ISSUER_NAME || "Kala Barre Studio";
const GW_PROGRAM_NAME = process.env.GOOGLE_PROGRAM_NAME || "Kala Club";
const GW_HEX_BG = process.env.GOOGLE_HEX_BACKGROUND_COLOR || "#FFF7F2";
const GW_HEX_BG_EVENT = process.env.GOOGLE_HEX_BACKGROUND_COLOR_EVENT || "#FFF7F2";

/**
 * Parse the Google Service Account private key from various env var formats.
 * Supports:
 *  - GOOGLE_SA_KEY_JSON_BASE64: the entire service-account JSON file base64-encoded (easiest)
 *  - GOOGLE_SA_PRIVATE_KEY: just the private key PEM (escaped \\n, raw, or base64-encoded)
 */
function parseGWServiceAccount() {
  let email = process.env.GOOGLE_SA_EMAIL || "";
  let key = "";

  // Option A: whole JSON file base64-encoded (e.g. cat sa.json | base64 -w0 | pbcopy)
  const jsonB64 = process.env.GOOGLE_SA_KEY_JSON_BASE64 || "";
  if (jsonB64) {
    try {
      const decoded = Buffer.from(jsonB64, "base64").toString("utf8");
      const sa = JSON.parse(decoded);
      if (sa.private_key) key = sa.private_key;
      if (sa.client_email && !email) email = sa.client_email;
      console.log("GW Key: parsed from GOOGLE_SA_KEY_JSON_BASE64 ✓");
    } catch (e) {
      console.error("Failed to parse GOOGLE_SA_KEY_JSON_BASE64:", e.message);
    }
  }

  // Option B: separate GOOGLE_SA_PRIVATE_KEY env var
  if (!key) {
    let raw = process.env.GOOGLE_SA_PRIVATE_KEY || "";
    if (raw) {
      // Step 1: URL-decode if needed (Railway sometimes encodes)
      if (raw.includes("%3D") || raw.includes("%2B") || raw.includes("%2F")) {
        try { raw = decodeURIComponent(raw); } catch (_) {}
      }
      // Step 2: If it's a JSON-escaped string (starts with "), unwrap it
      if (raw.startsWith('"') || raw.startsWith("'")) {
        try { raw = JSON.parse(raw); } catch (_) {
          raw = raw.slice(1, -1); // strip quotes manually
        }
      }
      // Step 3: If the whole thing looks like base64 (no PEM markers), decode
      if (!raw.includes("-----BEGIN") && !raw.includes("\\n") && raw.length > 100) {
        try {
          const decoded = Buffer.from(raw, "base64").toString("utf8");
          if (decoded.includes("-----BEGIN") || decoded.includes("PRIVATE KEY")) raw = decoded;
        } catch (_) {}
      }
      // Step 4: Replace escaped newlines (\\n → \n, plus double-escaped)
      raw = raw.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
      // Step 5: Reconstruct PEM if markers exist but no real newlines between them
      if (raw.includes("-----BEGIN") && raw.includes("-----END")) {
        // Ensure proper line breaks around the markers
        raw = raw
          .replace(/(-----BEGIN [A-Z ]+-----)\s*/g, "$1\n")
          .replace(/\s*(-----END [A-Z ]+-----)/g, "\n$1");
        // If the body between markers has no newlines, it's the base64 blob — add line breaks every 64 chars
        const match = raw.match(/(-----BEGIN [A-Z ]+-----)\n?([\s\S]*?)\n?(-----END [A-Z ]+-----)/);
        if (match) {
          const body = match[2].replace(/\s+/g, ""); // strip all whitespace from body
          const wrapped = body.match(/.{1,64}/g)?.join("\n") || body;
          raw = `${match[1]}\n${wrapped}\n${match[3]}`;
        }
      }
      key = raw.trim();
      console.log("GW Key: parsed from GOOGLE_SA_PRIVATE_KEY, length=" + key.length + ", hasPEM=" + key.includes("-----BEGIN"));
    }
  }

  // Validate the key can be used for RS256
  if (key) {
    try {
      crypto.createPrivateKey(key);
      console.log("GW Key: ✅ Valid RSA private key");
    } catch (e) {
      console.error("GW Key: ⚠️ Key validation failed:", e.message);
      // Last resort: try wrapping in PKCS#8 markers if missing
      if (!key.includes("-----BEGIN")) {
        const body = key.replace(/\s+/g, "");
        const wrapped = body.match(/.{1,64}/g)?.join("\n") || body;
        key = `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
        try {
          crypto.createPrivateKey(key);
          console.log("GW Key: ✅ Valid after adding PEM headers");
        } catch (e2) {
          console.error("GW Key: ❌ Still invalid after adding headers:", e2.message);
          key = ""; // unset — will disable Google Wallet gracefully
        }
      } else {
        key = ""; // unset — will disable Google Wallet gracefully
      }
    }
  }

  return { email, key };
}

const { email: _gwEmail, key: _gwKey } = parseGWServiceAccount();
const GW_SA_EMAIL = _gwEmail;
const GW_SA_PRIVATE_KEY = _gwKey;
const GW_CLASS_ID = GW_ISSUER_ID ? `${GW_ISSUER_ID}.kala_loyalty_v1` : "";

function isGoogleWalletConfigured() {
  return !!(GW_ISSUER_ID && GW_SA_EMAIL && GW_SA_PRIVATE_KEY);
}

/** Get OAuth2 access token for Google Wallet API using service account */
async function getGoogleWalletAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: GW_SA_EMAIL,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const saJwt = jwt.sign(claim, GW_SA_PRIVATE_KEY, { algorithm: "RS256" });
  const resp = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: saJwt,
  }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  return resp.data.access_token;
}

/** Create or update the Google Wallet Loyalty Class (run once at startup) */
async function ensureGoogleWalletClass() {
  if (!isGoogleWalletConfigured()) return;
  try {
    const token = await getGoogleWalletAccessToken();
    const classObj = {
      id: GW_CLASS_ID,
      issuerName: GW_ISSUER_NAME,
      programName: GW_PROGRAM_NAME,
      programLogo: {
        sourceUri: { uri: `${SITE_URL}/wallet-program-black.png` },
        contentDescription: { defaultValue: { language: "es", value: "Kala Barre Studio" } },
      },
      heroImage: {
        sourceUri: { uri: `${SITE_URL}/wallet-hero-black.png` },
        contentDescription: { defaultValue: { language: "es", value: "Kala Barre Studio" } },
      },
      hexBackgroundColor: GW_HEX_BG,
      reviewStatus: "UNDER_REVIEW",
      countryCode: "MX",
      multipleDevicesAndHoldersAllowedStatus: "MULTIPLE_HOLDERS",
      localizedIssuerName: { defaultValue: { language: "es", value: GW_ISSUER_NAME } },
      localizedProgramName: { defaultValue: { language: "es", value: GW_PROGRAM_NAME } },
    };
    // Try to GET the class first
    try {
      await axios.get(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${GW_CLASS_ID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // If exists, update it
      await axios.put(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${GW_CLASS_ID}`, classObj, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      console.log("✅ Google Wallet loyalty class updated:", GW_CLASS_ID);
    } catch (getErr) {
      if (getErr.response?.status === 404) {
        // Create new class
        await axios.post("https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass", classObj, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        console.log("✅ Google Wallet loyalty class created:", GW_CLASS_ID);
      } else {
        throw getErr;
      }
    }
  } catch (err) {
    console.error("⚠️  Google Wallet class setup error:", err.response?.data || err.message);
  }
}

function formatWalletEventSchedule(eventPass) {
  if (!eventPass?.eventDate) return "";
  const eventDate = new Date(eventPass.eventDate);
  if (Number.isNaN(eventDate.getTime())) return "";
  const dateLabel = eventDate.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const startTime = eventPass.eventStartTime ? String(eventPass.eventStartTime).slice(0, 5) : "";
  const endTime = eventPass.eventEndTime ? String(eventPass.eventEndTime).slice(0, 5) : "";
  const timeLabel = startTime && endTime ? `${startTime} - ${endTime}` : (startTime || "");
  return `${dateLabel}${timeLabel ? ` · ${timeLabel}` : ""}`.trim();
}

/** Build a Google Wallet Save URL (JWT) for a user
 *  @param {Object} opts
 *  @param {string} opts.userId
 *  @param {string} opts.userName
 *  @param {number} opts.points
 *  @param {string} opts.qrCode
 *  @param {Object|null} opts.membership  - { plan_name, class_limit, classes_remaining, end_date, start_date }
 *  @param {Object|null} opts.nextBooking - { class_name, instructor_name, date, start_time }
 *  @param {Object|null} opts.activeEventPass - { eventTitle, eventDate, eventStartTime, eventEndTime, eventLocation, passCode }
 */
function buildGoogleWalletSaveUrl({ userId, userName, points, qrCode, membership, nextBooking, activeEventPass, passKind = "membership" }) {
  const isEventPass = String(passKind || "membership") === "event";
  const objectId = isEventPass
    ? `${GW_ISSUER_ID}.kala_event_${String(activeEventPass?.eventId || "event").replace(/-/g, "")}_${userId.replace(/-/g, "")}`
    : `${GW_ISSUER_ID}.kala_${userId.replace(/-/g, "")}`;

  // ── Determine pass type and details based on membership ──────────────────
  const hasMembership = !isEventPass && !!membership;
  const hasEventPass = isEventPass && !!activeEventPass;
  const showFullGooglePassText = parseBooleanFlag(process.env.GOOGLE_WALLET_SHOW_FULL_TEXT || false);
  const compactEventMode = hasEventPass && !showFullGooglePassText;
  const eventSchedule = formatWalletEventSchedule(activeEventPass);
  const eventTitle = activeEventPass?.eventTitle || "Evento especial";
  const membershipCategory = hasMembership
    ? normalizeClassCategory(membership.class_category, "all")
    : "all";
  const membershipCategoryLabel = getKalaWalletCategoryLabel(membershipCategory);
  const progressSummary = getWalletProgressSummary(membership);
  const ringState = getKalaWeeklyRingState(membership, points);
  const isUnlimited = hasMembership && (membership.class_limit === null || membership.class_limit >= 9999);
  const classLimit = Number(membership?.class_limit ?? 0);
  const hasIconStampMode = hasMembership && !isUnlimited && classLimit > 0;
  const isPackage = hasMembership && !isUnlimited && membership.class_limit > 1;
  const isSingleClass = hasMembership && !isUnlimited && membership.class_limit === 1;
  const isTrialSingleSession = hasMembership && String(membership.repeat_key || "").startsWith("trial_single_session");
  const nonTransferable = hasMembership && parseBooleanFlag(membership.is_non_transferable);
  const nonRepeatable = hasMembership && parseBooleanFlag(membership.is_non_repeatable);

  // Header label
  let passHeader = "KALA CLUB";
  if (hasEventPass) {
    passHeader = "PASE DE EVENTO";
  } else if (hasMembership) {
    if (isTrialSingleSession) passHeader = "CLASE MUESTRA";
    else if (isUnlimited) passHeader = "MEMBRESÍA";
    else if (isPackage) passHeader = "PAQUETE";
    else if (isSingleClass) passHeader = "CLASE INDIVIDUAL";
  }

  // ── Build textModulesData rows ───────────────────────────────────────────
  const textModules = [];

  if (hasEventPass) {
    textModules.push({
      id: "event_title",
      header: "EVENTO ACTIVO",
      body: eventTitle,
    });
    if (eventSchedule) {
      textModules.push({
        id: "event_schedule",
        header: "FECHA Y HORA",
        body: eventSchedule,
      });
    }
    if (!compactEventMode && activeEventPass?.eventLocation) {
      textModules.push({
        id: "event_location",
        header: "LUGAR",
        body: activeEventPass.eventLocation,
      });
    }
    if (!compactEventMode && activeEventPass?.passCode) {
      textModules.push({
        id: "event_code",
        header: "CÓDIGO EVENTO",
        body: activeEventPass.passCode,
      });
    }
  }

  if (!compactEventMode && !isEventPass) {
    // Row 1: Plan Name
    if (hasMembership) {
      textModules.push({
        id: "plan",
        header: passHeader,
        body: membership.plan_name || "Plan Activo",
      });
      textModules.push({
        id: "modalidad",
        header: "MODALIDAD",
        body: membershipCategoryLabel,
      });
      textModules.push({
        id: "meta",
        header: "ANILLOS ESTA SEMANA",
        body: `${ringState.rings_closed}/3 cerrados`,
      });
      textModules.push({
        id: "ring_constancia",
        header: "CONSTANCIA",
        body: `${ringState.constancia.progress}/${ringState.constancia.goal}`,
      });
      textModules.push({
        id: "ring_esfuerzo",
        header: "ESFUERZO",
        body: `${ringState.esfuerzo.progress}/${ringState.esfuerzo.goal}`,
      });
      textModules.push({
        id: "ring_conexion",
        header: "CONEXIÓN",
        body: `${ringState.conexion.progress}/${ringState.conexion.goal}`,
      });
    } else {
      textModules.push({
        id: "plan",
        header: "ESTADO",
        body: "Sin membresía activa",
      });
    }

    // Row 2: Vigencia (valid until)
    if (hasMembership && membership.end_date) {
      const endDate = new Date(membership.end_date);
      const now = new Date();
      const daysLeft = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
      const endFormatted = endDate.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
      textModules.push({
        id: "vigencia",
        header: "VIGENTE HASTA",
        body: `${endFormatted} (${daysLeft} días restantes)`,
      });
    }

    // Row 3: Classes info
    if (hasMembership) {
      if (isUnlimited) {
        textModules.push({
          id: "clases",
          header: "CLASES",
          body: "Ilimitadas",
        });
      } else if (membership.class_limit && !hasIconStampMode) {
        textModules.push({
          id: "clases",
          header: "CLASES DEL PLAN",
          body: `${progressSummary.completionLabel} · ${progressSummary.remainingLabel}`,
        });
      }
    }

    // Row 3.1: Membership rules
    if (hasMembership) {
      const rules = [];
      if (nonTransferable) rules.push("No transferible");
      if (nonRepeatable) rules.push("No repetible");
      if (rules.length) {
        textModules.push({
          id: "reglas",
          header: "REGLAS",
          body: rules.join(" · "),
        });
      }
    }

    // Row 4: Next class
    if (nextBooking) {
      const bookingDate = new Date(nextBooking.date);
      const dateStr = bookingDate.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
      const timeStr = nextBooking.start_time ? String(nextBooking.start_time).substring(0, 5) : "";
      textModules.push({
        id: "next_class",
        header: "PRÓXIMA CLASE",
        body: `${nextBooking.class_name || "Clase"} — ${dateStr} ${timeStr}`,
      });
      if (nextBooking.instructor_name) {
        textModules.push({
          id: "instructor",
          header: "INSTRUCTORA",
          body: nextBooking.instructor_name,
        });
      }
    }
  }

  // Row 5: Points
  textModules.push({
    id: "puntos",
    header: "PUNTOS KALA CLUB",
    body: `${points.toLocaleString("es-MX")} pts`,
  });

  const infoRows = [];
  if (compactEventMode) {
    infoRows.push({
      columns: [
        { label: "Evento", value: eventTitle },
        { label: "Fecha", value: eventSchedule || "—" },
      ],
    });
    infoRows.push({
      columns: [
        { label: "Código", value: activeEventPass?.passCode || "—" },
        { label: "Puntos", value: String(points) },
      ],
    });
  } else if (hasEventPass) {
    infoRows.push({
      columns: [
        { label: "Evento", value: eventTitle },
        { label: "Código", value: activeEventPass.passCode || "—" },
      ],
    });
    infoRows.push({
      columns: [
        { label: "Horario", value: eventSchedule || "—" },
        { label: "Sede", value: activeEventPass.eventLocation || "—" },
      ],
    });
  }
  if (hasMembership) {
    infoRows.push({
      columns: [
        { label: "Miembro", value: userName },
        { label: "Plan", value: membership.plan_name || "—" },
      ],
    });
    infoRows.push({
      columns: [
        { label: "Modalidad", value: membershipCategoryLabel },
        { label: "Meta", value: progressSummary.completionLabel },
      ],
    });
    infoRows.push({
      columns: [
        { label: "Disponibles", value: progressSummary.remainingLabel },
        { label: "Reglas", value: [nonTransferable ? "No transferible" : "", nonRepeatable ? "No repetible" : ""].filter(Boolean).join(" · ") || "—" },
      ],
    });
  } else {
    infoRows.push({
      columns: [
        { label: "Miembro", value: userName },
        { label: "Puntos", value: String(points) },
      ],
    });
  }

  // ── Build loyaltyObject ──────────────────────────────────────────────────
  const loyaltyObject = {
    id: objectId,
    classId: GW_CLASS_ID,
    state: "ACTIVE",
    accountId: userId,
    accountName: userName,
    hexBackgroundColor: hasEventPass ? GW_HEX_BG_EVENT : GW_HEX_BG,
    barcode: {
      type: "QR_CODE",
      value: qrCode,
    },
    loyaltyPoints: {
      balance: { int: points },
      label: "PUNTOS",
    },
    header: {
      defaultValue: { language: "es", value: passHeader },
    },
    textModulesData: textModules,
    linksModuleData: {
      uris: [
        { uri: `${SITE_URL}/app/wallet`, description: "Mi Wallet", id: "wallet_link" },
        {
          uri: hasEventPass ? `${SITE_URL}/app/events` : `${SITE_URL}/app/bookings`,
          description: hasEventPass ? "Mis Eventos" : "Reservar Clase",
          id: hasEventPass ? "events_link" : "book_link",
        },
      ],
    },
    infoModuleData: {
      showLastUpdateTime: true,
      labelValueRows: infoRows,
    },
  };

  const payload = {
    iss: GW_SA_EMAIL,
    aud: "google",
    origins: [SITE_URL],
    typ: "savetowallet",
    payload: {
      loyaltyObjects: [loyaltyObject],
    },
  };
  const signedJwt = jwt.sign(payload, GW_SA_PRIVATE_KEY, { algorithm: "RS256" });
  return `https://pay.google.com/gp/v/save/${signedJwt}`;
}

// ─── Routes: /api/wallet/google ─────────────────────────────────────────────

// GET /api/wallet/google/save-url — returns Save URL for logged-in user
app.get("/api/wallet/google/save-url", authMiddleware, async (req, res) => {
  if (!isGoogleWalletConfigured()) {
    return res.status(503).json({ message: "Google Wallet no configurado", detail: { issuer: !!GW_ISSUER_ID, email: !!GW_SA_EMAIL, key: !!GW_SA_PRIVATE_KEY } });
  }
  try {
    // Ensure loyalty class exists (best-effort — don't fail the request if this errors)
    try {
      await ensureGoogleWalletClass();
    } catch (classErr) {
      console.error("Google Wallet class ensure error (non-fatal):", classErr.response?.data || classErr.message);
    }
    const snapshot = await getWalletSnapshotForUser(req.userId);
    if (!snapshot) return res.status(404).json({ message: "Usuario no encontrado" });
    const saveUrl = buildGoogleWalletSaveUrl({ ...snapshot, activeEventPass: null, passKind: "membership" });
    return res.json({ data: { saveUrl } });
  } catch (err) {
    console.error("Google Wallet save-url error:", err.response?.data || err.message, err.stack?.split("\n").slice(0,3).join("\n"));
    return res.status(500).json({ message: "Error generando pase de Google Wallet", detail: err.message });
  }
});

// GET /api/wallet/events/google/save-url — returns event-specific Save URL for logged-in user
app.get("/api/wallet/events/google/save-url", authMiddleware, async (req, res) => {
  if (!isGoogleWalletConfigured()) {
    return res.status(503).json({ message: "Google Wallet no configurado", detail: { issuer: !!GW_ISSUER_ID, email: !!GW_SA_EMAIL, key: !!GW_SA_PRIVATE_KEY } });
  }
  try {
    const eventIdRaw = String(req.query?.eventId || "").trim();
    const eventId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventIdRaw)
      ? eventIdRaw
      : null;
    if (!eventId) return res.status(400).json({ message: "eventId inválido" });

    try {
      await ensureGoogleWalletClass();
    } catch (classErr) {
      console.error("Google Wallet class ensure error (non-fatal):", classErr.response?.data || classErr.message);
    }

    const snapshot = await getWalletSnapshotForUser(req.userId, { eventId });
    if (!snapshot) return res.status(404).json({ message: "Usuario no encontrado" });
    if (!snapshot.activeEventPass) {
      return res.status(404).json({ message: "No existe pase activo para ese evento" });
    }
    const saveUrl = buildGoogleWalletSaveUrl({
      ...snapshot,
      membership: null,
      nextBooking: null,
      passKind: "event",
    });
    return res.json({ data: { saveUrl } });
  } catch (err) {
    console.error("Google Wallet event save-url error:", err.response?.data || err.message, err.stack?.split("\n").slice(0, 3).join("\n"));
    return res.status(500).json({ message: "Error generando pase de evento en Google Wallet", detail: err.message });
  }
});

// GET /api/wallet/google/diagnostics — check env config (admin only)
app.get("/api/wallet/google/diagnostics", adminMiddleware, async (_req, res) => {
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY || "";
  const keyPreview = GW_SA_PRIVATE_KEY
    ? `parsed_length=${GW_SA_PRIVATE_KEY.length}, hasNewlines=${GW_SA_PRIVATE_KEY.includes("\n")}, begins=${GW_SA_PRIVATE_KEY.substring(0, 32)}…`
    : "❌ missing";
  const rawKeyPreview = rawKey
    ? `raw_length=${rawKey.length}, hasBeginMarker=${rawKey.includes("-----BEGIN")}, hasLiteralBackslashN=${rawKey.includes("\\n")}`
    : "❌ env var not set";

  // Test JWT signing
  let jwtSignTest = "not tested";
  if (GW_SA_EMAIL && GW_SA_PRIVATE_KEY) {
    try {
      jwt.sign({ iss: GW_SA_EMAIL, aud: "test", iat: Math.floor(Date.now() / 1000) }, GW_SA_PRIVATE_KEY, { algorithm: "RS256" });
      jwtSignTest = "✅ JWT signing works";
    } catch (e) {
      jwtSignTest = `❌ JWT signing failed: ${e.message}`;
    }
  }

  // Test OAuth token
  let oauthTest = "not tested";
  if (isGoogleWalletConfigured()) {
    try {
      const token = await getGoogleWalletAccessToken();
      oauthTest = `✅ Got access token (${token.substring(0, 10)}...)`;
    } catch (e) {
      oauthTest = `❌ OAuth failed: ${e.response?.data?.error_description || e.message}`;
    }
  }

  return res.json({
    configured: isGoogleWalletConfigured(),
    issuerId: GW_ISSUER_ID ? `✅ ${GW_ISSUER_ID}` : "❌ missing",
    saEmail: GW_SA_EMAIL ? `✅ ${GW_SA_EMAIL}` : "❌ missing",
    saPrivateKey: keyPreview,
    rawKeyInfo: rawKeyPreview,
    classId: GW_CLASS_ID || "N/A",
    issuerName: GW_ISSUER_NAME,
    programName: GW_PROGRAM_NAME,
    jwtSignTest,
    oauthTest,
  });
});

// ─── Apple Wallet config ────────────────────────────────────────────────────

const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "";
const APPLE_PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID || "";
const APPLE_KEY_ID = process.env.APPLE_KEY_ID || "";
const APPLE_APNS_KEY_BASE64 = process.env.APPLE_APNS_KEY_BASE64 || "";
const APPLE_AUTH_TOKEN = process.env.APPLE_AUTH_TOKEN || crypto.randomBytes(32).toString("hex");
const APPLE_CERT_PASSWORD = process.env.APPLE_CERT_PASSWORD || "";

// ── Certificate loading: files first, then base64 env vars ──────────────────
// Priority 1: Read from files in wallet-assets/apple-pass/
// Priority 2: Decode from base64 env vars (APPLE_SIGNER_CERT_BASE64, etc.)

function safeExists(filePath) {
  try {
    return !!filePath && fs.existsSync(filePath);
  } catch (_) {
    return false;
  }
}

function normalizePemText(value) {
  if (!value) return "";
  return String(value)
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function looksLikeBase64(value) {
  const raw = String(value || "").replace(/\s/g, "");
  if (raw.length < 100) return false;
  return /^[A-Za-z0-9+/=]+$/.test(raw);
}

const WALLET_ASSET_DIR_CANDIDATES = [
  process.env.APPLE_PASS_CERT_DIR,
  path.join(__dirname, "..", "wallet-assets", "apple-pass"),
  path.join(__dirname, "wallet-assets", "apple-pass"),
  path.join(process.cwd(), "wallet-assets", "apple-pass"),
  "/app/wallet-assets/apple-pass",
  "/app/server/wallet-assets/apple-pass",
].filter(Boolean);

const WALLET_ASSETS_DIR = WALLET_ASSET_DIR_CANDIDATES.find((dir) => safeExists(dir)) || WALLET_ASSET_DIR_CANDIDATES[0];

const CERT_FILE_CANDIDATES = {
  cert: [
    process.env.APPLE_PASS_CERT_PATH,
    process.env.APPLE_PASS_CERT,
    path.join(WALLET_ASSETS_DIR, "pass.pem"),
    path.join(WALLET_ASSETS_DIR, "certificate.pem"),
  ].filter(Boolean),
  key: [
    process.env.APPLE_PASS_KEY_PATH,
    process.env.APPLE_PASS_KEY,
    path.join(WALLET_ASSETS_DIR, "pass.key"),
    path.join(WALLET_ASSETS_DIR, "private.key"),
  ].filter(Boolean),
  wwdr: [
    process.env.APPLE_PASS_WWDR_PATH,
    process.env.APPLE_PASS_WWDR,
    path.join(WALLET_ASSETS_DIR, "wwdr.pem"),
    path.join(WALLET_ASSETS_DIR, "AppleWWDRCA.pem"),
    path.join(WALLET_ASSETS_DIR, "wwdr_rsa.pem"),
  ].filter(Boolean),
};

/** Try to load PEM from file, return empty string if not found */
function loadCertFile(filePath) {
  try {
    if (safeExists(filePath)) {
      const content = normalizePemText(fs.readFileSync(filePath, "utf8"));
      if (content.includes("-----BEGIN")) {
        console.log(`[Apple Wallet] ✅ Loaded cert from file: ${filePath} (${content.length} chars)`);
        return content;
      }
    }
  } catch (e) {
    console.error(`[Apple Wallet] ❌ Error reading ${filePath}:`, e.message);
  }
  return "";
}

function loadFirstCertFile(paths = []) {
  for (const p of paths) {
    const cert = loadCertFile(p);
    if (cert) return cert;
  }
  return "";
}

/** Decode base64 env var to PEM, ensuring proper PEM formatting */
function decodeBase64ToPem(b64, label = "CERTIFICATE") {
  if (!b64) return "";
  try {
    let raw = Buffer.from(String(b64), "base64").toString("utf8").trim();
    if (!raw) return "";
    if (raw.includes("-----BEGIN")) {
      return normalizePemText(raw);
    }
    const cleanB64 = String(b64).replace(/[\s\n\r]/g, "");
    if (!cleanB64) return "";
    const lines = cleanB64.match(/.{1,64}/g) || [cleanB64];
    return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
  } catch (_) {
    return "";
  }
}

function loadPemFromEnvValue(value, label = "CERTIFICATE") {
  const raw = normalizePemText(value || "");
  if (!raw) return "";
  if (raw.includes("-----BEGIN")) return raw;
  if (safeExists(raw)) return loadCertFile(raw);
  if (looksLikeBase64(raw)) return decodeBase64ToPem(raw, label);
  return "";
}

const CERT_FILE_PATHS = {
  cert: CERT_FILE_CANDIDATES.cert.find((p) => safeExists(p)) || CERT_FILE_CANDIDATES.cert[0] || "",
  key: CERT_FILE_CANDIDATES.key.find((p) => safeExists(p)) || CERT_FILE_CANDIDATES.key[0] || "",
  wwdr: CERT_FILE_CANDIDATES.wwdr.find((p) => safeExists(p)) || CERT_FILE_CANDIDATES.wwdr[0] || "",
};

// Load certs: env PEM/path first, then files, then base64 env vars
const APPLE_SIGNER_CERT_PEM =
  loadPemFromEnvValue(process.env.APPLE_SIGNER_CERT_PEM || process.env.APPLE_PASS_CERT_PEM || process.env.APPLE_PASS_CERT, "CERTIFICATE")
  || loadFirstCertFile(CERT_FILE_CANDIDATES.cert)
  || decodeBase64ToPem(process.env.APPLE_SIGNER_CERT_BASE64 || process.env.APPLE_PASS_CERT_BASE64 || "", "CERTIFICATE");

const APPLE_SIGNER_KEY_PEM =
  loadPemFromEnvValue(process.env.APPLE_SIGNER_KEY_PEM || process.env.APPLE_PASS_KEY_PEM || process.env.APPLE_PASS_KEY, "PRIVATE KEY")
  || loadFirstCertFile(CERT_FILE_CANDIDATES.key)
  || decodeBase64ToPem(process.env.APPLE_SIGNER_KEY_BASE64 || process.env.APPLE_PASS_KEY_BASE64 || "", "PRIVATE KEY");

const APPLE_WWDR_CERT_PEM =
  loadPemFromEnvValue(process.env.APPLE_WWDR_CERT_PEM || process.env.APPLE_PASS_WWDR_PEM || process.env.APPLE_PASS_WWDR, "CERTIFICATE")
  || loadFirstCertFile(CERT_FILE_CANDIDATES.wwdr)
  || decodeBase64ToPem(process.env.APPLE_WWDR_CERT_BASE64 || process.env.APPLE_PASS_WWDR_BASE64 || "", "CERTIFICATE");

const APPLE_APNS_KEY_PEM =
  loadPemFromEnvValue(process.env.APPLE_APNS_KEY_PEM || process.env.APPLE_APNS_KEY || process.env.APPLE_APNS_KEY_PATH, "PRIVATE KEY")
  || decodeBase64ToPem(APPLE_APNS_KEY_BASE64 || "", "PRIVATE KEY");
const APPLE_APNS_HOST = process.env.APPLE_APNS_HOST || "https://api.push.apple.com";

function isAppleWalletConfigured() {
  return !!(APPLE_TEAM_ID && APPLE_PASS_TYPE_ID && APPLE_SIGNER_CERT_PEM && APPLE_SIGNER_KEY_PEM && APPLE_WWDR_CERT_PEM);
}

function isAppleApnsConfigured() {
  return !!(APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PASS_TYPE_ID && APPLE_APNS_KEY_PEM);
}

function buildAppleWalletSerialFromUserId(userId) {
  const cleaned = String(userId || "").trim();
  if (!cleaned) return "";
  return `kala_${cleaned.replace(/-/g, "")}`;
}

function parseUserIdFromAppleWalletSerial(serial) {
  const raw = String(serial || "").replace(/^(kala_|ophelia_)/, "").trim();
  if (!/^[0-9a-fA-F]{32}$/.test(raw)) return null;
  return raw.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5").toLowerCase();
}

function truncateWalletField(value, max = 26) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function getKalaWalletCategoryLabel(category) {
  const normalized = normalizeClassCategory(category, "all");
  if (normalized === "barre" || normalized === "all" || normalized === "general") return "Barre";
  if (normalized === "pilates") return "Pilates";
  if (normalized === "jumping") return "Barre";
  if (normalized === "mixto") return "Barre";
  return "Barre";
}

function getWalletProgressSummary(membership) {
  if (!membership) {
    return {
      isUnlimited: false,
      classLimit: 0,
      classesRemaining: 0,
      classesUsed: 0,
      completionPercent: 0,
      completionLabel: "Sin meta activa",
      remainingLabel: "Sin paquete activo",
      goalLabel: "Activa un plan para iniciar tu meta",
    };
  }

  const classLimitRaw = membership.class_limit;
  const isUnlimited = classLimitRaw === null || Number(classLimitRaw) >= 9999;
  if (isUnlimited) {
    return {
      isUnlimited: true,
      classLimit: null,
      classesRemaining: null,
      classesUsed: null,
      completionPercent: 100,
      completionLabel: "Meta abierta",
      remainingLabel: "Clases ilimitadas",
      goalLabel: "Constancia activa",
    };
  }

  const classLimit = Math.max(0, Number(classLimitRaw || 0));
  const classesRemaining = Math.max(0, Number(membership.classes_remaining ?? classLimit));
  const classesUsed = Math.max(0, classLimit - classesRemaining);
  const completionPercent = classLimit > 0 ? Math.round((classesUsed / classLimit) * 100) : 0;
  return {
    isUnlimited: false,
    classLimit,
    classesRemaining,
    classesUsed,
    completionPercent,
    completionLabel: classLimit > 0 ? `${classesUsed}/${classLimit} completadas` : "Sin meta activa",
    remainingLabel: classLimit > 0 ? `${classesRemaining} restantes` : "Sin paquete activo",
    goalLabel: classLimit > 0 ? `${completionPercent}% de tu meta` : "Activa un plan para iniciar tu meta",
  };
}

function getKalaWeeklyRingState(membership, points = 0) {
  const progressSummary = getWalletProgressSummary(membership);
  const classLimit = progressSummary.isUnlimited ? 20 : Number(progressSummary.classLimit || 0);
  const classesUsed = progressSummary.isUnlimited
    ? Math.max(0, Math.round(progressSummary.completionPercent / 20))
    : Number(progressSummary.classesUsed || 0);
  const constanciaGoal = progressSummary.isUnlimited ? 5 : Math.max(1, Math.min(5, Math.ceil((classLimit || 4) / 4)));
  const constanciaProgress = Math.min(constanciaGoal, classesUsed);
  const esfuerzoGoal = Math.max(1, Math.ceil(constanciaGoal * 0.6));
  const esfuerzoProgress = Math.min(esfuerzoGoal, Math.floor(constanciaProgress * 0.6));
  const conexionGoal = 10;
  const conexionProgress = Math.min(conexionGoal, Math.floor((Math.max(0, Number(points || 0)) % 500) / 50));

  const ringsClosed =
    (constanciaProgress >= constanciaGoal ? 1 : 0) +
    (esfuerzoProgress >= esfuerzoGoal ? 1 : 0) +
    (conexionProgress >= conexionGoal ? 1 : 0);

  return {
    source: "membership_fallback",
    period: "weekly",
    constancia: {
      progress: constanciaProgress,
      goal: constanciaGoal,
      label: "Clases asistidas",
    },
    esfuerzo: {
      progress: esfuerzoProgress,
      goal: esfuerzoGoal,
      label: "Clases intensas o retos",
    },
    conexion: {
      progress: conexionProgress,
      goal: conexionGoal,
      label: "Puntos comunidad",
    },
    rings_closed: ringsClosed,
    reward_unlocked: ringsClosed >= 3,
  };
}

async function getKalaWeeklyRingStateForUser(userId, membership, points = 0) {
  try {
    const ringRes = await pool.query(
      `SELECT week_start,
              constancia_progress,
              constancia_goal,
              esfuerzo_progress,
              esfuerzo_goal,
              conexion_progress,
              conexion_goal,
              rings_closed,
              reward_unlocked,
              reward_claimed_at,
              source
         FROM ring_states
        WHERE user_id = $1
          AND week_start = date_trunc('week', NOW() AT TIME ZONE 'America/Mexico_City')::date
        LIMIT 1`,
      [userId],
    );
    if (ringRes.rows.length > 0) {
      const row = ringRes.rows[0];
      return {
        source: row.source || "ring_states",
        period: "weekly",
        week_start: row.week_start,
        constancia: {
          progress: Number(row.constancia_progress || 0),
          goal: Number(row.constancia_goal || 1),
          label: "Clases asistidas",
        },
        esfuerzo: {
          progress: Number(row.esfuerzo_progress || 0),
          goal: Number(row.esfuerzo_goal || 1),
          label: "Clases intensas o retos",
        },
        conexion: {
          progress: Number(row.conexion_progress || 0),
          goal: Number(row.conexion_goal || 10),
          label: "Puntos comunidad",
        },
        rings_closed: Number(row.rings_closed || 0),
        reward_unlocked: parseBooleanFlag(row.reward_unlocked),
        reward_claimed_at: row.reward_claimed_at || null,
      };
    }
  } catch (err) {
    console.warn("[Rings] Falling back to membership-derived state:", err?.message || err);
  }

  return getKalaWeeklyRingState(membership, points);
}

/** Find image assets — check both public/ and dist/ directories */
function findAssetDir() {
  const candidates = [
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "..", "dist"),
    path.join(__dirname, "..", "dist", "public"),
    path.join(process.cwd(), "public"),
    path.join(process.cwd(), "dist"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "ophelia-logo.png"))) {
      return dir;
    }
  }
  return candidates[0];
}

/** Find the first existing asset file by trying file names across common asset dirs. */
function findAssetFile(fileNames = []) {
  const dirs = [
    findAssetDir(),
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "..", "src", "assets"),
    path.join(process.cwd(), "public"),
    path.join(process.cwd(), "src", "assets"),
  ];
  const checked = new Set();
  for (const dir of dirs) {
    if (!dir || checked.has(dir)) continue;
    checked.add(dir);
    for (const name of fileNames) {
      const fullPath = path.join(dir, name);
      if (fs.existsSync(fullPath)) return fullPath;
    }
  }
  return null;
}

const WALLET_STRIP_TOTAL_BUCKETS = [1, 4, 8, 12, 16, 20];

function resolveWalletStripStampState(classLimitRaw, classesRemainingRaw) {
  const classLimit = Number(classLimitRaw ?? 0);
  const classesRemaining = Math.max(0, Number(classesRemainingRaw ?? 0));
  if (!Number.isFinite(classLimit) || classLimit <= 0) {
    return { total: 0, remaining: 0 };
  }
  const nearestTotal = WALLET_STRIP_TOTAL_BUCKETS.reduce((best, current) =>
    Math.abs(current - classLimit) < Math.abs(best - classLimit) ? current : best,
  WALLET_STRIP_TOTAL_BUCKETS[0]);
  const ratio = classLimit > 0 ? Math.min(1, Math.max(0, classesRemaining / classLimit)) : 0;
  const remainingBucket = Math.min(nearestTotal, Math.max(0, Math.round(ratio * nearestTotal)));
  return { total: nearestTotal, remaining: remainingBucket };
}

const appleApnsProviderTokenCache = {
  token: "",
  expiresAtMs: 0,
};

function getAppleApnsProviderToken() {
  const now = Date.now();
  if (appleApnsProviderTokenCache.token && appleApnsProviderTokenCache.expiresAtMs > now + 30_000) {
    return appleApnsProviderTokenCache.token;
  }
  if (!isAppleApnsConfigured()) {
    throw new Error("Apple APNS no configurado");
  }
  const iat = Math.floor(now / 1000);
  const token = jwt.sign(
    { iss: APPLE_TEAM_ID, iat },
    APPLE_APNS_KEY_PEM,
    {
      algorithm: "ES256",
      header: { alg: "ES256", kid: APPLE_KEY_ID },
    },
  );
  // Apple recomienda reutilizar por hasta 60 min. Renovamos cada 50 min.
  appleApnsProviderTokenCache.token = token;
  appleApnsProviderTokenCache.expiresAtMs = now + 50 * 60 * 1000;
  return token;
}

function shouldPruneApplePushToken(pushResult) {
  if (!pushResult || pushResult.ok) return false;
  if (pushResult.status === 410) return true;
  const badReasons = new Set(["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]);
  return pushResult.status === 400 && badReasons.has(pushResult.reason);
}

function sendApplePassUpdatedPush(pushToken, providerToken) {
  return new Promise((resolve) => {
    const session = http2.connect(APPLE_APNS_HOST);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { session.close(); } catch (_) { }
      resolve(result);
    };
    session.setTimeout(12_000, () => finish({ ok: false, status: 0, reason: "APNS timeout", pushToken }));
    session.on("error", (err) => finish({ ok: false, status: 0, reason: err.message, pushToken }));

    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${pushToken}`,
      authorization: `bearer ${providerToken}`,
      "apns-topic": APPLE_PASS_TYPE_ID,
      "apns-push-type": "background",
      "apns-priority": "5",
      "content-type": "application/json",
    });

    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers?.[":status"] || 0);
    });
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      let reason = "";
      if (body) {
        try {
          reason = JSON.parse(body)?.reason || "";
        } catch (_) {
          reason = body.slice(0, 120);
        }
      }
      finish({ ok: status === 200, status, reason, pushToken });
    });
    req.on("error", (err) => finish({ ok: false, status: 0, reason: err.message, pushToken }));
    req.end("{}");
  });
}

async function getWalletSnapshotForUser(userId, { eventId = null } = {}) {
  const userRes = await pool.query("SELECT id, email, display_name FROM users WHERE id = $1 LIMIT 1", [userId]);
  if (!userRes.rows.length) return null;
  const user = userRes.rows[0];
  const userName = user.display_name || user.email;

  const pointsRes = await pool.query(
    "SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points WHEN type='adjust' THEN points ELSE -points END), 0) AS total FROM loyalty_transactions WHERE user_id = $1",
    [userId],
  );
  const points = parseInt(pointsRes.rows[0]?.total ?? 0, 10) || 0;

  let membership = null;
  try {
    const memRes = await pool.query(
      `SELECT m.id, m.status, m.classes_remaining, m.start_date, m.end_date,
              m.plan_name_override, m.class_limit_override,
              p.name AS plan_name, p.class_limit AS plan_class_limit,
              p.class_category, p.is_non_transferable, p.is_non_repeatable, p.repeat_key
       FROM memberships m
       LEFT JOIN plans p ON m.plan_id = p.id
       WHERE m.user_id = $1 AND m.status = 'active' AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
       ORDER BY m.end_date DESC NULLS LAST
       LIMIT 1`,
      [userId],
    );
    if (memRes.rows.length > 0) {
      const m = memRes.rows[0];
      membership = {
        plan_name: m.plan_name_override || m.plan_name || "Plan Activo",
        class_limit: m.class_limit_override ?? m.plan_class_limit,
        classes_remaining: m.classes_remaining,
        start_date: m.start_date,
        end_date: m.end_date,
        class_category: normalizeClassCategory(m.class_category, "all"),
        is_non_transferable: parseBooleanFlag(m.is_non_transferable),
        is_non_repeatable: parseBooleanFlag(m.is_non_repeatable),
        repeat_key: m.repeat_key || null,
      };
    }
  } catch (err) {
    console.error("[Wallet] membership snapshot error:", err.message);
  }

  let nextBooking = null;
  try {
    const bookRes = await pool.query(
      `SELECT c.date, c.start_time, ct.name AS class_name, i.display_name AS instructor_name
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       LEFT JOIN instructors i ON c.instructor_id = i.id
       WHERE b.user_id = $1
         AND b.status IN ('confirmed', 'waitlist')
         AND c.date >= CURRENT_DATE
       ORDER BY c.date ASC, c.start_time ASC
       LIMIT 1`,
      [userId],
    );
    if (bookRes.rows.length > 0) nextBooking = bookRes.rows[0];
  } catch (err) {
    console.error("[Wallet] next booking snapshot error:", err.message);
  }

  let activeEventPass = null;
  try {
    const params = [userId];
    const where = [
      "ep.user_id = $1",
      "ep.status = 'issued'",
      "e.status <> 'cancelled'",
    ];
    if (eventId) {
      params.push(eventId);
      where.push(`ep.event_id = $${params.length}`);
    } else {
      where.push(`(
        e.date > CURRENT_DATE
        OR (e.date = CURRENT_DATE AND (e.end_time IS NULL OR e.end_time >= CURRENT_TIME))
      )`);
    }
    const eventPassRes = await pool.query(
      `SELECT ep.id,
              ep.pass_code,
              ep.status,
              ep.issued_at,
              e.id AS event_id,
              e.title AS event_title,
              e.date AS event_date,
              e.start_time AS event_start_time,
              e.end_time AS event_end_time,
              e.location AS event_location
         FROM event_passes ep
         JOIN events e ON e.id = ep.event_id
        WHERE ${where.join("\n          AND ")}
        ORDER BY e.date ASC, e.start_time ASC, ep.issued_at DESC
        LIMIT 1`,
      params,
    );
    if (eventPassRes.rows.length > 0) {
      const ev = eventPassRes.rows[0];
      activeEventPass = {
        id: ev.id,
        passCode: ev.pass_code,
        status: ev.status,
        issuedAt: ev.issued_at,
        eventId: ev.event_id,
        eventTitle: ev.event_title || "Evento especial",
        eventDate: ev.event_date,
        eventStartTime: ev.event_start_time,
        eventEndTime: ev.event_end_time,
        eventLocation: ev.event_location || "",
      };
    }
  } catch (err) {
    console.error("[Wallet] active event pass snapshot error:", err.message);
  }

  const rings = await getKalaWeeklyRingStateForUser(userId, membership, points);

  return {
    userId,
    userName,
    points,
    qrCode: Buffer.from(String(userId)).toString("base64"),
    membership,
    rings,
    nextBooking,
    activeEventPass,
  };
}

function decodeBase64UrlToObject(value) {
  if (!value) return null;
  try {
    const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch (_) {
    return null;
  }
}

function extractGoogleLoyaltyObjectFromSaveUrl(saveUrl) {
  const token = String(saveUrl || "").split("/save/")[1] || "";
  const payloadPart = token.split(".")[1] || "";
  const decoded = decodeBase64UrlToObject(payloadPart);
  return decoded?.payload?.loyaltyObjects?.[0] || null;
}

async function syncGoogleWalletObjectForUser(userId, { reason = "wallet_update" } = {}) {
  if (!isGoogleWalletConfigured()) {
    return { synced: false, reason: "google_wallet_not_configured" };
  }
  const snapshot = await getWalletSnapshotForUser(userId);
  if (!snapshot) return { synced: false, reason: "user_not_found" };

  const saveUrl = buildGoogleWalletSaveUrl({ ...snapshot, activeEventPass: null, passKind: "membership" });
  const loyaltyObject = extractGoogleLoyaltyObjectFromSaveUrl(saveUrl);
  if (!loyaltyObject?.id) {
    return { synced: false, reason: "google_object_build_failed" };
  }

  try {
    await ensureGoogleWalletClass();
    const accessToken = await getGoogleWalletAccessToken();
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const objectIdPath = encodeURIComponent(loyaltyObject.id);
    try {
      await axios.put(
        `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectIdPath}`,
        loyaltyObject,
        { headers },
      );
      return { synced: true, mode: "updated", objectId: loyaltyObject.id };
    } catch (err) {
      if (err.response?.status !== 404) throw err;
      await axios.post(
        "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject",
        loyaltyObject,
        { headers },
      );
      return { synced: true, mode: "created", objectId: loyaltyObject.id };
    }
  } catch (err) {
    console.error(`[Google Wallet] sync failed (${reason}) user=${userId}:`, err.response?.data || err.message);
    return { synced: false, reason: err.message || "google_sync_failed" };
  }
}

async function notifyApplePassUpdatedForUser(userId, { reason = "wallet_update" } = {}) {
  const serial = buildAppleWalletSerialFromUserId(userId);
  if (!serial || !APPLE_PASS_TYPE_ID) {
    return { serial, touched: 0, sent: 0, failed: 0, reason: "missing_serial_or_pass_type" };
  }

  let touched = 0;
  try {
    const touchRes = await pool.query(
      "UPDATE apple_wallet_devices SET updated_at = NOW() WHERE pass_type_id = $1 AND serial_number = $2",
      [APPLE_PASS_TYPE_ID, serial],
    );
    touched = touchRes.rowCount || 0;
  } catch (err) {
    console.error("[Apple Wallet] touch serial error:", err.message);
  }

  const regRes = await pool.query(
    `SELECT device_id, push_token
     FROM apple_wallet_devices
     WHERE pass_type_id = $1 AND serial_number = $2 AND COALESCE(push_token, '') <> ''`,
    [APPLE_PASS_TYPE_ID, serial],
  ).catch(() => ({ rows: [] }));
  const pushTokens = [...new Set(regRes.rows.map((r) => String(r.push_token || "").trim()).filter(Boolean))];

  if (!pushTokens.length) {
    return { serial, touched, total: 0, sent: 0, failed: 0, reason: "no_registered_devices" };
  }

  if (!isAppleApnsConfigured()) {
    console.log(`[Apple Wallet] APNS no configurado; pase marcado para ${serial} (${reason})`);
    return { serial, touched, total: pushTokens.length, sent: 0, failed: 0, reason: "apns_not_configured" };
  }

  let providerToken = "";
  try {
    providerToken = getAppleApnsProviderToken();
  } catch (err) {
    console.error("[Apple Wallet] APNS token error:", err.message);
    return { serial, touched, total: pushTokens.length, sent: 0, failed: pushTokens.length, reason: "apns_token_error" };
  }

  const pushResults = [];
  for (const pushToken of pushTokens) {
    // Throttle light to reduce burst rate on APNS.
    const result = await sendApplePassUpdatedPush(pushToken, providerToken);
    pushResults.push(result);
    await new Promise((r) => setTimeout(r, 120));
  }

  const sent = pushResults.filter((r) => r.ok).length;
  const failed = pushResults.length - sent;
  const tokensToPrune = pushResults.filter(shouldPruneApplePushToken).map((r) => r.pushToken);
  if (tokensToPrune.length) {
    await pool.query(
      `UPDATE apple_wallet_devices
       SET push_token = '', updated_at = NOW()
       WHERE pass_type_id = $1 AND serial_number = $2 AND push_token = ANY($3::text[])`,
      [APPLE_PASS_TYPE_ID, serial, tokensToPrune],
    ).catch(() => { });
  }

  if (failed > 0) {
    const sampleReason = pushResults.find((r) => !r.ok)?.reason || "unknown";
    console.warn(`[Apple Wallet] push parcial serial=${serial}, sent=${sent}, failed=${failed}, reason=${sampleReason}`);
  }

  return { serial, touched, total: pushResults.length, sent, failed, reason: failed ? "partial_failure" : "ok" };
}

async function persistWalletNotificationLog(payload) {
  const userId = payload?.userId || null;
  const reason = String(payload?.reason || "wallet_update").slice(0, 160);
  const apple = payload?.apple || {};
  const google = payload?.google || {};
  const appleSent = Number(apple.sent || 0);
  const appleFailed = Number(apple.failed || 0);
  const googleSynced = !!google.synced;
  const googleMode = google.mode ? String(google.mode).slice(0, 40) : null;
  const appleReason = String(apple.reason || "");
  const googleReason = String(google.reason || "");
  const appleOk = appleFailed === 0 && !["apns_token_error"].includes(appleReason);
  const googleOk = googleSynced || ["google_wallet_not_configured", "user_not_found"].includes(googleReason);
  const status = appleOk && googleOk ? "ok" : (appleOk || googleOk ? "partial" : "failed");

  await pool.query(
    `INSERT INTO wallet_notification_logs
      (user_id, reason, apple_sent, apple_failed, google_synced, google_mode, status, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [userId, reason, appleSent, appleFailed, googleSynced, googleMode, status, JSON.stringify({ apple, google })],
  );
}

async function notifyWalletPassesUpdatedForUser(userId, { reason = "wallet_update" } = {}) {
  if (!userId) {
    return { userId, reason, apple: { reason: "missing_user_id" }, google: { reason: "missing_user_id" } };
  }
  const [appleResult, googleResult] = await Promise.allSettled([
    notifyApplePassUpdatedForUser(userId, { reason }),
    syncGoogleWalletObjectForUser(userId, { reason }),
  ]);
  const result = {
    userId,
    reason,
    apple: appleResult.status === "fulfilled" ? appleResult.value : { reason: appleResult.reason?.message || "apple_notify_failed" },
    google: googleResult.status === "fulfilled" ? googleResult.value : { reason: googleResult.reason?.message || "google_sync_failed" },
  };
  await persistWalletNotificationLog(result).catch((err) => {
    console.error("[Wallet] could not persist notification log:", err.message);
  });
  return result;
}

const walletSyncQueue = new Map();

function triggerWalletPassSync(userId, reason = "wallet_update") {
  if (!userId) return;
  const key = String(userId);
  const existing = walletSyncQueue.get(key);
  if (existing?.timer) {
    clearTimeout(existing.timer);
    existing.reasons.add(reason);
  }
  const reasons = existing?.reasons || new Set([reason]);
  const timer = setTimeout(() => {
    walletSyncQueue.delete(key);
    const mergedReason = [...reasons].join(",");
    notifyWalletPassesUpdatedForUser(userId, { reason: mergedReason }).catch((err) => {
      console.error(`[Wallet] async sync failed (${mergedReason}) user=${userId}:`, err.message);
    });
  }, 1500);
  walletSyncQueue.set(key, { timer, reasons });
}

console.log("[Apple Wallet] Config check:",
  isAppleWalletConfigured() ? "✅ All certs configured — .pkpass mode" : "⚠️ Missing certs — web pass fallback mode");
console.log("[Apple Wallet]",
  "| TEAM:", APPLE_TEAM_ID ? "✅" : "❌",
  "| PASS_TYPE:", APPLE_PASS_TYPE_ID ? "✅" : "❌",
  "| CERT:", APPLE_SIGNER_CERT_PEM ? `✅ (${APPLE_SIGNER_CERT_PEM.length} chars)` : "❌",
  "| KEY:", APPLE_SIGNER_KEY_PEM ? `✅ (${APPLE_SIGNER_KEY_PEM.length} chars)` : "❌",
  "| WWDR:", APPLE_WWDR_CERT_PEM ? `✅ (${APPLE_WWDR_CERT_PEM.length} chars)` : "❌",
  "| APNS:", isAppleApnsConfigured() ? "✅" : "⚠️");
console.log("[Apple Wallet] File paths checked:",
  "cert:", CERT_FILE_PATHS.cert, safeExists(CERT_FILE_PATHS.cert) ? "✅" : "❌",
  "| key:", CERT_FILE_PATHS.key, safeExists(CERT_FILE_PATHS.key) ? "✅" : "❌",
  "| wwdr:", CERT_FILE_PATHS.wwdr, safeExists(CERT_FILE_PATHS.wwdr) ? "✅" : "❌");
console.log("[Apple Wallet] Cert dir candidates:", WALLET_ASSET_DIR_CANDIDATES.join(" | "));
console.log("[Apple Wallet] ASSET_DIR:", findAssetDir());

// Validate certs at startup if configured
if (isAppleWalletConfigured()) {
  try {
    console.log("[Apple Wallet] Cert PEM starts with:", APPLE_SIGNER_CERT_PEM.substring(0, 50));
    console.log("[Apple Wallet] Key PEM starts with:", APPLE_SIGNER_KEY_PEM.substring(0, 50));
    console.log("[Apple Wallet] WWDR PEM starts with:", APPLE_WWDR_CERT_PEM.substring(0, 50));
    try {
      crypto.createPrivateKey(APPLE_SIGNER_KEY_PEM);
      console.log("[Apple Wallet] ✅ Private key validated successfully");
    } catch (keyErr) {
      console.error("[Apple Wallet] ❌ Private key validation failed:", keyErr.message);
    }
  } catch (certErr) {
    console.error("[Apple Wallet] ❌ Cert decode error:", certErr.message);
  }
}

/** Check if we can at least generate a web pass (always true — no certs needed) */
function isAppleWebPassAvailable() {
  return true;
}

/**
 * Generate a .pkpass file as a Buffer for a given user.
 * Apple .pkpass = ZIP containing: pass.json, manifest.json, signature, icon.png, logo.png, strip.png
 */
// ─── APNS push for Apple Wallet pass updates ──────────────────────────
// When a pass changes (booking confirmed, ring closed, plan renewed), call
// `pushAppleWalletUpdate(userId)`. Apple Wallet on the device gets the push
// and refetches the pkpass via the webServiceURL endpoint.

let APNS_AUTH_TOKEN_CACHE = { token: null, issuedAt: 0 };

function buildApnsAuthToken() {
  // Token valid for ~60 min; cache for 50.
  const now = Math.floor(Date.now() / 1000);
  if (APNS_AUTH_TOKEN_CACHE.token && now - APNS_AUTH_TOKEN_CACHE.issuedAt < 50 * 60) {
    return APNS_AUTH_TOKEN_CACHE.token;
  }
  if (!APPLE_APNS_KEY_PEM || !APPLE_KEY_ID || !APPLE_TEAM_ID) return null;
  const token = jwt.sign(
    { iss: APPLE_TEAM_ID, iat: now },
    APPLE_APNS_KEY_PEM,
    { algorithm: "ES256", header: { alg: "ES256", kid: APPLE_KEY_ID } },
  );
  APNS_AUTH_TOKEN_CACHE = { token, issuedAt: now };
  return token;
}

async function sendApnsPush(pushToken, passTypeId) {
  return new Promise((resolve) => {
    const authToken = buildApnsAuthToken();
    if (!authToken) {
      resolve({ ok: false, reason: "apns_not_configured" });
      return;
    }
    const client = http2.connect(APPLE_APNS_HOST);
    client.on("error", (err) => {
      resolve({ ok: false, reason: "apns_connect_error", error: err?.message });
      try { client.close(); } catch (_) {}
    });
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${pushToken}`,
      "authorization": `bearer ${authToken}`,
      "apns-topic": passTypeId,
      "apns-push-type": "background",
      "content-type": "application/json",
    });
    req.setEncoding("utf8");
    let status = 0;
    let body = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { client.close(); } catch (_) {}
      resolve({
        ok: status >= 200 && status < 300,
        status,
        body: body.slice(0, 240),
      });
    });
    req.on("error", (err) => {
      try { client.close(); } catch (_) {}
      resolve({ ok: false, reason: "apns_request_error", error: err?.message });
    });
    req.end(JSON.stringify({}));
  });
}

/**
 * Notify Apple Wallet that the pass for `userId` has changed.
 * Looks up all registered devices for this user's pass serial and pushes APNS to each.
 * Best-effort: never throws; logs failures.
 */
async function pushAppleWalletUpdate(userId, { reason = "update" } = {}) {
  if (!isAppleApnsConfigured()) {
    console.log("[Wallet APNS] Skipped: APNS not configured");
    return { sent: 0, skipped: true };
  }
  const serial = buildAppleWalletSerialFromUserId(userId);
  if (!serial) return { sent: 0 };
  try {
    const result = await pool.query(
      `SELECT push_token, pass_type_id
         FROM apple_wallet_devices
         WHERE serial_number = $1 AND push_token <> ''`,
      [serial],
    );
    const devices = result.rows ?? [];
    if (devices.length === 0) {
      console.log(`[Wallet APNS] No registered devices for serial ${serial} (reason=${reason})`);
      return { sent: 0 };
    }
    const outcomes = await Promise.all(
      devices.map((d) =>
        sendApnsPush(d.push_token, d.pass_type_id || APPLE_PASS_TYPE_ID).catch((err) => ({
          ok: false,
          reason: "exception",
          error: err?.message,
        })),
      ),
    );
    const sent = outcomes.filter((o) => o.ok).length;
    const failed = outcomes.length - sent;
    console.log(`[Wallet APNS] Push sent to ${sent}/${outcomes.length} devices for serial ${serial} (reason=${reason})`);
    if (failed > 0) {
      console.warn("[Wallet APNS] Failures:", outcomes.filter((o) => !o.ok).slice(0, 3));
    }
    return { sent, total: outcomes.length };
  } catch (err) {
    console.error("[Wallet APNS] pushAppleWalletUpdate error:", err?.message);
    return { sent: 0, error: err?.message };
  }
}

// ─── Dynamic strip renderer (Kala rings → SVG → PNG via sharp) ─────────
// Builds a 375×123 strip image personalized for each user's ring progress.
// Three concentric arcs (constancia / esfuerzo / conexion) fill to their
// real progress %. The K mark sits on the left as the brand anchor.

const KALA_PASS_PALETTE = {
  cream: "#FFF7F2",
  ink: "#2E201C",
  berry: "#76214D",
  olive: "#778455",
  orange: "#F58A24",
  blush: "#FCE6E1",
  border: "rgba(46,32,28,0.10)",
};

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function arcPath(cx, cy, radius, percent) {
  // Build an SVG arc starting from 12 o'clock, going clockwise.
  // For very small percents we still want a visible nub; for 100% we close the circle.
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  if (pct >= 99.9) {
    // Full circle as two semicircle arcs
    return `M ${cx} ${cy - radius}
            A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius}
            A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius} Z`;
  }
  if (pct <= 0) return "";
  const angle = (pct / 100) * 2 * Math.PI;
  const startX = cx;
  const startY = cy - radius;
  const endX = cx + radius * Math.sin(angle);
  const endY = cy - radius * Math.cos(angle);
  const largeArc = pct > 50 ? 1 : 0;
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`;
}

function buildKalaStripSvg(ringState, scale = 1, opts = {}) {
  const W = Math.round(375 * scale);
  const H = Math.round(123 * scale);
  const c = (n) => Math.round(n * scale);

  // Pull progress percents (0-100) defensively.
  const ring = (k) => {
    const r = ringState?.[k] ?? {};
    const p = Number(r.progress ?? 0);
    const g = Number(r.goal ?? 1);
    if (!Number.isFinite(p) || !Number.isFinite(g) || g <= 0) return 0;
    return Math.min(100, Math.max(0, (p / g) * 100));
  };
  const pConstancia = ring("constancia");
  const pEsfuerzo = ring("esfuerzo");
  const pConexion = ring("conexion");
  const ringsClosed = [pConstancia, pEsfuerzo, pConexion].filter((p) => p >= 100).length;

  // Geometry
  const iconUrl = opts.iconHref || ""; // optional embedded icon (data URI)
  const iconSize = c(70);
  const iconX = c(28);
  const iconY = (H - iconSize) / 2;

  const dividerX = c(132);
  const dividerY1 = c(22);
  const dividerY2 = H - c(22);

  const ringCx = c(280);
  const ringCy = Math.round(H / 2);
  const ringStroke = c(7);
  const ringRadii = [c(20), c(33), c(46)];
  const ringColors = [KALA_PASS_PALETTE.berry, KALA_PASS_PALETTE.olive, KALA_PASS_PALETTE.orange];
  const ringPercents = [pConstancia, pEsfuerzo, pConexion];

  // Tag text (bottom-right): "X/3 cerrados"
  const closedLabel = `${ringsClosed}/3 cerrados`;
  const labelX = c(346);
  const labelY = H - c(14);

  const arcs = ringRadii
    .map((r, i) => {
      const color = ringColors[i];
      const pct = ringPercents[i];
      const trackOpacity = 0.18;
      const track = `
        <circle cx="${ringCx}" cy="${ringCy}" r="${r}"
                fill="none" stroke="${color}" stroke-opacity="${trackOpacity}"
                stroke-width="${ringStroke}" />`;
      const arc = pct > 0
        ? `<path d="${arcPath(ringCx, ringCy, r, pct)}"
                  fill="none" stroke="${color}" stroke-width="${ringStroke}"
                  stroke-linecap="round"
                  transform="rotate(-90 ${ringCx} ${ringCy})"
                  style="filter: drop-shadow(0 ${c(0.6)}px ${c(1)}px rgba(0,0,0,0.04));" />`
        : "";
      return track + arc;
    })
    .join("");

  // Soft blush wash in upper-right corner
  const washGrad = `
    <radialGradient id="wash" cx="86%" cy="14%" r="80%">
      <stop offset="0%" stop-color="${KALA_PASS_PALETTE.blush}" stop-opacity="0.55" />
      <stop offset="60%" stop-color="${KALA_PASS_PALETTE.blush}" stop-opacity="0.10" />
      <stop offset="100%" stop-color="${KALA_PASS_PALETTE.cream}" stop-opacity="0" />
    </radialGradient>`;

  const iconBlock = iconUrl
    ? `<image href="${iconUrl}" x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" />`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${washGrad}</defs>
  <rect width="${W}" height="${H}" fill="${KALA_PASS_PALETTE.cream}" />
  <rect width="${W}" height="${H}" fill="url(#wash)" />
  <line x1="${dividerX}" y1="${dividerY1}" x2="${dividerX}" y2="${dividerY2}"
        stroke="${KALA_PASS_PALETTE.ink}" stroke-opacity="0.10" stroke-width="1" />
  ${iconBlock}
  ${arcs}
  <text x="${labelX}" y="${labelY}" text-anchor="end"
        font-family="-apple-system, system-ui, 'Helvetica Neue', sans-serif"
        font-size="${c(8.5)}" font-weight="600"
        letter-spacing="${c(1.6)}"
        fill="${KALA_PASS_PALETTE.ink}" fill-opacity="0.55">${escapeXml(closedLabel.toUpperCase())}</text>
</svg>`;
}

const KALA_ICON_PNG_PATH_CACHE = { path: null, dataUri: null };
function getKalaIconDataUri() {
  if (KALA_ICON_PNG_PATH_CACHE.dataUri) return KALA_ICON_PNG_PATH_CACHE.dataUri;
  const candidates = [
    findAssetFile(["wallet-icon-mixto@3x.png", "wallet-icon-mixto@2x.png", "wallet-icon-mixto.png"]),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      const buf = fs.readFileSync(p);
      const uri = `data:image/png;base64,${buf.toString("base64")}`;
      KALA_ICON_PNG_PATH_CACHE.path = p;
      KALA_ICON_PNG_PATH_CACHE.dataUri = uri;
      return uri;
    } catch (_) { /* try next */ }
  }
  return null;
}

async function buildKalaStripPng(ringState, scale = 1) {
  const iconHref = getKalaIconDataUri();
  const svg = buildKalaStripSvg(ringState, scale, { iconHref });
  return await sharp(Buffer.from(svg, "utf8")).png({ compressionLevel: 9 }).toBuffer();
}

async function generateApplePkpass({ userId, userName, points, qrCode, membership, nextBooking, activeEventPass }) {
  const baseSerialNumber = buildAppleWalletSerialFromUserId(userId);
  const hasMembership = !!membership;
  const hasEventPass = !!activeEventPass;
  // Ring state computed here so todos los field builders abajo pueden referenciarlo
  // (con o sin membresía). Antes esto vivía solo en el route handler y daba ReferenceError.
  const ringState = getKalaWeeklyRingState(membership, Number(points || 0));
  const eventSerialHash = hasEventPass
    ? crypto.createHash("sha1").update(String(activeEventPass?.eventId || activeEventPass?.passCode || "")).digest("hex").slice(0, 12)
    : "";
  const serialNumber = hasEventPass ? `${baseSerialNumber}_ev_${eventSerialHash}` : baseSerialNumber;
  const eventSchedule = formatWalletEventSchedule(activeEventPass);
  const eventTitle = truncateWalletField(activeEventPass?.eventTitle || "Evento especial", 30);
  const eventDateObj = activeEventPass?.eventDate ? new Date(activeEventPass.eventDate) : null;
  const hasValidEventDate = !!eventDateObj && !Number.isNaN(eventDateObj.getTime());
  const eventDateShort = hasValidEventDate
    ? eventDateObj.toLocaleDateString("es-MX", { day: "numeric", month: "short" })
    : "Por confirmar";
  const eventDateLong = hasValidEventDate
    ? eventDateObj.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "Fecha por confirmar";
  const eventStartTimeLabel = activeEventPass?.eventStartTime ? String(activeEventPass.eventStartTime).slice(0, 5) : "";
  const eventEndTimeLabel = activeEventPass?.eventEndTime ? String(activeEventPass.eventEndTime).slice(0, 5) : "";
  const eventTimeShort = eventStartTimeLabel && eventEndTimeLabel
    ? `${eventStartTimeLabel}-${eventEndTimeLabel}`
    : (eventStartTimeLabel || "Por confirmar");
  const eventTimeLong = eventStartTimeLabel && eventEndTimeLabel
    ? `${eventStartTimeLabel} - ${eventEndTimeLabel}`
    : (eventStartTimeLabel || "Horario por confirmar");
  const eventLocationShort = truncateWalletField(activeEventPass?.eventLocation || "Kala Barre Studio", 24);
  const eventLocationLong = truncateWalletField(activeEventPass?.eventLocation || "Kala Barre Studio", 38);
  const eventCodeLabel = truncateWalletField(activeEventPass?.passCode || "—", 18);
  // Kala lockscreen relevance:
  // - Para membership pass: 30 min antes de la próxima clase (si existe).
  //   Apple muestra el pase en la lockscreen automáticamente alrededor de esta hora.
  // - Geofence: usar `locations` (configurada abajo) para que también aparezca
  //   cuando la alumna esté cerca del estudio.
  const kalaRelevantDate = (() => {
    if (hasEventPass) return null;
    if (!nextBooking?.date) return null;
    try {
      const day = String(nextBooking.date).slice(0, 10);
      const time = String(nextBooking.start_time || "07:00:00").slice(0, 8);
      const start = new Date(`${day}T${time}`);
      if (Number.isNaN(start.getTime())) return null;
      // 30 min before to give the alumna time to walk in
      start.setMinutes(start.getMinutes() - 30);
      return start.toISOString();
    } catch (_) {
      return null;
    }
  })();

  const eventRelevantDate = (() => {
    if (!hasEventPass || !hasValidEventDate) return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const startDate = new Date(eventDateObj);
    if (eventStartTimeLabel) {
      const [hh, mm] = eventStartTimeLabel.split(":").map((p) => Number(p));
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        startDate.setHours(hh, mm, 0, 0);
      }
    } else {
      startDate.setHours(10, 0, 0, 0);
    }
    return startDate.toISOString();
  })();
  const eventExpirationDate = (() => {
    if (!hasEventPass || !hasValidEventDate) return null;
    const endDate = new Date(eventDateObj);
    if (eventEndTimeLabel) {
      const [hh, mm] = eventEndTimeLabel.split(":").map((p) => Number(p));
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        endDate.setHours(hh, mm, 0, 0);
      }
    } else {
      endDate.setHours(23, 0, 0, 0);
    }
    endDate.setHours(endDate.getHours() + 8);
    return endDate.toISOString();
  })();
  const membershipCategory = hasMembership
    ? normalizeClassCategory(membership.class_category, "all")
    : "all";
  const membershipCategoryLabel = getKalaWalletCategoryLabel(membershipCategory);
  const progressSummary = getWalletProgressSummary(membership);
  const isUnlimited = hasMembership && (membership.class_limit === null || membership.class_limit >= 9999);
  const isTrialSingleSession = hasMembership && String(membership.repeat_key || "").startsWith("trial_single_session");
  const nonTransferable = hasMembership && parseBooleanFlag(membership.is_non_transferable);
  const nonRepeatable = hasMembership && parseBooleanFlag(membership.is_non_repeatable);
  const passAccent = hasEventPass
    ? "rgb(245, 138, 36)"
    : "rgb(118, 33, 77)";
  const passForeground = "rgb(46, 32, 28)";
  const passBackground = "rgb(255, 247, 242)";
  const classLimit = hasMembership ? Number(membership.class_limit ?? 0) : 0;
  const classesRemaining = hasMembership
    ? Math.max(0, Number(membership.classes_remaining ?? classLimit ?? 0))
    : 0;
  const stripStampState = resolveWalletStripStampState(classLimit, classesRemaining);
  const hasIconStampMode = hasMembership && !isUnlimited && stripStampState.total > 0;
  const membershipHeadline = isTrialSingleSession
    ? "Clase Muestra"
    : (isUnlimited ? "Meta abierta" : "Kala Pass");
  const memberDisplayName = truncateWalletField(userName, 22);
  const planDisplayName = truncateWalletField(
    hasMembership ? (membership.plan_name || `${membershipCategoryLabel} ${isUnlimited ? "Ilimitado" : ""}`.trim()) : "",
    28,
  );
  const shouldUseStampStrip = !hasEventPass && hasMembership && !isUnlimited && stripStampState.total > 0;
  const showFullFrontTextFields = hasEventPass
    ? parseBooleanFlag(process.env.APPLE_WALLET_SHOW_FRONT_TEXT_EVENT || false)
    : parseBooleanFlag(process.env.APPLE_WALLET_SHOW_FRONT_TEXT_MEMBERSHIP || false);

  // Build secondary/auxiliary fields
  const secondaryFields = [];
  const auxiliaryFields = [];
  const compactAuxiliaryFields = [];
  const backFields = [];

  if (hasEventPass) {
    secondaryFields.push({
      key: "event_title",
      label: "EVENTO",
      value: truncateWalletField(eventTitle, 24),
    });
    secondaryFields.push({
      key: "event_date",
      label: "FECHA",
      value: eventDateLong,
    });
    auxiliaryFields.push({
      key: "event_time",
      label: "HORARIO",
      value: eventTimeLong,
    });
    auxiliaryFields.push({
      key: "event_code",
      label: "CÓDIGO",
      value: eventCodeLabel,
    });
    if (activeEventPass?.eventLocation) {
      auxiliaryFields.push({
        key: "event_location",
        label: "SEDE",
        value: eventLocationLong,
      });
    }
    compactAuxiliaryFields.push(
      {
        key: "compact_event_time",
        label: "HORA",
        value: eventTimeShort,
      },
      {
        key: "compact_event_venue",
        label: "SEDE",
        value: eventLocationShort,
      },
      {
        key: "compact_event_code",
        label: "CÓDIGO",
        value: eventCodeLabel,
      },
    );
  }

  if (hasMembership) {
    secondaryFields.push({
      key: "plan_name",
      label: "PLAN",
      value: planDisplayName || `${membershipCategoryLabel}${isUnlimited ? " ilimitado" : ""}`,
    });
    secondaryFields.push({
      key: "modalidad",
      label: "MODALIDAD",
      value: membershipCategoryLabel,
    });
    auxiliaryFields.push({
      key: "client_name",
      label: "CLIENTE",
      value: memberDisplayName || "Miembro",
    });
    auxiliaryFields.push({
      key: "progress",
      label: "ANILLOS",
      value: `${ringState.rings_closed}/3 esta semana`,
      changeMessage: "Tu avance: %@",
    });
    backFields.push(
      {
        key: "ring_constancia",
        label: "Constancia",
        value: `${ringState.constancia.progress}/${ringState.constancia.goal} · ${ringState.constancia.label}`,
      },
      {
        key: "ring_esfuerzo",
        label: "Esfuerzo",
        value: `${ringState.esfuerzo.progress}/${ringState.esfuerzo.goal} · ${ringState.esfuerzo.label}`,
      },
      {
        key: "ring_conexion",
        label: "Conexión",
        value: `${ringState.conexion.progress}/${ringState.conexion.goal} · ${ringState.conexion.label}`,
      },
    );
    if (membership.end_date) {
      const endDate = new Date(membership.end_date);
      const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));
      auxiliaryFields.push({
        key: "vigencia",
        label: "VIGENTE HASTA",
        value: `${endDate.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })} (${daysLeft}d)`,
      });
    }
    if (isUnlimited) {
      auxiliaryFields.push({ key: "clases", label: "CLASES", value: "Ilimitadas" });
    } else if (classLimit > 0 && !hasIconStampMode && !hasEventPass) {
      auxiliaryFields.push({
        key: "clases",
        label: "DISPONIBLES",
        value: progressSummary.remainingLabel,
        changeMessage: "Clases restantes: %@",
      });
    }
    const rules = [];
    if (nonTransferable) rules.push("No transferible");
    if (nonRepeatable) rules.push("No repetible");
    if (rules.length) {
      auxiliaryFields.push({
        key: "reglas",
        label: "REGLAS",
        value: rules.join(" · "),
      });
    }
  } else {
    // Sin membresía activa: pase de bienvenida con CTA + anillos como meta aspiracional.
    secondaryFields.push({
      key: "estado",
      label: "ESTADO",
      value: "Sin paquete · Bienvenida",
    });
    secondaryFields.push({
      key: "muestra",
      label: "PRIMERA CLASE",
      value: "$50 · Clase muestra",
    });
    auxiliaryFields.push({
      key: "ring_constancia_aux",
      label: "CONSTANCIA",
      value: `${ringState.constancia.progress}/${ringState.constancia.goal}`,
    });
    auxiliaryFields.push({
      key: "ring_esfuerzo_aux",
      label: "ESFUERZO",
      value: `${ringState.esfuerzo.progress}/${ringState.esfuerzo.goal}`,
    });
    auxiliaryFields.push({
      key: "ring_conexion_aux",
      label: "CONEXIÓN",
      value: `${ringState.conexion.progress}/${ringState.conexion.goal}`,
    });
    backFields.push(
      {
        key: "intro_back",
        label: "Bienvenida a Kala",
        value: "Te recibimos como te recibe una amiga. Cinco lugares por clase, atención personalizada, una persona que te enseña.",
      },
      {
        key: "muestra_back",
        label: "Tu primera clase",
        value: "Reserva tu clase muestra por $50 desde la app o por WhatsApp. Karla te explica la barra y te ajusta cada postura.",
      },
      {
        key: "rings_intro_back",
        label: "Tres anillos",
        value: "Constancia (asistencia), Esfuerzo (clases intensas), Conexión (puntos comunidad). Tu pase los va llenando solo conforme vienes.",
      },
    );
  }

  if (nextBooking) {
    const bookingDate = new Date(nextBooking.date);
    const dateStr = bookingDate.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
    const timeStr = nextBooking.start_time ? String(nextBooking.start_time).substring(0, 5) : "";
    backFields.push({
      key: "next_class",
      label: "PRÓXIMA CLASE",
      value: `${nextBooking.class_name || "Clase"} — ${dateStr} ${timeStr}${nextBooking.instructor_name ? ` — ${nextBooking.instructor_name}` : ""}`,
      changeMessage: "%@",
    });
  }

  if (!showFullFrontTextFields) {
    if (hasMembership) {
      backFields.unshift(
        {
          key: "membership_plan_back",
          label: "PLAN",
          value: planDisplayName || `${membershipCategoryLabel}${isUnlimited ? " ilimitado" : ""}`,
        },
        {
          key: "membership_mode_back",
          label: "MODALIDAD",
          value: membershipCategoryLabel,
        },
      );
      if (membership.end_date) {
        const endDate = new Date(membership.end_date);
        const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));
        backFields.unshift({
          key: "membership_valid_back",
          label: "VIGENTE HASTA",
          value: `${endDate.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })} (${daysLeft}d)`,
        });
      }
      if (isUnlimited) {
        backFields.unshift({ key: "membership_classes_back", label: "CLASES", value: "Ilimitadas" });
      } else if (classLimit > 0) {
        backFields.unshift({
          key: "membership_classes_back",
          label: "CLASES",
          value: `${progressSummary.completionLabel} · ${progressSummary.remainingLabel}`,
        });
      }
      backFields.unshift({
        key: "membership_goal_back",
        label: "ANILLOS ESTA SEMANA",
        value: `${ringState.rings_closed}/3 cerrados`,
      });
      const rules = [];
      if (nonTransferable) rules.push("No transferible");
      if (nonRepeatable) rules.push("No repetible");
      if (rules.length) {
        backFields.unshift({
          key: "membership_rules_back",
          label: "REGLAS",
          value: rules.join(" · "),
        });
      }
    } else {
      backFields.unshift({ key: "membership_status_back", label: "ESTADO", value: "Sin membresía activa" });
    }
  }

  if (hasEventPass) {
    backFields.push(
      {
        key: "event_title_back",
        label: "EVENTO",
        value: activeEventPass.eventTitle || "Evento especial",
      },
      {
        key: "event_code_back",
        label: "CÓDIGO DE CHECK-IN",
        value: activeEventPass.passCode || "—",
      },
    );
    if (eventSchedule) {
      backFields.push({
        key: "event_schedule_back",
        label: "HORARIO",
        value: eventSchedule,
      });
    }
    if (activeEventPass?.eventLocation) {
      backFields.push({
        key: "event_location_back",
        label: "UBICACIÓN",
        value: activeEventPass.eventLocation,
      });
    }
    backFields.push(
      {
        key: "event_access_back",
        label: "ACCESO",
        value: "Pase personal de un solo acceso. No transferible.",
      },
      {
        key: "event_checkin_back",
        label: "CHECK-IN",
        value: "Presenta tu QR en recepción 10 minutos antes del evento.",
      },
    );
  }

  backFields.push(
    { key: "cliente", label: "CLIENTE", value: userName },
    { key: "puntos", label: "PUNTOS KALA CLUB", value: `${points.toLocaleString("es-MX")} pts` },
    { key: "studio", label: "ESTUDIO", value: "Av. Nicolás Zapata 845 int. 4, Plaza San Martín, San Luis Potosí" },
    { key: "horario_studio", label: "HORARIOS", value: "Lun a Vie 7am a 3pm y 5pm a 9pm · Sáb 7am a 9am" },
    { key: "telefono", label: "WHATSAPP", value: "444 307 3266" },
    { key: "web", label: "RESERVAR EN LÍNEA", value: `${SITE_URL}/app/bookings` },
    {
      key: "terms",
      label: "TÉRMINOS",
      value: hasEventPass
        ? "Pase válido para un acceso al evento indicado. Presenta el QR en recepción."
        : "Pase personal para clases en Kala Barre Studio. Presenta tu QR al llegar. Cancelaciones: alumnas nuevas 4-5 h antes, recurrentes 2 h antes.",
    }
  );

  const primaryFields = [
    {
      key: "headline",
      label: hasEventPass ? "EVENTO ACTIVO" : (hasMembership ? "PASE ACTIVO" : "MIEMBRO"),
      value: hasEventPass
        ? truncateWalletField(activeEventPass.eventTitle || "Evento especial", 20)
        : hasMembership
          ? truncateWalletField(progressSummary.isUnlimited ? membershipHeadline : progressSummary.completionLabel, 20)
          : (memberDisplayName || "Miembro"),
      changeMessage: hasEventPass
        ? "Evento activo: %@"
        : hasMembership
          ? "Tu pase ahora es %@"
          : undefined,
    },
  ];

  const compactPrimaryFields = hasEventPass
    ? []
    : [
      {
        key: "compact_title",
        label: hasMembership ? "ANILLOS" : "MIEMBRO",
        value: hasMembership
          ? `${ringState.rings_closed}/3 cerrados`
          : truncateWalletField(memberDisplayName || "Miembro", 22),
      },
    ];

  const compactSecondaryFields = [];
  if (hasEventPass) {
    compactSecondaryFields.push({
      key: "compact_event_title",
      label: "EVENTO",
      value: truncateWalletField(activeEventPass?.eventTitle || "Evento especial", 20),
    });
    compactSecondaryFields.push({
      key: "compact_event_date",
      label: "FECHA",
      value: truncateWalletField(eventDateShort, 16),
    });
  } else if (hasMembership && membership.end_date) {
    const endDate = new Date(membership.end_date);
    const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));
    compactSecondaryFields.push({
      key: "compact_valid_until",
      label: "VIGENCIA",
      value: `${endDate.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} (${daysLeft}d)`,
    });
  }

  // Build pass.json
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: APPLE_PASS_TYPE_ID,
    serialNumber,
    teamIdentifier: APPLE_TEAM_ID,
    organizationName: "Kala Barre Studio",
    description: hasEventPass
      ? `Evento — ${activeEventPass?.eventTitle || "Kala Barre Studio"}`
      : `Kala Pass — ${progressSummary.goalLabel}`,
    logoText: "",
    foregroundColor: passForeground,
    backgroundColor: passBackground,
    labelColor: passAccent,
    storeCard: {
      headerFields: [
        { key: "points", label: "PUNTOS", value: points, textAlignment: "PKTextAlignmentRight", changeMessage: "Ahora tienes %@ puntos" },
      ],
      primaryFields: hasEventPass
        ? (showFullFrontTextFields ? primaryFields : compactPrimaryFields)
        : (showFullFrontTextFields ? primaryFields : []),
      secondaryFields: hasEventPass
        ? (showFullFrontTextFields ? secondaryFields : compactSecondaryFields)
        : secondaryFields,
      auxiliaryFields: hasEventPass
        ? (showFullFrontTextFields ? auxiliaryFields : compactAuxiliaryFields)
        : auxiliaryFields,
      backFields,
    },
    barcode: {
      message: qrCode,
      format: "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
    },
    barcodes: [
      {
        message: qrCode,
        format: "PKBarcodeFormatQR",
        messageEncoding: "iso-8859-1",
      },
    ],
    webServiceURL: `${SITE_URL}/api/wallet`,
    authenticationToken: APPLE_AUTH_TOKEN,
    relevantDate: kalaRelevantDate || eventRelevantDate,
    // Geofence: pase aparece en lockscreen cuando la alumna está cerca del estudio.
    // Coords aproximadas de Plaza San Martín, San Luis Potosí (Av. Nicolás Zapata 845).
    // Apple alerta cuando entras al radio.
    locations: [
      {
        latitude: 22.1565,
        longitude: -100.9855,
        relevantText: hasEventPass
          ? "Estás cerca del estudio. Tu pase del evento."
          : "Estás cerca de Kala. Saca tu pase para check-in.",
      },
    ],
    maxDistance: 150,
  };
  if (eventExpirationDate) {
    passJson.expirationDate = eventExpirationDate;
  }

  // Read image assets with dedicated retina variants to avoid pixelation in Wallet.
  const assetCategory =
    hasEventPass
      ? "event"
      : membershipCategory === "jumping"
        ? "jumping"
        : membershipCategory === "pilates"
          ? "pilates"
          : "mixto";

  const iconPath = findAssetFile([
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "wallet-icon-mixto.png",
    "ophelia-logo.png",
  ]);
  const icon2xPath = findAssetFile([
    `wallet-icon-${assetCategory}@2x.png`,
    "wallet-icon-event@2x.png",
    "wallet-icon-mixto@2x.png",
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "wallet-icon-mixto.png",
    "ophelia-logo.png",
  ]);
  const icon3xPath = findAssetFile([
    `wallet-icon-${assetCategory}@3x.png`,
    "wallet-icon-event@3x.png",
    "wallet-icon-mixto@3x.png",
    `wallet-icon-${assetCategory}@2x.png`,
    "wallet-icon-event@2x.png",
    "wallet-icon-mixto@2x.png",
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "wallet-icon-mixto.png",
    "ophelia-logo.png",
  ]);

  const logoPath = findAssetFile([
    "wallet-logo.png",
    "ophelia-logo-full.png",
    "ophelia-logo.png",
    "wallet-logo-black.png",
  ]);
  const logo2xPath = findAssetFile([
    "wallet-logo@2x.png",
    "wallet-logo.png",
    "ophelia-logo-full.png",
    "ophelia-logo.png",
    "wallet-logo-black@2x.png",
    "wallet-logo-black.png",
  ]);
  const logo3xPath = findAssetFile([
    "wallet-logo@3x.png",
    "wallet-logo@2x.png",
    "wallet-logo.png",
    "ophelia-logo-full.png",
    "ophelia-logo.png",
    "wallet-logo-black@3x.png",
    "wallet-logo-black@2x.png",
    "wallet-logo-black.png",
  ]);

  const thumbPath = findAssetFile([
    `wallet-thumb-${assetCategory}.png`,
    "wallet-thumb-event.png",
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "ophelia-logo.png",
  ]);
  const thumb2xPath = findAssetFile([
    `wallet-thumb-${assetCategory}@2x.png`,
    "wallet-thumb-event@2x.png",
    `wallet-thumb-${assetCategory}.png`,
    "wallet-thumb-event.png",
    `wallet-icon-${assetCategory}@2x.png`,
    "wallet-icon-event@2x.png",
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "ophelia-logo.png",
  ]);

  let dynamicStripName = "none";
  let stripPath = null;
  let strip2xPath = null;
  let strip3xPath = null;
  if (!hasEventPass) {
    const stripCategory =
      membershipCategory === "jumping" ? "jumping"
        : membershipCategory === "pilates" ? "pilates"
          : "mixto";
    dynamicStripName = shouldUseStampStrip
      ? `wallet-strip-${stripCategory}-t${stripStampState.total}-r${stripStampState.remaining}.png`
      : `wallet-strip-${stripCategory}.png`;
    const dynamicStripPath = shouldUseStampStrip
      ? findAssetFile([dynamicStripName])
      : null;
    const stripCandidates = [`wallet-strip-${stripCategory}.png`, "wallet-strip-mixto.png"];
    const strip2xCandidates = [`wallet-strip-${stripCategory}@2x.png`, "wallet-strip-mixto@2x.png"];
    const strip3xCandidates = [`wallet-strip-${stripCategory}@3x.png`, "wallet-strip-mixto@3x.png"];
    stripPath = dynamicStripPath || findAssetFile(stripCandidates);
    strip2xPath = dynamicStripPath
      ? findAssetFile([dynamicStripName.replace(".png", "@2x.png")])
      : findAssetFile(strip2xCandidates);
    strip3xPath = dynamicStripPath
      ? findAssetFile([dynamicStripName.replace(".png", "@3x.png")])
      : findAssetFile(strip3xCandidates);
  }

  const readAssetBuffer = (assetPath) => (assetPath && fs.existsSync(assetPath) ? fs.readFileSync(assetPath) : null);
  const iconBuffer = readAssetBuffer(iconPath);
  const icon2xBuffer = readAssetBuffer(icon2xPath) || iconBuffer;
  const icon3xBuffer = readAssetBuffer(icon3xPath) || icon2xBuffer || iconBuffer;
  const logoBuffer = readAssetBuffer(logoPath);
  const logo2xBuffer = readAssetBuffer(logo2xPath) || logoBuffer;
  const logo3xBuffer = readAssetBuffer(logo3xPath) || logo2xBuffer || logoBuffer;
  const thumbBuffer = readAssetBuffer(thumbPath);
  const thumb2xBuffer = readAssetBuffer(thumb2xPath) || thumbBuffer;
  // Strip: prefer dynamically rendered SVG with current ring progress.
  // Falls back to disk-based strip if rendering fails (e.g., sharp missing).
  let stripBuffer = null;
  let strip2xBuffer = null;
  let strip3xBuffer = null;
  if (!hasEventPass) {
    try {
      const [s1, s2, s3] = await Promise.all([
        buildKalaStripPng(ringState, 1),
        buildKalaStripPng(ringState, 2),
        buildKalaStripPng(ringState, 3),
      ]);
      stripBuffer = s1;
      strip2xBuffer = s2;
      strip3xBuffer = s3;
      console.log("[Apple Wallet] ✅ Dynamic strip rendered for rings",
        `${ringState?.constancia?.progress ?? 0}/${ringState?.constancia?.goal ?? 1}`,
        `${ringState?.esfuerzo?.progress ?? 0}/${ringState?.esfuerzo?.goal ?? 1}`,
        `${ringState?.conexion?.progress ?? 0}/${ringState?.conexion?.goal ?? 1}`,
      );
    } catch (err) {
      console.warn("[Apple Wallet] Dynamic strip render failed, falling back to disk:", err?.message);
      stripBuffer = readAssetBuffer(stripPath);
      strip2xBuffer = readAssetBuffer(strip2xPath) || stripBuffer;
      strip3xBuffer = readAssetBuffer(strip3xPath) || strip2xBuffer || stripBuffer;
    }
  } else {
    // Event passes keep disk-based strip art (event-specific)
    stripBuffer = readAssetBuffer(stripPath);
    strip2xBuffer = readAssetBuffer(strip2xPath) || stripBuffer;
    strip3xBuffer = readAssetBuffer(strip3xPath) || strip2xBuffer || stripBuffer;
  }

  console.log(
    "[Apple Wallet] Assets found — icon:", !!iconBuffer,
    "icon@2x:", !!icon2xBuffer,
    "icon@3x:", !!icon3xBuffer,
    "logo:", !!logoBuffer,
    "logo@2x:", !!logo2xBuffer,
    "logo@3x:", !!logo3xBuffer,
    "thumbnail:", !!thumbBuffer,
    "thumbnail@2x:", !!thumb2xBuffer,
    "strip:", !!stripBuffer,
    "stripState:", `${stripStampState.remaining}/${stripStampState.total}`,
    "stripAsset:", dynamicStripName,
  );

  // Build file map for the pass
  const files = {};
  const passJsonBuffer = Buffer.from(JSON.stringify(passJson));
  files["pass.json"] = passJsonBuffer;
  if (iconBuffer) {
    files["icon.png"] = iconBuffer;
    files["icon@2x.png"] = icon2xBuffer || iconBuffer;
    files["icon@3x.png"] = icon3xBuffer || icon2xBuffer || iconBuffer;
  }
  if (logoBuffer) {
    files["logo.png"] = logoBuffer;
    files["logo@2x.png"] = logo2xBuffer || logoBuffer;
    files["logo@3x.png"] = logo3xBuffer || logo2xBuffer || logoBuffer;
  }
  if (thumbBuffer) {
    files["thumbnail.png"] = thumbBuffer;
    files["thumbnail@2x.png"] = thumb2xBuffer || thumbBuffer;
  }
  if (stripBuffer) files["strip.png"] = stripBuffer;
  if (strip2xBuffer) files["strip@2x.png"] = strip2xBuffer;
  if (strip3xBuffer) files["strip@3x.png"] = strip3xBuffer;

  // Build manifest.json (SHA1 hashes of each file)
  const manifest = {};
  for (const [name, buf] of Object.entries(files)) {
    manifest[name] = crypto.createHash("sha1").update(buf).digest("hex");
  }
  const manifestBuffer = Buffer.from(JSON.stringify(manifest));
  files["manifest.json"] = manifestBuffer;

  // Sign manifest with Apple certificates to create PKCS#7 signature
  // Use pre-loaded PEM variables (from files or base64 env vars)
  const signerCertPem = APPLE_SIGNER_CERT_PEM;
  const signerKeyPem = APPLE_SIGNER_KEY_PEM;
  const wwdrPem = APPLE_WWDR_CERT_PEM;

  console.log("[Apple Wallet] PEM sizes — cert:", signerCertPem.length, "key:", signerKeyPem.length, "wwdr:", wwdrPem.length);

  // Use openssl to create detached PKCS#7 signature
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkpass-"));
  const manifestPath = path.join(tmpDir, "manifest.json");
  const certPath = path.join(tmpDir, "signer.pem");
  const keyPath = path.join(tmpDir, "signer.key");
  const wwdrPath = path.join(tmpDir, "wwdr.pem");
  const sigPath = path.join(tmpDir, "signature");

  fs.writeFileSync(manifestPath, manifestBuffer);
  fs.writeFileSync(certPath, signerCertPem);
  fs.writeFileSync(keyPath, signerKeyPem);
  fs.writeFileSync(wwdrPath, wwdrPem);

  const opensslCmd = `openssl smime -binary -sign -certfile "${wwdrPath}" -signer "${certPath}" -inkey "${keyPath}" -in "${manifestPath}" -out "${sigPath}" -outform DER${APPLE_CERT_PASSWORD ? ` -passin pass:${APPLE_CERT_PASSWORD}` : ""}`;
  console.log("[Apple Wallet] Signing manifest with openssl...");
  try {
    execSync(opensslCmd, { stdio: "pipe" });
    console.log("[Apple Wallet] ✅ Signature created successfully");
  } catch (opensslErr) {
    const errMsg = opensslErr.stderr?.toString() || opensslErr.message;
    console.error("[Apple Wallet] ❌ OpenSSL signing failed:", errMsg);
    // Clean up temp files
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`OpenSSL signing failed: ${errMsg}`);
  }

  const signatureBuffer = fs.readFileSync(sigPath);
  files["signature"] = signatureBuffer;

  // Clean up temp files
  fs.rmSync(tmpDir, { recursive: true, force: true });

  // Create ZIP (.pkpass)
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { store: true }); // no compression for .pkpass
    const chunks = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    for (const [name, buf] of Object.entries(files)) {
      archive.append(buf, { name });
    }
    archive.finalize();
  });
}

// ── Apple Wallet endpoints ─────────────────────────────────────────────────

// GET /api/wallet/apple/pkpass — generate and download .pkpass (or web pass fallback)
app.get("/api/wallet/apple/pkpass", authMiddleware, async (req, res) => {
  try {
    const snapshot = await getWalletSnapshotForUser(req.userId);
    if (!snapshot) return res.status(404).json({ message: "Usuario no encontrado" });
    const { userName, points, qrCode, membership, nextBooking } = snapshot;
    const progressSummary = getWalletProgressSummary(membership);
    const ringState = getKalaWeeklyRingState(membership, points);

    // If Apple Developer certs are configured, generate real .pkpass
    if (isAppleWalletConfigured()) {
      console.log("[Apple Wallet] ✅ Certs detected — generating real .pkpass for user:", req.userId);
      try {
        const pkpassBuffer = await generateApplePkpass({
          userId: req.userId,
          userName,
          points,
          qrCode,
          membership,
          nextBooking,
          activeEventPass: null,
        });
        console.log("[Apple Wallet] ✅ .pkpass generated, size:", pkpassBuffer.length, "bytes");
        res.setHeader("Content-Type", "application/vnd.apple.pkpass");
        res.setHeader("Content-Disposition", `attachment; filename="kala-pass.pkpass"`);
        res.setHeader("Content-Length", pkpassBuffer.length);
        return res.send(pkpassBuffer);
      } catch (pkpassErr) {
        console.error("[Apple Wallet] ❌ .pkpass generation failed:", {
          message: pkpassErr?.message,
          name: pkpassErr?.name,
          code: pkpassErr?.code,
          stack: String(pkpassErr?.stack || "").split("\n").slice(0, 8).join("\n"),
          assetDir: typeof findAssetDir === "function" ? findAssetDir() : null,
          userId: req.userId,
          hasMembership: Boolean(membership),
        });
        return res.status(500).json({
          message: "Error generando pase .pkpass",
          error: pkpassErr?.message ?? String(pkpassErr),
          fallback: "webpass",
        });
      }
    }

    // No certs configured — return web pass HTML
    console.log("[Apple Wallet] ⚠️ Certs not configured — using web pass fallback.",
      "TEAM:", APPLE_TEAM_ID ? "✅" : "❌",
      "PASS_TYPE:", APPLE_PASS_TYPE_ID ? "✅" : "❌",
      "CERT:", APPLE_SIGNER_CERT_PEM ? "✅" : "❌",
      "KEY:", APPLE_SIGNER_KEY_PEM ? "✅" : "❌",
      "WWDR:", APPLE_WWDR_CERT_PEM ? "✅" : "❌"
    );

    // Fallback: generate a beautiful standalone HTML pass page
    const nextBookingHtml = nextBooking
      ? `<div class="field"><span class="label">Próxima clase</span><span class="value">${nextBooking.class_name || ""}</span></div>
         <div class="field"><span class="label">Fecha</span><span class="value">${nextBooking.date ? new Date(nextBooking.date).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : ""} ${nextBooking.start_time || ""}</span></div>`
      : "";
    const membershipHtml = membership
      ? `<div class="field wide"><span class="label">Plan</span><span class="value">${membership.plan_name}</span></div>
         <div class="field wide"><span class="label">Constancia</span><span class="value">${ringState.constancia.progress}/${ringState.constancia.goal} · ${ringState.constancia.label}</span></div>
         <div class="field"><span class="label">Esfuerzo</span><span class="value">${ringState.esfuerzo.progress}/${ringState.esfuerzo.goal}</span></div>
         <div class="field"><span class="label">Conexión</span><span class="value">${ringState.conexion.progress}/${ringState.conexion.goal}</span></div>
         <div class="field"><span class="label">Disponibles</span><span class="value">${progressSummary.remainingLabel}</span></div>
         <div class="field"><span class="label">Vigencia</span><span class="value">${membership.end_date ? new Date(membership.end_date).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span></div>`
      : `<div class="field wide"><span class="label">Plan</span><span class="value">Sin membresía activa</span></div>`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Kala Club">
<title>Kala Club — ${userName}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#FFF7F2;color:#2E201C;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.pass{width:100%;max-width:380px;border-radius:28px;overflow:hidden;background:#fff;box-shadow:0 20px 60px rgba(118,33,77,.14),0 0 0 1px rgba(118,33,77,.14)}
.header{padding:24px 24px 16px;display:flex;align-items:center;justify-content:space-between}
.logo{font-size:18px;font-weight:850;color:#2E201C}
.badge{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#76214D;background:#FCE6E1;border:1px solid rgba(118,33,77,.24);padding:4px 10px;border-radius:20px}
.sphere{margin:10px auto 20px;width:168px;height:168px;border-radius:999px;display:grid;place-items:center;background:conic-gradient(#76214D ${progressSummary.completionPercent}%, #F3C6D6 0);position:relative}
.sphere:before{content:"";position:absolute;inset:15px;border-radius:999px;background:#fff;border:7px solid #D7DDC1}
.sphere:after{content:"";position:absolute;inset:-7px;border-radius:999px;border:4px solid #F58A24;clip-path:polygon(50% 0,100% 0,100% 45%,50% 45%)}
.sphere-content{position:relative;text-align:center}
.points-label{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#76214D;margin-bottom:5px;font-weight:800}
.points{font-size:42px;font-weight:950;color:#2E201C;line-height:1}
.points-sub{font-size:12px;color:#7B5B52;margin-top:4px}
.qr-section{display:flex;justify-content:center;padding:0 24px 24px}
.qr-wrap{background:#fff;border-radius:20px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,.24)}
.qr-wrap img{width:160px;height:160px;display:block}
.qr-hint{text-align:center;font-size:11px;color:#B78B7E;padding:0 24px 20px;line-height:1.5}
.fields{padding:0 24px 24px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.field{display:flex;flex-direction:column;gap:4px;padding:12px 14px;background:#FFF7F2;border-radius:14px;border:1px solid rgba(118,33,77,.12)}
.field.wide{grid-column:1/-1}
.label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#76214D;font-weight:800}
.value{font-size:14px;font-weight:700;color:#2E201C}
.footer{text-align:center;padding:0 24px 24px;display:flex;gap:8px;justify-content:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px 20px;border-radius:14px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s}
.btn-primary{background:#F58A24;color:#2E201C;flex:1}
.btn-primary:hover{opacity:.9}
.btn-outline{background:#FFF7F2;color:#2E201C;border:1px solid rgba(118,33,77,.16);flex:1}
.btn-outline:hover{background:#FCE6E1}
.name{text-align:center;font-size:16px;font-weight:700;padding:0 24px 4px;color:#2E201C}
</style>
</head>
<body>
<div class="pass">
  <div class="header">
    <div class="logo">Kala Barre Studio</div>
    <div class="badge">Club</div>
  </div>
  <div class="name">${userName}</div>
  <div class="sphere">
    <div class="sphere-content">
      <div class="points-label">Anillos</div>
      <div class="points">${ringState.rings_closed}/3</div>
      <div class="points-sub">esta semana</div>
    </div>
  </div>
  <div class="qr-section">
    <div class="qr-wrap">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrCode)}&bgcolor=FFFFFF&color=322028" alt="QR Code" />
    </div>
  </div>
  <div class="qr-hint">Presenta este QR al llegar. Tus anillos se actualizan con cada visita.</div>
  <div class="fields">
    ${membershipHtml}
    ${nextBookingHtml}
  </div>
  <div class="footer">
    <button class="btn btn-primary" onclick="window.print()">Imprimir</button>
    <button class="btn btn-outline" onclick="alert('En Safari: Compartir, Agregar a pantalla de inicio')">Guardar</button>
  </div>
</div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error("Apple Wallet pkpass error:", err.message);
    return res.status(500).json({ message: "Error generando pase de Apple Wallet" });
  }
});

// GET /api/wallet/events/apple/pkpass — generate and download event-specific .pkpass
app.get("/api/wallet/events/apple/pkpass", authMiddleware, async (req, res) => {
  try {
    const eventIdRaw = String(req.query?.eventId || "").trim();
    const eventId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventIdRaw)
      ? eventIdRaw
      : null;
    if (!eventId) return res.status(400).json({ message: "eventId inválido" });

    const snapshot = await getWalletSnapshotForUser(req.userId, { eventId });
    if (!snapshot) return res.status(404).json({ message: "Usuario no encontrado" });
    const { userName, points, qrCode, activeEventPass } = snapshot;
    if (!activeEventPass) return res.status(404).json({ message: "No existe pase activo para ese evento" });
    const eventDateObj = activeEventPass?.eventDate ? new Date(activeEventPass.eventDate) : null;
    const hasValidEventDate = !!eventDateObj && !Number.isNaN(eventDateObj.getTime());
    const eventDateLong = hasValidEventDate
      ? eventDateObj.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
      : "Fecha por confirmar";
    const eventStartTimeLabel = activeEventPass?.eventStartTime ? String(activeEventPass.eventStartTime).slice(0, 5) : "";
    const eventEndTimeLabel = activeEventPass?.eventEndTime ? String(activeEventPass.eventEndTime).slice(0, 5) : "";
    const eventTimeLong = eventStartTimeLabel && eventEndTimeLabel
      ? `${eventStartTimeLabel} - ${eventEndTimeLabel}`
      : (eventStartTimeLabel || "Horario por confirmar");
    const eventLocationLong = truncateWalletField(activeEventPass?.eventLocation || "Kala Barre Studio", 38);

    if (isAppleWalletConfigured()) {
      const pkpassBuffer = await generateApplePkpass({
        userId: req.userId,
        userName,
        points,
        qrCode,
        membership: null,
        nextBooking: null,
        activeEventPass,
      });
      res.setHeader("Content-Type", "application/vnd.apple.pkpass");
      res.setHeader("Content-Disposition", `attachment; filename="kala-event-pass.pkpass"`);
      res.setHeader("Content-Length", pkpassBuffer.length);
      return res.send(pkpassBuffer);
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Pase de Evento — Kala</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#FFF7F2;color:#2E201C;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.pass{width:100%;max-width:390px;border-radius:24px;overflow:hidden;background:linear-gradient(165deg,#FFFFFF 0%,#FFF0E4 56%,#FCE6E1 100%);box-shadow:0 22px 60px rgba(118,33,77,.14),0 0 0 1px rgba(118,33,77,.16)}
.header{padding:20px 22px 10px}
.badge{display:inline-flex;align-items:center;gap:8px;padding:4px 10px;border-radius:999px;background:rgba(245,138,36,.13);color:#F58A24;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
.title{margin-top:10px;font-weight:800;font-size:22px;line-height:1.1;color:#2E201C}
.meta{padding:0 22px 6px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.meta-item{border:1px solid rgba(118,33,77,.12);border-radius:12px;padding:10px 11px;background:rgba(255,255,255,.7)}
.meta-label{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#F58A24;font-weight:700}
.meta-value{font-size:13px;line-height:1.3;color:#2E201C;margin-top:4px}
.qr{display:flex;justify-content:center;padding:16px 20px 10px}
.qr img{background:#fff;border-radius:18px;padding:12px}
.code{padding:0 22px 22px;text-align:center;font-size:13px;color:#2E201C}
.code strong{color:#F58A24;letter-spacing:.04em}
</style>
</head>
<body>
  <div class="pass">
    <div class="header">
      <span class="badge">Pase de evento</span>
      <div class="title">${activeEventPass.eventTitle || "Evento Kala"}</div>
    </div>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-label">Fecha</div>
        <div class="meta-value">${eventDateLong || "Por confirmar"}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Horario</div>
        <div class="meta-value">${eventTimeLong || "Por confirmar"}</div>
      </div>
      <div class="meta-item" style="grid-column:1 / span 2;">
        <div class="meta-label">Sede</div>
        <div class="meta-value">${eventLocationLong || "Kala Barre Studio"}</div>
      </div>
    </div>
    <div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(activeEventPass.passCode || qrCode)}&bgcolor=FFFFFF&color=1F0047" alt="QR"/></div>
    <div class="code">Código de acceso: <strong>${activeEventPass.passCode || "—"}</strong></div>
  </div>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error("Apple Wallet event pkpass error:", err.message);
    return res.status(500).json({ message: "Error generando pase de evento Apple Wallet" });
  }
});

// GET /api/wallet/apple/status — check Apple Wallet config (admin only)
app.get("/api/wallet/apple/status", adminMiddleware, async (_req, res) => {
  return res.json({
    configured: true, // Always true — we have web pass fallback even without Apple certs
    nativePkpass: isAppleWalletConfigured(),
    apnsConfigured: isAppleApnsConfigured(),
    teamId: APPLE_TEAM_ID ? "✅ set" : "❌ (web pass mode)",
    passTypeId: APPLE_PASS_TYPE_ID || "N/A (web pass mode)",
    keyId: APPLE_KEY_ID ? "✅ set" : "❌",
    apnsKey: APPLE_APNS_KEY_PEM ? `✅ loaded (${APPLE_APNS_KEY_PEM.length} chars)` : "❌",
    apnsHost: APPLE_APNS_HOST,
    signerCert: APPLE_SIGNER_CERT_PEM ? `✅ loaded (${APPLE_SIGNER_CERT_PEM.length} chars)` : "❌ (web pass mode)",
    signerKey: APPLE_SIGNER_KEY_PEM ? `✅ loaded (${APPLE_SIGNER_KEY_PEM.length} chars)` : "❌ (web pass mode)",
    wwdrCert: APPLE_WWDR_CERT_PEM ? `✅ loaded (${APPLE_WWDR_CERT_PEM.length} chars)` : "❌ (web pass mode)",
    certFiles: {
      cert: `${CERT_FILE_PATHS.cert} ${safeExists(CERT_FILE_PATHS.cert) ? "✅" : "❌"}`,
      key: `${CERT_FILE_PATHS.key} ${safeExists(CERT_FILE_PATHS.key) ? "✅" : "❌"}`,
      wwdr: `${CERT_FILE_PATHS.wwdr} ${safeExists(CERT_FILE_PATHS.wwdr) ? "✅" : "❌"}`,
    },
    certDirCandidates: WALLET_ASSET_DIR_CANDIDATES,
  });
});

// GET /api/wallet/apple/debug — detailed cert diagnostics (admin only)
app.get("/api/wallet/apple/debug", authMiddleware, async (req, res) => {
  // Check if user is admin
  try {
    const userRes = await pool.query("SELECT role FROM users WHERE id = $1", [req.userId]);
    if (userRes.rows[0]?.role !== "admin") return res.status(403).json({ message: "Solo admin" });
  } catch { return res.status(403).json({ message: "Error" }); }

  const checks = {
    configured: isAppleWalletConfigured(),
    apnsConfigured: isAppleApnsConfigured(),
    envVars: {
      APPLE_TEAM_ID: APPLE_TEAM_ID ? `✅ "${APPLE_TEAM_ID}"` : "❌ not set",
      APPLE_PASS_TYPE_ID: APPLE_PASS_TYPE_ID ? `✅ "${APPLE_PASS_TYPE_ID}"` : "❌ not set",
      APPLE_KEY_ID: APPLE_KEY_ID ? `✅ "${APPLE_KEY_ID}"` : "❌ not set",
      APPLE_CERT_PASSWORD: APPLE_CERT_PASSWORD ? "✅ set" : "⬜ not set (OK if key has no password)",
    },
    certFiles: {
      certPath: `${CERT_FILE_PATHS.cert} ${safeExists(CERT_FILE_PATHS.cert) ? "✅ exists" : "❌ not found"}`,
      keyPath: `${CERT_FILE_PATHS.key} ${safeExists(CERT_FILE_PATHS.key) ? "✅ exists" : "❌ not found"}`,
      wwdrPath: `${CERT_FILE_PATHS.wwdr} ${safeExists(CERT_FILE_PATHS.wwdr) ? "✅ exists" : "❌ not found"}`,
    },
    certDirCandidates: WALLET_ASSET_DIR_CANDIDATES,
    loadedPems: {
      signerCert: APPLE_SIGNER_CERT_PEM ? `✅ loaded (${APPLE_SIGNER_CERT_PEM.length} chars), starts: ${APPLE_SIGNER_CERT_PEM.substring(0, 40)}...` : "❌ not loaded",
      signerKey: APPLE_SIGNER_KEY_PEM ? `✅ loaded (${APPLE_SIGNER_KEY_PEM.length} chars), starts: ${APPLE_SIGNER_KEY_PEM.substring(0, 40)}...` : "❌ not loaded",
      wwdr: APPLE_WWDR_CERT_PEM ? `✅ loaded (${APPLE_WWDR_CERT_PEM.length} chars), starts: ${APPLE_WWDR_CERT_PEM.substring(0, 40)}...` : "❌ not loaded",
      apnsKey: APPLE_APNS_KEY_PEM ? `✅ loaded (${APPLE_APNS_KEY_PEM.length} chars), starts: ${APPLE_APNS_KEY_PEM.substring(0, 40)}...` : "❌ not loaded",
    },
    base64EnvFallback: {
      APPLE_SIGNER_CERT_BASE64: process.env.APPLE_SIGNER_CERT_BASE64 ? `✅ (${process.env.APPLE_SIGNER_CERT_BASE64.length} chars)` : "⬜ not set",
      APPLE_SIGNER_KEY_BASE64: process.env.APPLE_SIGNER_KEY_BASE64 ? `✅ (${process.env.APPLE_SIGNER_KEY_BASE64.length} chars)` : "⬜ not set",
      APPLE_WWDR_CERT_BASE64: process.env.APPLE_WWDR_CERT_BASE64 ? `✅ (${process.env.APPLE_WWDR_CERT_BASE64.length} chars)` : "⬜ not set",
      APPLE_APNS_KEY_BASE64: process.env.APPLE_APNS_KEY_BASE64 ? `✅ (${process.env.APPLE_APNS_KEY_BASE64.length} chars)` : "⬜ not set",
    },
    assetDir: findAssetDir(),
    assetsFound: {
      "ophelia-logo.png": fs.existsSync(path.join(findAssetDir(), "ophelia-logo.png")),
      "ophelia-logo-full.png": fs.existsSync(path.join(findAssetDir(), "ophelia-logo-full.png")),
    },
    opensslVersion: "unknown",
    keyValidation: "not tested",
    apnsKeyValidation: "not tested",
  };

  // Check openssl
  try {
    checks.opensslVersion = execSync("openssl version", { encoding: "utf8" }).trim();
  } catch (e) {
    checks.opensslVersion = "❌ openssl not found: " + e.message;
  }

  // Validate private key
  if (APPLE_SIGNER_KEY_PEM) {
    try {
      crypto.createPrivateKey(APPLE_SIGNER_KEY_PEM);
      checks.keyValidation = "✅ key is valid";
    } catch (keyErr) {
      checks.keyValidation = "❌ " + keyErr.message;
    }
  }

  if (APPLE_APNS_KEY_PEM) {
    try {
      crypto.createPrivateKey(APPLE_APNS_KEY_PEM);
      checks.apnsKeyValidation = "✅ key is valid";
    } catch (keyErr) {
      checks.apnsKeyValidation = "❌ " + keyErr.message;
    }
  }

  return res.json(checks);
});

// Apple Wallet Web Service endpoints (protocol V1)

// POST /api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial
app.post("/api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("ApplePass ") || authHeader.replace("ApplePass ", "") !== APPLE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  const { deviceId, serial, passTypeId } = req.params;
  const effectivePassTypeId = passTypeId || APPLE_PASS_TYPE_ID;
  const pushToken = req.body?.pushToken || "";
  try {
    await pool.query(`
      INSERT INTO apple_wallet_devices (device_id, push_token, pass_type_id, serial_number)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (device_id, pass_type_id, serial_number) DO UPDATE SET push_token = $2, updated_at = NOW()
    `, [deviceId, pushToken, effectivePassTypeId, serial]);
    return res.status(201).send();
  } catch (err) {
    console.error("Apple register device error:", err);
    return res.status(500).send();
  }
});

// GET /api/wallet/v1/devices/:deviceId/registrations/:passTypeId
app.get("/api/wallet/v1/devices/:deviceId/registrations/:passTypeId", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("ApplePass ") || authHeader.replace("ApplePass ", "") !== APPLE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  const { deviceId, passTypeId } = req.params;
  const effectivePassTypeId = passTypeId || APPLE_PASS_TYPE_ID;
  const rawSince = String(req.query?.passesUpdatedSince || "").trim();
  const sinceDate = rawSince ? new Date(rawSince) : null;
  const hasValidSince = !!(sinceDate && !Number.isNaN(sinceDate.getTime()));
  try {
    const params = [deviceId, effectivePassTypeId];
    let query = `
      SELECT serial_number, updated_at
      FROM apple_wallet_devices
      WHERE device_id = $1 AND pass_type_id = $2
    `;
    if (hasValidSince) {
      params.push(sinceDate.toISOString());
      query += ` AND updated_at > $${params.length}`;
    }
    query += " ORDER BY updated_at DESC";
    const r = await pool.query(query, params);
    if (r.rows.length === 0) return res.status(204).send();
    const latestUpdatedAt = r.rows.reduce((latest, row) => {
      const current = row.updated_at ? new Date(row.updated_at) : null;
      if (!current || Number.isNaN(current.getTime())) return latest;
      if (!latest) return current;
      return current > latest ? current : latest;
    }, null);
    return res.json({
      serialNumbers: r.rows.map((d) => d.serial_number),
      lastUpdated: latestUpdatedAt?.toISOString() || new Date().toISOString(),
    });
  } catch (err) {
    console.error("Apple list passes error:", err);
    return res.status(500).send();
  }
});

// GET /api/wallet/v1/passes/:passTypeId/:serial — download updated pass
app.get("/api/wallet/v1/passes/:passTypeId/:serial", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("ApplePass ") || authHeader.replace("ApplePass ", "") !== APPLE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  if (!isAppleWalletConfigured()) {
    return res.status(501).json({ message: "Apple Wallet signing not configured" });
  }
  const { serial, passTypeId } = req.params;
  const effectivePassTypeId = passTypeId || APPLE_PASS_TYPE_ID;
  const userId = parseUserIdFromAppleWalletSerial(serial);
  if (!userId) return res.status(404).send();
  try {
    const snapshot = await getWalletSnapshotForUser(userId);
    if (!snapshot) return res.status(404).send();
    const { userName, points, qrCode, membership, nextBooking } = snapshot;
    const pkpassBuffer = await generateApplePkpass({
      userId,
      userName,
      points,
      qrCode,
      membership,
      nextBooking,
      activeEventPass: null,
    });
    const touchRes = await pool.query(
      "SELECT MAX(updated_at) AS updated_at FROM apple_wallet_devices WHERE pass_type_id = $1 AND serial_number = $2",
      [effectivePassTypeId, serial],
    ).catch(() => ({ rows: [] }));
    const lastUpdated = touchRes.rows[0]?.updated_at ? new Date(touchRes.rows[0].updated_at) : new Date();
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Last-Modified", lastUpdated.toUTCString());
    return res.send(pkpassBuffer);
  } catch (err) {
    console.error("Apple V1 pass download error:", err.message);
    return res.status(500).send();
  }
});

// DELETE /api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial
app.delete("/api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("ApplePass ") || authHeader.replace("ApplePass ", "") !== APPLE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  const { deviceId, serial, passTypeId } = req.params;
  const effectivePassTypeId = passTypeId || APPLE_PASS_TYPE_ID;
  try {
    await pool.query(
      "DELETE FROM apple_wallet_devices WHERE device_id = $1 AND pass_type_id = $2 AND serial_number = $3",
      [deviceId, effectivePassTypeId, serial]
    );
    return res.status(200).send();
  } catch (err) {
    console.error("Apple unregister device error:", err);
    return res.status(500).send();
  }
});

// POST /api/wallet/v1/log — Apple Wallet error log
app.post("/api/wallet/v1/log", (req, res) => {
  console.log("Apple Wallet log:", JSON.stringify(req.body));
  return res.status(200).send();
});

// GET /api/admin/wallet/notifications — latest wallet push/sync logs
app.get("/api/admin/wallet/notifications", adminMiddleware, async (req, res) => {
  try {
    const parsedLimit = Number(req.query.limit ?? 30);
    const limit = Math.min(120, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 30));
    const r = await pool.query(
      `SELECT l.*,
              u.display_name,
              u.email
         FROM wallet_notification_logs l
         LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.created_at DESC
        LIMIT $1`,
      [limit],
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("[Admin wallet notifications] error:", err.message);
    return res.status(500).json({ message: "Error obteniendo historial de notificaciones de Wallet" });
  }
});

// POST /api/admin/wallet/notify/:userId — force pass update notifications
app.post("/api/admin/wallet/notify/:userId", adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason = "manual_admin_notify" } = req.body || {};
    const result = await notifyWalletPassesUpdatedForUser(userId, { reason });
    return res.json({ data: result });
  } catch (err) {
    console.error("[Admin wallet notify] error:", err.message);
    return res.status(500).json({ message: "Error notificando wallet", detail: err.message });
  }
});

// ─── Routes: /api/videos ────────────────────────────────────────────────────

// GET /api/videos/categories
app.get("/api/videos/categories", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ct.id, ct.name, COUNT(v.id) AS video_count
       FROM class_types ct
       JOIN videos v ON v.class_type_id = ct.id AND v.is_published = true
       GROUP BY ct.id, ct.name
       ORDER BY ct.name`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("Videos/categories error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/videos?search=&category=&limit=
app.get("/api/videos", authMiddleware, async (req, res) => {
  try {
    const { search = "", category = "", limit } = req.query;
    let query = `
      SELECT v.*,
             ct.name AS category_name,
             i.display_name AS instructor_name
      FROM videos v
      LEFT JOIN class_types ct ON v.class_type_id = ct.id
      LEFT JOIN instructors i ON v.instructor_id = i.id
      WHERE v.is_published = true
    `;
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (v.title ILIKE $${params.length} OR v.description ILIKE $${params.length})`;
    }
    if (category) {
      params.push(category);
      query += ` AND ct.id = $${params.length}`;
    }
    query += " ORDER BY v.is_featured DESC, v.sort_order ASC, v.created_at DESC";
    if (limit) { params.push(parseInt(limit)); query += ` LIMIT $${params.length}`; }
    const r = await pool.query(query, params);
    // Check membership access
    const memRes = await pool.query(
      "SELECT id FROM memberships WHERE user_id = $1 AND status = 'active' LIMIT 1",
      [req.userId]
    );
    const hasMembership = memRes.rows.length > 0;
    const rows = r.rows.map(v => {
      // Derive video_url from drive_file_id (proxy) if available
      let videoUrl = v.video_url;
      if (v.drive_file_id) {
        videoUrl = `/api/drive/video/${v.drive_file_id}`;
      } else if (videoUrl) {
        const m = videoUrl.match(/drive\.google\.com\/file\/d\/([^/]+)\/preview/);
        if (m) videoUrl = `/api/drive/video/${m[1]}`;
      }
      return { ...v, video_url: videoUrl, has_access: v.access_type === "free" || v.access_type === "gratuito" || hasMembership };
    });
    return res.json({ data: rows });
  } catch (err) {
    console.error("Videos error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/videos/:id
app.get("/api/videos/:id", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT v.*,
              ct.name AS category_name,
              i.display_name AS instructor_name, i.bio AS instructor_bio
       FROM videos v
       LEFT JOIN class_types ct ON v.class_type_id = ct.id
       LEFT JOIN instructors i ON v.instructor_id = i.id
       WHERE v.id = $1 AND v.is_published = true`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "Video no encontrado" });
    const video = r.rows[0];
    // Derive video_url from drive_file_id (proxy) if available
    if (video.drive_file_id) {
      video.video_url = `/api/drive/video/${video.drive_file_id}`;
    } else if (video.video_url) {
      const m = video.video_url.match(/drive\.google\.com\/file\/d\/([^\/]+)\/preview/);
      if (m) video.video_url = `/api/drive/video/${m[1]}`;
    }
    const memRes = await pool.query(
      "SELECT id FROM memberships WHERE user_id = $1 AND status = 'active' LIMIT 1",
      [req.userId]
    );
    const hasMembership = memRes.rows.length > 0;
    video.has_access = video.access_type === "free" || video.access_type === "gratuito" || hasMembership;
    // Log view
    await pool.query("UPDATE videos SET view_count = view_count + 1 WHERE id = $1", [req.params.id]);
    return res.json({ data: video });
  } catch (err) {
    console.error("Videos/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/videos/:id/view
app.post("/api/videos/:id/view", authMiddleware, async (req, res) => {
  try {
    await pool.query("UPDATE videos SET view_count = view_count + 1 WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.json({ ok: true }); }
});

// POST /api/videos/:id/purchase
app.post("/api/videos/:id/purchase", authMiddleware, async (req, res) => {
  try {
    const vRes = await pool.query(
      "SELECT * FROM videos WHERE id = $1 AND is_published = true AND sales_enabled = true",
      [req.params.id]
    );
    if (vRes.rows.length === 0) return res.status(404).json({ message: "Video no disponible para compra" });
    const video = vRes.rows[0];
    const r = await pool.query(
      `INSERT INTO video_purchases (video_id, user_id, status, amount_mxn, payment_method)
       VALUES ($1, $2, 'pending_payment', $3, 'transfer')
       ON CONFLICT (video_id, user_id) DO UPDATE SET status = EXCLUDED.status
       RETURNING *`,
      [req.params.id, req.userId, video.sales_price_mxn]
    );
    const bankInfo = await getConfiguredBankInfo(pool);
    return res.status(201).json({
      data: {
        ...r.rows[0],
        bank_details: {
          ...bankInfo,
          amount: Number(video.sales_price_mxn || 0),
          currency: "MXN",
        },
      },
    });
  } catch (err) {
    console.error("Video/purchase error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/videos/purchases/:id/proof  (multipart)
app.post("/api/videos/purchases/:id/proof", authMiddleware, upload.single("proof"), async (req, res) => {
  try {
    await pool.query(
      "UPDATE video_purchases SET status = 'pending_verification', proof_uploaded_at = NOW() WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    return res.json({ message: "Comprobante recibido" });
  } catch (err) {
    console.error("Video/purchase proof error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/users ─────────────────────────────────────────────────────

// PUT /api/users/:id
app.put("/api/users/:id", authMiddleware, async (req, res) => {
  // Allow own profile edit OR admin editing any user
  try {
    const selfRes = await pool.query("SELECT role FROM users WHERE id = $1", [req.userId]);
    const callerRole = selfRes.rows[0]?.role || "client";
    const isAdminCaller = ["admin", "super_admin"].includes(callerRole);
    if (req.params.id !== req.userId && !isAdminCaller) {
      return res.status(403).json({ message: "Acceso denegado" });
    }
    const {
      displayName, phone, dateOfBirth, gender,
      emergencyContactName, emergencyContactPhone, healthNotes,
      receiveReminders, receivePromotions, receiveWeeklySummary,
      acceptsCommunications,
      role,
    } = req.body;
    // Non-admins cannot change role
    const newRole = isAdminCaller && role ? role : null;
    const targetId = req.params.id;
    const r = await pool.query(
      `UPDATE users SET
         display_name              = COALESCE($1, display_name),
         phone                     = COALESCE($2, phone),
         date_of_birth             = COALESCE($3, date_of_birth),
         emergency_contact_name    = COALESCE($4, emergency_contact_name),
         emergency_contact_phone   = COALESCE($5, emergency_contact_phone),
         health_notes              = COALESCE($6, health_notes),
         receive_reminders         = COALESCE($7, receive_reminders),
         receive_promotions        = COALESCE($8, receive_promotions),
         receive_weekly_summary    = COALESCE($9, receive_weekly_summary),
         accepts_communications    = COALESCE($10, accepts_communications),
         role                      = COALESCE($11, role),
         gender                    = COALESCE($12, gender),
         updated_at                = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        displayName || null, phone || null, dateOfBirth || null,
        emergencyContactName || null, emergencyContactPhone || null, healthNotes || null,
        receiveReminders ?? null, receivePromotions ?? null, receiveWeeklySummary ?? null,
        acceptsCommunications ?? null,
        newRole,
        gender || null,
        targetId,
      ]
    );
    return res.json({ user: mapUser(r.rows[0]) });
  } catch (err) {
    console.error("PUT users/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/referrals ─────────────────────────────────────────────────

// GET /api/referrals/code
app.get("/api/referrals/code", authMiddleware, async (req, res) => {
  try {
    let r = await pool.query(
      "SELECT * FROM referral_codes WHERE user_id = $1 LIMIT 1",
      [req.userId]
    );
    if (r.rows.length === 0) {
      const code = "OPH" + Math.random().toString(36).slice(2, 8).toUpperCase();
      r = await pool.query(
        "INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) RETURNING *",
        [req.userId, code]
      );
    }
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("Referrals/code error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin/class-types ─────────────────────────────────────────

// GET /api/admin/class-types
app.get("/api/admin/class-types", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM class_types ORDER BY sort_order, name");
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    console.error("GET admin/class-types error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/class-types
app.post("/api/admin/class-types", adminMiddleware, async (req, res) => {
  const { name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, sort_order } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "name requerido" });
  try {
    const r = await pool.query(
      `INSERT INTO class_types (name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name.trim(), subtitle || null, description || null,
      category || "jumping", intensity || "media",
      level || "Todos los niveles", duration_min || 50, capacity || 10,
      color || "#c026d3", emoji || "🏃", sort_order ?? 0]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/class-types error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/class-types/:id
app.put("/api/admin/class-types/:id", adminMiddleware, async (req, res) => {
  const { name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, is_active, sort_order } = req.body;
  try {
    const r = await pool.query(
      `UPDATE class_types SET
         name         = COALESCE($1, name),
         subtitle     = COALESCE($2, subtitle),
         description  = COALESCE($3, description),
         category     = COALESCE($4, category),
         intensity    = COALESCE($5, intensity),
         level        = COALESCE($6, level),
         duration_min = COALESCE($7, duration_min),
         capacity     = COALESCE($8, capacity),
         color        = COALESCE($9, color),
         emoji        = COALESCE($10, emoji),
         is_active    = COALESCE($11, is_active),
         sort_order   = COALESCE($12, sort_order),
         updated_at   = NOW()
       WHERE id = $13 RETURNING *`,
      [name || null, subtitle || null, description || null,
      category || null, intensity || null, level || null,
      duration_min || null, capacity || null, color || null,
      emoji || null, is_active ?? null, sort_order ?? null,
      req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/class-types error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/class-types/:id
app.delete("/api/admin/class-types/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM class_types WHERE id = $1", [req.params.id]);
    return res.json({ message: "Eliminado" });
  } catch (err) {
    console.error("DELETE admin/class-types error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin/schedule-slots ──────────────────────────────────────

// GET /api/admin/schedule-slots
app.get("/api/admin/schedule-slots", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ss.*, ct.color as class_color, ct.emoji as class_emoji
       FROM schedule_slots ss
       LEFT JOIN class_types ct ON ss.class_type_id = ct.id
       WHERE ss.is_active = true
       ORDER BY ss.time_slot, ss.day_of_week`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET admin/schedule-slots error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/schedule-slots
app.post("/api/admin/schedule-slots", adminMiddleware, async (req, res) => {
  const { time_slot, day_of_week, class_type_id, class_type_name, instructor_name } = req.body;
  if (!time_slot?.trim() || !day_of_week) return res.status(400).json({ message: "time_slot y day_of_week requeridos" });
  try {
    // Resolve name from class_type_id if provided
    let ctName = class_type_name || null;
    if (class_type_id && !ctName) {
      const ct = await pool.query("SELECT name FROM class_types WHERE id = $1", [class_type_id]);
      ctName = ct.rows[0]?.name || null;
    }
    const r = await pool.query(
      `INSERT INTO schedule_slots (time_slot, day_of_week, class_type_id, class_type_name, instructor_name)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ON CONSTRAINT idx_schedule_slots_slot DO UPDATE
         SET class_type_id = EXCLUDED.class_type_id,
             class_type_name = EXCLUDED.class_type_name,
             instructor_name = EXCLUDED.instructor_name
       RETURNING *`,
      [time_slot.trim(), parseInt(day_of_week), class_type_id || null, ctName, instructor_name || null]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/schedule-slots error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/schedule-slots/:id
app.put("/api/admin/schedule-slots/:id", adminMiddleware, async (req, res) => {
  const { time_slot, day_of_week, class_type_id, class_type_name, instructor_name, is_active } = req.body;
  try {
    let ctName = class_type_name || null;
    if (class_type_id && !ctName) {
      const ct = await pool.query("SELECT name FROM class_types WHERE id = $1", [class_type_id]);
      ctName = ct.rows[0]?.name || null;
    }
    const r = await pool.query(
      `UPDATE schedule_slots SET
         time_slot       = COALESCE($1, time_slot),
         day_of_week     = COALESCE($2, day_of_week),
         class_type_id   = COALESCE($3, class_type_id),
         class_type_name = COALESCE($4, class_type_name),
         instructor_name = COALESCE($5, instructor_name),
         is_active       = COALESCE($6, is_active)
       WHERE id = $7 RETURNING *`,
      [time_slot || null, day_of_week ? parseInt(day_of_week) : null,
      class_type_id || null, ctName, instructor_name || null, is_active ?? null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/schedule-slots error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/schedule-slots/:id
app.delete("/api/admin/schedule-slots/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM schedule_slots WHERE id = $1", [req.params.id]);
    return res.json({ message: "Eliminado" });
  } catch (err) {
    console.error("DELETE admin/schedule-slots error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin/plans (CRUD) ────────────────────────────────────────

// POST /api/admin/plans
app.post("/api/admin/plans", adminMiddleware, async (req, res) => {
  const {
    name, description, price, currency, duration_days, class_limit, class_category,
    features, is_active, sort_order, is_non_transferable, is_non_repeatable, repeat_key,
    ring_constancia_goal, ring_esfuerzo_goal, ring_conexion_goal, reward_description,
  } = req.body;
  if (!name?.trim() || price === undefined) return res.status(400).json({ message: "name y price requeridos" });
  try {
    const validCats = ["barre", "jumping", "pilates", "mixto", "all"];
    const cat = validCats.includes(class_category) ? class_category : "all";
    const nonTransferable = parseBooleanFlag(is_non_transferable);
    const nonRepeatable = parseBooleanFlag(is_non_repeatable);
    const safeRepeatKey = nonRepeatable ? String(repeat_key ?? "").trim() || null : null;
    const constanciaGoal = Math.max(1, Number(ring_constancia_goal ?? 1));
    const esfuerzoGoal = Math.max(1, Number(ring_esfuerzo_goal ?? 1));
    const conexionGoal = Math.max(1, Number(ring_conexion_goal ?? 10));
    const r = await pool.query(
      `INSERT INTO plans
        (name, description, price, currency, duration_days, class_limit, class_category, features, is_active, sort_order, is_non_transferable, is_non_repeatable, repeat_key, ring_constancia_goal, ring_esfuerzo_goal, ring_conexion_goal, reward_description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [name.trim(), description || null, price, currency || "MXN",
      duration_days || 30, class_limit || null,
      cat, JSON.stringify(features || []), is_active ?? true, sort_order ?? 0, nonTransferable, nonRepeatable, safeRepeatKey,
      constanciaGoal, esfuerzoGoal, conexionGoal, reward_description || null]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/plans error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/plans/:id
app.put("/api/admin/plans/:id", adminMiddleware, async (req, res) => {
  const {
    name, description, price, currency, duration_days, class_limit, class_category,
    features, is_active, sort_order, is_non_transferable, is_non_repeatable, repeat_key,
    ring_constancia_goal, ring_esfuerzo_goal, ring_conexion_goal, reward_description,
  } = req.body;
  try {
    const validCats = ["barre", "jumping", "pilates", "mixto", "all"];
    const cat = validCats.includes(class_category) ? class_category : null;
    const nonTransferable = parseBooleanFlag(is_non_transferable);
    const nonRepeatable = parseBooleanFlag(is_non_repeatable);
    const safeRepeatKey = nonRepeatable ? String(repeat_key ?? "").trim() || null : null;
    const r = await pool.query(
      `UPDATE plans SET
         name          = COALESCE($1, name),
         description   = COALESCE($2, description),
         price         = COALESCE($3, price),
         currency      = COALESCE($4, currency),
         duration_days = COALESCE($5, duration_days),
         class_limit   = $6,
         class_category= COALESCE($7, class_category),
         features      = COALESCE($8, features),
         is_active     = COALESCE($9, is_active),
         sort_order    = COALESCE($10, sort_order),
         is_non_transferable = COALESCE($11, is_non_transferable),
         is_non_repeatable   = COALESCE($12, is_non_repeatable),
         repeat_key          = CASE WHEN COALESCE($12, is_non_repeatable) = true THEN $13 ELSE NULL END,
         ring_constancia_goal = COALESCE($14, ring_constancia_goal),
         ring_esfuerzo_goal   = COALESCE($15, ring_esfuerzo_goal),
         ring_conexion_goal   = COALESCE($16, ring_conexion_goal),
         reward_description   = COALESCE($17, reward_description),
         updated_at    = NOW()
       WHERE id = $18 RETURNING *`,
      [name || null, description || null, price ?? null, currency || null,
      duration_days || null, class_limit ?? null,
      cat, features ? JSON.stringify(features) : null,
      is_active ?? null, sort_order ?? null, nonTransferable, nonRepeatable, safeRepeatKey,
      ring_constancia_goal === undefined ? null : Math.max(1, Number(ring_constancia_goal)),
      ring_esfuerzo_goal === undefined ? null : Math.max(1, Number(ring_esfuerzo_goal)),
      ring_conexion_goal === undefined ? null : Math.max(1, Number(ring_conexion_goal)),
      reward_description || null,
      req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/plans error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/plans/:id
app.delete("/api/admin/plans/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("UPDATE plans SET is_active = false WHERE id = $1", [req.params.id]);
    return res.json({ message: "Plan desactivado" });
  } catch (err) {
    console.error("DELETE admin/plans error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin/schedule (schedule_templates) ───────────────────────

// GET /api/admin/schedule
app.get("/api/admin/schedule", adminMiddleware, async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM schedule_templates ORDER BY time_slot ASC, day_of_week ASC"
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET admin/schedule error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/schedule
app.post("/api/admin/schedule", adminMiddleware, async (req, res) => {
  const { time_slot, day_of_week, class_label, shift } = req.body;
  if (!time_slot || !day_of_week || !class_label) {
    return res.status(400).json({ message: "time_slot, day_of_week y class_label requeridos" });
  }
  try {
    const r = await pool.query(
      `INSERT INTO schedule_templates (time_slot, day_of_week, class_label, shift)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (time_slot, day_of_week) DO UPDATE
         SET class_label = EXCLUDED.class_label, shift = EXCLUDED.shift, updated_at = NOW()
       RETURNING *`,
      [time_slot, Number(day_of_week), class_label.toUpperCase(), shift || "morning"]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/schedule error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/schedule/:id
app.put("/api/admin/schedule/:id", adminMiddleware, async (req, res) => {
  const { time_slot, day_of_week, class_label, shift, is_active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE schedule_templates SET
         time_slot   = COALESCE($1, time_slot),
         day_of_week = COALESCE($2, day_of_week),
         class_label = COALESCE($3, class_label),
         shift       = COALESCE($4, shift),
         is_active   = COALESCE($5, is_active),
         updated_at  = NOW()
       WHERE id = $6 RETURNING *`,
      [time_slot || null, day_of_week ? Number(day_of_week) : null,
      class_label ? class_label.toUpperCase() : null,
      shift || null, is_active ?? null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/schedule error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/schedule/:id
app.delete("/api/admin/schedule/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM schedule_templates WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE admin/schedule error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/packages ──────────────────────────────────────────────────

// GET /api/packages  (público — landing + checkout)
app.get("/api/packages", async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM packages WHERE is_active = true ORDER BY category ASC, sort_order ASC"
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET packages error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/packages
app.post("/api/admin/packages", adminMiddleware, async (req, res) => {
  const { name, num_classes, price, category, validity_days, sort_order } = req.body;
  if (!name?.trim() || !num_classes || price === undefined || !category) {
    return res.status(400).json({ message: "name, num_classes, price y category requeridos" });
  }
  try {
    const r = await pool.query(
      `INSERT INTO packages (name, num_classes, price, category, validity_days, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name.trim(), num_classes, Number(price), category, validity_days || 30, sort_order || 0]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/packages error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/packages/:id
app.put("/api/admin/packages/:id", adminMiddleware, async (req, res) => {
  const { name, num_classes, price, category, validity_days, is_active, sort_order } = req.body;
  try {
    const r = await pool.query(
      `UPDATE packages SET
         name          = COALESCE($1, name),
         num_classes   = COALESCE($2, num_classes),
         price         = COALESCE($3, price),
         category      = COALESCE($4, category),
         validity_days = COALESCE($5, validity_days),
         is_active     = COALESCE($6, is_active),
         sort_order    = COALESCE($7, sort_order),
         updated_at    = NOW()
       WHERE id = $8 RETURNING *`,
      [name || null, num_classes || null,
      price !== undefined ? Number(price) : null,
      category || null, validity_days ?? null,
      is_active ?? null, sort_order ?? null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/packages error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/packages/:id
app.delete("/api/admin/packages/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM packages WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE admin/packages error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin (protected admin routes) ────────────────────────────

// GET /api/users/:id — get single user (admin)
app.get("/api/users/:id", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM users WHERE id = $1", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({ data: mapUser(r.rows[0]) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/class-types — public alias for admin/class-types
app.get("/api/class-types", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM class_types WHERE is_active = true ORDER BY sort_order ASC");
    return res.json({ data: camelRows(r.rows) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/public/instructors — public (no auth) active instructors for homepage
app.get("/api/public/instructors", async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, display_name, bio, specialties, photo_url, photo_focus_x, photo_focus_y FROM instructors WHERE is_active = true ORDER BY created_at ASC"
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/public/review-tags — public (no auth) review tags for client review form
app.get("/api/public/review-tags", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM review_tags ORDER BY name");
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/class-types — alias CRUD (admin)
app.post("/api/class-types", adminMiddleware, async (req, res) => {
  const { name, color, category, defaultDuration, maxCapacity, isActive } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "name requerido" });
  const validCategories = ["jumping", "pilates"];
  const cat = validCategories.includes(category) ? category : "jumping";
  try {
    const r = await pool.query(
      `INSERT INTO class_types (name, color, category, duration_min, capacity, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,0) RETURNING *`,
      [name.trim(), color || "#c026d3", cat, defaultDuration || 60, maxCapacity || 10, isActive !== false]
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// PUT /api/class-types/:id — alias CRUD (admin)
app.put("/api/class-types/:id", adminMiddleware, async (req, res) => {
  const { name, color, category, defaultDuration, maxCapacity, isActive } = req.body;
  const validCategories = ["jumping", "pilates"];
  const cat = validCategories.includes(category) ? category : null;
  try {
    const r = await pool.query(
      `UPDATE class_types SET name=COALESCE($1,name), color=COALESCE($2,color),
       category=COALESCE($3,category),
       duration_min=COALESCE($4,duration_min), capacity=COALESCE($5,capacity),
       is_active=COALESCE($6,is_active), updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name || null, color || null, cat, defaultDuration || null, maxCapacity || null, isActive ?? null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// DELETE /api/class-types/:id — alias CRUD (admin)
app.delete("/api/class-types/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM class_types WHERE id = $1", [req.params.id]);
    return res.json({ message: "Eliminado" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/classes — admin creates a class (alias)
app.post("/api/classes", adminMiddleware, async (req, res) => {
  try {
    const { classTypeId, instructorId, startTime, endTime, maxCapacity, capacity, notes } = req.body;
    if (!classTypeId) return res.status(400).json({ message: "classTypeId requerido" });
    if (!instructorId) return res.status(400).json({ message: "instructorId requerido" });

    // startTime may come as a full ISO/datetime-local string "YYYY-MM-DDTHH:mm"
    // The classes table uses separate DATE and TIME columns
    let dateStr, startTimeStr, endTimeStr;
    if (startTime && startTime.includes("T")) {
      const [d, t] = startTime.split("T");
      dateStr = d;
      startTimeStr = t.slice(0, 5); // "HH:mm"
    } else {
      return res.status(400).json({ message: "startTime debe ser datetime (YYYY-MM-DDTHH:mm)" });
    }
    if (endTime && endTime.includes("T")) {
      endTimeStr = endTime.split("T")[1].slice(0, 5);
    } else if (endTime && endTime.length === 5) {
      endTimeStr = endTime; // already "HH:mm"
    } else {
      // default +55 min
      const [h, m] = startTimeStr.split(":").map(Number);
      const total = h * 60 + m + 55;
      endTimeStr = String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
    }
    const cap = maxCapacity ?? capacity ?? 10;
    const r = await pool.query(
      `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled') RETURNING *`,
      [classTypeId, instructorId, dateStr, startTimeStr, endTimeStr, cap, notes || null]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { console.error("POST /classes error:", err); return res.status(500).json({ message: "Error interno" }); }
});

// PUT /api/classes/:id/cancel
app.put("/api/classes/:id/cancel", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("UPDATE classes SET status='cancelled', updated_at=NOW() WHERE id=$1 RETURNING *", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: "Clase no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// DELETE /api/classes/week — clear classes in date range
app.delete("/api/classes/week", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};
    const start = typeof startDate === "string" ? startDate.slice(0, 10) : null;
    const end = typeof endDate === "string" ? endDate.slice(0, 10) : null;

    if (!start || !end) {
      return res.status(400).json({ message: "startDate y endDate requeridos" });
    }
    if (start > end) {
      return res.status(400).json({ message: "Rango de fechas inválido" });
    }

    const activeBookingsRes = await pool.query(
      `SELECT COUNT(*)::INT AS total
       FROM bookings b
       JOIN classes c ON c.id = b.class_id
       WHERE c.date >= $1 AND c.date <= $2
         AND b.status != 'cancelled'`,
      [start, end]
    );
    const activeBookings = Number(activeBookingsRes.rows?.[0]?.total ?? 0);
    if (activeBookings > 0) {
      return res.status(409).json({
        message: "No se puede limpiar esta semana porque hay reservas activas.",
        activeBookings,
      });
    }

    const deleted = await pool.query(
      "DELETE FROM classes WHERE date >= $1 AND date <= $2 RETURNING id",
      [start, end]
    );
    return res.json({
      deleted: deleted.rowCount ?? deleted.rows.length,
      startDate: start,
      endDate: end,
    });
  } catch (err) {
    console.error("DELETE /classes/week error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

function toDbDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addMinutesToTimeString(timeValue, minutesToAdd) {
  const [hours, minutes] = String(timeValue || "00:00").split(":").map(Number);
  const totalMinutes = (hours * 60) + minutes + minutesToAdd;
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalizedMinutes / 60)).padStart(2, "0")}:${String(normalizedMinutes % 60).padStart(2, "0")}`;
}

function parseTimeSlotTo24Hour(timeValue) {
  const raw = String(timeValue || "").trim().toLowerCase();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3];

  if (meridiem === "pm" && hours !== 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// POST /api/classes/generate — bulk generate
app.post("/api/classes/generate", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, classTypeId, instructorId, daysOfWeek, startTime, endTime, maxCapacity = 10 } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate y endDate requeridos" });
    if (!classTypeId) return res.status(400).json({ message: "classTypeId requerido" });
    if (!instructorId) return res.status(400).json({ message: "instructorId requerido" });
    if (!Array.isArray(daysOfWeek) || !daysOfWeek.length) return res.status(400).json({ message: "Selecciona al menos un día" });
    if (!/^\d{2}:\d{2}$/.test(String(startTime || "")) || !/^\d{2}:\d{2}$/.test(String(endTime || ""))) {
      return res.status(400).json({ message: "startTime y endTime deben tener formato HH:mm" });
    }

    const created = [];
    // Append T00:00:00 to parse as local midnight (not UTC)
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");

    // If classTypeId + daysOfWeek provided → generate from form data
    if (classTypeId && Array.isArray(daysOfWeek) && daysOfWeek.length && startTime && endTime) {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const jsDay = d.getDay(); // 0=Sun,1=Mon...
        if (!daysOfWeek.includes(jsDay)) continue;
        const classDate = toDbDateString(d);
        const exists = await pool.query(
          "SELECT id FROM classes WHERE date = $1 AND start_time = $2 AND class_type_id = $3",
          [classDate, startTime, classTypeId]
        );
        if (exists.rows.length) continue;
        const r = await pool.query(
          `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
           VALUES ($1,$2,$3,$4,$5,$6,'scheduled') RETURNING *`,
          [classTypeId, instructorId, classDate, startTime, endTime, maxCapacity]
        );
        created.push(r.rows[0]);
      }
      return res.json({ created: created.length, data: created });
    }

    // Fallback: generate from schedule_templates
    const slotsRes = await pool.query("SELECT * FROM schedule_templates WHERE is_active = true");
    const classTypeRes = await pool.query("SELECT id, name, category FROM class_types WHERE is_active = true");
    const classTypes = classTypeRes.rows;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
      const daySlots = slotsRes.rows.filter(s => s.day_of_week === dayOfWeek);
      for (const slot of daySlots) {
        const startTimeValue = parseTimeSlotTo24Hour(slot.time_slot);
        if (!startTimeValue) continue;
        const classDate = toDbDateString(d);
        const endTimeValue = addMinutesToTimeString(startTimeValue, 55);
        const label = slot.class_label?.toLowerCase();
        let ct = classTypes.find(c => c.category?.toLowerCase() === label || c.name?.toLowerCase().includes(label));
        if (!ct) ct = classTypes[0];
        if (!ct) continue;
        const exists = await pool.query(
          "SELECT id FROM classes WHERE date = $1 AND start_time = $2 AND class_type_id = $3",
          [classDate, startTimeValue, ct.id]
        );
        if (exists.rows.length) continue;
        const r = await pool.query(
          `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
           VALUES ($1,$2,$3,$4,$5,10,'scheduled') RETURNING *`,
          [ct.id, instructorId, classDate, startTimeValue, endTimeValue]
        );
        created.push(r.rows[0]);
      }
    }
    return res.json({ created: created.length, data: created });
  } catch (err) { console.error("generate classes error:", err); return res.status(500).json({ message: "Error interno" }); }
});

// ─── Schedules (schedule_slots) CRUD ────────────────────────────────────────

// GET /api/schedules
app.get("/api/schedules", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM schedule_slots ORDER BY day_of_week, time_slot");
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/schedules
app.post("/api/schedules", adminMiddleware, async (req, res) => {
  try {
    const { timeSlot, dayOfWeek, classTypeName, classTypeId, instructorName, isActive = true } = req.body;
    if (!timeSlot || !dayOfWeek) return res.status(400).json({ message: "timeSlot y dayOfWeek requeridos" });
    const r = await pool.query(
      `INSERT INTO schedule_slots (time_slot, day_of_week, class_type_id, class_type_name, instructor_name, is_active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [timeSlot, dayOfWeek, classTypeId || null, classTypeName || null, instructorName || null, isActive]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// PUT /api/schedules/:id
app.put("/api/schedules/:id", adminMiddleware, async (req, res) => {
  try {
    const { timeSlot, dayOfWeek, classTypeName, classTypeId, instructorName, isActive } = req.body;
    const r = await pool.query(
      `UPDATE schedule_slots SET time_slot=$1, day_of_week=$2, class_type_id=$3, class_type_name=$4, instructor_name=$5, is_active=$6
       WHERE id=$7 RETURNING *`,
      [timeSlot, dayOfWeek, classTypeId || null, classTypeName || null, instructorName || null, isActive !== false, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Slot no encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// DELETE /api/schedules/:id
app.delete("/api/schedules/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM schedule_slots WHERE id = $1", [req.params.id]);
    return res.json({ message: "Slot eliminado" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/pos/checkout — alias for /pos/sale
app.post("/api/pos/checkout", adminMiddleware, async (req, res) => {
  try {
    const { userId, items, paymentMethod = "efectivo", discountCode } = req.body;
    const result = await processPosSale({ userId, items, paymentMethod, discountCode });
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    return res.status(201).json({ data: result.data });
  } catch (err) {
    console.error("pos/checkout error:", err);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    return res.status(status).json({ message: err?.message || "Error interno" });
  }
});

// ─── Loyalty config & rewards admin ─────────────────────────────────────────

// GET/PUT /api/loyalty/config
app.get("/api/loyalty/config", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
    const defaults = { enabled: true, points_per_class: 10, points_per_peso: 1, welcome_bonus: 50, birthday_bonus: 100 };
    return res.json({ data: r.rows.length ? { ...defaults, ...r.rows[0].value } : defaults });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/loyalty/config", adminMiddleware, async (req, res) => {
  try {
    // Strip referral_bonus if accidentally sent
    const { referral_bonus, pointsPerReferral, ...clean } = req.body;
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('loyalty_config', $1)
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [JSON.stringify(clean)]
    );
    return res.json({ data: clean });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/loyalty/rewards — admin CRUD for loyalty rewards
app.post("/api/loyalty/rewards", adminMiddleware, async (req, res) => {
  try {
    const { name, description, points_cost, reward_type = "custom", reward_value = "", is_active = true, stock = null } = req.body;
    if (!name || !points_cost) return res.status(400).json({ message: "name y points_cost requeridos" });
    const r = await pool.query(
      "INSERT INTO loyalty_rewards (name, description, points_cost, reward_type, reward_value, stock, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [name, description || null, points_cost, reward_type, reward_value || null, stock || null, is_active]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { console.error("loyalty rewards POST:", err); return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/loyalty/rewards/:id", adminMiddleware, async (req, res) => {
  try {
    const { name, description, points_cost, reward_type, reward_value, stock, is_active } = req.body;
    const r = await pool.query(
      "UPDATE loyalty_rewards SET name=$1, description=$2, points_cost=$3, reward_type=$4, reward_value=$5, stock=$6, is_active=$7 WHERE id=$8 RETURNING *",
      [name, description || null, points_cost, reward_type || "custom", reward_value || null, stock || null, is_active !== false, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Recompensa no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { console.error("loyalty rewards PUT:", err); return res.status(500).json({ message: "Error interno" }); }
});

app.delete("/api/loyalty/rewards/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM loyalty_rewards WHERE id=$1", [req.params.id]);
    return res.json({ message: "Recompensa eliminada" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/loyalty/points/:userId
app.get("/api/loyalty/points/:userId", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN type='earn' OR type='adjust' THEN points ELSE -points END),0) AS balance FROM loyalty_transactions WHERE user_id=$1",
      [req.params.userId]
    );
    return res.json({ data: { balance: parseInt(r.rows[0].balance) } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Reports sub-routes ──────────────────────────────────────────────────────

app.get("/api/reports/overview", adminMiddleware, async (req, res) => {
  try {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const [members, revenue, bookings, classes, newMembers, reviews] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM memberships WHERE status='active'"),
      pool.query("SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE status='approved' AND created_at>=$1", [monthStart]),
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(CASE WHEN status='checked_in' THEN 1 END) AS attended
           FROM bookings
          WHERE created_at >= $1`,
        [monthStart]
      ),
      pool.query("SELECT COUNT(*) FROM classes WHERE status='scheduled' AND date>=$1", [monthStart]),
      pool.query("SELECT COUNT(*) FROM users WHERE role='client' AND created_at>=$1", [monthStart]),
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(CASE WHEN is_approved = false THEN 1 END) AS pending,
                COALESCE(AVG(rating),0) AS average
           FROM reviews
          WHERE created_at >= $1`,
        [monthStart]
      ),
    ]);
    const monthlyBookings = parseInt(bookings.rows[0].total || 0);
    const attended = parseInt(bookings.rows[0].attended || 0);
    const classOccupancyRate = monthlyBookings > 0
      ? Number(((attended / monthlyBookings) * 100).toFixed(1))
      : 0;

    return res.json({
      data: {
        activeMembers: parseInt(members.rows[0].count),
        monthlyRevenue: parseFloat(revenue.rows[0].total),
        monthlyBookings,
        upcomingClasses: parseInt(classes.rows[0].count),
        classOccupancyRate,
        newMembersThisMonth: parseInt(newMembers.rows[0].count || 0),
        churnRate: 0,
        reviewsTotal: parseInt(reviews.rows[0].total || 0),
        reviewsPending: parseInt(reviews.rows[0].pending || 0),
        reviewsAverage: Number(parseFloat(reviews.rows[0].average || 0).toFixed(1)),
      }
    });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/reports/revenue", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `WITH months AS (
         SELECT DATE_TRUNC('month', CURRENT_DATE) - (INTERVAL '1 month' * gs.n) AS month_start
         FROM generate_series(0, 11) AS gs(n)
       ),
       orders_by_month AS (
         SELECT DATE_TRUNC('month', created_at) AS month_start,
                COALESCE(SUM(total_amount), 0) AS total,
                COUNT(*) AS count
           FROM orders
          WHERE status = 'approved'
          GROUP BY 1
       )
       SELECT m.month_start AS month,
              COALESCE(o.total, 0) AS amount,
              COALESCE(o.count, 0) AS count
         FROM months m
         LEFT JOIN orders_by_month o ON o.month_start = m.month_start
        ORDER BY m.month_start ASC`
    );
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/reports/classes", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ct.name,
              COUNT(b.id)::INT AS bookings,
              COUNT(CASE WHEN b.status='checked_in' THEN 1 END)::INT AS attended
       FROM classes c
       JOIN class_types ct ON c.class_type_id=ct.id
       LEFT JOIN bookings b ON b.class_id=c.id
       GROUP BY ct.name ORDER BY bookings DESC LIMIT 10`
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/reports/retention", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) AS new_this_month
       FROM users WHERE role='client'`
    );
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/reports/instructors", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT i.id,
              i.display_name AS name,
              COUNT(c.id)::INT AS class_count,
              COUNT(b.id)::INT AS total_students
       FROM instructors i
       LEFT JOIN classes c ON c.instructor_id=i.id
       LEFT JOIN bookings b ON b.class_id=c.id
       GROUP BY i.id, i.display_name
       ORDER BY class_count DESC`
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Reviews public endpoints & admin ───────────────────────────────────────

// GET /api/reviews (public, approved only; admin sees all via /api/admin/reviews)
app.get("/api/reviews", async (req, res) => {
  try {
    const { limit = 50, approved } = req.query;
    let q = `SELECT rv.*, u.display_name AS user_name FROM reviews rv LEFT JOIN users u ON rv.user_id=u.id WHERE 1=1`;
    const params = [];
    if (approved !== "false") { q += ` AND rv.is_approved=true`; }
    params.push(parseInt(limit)); q += ` ORDER BY rv.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(q, params);
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/reviews/stats
app.get("/api/reviews/stats", async (req, res) => {
  try {
    const r = await pool.query("SELECT AVG(rating) AS average, COUNT(*) AS total FROM reviews WHERE is_approved=true");
    const dist = await pool.query("SELECT rating, COUNT(*) FROM reviews WHERE is_approved=true GROUP BY rating ORDER BY rating DESC");
    return res.json({ data: { average: parseFloat(r.rows[0].average || 0).toFixed(1), total: parseInt(r.rows[0].total), distribution: dist.rows } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// Review tags (admin)
app.get("/api/review-tags", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM review_tags ORDER BY name").catch(() => ({ rows: [] }));
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.post("/api/review-tags", adminMiddleware, async (req, res) => {
  try {
    const { name, color } = req.body;
    const r = await pool.query(
      "INSERT INTO review_tags (name, color) VALUES ($1,$2) RETURNING *",
      [name, color || "#c026d3"]
    ).catch(() => ({ rows: [{ id: "1", name, color }] }));
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/review-tags/:id", adminMiddleware, async (req, res) => {
  try {
    const { name, color } = req.body;
    const r = await pool.query(
      "UPDATE review_tags SET name=$1, color=$2 WHERE id=$3 RETURNING *",
      [name, color || "#c026d3", req.params.id]
    ).catch(() => ({ rows: [{ id: req.params.id, name, color }] }));
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.delete("/api/review-tags/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM review_tags WHERE id=$1", [req.params.id]).catch(() => { });
    return res.json({ message: "Tag eliminado" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Referrals admin ─────────────────────────────────────────────────────────

// GET /api/referrals/codes — all codes (admin)
app.get("/api/referrals/codes", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rc.*, u.display_name AS user_name, u.email, rc.uses_count
       FROM referral_codes rc LEFT JOIN users u ON rc.user_id=u.id
       ORDER BY rc.uses_count DESC`
    );
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/referrals — referral history
app.get("/api/referrals", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.*, rc.code, u.display_name AS referred_name
       FROM referrals r
       JOIN referral_codes rc ON r.referral_code_id=rc.id
       LEFT JOIN users u ON r.referred_user_id=u.id
       ORDER BY r.created_at DESC LIMIT 100`
    );
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/referrals/stats
app.get("/api/referrals/stats", adminMiddleware, async (req, res) => {
  try {
    const [total, rewarded] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM referrals"),
      pool.query("SELECT COUNT(*) FROM referrals WHERE rewarded=true"),
    ]);
    return res.json({ data: { total: parseInt(total.rows[0].count), rewarded: parseInt(rewarded.rows[0].count) } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Settings ────────────────────────────────────────────────────────────────

const PUBLIC_SETTINGS_KEYS = new Set([
  "policies_settings",
]);

async function getSettingValueWithDefaults(key) {
  const r = await pool.query("SELECT value FROM settings WHERE key=$1", [key]);
  const raw = r.rows.length ? r.rows[0].value : null;
  return mergeSettingsWithDefaults(key, raw);
}

app.get("/api/public/settings/:key", async (req, res) => {
  try {
    const { key } = req.params;
    if (!PUBLIC_SETTINGS_KEYS.has(key)) {
      return res.status(403).json({ message: "Configuración no pública" });
    }
    const value = await getSettingValueWithDefaults(key);
    return res.json({ data: value });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

app.get("/api/settings/:key", adminMiddleware, async (req, res) => {
  try {
    const value = await getSettingValueWithDefaults(req.params.key);
    return res.json({ data: value });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/settings/:key", adminMiddleware, async (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ message: "Falta `value` en el body" });
    }
    const merged = mergeSettingsWithDefaults(req.params.key, value);
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()",
      [req.params.key, JSON.stringify(merged)]
    );
    return res.json({ data: { key: req.params.key, value: merged } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Evolution API (WhatsApp) ─────────────────────────────────────────────────

// Helper: normalise phone to WhatsApp format (521XXXXXXXXXX for MX)
function normalisePhone(raw) {
  let phone = String(raw).replace(/\D/g, "");
  if (phone.startsWith("52") && phone.length === 12) return phone; // already 521XXXXXXXXXX or 52XXXXXXXXXX
  if (phone.length === 10) return "52" + phone; // local MX 10 digits
  return phone;
}

const EVOLUTION_SEND_DELAY_MS = Number(process.env.EVOLUTION_SEND_DELAY_MS || 1200);
let evolutionSendQueue = Promise.resolve();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendWhatsAppNow(number, text) {
  const payload = { number, text };
  return evolutionApi.post(`/message/sendText/${EVOLUTION_INSTANCE}`, payload);
}

function queueWhatsAppSend(number, text) {
  const run = evolutionSendQueue.then(async () => {
    const jitter = Math.floor(Math.random() * 250);
    return sendWhatsAppNow(number, text).finally(async () => {
      await sleep(Math.max(300, EVOLUTION_SEND_DELAY_MS + jitter));
    });
  });
  // Keep queue alive even if one send fails
  evolutionSendQueue = run.catch(() => {});
  return run;
}

async function getSettingsValue(key, fallback = null) {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = $1 LIMIT 1", [key]);
    if (!r.rows.length || r.rows[0].value == null) return fallback;
    return r.rows[0].value;
  } catch (_) {
    return fallback;
  }
}

function renderTemplateVars(template, vars = {}) {
  if (typeof template !== "string" || !template.trim()) return "";
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

async function sendConfiguredWhatsAppTemplate({ templateKey, phone, vars = {}, fallbackMessage = "" }) {
  if (!phone) return { sent: false, reason: "no_phone" };
  const notificationSettings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
  if (notificationSettings?.whatsapp_reminders === false) {
    return { sent: false, reason: "whatsapp_disabled" };
  }
  const templates = await getSettingsValue("notification_templates", DEFAULT_NOTIFICATION_TEMPLATES);
  const templateBody = templates?.[templateKey]?.body || "";
  const rendered = renderTemplateVars(templateBody, vars).trim();
  const text = rendered || String(fallbackMessage || "").trim();
  if (!text) return { sent: false, reason: "empty_message" };
  await queueWhatsAppSend(normalisePhone(phone), text);
  return { sent: true };
}

async function areEmailNotificationsEnabled() {
  const notificationSettings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
  return notificationSettings?.email_reminders !== false;
}

// Webhook (no auth) — receives Evolution API events
app.post("/api/webhook/evolution", async (req, res) => {
  try {
    const body = req.body;
    console.log("[EVOLUTION WEBHOOK]", JSON.stringify(body).slice(0, 400));
    // TODO: handle inbound messages / delivery receipts
    return res.sendStatus(200);
  } catch (err) {
    console.error("[EVOLUTION WEBHOOK ERROR]", err.message);
    return res.sendStatus(200);
  }
});

// GET /api/evolution/status
app.get("/api/evolution/status", adminMiddleware, async (req, res) => {
  try {
    // Check if instance exists first
    let instanceExists = false;
    try {
      const listRes = await evolutionApi.get("/instance/fetchInstances");
      const instances = listRes.data?.data || listRes.data || [];
      instanceExists = Array.isArray(instances)
        ? instances.some((i) =>
          i.instance?.instanceName === EVOLUTION_INSTANCE ||
          i.instanceName === EVOLUTION_INSTANCE ||
          i.name === EVOLUTION_INSTANCE
        )
        : false;
    } catch (_) { instanceExists = false; }

    if (!instanceExists) {
      return res.json({ data: { connected: false, state: "disconnected", instanceExists: false } });
    }

    const r = await evolutionApi.get(`/instance/connectionState/${EVOLUTION_INSTANCE}`);
    const state = r.data?.instance?.state || r.data?.state || "unknown";

    let qrCode = null;
    if (state === "connecting" || state === "qr") {
      try {
        const qrRes = await evolutionApi.get(`/instance/connect/${EVOLUTION_INSTANCE}`);
        qrCode = normalizeQrDataUrl(pickEvolutionQrPayload(qrRes.data));
      } catch (_) { }
    }

    return res.json({
      data: {
        connected: state === "open",
        state: state === "open" ? "connected" : state === "qr" || state === "connecting" ? "qr_pending" : "disconnected",
        number: r.data?.instance?.profileName || null,
        instanceExists: true,
        qrCode,
      },
    });
  } catch (err) {
    console.error("[EVOLUTION STATUS]", err.response?.data || err.message);
    return res.json({ data: { connected: false, state: "disconnected", instanceExists: false } });
  }
});

// POST /api/evolution/connect — create instance (or fetch QR if already exists)
app.post("/api/evolution/connect", adminMiddleware, async (req, res) => {
  try {
    const isAlreadyInUseError = (status, rawMessage) =>
      status === 409 || status === 403 || /already in use|in use|ya existe/i.test(rawMessage || "");

    // Try creating the instance
    let createData = null;
    let createErrStatus = null;
    let createErrMessage = "";
    let createAlreadyInUse = false;
    try {
      const createRes = await evolutionApi.post("/instance/create", {
        instanceName: EVOLUTION_INSTANCE,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      });
      createData = createRes.data;
    } catch (createErr) {
      createErrStatus = createErr.response?.status ?? null;
      createErrMessage = JSON.stringify(createErr.response?.data || createErr.message || "");
      createAlreadyInUse = isAlreadyInUseError(createErrStatus, createErrMessage);
      // "already in use" is an expected case when the instance already exists.
      if (!createAlreadyInUse) {
        console.error("[EVOLUTION CREATE]", createErr.response?.data || createErr.message);
      } else {
        console.log("[EVOLUTION CREATE] Instance already exists, proceeding to connect:", EVOLUTION_INSTANCE);
      }
    }

    // Extract QR from create response (Evolution v2 returns it inline)
    let qrCode =
      normalizeQrDataUrl(pickEvolutionQrPayload(createData));

    // If not in create response, try the connect endpoint
    if (!qrCode) {
      try {
        const qrRes = await evolutionApi.get(`/instance/connect/${EVOLUTION_INSTANCE}`);
        console.log("[EVOLUTION QR RESPONSE]", JSON.stringify(qrRes.data).slice(0, 300));
        qrCode = normalizeQrDataUrl(pickEvolutionQrPayload(qrRes.data));
      } catch (qrErr) {
        console.error("[EVOLUTION QR FETCH]", qrErr.response?.data || qrErr.message);
      }
    }

    if (!qrCode) {
      // If there is no QR, check if the instance is already linked/open.
      try {
        const stateResp = await evolutionApi.get(`/instance/connectionState/${EVOLUTION_INSTANCE}`);
        const currentState = stateResp.data?.instance?.state || stateResp.data?.state || "unknown";
        if (currentState === "open") {
          return res.json({
            data: {
              state: "connected",
              connected: true,
              message: "WhatsApp ya está conectado en esta instancia",
            },
          });
        }
      } catch (_) {
        // ignore and continue with error mapping below
      }

      if (createAlreadyInUse) {
        return res.status(409).json({
          message: `No se pudo obtener QR para la instancia "${EVOLUTION_INSTANCE}". Ese nombre ya está en uso. Cambia EVOLUTION_INSTANCE_NAME en Railway por un nombre único (ej. ophelia-jump-studio-2026).`,
        });
      }
      return res.status(502).json({ message: "Evolution respondió sin QR. Intenta nuevamente en unos segundos." });
    }

    return res.json({ data: { qrCode, state: "qr_pending", message: "Escanea el código QR con WhatsApp" } });
  } catch (err) {
    console.error("[EVOLUTION CONNECT]", err.response?.data || err.message);
    return res.status(500).json({ message: "Error al conectar con Evolution API" });
  }
});

// POST /api/evolution/disconnect
app.post("/api/evolution/disconnect", adminMiddleware, async (req, res) => {
  try {
    await evolutionApi.delete(`/instance/logout/${EVOLUTION_INSTANCE}`);
    return res.json({ data: { message: "WhatsApp desconectado correctamente" } });
  } catch (err) {
    // If instance not found it's already disconnected
    if (err.response?.status === 404) {
      return res.json({ data: { message: "Ya estaba desconectado" } });
    }
    console.error("[EVOLUTION DISCONNECT]", err.response?.data || err.message);
    return res.status(500).json({ message: "Error al desconectar WhatsApp" });
  }
});

// POST /api/evolution/send-test  { phone: "5219XXXXXXXXX" }
app.post("/api/evolution/send-test", adminMiddleware, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Se requiere número de teléfono" });
    const number = normalisePhone(phone);
    await queueWhatsAppSend(
      number,
      "✅ Mensaje de prueba desde Kala Barre Studio. ¡WhatsApp conectado correctamente!",
    );
    return res.json({ data: { message: "Mensaje de prueba enviado correctamente" } });
  } catch (err) {
    console.error("[EVOLUTION SEND-TEST]", err.response?.data || err.message);
    return res.status(500).json({ message: "Error al enviar mensaje de prueba" });
  }
});

// POST /api/evolution/send-message  { phone, message }
app.post("/api/evolution/send-message", adminMiddleware, async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ message: "Se requieren teléfono y mensaje" });
    const number = normalisePhone(phone);
    await queueWhatsAppSend(number, message);
    return res.json({ data: { message: "Mensaje enviado", number } });
  } catch (err) {
    console.error("[EVOLUTION SEND-MSG]", err.response?.data || err.message);
    return res.status(500).json({ message: "Error al enviar mensaje" });
  }
});

// POST /api/evolution/notify-clients — disabled for safety
app.post("/api/evolution/notify-clients", adminMiddleware, async (req, res) => {
  return res.status(410).json({
    message: "Los envíos masivos por WhatsApp fueron deshabilitados por seguridad.",
  });
});

// ─── Videos purchases approve/reject ────────────────────────────────────────

app.post("/api/videos/purchases/:id/approve", adminMiddleware, async (req, res) => {
  try {
    const { admin_notes } = req.body;
    const r = await pool.query(
      "UPDATE video_purchases SET status='active', admin_notes=$1, verified_at=NOW() WHERE id=$2 RETURNING *",
      [admin_notes || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Compra no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.post("/api/videos/purchases/:id/reject", adminMiddleware, async (req, res) => {
  try {
    const { admin_notes } = req.body;
    const r = await pool.query(
      "UPDATE video_purchases SET status='rejected', admin_notes=$1, verified_at=NOW() WHERE id=$2 RETURNING *",
      [admin_notes || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Compra no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// Admin Videos — also available at /api/videos (CRUD) for admin use

// POST /api/videos/upload  — upload video file (+ optional thumbnail) to Google Drive
app.post("/api/videos/upload", adminMiddleware, uploadVideo.fields([{ name: "video", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }]), async (req, res) => {
  try {
    const videoFile = req.files?.video?.[0];
    const thumbnailFile = req.files?.thumbnail?.[0];
    if (!videoFile) return res.status(400).json({ message: "Se requiere el archivo de video" });

    const isDriveConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );
    if (!isDriveConfigured) {
      return res.status(503).json({ message: "Google Drive no configurado. Define GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN en Railway." });
    }

    const accessToken = await getGoogleDriveAccessToken();

    // Upload video using resumable upload (streams from disk in 5 MB chunks)
    const videoResult = await uploadFileToDriveResumable(
      videoFile.path,
      videoFile.originalname,
      videoFile.mimetype,
      accessToken
    );
    // Clean up temp file
    fs.unlink(videoFile.path, () => {});
    await makeGoogleDriveFilePublic(videoResult.id, accessToken);

    // Upload thumbnail (optional) — small file, use buffer multipart
    let thumbnailUrl = `https://drive.google.com/thumbnail?id=${videoResult.id}&sz=w640`;
    let thumbnailDriveId = "";
    if (thumbnailFile) {
      const thumbBuffer = fs.readFileSync(thumbnailFile.path);
      const thumbResult = await uploadBufferToDrive(
        thumbBuffer,
        thumbnailFile.originalname,
        thumbnailFile.mimetype,
        accessToken
      );
      fs.unlink(thumbnailFile.path, () => {});
      await makeGoogleDriveFilePublic(thumbResult.id, accessToken);
      thumbnailUrl = `https://drive.google.com/thumbnail?id=${thumbResult.id}&sz=w640`;
      thumbnailDriveId = thumbResult.id;
    }

    return res.json({
      drive_file_id: videoResult.id,
      cloudinary_id: videoResult.id,           // same value for compat
      thumbnail_url: thumbnailUrl,
      thumbnail_drive_id: thumbnailDriveId,
      secure_url: `https://drive.google.com/file/d/${videoResult.id}/view`,
      embed_url: `https://drive.google.com/file/d/${videoResult.id}/preview`,
      duration_seconds: 0,
    });
  } catch (err) {
    // Clean up temp files on error
    if (req.files?.video?.[0]?.path) fs.unlink(req.files.video[0].path, () => {});
    if (req.files?.thumbnail?.[0]?.path) fs.unlink(req.files.thumbnail[0].path, () => {});
    console.error("Video upload error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Error al subir video: " + (err?.response?.data?.error?.message || err.message) });
  }
});

app.post("/api/videos", adminMiddleware, async (req, res) => {
  try {
    const {
      title, description, subtitle, tagline, days, brand_color,
      drive_file_id, cloudinary_id, thumbnail_url, thumbnail_drive_id,
      class_type_id, instructor_id, duration_seconds,
      access_type = "free", is_published = false, is_featured = false, sort_order = 0,
      sales_enabled = false, sales_unlocks_video = false, sales_price_mxn, sales_class_credits, sales_cta_text,
      category_id,
    } = req.body;
    if (!title) return res.status(400).json({ message: "title es requerido" });
    const r = await pool.query(
      `INSERT INTO videos (
         title, description, subtitle, tagline, days, brand_color,
         drive_file_id, cloudinary_id, thumbnail_url, thumbnail_drive_id,
         class_type_id, instructor_id, duration_seconds,
         access_type, is_published, is_featured, sort_order,
         sales_enabled, sales_unlocks_video, sales_price_mxn, sales_class_credits, sales_cta_text
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        title, description || null, subtitle || null, tagline || null, days || null, brand_color || null,
        drive_file_id || null, cloudinary_id || drive_file_id || null, thumbnail_url || null, thumbnail_drive_id || null,
        class_type_id || category_id || null, instructor_id || null, duration_seconds || 0,
        access_type, is_published, is_featured, sort_order,
        sales_enabled, sales_unlocks_video, sales_price_mxn || null, sales_class_credits || null, sales_cta_text || null,
      ]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST /videos error:", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

app.put("/api/videos/:id", adminMiddleware, async (req, res) => {
  try {
    const {
      title, description, subtitle, tagline, days, brand_color,
      drive_file_id, cloudinary_id, thumbnail_url, thumbnail_drive_id,
      class_type_id, instructor_id, duration_seconds,
      access_type, is_published, is_featured, sort_order,
      sales_enabled, sales_unlocks_video, sales_price_mxn, sales_class_credits, sales_cta_text,
      category_id,
    } = req.body;
    const r = await pool.query(
      `UPDATE videos SET
         title=$1, description=$2, subtitle=$3, tagline=$4, days=$5, brand_color=$6,
         drive_file_id=COALESCE($7, drive_file_id),
         cloudinary_id=COALESCE($8, cloudinary_id),
         thumbnail_url=COALESCE($9, thumbnail_url),
         thumbnail_drive_id=COALESCE($10, thumbnail_drive_id),
         class_type_id=$11, instructor_id=$12,
         duration_seconds=COALESCE($13, duration_seconds),
         access_type=COALESCE($14, access_type),
         is_published=COALESCE($15, is_published),
         is_featured=COALESCE($16, is_featured),
         sort_order=COALESCE($17, sort_order),
         sales_enabled=COALESCE($18, sales_enabled),
         sales_unlocks_video=COALESCE($19, sales_unlocks_video),
         sales_price_mxn=$20, sales_class_credits=$21, sales_cta_text=$22,
         updated_at=NOW()
       WHERE id=$23 RETURNING *`,
      [
        title, description || null, subtitle || null, tagline || null, days || null, brand_color || null,
        drive_file_id || null, cloudinary_id || drive_file_id || null,
        thumbnail_url || null, thumbnail_drive_id || null,
        class_type_id || category_id || null, instructor_id || null,
        duration_seconds ?? null,
        access_type || null, is_published ?? null, is_featured ?? null, sort_order ?? null,
        sales_enabled ?? null, sales_unlocks_video ?? null,
        sales_price_mxn ?? null, sales_class_credits ?? null, sales_cta_text ?? null,
        req.params.id,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Video no encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT /videos/:id error:", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

app.delete("/api/videos/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM videos WHERE id=$1", [req.params.id]);
    return res.json({ message: "Video eliminado" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Homepage Video Cards ────────────────────────────────────────────────────
// GET /api/homepage-video-cards  (public)
app.get("/api/homepage-video-cards", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM homepage_video_cards ORDER BY sort_order ASC");
    // Normalize any old Google Drive preview URLs to proxy URLs
    const rows = r.rows.map(card => {
      if (card.video_url) {
        const m = card.video_url.match(/drive\.google\.com\/file\/d\/([^/]+)\/preview/);
        if (m) card.video_url = `/api/drive/video/${m[1]}`;
      }
      return card;
    });
    return res.json({ data: rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// PUT /api/homepage-video-cards/:id  (admin — text fields)
app.put("/api/homepage-video-cards/:id", adminMiddleware, async (req, res) => {
  try {
    const { title, description, emoji, thumbnail_url } = req.body;
    if (!title || !description) return res.status(400).json({ message: "title y description requeridos" });
    const r = await pool.query(
      `UPDATE homepage_video_cards
       SET title=$1, description=$2, emoji=$3, thumbnail_url=COALESCE($4, thumbnail_url), updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [title.trim(), description.trim(), (emoji || "🎬").trim(), thumbnail_url || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Tarjeta no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/homepage-video-cards/:id/thumbnail — upload a thumbnail image (admin)
app.post("/api/homepage-video-cards/:id/thumbnail", adminMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió archivo" });
    const cardId = req.params.id;

    // Upload image to Google Drive (reuse existing OAuth setup)
    const isDriveConfigured = Boolean(
      process.env.GOOGLE_DRIVE_FOLDER_ID &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );

    let thumbnailUrl;
    if (isDriveConfigured) {
      // Get access token
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
          grant_type: "refresh_token",
        }),
      });
      const { access_token } = await tokenResp.json();

      // Upload to Drive
      const boundary = "thumbnail_boundary_" + Date.now();
      const metadata = JSON.stringify({
        name: `thumbnail_card_${cardId}_${Date.now()}.${req.file.originalname.split(".").pop()}`,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      });
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${req.file.mimetype}\r\n\r\n`),
        req.file.buffer,
        Buffer.from(`\r\n--${boundary}--`),
      ]);

      const uploadResp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      const uploadJson = await uploadResp.json();
      if (!uploadJson.id) throw new Error("Error al subir imagen a Drive");

      // Make public
      await fetch(`https://www.googleapis.com/drive/v3/files/${uploadJson.id}/permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      });

      // Use proxy URL for consistency
      thumbnailUrl = `/api/drive/image/${uploadJson.id}`;
    } else {
      // Fallback: store as base64 data URI (small images only)
      thumbnailUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }

    const r = await pool.query(
      `UPDATE homepage_video_cards SET thumbnail_url=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [thumbnailUrl, cardId]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Tarjeta no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("Thumbnail upload error:", err);
    return res.status(500).json({ message: err.message || "Error al subir miniatura" });
  }
});

// DELETE /api/homepage-video-cards/:id/thumbnail — remove thumbnail (admin)
app.delete("/api/homepage-video-cards/:id/thumbnail", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE homepage_video_cards SET thumbnail_url=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Tarjeta no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Direct-to-Drive Upload (server proxies upload to avoid CORS) ───────────

// POST /api/drive/init-upload — creates a Google Drive resumable session, returns sessionId
app.post("/api/drive/init-upload", adminMiddleware, async (req, res) => {
  try {
    const { fileName, mimeType, fileSize } = req.body;
    if (!fileName || !mimeType) {
      return res.status(400).json({ message: "fileName y mimeType son requeridos" });
    }

    const isDriveConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );
    if (!isDriveConfigured) {
      return res.status(503).json({ message: "Google Drive no configurado" });
    }

    const accessToken = await getGoogleDriveAccessToken();
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
    const metadata = { name: fileName, ...(folderId ? { parents: [folderId] } : {}) };

    // Initiate a resumable upload session on Google Drive
    const initResp = await axios.post(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
      metadata,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mimeType,
          ...(fileSize ? { "X-Upload-Content-Length": String(fileSize) } : {}),
        },
      }
    );

    const uploadUrl = initResp.headers.location;
    if (!uploadUrl) {
      return res.status(500).json({ message: "No se obtuvo URL de subida de Google Drive" });
    }

    // Store session in memory (short-lived) for the chunk upload endpoint
    const sessionId = crypto.randomBytes(16).toString("hex");
    driveUploadSessions.set(sessionId, { uploadUrl, accessToken, mimeType, fileSize: Number(fileSize) || 0, createdAt: Date.now() });
    // Clean up old sessions after 2 hours
    setTimeout(() => driveUploadSessions.delete(sessionId), 2 * 60 * 60 * 1000);

    return res.json({ data: { sessionId } });
  } catch (err) {
    console.error("Drive init-upload error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Error al iniciar subida: " + (err?.response?.data?.error?.message || err.message) });
  }
});

// In-memory map to store active Drive upload sessions
const driveUploadSessions = new Map();

// PUT /api/drive/upload-chunk/:sessionId — proxy a chunk from browser to Google Drive
// The browser sends chunks of ~5MB via this endpoint; the server forwards them to Drive.
// This avoids CORS issues (browser → our server → googleapis.com)
app.put("/api/drive/upload-chunk/:sessionId", adminMiddleware, async (req, res) => {
  const session = driveUploadSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ message: "Sesión de upload no encontrada o expirada" });

  const contentRange = req.headers["content-range"] || "";
  const contentLength = req.headers["content-length"] || "";
  const contentType = req.headers["content-type"] || session.mimeType;

  try {
    // Collect the chunk from the browser request
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    // Forward to Google Drive
    const driveResp = await axios.put(session.uploadUrl, body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        ...(contentRange ? { "Content-Range": contentRange } : {}),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: (s) => s === 200 || s === 201 || s === 308,
    });

    if (driveResp.status === 200 || driveResp.status === 201) {
      // Upload complete — return the file data
      driveUploadSessions.delete(req.params.sessionId);
      return res.json({ done: true, data: driveResp.data });
    }

    // 308 Resume Incomplete — return range info so browser knows where to continue
    const range = driveResp.headers.range || "";
    return res.json({ done: false, range });
  } catch (err) {
    console.error("Drive upload-chunk error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Error al subir chunk: " + (err?.response?.data?.error?.message || err.message) });
  }
});

// POST /api/drive/make-public/:fileId — make a Drive file publicly readable
app.post("/api/drive/make-public/:fileId", adminMiddleware, async (req, res) => {
  try {
    const accessToken = await getGoogleDriveAccessToken();
    await makeGoogleDriveFilePublic(req.params.fileId, accessToken);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Drive make-public error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Error al hacer público el archivo" });
  }
});

// GET /api/drive/video/:fileId — stream a public Google Drive video (proxy)
app.get("/api/drive/video/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || fileId.length < 10) return res.status(400).end();

    const accessToken = await getGoogleDriveAccessToken();

    // First, get file metadata to know the mimeType & size
    const metaResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,size,name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const { mimeType, size, name } = metaResp.data;
    const totalSize = parseInt(size, 10);

    // Support Range requests for seeking
    const rangeHeader = req.headers.range;
    let start = 0;
    let end = totalSize - 1;

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      start = parseInt(parts[0], 10);
      end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      if (start >= totalSize || end >= totalSize) {
        res.writeHead(416, { "Content-Range": `bytes */${totalSize}` });
        return res.end();
      }
    }

    const chunkSize = end - start + 1;
    const driveHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Range: `bytes=${start}-${end}`,
    };

    const driveResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: driveHeaders, responseType: "stream" }
    );

    const statusCode = rangeHeader ? 206 : 200;
    res.writeHead(statusCode, {
      "Content-Type": mimeType || "video/mp4",
      "Content-Length": chunkSize,
      "Content-Range": `bytes ${start}-${end}/${totalSize}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
      "Content-Disposition": `inline; filename="${name || "video.mp4"}"`,
    });

    driveResp.data.pipe(res);
  } catch (err) {
    console.error("Drive video proxy error:", err?.response?.data || err.message);
    if (!res.headersSent) res.status(500).json({ message: "Error al obtener video" });
  }
});

// GET /api/drive/image/:fileId — proxy a public Google Drive image
app.get("/api/drive/image/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || fileId.length < 10) return res.status(400).end();
    const accessToken = await getGoogleDriveAccessToken();
    const metaResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const { mimeType, name } = metaResp.data;
    const driveResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` }, responseType: "stream" }
    );
    res.set({
      "Content-Type": mimeType || "image/jpeg",
      "Cache-Control": "public, max-age=604800",
      "Content-Disposition": `inline; filename="${name || "image.jpg"}"`,
    });
    driveResp.data.pipe(res);
  } catch (err) {
    console.error("Drive image proxy error:", err?.response?.data || err.message);
    if (!res.headersSent) res.status(500).json({ message: "Error al obtener imagen" });
  }
});

// POST /api/homepage-video-cards/:id/set-drive-video — save Drive file ID to card
app.post("/api/homepage-video-cards/:id/set-drive-video", adminMiddleware, async (req, res) => {
  try {
    const { driveFileId } = req.body;
    if (!driveFileId) return res.status(400).json({ message: "driveFileId requerido" });

    // Store the proxy URL instead of the Google Drive preview URL
    const videoUrl = `/api/drive/video/${driveFileId}`;
    const r = await pool.query(
      `UPDATE homepage_video_cards SET video_url=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [videoUrl, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Tarjeta no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/homepage-video-cards/migrate-urls — convert old Google Drive preview URLs to proxy URLs
app.post("/api/homepage-video-cards/migrate-urls", adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE homepage_video_cards
       SET video_url = '/api/drive/video/' || regexp_replace(video_url, '^https://drive\\.google\\.com/file/d/([^/]+)/preview$', '\\1'),
           updated_at = NOW()
       WHERE video_url LIKE 'https://drive.google.com/file/d/%/preview'
       RETURNING id, video_url`
    );
    return res.json({ migrated: result.rowCount, rows: result.rows });
  } catch (err) {
    console.error("Migration error:", err.message);
    return res.status(500).json({ message: "Error al migrar URLs" });
  }
});

// POST /api/homepage-video-cards/:id/upload  (admin — upload video file, max 500 MB)
app.post("/api/homepage-video-cards/:id/upload", adminMiddleware, (req, res, next) => {
  uploadVideo.single("video")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: `El archivo es demasiado grande. Máximo ${VIDEO_MAX_MB} MB.` });
      }
      return res.status(400).json({ message: err.message || "Error al procesar archivo" });
    }
    next();
  });
}, async (req, res) => {
  try {
    const videoFile = req.file;
    if (!videoFile) return res.status(400).json({ message: "Se requiere un archivo de video" });

    const isDriveConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );

    let videoUrl;

    if (isDriveConfigured) {
      // Upload to Google Drive using resumable upload (streams in 5 MB chunks)
      const accessToken = await getGoogleDriveAccessToken();
      const result = await uploadFileToDriveResumable(
        videoFile.path,
        `homepage_card_${req.params.id}_${Date.now()}_${videoFile.originalname}`,
        videoFile.mimetype,
        accessToken
      );
      // Clean up temp file
      fs.unlink(videoFile.path, () => {});
      await makeGoogleDriveFilePublic(result.id, accessToken);
      videoUrl = `/api/drive/video/${result.id}`;
    } else {
      if (videoFile.path) fs.unlink(videoFile.path, () => {});
      return res.status(503).json({
        message: "Google Drive no está configurado. Configura GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REFRESH_TOKEN para subir videos.",
      });
    }

    // Save video_url to DB
    const r = await pool.query(
      `UPDATE homepage_video_cards SET video_url=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [videoUrl, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Tarjeta no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    // Clean up temp file on error
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error("Homepage card video upload error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Error al subir video: " + (err?.response?.data?.error?.message || err.message) });
  }
});

// DELETE /api/homepage-video-cards/:id/video  (admin — remove video)
app.delete("/api/homepage-video-cards/:id/video", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE homepage_video_cards SET video_url=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Tarjeta no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/admin/stats
// GET /api/admin/birthdays?month=N (1-12, default current month)
// Returns clients with date_of_birth in the requested month, sorted by day.
app.get("/api/admin/birthdays", adminMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const monthRaw = Number(req.query.month);
    const month = Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : now.getMonth() + 1;
    const result = await pool.query(
      `SELECT id, display_name, email, phone, photo_url, date_of_birth,
              EXTRACT(DAY FROM date_of_birth)::int   AS day,
              EXTRACT(MONTH FROM date_of_birth)::int AS month
       FROM users
       WHERE role = 'client'
         AND date_of_birth IS NOT NULL
         AND EXTRACT(MONTH FROM date_of_birth) = $1
       ORDER BY EXTRACT(DAY FROM date_of_birth) ASC, display_name ASC`,
      [month]
    );
    const today = { day: now.getDate(), month: now.getMonth() + 1 };
    const data = result.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      phone: row.phone,
      photoUrl: row.photo_url,
      dateOfBirth: row.date_of_birth,
      day: row.day,
      month: row.month,
      isToday: row.month === today.month && row.day === today.day,
    }));
    return res.json({
      month,
      total: data.length,
      todayCount: data.filter((u) => u.isToday).length,
      data,
    });
  } catch (err) {
    console.error("admin/birthdays error:", err.message);
    return res.status(500).json({ message: "Error obteniendo cumpleaños" });
  }
});

app.get("/api/admin/stats", adminMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    const [classesToday, activeMembers, monthlyRevenue, pendingAlerts] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM classes WHERE date = $1", [today]),
      pool.query("SELECT COUNT(*) FROM memberships WHERE status = 'active'"),
      pool.query("SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE status = 'approved' AND created_at >= $1", [monthStart]),
      pool.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_verification'"),
    ]);

    return res.json({
      classesToday: parseInt(classesToday.rows[0].count),
      activeMembers: parseInt(activeMembers.rows[0].count),
      monthlyRevenue: parseFloat(monthlyRevenue.rows[0].total),
      pendingAlerts: parseInt(pendingAlerts.rows[0].count),
    });
  } catch (err) {
    console.error("admin/stats error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/users?role=&search=
app.get("/api/users", adminMiddleware, async (req, res) => {
  try {
    const { role, search = "" } = req.query;
    let q = `SELECT id, display_name, email, phone, role, created_at FROM users WHERE 1=1`;
    const params = [];
    if (role) { params.push(role); q += ` AND role = $${params.length}`; }
    const searchValue = String(search ?? "").trim();
    if (searchValue) {
      params.push(`%${searchValue}%`);
      const textIdx = params.length;
      const digitSearch = searchValue.replace(/\D/g, "");
      let phoneClause = "";
      if (digitSearch) {
        params.push(`%${digitSearch}%`);
        phoneClause = ` OR regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE $${params.length}`;
      }
      q += ` AND (display_name ILIKE $${textIdx} OR email ILIKE $${textIdx}${phoneClause})`;
    }
    q += " ORDER BY display_name ASC LIMIT 200";
    const r = await pool.query(q, params);
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    console.error("GET /api/users error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/users — admin creates a client
app.post("/api/users", adminMiddleware, async (req, res) => {
  try {
    const { email, displayName, phone, role = "client", dateOfBirth, emergencyContactName, emergencyContactPhone, healthNotes } = req.body;
    if (!email || !displayName) return res.status(400).json({ message: "Email y nombre requeridos" });
    const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (exists.rows.length) return res.status(409).json({ message: "Email ya registrado" });
    const tempPassword = Math.random().toString(36).slice(2, 10);
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.default.hash(tempPassword, 10);
    const r = await pool.query(
      `INSERT INTO users (display_name, email, phone, role, password_hash, date_of_birth, emergency_contact_name, emergency_contact_phone, health_notes, accepts_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING *`,
      [displayName, email, phone || null, role, hash, dateOfBirth || null, emergencyContactName || null, emergencyContactPhone || null, healthNotes || null]
    );
    return res.status(201).json({ user: mapUser(r.rows[0]), tempPassword });
  } catch (err) {
    console.error("POST /api/users error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/users/:id
app.delete("/api/users/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    return res.json({ message: "Usuario eliminado" });
  } catch (err) {
    console.error("DELETE /api/users/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Memberships admin CRUD ──────────────────────────────────────────────────

// GET /api/memberships — admin list all
app.get("/api/memberships", adminMiddleware, async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    let q = `SELECT m.*, u.display_name AS user_name, p.name AS plan_name,
                    p.class_limit, p.duration_days, p.class_category
             FROM memberships m
             LEFT JOIN users u ON m.user_id = u.id
             LEFT JOIN plans p ON m.plan_id = p.id
             WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); q += ` AND m.status = $${params.length}`; }
    params.push(parseInt(limit)); q += ` ORDER BY m.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(q, params);
    return res.json({
      data: r.rows.map(m => ({
        id: m.id,
        userId: m.user_id,
        userName: m.user_name ?? m.user_id,
        planId: m.plan_id,
        planName: m.plan_name ?? m.plan_id,
        classCategory: m.class_category ?? "all",
        status: m.status,
        paymentMethod: m.payment_method,
        startDate: m.start_date,
        endDate: m.end_date,
        classesRemaining: m.classes_remaining,
        classLimit: m.class_limit,
        createdAt: m.created_at,
      }))
    });
  } catch (err) {
    console.error("GET /memberships error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/memberships — admin assigns membership to a user
app.post("/api/memberships", adminMiddleware, async (req, res) => {
  try {
    const { userId, planId, paymentMethod = "efectivo", startDate } = req.body;
    if (!userId || !planId) return res.status(400).json({ message: "userId y planId requeridos" });
    const planRes = await pool.query("SELECT * FROM plans WHERE id = $1 AND is_active = true", [planId]);
    if (!planRes.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    const plan = planRes.rows[0];
    const nonRepeatableConflict = await findNonRepeatablePlanConflict({ userId, plan });
    if (nonRepeatableConflict) {
      return res.status(409).json({ message: nonRepeatableConflict.message });
    }
    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + (plan.duration_days || 30));
    const r = await pool.query(
      `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining)
       VALUES ($1,$2,'active',$3,$4,$5,$6) RETURNING *`,
      [userId, planId, paymentMethod, start.toISOString(), end.toISOString(), plan.class_limit ?? null]
    );

    // ── Email: membership activated ──────────────────────────────────────
    try {
      const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [userId]);
      if (uRes.rows[0]) {
        const u = uRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendMembershipActivated({
            to: u.email,
            name: u.display_name || "Alumna",
            planName: plan.name,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            classLimit: plan.class_limit ?? null,
          }).catch((e) => console.error("[Email] membership activated:", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "membership_activated",
          phone: u.phone,
          vars: {
            name: u.display_name || "Alumna",
            plan: plan.name || "tu plan",
            startDate: start.toLocaleDateString("es-MX"),
            endDate: end.toLocaleDateString("es-MX"),
          },
          fallbackMessage: `Hola ${u.display_name || "Alumna"}, tu membresía ${plan.name || ""} ya está activa. Vigencia: ${start.toLocaleDateString("es-MX")} al ${end.toLocaleDateString("es-MX")}.`,
        }).catch((e) => console.error("[WA] membership activated:", e.message));
      }
    } catch (emailErr) {
      console.error("[Email] membership create query:", emailErr.message);
    }

    // ── Award loyalty points for membership purchase ────────────────────
    if (userId && parseFloat(plan.price) > 0) {
      try {
        const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
        const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
        const pts = Math.floor(parseFloat(plan.price) * (cfg.points_per_peso ?? 1));
        if (cfg.enabled !== false && pts > 0) {
          await pool.query(
            "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
            [userId, pts, `Membresía asignada — ${plan.name} ($${plan.price})`]
          );
        }
      } catch (e) { /* loyalty error shouldn't fail membership creation */ }
    }

    triggerWalletPassSync(userId, "membership_created");
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST /memberships error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/memberships/:id/activate
app.put("/api/memberships/:id/activate", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE memberships SET status = 'active', updated_at = NOW() WHERE id = $1
       RETURNING *, (SELECT name FROM plans WHERE id = memberships.plan_id) AS plan_name,
                    (SELECT class_limit FROM plans WHERE id = memberships.plan_id) AS plan_class_limit`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Membresía no encontrada" });
    const mem = r.rows[0];

    // ── Email: membership activated ──────────────────────────────────────
    try {
      const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [mem.user_id]);
      if (uRes.rows[0]) {
        const u = uRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendMembershipActivated({
            to: u.email,
            name: u.display_name || "Alumna",
            planName: mem.plan_name || mem.plan_name_override || "Tu membresía",
            startDate: mem.start_date,
            endDate: mem.end_date,
            classLimit: mem.plan_class_limit ?? mem.class_limit_override ?? null,
          }).catch((e) => console.error("[Email] membership activate:", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "membership_activated",
          phone: u.phone,
          vars: {
            name: u.display_name || "Alumna",
            plan: mem.plan_name || mem.plan_name_override || "tu plan",
            startDate: mem.start_date ? new Date(mem.start_date).toLocaleDateString("es-MX") : "",
            endDate: mem.end_date ? new Date(mem.end_date).toLocaleDateString("es-MX") : "",
          },
          fallbackMessage: `Hola ${u.display_name || "Alumna"}, tu membresía ${mem.plan_name || mem.plan_name_override || ""} ya está activa.`,
        }).catch((e) => console.error("[WA] membership activate:", e.message));
      }
    } catch (emailErr) {
      console.error("[Email] activate query:", emailErr.message);
    }

    triggerWalletPassSync(mem.user_id, "membership_activated");
    return res.json({ data: mem });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/memberships/:id/cancel
app.put("/api/memberships/:id/cancel", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE memberships SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Membresía no encontrada" });
    triggerWalletPassSync(r.rows[0].user_id, "membership_cancelled");
    return res.json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/memberships/:id — update any field
app.put("/api/memberships/:id", adminMiddleware, async (req, res) => {
  try {
    const { status, classesRemaining, endDate, paymentMethod } = req.body;
    const r = await pool.query(
      `UPDATE memberships SET
         status = COALESCE($1, status),
         classes_remaining = COALESCE($2, classes_remaining),
         end_date = COALESCE($3, end_date),
         payment_method = COALESCE($4, payment_method),
         updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [status || null, classesRemaining ?? null, endDate || null, paymentMethod || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Membresía no encontrada" });
    triggerWalletPassSync(r.rows[0].user_id, "membership_updated");
    return res.json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Plans admin CRUD ────────────────────────────────────────────────────────

// GET /api/plans — public
// (Already exists above as GET /api/plans)

// POST /api/plans — admin (mirror of /api/admin/plans)
// PUT /api/plans/:id
app.put("/api/plans/:id", adminMiddleware, async (req, res) => {
  try {
    const {
      name, description, price, currency, durationDays, classLimit, classCategory,
      features, isActive, sortOrder, isNonTransferable, isNonRepeatable, repeatKey,
      ringConstanciaGoal, ringEsfuerzoGoal, ringConexionGoal, rewardDescription,
    } = req.body;
    const validCats = ["barre", "jumping", "pilates", "mixto", "all"];
    const cat = validCats.includes(classCategory) ? classCategory : null;
    const nonTransferable = parseBooleanFlag(isNonTransferable ?? req.body.is_non_transferable);
    const nonRepeatable = parseBooleanFlag(isNonRepeatable ?? req.body.is_non_repeatable);
    const safeRepeatKey = nonRepeatable
      ? String(repeatKey ?? req.body.repeat_key ?? "").trim() || null
      : null;
    // features can be array or comma-string — always store as jsonb array
    const featuresArr = Array.isArray(features)
      ? features
      : typeof features === "string" && features.trim()
        ? features.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const r = await pool.query(
      `UPDATE plans SET name=$1, description=$2, price=$3, currency=$4, duration_days=$5,
       class_limit=$6, features=$7, is_active=$8, sort_order=$9,
       class_category=COALESCE($10, class_category),
       is_non_transferable=$11, is_non_repeatable=$12, repeat_key=$13,
       ring_constancia_goal=$14, ring_esfuerzo_goal=$15, ring_conexion_goal=$16,
       reward_description=$17, updated_at=NOW()
       WHERE id=$18 RETURNING *`,
      [
        name,
        description || null,
        price,
        currency || "MXN",
        durationDays || 30,
        classLimit ?? null,
        JSON.stringify(featuresArr),
        isActive !== false,
        sortOrder || 0,
        cat,
        nonTransferable,
        nonRepeatable,
        safeRepeatKey,
        Math.max(1, Number(ringConstanciaGoal ?? req.body.ring_constancia_goal ?? 1)),
        Math.max(1, Number(ringEsfuerzoGoal ?? req.body.ring_esfuerzo_goal ?? 1)),
        Math.max(1, Number(ringConexionGoal ?? req.body.ring_conexion_goal ?? 10)),
        rewardDescription ?? req.body.reward_description ?? null,
        req.params.id,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    console.error("[PUT /plans]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/plans/:id
app.delete("/api/plans/:id", adminMiddleware, async (req, res) => {
  const cascade = parseBooleanFlag(
    req.query?.cascade ?? req.query?.purgeRelated ?? req.body?.cascade ?? req.body?.purgeRelated
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (cascade) {
      await client.query(
        `UPDATE memberships
            SET order_id = NULL
          WHERE order_id IN (SELECT id FROM orders WHERE plan_id = $1)`,
        [req.params.id]
      ).catch(() => {});
      await client.query("DELETE FROM discount_codes WHERE plan_id = $1", [req.params.id]).catch(() => {});
      await client.query("DELETE FROM memberships WHERE plan_id = $1", [req.params.id]).catch(() => {});
      await client.query("DELETE FROM orders WHERE plan_id = $1", [req.params.id]).catch(() => {});
    }

    const del = await client.query("DELETE FROM plans WHERE id = $1 RETURNING id", [req.params.id]);
    if (!del.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Plan no encontrado" });
    }

    await client.query("COMMIT");
    if (cascade) {
      return res.json({ message: "Plan y datos relacionados eliminados" });
    }
    return res.json({ message: "Plan eliminado" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (!cascade && err?.code === "23503") {
      try {
        await pool.query("UPDATE plans SET is_active = false, updated_at = NOW() WHERE id = $1", [req.params.id]);
        return res.json({ message: "Plan desactivado (tiene registros asociados)" });
      } catch (softErr) {
        console.error("[DELETE /plans soft-delete]", softErr?.message || softErr);
      }
    }
    console.error("[DELETE /plans]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// POST /api/plans
app.post("/api/plans", adminMiddleware, async (req, res) => {
  try {
    const {
      name, description, price, currency = "MXN", durationDays = 30, classLimit,
      classCategory, features, isActive = true, sortOrder = 0,
      isNonTransferable, isNonRepeatable, repeatKey,
      ringConstanciaGoal, ringEsfuerzoGoal, ringConexionGoal, rewardDescription,
    } = req.body;
    if (!name) return res.status(400).json({ message: "Nombre requerido" });
    const validCats = ["barre", "jumping", "pilates", "mixto", "all"];
    const cat = validCats.includes(classCategory) ? classCategory : "all";
    const nonTransferable = parseBooleanFlag(isNonTransferable ?? req.body.is_non_transferable);
    const nonRepeatable = parseBooleanFlag(isNonRepeatable ?? req.body.is_non_repeatable);
    const safeRepeatKey = nonRepeatable
      ? String(repeatKey ?? req.body.repeat_key ?? "").trim() || null
      : null;
    const featuresArr = Array.isArray(features)
      ? features
      : typeof features === "string" && features.trim()
        ? features.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const r = await pool.query(
      `INSERT INTO plans
        (name, description, price, currency, duration_days, class_limit, class_category, features, is_active, sort_order, is_non_transferable, is_non_repeatable, repeat_key, ring_constancia_goal, ring_esfuerzo_goal, ring_conexion_goal, reward_description)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [
        name,
        description || null,
        price || 0,
        currency,
        durationDays,
        classLimit ?? null,
        cat,
        JSON.stringify(featuresArr),
        isActive,
        sortOrder,
        nonTransferable,
        nonRepeatable,
        safeRepeatKey,
        Math.max(1, Number(ringConstanciaGoal ?? req.body.ring_constancia_goal ?? 1)),
        Math.max(1, Number(ringEsfuerzoGoal ?? req.body.ring_esfuerzo_goal ?? 1)),
        Math.max(1, Number(ringConexionGoal ?? req.body.ring_conexion_goal ?? 10)),
        rewardDescription ?? req.body.reward_description ?? null,
      ]
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    console.error("[POST /plans]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Bookings admin ──────────────────────────────────────────────────────────

// GET /api/bookings — admin sees all
app.get("/api/bookings", adminMiddleware, async (req, res) => {
  try {
    const { status, classId, limit = 100 } = req.query;
    let q = `SELECT b.*, u.display_name AS user_name, (c.date || 'T' || c.start_time) AS start_time, ct.name AS class_name
             FROM bookings b
             LEFT JOIN users u ON b.user_id = u.id
             LEFT JOIN classes c ON b.class_id = c.id
             LEFT JOIN class_types ct ON c.class_type_id = ct.id
             WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); q += ` AND b.status = $${params.length}`; }
    if (classId) { params.push(classId); q += ` AND b.class_id = $${params.length}`; }
    params.push(parseInt(limit)); q += ` ORDER BY b.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(q, params);
    return res.json({ data: r.rows.map(b => ({ ...b, userName: b.user_name, className: b.class_name, startTime: b.start_time })) });
  } catch (err) {
    console.error("GET /bookings error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/bookings/assign — admin assigns a class booking to a specific member
app.post("/api/admin/bookings/assign", adminMiddleware, async (req, res) => {
  const { classId, userId } = req.body;
  if (!classId || !userId) return res.status(400).json({ message: "classId y userId requeridos" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const classRes = await client.query(
      `SELECT c.id, c.max_capacity, c.current_bookings, c.status, ct.category AS class_category
       FROM classes c
       JOIN class_types ct ON c.class_type_id = ct.id
       WHERE c.id = $1
       FOR UPDATE`,
      [classId]
    );
    if (classRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada" });
    }
    const cls = classRes.rows[0];
    if (cls.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Esta clase fue cancelada" });
    }

    const clsCategory = normalizeClassCategory(cls.class_category, "all");
    const membership = await selectMembershipForClass({
      userId,
      classCategory: clsCategory,
      client,
    });
    if (!membership) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "La clienta no tiene membresía activa con créditos para esta clase" });
    }

    const lockedMembershipRes = await client.query(
      "SELECT id, classes_remaining FROM memberships WHERE id = $1 FOR UPDATE",
      [membership.id]
    );
    const lockedMembership = lockedMembershipRes.rows[0];
    if (!lockedMembership) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No se encontró una membresía válida para esta clase" });
    }

    if (!isMembershipCategoryCompatible(membership.class_category, clsCategory)) {
      await client.query("ROLLBACK");
      const label = clsCategory === "jumping" ? "Jumping" : clsCategory === "pilates" ? "Pilates" : "esta";
      return res.status(403).json({
        message: `La membresía de la clienta no incluye clases de ${label}.`,
      });
    }

    if (!isUnlimitedClasses(lockedMembership.classes_remaining) && Number(lockedMembership.classes_remaining) <= 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "La clienta ya no tiene clases disponibles en su membresía.",
      });
    }

    const dupRes = await client.query(
      "SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled'",
      [classId, userId]
    );
    if (dupRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "La clienta ya tiene una reserva para esta clase" });
    }

    const isWaitlist = cls.current_bookings >= cls.max_capacity;
    const bookingStatus = isWaitlist ? "waitlist" : "confirmed";
    const result = await client.query(
      `INSERT INTO bookings (class_id, user_id, membership_id, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [classId, userId, membership.id, bookingStatus]
    );

    if (!isWaitlist) {
      await client.query(
        "UPDATE classes SET current_bookings = current_bookings + 1 WHERE id = $1",
        [classId]
      );
      if (!isUnlimitedClasses(lockedMembership.classes_remaining)) {
        await client.query(
          "UPDATE memberships SET classes_remaining = GREATEST(classes_remaining - 1, 0), updated_at = NOW() WHERE id = $1",
          [membership.id]
        );
      }
    }
    await client.query("COMMIT");

    try {
      const userRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [userId]);
      const classFullRes = await pool.query(
        `SELECT c.date, c.start_time, ct.name AS class_type_name,
                i.display_name AS instructor_name
         FROM classes c
         JOIN class_types ct ON c.class_type_id = ct.id
         LEFT JOIN instructors i ON c.instructor_id = i.id
         WHERE c.id = $1`,
        [classId]
      );
      const memAfter = await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [membership.id]);
      const classesLeft = memAfter.rows[0]?.classes_remaining ?? null;

      if (userRes.rows[0] && classFullRes.rows[0]) {
        const u = userRes.rows[0];
        const cl = classFullRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendBookingConfirmed({
            to: u.email,
            name: u.display_name || "Alumna",
            className: cl.class_type_name,
            date: cl.date,
            startTime: cl.start_time,
            instructor: cl.instructor_name,
            classesLeft,
            isWaitlist,
          }).catch((e) => console.error("[Email] booking confirmed (admin):", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "booking_confirmed",
          phone: u.phone,
          vars: {
            name: u.display_name || "Alumna",
            class: cl.class_type_name || "Clase",
            date: cl.date ? new Date(cl.date).toLocaleDateString("es-MX") : "",
            time: cl.start_time ? String(cl.start_time).slice(0, 5) : "",
          },
          fallbackMessage: isWaitlist
            ? `Hola ${u.display_name || "Alumna"}, quedaste en lista de espera para ${cl.class_type_name || "tu clase"} (${cl.date || ""} ${String(cl.start_time || "").slice(0, 5)}).`
            : `Hola ${u.display_name || "Alumna"}, tu reserva para ${cl.class_type_name || "tu clase"} (${cl.date || ""} ${String(cl.start_time || "").slice(0, 5)}) está confirmada.`,
        }).catch((e) => console.error("[WA] booking confirmed (admin):", e.message));
      }
    } catch (emailErr) {
      console.error("[Email] booking confirmed (admin) query error:", emailErr.message);
    }

    const message = isWaitlist
      ? "Clienta agregada a lista de espera"
      : "Reserva asignada correctamente";
    triggerWalletPassSync(userId, isWaitlist ? "admin_booking_waitlist_created" : "admin_booking_created");
    return res.status(201).json({ message, data: { booking: result.rows[0], isWaitlist } });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("POST /admin/bookings/assign error:", err);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// PUT /api/bookings/:id/check-in
app.put("/api/bookings/:id/check-in", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Reserva no encontrada" });
    const booking = r.rows[0];
    // Award loyalty points for attending a class
    if (booking.user_id) {
      try {
        const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
        const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
        const pts = cfg.points_per_class ?? 10;
        if (cfg.enabled !== false && pts > 0) {
          await pool.query(
            "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, 'Clase asistida')",
            [booking.user_id, pts]
          );
        }
      } catch (e) { /* loyalty earn error shouldn't fail check-in */ }
    }
    triggerWalletPassSync(booking.user_id, "booking_checked_in");
    return res.json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/bookings/:id/no-show
app.put("/api/bookings/:id/no-show", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE bookings SET status = 'no_show' WHERE id = $1 AND status NOT IN ('cancelled','no_show') RETURNING *",
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Reserva no encontrada o ya procesada" });
    triggerWalletPassSync(r.rows[0].user_id, "booking_no_show");
    return res.json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/classes/:id/roster — lista de alumnos reservados en una clase
app.get("/api/classes/:id/roster", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.id AS booking_id, b.status, b.checked_in_at,
              u.id AS user_id, u.display_name, u.email, u.phone,
              m.plan_id, p.name AS plan_name, m.classes_remaining
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       LEFT JOIN memberships m ON b.membership_id = m.id
       LEFT JOIN plans p ON m.plan_id = p.id
       WHERE b.class_id = $1 AND b.status != 'cancelled'
       ORDER BY CASE b.status
         WHEN 'confirmed'  THEN 1
         WHEN 'checked_in' THEN 2
         WHEN 'waitlist'   THEN 3
         WHEN 'no_show'    THEN 4
         ELSE 5 END,
         u.display_name ASC`,
      [req.params.id]
    );
    // Also get class info
    const cls = await pool.query(
      `SELECT c.*, ct.name AS class_type_name, ct.color,
              i.display_name AS instructor_name,
              (c.date || 'T' || c.start_time) AS starts_at
       FROM classes c
       JOIN class_types ct ON c.class_type_id = ct.id
       JOIN instructors i ON c.instructor_id = i.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    return res.json({ data: { class: camelRow(cls.rows[0] ?? {}), roster: r.rows.map(camelRow) } });
  } catch (err) {
    console.error("[GET /classes/:id/roster]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/clients/manual — crea clienta + membresía en un solo paso (sin que use la app)
app.post("/api/admin/clients/manual", adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      displayName, email, phone, dateOfBirth,
      emergencyContactName, emergencyContactPhone, healthNotes,
      planId, paymentMethod = "cash", startDate,
      notes,
    } = req.body;
    if (!displayName || !email) return res.status(400).json({ message: "Nombre y email son requeridos" });

    await client.query("BEGIN");

    // 1. Create user (random password — they can reset later)
    const tempPassword = Math.random().toString(36).slice(2, 10) + "Op1!";
    const hash = await bcrypt.hash(tempPassword, 10);
    const userRes = await client.query(
      `INSERT INTO users (display_name, email, phone, date_of_birth, emergency_contact_name,
        emergency_contact_phone, health_notes, role, password_hash, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'client',$8,true)
       ON CONFLICT (email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         phone = EXCLUDED.phone,
         updated_at = NOW()
       RETURNING id, display_name, email`,
      [displayName, email.toLowerCase().trim(), phone || null, dateOfBirth || null,
        emergencyContactName || null, emergencyContactPhone || null, healthNotes || null, hash]
    );
    const user = userRes.rows[0];

    // 2. Assign membership if plan selected
    let membership = null;
    if (planId) {
      const planRes = await client.query("SELECT * FROM plans WHERE id = $1 AND is_active = true", [planId]);
      if (!planRes.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Plan no encontrado" }); }
      const plan = planRes.rows[0];
      const nonRepeatableConflict = await findNonRepeatablePlanConflict({ userId: user.id, plan, client });
      if (nonRepeatableConflict) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: nonRepeatableConflict.message });
      }
      const start = startDate ? new Date(startDate) : new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + plan.duration_days);
      const memRes = await client.query(
        `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date,
          classes_remaining, notes)
         VALUES ($1,$2,'active',$3,$4,$5,$6,$7) RETURNING *`,
        [user.id, plan.id, paymentMethod, start.toISOString().split("T")[0],
        end.toISOString().split("T")[0],
        plan.class_limit === 0 ? null : plan.class_limit,
        notes || `Alta manual por admin`]
      );
      membership = camelRow(memRes.rows[0]);
    }

    await client.query("COMMIT");
    if (membership?.userId || user?.id) {
      triggerWalletPassSync(membership?.userId || user.id, membership ? "admin_client_manual_with_membership" : "admin_client_manual_created");
    }
    return res.status(201).json({
      data: { user: camelRow(user), membership, tempPassword: planId ? undefined : tempPassword },
      message: planId ? "Clienta registrada y membresía activada" : "Clienta registrada",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[POST /admin/clients/manual]", err.message);
    if (err.code === "23505") return res.status(409).json({ message: "Ya existe una clienta con ese email" });
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// GET /api/admin/orders — all orders
app.get("/api/admin/orders", adminMiddleware, async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    let q = `SELECT o.*, u.display_name AS user_name, p.name AS plan_name,
                    pp.file_url AS proof_url, pp.status AS proof_status, pp.uploaded_at AS proof_uploaded_at
             FROM orders o
             LEFT JOIN users u ON o.user_id = u.id
             LEFT JOIN plans p ON o.plan_id = p.id
             LEFT JOIN payment_proofs pp ON pp.order_id = o.id
             WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); q += ` AND o.status = $${params.length}`; }
    params.push(parseInt(limit)); q += ` ORDER BY o.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(q, params);
    return res.json({
      data: r.rows.map(o => ({
        ...o,
        userName: o.user_name,
        userId: o.user_id,
        planName: o.plan_name,
        proofUrl: o.proof_url,
        proofStatus: o.proof_status,
        proofUploadedAt: o.proof_uploaded_at,
        totalAmount: o.total_amount,
        paymentMethod: o.payment_method,
        createdAt: o.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/orders/:id/verify
app.put("/api/admin/orders/:id/verify", adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!orderRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Orden no encontrada" });
    }
    let order = orderRes.rows[0];
    let justApproved = false;

    if (order.status !== "approved") {
      let plan = null;
      if (order.plan_id) {
        const planRes = await client.query("SELECT * FROM plans WHERE id = $1", [order.plan_id]);
        if (planRes.rows.length) {
          plan = planRes.rows[0];
          const nonRepeatableConflict = await findNonRepeatablePlanConflict({
            userId: order.user_id,
            plan,
            excludeOrderId: order.id,
            client,
          });
          if (nonRepeatableConflict) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: nonRepeatableConflict.message });
          }
        }
      }

      const approvedRes = await client.query(
        "UPDATE orders SET status = 'approved', verified_at = NOW(), verified_by = $1 WHERE id = $2 RETURNING *",
        [req.userId, req.params.id]
      );
      order = approvedRes.rows[0];
      justApproved = true;

      // Activate membership if this order is for a plan
      if (order.plan_id && plan && order.user_id) {
        // Option A: sum remaining credits from any active membership
        let carryOver = 0;
        const activeMemberships = await client.query(
          `SELECT id, classes_remaining FROM memberships
           WHERE user_id = $1 AND status = 'active' AND classes_remaining > 0`,
          [order.user_id]
        );
        if (activeMemberships.rows.length > 0) {
          for (const m of activeMemberships.rows) {
            carryOver += (Number(m.classes_remaining) || 0);
          }
          // Mark old memberships as renewed
          const oldIds = activeMemberships.rows.map((m) => m.id);
          await client.query(
            `UPDATE memberships SET status = 'cancelled', cancellation_reason = 'Renovación: créditos transferidos a nueva membresía', cancelled_at = NOW(), end_date = NOW()
             WHERE id = ANY($1::uuid[])`,
            [oldIds]
          );
        }

        const newCredits = (plan.class_limit ?? 0) + carryOver;
        const end = new Date();
        end.setDate(end.getDate() + (plan.duration_days || 30));

        // Check if membership already exists for this order (upsert manually for partial unique index)
        const existing = await client.query(
          `SELECT id FROM memberships WHERE order_id = $1`, [order.id]
        );
        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE memberships SET status = 'active', classes_remaining = $1 WHERE order_id = $2`,
            [newCredits, order.id]
          );
        } else {
          await client.query(
            `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, order_id)
             VALUES ($1,$2,'active',$3,NOW(),$4,$5,$6)`,
            [order.user_id, order.plan_id, order.payment_method || "transfer", end.toISOString(), newCredits, order.id]
          );
        }
      }

      if (order.discount_code_id) {
        await incrementDiscountUsage(order.discount_code_id, client);
      }
    }

    await client.query("COMMIT");

    let plan = null;
    if (order.plan_id) {
      const planRes = await pool.query("SELECT * FROM plans WHERE id = $1", [order.plan_id]);
      if (planRes.rows.length) plan = planRes.rows[0];
    }

    // Email: membership activated
    if (justApproved && order.user_id && plan) {
      try {
        const end = new Date();
        end.setDate(end.getDate() + (plan.duration_days || 30));
        const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [order.user_id]);
        if (uRes.rows[0]) {
          const u = uRes.rows[0];
          if (await areEmailNotificationsEnabled()) {
            sendMembershipActivated({
              to: u.email,
              name: u.display_name || "Alumna",
              planName: plan.name,
              startDate: new Date().toISOString(),
              endDate: end.toISOString(),
              classLimit: plan.class_limit ?? null,
            }).catch((e) => console.error("[Email] admin order verify:", e.message));
          }
          sendConfiguredWhatsAppTemplate({
            templateKey: "membership_activated",
            phone: u.phone,
            vars: {
              name: u.display_name || "Alumna",
              plan: plan.name || "tu plan",
              startDate: new Date().toLocaleDateString("es-MX"),
              endDate: end.toLocaleDateString("es-MX"),
            },
            fallbackMessage: `Hola ${u.display_name || "Alumna"}, tu membresía ${plan.name || ""} ya está activa.`,
          }).catch((e) => console.error("[WA] admin order verify:", e.message));
        }
      } catch (emailErr) {
        console.error("[Email] admin order verify query:", emailErr.message);
      }
    }

    // Award loyalty points for purchase
    if (justApproved && order.user_id && order.total_amount > 0) {
      try {
        const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
        const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
        const pts = Math.floor((order.total_amount || 0) * (cfg.points_per_peso ?? 1));
        if (cfg.enabled !== false && pts > 0) {
          await pool.query(
            "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
            [order.user_id, pts, `Compra aprobada — $${order.total_amount}`]
          );
        }
      } catch (e) { /* loyalty earn error shouldn't fail verify */ }
    }

    if (order.user_id) {
      triggerWalletPassSync(order.user_id, justApproved ? "order_verified" : "order_verify_retrigger");
    }
    return res.json({ data: order });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("PUT /admin/orders/:id/verify error:", err);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    return res.status(status).json({ message: "Error al aprobar la orden" });
  } finally {
    client.release();
  }
});

// PUT /api/admin/orders/:id/reject
app.put("/api/admin/orders/:id/reject", adminMiddleware, async (req, res) => {
  try {
    const { notes, reason } = req.body;
    const rejectionReason = reason || notes || "No especificado";
    const r = await pool.query(
      "UPDATE orders SET status = 'rejected', verified_at = NOW(), notes = $2 WHERE id = $1 RETURNING *, user_id",
      [req.params.id, rejectionReason]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Orden no encontrada" });
    const order = r.rows[0];

    // Notify the client about rejection via email and WhatsApp
    try {
      const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [order.user_id]);
      if (uRes.rows.length) {
        const u = uRes.rows[0];
        const userName = u.display_name || "Clienta";
        const rejMsg = `Hola ${userName} 👋\n\nTu comprobante de pago fue revisado y lamentablemente *no pudo ser aprobado*.\n\n📌 Motivo: ${rejectionReason}\n\nSi crees que es un error o tienes dudas, responde este mensaje. ¡Estamos para ayudarte! 💜`;

        // WhatsApp notification
        if (u.phone) {
          try {
            await sendConfiguredWhatsAppTemplate({
              templateKey: "transfer_rejected",
              phone: u.phone,
              vars: {
                name: userName,
                reason: rejectionReason,
              },
              fallbackMessage: rejMsg,
            });
          } catch (waErr) {
            console.error("[Reject WhatsApp]", waErr.response?.data || waErr.message);
          }
        }

        // Email notification
        if (u.email) {
          try {
            const { sendOrderRejected } = await import("./emailService.js").catch(() => ({}));
            if (typeof sendOrderRejected === "function") {
              await sendOrderRejected({ to: u.email, name: userName, reason: rejectionReason });
            }
          } catch (emailErr) {
            console.error("[Reject Email]", emailErr.message);
          }
        }
      }
    } catch (notifyErr) {
      console.error("[Reject notify]", notifyErr.message);
    }

    return res.json({ data: order });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Payments admin ──────────────────────────────────────────────────────────

// GET /api/payments
app.get("/api/payments", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, limit = 200 } = req.query;
    const params = [];
    let startIdx = null;
    let endIdx = null;
    if (startDate) { params.push(startDate); startIdx = params.length; }
    if (endDate) { params.push(endDate); endIdx = params.length; }
    // Include approved orders AND manually-assigned memberships
    let q = `
      SELECT
        o.id,
        o.user_id,
        u.display_name AS user_name,
        p.name AS plan_name,
        o.total_amount,
        o.payment_method AS method,
        o.status::text AS status,
        o.created_at,
        'order' AS source
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN plans p ON o.plan_id = p.id
      WHERE o.status = 'approved'`;
    if (startIdx) q += ` AND o.created_at >= $${startIdx}`;
    if (endIdx) q += ` AND o.created_at <= $${endIdx}`;

    // Also fetch memberships assigned directly (cash/card/transfer)
    let mq = `
      SELECT
        m.id,
        m.user_id,
        u.display_name AS user_name,
        p.name AS plan_name,
        p.price AS total_amount,
        m.payment_method AS method,
        m.status::text AS status,
        m.created_at,
        'membership' AS source
      FROM memberships m
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE m.status = 'active'`;
    if (startIdx) mq += ` AND m.created_at >= $${startIdx}`;
    if (endIdx) mq += ` AND m.created_at <= $${endIdx}`;

    const combined = `(${q}) UNION ALL (${mq}) ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    const r = await pool.query(combined, params);
    const total = r.rows.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
    return res.json({ data: r.rows.map((o) => ({ ...o, userName: o.user_name, planName: o.plan_name })), total });
  } catch (err) {
    console.error("[GET /payments]", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Discount codes admin CRUD ───────────────────────────────────────────────

// GET /api/discount-codes
app.get("/api/discount-codes", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT dc.*, p.name AS plan_name
       FROM discount_codes dc
       LEFT JOIN plans p ON p.id = dc.plan_id
       ORDER BY dc.created_at DESC`
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/discount-codes
app.post("/api/discount-codes", adminMiddleware, async (req, res) => {
  try {
    const {
      code,
      discountType = "percent",
      discountValue,
      maxUses,
      expiresAt,
      minOrderAmount,
      minPurchaseAmount,
      planId,
      classCategory,
      channel,
      isActive = true,
    } = req.body;
    if (!code || !discountValue) return res.status(400).json({ message: "Código y valor requeridos" });
    const normalizedType = normalizeDiscountType(discountType);
    if (!normalizedType) return res.status(400).json({ message: "Tipo de descuento inválido" });
    const normalizedMinOrder = Number(minOrderAmount ?? minPurchaseAmount ?? 0) || 0;
    const normalizedCategory =
      classCategory === undefined || classCategory === null || classCategory === ""
        ? null
        : normalizeClassCategory(classCategory, "__invalid__");
    if (normalizedCategory === "__invalid__") {
      return res.status(400).json({ message: "Categoría inválida. Usa: all, jumping, pilates o mixto." });
    }
    const normalizedChannel =
      channel === undefined || channel === null || channel === ""
        ? "all"
        : normalizeDiscountChannel(channel, "__invalid__");
    if (normalizedChannel === "__invalid__") {
      return res.status(400).json({ message: "Canal inválido. Usa: all, membership, pos o event." });
    }
    if (planId) {
      const planExists = await pool.query("SELECT id FROM plans WHERE id = $1", [planId]);
      if (!planExists.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    }
    const r = await pool.query(
      `INSERT INTO discount_codes (
         code, discount_type, discount_value, max_uses, expires_at,
         min_order_amount, plan_id, class_category, channel, is_active
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        code.toUpperCase(),
        normalizedType,
        discountValue,
        maxUses || null,
        expiresAt || null,
        normalizedMinOrder,
        planId || null,
        normalizedCategory,
        normalizedChannel,
        isActive,
      ]
    );
    const enriched = await pool.query(
      `SELECT dc.*, p.name AS plan_name
       FROM discount_codes dc
       LEFT JOIN plans p ON p.id = dc.plan_id
       WHERE dc.id = $1`,
      [r.rows[0].id]
    );
    return res.status(201).json({ data: camelRow(enriched.rows[0]) });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Código ya existe" });
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/discount-codes/:id
app.put("/api/discount-codes/:id", adminMiddleware, async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      maxUses,
      expiresAt,
      minOrderAmount,
      minPurchaseAmount,
      planId,
      classCategory,
      channel,
      isActive,
    } = req.body;
    const normalizedType = normalizeDiscountType(discountType);
    if (!normalizedType) return res.status(400).json({ message: "Tipo de descuento inválido" });
    const normalizedMinOrder = Number(minOrderAmount ?? minPurchaseAmount ?? 0) || 0;
    const normalizedCategory =
      classCategory === undefined || classCategory === null || classCategory === ""
        ? null
        : normalizeClassCategory(classCategory, "__invalid__");
    if (normalizedCategory === "__invalid__") {
      return res.status(400).json({ message: "Categoría inválida. Usa: all, jumping, pilates o mixto." });
    }
    const normalizedChannel =
      channel === undefined || channel === null || channel === ""
        ? "all"
        : normalizeDiscountChannel(channel, "__invalid__");
    if (normalizedChannel === "__invalid__") {
      return res.status(400).json({ message: "Canal inválido. Usa: all, membership, pos o event." });
    }
    if (planId) {
      const planExists = await pool.query("SELECT id FROM plans WHERE id = $1", [planId]);
      if (!planExists.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    }
    const r = await pool.query(
      `UPDATE discount_codes SET code=$1, discount_type=$2, discount_value=$3, max_uses=$4,
       expires_at=$5, min_order_amount=$6, plan_id=$7, class_category=$8, channel=$9, is_active=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [
        code?.toUpperCase(),
        normalizedType,
        discountValue,
        maxUses || null,
        expiresAt || null,
        normalizedMinOrder,
        planId || null,
        normalizedCategory,
        normalizedChannel,
        isActive !== false,
        req.params.id,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Código no encontrado" });
    const enriched = await pool.query(
      `SELECT dc.*, p.name AS plan_name
       FROM discount_codes dc
       LEFT JOIN plans p ON p.id = dc.plan_id
       WHERE dc.id = $1`,
      [r.rows[0].id]
    );
    return res.json({ data: camelRow(enriched.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/discount-codes/:id
app.delete("/api/discount-codes/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM discount_codes WHERE id = $1", [req.params.id]);
    return res.json({ message: "Código eliminado" });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Products CRUD (POS) ─────────────────────────────────────────────────────

// GET /api/products
app.get("/api/products", adminMiddleware, async (req, res) => {
  try {
    const { search = "", active } = req.query;
    let q = "SELECT * FROM products WHERE 1=1";
    const params = [];
    if (search) { params.push(`%${search}%`); q += ` AND name ILIKE $${params.length}`; }
    if (active !== undefined) {
      params.push(String(active) === "true");
      q += ` AND is_active = $${params.length}`;
    }
    q += " ORDER BY created_at DESC";
    const r = await pool.query(q, params);
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/products
app.post("/api/products", adminMiddleware, async (req, res) => {
  try {
    const { name, price, category, stock = 0, sku } = req.body;
    const isActive = parseBooleanFlag(req.body?.isActive ?? req.body?.is_active ?? true);
    if (!name) return res.status(400).json({ message: "Nombre requerido" });
    const r = await pool.query(
      "INSERT INTO products (name, price, category, stock, sku, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [name, price || 0, category || "accesorios", stock, sku || null, isActive]
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/products/:id
app.put("/api/products/:id", adminMiddleware, async (req, res) => {
  try {
    const { name, price, category, stock, sku } = req.body;
    const isActive = parseBooleanFlag(req.body?.isActive ?? req.body?.is_active ?? true);
    const r = await pool.query(
      "UPDATE products SET name=$1, price=$2, category=$3, stock=$4, sku=$5, is_active=$6, updated_at=NOW() WHERE id=$7 RETURNING *",
      [name, price, category, stock, sku || null, isActive, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Producto no encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/products/:id
app.delete("/api/products/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
    return res.json({ message: "Producto eliminado" });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/pos/sale — POS transaction
app.post("/api/pos/sale", adminMiddleware, async (req, res) => {
  try {
    const { userId, items, paymentMethod = "efectivo", discountCode } = req.body;
    const result = await processPosSale({ userId, items, paymentMethod, discountCode });
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    return res.status(201).json({ data: result.data });
  } catch (err) {
    console.error("POST /pos/sale error:", err);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    return res.status(status).json({ message: err?.message || "Error interno" });
  }
});

// ─── Loyalty admin ───────────────────────────────────────────────────────────

// GET /api/admin/loyalty/users — list users with points
app.get("/api/admin/loyalty/users", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id, u.display_name, u.email,
              COALESCE(SUM(CASE WHEN lt.type='earn' THEN lt.points ELSE -lt.points END), 0) AS balance
       FROM users u
       LEFT JOIN loyalty_transactions lt ON lt.user_id = u.id
       WHERE u.role = 'client'
       GROUP BY u.id ORDER BY balance DESC LIMIT 50`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/loyalty/adjust — manual points adjustment
app.post("/api/admin/loyalty/adjust", adminMiddleware, async (req, res) => {
  try {
    const { userId, points, reason, type = "earn" } = req.body;
    if (!userId || !points) return res.status(400).json({ message: "userId y points requeridos" });
    const r = await pool.query(
      "INSERT INTO loyalty_transactions (user_id, type, points, description, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [userId, type, Math.abs(points), reason || "Ajuste manual", req.userId]
    );
    triggerWalletPassSync(userId, "loyalty_adjust");
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/loyalty/recalculate/:userId — award missing membership points retroactively
app.post("/api/admin/loyalty/recalculate/:userId", adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    // Get loyalty config
    const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
    const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
    const ppp = Number(cfg.points_per_peso ?? 1);
    if (cfg.enabled === false) return res.json({ data: { awarded: 0, message: "Loyalty desactivado en configuración" } });

    // Get all active/expired memberships for this user
    const mRes = await pool.query(
      `SELECT m.id, p.price, p.name
       FROM memberships m
       JOIN plans p ON m.plan_id = p.id
       WHERE m.user_id = $1 AND m.status IN ('active','expired')`,
      [userId]
    );
    if (!mRes.rows.length) return res.json({ data: { awarded: 0, message: "No hay membresías para recalcular" } });

    // Check which memberships already have a loyalty transaction
    const txRes = await pool.query(
      "SELECT description FROM loyalty_transactions WHERE user_id=$1 AND type='earn'",
      [userId]
    );
    const existingDescs = new Set(txRes.rows.map((r) => r.description));

    let awarded = 0;
    for (const m of mRes.rows) {
      const desc = `Membresía asignada — ${m.name} ($${m.price})`;
      // Skip if already awarded for this membership (by description match)
      if (existingDescs.has(desc)) continue;
      const pts = Math.floor(parseFloat(m.price) * ppp);
      if (pts <= 0) continue;
      await pool.query(
        "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
        [userId, pts, desc]
      );
      awarded += pts;
    }

    if (awarded > 0) {
      triggerWalletPassSync(userId, "loyalty_recalculate");
    }
    return res.json({ data: { awarded, message: awarded > 0 ? `Se otorgaron ${awarded} puntos retroactivos` : "Todos los puntos ya estaban registrados" } });
  } catch (err) {
    console.error("[Recalculate loyalty]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Instructors / Staff ─────────────────────────────────────────────────────

// GET /api/instructors
app.get("/api/instructors", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM instructors ORDER BY created_at DESC");
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/instructors
app.post("/api/instructors", adminMiddleware, async (req, res) => {
  try {
    const { displayName, email, phone, bio, specialties, isActive = true, photoFocusX = 50, photoFocusY = 50 } = req.body;
    if (!displayName) return res.status(400).json({ message: "Nombre requerido" });
    const specialtiesValue = serializeSpecialtiesForDb(specialties);
    const safeFocusX = Math.max(0, Math.min(100, Number(photoFocusX || 50)));
    const safeFocusY = Math.max(0, Math.min(100, Number(photoFocusY || 50)));
    const r = await pool.query(
      "INSERT INTO instructors (display_name, email, phone, bio, specialties, is_active, photo_focus_x, photo_focus_y) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [displayName, email || null, phone || null, bio || null, specialtiesValue, isActive, safeFocusX, safeFocusY]
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/instructors/:id
app.put("/api/instructors/:id", adminMiddleware, async (req, res) => {
  try {
    const { displayName, email, phone, bio, specialties, isActive, photoFocusX = 50, photoFocusY = 50 } = req.body;
    const specialtiesValue = serializeSpecialtiesForDb(specialties);
    const safeFocusX = Math.max(0, Math.min(100, Number(photoFocusX || 50)));
    const safeFocusY = Math.max(0, Math.min(100, Number(photoFocusY || 50)));
    const r = await pool.query(
      "UPDATE instructors SET display_name=$1, email=$2, phone=$3, bio=$4, specialties=$5, is_active=$6, photo_focus_x=$7, photo_focus_y=$8, updated_at=NOW() WHERE id=$9 RETURNING *",
      [displayName, email || null, phone || null, bio || null, specialtiesValue, isActive !== false, safeFocusX, safeFocusY, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Instructor no encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/instructors/:id
app.delete("/api/instructors/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM instructors WHERE id = $1", [req.params.id]);
    return res.json({ message: "Instructor eliminado" });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/instructors/:id/photo — upload instructor photo to Google Drive
app.post("/api/instructors/:id/photo", adminMiddleware, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió archivo" });
    const instructorId = req.params.id;

    const isDriveConfigured = Boolean(
      process.env.GOOGLE_DRIVE_FOLDER_ID &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );

    let photoUrl;
    if (isDriveConfigured) {
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
          grant_type: "refresh_token",
        }),
      });
      const { access_token } = await tokenResp.json();

      const boundary = "instructor_photo_" + Date.now();
      const metadata = JSON.stringify({
        name: `instructor_${instructorId}_${Date.now()}.${req.file.originalname.split(".").pop()}`,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      });
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${req.file.mimetype}\r\n\r\n`),
        req.file.buffer,
        Buffer.from(`\r\n--${boundary}--`),
      ]);

      const uploadResp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      const uploadJson = await uploadResp.json();
      if (!uploadJson.id) throw new Error("Error al subir imagen a Drive");

      await fetch(`https://www.googleapis.com/drive/v3/files/${uploadJson.id}/permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      });

      photoUrl = `/api/drive/image/${uploadJson.id}`;
    } else {
      photoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }

    const r = await pool.query(
      "UPDATE instructors SET photo_url=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [photoUrl, instructorId]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Instructor no encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    console.error("Instructor photo upload error:", err);
    return res.status(500).json({ message: err.message || "Error al subir foto" });
  }
});

// POST /api/instructors/:id/magic-link — generate a one-time login link for an instructor
app.post("/api/instructors/:id/magic-link", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM instructors WHERE id = $1", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: "Instructor no encontrado" });
    const ins = r.rows[0];
    // Find or create a user account for this instructor
    let userRow = null;
    if (ins.email) {
      const uRes = await pool.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [ins.email]);
      if (uRes.rows.length) {
        userRow = uRes.rows[0];
      } else {
        // Create a user for the instructor
        const newU = await pool.query(
          `INSERT INTO users (email, display_name, role, is_verified) VALUES ($1, $2, 'instructor', true) RETURNING *`,
          [ins.email, ins.display_name]
        );
        userRow = newU.rows[0];
      }
    }
    if (!userRow) return res.status(400).json({ message: "El instructor necesita un email para generar magic link" });
    // Generate a short-lived JWT
    const token = jwt.sign({ userId: userRow.id, role: userRow.role, type: "magic_link" }, JWT_SECRET, { expiresIn: "24h" });
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const link = `${baseUrl}/auth/magic?token=${token}`;
    return res.json({ data: { link } });
  } catch (err) {
    console.error("magic-link error:", err);
    return res.status(500).json({ message: "Error al generar magic link" });
  }
});


// GET /api/admin/reports?startDate=&endDate=
app.get("/api/admin/reports", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const end = endDate || new Date().toISOString().slice(0, 10);

    const [revenue, newClients, bookings, topPlans] = await Promise.all([
      pool.query(
        "SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS count FROM orders WHERE status='approved' AND created_at BETWEEN $1 AND $2",
        [start, end]
      ),
      pool.query(
        "SELECT COUNT(*) FROM users WHERE role='client' AND created_at BETWEEN $1 AND $2",
        [start, end]
      ),
      pool.query(
        "SELECT COUNT(*) AS total, COUNT(CASE WHEN status='checked_in' THEN 1 END) AS attended FROM bookings WHERE created_at BETWEEN $1 AND $2",
        [start, end]
      ),
      pool.query(
        `SELECT p.name, COUNT(m.id) AS sales, SUM(o.total_amount) AS revenue
         FROM memberships m
         JOIN plans p ON m.plan_id = p.id
         LEFT JOIN orders o ON o.plan_id = p.id AND o.status = 'approved'
         WHERE m.created_at BETWEEN $1 AND $2
         GROUP BY p.name ORDER BY sales DESC LIMIT 5`,
        [start, end]
      ),
    ]);

    return res.json({
      period: { start, end },
      revenue: { total: parseFloat(revenue.rows[0].total), count: parseInt(revenue.rows[0].count) },
      newClients: parseInt(newClients.rows[0].count),
      bookings: { total: parseInt(bookings.rows[0].total), attended: parseInt(bookings.rows[0].attended) },
      topPlans: topPlans.rows,
    });
  } catch (err) {
    console.error("GET /admin/reports error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Classes admin ──────────────────────────────────────────────────────────

// GET /api/admin/classes — all scheduled classes
app.get("/api/admin/classes", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, instructorId } = req.query;
    let q = `SELECT c.*, ct.name AS class_type_name, i.display_name AS instructor_name
             FROM classes c
             LEFT JOIN class_types ct ON c.class_type_id = ct.id
             LEFT JOIN instructors i ON c.instructor_id = i.id
             WHERE 1=1`;
    const params = [];
    if (startDate) { params.push(startDate); q += ` AND c.date >= $${params.length}`; }
    if (endDate) { params.push(endDate); q += ` AND c.date <= $${params.length}`; }
    if (instructorId) { params.push(instructorId); q += ` AND c.instructor_id = $${params.length}`; }
    q += " ORDER BY c.date ASC, c.start_time ASC LIMIT 200";
    const r = await pool.query(q, params);
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/classes — create a class
app.post("/api/admin/classes", adminMiddleware, async (req, res) => {
  try {
    const { classTypeId, instructorId, startTime, endTime, capacity = 10, location, notes } = req.body;
    if (!classTypeId || !startTime) return res.status(400).json({ message: "classTypeId y startTime requeridos" });
    const r = await pool.query(
      `INSERT INTO classes (class_type_id, instructor_id, start_time, end_time, capacity, location, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled') RETURNING *`,
      [classTypeId, instructorId || null, startTime, endTime || null, capacity, location || null, notes || null]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/classes/:id
app.put("/api/admin/classes/:id", adminMiddleware, async (req, res) => {
  try {
    const { classTypeId, instructorId, startTime, endTime, capacity, status, notes } = req.body;
    const r = await pool.query(
      `UPDATE classes SET class_type_id=COALESCE($1,class_type_id), instructor_id=COALESCE($2,instructor_id),
       start_time=COALESCE($3,start_time), end_time=COALESCE($4,end_time),
       capacity=COALESCE($5,capacity), status=COALESCE($6,status), notes=COALESCE($7,notes), updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [classTypeId || null, instructorId || null, startTime || null, endTime || null, capacity || null, status || null, notes || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Clase no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/classes/:id
app.delete("/api/admin/classes/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM classes WHERE id = $1", [req.params.id]);
    return res.json({ message: "Clase eliminada" });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/classes/generate — bulk generate from schedule templates
app.post("/api/admin/classes/generate", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, instructorId } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ message: "startDate y endDate requeridos" });
    if (!instructorId) return res.status(400).json({ message: "instructorId requerido" });
    // Get schedule slots
    const slotsRes = await pool.query("SELECT * FROM schedule_templates WHERE is_active = true");
    const slots = slotsRes.rows;
    if (!slots.length) return res.status(400).json({ message: "No hay horarios configurados" });
    // Get a default class type for each label
    const classTypeRes = await pool.query("SELECT id, name, category FROM class_types WHERE is_active = true");
    const classTypes = classTypeRes.rows;
    const created = [];
    // Append T00:00:00 to parse as local midnight (not UTC)
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay(); // Mon=1..Sun=7
      const daySlots = slots.filter(s => s.day_of_week === dayOfWeek);
      for (const slot of daySlots) {
        const classDate = toDbDateString(d);
        const startTimeValue = parseTimeSlotTo24Hour(slot.time_slot);
        if (!startTimeValue) continue;
        const endTimeValue = addMinutesToTimeString(startTimeValue, 55);
        // Pick class type by label
        const label = slot.class_label?.toUpperCase();
        let ct = classTypes.find(ct => ct.category?.toLowerCase() === label?.toLowerCase());
        if (!ct) ct = classTypes[0];
        if (!ct) continue;
        // Check no duplicate
        const exists = await pool.query(
          "SELECT id FROM classes WHERE date = $1 AND start_time = $2 AND class_type_id = $3",
          [classDate, startTimeValue, ct.id]
        );
        if (exists.rows.length) continue;
        const r = await pool.query(
          `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
           VALUES ($1,$2,$3,$4,$5,10,'scheduled') RETURNING *`,
          [ct.id, instructorId, classDate, startTimeValue, endTimeValue]
        );
        created.push(r.rows[0]);
      }
    }
    return res.json({ created: created.length, data: created });
  } catch (err) {
    console.error("POST /admin/classes/generate error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/referrals
app.get("/api/admin/referrals", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rc.*, u.display_name AS user_name, u.email,
              COUNT(r2.id) AS referral_count
       FROM referral_codes rc
       LEFT JOIN users u ON rc.user_id = u.id
       LEFT JOIN referrals r2 ON r2.referral_code_id = rc.id
       GROUP BY rc.id, u.display_name, u.email
       ORDER BY referral_count DESC`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/videos — video list for admin
app.get("/api/admin/videos", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT v.*, ct.name AS class_type_name, i.display_name AS instructor_name
       FROM videos v
       LEFT JOIN class_types ct ON v.class_type_id = ct.id
       LEFT JOIN instructors i ON v.instructor_id = i.id
       ORDER BY v.created_at DESC`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/videos
app.post("/api/admin/videos", adminMiddleware, async (req, res) => {
  try {
    const { title, description, videoUrl, thumbnailUrl, classTypeId, instructorId, durationMinutes, accessType = "membership", isPublished = false, isFeatured = false, sortOrder = 0 } = req.body;
    if (!title || !videoUrl) return res.status(400).json({ message: "title y videoUrl requeridos" });
    const r = await pool.query(
      `INSERT INTO videos (title, description, video_url, thumbnail_url, class_type_id, instructor_id, duration_minutes, access_type, is_published, is_featured, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [title, description || null, videoUrl, thumbnailUrl || null, classTypeId || null, instructorId || null, durationMinutes || null, accessType, isPublished, isFeatured, sortOrder]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/videos/:id
app.put("/api/admin/videos/:id", adminMiddleware, async (req, res) => {
  try {
    const { title, description, videoUrl, thumbnailUrl, classTypeId, instructorId, durationMinutes, accessType, isPublished, isFeatured, sortOrder } = req.body;
    const r = await pool.query(
      `UPDATE videos SET title=$1, description=$2, video_url=$3, thumbnail_url=$4, class_type_id=$5,
       instructor_id=$6, duration_minutes=$7, access_type=$8, is_published=$9, is_featured=$10, sort_order=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [title, description || null, videoUrl, thumbnailUrl || null, classTypeId || null, instructorId || null, durationMinutes || null, accessType || "membership", isPublished !== false, isFeatured === true, sortOrder || 0, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Video no encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/videos/:id
app.delete("/api/admin/videos/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM videos WHERE id = $1", [req.params.id]);
    return res.json({ message: "Video eliminado" });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/reviews
app.get("/api/admin/reviews", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rv.*,
              u.display_name AS user_name,
              u.email,
              i.display_name AS instructor_name,
              ct.name AS class_type_name,
              c.date AS class_date,
              c.start_time AS class_start_time
       FROM reviews rv
       LEFT JOIN users u ON rv.user_id = u.id
       LEFT JOIN bookings b ON rv.booking_id = b.id
       LEFT JOIN classes c ON c.id = COALESCE(rv.class_id, b.class_id)
       LEFT JOIN class_types ct ON c.class_type_id = ct.id
       LEFT JOIN instructors i ON i.id = COALESCE(rv.instructor_id, c.instructor_id)
       ORDER BY rv.created_at DESC LIMIT 100`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/reviews/:id/approve
app.put("/api/admin/reviews/:id/approve", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("UPDATE reviews SET is_approved=true WHERE id=$1 RETURNING *", [req.params.id]);
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// DELETE /api/admin/reviews/:id
app.delete("/api/admin/reviews/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM reviews WHERE id = $1", [req.params.id]);
    return res.json({ message: "Reseña eliminada" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── MÓDULO DE EVENTOS ────────────────────────────────────────────────────────

/** Helper: normalize a DB row to camelCase API shape */
function mapEventRow(row) {
  const toYMD = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v.slice(0, 10);
    return new Date(v).toISOString().slice(0, 10);
  };
  const toHM = (v) => {
    if (!v) return null;
    return String(v).slice(0, 5);
  };
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    instructor: row.instructor_name,
    instructorPhoto: row.instructor_photo || null,
    date: toYMD(row.date),
    startTime: toHM(row.start_time),
    endTime: toHM(row.end_time),
    location: row.location,
    capacity: Number(row.capacity),
    registered: Number(row.registered || 0),
    price: Number(row.price || 0),
    currency: row.currency || "MXN",
    earlyBirdPrice: row.early_bird_price != null ? Number(row.early_bird_price) : null,
    earlyBirdDeadline: toYMD(row.early_bird_deadline),
    memberDiscount: Number(row.member_discount || 0),
    image: row.image || null,
    requirements: row.requirements || "",
    includes: Array.isArray(row.includes) ? row.includes : (row.includes ? JSON.parse(row.includes) : []),
    tags: Array.isArray(row.tags) ? row.tags : (row.tags ? JSON.parse(row.tags) : []),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRegRow(row) {
  return {
    id: row.id,
    userId: row.user_id || null,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    status: row.status,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method || null,
    paymentReference: row.payment_reference || null,
    hasPaymentProof: !!row.payment_proof_url,
    paymentProofFileName: row.payment_proof_file_name || null,
    transferDate: row.transfer_date ? String(row.transfer_date).slice(0, 10) : null,
    paidAt: row.paid_at || null,
    checkedIn: !!row.checked_in,
    checkedInAt: row.checked_in_at || null,
    waitlistPosition: row.waitlist_position || null,
    notes: row.notes || null,
    eventPassId: row.event_pass_id || null,
    eventPassCode: row.event_pass_code || null,
    eventPassStatus: row.event_pass_status || null,
    eventPassIssuedAt: row.event_pass_issued_at || null,
    eventPassUsedAt: row.event_pass_used_at || null,
    createdAt: row.created_at,
  };
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDecodeBase64ToText(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf8").trim();
  } catch (_) {
    return "";
  }
}

function extractScanTokens(rawCode) {
  const raw = String(rawCode || "").trim();
  if (!raw) return [];
  const tokens = new Set([raw]);
  const passCodeMatch = raw.match(/EV-[A-Z0-9-]{6,}/i);
  if (passCodeMatch) tokens.add(passCodeMatch[0].toUpperCase());
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const params = parsed.searchParams;
      ["code", "pass", "passCode", "qr", "id", "user", "userId", "token"].forEach((key) => {
        const value = params.get(key);
        if (value) tokens.add(value.trim());
      });
      parsed.pathname
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => tokens.add(part));
    } catch (_) {
      // ignore malformed URLs from third-party scanners
    }
  }
  return [...tokens].filter(Boolean);
}

function extractUserIdFromToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  if (UUID_V4_RE.test(raw)) return raw;
  const decoded = safeDecodeBase64ToText(raw);
  if (UUID_V4_RE.test(decoded)) return decoded;
  return null;
}

async function resolveEventRegistrationFromScanCode(eventId, rawCode) {
  const tokens = extractScanTokens(rawCode);
  if (!tokens.length) return null;

  for (const token of tokens) {
    const byEventPass = await pool.query(
      `SELECT er.*
         FROM event_registrations er
         JOIN event_passes ep ON ep.registration_id = er.id
        WHERE er.event_id = $1
          AND UPPER(ep.pass_code) = UPPER($2)
        LIMIT 1`,
      [eventId, token],
    );
    if (byEventPass.rows.length) {
      return { registration: byEventPass.rows[0], source: "event_pass" };
    }
  }

  for (const token of tokens) {
    if (!UUID_V4_RE.test(token)) continue;
    const byRegId = await pool.query(
      `SELECT *
         FROM event_registrations
        WHERE event_id = $1 AND id = $2
        LIMIT 1`,
      [eventId, token],
    );
    if (byRegId.rows.length) {
      return { registration: byRegId.rows[0], source: "registration_id" };
    }
  }

  for (const token of tokens) {
    const userId = extractUserIdFromToken(token);
    if (!userId) continue;
    const byUser = await pool.query(
      `SELECT *
         FROM event_registrations
        WHERE event_id = $1 AND user_id = $2 AND status != 'cancelled'
        ORDER BY CASE WHEN status = 'confirmed' THEN 0 WHEN status = 'pending' THEN 1 ELSE 2 END, created_at DESC
        LIMIT 1`,
      [eventId, userId],
    );
    if (byUser.rows.length) {
      return { registration: byUser.rows[0], source: "wallet_user_qr" };
    }
  }

  return null;
}

async function performEventCheckin({ eventId, registrationId, adminUserId, source = "manual" }) {
  const regRes = await pool.query(
    `SELECT *
       FROM event_registrations
      WHERE id = $1 AND event_id = $2
      LIMIT 1`,
    [registrationId, eventId],
  );
  if (!regRes.rows.length) {
    return { ok: false, code: "not_found", status: 404, message: "Inscripción no encontrada" };
  }
  const reg = regRes.rows[0];
  if (reg.status !== "confirmed") {
    return { ok: false, code: "not_confirmed", status: 409, message: "Solo puedes hacer check-in a inscripciones confirmadas", registration: reg };
  }
  if (reg.checked_in) {
    return { ok: true, alreadyCheckedIn: true, registration: reg, source };
  }

  const upd = await pool.query(
    `UPDATE event_registrations
        SET checked_in = true,
            checked_in_at = NOW(),
            checked_in_by = $1,
            updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [adminUserId, registrationId],
  );
  const updated = upd.rows[0];
  await markEventPassUsedByRegistration({ registrationId: updated.id }).catch(() => { });
  triggerWalletPassSync(updated.user_id, "event_checked_in");
  return { ok: true, alreadyCheckedIn: false, registration: updated, source };
}

// ── GET /api/events — Lista pública (solo published) ──────────────────────────
app.get("/api/events", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    let userId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded?.sub || decoded?.userId || null;
      } catch { }
    }
    const { type, upcoming } = req.query;
    const conditions = ["e.status = 'published'"];
    const params = [];
    if (type) { conditions.push(`e.type = $${params.length + 1}`); params.push(type); }
    if (upcoming === "true") { conditions.push(`e.date >= CURRENT_DATE`); }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const rows = await pool.query(
      `SELECT * FROM events e ${where} ORDER BY e.date ASC, e.start_time ASC`,
      params
    );
    return res.json(rows.rows.map(mapEventRow));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── GET /api/events/admin/all — Todos los eventos con inscripciones ──────────
app.get("/api/events/admin/all", adminMiddleware, async (req, res) => {
  try {
    const evRows = await pool.query(
      `SELECT * FROM events ORDER BY date DESC, start_time DESC`
    );
    const regRows = await pool.query(
      `SELECT er.*, u.display_name,
              ep.id AS event_pass_id,
              ep.pass_code AS event_pass_code,
              ep.status AS event_pass_status,
              ep.issued_at AS event_pass_issued_at,
              ep.used_at AS event_pass_used_at
         FROM event_registrations er
       LEFT JOIN users u ON er.user_id = u.id
       LEFT JOIN event_passes ep ON ep.registration_id = er.id
       ORDER BY er.created_at ASC`
    );
    const regsByEvent = {};
    for (const r of regRows.rows) {
      if (!regsByEvent[r.event_id]) regsByEvent[r.event_id] = [];
      regsByEvent[r.event_id].push(mapRegRow(r));
    }
    const events = evRows.rows.map((e) => ({
      ...mapEventRow(e),
      registrations: regsByEvent[e.id] || [],
    }));
    return res.json(events);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── GET /api/events/:id — Detalle de evento ───────────────────────────────────
app.get("/api/events/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    let userId = null;
    let isAdmin = false;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded?.sub || decoded?.userId || null;
        isAdmin = decoded?.role === "admin" || decoded?.role === "super_admin";
      } catch { }
    }
    const evRes = await pool.query("SELECT * FROM events WHERE id = $1", [req.params.id]);
    if (!evRes.rows.length) return res.status(404).json({ message: "Evento no encontrado" });
    const ev = evRes.rows[0];
    if (!isAdmin && ev.status !== "published") return res.status(404).json({ message: "Evento no disponible" });
    const result = mapEventRow(ev);
    if (userId) {
      const regRes = await pool.query(
        `SELECT er.*,
                ep.id AS event_pass_id,
                ep.pass_code AS event_pass_code,
                ep.status AS event_pass_status,
                ep.issued_at AS event_pass_issued_at,
                ep.used_at AS event_pass_used_at
           FROM event_registrations er
           LEFT JOIN event_passes ep ON ep.registration_id = er.id
          WHERE er.event_id = $1 AND er.user_id = $2 AND er.status != 'cancelled'
          LIMIT 1`,
        [req.params.id, userId]
      );
      result.myRegistration = regRes.rows.length ? mapRegRow(regRes.rows[0]) : null;
    }
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── POST /api/events — Crear evento ──────────────────────────────────────────
app.post("/api/events", adminMiddleware, async (req, res) => {
  try {
    const {
      type, title, description, instructor_name, instructor_photo,
      date, start_time, end_time, location, capacity = 12, price = 0,
      early_bird_price, early_bird_deadline, member_discount = 0,
      image, requirements = "", includes = [], tags = [],
      status = "draft",
    } = req.body;
    if (!type || !title || !description || !instructor_name || !date || !start_time || !end_time || !location) {
      return res.status(400).json({ message: "Faltan campos requeridos" });
    }
    const r = await pool.query(
      `INSERT INTO events (type, title, description, instructor_name, instructor_photo,
        date, start_time, end_time, location, capacity, price, early_bird_price,
        early_bird_deadline, member_discount, image, requirements, includes, tags,
        status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        type, title, description, instructor_name, instructor_photo || null,
        date, start_time, end_time, location, capacity, price,
        early_bird_price || null, early_bird_deadline || null, member_discount,
        image || null, requirements,
        JSON.stringify(Array.isArray(includes) ? includes.filter(Boolean) : []),
        JSON.stringify(Array.isArray(tags) ? tags.filter(Boolean) : []),
        status, req.userId,
      ]
    );
    return res.status(201).json(mapEventRow(r.rows[0]));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── PUT /api/events/:id — Actualizar evento ───────────────────────────────────
app.put("/api/events/:id", adminMiddleware, async (req, res) => {
  try {
    const allowed = [
      "type", "title", "description", "instructor_name", "instructor_photo",
      "date", "start_time", "end_time", "location", "capacity", "price",
      "early_bird_price", "early_bird_deadline", "member_discount", "image",
      "requirements", "includes", "tags", "status",
    ];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        vals.push(["includes", "tags"].includes(key) ? JSON.stringify(req.body[key]) : req.body[key]);
        sets.push(`${key} = $${vals.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ message: "Nada que actualizar" });
    vals.push(req.params.id);
    sets.push("updated_at = NOW()");
    const r = await pool.query(
      `UPDATE events SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ message: "Evento no encontrado" });
    return res.json(mapEventRow(r.rows[0]));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── DELETE /api/events/:id — Eliminar evento ──────────────────────────────────
app.delete("/api/events/:id", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM events WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: "Evento no encontrado" });
    return res.json({ message: "Evento eliminado" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── POST /api/events/:id/register — Inscribirse ───────────────────────────────
app.post("/api/events/:id/register", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { name, email, phone = "", payment_method } = req.body;
    if (!name || !email) return res.status(400).json({ message: "name y email son requeridos" });
    const evRes = await pool.query("SELECT * FROM events WHERE id = $1 AND status = 'published'", [req.params.id]);
    if (!evRes.rows.length) return res.status(404).json({ message: "Evento no disponible" });
    const ev = evRes.rows[0];

    // Check existing registration
    const existingRes = await pool.query(
      "SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2 LIMIT 1",
      [req.params.id, userId]
    );
    const existing = existingRes.rows[0];
    if (existing && existing.status !== "cancelled") {
      return res.status(400).json({ message: "Ya estás inscrito en este evento" });
    }

    // Calculate price
    let amount = Number(ev.price);
    const now = new Date();
    if (ev.early_bird_price != null && ev.early_bird_deadline) {
      const deadline = new Date(ev.early_bird_deadline);
      if (now <= deadline) amount = Number(ev.early_bird_price);
    }
    if (Number(ev.member_discount) > 0) {
      const memRes = await pool.query(
        `SELECT id FROM memberships WHERE user_id = $1 AND status = 'active' AND end_date >= CURRENT_DATE LIMIT 1`,
        [userId]
      );
      if (memRes.rows.length) {
        amount = Math.round(amount * (1 - Number(ev.member_discount) / 100));
      }
    }

    // Determine status
    const regCount = await pool.query(
      "SELECT COUNT(*) FROM event_registrations WHERE event_id = $1 AND status = 'confirmed'",
      [req.params.id]
    );
    const confirmedCount = Number(regCount.rows[0].count);
    let regStatus = "pending";
    let waitlistPosition = null;
    let paidAt = null;
    if (confirmedCount >= Number(ev.capacity)) {
      regStatus = "waitlist";
      const wlRes = await pool.query(
        "SELECT COALESCE(MAX(waitlist_position), 0) + 1 AS pos FROM event_registrations WHERE event_id = $1 AND status = 'waitlist'",
        [req.params.id]
      );
      waitlistPosition = wlRes.rows[0].pos;
    } else if (amount === 0) {
      regStatus = "confirmed";
      paidAt = new Date();
    }

    let reg;
    if (existing && existing.status === "cancelled") {
      const r = await pool.query(
        `UPDATE event_registrations SET name=$1, email=$2, phone=$3, status=$4, amount=$5,
         payment_method=$6, payment_reference=NULL, payment_proof_url=NULL,
         payment_proof_file_name=NULL, transfer_date=NULL,
         paid_at=$7, waitlist_position=$8, checked_in=false, checked_in_at=NULL, updated_at=NOW()
         WHERE id=$9 RETURNING *`,
        [name, email, phone, regStatus, amount, payment_method || null, paidAt, waitlistPosition, existing.id]
      );
      reg = r.rows[0];
    } else {
      const r = await pool.query(
        `INSERT INTO event_registrations (event_id, user_id, name, email, phone, status, amount, payment_method, paid_at, waitlist_position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.params.id, userId, name, email, phone, regStatus, amount, payment_method || null, paidAt, waitlistPosition]
      );
      reg = r.rows[0];
    }

    // Update registered count if confirmed
    if (regStatus === "confirmed") {
      await pool.query(
        "UPDATE events SET registered = (SELECT COUNT(*) FROM event_registrations WHERE event_id=$1 AND status='confirmed') WHERE id=$1",
        [req.params.id]
      );
    }

    let issuedPass = null;
    if (regStatus === "confirmed" && reg.user_id) {
      issuedPass = await ensureEventPassForRegistration({
        eventId: req.params.id,
        registrationId: reg.id,
        userId: reg.user_id,
      }).catch((passErr) => {
        console.error("[Events] pass issue on register:", passErr?.message || passErr);
        return null;
      });
    } else {
      await cancelEventPassByRegistration({ registrationId: reg.id }).catch(() => { });
    }

    let message;
    if (regStatus === "waitlist") message = `Te agregamos a la lista de espera (posición ${waitlistPosition})`;
    else if (amount === 0) message = "¡Registro confirmado! Te esperamos en el evento.";
    else if (payment_method === "cash") message = "Registro pendiente. Puedes pagar en recepción del studio para confirmar tu lugar.";
    else message = "Registro pendiente de pago. Una vez confirmado tu pago, recibirás la confirmación.";

    return res.status(201).json({
      id: reg.id,
      status: reg.status,
      amount: Number(reg.amount),
      isFree: amount === 0,
      waitlistPosition,
      passCode: issuedPass?.pass_code ?? null,
      message,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── DELETE /api/events/:id/register — Cancelar inscripción ───────────────────
app.delete("/api/events/:id/register", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const regRes = await pool.query(
      "SELECT * FROM event_registrations WHERE event_id=$1 AND user_id=$2 LIMIT 1",
      [req.params.id, userId]
    );
    if (!regRes.rows.length) return res.status(404).json({ message: "No tienes inscripción en este evento" });
    const reg = regRes.rows[0];
    if (!["confirmed", "pending", "waitlist"].includes(reg.status)) {
      return res.status(400).json({ message: "No puedes cancelar este registro" });
    }
    await pool.query(
      "UPDATE event_registrations SET status='cancelled', updated_at=NOW() WHERE id=$1",
      [reg.id]
    );
    await cancelEventPassByRegistration({ registrationId: reg.id }).catch(() => { });
    await pool.query(
      "UPDATE events SET registered = GREATEST(0, (SELECT COUNT(*) FROM event_registrations WHERE event_id=$1 AND status='confirmed')) WHERE id=$1",
      [req.params.id]
    );
    return res.json({ message: "Registro cancelado exitosamente" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── GET /api/events/:id/registrations — Inscripciones admin ──────────────────
app.get("/api/events/:id/registrations", adminMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT er.*, u.display_name,
              ep.id AS event_pass_id,
              ep.pass_code AS event_pass_code,
              ep.status AS event_pass_status,
              ep.issued_at AS event_pass_issued_at,
              ep.used_at AS event_pass_used_at
         FROM event_registrations er
       LEFT JOIN users u ON er.user_id = u.id
       LEFT JOIN event_passes ep ON ep.registration_id = er.id
       WHERE er.event_id = $1 ORDER BY er.created_at ASC`,
      [req.params.id]
    );
    return res.json(rows.rows.map(mapRegRow));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── PUT /api/events/:eventId/registrations/:regId — Actualizar status ─────────
app.put("/api/events/:eventId/registrations/:regId", adminMiddleware, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const valid = ["confirmed", "pending", "waitlist", "cancelled", "no_show"];
    if (status && !valid.includes(status)) {
      return res.status(400).json({ message: "Status inválido" });
    }
    const sets = ["updated_at=NOW()"];
    const vals = [];
    if (status) {
      vals.push(status);
      sets.push(`status=$${vals.length}`);
      if (status === "confirmed") {
        sets.push("paid_at = COALESCE(paid_at, NOW())");
      }
    }
    if (notes !== undefined) {
      vals.push(notes);
      sets.push(`notes=$${vals.length}`);
    }
    vals.push(req.params.regId);
    const r = await pool.query(
      `UPDATE event_registrations SET ${sets.join(",")} WHERE id=$${vals.length} AND event_id=$${vals.length + 1} RETURNING *`,
      [...vals, req.params.eventId]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Inscripción no encontrada" });
    // Refresh registered count
    await pool.query(
      "UPDATE events SET registered = (SELECT COUNT(*) FROM event_registrations WHERE event_id=$1 AND status='confirmed') WHERE id=$1",
      [req.params.eventId]
    );
    const updatedReg = r.rows[0];
    if (updatedReg.status === "confirmed" && updatedReg.user_id) {
      await ensureEventPassForRegistration({
        eventId: req.params.eventId,
        registrationId: updatedReg.id,
        userId: updatedReg.user_id,
      }).catch((passErr) => {
        console.error("[Events] pass issue on admin status update:", passErr?.message || passErr);
      });
    } else if (["cancelled", "no_show", "waitlist", "pending"].includes(updatedReg.status)) {
      await cancelEventPassByRegistration({ registrationId: updatedReg.id }).catch(() => { });
    }
    return res.json({ message: "Inscripción actualizada", status: r.rows[0].status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── POST /api/events/:eventId/checkin/:regId — Check-in ───────────────────────
app.post("/api/events/:eventId/checkin/:regId", adminMiddleware, async (req, res) => {
  try {
    const result = await performEventCheckin({
      eventId: req.params.eventId,
      registrationId: req.params.regId,
      adminUserId: req.userId,
      source: "manual",
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ message: result.message || "No se pudo registrar el check-in" });
    }
    return res.json({
      message: result.alreadyCheckedIn ? "Esta inscripción ya tenía check-in" : "Check-in exitoso",
      checkedIn: true,
      alreadyCheckedIn: result.alreadyCheckedIn,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── POST /api/events/:eventId/checkin/scan — Check-in por QR/código ─────────
app.post("/api/events/:eventId/checkin/scan", adminMiddleware, async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) {
      return res.status(400).json({ message: "Debes enviar un código QR para validar" });
    }

    const resolved = await resolveEventRegistrationFromScanCode(req.params.eventId, code);
    if (!resolved?.registration?.id) {
      return res.status(404).json({ message: "No se encontró una inscripción válida para este QR en el evento" });
    }

    const result = await performEventCheckin({
      eventId: req.params.eventId,
      registrationId: resolved.registration.id,
      adminUserId: req.userId,
      source: resolved.source,
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ message: result.message || "No se pudo registrar el check-in" });
    }

    return res.json({
      message: result.alreadyCheckedIn ? "La clienta ya tenía check-in registrado" : "Check-in exitoso",
      data: {
        registrationId: result.registration.id,
        name: result.registration.name,
        email: result.registration.email,
        alreadyCheckedIn: !!result.alreadyCheckedIn,
        source: resolved.source,
      },
    });
  } catch (err) {
    console.error("[Events] scan check-in error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── PUT /api/events/:id/register/payment — Enviar comprobante ─────────────────
app.put("/api/events/:id/register/payment", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { payment_method, transfer_reference, transfer_date, file_data, file_name, notes } = req.body;

    const regRes = await pool.query(
      "SELECT * FROM event_registrations WHERE event_id=$1 AND user_id=$2 AND status='pending' LIMIT 1",
      [req.params.id, userId]
    );
    if (!regRes.rows.length)
      return res.status(404).json({ message: "No tienes una inscripción pendiente en este evento" });
    const reg = regRes.rows[0];

    if (payment_method === "transfer" && !transfer_reference && !file_data) {
      return res.status(400).json({ message: "Debes proporcionar una referencia o comprobante de transferencia" });
    }

    let r;
    if (payment_method === "cash") {
      r = await pool.query(
        `UPDATE event_registrations
         SET payment_method='cash',
             payment_reference=NULL,
             payment_proof_url=NULL,
             payment_proof_file_name=NULL,
             transfer_date=NULL,
             updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [reg.id]
      );
    } else {
      r = await pool.query(
        `UPDATE event_registrations
         SET payment_method='transfer',
             payment_reference=$1,
             transfer_date=$2,
             payment_proof_url=$3,
             payment_proof_file_name=$4,
             updated_at=NOW()
         WHERE id=$5 RETURNING *`,
        [transfer_reference || null, transfer_date || null, file_data || null, file_name || null, reg.id]
      );
    }

    return res.json({
      message: payment_method === "cash"
        ? "Seleccionado pago en studio. El admin confirmará tu lugar cuando pagues en recepción."
        : "Comprobante enviado exitosamente. Tu pago será verificado pronto.",
      registration: {
        id: r.rows[0].id,
        status: r.rows[0].status,
        paymentReference: r.rows[0].payment_reference,
        hasPaymentProof: !!r.rows[0].payment_proof_url,
      },
    });
  } catch (err) {
    console.error("PUT events/register/payment error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Email test endpoint (admin only) ─────────────────────────────────────────
app.post("/api/admin/test-emails", adminMiddleware, async (req, res) => {
  const testTo = req.body.to || "saidromero19@gmail.com";
  const testName = "Said (Test)";
  const results = [];
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const jobs = [
    { label: "Membresía activada", fn: () => sendMembershipActivated({ to: testTo, name: testName, planName: "Jumping — 4 Clases", startDate: new Date().toISOString(), endDate: new Date(Date.now() + 30 * 86400000).toISOString(), classLimit: 4 }) },
    { label: "Reserva confirmada", fn: () => sendBookingConfirmed({ to: testTo, name: testName, className: "Jumping Fitness", date: new Date().toISOString(), startTime: "09:00", instructor: "Instructora Diana", classesLeft: 3, isWaitlist: false }) },
    { label: "Reserva cancelada (a tiempo)", fn: () => sendBookingCancelled({ to: testTo, name: testName, className: "Jumping Dance", date: new Date().toISOString(), startTime: "11:00", creditRestored: true, isLate: false, classesLeft: 4 }) },
    { label: "Reserva cancelada (tardía)", fn: () => sendBookingCancelled({ to: testTo, name: testName, className: "Strong Jump", date: new Date().toISOString(), startTime: "18:00", creditRestored: false, isLate: true, classesLeft: 3 }) },
    { label: "Recordatorio semanal", fn: () => sendWeeklyReminder({ to: testTo, name: testName, classesLeft: 2, endDate: new Date(Date.now() + 15 * 86400000).toISOString() }) },
    { label: "Renovación (última clase)", fn: () => sendRenewalReminder({ to: testTo, name: testName, planName: "Jumping — 4 Clases", classesLeft: 1, endDate: new Date(Date.now() + 5 * 86400000).toISOString(), reason: "last_class" }) },
    { label: "Renovación (por vencer)", fn: () => sendRenewalReminder({ to: testTo, name: testName, planName: "Pilates — Mensual Ilimitado", classesLeft: null, endDate: new Date(Date.now() + 3 * 86400000).toISOString(), reason: "expiring_soon" }) },
    { label: "Reset de contraseña", fn: () => sendPasswordResetEmail({ to: testTo, name: testName, token: "test-token-123456" }) },
  ];

  // Send one at a time with 700ms delay to respect Resend's 2 req/s limit
  for (const job of jobs) {
    try {
      await job.fn();
      results.push(`✅ ${job.label}`);
    } catch (e) {
      results.push(`❌ ${job.label}: ${e.message}`);
    }
    await delay(700);
  }

  const hasResendKey = !!process.env.RESEND_API_KEY;
  return res.json({
    message: hasResendKey
      ? `Se enviaron ${results.filter(r => r.startsWith("✅")).length} emails de prueba a ${testTo}`
      : "⚠️ RESEND_API_KEY no está configurada. Los emails NO se enviaron.",
    resendKeySet: hasResendKey,
    fromEmail: process.env.EMAIL_FROM || "onboarding@resend.dev (default)",
    results,
  });
});

// ─── Healthcheck (Railway, uptime monitors) ──────────────────────────────────
app.get("/api/health", async (_req, res) => {
  const startedAt = Date.now();
  const out = {
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    db: "unknown",
    appleWallet: isAppleWalletConfigured() ? "configured" : "fallback",
    googleWallet: isGoogleWalletConfigured() ? "configured" : "disabled",
  };
  try {
    await pool.query("SELECT 1");
    out.db = "ok";
  } catch (err) {
    out.db = "error";
    out.dbError = String(err?.message ?? err).slice(0, 160);
    res.status(503).json({ ...out, latencyMs: Date.now() - startedAt });
    return;
  }
  res.status(200).json({ ...out, latencyMs: Date.now() - startedAt });
});

// ─── Serve React SPA (static) ────────────────────────────────────────────────
const distDir = path.resolve(__dirname, "..", "dist");
const distExists = fs.existsSync(distDir);
const indexHtmlExists = fs.existsSync(path.join(distDir, "index.html"));
console.log("[Static] distDir:", distDir, "exists:", distExists, "index.html:", indexHtmlExists);
if (distExists) {
  try {
    const assetsDir = path.join(distDir, "assets");
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir).slice(0, 6);
      console.log("[Static] dist/assets sample:", files.join(", "));
    } else {
      console.warn("[Static] WARNING: dist/assets/ does not exist");
    }
  } catch (err) {
    console.warn("[Static] Could not list dist/assets:", err.message);
  }
}

app.use(express.static(distDir, {
  index: false,
  maxAge: "1h",
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".css")) res.setHeader("Content-Type", "text/css; charset=utf-8");
    else if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    else if (filePath.endsWith(".webmanifest")) res.setHeader("Content-Type", "application/manifest+json");
    else if (filePath.endsWith(".svg")) res.setHeader("Content-Type", "image/svg+xml");
  },
}));

app.get("*", (req, res) => {
  // Any unresolved API call: JSON 404, never HTML.
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ message: "API route not found", path: req.path });
  }
  // Any path under /assets/ that wasn't served by static = real 404, never SPA fallback.
  if (req.path.startsWith("/assets/")) {
    return res.status(404).type("text/plain").send("Not found");
  }
  // Any other file-like request (.css, .js, .png, .map, etc.) = real 404.
  if (/\.[a-z0-9]+$/i.test(req.path)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  // SPA fallback: send index.html (only for actual page navigations).
  if (!indexHtmlExists) {
    return res.status(503).type("text/plain").send("Frontend build missing. Check Railway build logs.");
  }
  res.sendFile(path.join(distDir, "index.html"));
});

// ─── Email Cron Jobs ─────────────────────────────────────────────────────────

/**
 * Runs every Sunday at 8:00 AM Mexico City time (UTC-6 = 14:00 UTC).
 * Sends weekly reminder to all users with an active membership.
 */
async function runWeeklyReminderCron() {
  try {
    const res = await pool.query(`
      SELECT u.email, COALESCE(u.display_name, 'Alumna') AS name,
             m.classes_remaining, m.end_date
      FROM memberships m
      JOIN users u ON m.user_id = u.id
      WHERE m.status = 'active'
        AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
    `);
    console.log(`[Cron] Weekly reminder — ${res.rows.length} members`);
    for (const row of res.rows) {
      await sendWeeklyReminder({
        to: row.email,
        name: row.name,
        classesLeft: row.classes_remaining,
        endDate: row.end_date,
      }).catch((e) => console.error("[Email] weekly cron:", e.message));
      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("[Cron] Weekly reminder error:", err.message);
  }
}

/**
 * Runs every day at 9:00 AM.
 * Sends renewal reminder to members with 1 class left OR expiring in ≤7 days.
 */
async function runRenewalReminderCron() {
  try {
    const res = await pool.query(`
      SELECT u.email, COALESCE(u.display_name, 'Alumna') AS name,
             m.classes_remaining, m.end_date,
             COALESCE(p.name, m.plan_name_override, 'Tu membresía') AS plan_name
      FROM memberships m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE m.status = 'active'
        AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
        AND (
          m.classes_remaining = 1
          OR (m.end_date IS NOT NULL AND m.end_date <= CURRENT_DATE + INTERVAL '7 days')
        )
    `);
    console.log(`[Cron] Renewal reminder — ${res.rows.length} members`);
    for (const row of res.rows) {
      const reason = row.classes_remaining === 1 ? "last_class" : "expiring_soon";
      await sendRenewalReminder({
        to: row.email,
        name: row.name,
        planName: row.plan_name,
        classesLeft: row.classes_remaining,
        endDate: row.end_date,
        reason,
      }).catch((e) => console.error("[Email] renewal cron:", e.message));
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("[Cron] Renewal reminder error:", err.message);
  }
}

function scheduleEmailCrons() {
  // Check every hour if it's time to run
  setInterval(async () => {
    const now = new Date();
    // Mexico City = UTC-6 (adjust for daylight saving if needed)
    const mexicoHour = (now.getUTCHours() - 6 + 24) % 24;
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday

    // Weekly reminder: every Sunday at 8:00 AM Mexico time
    if (dayOfWeek === 0 && mexicoHour === 8 && now.getUTCMinutes() < 60) {
      console.log("[Cron] Triggering weekly reminder...");
      runWeeklyReminderCron();
    }

    // Renewal reminder: every day at 9:00 AM Mexico time
    if (mexicoHour === 9 && now.getUTCMinutes() < 60) {
      console.log("[Cron] Triggering renewal reminder...");
      runRenewalReminderCron();
    }
  }, 60 * 60 * 1000); // every 1 hour
}

// ─── Start ───────────────────────────────────────────────────────────────────
async function bootServer() {
  await ensureSchema();
  scheduleEmailCrons();
  // Initialize Google Wallet loyalty class if configured
  ensureGoogleWalletClass().catch(() => { });
  app.listen(PORT, () => {
    console.log(`🚀 Ophelia API + Frontend → http://localhost:${PORT}`);
  });
}

bootServer().catch((err) => {
  console.error("❌ Fatal startup error:", err.message);
  process.exit(1);
});
