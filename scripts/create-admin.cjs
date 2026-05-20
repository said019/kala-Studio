#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Crea o promueve un usuario a super_admin en la BD de Kala.
 *
 *   DATABASE_URL=postgres://... node scripts/create-admin.js \
 *     [email] [password] ["Display Name"]
 *
 * - Si el email NO existe → crea el usuario con rol super_admin.
 * - Si el email YA existe → promueve a super_admin y resetea la contraseña.
 * - Si no se pasa password, genera una aleatoria de 16 chars y la imprime.
 * - Marca onboarding_completed=true para que el admin no caiga en el cuestionario.
 *
 * Nunca commitees DATABASE_URL. Pásala SOLO como variable de entorno.
 */

const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const args = process.argv.slice(2);
const [emailArg, passArg, nameArg] = args;

const email = (emailArg || "").trim().toLowerCase();
const displayName = (nameArg || "").trim();

if (!email || !displayName) {
  console.error("Uso: node scripts/create-admin.js <email> [password] \"<display name>\"");
  console.error("     Si omites <password>, se genera una aleatoria.");
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`Email inválido: ${email}`);
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL. Pasa la cadena de conexión como env var:");
  console.error("  DATABASE_URL=postgres://... node scripts/create-admin.js ...");
  process.exit(1);
}

// Genera contraseña que cumple el schema (≥8 chars, mayúscula, número).
const generatePassword = () => {
  const bytes = crypto.randomBytes(12).toString("base64").replace(/[+/=]/g, "");
  // Asegura mayúscula y número.
  return `K${bytes.slice(0, 14)}9`;
};

const password = (passArg && passArg.length >= 8) ? passArg : generatePassword();
const generated = !passArg;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const client = await pool.connect();
  try {
    // Asegura que las columnas opcionales existan (mismo patrón que server/index.js).
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`).catch(() => {});
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false`).catch(() => {});

    const hash = await bcrypt.hash(password, 12);

    const existing = await client.query("SELECT id, role FROM users WHERE email = $1", [email]);

    let action;
    let userId;
    if (existing.rows.length === 0) {
      const r = await client.query(
        `INSERT INTO users (display_name, email, phone, password_hash, role, accepts_terms, onboarding_completed)
         VALUES ($1, $2, $3, $4, 'super_admin', true, true)
         RETURNING id`,
        [displayName, email, "+520000000000", hash]
      );
      userId = r.rows[0].id;
      action = "creado";
    } else {
      const r = await client.query(
        `UPDATE users SET
           role = 'super_admin',
           password_hash = $1,
           display_name = COALESCE($2, display_name),
           onboarding_completed = true,
           updated_at = NOW()
         WHERE email = $3
         RETURNING id`,
        [hash, displayName || null, email]
      );
      userId = r.rows[0].id;
      action = `promovido (rol anterior: ${existing.rows[0].role})`;
    }

    console.log("");
    console.log("════════════════════════════════════════════════════════════");
    console.log(`  Admin ${action}`);
    console.log("════════════════════════════════════════════════════════════");
    console.log(`  ID:       ${userId}`);
    console.log(`  Email:    ${email}`);
    console.log(`  Nombre:   ${displayName}`);
    console.log(`  Rol:      super_admin`);
    if (generated) {
      console.log(`  Password: ${password}    ← guárdala, no se vuelve a mostrar`);
    } else {
      console.log(`  Password: (la que pasaste)`);
    }
    console.log("════════════════════════════════════════════════════════════");
    console.log("  Entra en /auth/login con esos datos.");
    console.log("");
  } catch (err) {
    console.error("Error:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
