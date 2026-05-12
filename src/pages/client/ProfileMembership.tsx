import { useQuery } from "@tanstack/react-query";
import { format, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Stat,
  Tag,
  PrimaryButton,
  GhostButton,
  EmptyState,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import { BackLink, DataRow, InfoBanner } from "@/components/app/widgets";
import { CreditCard, CalendarDays } from "lucide-react";
import type { ClientMembership } from "@/types/membership";

const STATUS: Record<string, { label: string; tone: keyof typeof KALA }> = {
  active: { label: "Activa", tone: "olive" },
  expired: { label: "Vencida", tone: "destructive" },
  pending_payment: { label: "Pago pendiente", tone: "coral" },
  pending_activation: { label: "Por activar", tone: "orange" },
  cancelled: { label: "Cancelada", tone: "destructive" },
};

const CATEGORY_LABEL: Record<string, string> = {
  jumping: "Barre",
  pilates: "Pilates",
  mixto: "Mixto",
  all: "Todas",
};

const ProfileMembership = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["my-membership"],
    queryFn: async () => (await api.get("/memberships/my")).data,
  });

  const membership: (ClientMembership & { cancellationsUsed?: number; classCategory?: string }) | null =
    data?.data ?? data ?? null;

  const daysRemaining = membership?.end_date
    ? Math.max(differenceInCalendarDays(safeParse(membership.end_date), new Date()), 0)
    : null;
  const status = membership ? STATUS[membership.status] ?? { label: membership.status, tone: "berry" as const } : null;
  const cancellationsUsed = membership?.cancellationsUsed ?? 0;
  const cancellationsLeft = Math.max(2 - cancellationsUsed, 0);
  const isUnlimited =
    membership && (membership.class_limit === null || Number(membership.class_limit) >= 9999);
  const classesUsed = membership?.class_limit
    ? Math.max(0, Number(membership.class_limit) - Number(membership.classes_remaining ?? 0))
    : 0;
  const classesPercent =
    membership && membership.class_limit && !isUnlimited
      ? Math.min(100, Math.round((classesUsed / Number(membership.class_limit)) * 100))
      : null;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/profile" label="Perfil" />

        {isLoading ? (
          <SkeletonRow height={300} />
        ) : !membership ? (
          <>
            <PageHeader
              eyebrow="Membresía"
              title={<>Aún no tienes</>}
              titleAccent="paquete activo."
            />
            <Section>
              <EmptyState
                icon={<CreditCard size={20} />}
                title="Compra tu primer paquete."
                description="Cuando lo actives, las clases empiezan a contar y tus anillos cobran vida."
                ctaLabel="Ver paquetes"
                ctaTo="/app/checkout"
              />
            </Section>
          </>
        ) : (
          <>
            <PageHeader
              eyebrow="Tu membresía"
              title={membership.planName ?? membership.plan_name ?? "Plan Kala"}
              actions={status ? <Tag tint={status.tone}>{status.label}</Tag> : null}
            />

            <Section>
              <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: KALA.blush }}>
                <div className="flex items-baseline justify-between gap-4 pb-3" style={{ borderBottom: `1px solid ${KALA.border}` }}>
                  <span className="text-[0.62rem] font-medium uppercase tracking-[0.24em]" style={{ color: KALA.berry }}>
                    {CATEGORY_LABEL[String(membership.classCategory ?? "all")] ?? "Todas las disciplinas"}
                  </span>
                  <span className="font-bebas tabular-nums" style={{ color: KALA.berry, fontSize: "clamp(1.6rem, 2.6vw, 2.1rem)" }}>
                    {isUnlimited ? "∞" : Number(membership.classes_remaining ?? 0)}{" "}
                    <span className="text-[0.7rem] uppercase tracking-[0.18em]" style={{ color: KALA.ink, opacity: 0.55 }}>
                      por usar
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  <DataRow
                    label="Inicio"
                    value={
                      membership.start_date
                        ? format(safeParse(membership.start_date), "d MMM yyyy", { locale: es })
                        : "—"
                    }
                  />
                  <DataRow
                    label="Vence"
                    value={
                      membership.end_date
                        ? format(safeParse(membership.end_date), "d MMM yyyy", { locale: es })
                        : "—"
                    }
                  />
                  <DataRow
                    label="Días restantes"
                    value={daysRemaining ?? "∞"}
                  />
                  <DataRow
                    label="Total del paquete"
                    value={isUnlimited ? "Ilimitado" : Number(membership.class_limit ?? 0)}
                  />
                </div>
              </div>
            </Section>

            {classesPercent !== null && (
              <Section title="Avance del paquete">
                <div className="rounded-2xl p-5" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <span className="text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.6 }}>
                      {classesUsed} de {Number(membership.class_limit)} usadas
                    </span>
                    <span className="font-bebas tabular-nums text-[1.2rem]" style={{ color: KALA.berry }}>
                      {classesPercent}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: KALA.blush }}>
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{
                        width: `${classesPercent}%`,
                        backgroundColor:
                          classesPercent < 60 ? KALA.olive : classesPercent < 90 ? KALA.orange : KALA.coral,
                      }}
                    />
                  </div>
                </div>
              </Section>
            )}

            <Section title="Cancelaciones">
              <div className="grid grid-cols-2 gap-5">
                <Stat value={`${cancellationsUsed}/2`} label="Usadas" tint={cancellationsLeft === 0 ? "destructive" : "berry"} />
                <Stat value={cancellationsLeft} label="Disponibles" tint="olive" />
              </div>
              <ul className="mt-5 list-none m-0 p-0">
                {[
                  "Hasta 2 cancelaciones por paquete que devuelven la clase.",
                  "Cancela mínimo 2 horas antes para que cuente.",
                  "Cancelaciones tardías no devuelven el crédito.",
                ].map((line, i, arr) => (
                  <li
                    key={line}
                    className="grid grid-cols-[auto_1fr] items-center gap-3 py-3"
                    style={{
                      borderTop: `1px solid ${KALA.border}`,
                      borderBottom: i === arr.length - 1 ? `1px solid ${KALA.border}` : undefined,
                    }}
                  >
                    <span
                      className="grid h-7 w-7 place-items-center rounded-full"
                      style={{ backgroundColor: KALA.blush, color: KALA.berry }}
                    >
                      <CalendarDays size={13} />
                    </span>
                    <span className="text-[0.9rem] leading-[1.55]" style={{ color: KALA.ink, opacity: 0.78 }}>
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            {(membership.status !== "active" || (daysRemaining !== null && daysRemaining <= 7)) && (
              <Section>
                <InfoBanner
                  tone={membership.status === "active" ? "orange" : "coral"}
                  title={
                    membership.status === "active"
                      ? "Tu paquete vence pronto."
                      : "Tu paquete ya no está activo."
                  }
                  description={
                    membership.status === "active"
                      ? `Te quedan ${daysRemaining} ${daysRemaining === 1 ? "día" : "días"}. Renueva para no perder ritmo.`
                      : "Compra uno nuevo para seguir reservando."
                  }
                  action={<PrimaryButton size="sm" to="/app/checkout">Renovar</PrimaryButton>}
                />
              </Section>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <GhostButton to="/app/wallet">Ver mi wallet</GhostButton>
              <GhostButton to="/app/orders">Historial de compras</GhostButton>
            </div>
          </>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default ProfileMembership;
