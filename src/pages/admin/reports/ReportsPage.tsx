import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Area, AreaChart, Cell,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, Download, Printer, AlertTriangle } from "lucide-react";

/* ════════════════════════════════════════════════════════════════
   ReportsPage — product register, Impeccable principles
   ════════════════════════════════════════════════════════════════ */

// Kala palette references
const C = {
  ink: "#2E201C",
  berry: "#76214D",
  coral: "#E9745F",
  olive: "#778455",
  orange: "#F58A24",
  cream: "#FFF7F2",
  blush: "#FCE6E1",
  border: "#E8CAC1",
  muted: "rgba(46,32,28,0.55)",
};

type RangeKey = "this_month" | "30d" | "90d" | "ytd";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "this_month", label: "Este mes" },
  { key: "30d", label: "Últimos 30 días" },
  { key: "90d", label: "Últimos 90 días" },
  { key: "ytd", label: "Año en curso" },
];

function rangeToDates(r: RangeKey): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  let from: string;
  if (r === "this_month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  } else if (r === "30d") {
    const d = new Date(now); d.setDate(d.getDate() - 30);
    from = d.toISOString().slice(0, 10);
  } else if (r === "90d") {
    const d = new Date(now); d.setDate(d.getDate() - 90);
    from = d.toISOString().slice(0, 10);
  } else {
    from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  }
  return { from, to };
}

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const safeArray = (v: any) => (Array.isArray(v) ? v : []);
const fmtMonth = (raw: any) => {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return new Intl.DateTimeFormat("es-MX", { month: "short" }).format(d);
};

/* ═══════════ Delta indicator (▲ +12% green / ▼ -3% red) ═══════════ */
function Delta({ pct, suffix = "" }: { pct: number | undefined; suffix?: string }) {
  if (pct === undefined || pct === null || Number.isNaN(pct)) return null;
  const isUp = pct > 0;
  const isFlat = Math.abs(pct) < 0.5;
  const color = isFlat ? C.muted : isUp ? C.olive : C.coral;
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color }}>
      <Icon size={11} strokeWidth={2.2} />
      {isFlat ? "sin cambio" : `${isUp ? "+" : ""}${pct.toFixed(1)}%${suffix}`}
    </span>
  );
}

