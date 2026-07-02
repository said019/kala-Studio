# Reunión Karla 1-jul-2026 — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar los 5 puntos de acción técnicos acordados con Karla (dueña) el 1 de julio de 2026: mensaje del día en el dashboard (reemplaza WhatsApp manual), desactivar POS, mejorar visibilidad de lealtad, arreglar el bug de pantalla completa del video en iOS, y auditar la configuración de agendamiento de membresías.

**Architecture:** Cada punto es independiente y se implementa/despliega por separado (commit propio). Se reutiliza al máximo infraestructura ya existente: el mecanismo genérico de `settings` (tabla `settings` + `getSettingValueWithDefaults`/`mergeSettingsWithDefaults` + endpoint genérico `/api/settings/:key`) para el mensaje del día y no se crea nada nuevo salvo un endpoint de lectura pública para la clienta; el bug de video es un fix quirúrgico de una función; POS se oculta sin borrar backend/datos históricos (los reportes ya suman `channel='pos_visit'`); lealtad es una reorganización de UI sin tocar backend; el punto de agendamiento es una auditoría SQL (no hay bug confirmado, así que el entregable es el script de auditoría + runbook de corrección manual, reusando el patrón ya probado con el caso de Itzel en esta misma sesión).

**Tech Stack:** Express + PostgreSQL (server/index.js, patrón `ensureSchema()`), React + TypeScript + Vite + TanStack Query (frontend), Railway (deploy vía `git push origin main`).

**Nota sobre verificación:** Este proyecto no tiene suite de tests de servidor (server/index.js no tiene cobertura; existen 3 archivos vitest triviales del lado del frontend). Las tareas usan la convención de verificación YA probada y exitosa en esta sesión: `node --check` para sintaxis del server, `npm run build` para el frontend, y verificación manual con `curl` contra `/api/health` + consultas `psql` directas contra producción cuando aplica. No se inventa infraestructura de test nueva que rompería con el patrón establecido del proyecto.

**Acceso a producción:** La base de datos de Railway ya fue usada exitosamente en esta sesión vía `psql "$PGURL"` con el conector `postgresql://postgres:...@autorack.proxy.rlwy.net:40908/railway`. El deploy es automático al hacer `git push origin main` (Railway detecta el push y reconstruye). Verificar con `curl https://kala-studio-production.up.railway.app/api/health` — un `uptimeSeconds` bajo confirma que el nuevo deploy ya está sirviendo.

---

## Resumen de los 5 puntos

| # | Punto de la reunión | Tipo | Riesgo |
|---|---|---|---|
| 1 | Mensaje del día en dashboard (reemplaza WhatsApp manual) | Feature nueva, aditiva | Bajo — reusa infra existente |
| 2 | Desactivar POS | Ocultar UI, no borrar backend/datos | Bajo — reversible con 1 commit |
| 3 | Mejorar visibilidad de lealtad | Reorganización de UI, sin tocar backend | Bajo |
| 4 | Bug: video no pantalla completa en iOS | Fix de causa raíz confirmada | Bajo — cambio aislado a 1 función |
| 5 | Verificar membresías (agendamiento) | Auditoría + runbook, no hay bug confirmado que arreglar a ciegas | N/A — es investigación |

---

## Task 1: Mensaje del día en el dashboard de la clienta

**Contexto (de la investigación):** Karla envía avisos de clase manualmente por WhatsApp desde su celular personal, y le preocupa que Meta la sancione por "mensajes masivos" además de que es tedioso. **No existe ningún cron automatizado que mande avisos masivos por WhatsApp** (se verificó: `runWeeklyReminderCron` en `server/index.js:17659` solo manda EMAIL, no WhatsApp) — así que esta tarea es 100% aditiva, no hay que apagar ni tocar ningún flujo de WhatsApp existente (las plantillas transaccionales como `booking_confirmed`, `class_reminder`, etc. siguen igual).

Ya existe el mecanismo genérico perfecto para esto: tabla `settings` (key-value), función `getSettingValueWithDefaults`/`mergeSettingsWithDefaults` (`server/index.js:361-399`), endpoint genérico `GET/PUT /api/settings/:key` (`server/index.js:12529-12548`, solo admin), y en el frontend el componente genérico `SettingsSection` (`src/pages/admin/settings/SettingsPage.tsx:46-96`) que ya lee/escribe cualquier key de settings con un formulario automático.

**Files:**
- Modify: `server/index.js:361-366` (registrar default de `daily_message` en `DEFAULT_SETTINGS_BY_KEY`)
- Modify: `server/index.js` (nuevo endpoint público `GET /api/daily-message`, colocarlo junto a los otros endpoints de cliente cerca de la línea 12529)
- Modify: `src/pages/admin/settings/SettingsPage.tsx` (nueva pestaña "Mensaje del día" reusando `SettingsSection`)
- Create: `src/components/app/DailyMessageCard.tsx`
- Modify: `src/pages/client/Dashboard.tsx:164-173` (renderizar la nueva card justo después del `PageHeader`)

- [ ] **Step 1: Registrar el default de `daily_message` en el servidor**

En `server/index.js`, localizar el bloque `DEFAULT_SETTINGS_BY_KEY` (línea 361-366):

```js
const DEFAULT_SETTINGS_BY_KEY = {
  general_settings: DEFAULT_GENERAL_SETTINGS,
  policies_settings: DEFAULT_POLICIES_SETTINGS,
  notification_settings: DEFAULT_NOTIFICATION_SETTINGS,
  notification_templates: DEFAULT_NOTIFICATION_TEMPLATES,
};
```

