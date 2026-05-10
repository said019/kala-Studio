import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Users, DollarSign, AlertCircle, Cake, TrendingUp, UserMinus } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, AreaChart, Area } from "recharts";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

interface Birthday {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  dateOfBirth: string;
  day: number;
  month: number;
  isToday: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Esperando pago",
  pending_verification: "Por verificar",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  active: "Activa",
  expired: "Expirada",
  frozen: "Congelada",
};

interface Stats {
  classesToday: number;
  activeMembers: number;
  monthlyRevenue: number;
  pendingAlerts: number;
  recentMemberships: { id: string; userName: string; planName: string; status: string; createdAt: string }[];
  pendingOrders: { id: string; userName: string; totalAmount?: number; total_amount?: number; amount?: number; status: string }[];
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get("/admin/stats")).data,
  });

  const { data: memberships } = useQuery<{ data: Stats["recentMemberships"] }>({
    queryKey: ["memberships-recent"],
    queryFn: async () => (await api.get("/memberships?limit=5")).data,
  });

  const { data: pendingOrders } = useQuery<{ data: Stats["pendingOrders"] }>({
    queryKey: ["orders-pending"],
    queryFn: async () => {
      const [v, p] = await Promise.all([
        api.get("/admin/orders?status=pending_verification"),
        api.get("/admin/orders?status=pending_payment"),
      ]);
      const merged = [
        ...(Array.isArray(v.data?.data) ? v.data.data : []),
        ...(Array.isArray(p.data?.data) ? p.data.data : []),
      ];
      return { data: merged };
    },
  });

  const { data: revenueData } = useQuery<any>({
    queryKey: ["dashboard-revenue"],
    queryFn: async () => (await api.get("/reports/revenue")).data,
  });
  const revenueRows: { month: string; amount: number }[] = Array.isArray(revenueData?.data)
    ? revenueData.data.map((r: any) => ({
        month: r.month ? new Date(r.month).toLocaleDateString("es-MX", { month: "short" }) : "",
        amount: Number(r.amount ?? 0),
      })).slice(-6)
    : [];

  const { data: dormantData } = useQuery<any>({
    queryKey: ["dashboard-dormant"],
    queryFn: async () => (await api.get("/reports/dormant")).data,
  });
  const dorm = dormantData?.data ?? null;
  const dormantRows = dorm ? [
    { label: "≤7d", value: dorm.active_7d, color: "#778455" },
    { label: "8-14d", value: dorm.dormant_8_14d, color: "#F58A24" },
    { label: "15-30d", value: dorm.dormant_15_30d, color: "#E9745F" },
    { label: "31-60d", value: dorm.dormant_31_60d, color: "#76214D" },
    { label: "60+d", value: dorm.lost_60d, color: "#888" },
  ] : [];

  const currentMonth = new Date().getMonth() + 1;
  const { data: birthdaysData, isLoading: loadingBirthdays } = useQuery<{
    month: number; total: number; todayCount: number; data: Birthday[];
  }>({
    queryKey: ["admin-birthdays", currentMonth],
    queryFn: async () => (await api.get(`/admin/birthdays?month=${currentMonth}`)).data,
  });
  const birthdays: Birthday[] = Array.isArray(birthdaysData?.data) ? birthdaysData.data : [];
  const todayBirthdays = birthdays.filter((b) => b.isToday);

  const metric = (label: string, value: number | undefined, icon: React.ReactNode, prefix = "", accent = "#E9745F") => (
    <Card className="border-t-2" style={{ borderTopColor: accent }}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span style={{ color: accent }}>{icon}</span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className="text-2xl font-bold">
            {prefix}{value ?? 0}
          </p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <AuthGuard requiredRoles={["admin", "instructor"]}>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

          {/* Metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {metric("Clases de hoy", stats?.classesToday, <CalendarDays size={18} />, "", "#E9745F")}
            {metric("Membresías activas", stats?.activeMembers, <Users size={18} />, "", "#76214D")}
            {metric("Ingresos del mes", stats?.monthlyRevenue, <DollarSign size={18} />, "$", "#F58A24")}
            {metric("Alertas pendientes", stats?.pendingAlerts, <AlertCircle size={18} />, "", "#F97316")}
          </div>

          {/* ── Mini charts row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate("/admin/reports")}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp size={15} className="text-[#76214D]" />
                  Ingresos últimos 6 meses
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {revenueRows.length === 0 ? (
                  <Skeleton className="h-[120px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={revenueRows} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                      <defs>
                        <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#76214D" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#76214D" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: any) => `$${Number(v).toLocaleString("es-MX")}`}
                        contentStyle={{ fontSize: 11, padding: 6 }}
                      />
                      <Area type="monotone" dataKey="amount" stroke="#76214D" strokeWidth={2} fill="url(#rev-grad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate("/admin/campaigns")}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserMinus size={15} className="text-[#E9745F]" />
                  Distribución por última visita
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {dormantRows.length === 0 ? (
                  <Skeleton className="h-[120px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={dormantRows} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: 11, padding: 6 }} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {dormantRows.map((row, i) => (
                          <rect key={i} fill={row.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <p className="text-[10px] text-muted-foreground text-center mt-1">
                  Click → reactivar via campaña
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Birthdays of the month — full width card */}
          <Card
            className="mb-6 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => navigate("/admin/clients?birthday=month")}
            style={todayBirthdays.length > 0 ? { borderColor: "#F58A24", borderTopWidth: 2 } : undefined}
          >
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Cake size={17} className="text-[#F58A24]" />
                  Cumpleaños de {MONTHS[currentMonth - 1]}
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    ({birthdays.length})
                  </span>
                </span>
                {todayBirthdays.length > 0 && (
                  <Badge style={{ backgroundColor: "#F58A24", color: "#FFF7F2" }} className="text-xs">
                    {todayBirthdays.length} {todayBirthdays.length === 1 ? "es hoy" : "son hoy"}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBirthdays ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : birthdays.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ninguna alumna cumple años en {MONTHS[currentMonth - 1]}.
                </p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 list-none m-0 p-0">
                  {birthdays.map((b) => {
                    const initials = b.displayName.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
                    return (
                      <li
                        key={b.id}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
                        style={{
                          backgroundColor: b.isToday ? "#F58A2418" : "transparent",
                          border: `1px solid ${b.isToday ? "#F58A2455" : "#E8CAC1"}`,
                        }}
                      >
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full overflow-hidden text-[0.7rem] font-bold text-white"
                          style={{ backgroundColor: b.isToday ? "#F58A24" : "#76214D" }}
                        >
                          {b.photoUrl ? (
                            <img src={b.photoUrl} alt="" className="h-full w-full object-cover" />
                          ) : initials || "·"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{b.displayName}</p>
                          {b.phone && (
                            <p className="text-[0.72rem] text-muted-foreground truncate">{b.phone}</p>
                          )}
                        </div>
                        <span
                          className="text-[0.7rem] font-bold tabular-nums px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: b.isToday ? "#F58A24" : "transparent",
                            color: b.isToday ? "#FFF7F2" : "#76214D",
                            border: b.isToday ? "0" : "1px solid #76214D33",
                          }}
                        >
                          {b.isToday ? "HOY" : `${b.day} ${MONTHS[b.month - 1].slice(0, 3)}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent memberships */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Últimas membresías</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading
                  ? Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                  : (Array.isArray(memberships?.data) ? memberships.data : []).map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium">{m.userName}</p>
                          <p className="text-muted-foreground text-xs">{m.planName}</p>
                        </div>
                        <Badge
                          variant={m.status === "active" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {STATUS_LABEL[m.status] ?? m.status}
                        </Badge>
                      </div>
                    ))}
                {(!memberships?.data || memberships.data.length === 0) && !isLoading && (
                  <p className="text-sm text-muted-foreground">Sin membresías recientes.</p>
                )}
              </CardContent>
            </Card>

            {/* Pending orders */}
            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate("/admin/orders")}
            >
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  Órdenes pendientes
                  <span className="text-xs text-muted-foreground font-normal">Click para ver →</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading
                  ? Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
                  : (Array.isArray(pendingOrders?.data) ? pendingOrders.data : []).map((o) => (
                      <div key={o.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium">{o.userName}</p>
                          <p className="text-muted-foreground text-xs">${Number(o.totalAmount ?? o.total_amount ?? o.amount ?? 0).toFixed(2)} MXN</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {STATUS_LABEL[o.status] ?? o.status}
                        </Badge>
                      </div>
                    ))}
                {(!pendingOrders?.data || pendingOrders.data.length === 0) && !isLoading && (
                  <p className="text-sm text-muted-foreground">Sin órdenes pendientes.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default Dashboard;