/* ═══════════ Sparkline (tiny inline chart) ═══════════ */
function Sparkline({ data, color, height = 30 }: { data: number[]; color: string; height?: number }) {
  if (!data || data.length === 0) return <div style={{ height }} />;
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color.replace("#", "")})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ═══════════ Hero KPI (1 grande) ═══════════ */
function HeroKPI({
  label, value, delta, deltaSuffix, sparkData, sparkColor, loading,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  sparkData?: number[];
  sparkColor?: string;
  loading?: boolean;
}) {
  return (
    <Card className="border-2" style={{ borderColor: C.border, backgroundColor: C.cream }} data-stagger-item>
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="text-[11px] uppercase tracking-[0.18em] font-medium" style={{ color: C.muted }}>
            {label}
          </p>
          <Delta pct={delta} suffix={deltaSuffix} />
        </div>
        {loading ? (
          <Skeleton className="h-10 w-32" />
        ) : (
          <p className="font-bebas leading-none" style={{ color: C.ink, fontSize: "clamp(2.2rem, 4vw, 3rem)" }}>
            {value}
          </p>
        )}
        {sparkData && sparkData.length > 0 && (
          <div className="mt-3 -mx-1">
            <Sparkline data={sparkData} color={sparkColor || C.berry} height={42} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════ Secondary KPI (3 medianos) ═══════════ */
function SecondaryKPI({
  label, value, delta, deltaSuffix, accent, loading,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  accent: string;
  loading?: boolean;
}) {
  return (
    <Card style={{ borderColor: C.border }} data-stagger-item>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
          <p className="text-[10px] uppercase tracking-[0.16em] font-medium" style={{ color: C.muted }}>
            {label}
          </p>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <p className="font-bebas leading-none" style={{ color: C.ink, fontSize: "1.7rem" }}>{value}</p>
        )}
        {delta !== undefined && (
          <div className="mt-1.5">
            <Delta pct={delta} suffix={deltaSuffix} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════ Strip stat (mini compactos) ═══════════ */
function StripStat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="px-3 py-2.5 border-l-2" style={{ borderLeftColor: accent || C.border }} data-stagger-item>
      <p className="text-[9px] uppercase tracking-[0.18em]" style={{ color: C.muted }}>{label}</p>
      <p className="font-bebas leading-none mt-1" style={{ color: C.ink, fontSize: "1.15rem" }}>{value}</p>
    </div>
  );
}

/* ═══════════ Action panel — sugerencias contextuales ═══════════ */
function ActionPanel({ dorm, conv, cancelRate, cancelled, navigate }: { dorm: any; conv: any; cancelRate?: number; cancelled?: number; navigate: (p: string) => void }) {
  const actions: { icon: any; label: string; cta: string; link: string; tone: string }[] = [];
  if (cancelRate !== undefined && cancelRate >= 15 && (cancelled ?? 0) >= 3) {
    actions.push({
      icon: AlertTriangle,
      label: `Cancelaciones altas: ${cancelRate.toFixed(1)}% (${cancelled} canceladas)`,
      cta: "Revisar política",
      link: "/admin/whatsapp-templates",
      tone: C.coral,
    });
  }
  if (dorm) {
    const r60 = Number(dorm.lost_60d || 0);
    if (r60 >= 3) {
      actions.push({
        icon: AlertTriangle,
        label: `${r60} alumnas perdidas (60+ días)`,
        cta: "Win-back con descuento",
        link: "/admin/discount-codes",
        tone: C.orange,
      });
    }
  }
  if (actions.length === 0) return null;
  return (
    <Card className="mb-6" style={{ borderColor: C.border, backgroundColor: C.blush }}>
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: C.berry }}>
          Acciones sugeridas
        </p>
        <div className="space-y-2">
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <div key={i} className="flex items-center justify-between gap-3 p-2.5 rounded-lg" style={{ backgroundColor: C.cream }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon size={15} style={{ color: a.tone }} />
                  <span className="text-[13px] truncate" style={{ color: C.ink }}>{a.label}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate(a.link)}
                  data-press
                  className="text-white shrink-0"
                  style={{ backgroundColor: a.tone }}
                >
                  {a.cta}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════ CSV export helper ═══════════ */
function downloadCSV(filename: string, rows: any[], columns: { key: string; label: string }[]) {
  if (!rows || rows.length === 0) return;
  const head = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows.map((r) =>
    columns.map((c) => {
      const v = r[c.key];
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    }).join(","),
  ).join("\n");
  const csv = "﻿" + head + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════ Tab pill ═══════════ */
function TabPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      data-press
      className="px-4 py-2 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap"
      style={{
        backgroundColor: active ? C.berry : "transparent",
        color: active ? C.cream : C.ink,
        border: `1px solid ${active ? C.berry : C.border}`,
      }}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════ */
const ReportsPage = () => {
  const navigate = useNavigate();
  const [rangeKey, setRangeKey] = useState<RangeKey>("this_month");
  const [tab, setTab] = useState<"revenue" | "classes" | "retention" | "top" | "instructors">("revenue");
  const dateRange = useMemo(() => rangeToDates(rangeKey), [rangeKey]);

  const { data: overview, isLoading } = useQuery({
    queryKey: ["reports-overview", dateRange.from, dateRange.to],
    queryFn: async () => (await api.get(`/reports/overview?from=${dateRange.from}&to=${dateRange.to}`)).data,
  });
  const o = overview?.data ?? {};
  const deltas = o.deltas ?? {};

  const { data: revenue } = useQuery({
    queryKey: ["reports-revenue"],
    queryFn: async () => (await api.get("/reports/revenue")).data,
  });
  const { data: revSparkData } = useQuery({
    queryKey: ["reports-revenue-sparkline"],
    queryFn: async () => (await api.get("/reports/revenue-sparkline")).data,
  });
  const revSparkValues = safeArray(revSparkData?.data).map((r: any) => Number(r.amount || 0));

  const { data: classes } = useQuery({
    queryKey: ["reports-classes"],
    queryFn: async () => (await api.get("/reports/classes")).data,
  });
  const { data: retention } = useQuery({
    queryKey: ["reports-retention"],
    queryFn: async () => (await api.get("/reports/retention")).data,
  });
  const { data: instructors } = useQuery({
    queryKey: ["reports-instructors"],
    queryFn: async () => (await api.get("/reports/instructors")).data,
  });
  const { data: topAttendance } = useQuery({
    queryKey: ["reports-top-attendance"],
    queryFn: async () => (await api.get("/reports/top-attendance?limit=10")).data,
  });
  const { data: conversion } = useQuery({
    queryKey: ["reports-conversion"],
    queryFn: async () => (await api.get("/reports/conversion")).data,
  });
  const { data: dormant } = useQuery({
    queryKey: ["reports-dormant"],
    queryFn: async () => (await api.get("/reports/dormant")).data,
  });

  const revenueData = safeArray(revenue?.data).map((row: any) => ({
    month: fmtMonth(row.month),
    amount: Number(row.amount ?? 0),
  })).slice(-12);
  const classesData = safeArray(classes?.data).map((row: any) => ({
    label: row.name ?? "—",
    bookings: Number(row.bookings ?? 0),
    attended: Number(row.attended ?? 0),
  }));
  const retentionData = safeArray(retention?.data).map((row: any) => ({
    month: fmtMonth(row.month),
    rate: Number(row.rate ?? 0),
  }));
  const topAttendanceData = safeArray(topAttendance?.data);
  const instructorsData = safeArray(instructors?.data);
  const conv = conversion?.data ?? null;
  const dorm = dormant?.data ?? null;

  /* ── CSV exports ── */
  const exportRevenueCsv = () => {
    downloadCSV("ingresos-12-meses.csv", revenueData, [
      { key: "month", label: "Mes" },
      { key: "amount", label: "Ingresos (MXN)" },
    ]);
  };
  const exportTopCsv = () => {
    downloadCSV("top-alumnas.csv", topAttendanceData, [
      { key: "display_name", label: "Alumna" },
      { key: "phone", label: "Teléfono" },
      { key: "lifetime", label: "Asistencias lifetime" },
      { key: "this_month", label: "Asistencias este mes" },
      { key: "last_visit", label: "Última visita" },
    ]);
  };
  const exportRetentionCsv = () => {
    downloadCSV("retencion-12-meses.csv", retentionData, [
      { key: "month", label: "Mes" },
      { key: "rate", label: "% Retención" },
    ]);
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          {/* ═════ Header con range picker ═════ */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-7">
            <div>
              <h1 className="font-bebas leading-none mb-1" style={{ color: C.ink, fontSize: "2.2rem" }}>
                Reportes
              </h1>
              <p className="text-[13px]" style={{ color: C.muted }}>
                Última actualización · {new Date().toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {RANGES.map((r) => (
                <TabPill key={r.key} active={rangeKey === r.key} onClick={() => setRangeKey(r.key)}>
                  {r.label}
                </TabPill>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.print()}
                data-press
                className="hidden sm:inline-flex"
                style={{ borderColor: C.border }}
              >
                <Printer size={13} className="mr-1.5" /> Imprimir
              </Button>
            </div>
          </div>

          {/* ═════ Action panel (top-priority CTAs) ═════ */}
          <ActionPanel
            dorm={dorm}
            conv={conv}
            cancelRate={o.cancelRate}
            cancelled={o.cancelledBookings}
            navigate={navigate}
          />

          {/* ═════ KPI Layout: 1 Hero + 3 Secondary + 4 Strip ═════ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-3" data-stagger>
            {/* Hero: ingresos */}
            <div className="lg:col-span-6">
              <HeroKPI
                label="Ingresos del período"
                value={fmtMoney(o.monthlyRevenue || 0)}
                delta={deltas.revenue}
                sparkData={revSparkValues}
                sparkColor={C.berry}
                loading={isLoading}
              />
            </div>
            {/* 3 secondary */}
            <div className="lg:col-span-2">
              <SecondaryKPI
                label="Miembros activos"
                value={String(o.activeMembers ?? "—")}
                accent={C.olive}
                loading={isLoading}
              />
            </div>
            <div className="lg:col-span-2">
              <SecondaryKPI
                label="Ocupación"
                value={fmtPct(o.classOccupancyRate || 0)}
                delta={deltas.occupancy}
                accent={C.orange}
                loading={isLoading}
              />
            </div>
            <div className="lg:col-span-2">
              <SecondaryKPI
                label="Churn 30d"
                value={fmtPct(o.churnRate || 0)}
                accent={C.coral}
                loading={isLoading}
              />
            </div>
          </div>

          {/* Strip de stats compactos */}
          <Card className="mb-6" style={{ borderColor: C.border }}>
            <CardContent className="p-2">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-0" data-stagger>
                <StripStat
                  label="Reservas"
                  value={String(o.monthlyBookings ?? 0)}
                  accent={C.berry}
                />
                <StripStat
                  label="Canceladas"
                  value={`${o.cancelledBookings ?? 0} · ${(o.cancelRate ?? 0).toFixed(1)}%`}
                  accent={C.coral}
                />
                <StripStat
                  label="Nuevos miembros"
                  value={String(o.newMembersThisMonth ?? 0)}
                  accent={C.olive}
                />
                <StripStat
                  label="Reseñas"
                  value={String(o.reviewsTotal ?? 0)}
                  accent={C.orange}
                />
                <StripStat
                  label="Promedio ⭐"
                  value={o.reviewsAverage ? Number(o.reviewsAverage).toFixed(1) : "—"}
                  accent={C.berry}
                />
              </div>
            </CardContent>
          </Card>

          {/* ═════ Conversión + dormant cohorts (side-by-side cuando aplica) ═════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
            {conv && (
              <Card style={{ borderColor: C.border }} data-stagger-item>
                <CardContent className="p-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: C.muted }}>
                    Conversión muestra → paquete
                  </p>
                  <div className="flex items-baseline gap-3">
                    <span className="font-bebas" style={{ color: C.berry, fontSize: "2.5rem", lineHeight: 1 }}>
                      {conv.conversion_rate ?? 0}%
                    </span>
                    <span className="text-[12px]" style={{ color: C.muted }}>
                      {conv.converted_total ?? 0} de {conv.muestras_total ?? 0} muestras
                    </span>
                  </div>
                  <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.blush }}>
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{
                        width: `${conv.conversion_rate || 0}%`,
                        background: `linear-gradient(90deg, ${C.berry}, ${C.coral})`,
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
            {dorm && (
              <Card style={{ borderColor: C.border }} data-stagger-item>
                <CardContent className="p-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: C.muted }}>
                    Por última visita
                  </p>
                  <div className="grid grid-cols-5 gap-1 text-center">
                    {[
                      { l: "≤7d", v: dorm.active_7d, c: C.olive },
                      { l: "8-14", v: dorm.dormant_8_14d, c: C.orange },
                      { l: "15-30", v: dorm.dormant_15_30d, c: C.coral },
                      { l: "31-60", v: dorm.dormant_31_60d, c: C.berry },
                      { l: "60+", v: dorm.lost_60d, c: C.muted },
                    ].map((b) => (
                      <div key={b.l}>
                        <p className="font-bebas leading-none" style={{ color: b.c, fontSize: "1.5rem" }}>{b.v ?? 0}</p>
                        <p className="text-[9px] uppercase tracking-[0.14em] mt-1" style={{ color: C.muted }}>{b.l}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ═════ Tabs pills (no shadcn TabsList) ═════ */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <TabPill active={tab === "revenue"} onClick={() => setTab("revenue")}>Ingresos</TabPill>
              <TabPill active={tab === "classes"} onClick={() => setTab("classes")}>Clases</TabPill>
              <TabPill active={tab === "retention"} onClick={() => setTab("retention")}>Retención</TabPill>
              <TabPill active={tab === "top"} onClick={() => setTab("top")}>Top alumnas</TabPill>
              <TabPill active={tab === "instructors"} onClick={() => setTab("instructors")}>Instructoras</TabPill>
            </div>
            {/* Export CSV button changes per tab */}
            {tab === "revenue" && revenueData.length > 0 && (
              <Button size="sm" variant="outline" onClick={exportRevenueCsv} data-press style={{ borderColor: C.border }}>
                <Download size={13} className="mr-1.5" /> Exportar CSV
              </Button>
            )}
            {tab === "top" && topAttendanceData.length > 0 && (
              <Button size="sm" variant="outline" onClick={exportTopCsv} data-press style={{ borderColor: C.border }}>
                <Download size={13} className="mr-1.5" /> Exportar CSV
              </Button>
            )}
            {tab === "retention" && retentionData.length > 0 && (
              <Button size="sm" variant="outline" onClick={exportRetentionCsv} data-press style={{ borderColor: C.border }}>
                <Download size={13} className="mr-1.5" /> Exportar CSV
              </Button>
            )}
          </div>

          {/* ═════ Tab content ═════ */}
          <Card style={{ borderColor: C.border, backgroundColor: C.cream }}>
            <CardContent className="p-5">
              {tab === "revenue" && (
                revenueData.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm mb-2" style={{ color: C.muted }}>Aún no hay órdenes en este período.</p>
                    <Button size="sm" onClick={() => navigate("/admin/orders")} data-press style={{ backgroundColor: C.berry, color: C.cream }}>
                      Ver órdenes
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: C.muted }}>
                      Ingresos mensuales · últimos 12 meses
                    </p>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={revenueData} margin={{ top: 10, right: 5, left: 5, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={{ fontSize: 12, borderColor: C.border }} />
                        <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                          {revenueData.map((_, i) => (
                            <Cell key={i} fill={i === revenueData.length - 1 ? C.berry : C.coral} fillOpacity={i === revenueData.length - 1 ? 1 : 0.55} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                )
              )}

              {tab === "classes" && (
                classesData.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm" style={{ color: C.muted }}>Aún no hay clases con reservas.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: C.muted }}>
                      Reservas vs asistencias por tipo
                    </p>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={classesData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} />
                        <YAxis tick={{ fontSize: 11, fill: C.muted }} />
                        <Tooltip contentStyle={{ fontSize: 12, borderColor: C.border }} />
                        <Bar dataKey="bookings" fill={C.berry} radius={[4, 4, 0, 0]} name="Reservas" />
                        <Bar dataKey="attended" fill={C.olive} radius={[4, 4, 0, 0]} name="Asistencias" />
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                )
              )}

              {tab === "retention" && (
                retentionData.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm" style={{ color: C.muted }}>Sin data de retención todavía.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: C.muted }}>
                      Tasa de retención mensual · 12 meses
                    </p>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={retentionData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.muted }} />
                        <YAxis tick={{ fontSize: 11, fill: C.muted }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                        <Tooltip formatter={(v: any) => `${v}%`} contentStyle={{ fontSize: 12, borderColor: C.border }} />
                        <Line
                          type="monotone"
                          dataKey="rate"
                          stroke={C.olive}
                          strokeWidth={2.5}
                          dot={{ fill: C.olive, r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </>
                )
              )}

              {tab === "top" && (
                topAttendanceData.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm" style={{ color: C.muted }}>Aún no hay asistencias registradas.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {topAttendanceData.map((u: any, idx: number) => {
                      const maxLifetime = Math.max(...topAttendanceData.map((x: any) => Number(x.lifetime || 0)));
                      const pct = maxLifetime > 0 ? (Number(u.lifetime || 0) / maxLifetime) * 100 : 0;
                      return (
                        <div key={u.id} className="flex items-center gap-3 py-2" style={{ borderBottom: idx < topAttendanceData.length - 1 ? `1px solid ${C.border}` : "none" }}>
                          <span
                            className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold shrink-0"
                            style={{
                              backgroundColor: idx < 3 ? C.berry : C.blush,
                              color: idx < 3 ? C.cream : C.berry,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium truncate" style={{ color: C.ink }}>{u.display_name}</p>
                            <p className="text-[11px] mt-0.5" style={{ color: C.muted }}>
                              {u.this_month} este mes · última {u.last_visit ? new Date(u.last_visit).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "—"}
                            </p>
                          </div>
                          <div className="w-32 h-1.5 rounded-full overflow-hidden hidden sm:block" style={{ backgroundColor: C.blush }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: C.berry }} />
                          </div>
                          <Badge variant="default" className="shrink-0" style={{ backgroundColor: C.ink, color: C.cream }}>
                            {u.lifetime}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {tab === "instructors" && (
                instructorsData.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm mb-2" style={{ color: C.muted }}>Aún no hay instructoras con clases.</p>
                    <Button size="sm" onClick={() => navigate("/admin/staff")} data-press style={{ backgroundColor: C.berry, color: C.cream }}>
                      Crear instructora
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {instructorsData.map((ins: any) => {
                      const max = Math.max(...instructorsData.map((x: any) => Number(x.classCount || x.class_count || 0)));
                      const count = Number(ins.classCount || ins.class_count || 0);
                      const pct = max > 0 ? (count / max) * 100 : 0;
                      return (
                        <div key={ins.id} className="flex items-center justify-between text-sm gap-3">
                          <span className="font-medium truncate flex-1" style={{ color: C.ink }}>{ins.name || ins.display_name}</span>
                          <div className="flex items-center gap-3">
                            <div className="w-40 h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.blush }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: C.berry }} />
                            </div>
                            <span className="font-bebas w-8 text-right" style={{ color: C.ink }}>{count}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default ReportsPage;
