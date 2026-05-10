import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const ReportsPage = () => {
  const { data: overview, isLoading } = useQuery({
    queryKey: ["reports-overview"],
    queryFn: async () => (await api.get("/reports/overview")).data,
  });

  const { data: revenue } = useQuery({
    queryKey: ["reports-revenue"],
    queryFn: async () => (await api.get("/reports/revenue")).data,
  });

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

  const { data: reviewsData } = useQuery({
    queryKey: ["reports-evaluations"],
    queryFn: async () => (await api.get("/admin/reviews")).data,
  });

  const o = overview?.data ?? overview ?? {};

  const safeArray = (v: any) => (Array.isArray(v) ? v : []);
  const fmtMonth = (raw: any) => {
    if (!raw) return "—";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    return new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit" }).format(d);
  };

  const revenueRows = safeArray(revenue?.data ?? revenue);
  const revenueDataRaw = revenueRows.map((row: any) => ({
    month: fmtMonth(row.month),
    amount: Number(row.amount ?? row.total ?? 0),
    count: Number(row.count ?? 0),
  })).reverse();
  const revenueData = revenueDataRaw.length
    ? revenueDataRaw
    : Array.from({ length: 6 }).map((_, idx) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (5 - idx));
        return { month: fmtMonth(d), amount: 0, count: 0 };
      });

  const classesData = safeArray(classes?.data ?? classes).map((row: any) => ({
    label: row.name ?? row.week ?? "—",
    bookings: Number(row.bookings ?? row.count ?? 0),
    attended: Number(row.attended ?? 0),
  }));
  const retentionData = safeArray(retention?.data ?? retention).map((row: any) => ({
    month: fmtMonth(row.month),
    rate: Number(row.rate ?? 0),
    active: Number(row.active ?? 0),
    retained: Number(row.retained ?? 0),
  }));
  const topAttendanceData = safeArray(topAttendance?.data ?? topAttendance);
  const conv = conversion?.data ?? conversion ?? null;
  const dorm = dormant?.data ?? dormant ?? null;
  const instructorsData = safeArray(instructors?.data ?? instructors).map((ins: any, idx: number) => ({
    id: String(ins.id ?? `ins-${idx}`),
    name: String(ins.name ?? ins.display_name ?? "Instructor"),
    classCount: Number(ins.classCount ?? ins.classes_taught ?? 0),
    totalStudents: Number(ins.totalStudents ?? ins.total_students ?? 0),
  }));
  const reviews = safeArray(reviewsData?.data ?? reviewsData)
    .slice(0, 8)
    .map((row: any, idx: number) => ({
      id: String(row.id ?? `review-${idx}`),
      userName: String(row.user_name ?? row.userName ?? "Clienta"),
      classTypeName: String(row.class_type_name ?? row.classTypeName ?? "Clase"),
      rating: Number(row.rating ?? 0),
      comment: String(row.comment ?? "").trim(),
      isApproved: Boolean(row.is_approved ?? row.isApproved),
      createdAt: row.created_at ?? row.createdAt ?? null,
    }));

  const metric = (label: string, value: string | number | undefined, suffix = "") => (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-bold">{value ?? "—"}{suffix}</p>}
      </CardContent>
    </Card>
  );

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          <h1 className="text-2xl font-bold mb-6">Reportes</h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {metric("Miembros activos", o.activeMembers)}
            {metric("Ingresos del mes", o.monthlyRevenue ? `$${Number(o.monthlyRevenue).toLocaleString("es-MX")}` : undefined)}
            {metric("Reservas del mes", o.monthlyBookings)}
            {metric("Ocupación", o.classOccupancyRate, "%")}
            {metric("Nuevos del mes", o.newMembersThisMonth)}
            {metric("Churn (30d)", o.churnRate, "%")}
            {metric("Reseñas (mes)", o.reviewsTotal)}
            {metric("Promedio ⭐", o.reviewsAverage ? Number(o.reviewsAverage).toFixed(1) : "—")}
          </div>

          {/* ── Conversión clase muestra → paquete ── */}
          {conv && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Conversión clase muestra → paquete</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Muestras tomadas</p>
                    <p className="text-2xl font-bold">{conv.muestras_total ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Convirtieron</p>
                    <p className="text-2xl font-bold text-[#778455]">{conv.converted_total ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tasa de conversión</p>
                    <p className="text-2xl font-bold text-[#76214D]">{conv.conversion_rate ?? 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Dormant cohort ── */}
          {dorm && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Distribución por última visita</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Activas (≤7d)</p>
                    <p className="text-xl font-bold text-[#778455]">{dorm.active_7d ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">8–14 días</p>
                    <p className="text-xl font-bold text-[#F58A24]">{dorm.dormant_8_14d ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">15–30 días</p>
                    <p className="text-xl font-bold text-[#E9745F]">{dorm.dormant_15_30d ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">31–60 días</p>
                    <p className="text-xl font-bold text-[#76214D]">{dorm.dormant_31_60d ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Perdidas (60+)</p>
                    <p className="text-xl font-bold text-muted-foreground">{dorm.lost_60d ?? 0}</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Tip: usa /admin/campañas con segmento dormant_14d o dormant_30d para reactivar.
                </p>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="revenue">
            <TabsList>
              <TabsTrigger value="revenue">Ingresos</TabsTrigger>
              <TabsTrigger value="classes">Clases</TabsTrigger>
              <TabsTrigger value="retention">Retención</TabsTrigger>
              <TabsTrigger value="top">Top alumnas</TabsTrigger>
              <TabsTrigger value="instructors">Instructoras</TabsTrigger>
            </TabsList>

            <TabsContent value="revenue" className="mt-4">
              <Card>
                <CardHeader><CardTitle>Ingresos mensuales</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Ingresos" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="classes" className="mt-4">
              <Card>
                <CardHeader><CardTitle>Clases por semana</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={classesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="bookings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="attended" fill="#E9745F" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="retention" className="mt-4">
              <Card>
                <CardHeader><CardTitle>Retención de miembros</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={retentionData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="top" className="mt-4">
              <Card>
                <CardHeader><CardTitle>Top alumnas por asistencia (lifetime)</CardTitle></CardHeader>
                <CardContent>
                  {topAttendanceData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aún no hay asistencias registradas.</p>
                  ) : (
                    <div className="space-y-2">
                      {topAttendanceData.slice(0, 10).map((u: any, idx: number) => (
                        <div key={u.id} className="flex items-center gap-3 text-sm">
                          <span className="w-6 text-center font-bold text-muted-foreground">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{u.display_name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {u.this_month} este mes · última visita {u.last_visit ? new Date(u.last_visit).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "—"}
                            </p>
                          </div>
                          <Badge variant="default">{u.lifetime} clases</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="instructors" className="mt-4">
              <Card>
                <CardHeader><CardTitle>Clases por instructor</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {instructorsData.map((ins) => (
                      <div key={ins.id} className="flex items-center justify-between text-sm">
                        <span>{ins.name}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-40 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (ins.classCount / 30) * 100)}%` }} />
                          </div>
                          <span className="font-medium w-8 text-right">{ins.classCount}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Evaluaciones recientes</CardTitle>
            </CardHeader>
            <CardContent>
              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay evaluaciones registradas.</p>
              ) : (
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <div key={review.id} className="flex flex-col gap-2 rounded-xl border border-border/70 p-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {review.userName} · {review.classTypeName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {review.createdAt ? new Date(review.createdAt).toLocaleString("es-MX") : "Fecha no disponible"}
                        </p>
                        <p className="mt-1 text-sm text-foreground/90">
                          {review.comment || "Sin comentario"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{review.rating}/5</Badge>
                        <Badge variant={review.isApproved ? "default" : "secondary"}>
                          {review.isApproved ? "Aprobada" : "Pendiente"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default ReportsPage;
