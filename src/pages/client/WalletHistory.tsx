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
  Tag,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import { BackLink } from "@/components/app/widgets";
import { ArrowDownRight, ArrowUpRight, History as HistoryIcon } from "lucide-react";

const WalletHistory = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["loyalty-history"],
    queryFn: async () => (await api.get("/loyalty/my-history")).data,
  });
  const history: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/wallet" label="Volver a Wallet" />
        <PageHeader
          eyebrow="Historial"
          title={<>Tus puntos,</>}
          titleAccent="movimiento a movimiento."
        />

        <Section>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <SkeletonRow key={i} height={60} />)}</div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={<HistoryIcon size={20} />}
              title="Sin movimientos aún."
              description="Cada vez que asistas o canjees, aparece aquí."
            />
          ) : (
            <ListGroup>
              {history.map((item, i) => {
                const earned = item.type === "earned";
                return (
                  <ListRow
                    key={i}
                    icon={earned ? <ArrowUpRight size={17} strokeWidth={1.7} /> : <ArrowDownRight size={17} strokeWidth={1.7} />}
                    iconTint={earned ? "olive" : "coral"}
                    title={item.reason || (earned ? "Puntos ganados" : "Puntos usados")}
                    description={
                      item.created_at ? format(safeParse(item.created_at), "d MMM yyyy", { locale: es }) : "—"
                    }
                    trailing={
                      <Tag tint={earned ? "olive" : "coral"}>
                        {earned ? "+" : "−"}
                        {item.points}
                      </Tag>
                    }
                  />
                );
              })}
            </ListGroup>
          )}
        </Section>

        <p className="mt-10 text-[0.74rem]" style={{ color: KALA.ink, opacity: 0.45 }}>
          Los puntos se acreditan al cierre de cada visita.
        </p>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default WalletHistory;