Reemplazar por (agrega `daily_message` con un texto default y la fecha):

```js
const DEFAULT_DAILY_MESSAGE = {
  text: "Hoy es un buen día para moverte. Te esperamos en el estudio ✨",
  updated_at: null,
};

const DEFAULT_SETTINGS_BY_KEY = {
  general_settings: DEFAULT_GENERAL_SETTINGS,
  policies_settings: DEFAULT_POLICIES_SETTINGS,
  notification_settings: DEFAULT_NOTIFICATION_SETTINGS,
  notification_templates: DEFAULT_NOTIFICATION_TEMPLATES,
  daily_message: DEFAULT_DAILY_MESSAGE,
};
```

Esto hace que `ensureSchema()` (línea ~1716, que itera `DEFAULT_SETTINGS_BY_KEY` e inserta cada default con `ON CONFLICT DO NOTHING`) siembre automáticamente la fila `daily_message` en la tabla `settings` la próxima vez que arranque el server. No hace falta ningún `ALTER TABLE` — la tabla `settings` ya existe.

- [ ] **Step 2: Agregar el endpoint público de lectura para la clienta**

En `server/index.js`, buscar el endpoint `app.get("/api/settings/:key", adminMiddleware, ...)` (línea 12529) y agregar el nuevo endpoint justo ANTES de esa línea:

```js
// GET /api/daily-message — lectura pública (autenticada, no admin) del mensaje
// del día para el dashboard de la clienta. El admin lo edita vía
// PUT /api/settings/daily_message (endpoint genérico, solo admin, abajo).
app.get("/api/daily-message", authMiddleware, async (req, res) => {
  try {
    const value = await getSettingValueWithDefaults("daily_message");
    return res.json({ data: value });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

```

- [ ] **Step 3: Verificar sintaxis del servidor**

Run: `cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio" && node --check server/index.js`
Expected: sin salida (exit code 0). Si hay error de sintaxis, revisar que las llaves/comas del Step 1 y 2 quedaron bien cerradas.

- [ ] **Step 4: Agregar la pestaña de admin reusando `SettingsSection`**

En `src/pages/admin/settings/SettingsPage.tsx`, dentro del `<TabsList>` (línea 716-723), agregar un nuevo trigger después de "general":

```tsx
<TabsList className="flex-wrap h-auto gap-1 mb-6">
  <TabsTrigger value="general">General</TabsTrigger>
  <TabsTrigger value="daily-message">Mensaje del día</TabsTrigger>
  <TabsTrigger value="payments">Pagos</TabsTrigger>
  <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
  <TabsTrigger value="policies">Políticas</TabsTrigger>
  <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
  <TabsTrigger value="security">Seguridad</TabsTrigger>
</TabsList>
```

Y agregar el `TabsContent` correspondiente, justo después del `</TabsContent>` que cierra `value="general"` (línea 742):

```tsx
<TabsContent value="daily-message">
  <div className="space-y-3 max-w-md">
    <p className="text-sm text-muted-foreground">
      Este mensaje se muestra en el dashboard de todas las clientas. Cámbialo cuando quieras —
      reemplaza el aviso que mandabas por WhatsApp.
    </p>
    <SettingsSection
      settingKey="daily_message"
      fields={[{ key: "text", label: "Mensaje de hoy", multiline: true }]}
    />
  </div>
</TabsContent>
```

- [ ] **Step 5: Crear el componente `DailyMessageCard` para el dashboard de la clienta**

Create: `src/components/app/DailyMessageCard.tsx`

```tsx
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { KALA } from "@/components/app/tokens";
import { Sparkles } from "lucide-react";

export const DailyMessageCard = () => {
  const { data } = useQuery({
    queryKey: ["daily-message"],
    queryFn: async () => (await api.get("/daily-message")).data,
    staleTime: 5 * 60 * 1000,
  });

  const text = data?.data?.text;
  if (!text) return null;

  return (
    <div
      className="mt-4 flex items-start gap-3 rounded-2xl px-4 py-3.5"
      style={{ backgroundColor: KALA.blush, border: `1px solid ${KALA.border}` }}
    >
      <Sparkles size={16} className="mt-0.5 shrink-0" style={{ color: KALA.berry }} />
      <p className="text-sm leading-snug" style={{ color: KALA.ink }}>
        {text}
      </p>
    </div>
  );
};
```

Nota: revisar rápido `src/components/app/tokens.ts` (o `.tsx`) para confirmar que `KALA.blush`, `KALA.border`, `KALA.berry`, `KALA.ink` existen — ya se usan con esos mismos nombres en `KalaVideoPlayer.tsx` y en el propio `Dashboard.tsx`, así que deberían estar disponibles sin cambios.

- [ ] **Step 6: Insertar la card en el Dashboard de la clienta**

En `src/pages/client/Dashboard.tsx`, agregar el import junto a los demás imports de componentes `app/` (buscar el bloque de imports cerca del inicio del archivo) y agregar:

```tsx
import { DailyMessageCard } from "@/components/app/DailyMessageCard";
```

Luego, dentro del `return` (línea 164-173), justo después del `<PageHeader ... />` y ANTES del comentario `{/* ── Next class — primary action ── */}`:

```tsx
        <PageHeader
          eyebrow={`Hoy · ${format(new Date(), "EEEE d MMM", { locale: es })}`}
          title={<>Tu semana en</>}
          titleAccent="Kala."
          subtitle={rings.message}
        />

        <DailyMessageCard />

        {/* ── Next class — primary action ── */}
```

