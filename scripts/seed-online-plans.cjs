#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Crea los 4 planes de la biblioteca online en la tabla `plans` si no existen.
 * Marca cada uno con `includes_video_library = true` para que el control de
 * acceso a videos los reconozca.
 *
 *   DATABASE_URL=postgres://... node scripts/seed-online-plans.cjs
 *
 * Idempotente: matchea por nombre exacto. Re-ejecutarlo no duplica.
 */

const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL. Pasa la cadena como env var.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Estos espejan los datos hardcodeados en src/pages/Index.tsx (ONLINE_PLANS).
// duration_days marca la duración del acceso; class_limit alto = ilimitado
// para fines prácticos en este tipo de plan online sin reservas presenciales.
const ONLINE_PLANS = [
  { name: "Online — Mensual",    price: 350,  duration_days: 30,  sort_order: 100, description: "Acceso ilimitado a la biblioteca online por 1 mes." },
  { name: "Online — Trimestral", price: 945,  duration_days: 90,  sort_order: 101, description: "Acceso ilimitado a la biblioteca online por 3 meses. Ahorra 10%." },
  { name: "Online — Semestral",  price: 1785, duration_days: 180, sort_order: 102, description: "Acceso ilimitado a la biblioteca online por 6 meses. Ahorra 15%." },
  { name: "Online — Anual",      price: 3500, duration_days: 365, sort_order: 103, description: "Acceso ilimitado a la biblioteca online por 1 año. Ahorra 16%." },
];

(async () => {
  const client = await pool.connect();
  try {
    // Aseguramos la columna por si esta BD aún no la tiene.
    await client
      .query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS includes_video_library BOOLEAN NOT NULL DEFAULT false`)
      .catch(() => { });

    let inserted = 0;
    let updated = 0;

    for (const p of ONLINE_PLANS) {
      const existing = await client.query("SELECT id FROM plans WHERE name = $1 LIMIT 1", [p.name]);
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, is_active, sort_order, includes_video_library)
           VALUES ($1, $2, $3, 'MXN', $4, 9999, 'online', true, $5, true)`,
          [p.name, p.description, p.price, p.duration_days, p.sort_order]
        );
        inserted++;
        console.log(`  +  Insertado: ${p.name} ($${p.price})`);
      } else {
        await client.query(
          `UPDATE plans SET
             description = $1,
             price = $2,
             duration_days = $3,
             includes_video_library = true,
             is_active = true,
             sort_order = $4,
             updated_at = NOW()
           WHERE id = $5`,
          [p.description, p.price, p.duration_days, p.sort_order, existing.rows[0].id]
        );
        updated++;
        console.log(`  ~  Actualizado: ${p.name}`);
      }
    }

    console.log("");
    console.log("════════════════════════════════════════════════════════════");
    console.log(`  Planes online sincronizados`);
    console.log("════════════════════════════════════════════════════════════");
    console.log(`  Insertados: ${inserted}`);
    console.log(`  Actualizados: ${updated}`);
    console.log("");
    console.log("  Ya aparecen en /admin/videos/upload al elegir 'Por planes'.");
    console.log("");
  } catch (err) {
    console.error("Error:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
