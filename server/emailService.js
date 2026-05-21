/**
 * Kala Barre Studio — Email Service (Resend)
 * Handles all transactional emails with branded HTML templates.
 */

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Remitente. Configurable por env; el dominio debe estar verificado en Resend.
const FROM_EMAIL = process.env.EMAIL_FROM || "Kala Studio <noreply@agendafull.com.mx>";
const SITE_URL = process.env.SITE_URL || "https://kala-barre-studio.com.mx";
const LOGO_URL = `${SITE_URL}/wallet-logo-black@3x.png`;

// ─── Brand palette (Kala editorial, fondo claro) ───────────────────────────────
// Conservamos los nombres de clave (magenta/violet/lime/cream...) usados por
// los helpers; solo cambian los valores al look claro de Kala.
const B = {
  bg: "#F3E7E0",     // fondo página (blush apagado)
  card: "#FFF7F2",   // cream — fondo de la tarjeta
  border: "#E8CAC1",  // beige rosado — bordes
  purple: "#2E201C", // ink — espresso cálido
  magenta: "#76214D",  // berry — primario
  violet: "#E9745F",   // coral — acento
  lime: "#F58A24",     // naranja
  cream: "#2E201C",    // (ahora "cream" = texto oscuro; clave reutilizada en headings)
  lilac: "#FCE6E1",    // blush claro
  text: "#3B2C26",     // texto principal (ink suave)
  muted: "#8A7A72",    // gris cálido para texto secundario
};

// ─── Base layout ──────────────────────────────────────────────────────────────
function baseLayout({ preheader = "", content = "", ctaUrl = "", ctaText = "" } = {}) {
  const ctaBlock = ctaUrl
    ? `<tr><td align="center" style="padding:24px 0 8px;">
         <a href="${ctaUrl}"
            style="display:inline-block;background:linear-gradient(135deg,${B.magenta},${B.violet});
                   color:#fff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                   font-size:15px;font-weight:700;letter-spacing:.5px;
                   text-decoration:none;border-radius:50px;padding:14px 36px;">
           ${ctaText}
         </a>
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Kala Barre Studio</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${B.bg};">
  <!-- preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${preheader}&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
         style="background-color:${B.bg};min-height:100vh;">
    <tr><td align="center" style="padding:32px 16px 48px;">

      <!-- Card -->
      <table role="presentation" cellpadding="0" cellspacing="0" width="560"
             style="max-width:560px;width:100%;background-color:${B.card};
                    border:1px solid ${B.border};border-radius:20px;
                    box-shadow:0 18px 50px -24px rgba(118,33,77,.28);">

        <!-- Header gradient bar -->
        <tr><td style="height:5px;background:linear-gradient(90deg,${B.magenta},${B.violet},${B.lime});
                        border-radius:20px 20px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Logo -->
        <tr><td align="center" style="padding:34px 40px 6px;">
          <img src="${LOGO_URL}" alt="Kala Studio" width="150" height="auto"
               style="display:block;max-width:150px;" />
        </td></tr>

        <!-- Content -->
        <tr><td style="padding:8px 40px 8px;">
          ${content}
        </td></tr>

        <!-- CTA -->
        ${ctaBlock}

        <!-- Divider -->
        <tr><td style="padding:8px 40px 0;">
          <hr style="border:none;border-top:1px solid ${B.border};margin:16px 0 0;" />
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:20px 40px 32px;">
          <p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;
                    color:${B.muted};margin:0;line-height:1.6;">
            © ${new Date().getFullYear()} Kala Barre Studio · Barre<br>
            <a href="${SITE_URL}" style="color:${B.magenta};text-decoration:none;">kala-barre-studio.com.mx</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function h1(text) {
  return `<h1 style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:26px;
                      font-weight:800;color:${B.cream};margin:16px 0 8px;line-height:1.25;">${text}</h1>`;
}
function h2(text) {
  return `<h2 style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:18px;
                      font-weight:700;color:${B.violet};margin:20px 0 6px;">${text}</h2>`;
}
function p(text) {
  return `<p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;
                     color:${B.text};line-height:1.7;margin:0 0 12px;">${text}</p>`;
}
function small(text) {
  return `<p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;
                     color:${B.muted};line-height:1.6;margin:0 0 10px;">${text}</p>`;
}
function infoRow(label, value) {
  return `<tr>
    <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;
               color:${B.muted};padding:6px 0;border-bottom:1px solid ${B.border};">${label}</td>
    <td style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;
               color:${B.cream};font-weight:600;padding:6px 0 6px 12px;
               border-bottom:1px solid ${B.border};text-align:right;">${value}</td>
  </tr>`;
}
function infoTable(rows) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                  style="border-top:1px solid ${B.border};margin:16px 0 20px;">
    ${rows.join("")}
  </table>`;
}
function pill(text, color) {
  return `<span style="display:inline-block;background:${color}22;border:1px solid ${color};
                        color:${color};border-radius:50px;font-size:12px;font-weight:700;
                        padding:3px 12px;letter-spacing:.5px;">${text}</span>`;
}
function alertBox(text, color = B.magenta) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                  style="background:${color}15;border-left:4px solid ${color};
                         border-radius:8px;margin:12px 0 20px;">
    <tr><td style="padding:14px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                    font-size:14px;color:${B.cream};line-height:1.6;">${text}</td></tr>
  </table>`;
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function fmtTime(timeStr) {
  if (!timeStr) return "—";
  const t = String(timeStr).slice(0, 5);
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${suffix}`;
}