- [ ] **Step 7: Verificar que el frontend compila**

Run: `cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio" && npm run build`
Expected: `✓ built in Xs` sin errores de TypeScript. Si `KALA.blush`/`KALA.border` no existen con esos nombres exactos, el build fallará señalando la línea — ajustar los nombres de token según lo que reporte el error.

- [ ] **Step 8: Commit**

```bash
cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio"
git add server/index.js src/pages/admin/settings/SettingsPage.tsx src/components/app/DailyMessageCard.tsx src/pages/client/Dashboard.tsx
git commit -m "feat: mensaje del día en dashboard (reemplaza WhatsApp manual)

Reusa el mecanismo genérico de settings ya existente. Karla edita el texto
desde Configuración → Mensaje del día; se muestra a todas las clientas en
su dashboard. No toca ningún flujo de WhatsApp existente (es aditivo)."
```

- [ ] **Step 9: Push y verificar deploy**

```bash
git push origin main
```

Esperar ~2-4 min y correr:
```bash
curl -s https://kala-studio-production.up.railway.app/api/health
```
Expected: `"uptimeSeconds"` bajo (menos de 300) confirma que el nuevo código ya está en vivo.

- [ ] **Step 10: Verificación manual end-to-end**

1. Entrar a `/admin/settings` → pestaña "Mensaje del día" → escribir un texto de prueba → Guardar. Debe aparecer el toast "✅ Configuración guardada".
2. Entrar a `/app` (dashboard de clienta) con una cuenta de clienta → confirmar que el mensaje aparece justo debajo del saludo, arriba de "Tu próxima clase".
3. Avisar a Karla que ya puede cambiar el texto ella misma desde Configuración.

---

## Task 2: Desactivar el módulo de Punto de Venta (POS)

**Contexto:** El POS vive en `/admin/pos` (`src/pages/admin/pos/POSPage.tsx`), enlazado desde el menú en `AdminLayout.tsx:40`. El backend tiene 2 endpoints (`POST /api/pos/checkout` línea 11395, `POST /api/pos/sale` línea 16143) que usan `processPosSale`. **Importante:** los reportes de ingresos YA suman ventas históricas con `channel='pos_visit'` de la tabla `orders` (confirmado en esta misma sesión al arreglar "Ingresos del mes"). Por eso esta tarea SOLO oculta la pantalla y la ruta — **no se toca el backend ni se borran datos**, así los reportes históricos siguen funcionando igual.

**Files:**
- Modify: `src/components/admin/AdminLayout.tsx:40` (quitar el ítem del menú)
- Modify: `src/App.tsx:53,147` (quitar el import y la ruta)

- [ ] **Step 1: Quitar "POS" del menú Y subir "Lealtad" más arriba**

(Aclaración de Karla: al desactivar POS, subir el sistema de lealtad más arriba en el menú.)

En `src/components/admin/AdminLayout.tsx`, dentro del grupo `"Gestión"` (línea 30-48), eliminar la línea de POS (línea 40) y mover el ítem de "Lealtad" hacia arriba (queda 3º, justo después de Membresías). Reemplazar el array `items` completo del grupo "Gestión" por:

```tsx
    items: [
      { path: "/admin/plans", label: "Planes", icon: Package },
      { path: "/admin/memberships", label: "Membresías", icon: CreditCard },
      { path: "/admin/loyalty", label: "Lealtad", icon: Gift },
      { path: "/admin/classes", label: "Clases", icon: CalendarDays },
      { path: "/admin/staff", label: "Instructoras", icon: GraduationCap },
      { path: "/admin/orders", label: "Órdenes", icon: ShoppingBag },
      { path: "/admin/visitas", label: "Visitas", icon: UserPlus },
      { path: "/admin/discount-codes", label: "Descuentos", icon: Tag },
      { path: "/admin/whatsapp-templates", label: "Templates WA", icon: MessageCircle },
      { path: "/admin/videos", label: "Videos", icon: Video },
      { path: "/admin/events", label: "Eventos", icon: Ticket },
    ],
```

(Se quitó la línea `{ path: "/admin/pos", label: "POS", icon: ShoppingCart }` y `Lealtad` subió de la posición 9 a la 3.) No hace falta quitar el import de `ShoppingCart` de lucide-react (línea 10) todavía — Vite/esbuild lo tree-shakea. Si `npm run build` se queja de un import sin usar, quitar `ShoppingCart` del import en ese momento.

- [ ] **Step 2: Quitar la ruta `/admin/pos` para que no quede accesible por URL directa**

En `src/App.tsx`, localizar el import (línea 53):

```tsx
import POSPage from "./pages/admin/pos/POSPage";
```

Y la ruta (línea 147):

```tsx
<Route path="/admin/pos" element={<POSPage />} />
```

Eliminar ambas líneas. **No borrar el archivo `src/pages/admin/pos/POSPage.tsx`** — se queda en el repo por si se reactiva después, solo deja de estar enrutado.

- [ ] **Step 3: Verificar que el frontend compila**

Run: `cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio" && npm run build`
Expected: `✓ built in Xs`. Si aparece un error de "unused import" para `ShoppingCart` o `POSPage`, quitar esos imports puntuales (este proyecto usa Vite, que normalmente solo da warning, no error, por imports sin usar — si el build falla igual, es señal de que hay un linter de build estricto; quitar el import basta).

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio"
git add src/components/admin/AdminLayout.tsx src/App.tsx
git commit -m "chore: desactivar módulo de Punto de Venta del panel admin

