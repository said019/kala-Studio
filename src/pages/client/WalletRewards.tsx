import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Tag,
  EmptyState,
  PrimaryButton,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import { BackLink } from "@/components/app/widgets";
import { useToast } from "@/hooks/use-toast";
import { Gift } from "lucide-react";

const WalletRewards = () => {
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
      toast({ title: "Recompensa canjeada." });
    },
    onError: (err: any) =>
      toast({
        title: "No se pudo canjear",
        description: err.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      }),
  });

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/wallet" label="Volver a Wallet" />
        <PageHeader
          eyebrow="Canjear puntos"
          title={<>Tus recompensas</>}
          titleAccent="del estudio."
          actions={
            <Tag tint="orange">{myPoints.toLocaleString("es-MX")} pts</Tag>
          }
        />

        <Section>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => <SkeletonRow key={i} height={140} />)}
            </div>
          ) : rewards.length === 0 ? (
            <EmptyState
              icon={<Gift size={20} />}
              title="Sin recompensas disponibles."
              description="Cuando Karla active recompensas nuevas, aparecen aquí."
            />
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 list-none m-0 p-0">
              {rewards.map((r) => {
                const cost = Number(r.points_cost ?? 0);
                const stockLeft = r.stock != null ? Number(r.stock) : null;
                const canRedeem = myPoints >= cost && (stockLeft == null || stockLeft > 0);
                const progress = Math.min(100, Math.round((myPoints / Math.max(1, cost)) * 100));
                return (
                  <li
                    key={r.id}
                    className="flex flex-col gap-4 rounded-3xl p-5"
                    style={{ backgroundColor: KALA.blush }}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="grid h-11 w-11 place-items-center rounded-2xl shrink-0"
                        style={{ backgroundColor: KALA.cream, color: KALA.berry }}
                      >
                        <Gift size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bebas leading-tight" style={{ color: KALA.ink, fontSize: "1.2rem" }}>
                          {r.name}
                        </h3>
                        {r.description && (
                          <p className="mt-1 text-[0.84rem] leading-[1.55]" style={{ color: KALA.ink, opacity: 0.65 }}>
                            {r.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[0.72rem] uppercase tracking-[0.18em]">
                        <span style={{ color: KALA.berry }}>{cost} pts</span>
                        {stockLeft != null && (
                          <span style={{ color: KALA.ink, opacity: 0.55 }}>{stockLeft} disponibles</span>
                        )}
                      </div>
                      <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ backgroundColor: KALA.cream }}>
                        <div
                          className="h-full rounded-full transition-[width] duration-700"
                          style={{ width: `${progress}%`, backgroundColor: canRedeem ? KALA.olive : KALA.coral }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!canRedeem || redeemMutation.isPending}
                      onClick={() => redeemMutation.mutate(r.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[0.76rem] font-medium uppercase tracking-[0.18em] transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: canRedeem ? KALA.berry : "transparent",
                        color: canRedeem ? KALA.cream : KALA.ink,
                        border: canRedeem ? "0" : `1px solid ${KALA.border}`,
                      }}
                    >
                      {canRedeem ? "Canjear" : `Te faltan ${Math.max(0, cost - myPoints)} pts`}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default WalletRewards;
