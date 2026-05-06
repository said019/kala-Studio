import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";
import type { Order } from "@/types/order";

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pago pendiente",
  pending_verification: "En verificación",
  approved: "Aprobado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending_payment: "secondary",
  pending_verification: "outline",
  approved: "default",
  rejected: "destructive",
  cancelled: "destructive",
};

const Orders = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => (await api.get("/orders")).data,
  });
  const orders: Order[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="space-y-4">
          <h1 className="text-xl font-bold">Mis órdenes</h1>
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tienes órdenes aún</p>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <Link key={order.id} to={`/app/orders/${order.id}`}>
                  <div className="flex items-center justify-between rounded-xl border p-4 hover:bg-accent/30 transition-colors">
                    <div className="space-y-1">
                      <p className="font-medium">{order.plan_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.created_at ? format(safeParse(order.created_at), "d MMM yyyy", { locale: es }) : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-semibold">${order.total_amount ?? order.amount} {order.currency}</p>
                        <Badge variant={STATUS_VARIANTS[order.status] ?? "secondary"}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </Badge>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default Orders;