Se oculta del menú y se desenruta /admin/pos a petición de Karla (no se usa).
El backend (processPosSale, /api/pos/*) y los datos históricos de ventas POS
NO se tocan — los reportes de ingresos siguen sumando channel='pos_visit'."
```

- [ ] **Step 5: Push y verificar deploy**

```bash
git push origin main
```
Verificar con `curl -s https://kala-studio-production.up.railway.app/api/health` que el uptime bajó (deploy nuevo en vivo).

- [ ] **Step 6: Verificación manual**

Entrar al admin → confirmar que "POS" ya no aparece en el menú "Gestión". Navegar manualmente a `/admin/pos` en la URL → debe mostrar la pantalla de "not found" del router (comportamiento esperado, no es un error nuevo).

---

## Task 3: Mejorar visibilidad del programa de lealtad/recompensas

**Contexto:** La funcionalidad YA existe y es completa (`src/pages/admin/loyalty/LoyaltyPage.tsx`, 609 líneas): tab de Recompensas (CRUD), tab de Milestones (exactamente el ejemplo "5 clases = 50 puntos" que se discutió en la reunión — campo `classes_required` + `award_points`), tab de Configuración. El problema que reportó Karla es de **claridad para una usuaria no técnica**, no de funcionalidad faltante: los milestones (que es lo que ella quiere gestionar como "premios en el estudio") están en la SEGUNDA pestaña, detrás de "Recompensas" que es más técnico/abstracto: y no hay ningún resumen a simple vista de "cuántos premios activos tengo" o "a quién le acabo de dar un premio".

**Files:**
- Modify: `src/pages/admin/loyalty/LoyaltyPage.tsx`

- [ ] **Step 1: Reordenar las pestañas para que "Recompensas por asistencia" (milestones) sea la primera**

En `src/pages/admin/loyalty/LoyaltyPage.tsx`, el componente `LoyaltyPage` (línea 589-607) hoy es:

```tsx
const LoyaltyPage = () => (
  <AuthGuard>
    <AdminLayout>
      <div className="admin-page max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Programa de Lealtad</h1>
        <Tabs defaultValue="rewards">
          <TabsList>
            <TabsTrigger value="rewards">Recompensas</TabsTrigger>
            <TabsTrigger value="milestones"><Trophy size={14} className="mr-1" />Milestones</TabsTrigger>
            <TabsTrigger value="config"><Settings size={14} className="mr-1" />Configuración</TabsTrigger>
          </TabsList>
          <TabsContent value="rewards" className="mt-4"><LoyaltyRewards /></TabsContent>
          <TabsContent value="milestones" className="mt-4"><LoyaltyMilestones /></TabsContent>
          <TabsContent value="config" className="mt-4"><LoyaltyConfig /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  </AuthGuard>
);
```

Reemplazar por (cambia el `defaultValue`, el orden de `TabsTrigger`/`TabsContent`, y renombra "Milestones" a un nombre más claro para Karla; agrega el resumen del Step 2 arriba de los Tabs):

```tsx
const LoyaltyPage = () => (
  <AuthGuard>
    <AdminLayout>
      <div className="admin-page max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Programa de Lealtad</h1>
        <LoyaltySummary />
        <Tabs defaultValue="milestones">
          <TabsList>
            <TabsTrigger value="milestones"><Trophy size={14} className="mr-1" />Premios por metas</TabsTrigger>
            <TabsTrigger value="rewards">Catálogo de recompensas</TabsTrigger>
            <TabsTrigger value="config"><Settings size={14} className="mr-1" />Configuración</TabsTrigger>
          </TabsList>
          <TabsContent value="milestones" className="mt-4"><LoyaltyMilestones /></TabsContent>
          <TabsContent value="rewards" className="mt-4"><LoyaltyRewards /></TabsContent>
          <TabsContent value="config" className="mt-4"><LoyaltyConfig /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  </AuthGuard>
);
```

- [ ] **Step 2: Agregar el componente `LoyaltySummary` (resumen a simple vista)**

En `src/pages/admin/loyalty/LoyaltyPage.tsx`, agregar este componente nuevo justo ANTES de `const LoyaltyPage = () => (` (es decir, después del cierre de `LoyaltyMilestones` en la línea 587, antes de la línea 589):

```tsx
// ── Resumen visual para la dueña: qué tan activo está el programa ──────
const LoyaltySummary = () => {
  const { data: milestonesData } = useQuery<{ data: Milestone[] }>({
    queryKey: ["loyalty-milestones"],
    queryFn: async () => (await api.get("/admin/loyalty-milestones")).data,
  });
  const { data: rewardsData } = useQuery<{ data: Reward[] }>({
    queryKey: ["loyalty-rewards"],
    queryFn: async () => (await api.get("/loyalty/rewards")).data,
  });
  const { data: awardsData } = useQuery<{ data: AwardLog[] }>({
    queryKey: ["loyalty-milestone-awards"],
    queryFn: async () => (await api.get("/admin/loyalty-milestones/awards?limit=50")).data,
  });

  const milestones = Array.isArray(milestonesData?.data) ? milestonesData.data : [];
  const rewards = Array.isArray(rewardsData?.data) ? rewardsData.data : [];
  const awards = Array.isArray(awardsData?.data) ? awardsData.data : [];

  const activeMilestones = milestones.filter((m) => m.is_active).length;
  const activeRewards = rewards.filter((r) => r.is_active).length;
  const thisMonth = new Date();
  const awardedThisMonth = awards.filter((a) => {
    const d = new Date(a.awarded_at);
    return d.getMonth() === thisMonth.getMonth() && d.getFullYear() === thisMonth.getFullYear();
  }).length;

  const cards = [
    { label: "Metas activas", value: activeMilestones, hint: "premios configurados que se otorgan solos" },
    { label: "Recompensas en catálogo", value: activeRewards, hint: "canjeables con puntos" },
    { label: "Premiadas este mes", value: awardedThisMonth, hint: "alumnas que alcanzaron una meta" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</p>
          <p className="mt-2 text-3xl font-bold">{c.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
        </div>
      ))}
    </div>
  );
};

```

Esto NO agrega llamadas nuevas al backend — reusa exactamente los mismos 3 endpoints que ya consume `LoyaltyMilestones` (React Query cachea por `queryKey`, así que no duplica requests en la práctica).

- [ ] **Step 3: Verificar que el frontend compila**

Run: `cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio" && npm run build`
Expected: `✓ built in Xs`. Si TypeScript se queja de que `Milestone`, `Reward`, o `AwardLog` no están en scope para `LoyaltySummary`, confirmar que el componente se agregó DESPUÉS de esas definiciones de tipo (líneas 71-193 para `Reward`, 176-193 para `Milestone`/`AwardLog`) y antes de `LoyaltyPage` — todas viven en el mismo archivo así que deben ser visibles.

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio"
git add src/pages/admin/loyalty/LoyaltyPage.tsx
git commit -m "feat(admin): resumen visual + reordenar pestañas en Lealtad

Karla pidió mejor visibilidad del programa. La funcionalidad ya existía
completa (milestones = exactamente '5 clases = 50 pts' que se discutió en
la reunión); el cambio es de information architecture: metas primero
(coincide con su mental model), catálogo de recompensas segundo, más un
resumen de metas activas / recompensas / premiadas este mes arriba."
```

- [ ] **Step 5: Push y verificar deploy**

```bash
git push origin main
```
Verificar con `curl -s https://kala-studio-production.up.railway.app/api/health`.

- [ ] **Step 6: Verificación manual + agendar con Karla**

Entrar a `/admin/loyalty` → confirmar que se ve el resumen arriba y "Premios por metas" es la primera pestaña. Mandarle captura a Karla o hacer videollamada corta para que ella configure sus metas (su próximo paso pendiente de la reunión: "Configurar Recompensas").

---

## Task 4: Bug — video no se pone en pantalla completa en iOS

**Causa raíz confirmada:** En `KalaVideoPlayer.tsx`, la función `toggleFullscreen` (línea 165-170) llama `el.requestFullscreen?.()` sobre el `<div>` contenedor (`wrapRef`). **iOS Safari NO soporta la Fullscreen API estándar sobre elementos que no sean `<video>`** — solo soporta la API nativa `video.webkitEnterFullscreen()`. Como el `<video>` tiene el atributo `playsInline` (línea 243, necesario para que no se ponga en pantalla completa automáticamente al reproducir), y no hay ningún fallback para iOS, el botón de pantalla completa simplemente no hace nada en iPhone/iPad — coincide exactamente con el reporte de Karla ("ni rotando el dispositivo", porque nunca llegó a entrar a fullscreen para empezar).

**Files:**
- Modify: `src/components/app/KalaVideoPlayer.tsx:144-170` (fullscreen sync + toggle)

- [ ] **Step 1: Agregar detección + fallback de iOS en `toggleFullscreen`**

En `src/components/app/KalaVideoPlayer.tsx`, localizar el bloque (línea 144-170):

```tsx
  /* ── Fullscreen sync ── */
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen?.();
  };