// ─── Core send function ───────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[Email] RESEND_API_KEY not set — skipping email to ${to} (${subject})`);
    return;
  }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      bcc: ["saidromero19@gmail.com"], // Copy all notifications to admin
      subject,
      html,
    });
    if (error) console.error("[Email] Resend error:", error);
    else console.log(`[Email] Sent "${subject}" → ${to} (id: ${data?.id})`);
  } catch (err) {
    console.error("[Email] Exception sending email:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 1. MEMBRESÍA ACTIVADA / ASIGNADA ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to          — email del cliente
 * @param {string} opts.name        — nombre del cliente
 * @param {string} opts.planName    — nombre del plan
 * @param {string} opts.startDate   — fecha inicio
 * @param {string} opts.endDate     — fecha fin
 * @param {number|null} opts.classLimit — clases totales (null = ilimitado)
 */
async function sendMembershipActivated(opts) {
  const { to, name, planName, startDate, endDate, classLimit } = opts;
  const classesText = classLimit ? `${classLimit} clases` : "Clases ilimitadas ♾";
  const content = `
    ${h1(`¡Tu membresía está activa, ${name.split(" ")[0]}! 🎉`)}
    ${p("Tu acceso a Kala Barre Studio ha sido activado. ¡Es momento de saltar!")}
    ${infoTable([
    infoRow("Plan", planName),
    infoRow("Clases incluidas", classesText),
    infoRow("Inicio", fmtDate(startDate)),
    infoRow("Vencimiento", fmtDate(endDate)),
  ])}
    ${p("Entra a tu perfil para reservar tus primeras clases y ver el horario disponible.")}
  `;
  const html = baseLayout({
    preheader: `¡Tu membresía ${planName} está activa! Reserva tus clases ahora.`,
    content,
    ctaUrl: `${SITE_URL}/app/classes`,
    ctaText: "Reservar clases",
  });
  await sendEmail({ to, subject: `✨ Tu membresía en Kala Barre Studio está activa`, html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 2. RESERVA CONFIRMADA ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {string} opts.className       — tipo de clase (Barre, etc.)
 * @param {string} opts.date            — fecha de la clase (DATE)
 * @param {string} opts.startTime       — hora inicio (TIME "HH:MM")
 * @param {string} opts.instructor      — nombre instructor
 * @param {number|null} opts.classesLeft — clases restantes después de reservar (null = ilimitado)
 * @param {boolean} opts.isWaitlist     — true si es lista de espera
 */
async function sendBookingConfirmed(opts) {
  const { to, name, className, date, startTime, instructor, classesLeft, isWaitlist } = opts;

  const statusPill = isWaitlist
    ? pill("Lista de espera", B.lime)
    : pill("Confirmada ✓", B.magenta);

  const classesLeftText = classesLeft === null
    ? "Ilimitadas ♾"
    : classesLeft !== undefined
      ? `${classesLeft} clases restantes`
      : null;

  const waitlistNote = isWaitlist
    ? alertBox("Estás en la <strong>lista de espera</strong>. Te notificaremos si se libera un lugar. Si quieres asegurar tu spot, reserva otra sesión.", B.lime)
    : "";

  const content = `
    ${h1(isWaitlist ? `En lista de espera, ${name.split(" ")[0]}` : `¡Reserva confirmada, ${name.split(" ")[0]}! 🏋️`)}
    ${p(isWaitlist
    ? "Te hemos añadido a la lista de espera para la siguiente clase:"
    : "Tu clase ha sido reservada con éxito. ¡Te esperamos!"
  )}
    <div style="text-align:center;margin:6px 0 16px;">${statusPill}</div>
    ${infoTable([
    infoRow("Clase", className),
    infoRow("Fecha", fmtDate(date)),
    infoRow("Hora", fmtTime(startTime)),
    ...(instructor ? [infoRow("Instructor", instructor)] : []),
    ...(classesLeftText ? [infoRow("Tu paquete", classesLeftText)] : []),
  ])}
    ${waitlistNote}
    ${p("Recuerda que puedes cancelar tu reserva hasta <strong>2 horas antes</strong> para recuperar tu crédito de clase.")}
  `;
  const html = baseLayout({
    preheader: isWaitlist ? `Estás en lista de espera para ${className}` : `Reserva confirmada para ${className} el ${fmtDate(date)}`,
    content,
    ctaUrl: `${SITE_URL}/app/bookings`,
    ctaText: "Ver mis reservas",
  });
  await sendEmail({ to, subject: isWaitlist ? `📋 En lista de espera — ${className}` : `✅ Reserva confirmada — ${className}`, html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 3. RESERVA CANCELADA ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string}  opts.to
 * @param {string}  opts.name
 * @param {string}  opts.className
 * @param {string}  opts.date
 * @param {string}  opts.startTime
 * @param {boolean} opts.creditRestored  — true si se devolvió el crédito
 * @param {boolean} opts.isLate          — cancelación tardía (<2h)
 * @param {number|null} opts.classesLeft — clases restantes después de cancelar
 */
async function sendBookingCancelled(opts) {
  const { to, name, className, date, startTime, creditRestored, isLate, classesLeft } = opts;

  const classesLeftText = classesLeft === null ? "Ilimitadas ♾" : classesLeft !== undefined ? `${classesLeft} clases` : null;

  const creditBlock = creditRestored
    ? alertBox(`✅ <strong>Clase devuelta a tu paquete.</strong> Cancelaste con más de 2 horas de anticipación.`, B.violet)
    : alertBox(`⚠️ <strong>La clase NO se devolvió a tu paquete.</strong> La cancelación fue con menos de 2 horas de anticipación (política del studio).`, B.magenta);

  const content = `
    ${h1(`Reserva cancelada, ${name.split(" ")[0]}`)}
    ${p("Tu reserva para la siguiente clase ha sido cancelada:")}
    ${infoTable([
    infoRow("Clase", className),
    infoRow("Fecha", fmtDate(date)),
    infoRow("Hora", fmtTime(startTime)),
    ...(classesLeftText ? [infoRow("Clases restantes", classesLeftText)] : []),
  ])}
    ${creditBlock}
    ${isLate
      ? small("Si tienes dudas sobre la política de cancelación, contáctanos por WhatsApp o visita tu perfil.")
      : p("¿Quieres reservar otra clase? Hay muchos horarios disponibles.")
    }
  `;
  const html = baseLayout({
    preheader: creditRestored ? "Tu clase fue devuelta al paquete." : "Cancelación tardía — crédito no recuperado.",
    content,
    ctaUrl: `${SITE_URL}/app/classes`,
    ctaText: "Ver horario",
  });
  await sendEmail({ to, subject: `❌ Reserva cancelada — ${className}`, html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 4. RECORDATORIO SEMANAL (programa tu semana) ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {number|null} opts.classesLeft — null = ilimitado
 * @param {string|null} opts.endDate     — fecha de vencimiento del paquete
 */
async function sendWeeklyReminder(opts) {
  const { to, name, classesLeft, endDate } = opts;

  const classesText = classesLeft === null
    ? "Tienes clases <strong>ilimitadas</strong> esta semana. ♾"
    : `Tienes <strong>${classesLeft} clase${classesLeft !== 1 ? "s" : ""}</strong> disponible${classesLeft !== 1 ? "s" : ""} en tu paquete.`;

  const expiryNote = endDate
    ? alertBox(`📅 Tu membresía vence el <strong>${fmtDate(endDate)}</strong>. ¡Aprovecha tus clases!`, B.violet)
    : "";

  const content = `
    ${h1(`¡Hola ${name.split(" ")[0]}! ¿Ya programaste tu semana? 🏃‍♀️`)}
    ${p("Es un nuevo comienzo. Esta semana tienes nuevos horarios disponibles en Kala Barre Studio.")}
    ${p(classesText)}
    ${expiryNote}
    ${h2("¿Por qué no faltar?")}
    ${p("Saltar en trampolín <strong>quema hasta 800 kcal</strong> por sesión, mejora tu coordinación y eleva tu energía. ¡Vale mucho la pena!")}
    ${p("Entra ahora y reserva tus clases antes de que se llenen los spots:")}
  `;
  const html = baseLayout({
    preheader: `¡Nueva semana, nuevas clases! Tienes ${classesLeft === null ? "clases ilimitadas" : `${classesLeft} clases`} disponibles.`,
    content,
    ctaUrl: `${SITE_URL}/app/classes`,
    ctaText: "Programar mi semana",
  });
  await sendEmail({ to, subject: `🗓️ ¡Programa tu semana en Kala Barre Studio!`, html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 5. RECORDATORIO DE RENOVACIÓN ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string}  opts.to
 * @param {string}  opts.name
 * @param {string}  opts.planName
 * @param {number|null} opts.classesLeft  — null = ilimitado
 * @param {string|null} opts.endDate
 * @param {'last_class'|'expiring_soon'} opts.reason
 */
async function sendRenewalReminder(opts) {
  const { to, name, planName, classesLeft, endDate, reason } = opts;

  const isLastClass = reason === "last_class";
  const isExpiring = reason === "expiring_soon";

  const urgencyBlock = isLastClass
    ? alertBox(`🎯 Te queda <strong>1 sola clase</strong> en tu paquete ${planName}. ¡Renueva antes de quedarte sin acceso!`, B.magenta)
    : alertBox(`⏰ Tu membresía <strong>${planName}</strong> vence el <strong>${fmtDate(endDate)}</strong>. ¡Renueva para no perder tu ritmo!`, B.violet);

  const benefit = isLastClass
    ? p("Aprovecha y reserva esa última clase hoy, y de paso renueva tu paquete para seguir entrenando sin interrupciones.")
    : p("Renovar antes del vencimiento es la mejor forma de mantener tu constancia. ¡No dejes que el progreso se detenga!");

  const content = `
    ${h1(`${name.split(" ")[0]}, es momento de renovar 🔄`)}
    ${urgencyBlock}
    ${p("En Kala Barre Studio nos aseguramos de que nunca pierdas el hilo de tu entrenamiento.")}
    ${infoTable([
    infoRow("Plan actual", planName),
    ...(classesLeft !== null ? [infoRow("Clases restantes", `${classesLeft}`)] : []),
    ...(endDate ? [infoRow("Vencimiento", fmtDate(endDate))] : []),
  ])}
    ${benefit}
  `;
  const html = baseLayout({
    preheader: isLastClass ? `¡Solo te queda 1 clase! Renueva tu paquete ahora.` : `Tu membresía vence pronto. Renueva para seguir saltando.`,
    content,
    ctaUrl: `${SITE_URL}/app/checkout`,
    ctaText: "Renovar mi membresía",
  });
  await sendEmail({
    to,
    subject: isLastClass
      ? `⚡ ¡Solo te queda 1 clase! Renueva tu membresía`
      : `⏰ Tu membresía vence pronto — Kala Barre Studio`,
    html,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 6. RECUPERACION DE CONTRASEÑA ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {string} opts.token
 * @param {string=} opts.resetUrl
 */
async function sendPasswordResetEmail(opts) {
  const { to, name, token, resetUrl } = opts;
  const safeName = String(name || "Clienta");
  const firstName = safeName.trim().split(/\s+/)[0] || "Clienta";
  const resolvedResetUrl = String(
    resetUrl || `${SITE_URL}/auth/reset-password?token=${encodeURIComponent(token)}`,
  );
  const content = `
    ${h1(`Recupera tu contraseña, ${firstName} 🔐`)}
    ${p("Hemos recibido una solicitud para cambiar la contraseña de tu cuenta en Kala Barre Studio.")}
    ${p("Si fuiste tú, haz clic en el siguiente enlace para crear una contraseña nueva. Este enlace expirará en 2 horas.")}
    ${p("Si no solicitaste este cambio, puedes ignorar este correo; tu cuenta seguirá segura.")}
    ${small(`Si el botón no abre, copia y pega este enlace en tu navegador:<br><a href="${resolvedResetUrl}" style="color:${B.magenta};word-break:break-all;">${resolvedResetUrl}</a>`)}
  `;
  const html = baseLayout({
    preheader: "Recupera el acceso a tu cuenta de Kala Barre Studio",
    content,
    ctaUrl: resolvedResetUrl,
    ctaText: "Reestablecer mi contraseña",
  });
  await sendEmail({ to, subject: "🔐 Restablecer contraseña — Kala Barre Studio", html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 7. RECHAZO DE COMPROBANTE ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {string} opts.reason
 */
async function sendOrderRejected(opts) {
  const { to, name, reason } = opts;
  const content = `
    ${h1(`Comprobante no aprobado 😔`)}
    ${p(`Hola ${name.split(" ")[0]}, revisamos tu comprobante de pago y lamentablemente <strong>no pudo ser aprobado</strong>.`)}
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="background:rgba(118,33,77,.08);border-left:3px solid #76214D;border-radius:0 8px 8px 0;margin:16px 0;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#FCE6E1;">
          <strong style="color:#76214D;">Motivo:</strong><br>${reason}
        </p>
      </td></tr>
    </table>
    ${p("Si crees que hubo un error, por favor contáctanos directamente por WhatsApp o responde este correo. ¡Estamos para ayudarte! 💜")}
  `;
  const html = baseLayout({
    preheader: "Tu comprobante de pago fue revisado — Kala Barre Studio",
    content,
    ctaUrl: `https://wa.me/521${process.env.STUDIO_PHONE || ""}`,
    ctaText: "Contactar por WhatsApp",
  });
  await sendEmail({ to, subject: "Comprobante de pago no aprobado — Kala Barre Studio", html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 8. COMPRA DE VIDEO APROBADA ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {string} opts.videoTitle
 * @param {string} opts.videoId
 * @param {number|string|null} [opts.amountMxn]
 */
async function sendVideoPurchaseApproved(opts) {
  const { to, name, videoTitle, videoId, amountMxn } = opts;
  const firstName = String(name || "Clienta").trim().split(/\s+/)[0] || "Clienta";
  const safeTitle = String(videoTitle || "tu clase");
  const safeAmount =
    amountMxn != null && Number(amountMxn) > 0
      ? `$${Number(amountMxn).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MXN`
      : null;
  const content = `
    ${h1(`¡Tu video está listo, ${firstName}! 🎬`)}
    ${p(`Aprobamos tu compra de <strong>${safeTitle}</strong>. Ya puedes verlo cuando quieras desde la app — el acceso es <strong>permanente</strong>.`)}
    ${safeAmount ? p(`Monto registrado: ${safeAmount}.`) : ""}
    ${p("Si tienes cualquier duda, responde este correo o escríbenos por WhatsApp. 💜")}
  `;
  const html = baseLayout({
    preheader: `Tu video "${safeTitle}" ya está desbloqueado en Kala Barre Studio`,
    content,
    ctaUrl: `${SITE_URL}/app/videos/${encodeURIComponent(videoId)}`,
    ctaText: "Ver el video",
  });
  await sendEmail({ to, subject: `🎬 Tu video "${safeTitle}" está listo — Kala Barre Studio`, html });
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export {
  sendMembershipActivated,
  sendBookingConfirmed,
  sendBookingCancelled,
  sendWeeklyReminder,
  sendRenewalReminder,
  sendPasswordResetEmail,
  sendOrderRejected,
  sendVideoPurchaseApproved,
};
