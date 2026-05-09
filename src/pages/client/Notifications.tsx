import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  EmptyState,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import {
  Bell, BellOff,
  CalendarCheck2, CreditCard, Megaphone, Trophy, Sparkles, Coins, Gift,
} from "lucide-react";

type Category =
  | "booking" | "membership" | "marketing"
  | "milestone" | "motivation"
  | "loyalty_earn" | "loyalty_spend"
  | "system";

interface Notif {
  id: string;
  category: Category;
  title: string;
  body: string;
  time: string;
  link?: string;
  unread?: boolean;
}

const CATEGORY_ICON: Record<Category, React.ReactNode> = {
  booking: <CalendarCheck2 size={17} strokeWidth={1.7} />,
  membership: <CreditCard size={17} strokeWidth={1.7} />,
  marketing: <Megaphone size={17} strokeWidth={1.7} />,
  milestone: <Trophy size={17} strokeWidth={1.7} />,
  motivation: <Sparkles size={17} strokeWidth={1.7} />,
  loyalty_earn: <Coins size={17} strokeWidth={1.7} />,
  loyalty_spend: <Gift size={17} strokeWidth={1.7} />,
  system: <Bell size={17} strokeWidth={1.7} />,
};

const CATEGORY_TINT: Record<Category, keyof typeof KALA> = {
  booking: "berry",
  membership: "olive",
  marketing: "coral",
  milestone: "orange",
  motivation: "coral",
  loyalty_earn: "olive",
  loyalty_spend: "berry",
  system: "orange",
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

const Notifications = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ data: Notif[]; meta?: { unread_count: number } }>({
    queryKey: ["my-notifications"],
    queryFn: async () => (await api.get("/me/notifications?limit=40")).data,
    refetchInterval: 30_000,
  });
  const items = Array.isArray(data?.data) ? data!.data : [];

  const markReadMutation = useMutation({
    mutationFn: () => api.post("/me/notifications/mark-read"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  // Marca todo como leído al entrar (después de un breve delay para que la
  // alumna vea el dot de unread brevemente).
  useEffect(() => {
    if (items.length === 0) return;
    const t = setTimeout(() => markReadMutation.mutate(), 1200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length > 0]);

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Tu bandeja"
          title={<>Lo que pasó</>}
          titleAccent="contigo."
        />

        <Section>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4].map((i) => <SkeletonRow key={i} height={64} />)}</div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<BellOff size={20} />}
              title="Sin novedades aún."
              description="Aquí van a aparecer tus reservas, logros, puntos ganados y avisos del estudio."
            />
          ) : (
            <ListGroup>
              {items.map((n) => (
                <ListRow
                  key={n.id}
                  asButton={!!n.link}
                  onClick={n.link ? () => navigate(n.link!) : undefined}
                  icon={CATEGORY_ICON[n.category] ?? <Bell size={17} strokeWidth={1.7} />}
                  iconTint={CATEGORY_TINT[n.category] ?? "berry"}
                  title={
                    <span style={{ opacity: n.unread ? 1 : 0.7 }}>
                      {n.title}
                    </span>
                  }
                  description={
                    <>
                      {n.body}
                      <span style={{ color: KALA.ink, opacity: 0.4 }}> · {formatTime(n.time)}</span>
                    </>
                  }
                  trailing={n.unread ? (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: KALA.berry }}
                      aria-label="Sin leer"
                    />
                  ) : undefined}
                />
              ))}
            </ListGroup>
          )}
        </Section>

        <p className="mt-10 text-[0.74rem]" style={{ color: KALA.ink, opacity: 0.45 }}>
          Configura cuáles avisos recibes desde Perfil → Preferencias.
        </p>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Notifications;
