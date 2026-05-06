import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  EmptyState,
  Tag,
  KALA,
} from "@/components/app/AppShell";
import { Bell, BellOff, CalendarCheck2, CreditCard, Megaphone } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  category: "booking" | "membership" | "marketing" | "system";
}

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: "1", title: "Clase confirmada", body: "Tu reserva de barre mañana 9:00 está confirmada.", time: "Hace 2 horas", unread: true, category: "booking" },
  { id: "2", title: "Membresía activa", body: "Tu paquete quedó activo. Ya puedes reservar.", time: "Ayer", unread: true, category: "membership" },
  { id: "3", title: "Recordatorio", body: "Tu clase de yoga es en una hora.", time: "Hace 3 días", unread: false, category: "booking" },
];

const CATEGORY_ICON: Record<Notification["category"], React.ReactNode> = {
  booking: <CalendarCheck2 size={17} strokeWidth={1.7} />,
  membership: <CreditCard size={17} strokeWidth={1.7} />,
  marketing: <Megaphone size={17} strokeWidth={1.7} />,
  system: <Bell size={17} strokeWidth={1.7} />,
};

const CATEGORY_TINT: Record<Notification["category"], keyof typeof KALA> = {
  booking: "berry",
  membership: "olive",
  marketing: "coral",
  system: "orange",
};

const Notifications = () => {
  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => n.unread).length;
  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Tu bandeja"
          title={<>Lo que pasó</>}
          titleAccent="hoy."
          actions={unreadCount > 0 ? <Tag tint="berry">{unreadCount} sin leer</Tag> : undefined}
        />

        <Section>
          {MOCK_NOTIFICATIONS.length === 0 ? (
            <EmptyState
              icon={<BellOff size={20} />}
              title="Sin novedades."
              description="Aquí van a aparecer recordatorios, confirmaciones y avisos del estudio."
            />
          ) : (
            <ListGroup>
              {MOCK_NOTIFICATIONS.map((n) => (
                <ListRow
                  key={n.id}
                  icon={CATEGORY_ICON[n.category]}
                  iconTint={CATEGORY_TINT[n.category]}
                  title={
                    <span style={{ opacity: n.unread ? 1 : 0.65 }}>
                      {n.title}
                    </span>
                  }
                  description={
                    <>
                      {n.body}
                      <span style={{ color: KALA.ink, opacity: 0.4 }}> · {n.time}</span>
                    </>
                  }
                  trailing={n.unread && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: KALA.berry }} />}
                />
              ))}
            </ListGroup>
          )}
        </Section>

        <p className="mt-10 text-[0.74rem]" style={{ color: KALA.ink, opacity: 0.45 }}>
          Configura cuáles avisos recibes desde Perfil, Preferencias.
        </p>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Notifications;