```

Reemplazar por (agrega los listeners de eventos nativos de iOS `webkitbeginfullscreen`/`webkitendfullscreen` sobre el propio `<video>`, y en `toggleFullscreen` usa `video.webkitEnterFullscreen()` cuando el navegador no soporta `requestFullscreen` en el div pero sí lo soporta el video):

```tsx
  /* ── Fullscreen sync ──
     Desktop/Android: escucha `fullscreenchange` sobre document (Fullscreen API
     estándar aplicada al div contenedor `wrapRef`).
     iOS Safari: NO soporta requestFullscreen() en elementos que no son <video>,
     solo soporta video.webkitEnterFullscreen() (fullscreen nativo del propio
     <video>). Por eso escuchamos también los eventos webkit-específicos que
     dispara el <video>, y usamos ese fallback en toggleFullscreen. */
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);

    const v = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
    }) | null;
    const onWebkitBegin = () => setIsFs(true);
    const onWebkitEnd = () => setIsFs(false);
    v?.addEventListener("webkitbeginfullscreen", onWebkitBegin);
    v?.addEventListener("webkitendfullscreen", onWebkitEnd);

    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      v?.removeEventListener("webkitbeginfullscreen", onWebkitBegin);
      v?.removeEventListener("webkitendfullscreen", onWebkitEnd);
    };
  }, [videoRef]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    const video = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitDisplayingFullscreen?: boolean;
    }) | null;

    // iOS Safari: el contenedor <div> nunca soporta requestFullscreen. Si el
    // <video> expone la API nativa de iOS, úsala directamente sobre el video.
    const supportsDivFullscreen = !!el?.requestFullscreen;
    if (!supportsDivFullscreen && video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
      return;
    }

    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen?.();
  };
