import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  EmptyState,
  PrimaryButton,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import { StatusPill, formatMoneyMX } from "@/components/app/widgets";
import { Receipt } from "lucide-react";
import type { Order } from "@/types/order";

const STATUS: Record<string, { label: string; tone: keyof typeof KALA }> = {
  pending_payment: { label: "Pago pendiente", tone: "coral" },
  pending_verification: { label: "En verificación", tone: "orange" },
  approved: { label: "Aprobado", tone: "olive" },
  rejected: { label: "Rechazado", tone: "destructive" },
  cancelled: { label: "Cancelado", tone: "destructive" },
};

const Orders = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => (await api.get("/orders")).data,
  });
  const orders: Order[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Mis órdenes"
          title={<>Historial de</>}
          titleAccent="compras."
        />

        <Section>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <SkeletonRow key={i} height={72} />)}</div>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<Receipt size={20} />}
              title="Aún no compras un paquete."
              description="Cuando compres tu primer paquete o renovación, queda aquí el comprobante."
              ctaLabel="Ver paquetes"
              ctaTo="/app/checkout"
            />
          ) : (
            <ListGroup>
              {orders.map((order) => {
                const status = STATUS[order.status] ?? { label: order.status, tone: "berry" as const };
                return (
                  <ListRow
                    key={order.id}
                    to={`/app/orders/${order.id}`}
                    icon={<Receipt size={17} strokeWidth={1.7} />}
                    iconTint={status.tone}
                    title={order.plan_name ?? "Compra"}
                    description={
                      <>
                        {order.created_at ? format(safeParse(order.created_at), "d MMM yyyy", { locale: es }) : "—"}
                        {" · "}
                        ${formatMoneyMX(order.total_amount ?? order.amount)} {order.currency ?? "MXN"}
                      </>
                    }
                    trailing={<StatusPill label={status.label} tone={status.tone} />}
                  />
                );
              })}
            </ListGroup>
          )}
        </Section>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Orders;
