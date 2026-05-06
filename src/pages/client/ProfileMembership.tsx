import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { format, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CalendarDays, Layers, XCircle, Zap } from "lucide-react";
import type { ClientMembership } from "@/types/membership";
import { MembershipCard } from "@/components/MembershipCard";

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  active:              { label: "Activa",          color: "#4ade80", bg: "rgba(74,222,128,0.12)" },
  expired:             { label: "Vencida",          color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  pending_payment:     { label: "Pago pendiente",   color: "#c9a227", bg: "rgba(201,162,39,0.12)" },
  pending_activation:  { label: "Por activar",      color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  cancelled:           { label: "Cancelada",        color: "#94a3b8", bg: "rgba(148,163,184,0.10)" },
};

const StatBox = ({
  icon: Icon, label, value, sub, accent = "#76214D",
}: {
  icon: any; label: string; value: string | number; sub?: string; accent?: string;
}) => (
  <div
    className="flex flex-col gap-2 rounded-2xl p-4 border"
    style={{ background: `${accent}0a`, borderColor: `${accent}20` }}
  >
    <div className="flex items-center gap-2">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-lg"
        style={{ background: `${accent}18`, color: accent }}
      >
        <Icon size={14} />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">{label}</span>
    </div>
    <p className="text-2xl font-bold text-white leading-none">{value}</p>
    {sub && <p className="text-[11px] text-white/35">{sub}</p>}
  </div>
);

const ProfileMembership = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["my-membership"],
    queryFn: async () => (await api.get("/memberships/my")).data,
  });
  const membership: (ClientMembership & { cancellationsUsed?: number; classCategory?: string }) | null =
    data?.data ?? data ?? null;

  const daysRemaining = membership?.end_date
    ? Math.max(differenceInCalendarDays(safeParse(membership.end_date), new Date()), 0)
    : null;

  const statusCfg = membership ? (STATUS_LABELS[membership.status] ?? STATUS_LABELS.active) : null;
  const cancellationsUsed = membership?.cancellationsUsed ?? 0;
  const cancellationsLeft = Math.max(2 - cancellationsUsed, 0);

  const spotsPercent =
    membership?.class_limit && membership.classes_remaining !== null
      ? Math.round((membership.classes_remaining / membership.class_limit) * 100)
      : null;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="max-w-lg mx-auto space-y-5 pb-8">

          {/* Back */}
          <Button
            variant="ghost" size="sm"
            onClick={() => navigate("/app/profile")}
            className="text-white/40 hover:text-white -ml-2"
          >
            <ArrowLeft size={16} className="mr-1.5" />Perfil
          </Button>

          <h1 className="text-2xl font-bold text-white">Mi membresía</h1>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full rounded-2xl" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
              </div>
            </div>
          ) : membership ? (
            <div className="space-y-4">

              {/* ── Tarjeta visual de membresía ── */}
              <MembershipCard membership={membership} expanded />

              {/* ── Stats grid ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <StatBox
                  icon={CalendarDays}
                  label="Días restantes"
                  value={daysRemaining ?? "∞"}
                  sub={membership.start_date ? `Desde ${format(safeParse(membership.start_date), "d MMM", { locale: es })}` : undefined}
                  accent="#E9745F"
                />
                <StatBox
                  icon={Zap}
                  label="Clases"
                  value={membership.classes_remaining !== null ? membership.classes_remaining : "∞"}
                  sub={membership.class_limit ? `de ${membership.class_limit} totales` : "Ilimitadas"}
                  accent="#76214D"
                />
                <StatBox
                  icon={XCircle}
                  label="Cancelaciones"
                  value={`${cancellationsUsed} / 2`}
                  sub={cancellationsLeft === 0 ? "Límite alcanzado" : `${cancellationsLeft} disponible${cancellationsLeft !== 1 ? "s" : ""}`}
                  accent={cancellationsLeft === 0 ? "#f87171" : "#c9a227"}
                />
                <StatBox
                  icon={Layers}
                  label="Categoría"
                  value={
                    membership.classCategory === "jumping" ? "Jumping" :
                    membership.classCategory === "pilates" ? "Pilates" :
                    membership.classCategory === "mixto"   ? "Mixto"   : "Todas"
                  }
                  sub="tipo de clases"
                  accent="#F58A24"
                />
              </div>

              {/* ── Classes progress bar ── */}
              {spotsPercent !== null && membership.classes_remaining !== null && membership.class_limit && (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-white/50 text-[12px] uppercase tracking-wide font-semibold">Clases restantes</span>
                    <span className="text-white font-bold text-sm">
                      {membership.classes_remaining} <span className="text-white/30 font-normal">/ {membership.class_limit}</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${spotsPercent}%`,
                        background: spotsPercent > 50
                          ? "linear-gradient(90deg,#E9745F,#76214D)"
                          : spotsPercent > 20
                          ? "linear-gradient(90deg,#c9a227,#76214D)"
                          : "linear-gradient(90deg,#f87171,#c9a227)",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* ── Policy reminder ── */}
              <div className="rounded-2xl border border-[#c9a227]/20 bg-[#c9a227]/[0.05] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#c9a227] mb-2">
                  Política de cancelaciones
                </p>
                <ul className="space-y-1 text-[12px] text-white/50">
                  <li>· Máximo <span className="text-white/75 font-semibold">2 cancelaciones</span> por membresía</li>
                  <li>· Cancela con al menos <span className="text-white/75 font-semibold">2 horas de anticipación</span></li>
                  <li>· Cancelaciones tardías no devuelven el crédito</li>
                </ul>
              </div>

              {membership.status !== "active" && (
                <Button asChild className="w-full rounded-2xl h-12 font-semibold text-sm">
                  <Link to="/app/checkout">Renovar membresía</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/[0.07] bg-white/[0.03] p-8 text-center space-y-4">
              <p className="text-white/50 text-sm">No tienes membresía activa</p>
              <Button asChild className="rounded-2xl px-8">
                <Link to="/app/checkout">Adquirir membresía</Link>
              </Button>
            </div>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default ProfileMembership;