```

- [ ] **Step 2: Verificar que el frontend compila**

Run: `cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio" && npm run build`
Expected: `✓ built in Xs`. TypeScript podría quejarse de que `webkitEnterFullscreen`/`webkitbeginfullscreen` no existen en el tipo `HTMLVideoElement` — por eso el cast `as (HTMLVideoElement & {...})` ya está incluido arriba; si el build igual falla señalando otra línea, ajustar el cast en esa línea puntual sin quitar la lógica.

- [ ] **Step 3: Commit**

```bash
cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio"
git add src/components/app/KalaVideoPlayer.tsx
git commit -m "fix: video no entraba a pantalla completa en iOS

Causa raíz: toggleFullscreen llamaba requestFullscreen() sobre el div
contenedor, API que iOS Safari no soporta fuera de <video>. Agrega fallback
a video.webkitEnterFullscreen() (API nativa de iOS) y escucha los eventos
webkitbeginfullscreen/webkitendfullscreen para sincronizar el ícono."
```

- [ ] **Step 4: Push y verificar deploy**

```bash
git push origin main
```
Verificar con `curl -s https://kala-studio-production.up.railway.app/api/health`.

- [ ] **Step 5: Verificación manual (requiere iPhone real o Karla)**

Este fix específicamente arregla el caso de iOS Safari, que es el reportado. Verificar:
1. En una laptop/Android: el botón de pantalla completa debe seguir funcionando igual que antes (no se rompió el caso que sí funcionaba).
2. Pedirle a Karla que pruebe en su iPhone (ella dijo que descargaría la app para mandar capturas — aprovechar para pedirle que confirme si el botón de pantalla completa ya funciona). Si Karla ya mandó las capturas de pantalla mencionadas en la reunión, revisarlas primero para confirmar que el síntoma coincide exactamente con esta causa raíz antes de dar el fix por cerrado.

---

## Task 5: Auditoría de configuración de membresías (agendamiento)

> **✅ INVESTIGACIÓN COMPLETADA (1-jul-2026).** Se corrió la auditoría completa contra prod (workflow multi-agente + verificación adversarial). Resultados:
> - **BUG PRINCIPAL ENCONTRADO Y ARREGLADO (deployed):** la sesión de Postgres corre en UTC, así que las compuertas de vigencia (`end_date >= CURRENT_DATE`) rebotaban a las alumnas en su último día válido después de las ~18:00 MX ("no tienes membresía activa"). ESTE era el "problema de agendamiento". Fix aplicado: comparar contra `(NOW() AT TIME ZONE 'America/Mexico_City')::date` en todas las compuertas de validez. Commit `9f95bd0`. Verificado en prod (rescató 1 membresía que vence hoy).
> - **Doble cobro histórico:** ~8 alumnas con créditos mermados por el trigger legacy ya eliminado (Anaelda, Luisa, Ana Paola, Cristopher, Ximena, Katya, Azul, Argelia). **La dueña decidió NO tocar créditos por ahora** — quedan documentados con su UPDATE exacto (guard `AND classes_remaining=<actual>`) para aplicar caso por caso cuando ella confirme. Las vencidas (Ximena/Katya/Azul/Argelia) requieren extensión de vigencia para que el crédito sirva.
> - **P2 pendiente (código):** al cancelar una reserva, el crédito se devuelve a la membresía del booking sin checar si sigue activa (`server/index.js` ~4134/4234); si hubo renovación en medio, el crédito cae en la membresía cancelada. Fix: redirigir el `+1` a la membresía activa compatible.
> - **DESCARTADOS (legítimos, no bug):** las 15 "activas pero vencidas" (diseño intencional, no reservables); María José 34 créditos (carryover real); 9 clases muestra usadas; María José visita.
>
> El script de abajo queda como herramienta reutilizable para futuros reportes.

**Contexto:** Este punto de la reunión es ambiguo — no hay un bug concreto reportado, solo "revisar la configuración de las membresías para corregir problemas de agendamiento". La investigación encontró:

1. El tope semanal de clases está **deliberadamente desactivado** por una decisión de negocio ya documentada en el código: `WEEKLY_LIMIT_ENABLED = false` (`server/index.js:3612`), con el comentario: *"las alumnas pueden adelantar/concentrar sus clases dentro del mes [...] El límite real sigue siendo el total de créditos del plan (class_limit) y la vigencia (end_date)"*. Esto coincide EXACTAMENTE con lo que Karla describió como el comportamiento actual deseado ("la configuración actual permite a las usuarias agendar sus clases libremente, lo cual facilita la recuperación de sesiones perdidas durante el mes"). **No hay nada que arreglar aquí — es una confirmación, no un bug.**
2. En esta misma sesión ya se encontró y corrigió un bug real de "agendamiento" para una clienta (Itzel): un plan mal asignado manualmente (p.ej. "3 clases al mes" en vez de "3 clases por semana") rompe la matemática de créditos disponibles que ve la clienta, y puede hacer que parezca que no puede reservar cuando sí tiene crédito. Dado que no hay más detalle de qué "problema de agendamiento" reportó Karla, el trabajo honesto y accionable es **auditar si existen más casos del mismo patrón** entre las membresías activas, no inventar un fix a ciegas.

**Entregable:** Un script SQL de auditoría (reutilizable) + un runbook corto de corrección manual (mismo patrón ya aplicado con Itzel).

**Files:**
- Create: `supabase/migrations/2026-07-01-audit-membership-plan-mismatch.sql`

- [ ] **Step 1: Escribir el script de auditoría**

