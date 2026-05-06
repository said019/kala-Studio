import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const WalletHistory = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["loyalty-history"],
    queryFn: async () => (await api.get("/loyalty/my-history")).data,
  });
  const history: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="max-w-lg space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/app/wallet")}>
            <ArrowLeft size={16} className="mr-2" />Wallet
          </Button>
          <h1 className="text-xl font-bold">Historial de puntos</h1>
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos aún</p>
          ) : (
            <div className="space-y-2">
              {history.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <p className="text-sm font-medium">{item.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.created_at ? format(safeParse(item.created_at), "d MMM yyyy", { locale: es }) : "—"}
                    </p>
                  </div>
                  <Badge variant={item.type === "earned" ? "default" : "secondary"}>
                    {item.type === "earned" ? "+" : "-"}{item.points}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default WalletHistory;
