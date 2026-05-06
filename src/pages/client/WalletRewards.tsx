import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Gift } from "lucide-react";

const WalletRewards = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: rewardsData, isLoading } = useQuery({
    queryKey: ["loyalty-rewards"],
    queryFn: async () => (await api.get("/loyalty/rewards")).data,
  });

  const { data: walletData } = useQuery({
    queryKey: ["wallet-pass"],
    queryFn: async () => (await api.get("/wallet/pass")).data,
  });

  const rewards: any[] = Array.isArray(rewardsData?.data) ? rewardsData.data : Array.isArray(rewardsData) ? rewardsData : [];
  const myPoints: number = walletData?.data?.points ?? walletData?.points ?? 0;

  const redeemMutation = useMutation({
    mutationFn: (rewardId: string) => api.post("/loyalty/redeem", { rewardId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallet-pass"] });
      qc.invalidateQueries({ queryKey: ["loyalty-history"] });
      toast({ title: "¡Recompensa canjeada!" });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.response?.data?.message, variant: "destructive" }),
  });

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="max-w-2xl space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/app/wallet")}>
            <ArrowLeft size={16} className="mr-2" />Wallet
          </Button>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Canjear recompensas</h1>
            <Badge variant="outline">{myPoints} puntos disponibles</Badge>
          </div>
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
            </div>
          ) : rewards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay recompensas disponibles</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {rewards.map((r) => {
                const canRedeem = myPoints >= r.points_cost && (r.stock == null || r.stock > 0);
                return (
                  <Card key={r.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Gift size={16} className="text-primary" />
                        {r.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{r.points_cost} puntos</Badge>
                        {r.stock != null && (
                          <span className="text-xs text-muted-foreground">{r.stock} disponibles</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={!canRedeem || redeemMutation.isPending}
                        onClick={() => redeemMutation.mutate(r.id)}
                      >
                        {canRedeem ? "Canjear" : "Puntos insuficientes"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default WalletRewards;