Create: `supabase/migrations/2026-07-01-audit-membership-plan-mismatch.sql`

```sql
-- ============================================================================
-- AUDITORÍA (solo lectura) — membresías activas cuyo plan asignado no cuadra
-- con los créditos disponibles, el mismo patrón de bug que rompió el dashboard
-- de Itzel (plan "X al mes" en vez de "X por semana" asignado a mano).
--
-- Síntoma en la clienta: la tarjeta de membresía muestra "usadas" negativas,
-- porcentaje > 100%, o parece "sin créditos" aunque sí le queden clases.
-- Correr manualmente cuando Karla reporte otra clienta con problemas de
-- agendamiento/créditos "que no cuadran".
-- ============================================================================

-- 1) Membresías activas donde el LÍMITE del plan asignado es MENOR que los
--    créditos que la clienta todavía tiene disponibles (matemáticamente
--    imposible salvo que el plan esté mal asignado).
SELECT
  u.display_name AS clienta,
  u.email,
  u.phone,
  p.name          AS plan_asignado,
  p.class_limit   AS limite_del_plan,
  m.classes_remaining AS creditos_disponibles,
  m.created_at    AS membresia_creada,
  m.id            AS membership_id
FROM memberships m
JOIN users u ON u.id = m.user_id
JOIN plans p ON p.id = m.plan_id
WHERE m.status = 'active'
  AND p.class_limit IS NOT NULL          -- excluye planes ilimitados (online, etc.)
  AND m.classes_remaining IS NOT NULL
  AND m.classes_remaining > p.class_limit  -- imposible si el plan es el correcto
ORDER BY (m.classes_remaining - p.class_limit) DESC;

-- 2) Vista más amplia: membresías activas cuyo plan tiene "al mes" en el
--    nombre pero fueron creadas manualmente (order_id IS NULL) — candidatas a
--    revisar a mano aunque no disparen el caso (1), ya que "al mes" vs "por
--    semana" es la confusión de nombres real detectada (planes con precio
--    idéntico de estructura pero créditos muy distintos).
SELECT
  u.display_name AS clienta,
  u.email,
  p.name          AS plan_asignado,
  p.class_limit   AS limite_del_plan,
  m.classes_remaining AS creditos_disponibles,
  m.created_at    AS membresia_creada
FROM memberships m
JOIN users u ON u.id = m.user_id
JOIN plans p ON p.id = m.plan_id
WHERE m.status = 'active'
  AND m.order_id IS NULL              -- alta manual, no vino de una compra
  AND p.name ILIKE '%al mes%'
ORDER BY m.created_at DESC;

-- 3) Confirmación de la política de tope semanal (solo lectura, informativo).
--    Debe devolver 'false' — si algún día cambia a 'true' sin que Karla lo haya
--    pedido explícitamente, es una regresión a investigar antes de asumir que
--    es un bug de agendamiento distinto.
--    (Este valor vive en código, no en la BD: server/index.js:3612,
--    WEEKLY_LIMIT_ENABLED. Este bloque es solo un recordatorio de dónde está.)
```

- [ ] **Step 2: Correr la auditoría contra producción**

Run (usando el conector ya usado en esta sesión):

```bash
PGURL='postgresql://postgres:uQhMYMJZNlrRpDkEChLXOBhgXquqZiFI@autorack.proxy.rlwy.net:40908/railway'
psql "$PGURL" -X -P pager=off -f "/Users/saidromero/Desktop/Kala Studio/kala-Studio/supabase/migrations/2026-07-01-audit-membership-plan-mismatch.sql"
```

Expected: la primera consulta debería devolver 0 filas si Itzel fue el único caso (ya corregido). Si devuelve filas, cada una es una clienta con el mismo bug — corregirla a mano con el mismo patrón usado para Itzel: `UPDATE memberships SET plan_id = '<id del plan correcto>', weekly_extra_classes = 0, updated_at = NOW() WHERE id = '<membership_id>';` conservando `classes_remaining` sin tocar.

- [ ] **Step 3: Commit**

```bash
cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio"
git add "supabase/migrations/2026-07-01-audit-membership-plan-mismatch.sql"
git commit -m "chore: script de auditoría de membresías mal asignadas (agendamiento)

No se confirmó un bug nuevo de agendamiento en la reunión del 1-jul —
WEEKLY_LIMIT_ENABLED=false es una decisión de negocio ya documentada que
coincide con lo que Karla pidió. Este script deja lista la auditoría del
patrón real ya encontrado (plan mal asignado a mano, caso Itzel) para
correrla de nuevo si aparece otro reporte similar."
```

Nota: este script es de solo lectura (no modifica la BD), así que no requiere push/deploy — vive en el repo como herramienta reutilizable.

- [ ] **Step 4: Reportar a Karla**

Mensaje sugerido para Karla (o Said puede parafrasear): *"Revisé la configuración de agendamiento: el que las alumnas puedan mover/recuperar clases libremente dentro del mes es una configuración intencional que ya está activa (no es un bug). Dejé lista una auditoría para detectar si alguna clienta tiene el mismo problema de plan mal asignado que vimos con Itzel — la corrí y [encontré X casos que ya corregí / no encontré más casos]."*

---

## Task 6: Botones "Cancelar" y "No asistió" → texto legible

