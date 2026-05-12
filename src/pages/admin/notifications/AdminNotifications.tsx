import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UserPlus, ShoppingBag, Trophy, CheckCircle2, MessageCircle,
  XCircle, AlertCircle, Bell, BellOff,
} from "lucide-react";

type Category =
  | "new_user" | "order_pending" | "milestone" | "checkin"
  | "campaign" | "order_rejected" | "expiring";

interface Notif {
  id: string;
  category: Category;
  title: string;
  body: string;
  time: string;
  link?: string;
}

const ICON: Record<Category, React.ReactNode> = {
  new_user: <UserPlus size={16} />,
  order_pending: <ShoppingBag size={16} />,
  milestone: <Trophy size={16} />,
  checkin: <CheckCircle2 size={16} />,
  campaign: <MessageCircle size={16} />,
  order_rejected: <XCircle size={16} />,
  expiring: <AlertCircle size={16} />,
};

const ACCENT: Record<Category, string> = {
  new_user: "#778455",
  order_pending: "#F58A24",
  milestone: "#F58A24",
  checkin: "#778455",
  campaign: "#76214D",
  order_rejected: "#B23A48",
  expiring: "#E9745F",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return `Hoy · ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Ayer · ${format(d, "HH:mm")}`;
  const days = differenceInDays(new Date(), d);
  if (days < 7) return format(d, "EEEE 'a las' HH:mm", { locale: es });
  return format(d, "d MMM 'a las' HH:mm", { locale: es });
}

const CATEGORY_LABEL: Record<Category, string> = {
  new_user: "Nuevas alumnas",
  order_pending: "Órdenes pendientes",
  milestone: "Logros otorgados",
  checkin: "Check-ins",
  campaign: "Campañas",
  order_rejected: "Órdenes rechazadas",
  expiring: "Membresías por vencer",
};

const AdminNotifications = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery<{ data: Notif[] }>({
    queryKey: ["admin-notifications"],
    queryFn: async () => (await api.get("/admin/notifications?limit=60")).data,
    refetchInterval: 30_000,
  });
  const items = Array.isArray(data?.data) ? data!.data : [];

  // Stats por categoría (últimos 30d)
  const counts = items.reduce<Record<Category, number>>((acc, n) => {
    acc[n.category] = (acc[n.category] || 0) + 1;
    return acc;
  }, {} as Record<Category, number>);

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-4xl">
          <div className="flex items-center gap-2 mb-1">
            <Bell size={20} className="text-[#76214D]" />
            <h1 className="text-2xl font-bold">Bandeja del studio</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Eventos recientes: nuevas alumnas, órdenes pendientes, logros, check-ins y más.
          </p>

          {/* Stats por categoría */}
          {!isLoading && items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-6" data-stagger>
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
                <Card key={cat} data-stagger-item className="border-l-2" style={{ borderLeftColor: ACCENT[cat] }}>
                  <CardContent className="p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{CATEGORY_LABEL[cat]}</p>
                    <p className="text-xl font-bold mt-0.5" style={{ color: ACCENT[cat] }}>
                      {counts[cat] || 0}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Feed */}
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <BellOff size={28} className="mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">Sin novedades</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Aquí van a aparecer reservas, registros, órdenes y demás eventos del studio.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        data-press
                        onClick={() => n.link && navigate(n.link)}
                        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                      >
                        <span
                          className="grid h-9 w-9 place-items-center rounded-full shrink-0"
                          style={{ backgroundColor: `${ACCENT[n.category]}20`, color: ACCENT[n.category] }}
                        >
                          {ICON[n.category]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {n.body}
                            <span className="opacity-60"> · {formatTime(n.time)}</span>
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <p className="text-[11px] text-muted-foreground mt-6">
            Actualización automática cada 30 segundos · Últimos 30 días.
          </p>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default AdminNotifications;
