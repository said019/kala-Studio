import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
}

// Static data — replace with GET /notifications when backend is ready
const MOCK_NOTIFICATIONS: Notification[] = [
  { id: "1", title: "Clase confirmada", body: "Tu reserva para Pilates mañana a las 9:00 está confirmada.", time: "Hace 2h", unread: true },
  { id: "2", title: "¡Membresía activa!", body: "Tu membresía ha sido activada correctamente.", time: "Ayer", unread: true },
  { id: "3", title: "Recordatorio de clase", body: "Tu clase de Yoga es en 1 hora.", time: "Hace 3 días", unread: false },
];

const Notifications = () => (
  <ClientAuthGuard requiredRoles={["client"]}>
    <ClientLayout>
      <div className="max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Notificaciones</h1>
          <Badge variant="secondary">{MOCK_NOTIFICATIONS.filter((n) => n.unread).length} nuevas</Badge>
        </div>
        <div className="space-y-2">
          {MOCK_NOTIFICATIONS.map((n) => (
            <div
              key={n.id}
              className={`flex gap-3 rounded-xl border p-4 transition-colors ${n.unread ? "bg-primary/5 border-primary/20" : ""}`}
            >
              <div className="mt-0.5 flex-shrink-0">
                <Bell size={16} className={n.unread ? "text-primary" : "text-muted-foreground"} />
              </div>
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className={`text-sm font-medium ${n.unread ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
                <p className="text-xs text-muted-foreground">{n.time}</p>
              </div>
              {n.unread && <div className="mt-1.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>
    </ClientLayout>
  </ClientAuthGuard>
);

export default Notifications;