**Contexto (aclaración de Karla):** En la lista de reservas del admin (`src/pages/admin/bookings/BookingsList.tsx`, líneas 418-455) las acciones son **botones cuadrados de solo ícono** con tooltip (`title`): Check-in (✓ verde), No asistió (`UserX` rojo), Cancelar (`XCircle` naranja). Para una recepcionista que no memoriza íconos, no es claro qué hace cada uno. Karla pidió que los botones de **Cancelar** y **No asistió** muestren **texto**. Se convierten esos dos a botones con etiqueta de texto (el de Check-in se deja como está — no lo pidió, pero se mantiene el ícono para no saturar la fila; opcionalmente se le puede añadir texto igual si se ve inconsistente).

**Files:**
- Modify: `src/pages/admin/bookings/BookingsList.tsx:430-454` (botones No asistió y Cancelar)

- [ ] **Step 1: Convertir el botón "No asistió" a texto**

En `src/pages/admin/bookings/BookingsList.tsx`, reemplazar el botón de No asistió (líneas 430-439):

```tsx
                    {canNoShow && (
                      <button
                        onClick={() => noShowMutation.mutate(entry.bookingId)}
                        disabled={noShowMutation.isPending}
                        title="No asistió"
                        className="w-8 h-8 rounded-lg bg-[#f87171]/8 border border-[#f87171]/20 text-[#f87171]/70 hover:bg-[#f87171]/15 flex items-center justify-center transition-all disabled:opacity-40"
                      >
                        <UserX size={14} />
                      </button>
                    )}
```

por (mismo estilo de color, pero con ícono + texto y padding horizontal):

```tsx
                    {canNoShow && (
                      <button
                        onClick={() => noShowMutation.mutate(entry.bookingId)}
                        disabled={noShowMutation.isPending}
                        className="h-8 px-2.5 rounded-lg bg-[#f87171]/8 border border-[#f87171]/20 text-[#f87171]/80 hover:bg-[#f87171]/15 inline-flex items-center gap-1.5 text-xs font-medium transition-all disabled:opacity-40"
                      >
                        <UserX size={13} />
                        No asistió
                      </button>
                    )}
```

- [ ] **Step 2: Convertir el botón "Cancelar" a texto**

Reemplazar el botón de Cancelar (líneas 440-454, el que abre el `window.prompt` de motivo). Mantener TODA la lógica del `onClick` (el prompt de motivo + confirm + `cancelMutation`), solo cambiar el markup del botón para que muestre texto:

```tsx
                    {canCancel && (
                      <button
                        data-press
                        onClick={() => {
                          const reason = window.prompt(`Motivo de cancelación (opcional, va al WhatsApp de ${entry.userName || "la alumna"}):`, "");
                          if (reason === null) return; // user cancelled
                          if (!window.confirm(`¿Cancelar reserva de ${entry.userName || "esta alumna"}?\n\nSe devolverá el crédito a su paquete (si aplica).`)) return;
                          cancelMutation.mutate({ id: entry.bookingId, reason: reason || undefined });
                        }}
                        disabled={cancelMutation.isPending}
                        className="h-8 px-2.5 rounded-lg bg-[#E9745F]/8 border border-[#E9745F]/25 text-[#E9745F] hover:bg-[#E9745F]/15 inline-flex items-center gap-1.5 text-xs font-medium transition-all disabled:opacity-40"
                      >
                        <XCircle size={13} />
                        Cancelar
                      </button>
                    )}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio" && npm run build`
Expected: `✓ built in Xs`. Los imports `UserX` y `XCircle` ya existían (se siguen usando), no hay que tocar imports.

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Desktop/Kala Studio/kala-Studio"
git add src/pages/admin/bookings/BookingsList.tsx
git commit -m "feat(admin): botones Cancelar y No asistió con texto en reservas

A petición de Karla: los botones de solo-ícono (UserX / XCircle) en la lista
de reservas ahora muestran su etiqueta de texto, para que recepción los
identifique de un vistazo. La lógica (prompt de motivo, devolución de crédito)
no cambia."
```

- [ ] **Step 5: Push + verificación manual**

```bash
git push origin main
```
Verificar en `/admin/bookings` que los botones "No asistió" y "Cancelar" ahora se leen con texto. Confirmar que cancelar sigue pidiendo motivo y devolviendo crédito.

---

## Self-Review (completado por quien escribió el plan)

**1. Cobertura del spec:** Los 5 puntos de acción de la reunión tienen una Task dedicada (1↔"Configurar Mensaje", 2↔"Desactivar Punto Venta", 3↔"Configurar Recompensas" — reinterpretado como "mejorar visibilidad" ya que la configuración de recompensas en sí la hace Karla, no es código, 4↔"Enviar Captura"/bug de video, 5↔"Verificar Membresías"). Los puntos de acción de Karla ("Configurar Recompensas", "Enviar Captura", "Enviar Comprobante") no son tareas de código — se referencian en las notas de cada task donde aplica (Task 3 Step 6, Task 4 Step 5) pero no generan pasos de implementación propios.

**2. Placeholders:** Revisado — cada step tiene código completo y ejecutable, comandos exactos, y ninguna referencia a "TBD"/"implementar después".

**3. Consistencia de tipos/nombres:** `daily_message` (key de settings) se usa igual en el Step 1 (servidor), Step 2 (endpoint), Step 4 (admin UI) y Step 5-6 (cliente) de Task 1. `LoyaltySummary` se define en Task 3 Step 2 y se referencia en Task 3 Step 1 en el mismo archivo. `toggleFullscreen`/`videoRef`/`wrapRef` de Task 4 usan exactamente los mismos nombres que ya existían en el archivo original — no se inventaron nombres nuevos que rompan el resto del componente.
