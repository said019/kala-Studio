import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { es } from "date-fns/locale";
import { format } from "date-fns";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { safeParse } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MembershipCard } from "@/components/MembershipCard";
import { KALA_RING_COLORS, RingsTriple, type KalaRing } from "@/components/kala/RingsTriple";
import { ArrowUpRight, Calendar, ClipboardList, Play, Target } from "lucide-react";
import type { ClientMembership } from "@/types/membership";
import type { BookingClient } from "@/types/booking";

const ringPercent = (progress: number, goal: number) =>
  goal > 0 ? Math.min(100, Math.max(0, (progress / goal) * 100)) : 0;

const GoalSphere = ({
  membership,
  planName,
  classLimit,
  classesRemaining,
  walletPoints,
  ringsState,
}: {
  membership: ClientMembership | null;
  planName: string;
  classLimit: number | null;
  classesRemaining: number | null;
  walletPoints: number;
  ringsState?: any;
}) => {
  const hasClassGoal = Boolean(membership && classLimit && classesRemaining !== null);
  const classesTaken = hasClassGoal ? Math.max((classLimit ?? 0) - (classesRemaining ?? 0), 0) : 0;
  const fallbackConstanciaGoal = classLimit ? Math.max(1, Math.ceil(classLimit / 4)) : 1;
  const constanciaProgress = Number(ringsState?.constancia?.progress ?? Math.min(fallbackConstanciaGoal, classesTaken));
  const constanciaGoal = Number(ringsState?.constancia?.goal ?? fallbackConstanciaGoal);
  const esfuerzoGoal = Number(ringsState?.esfuerzo?.goal ?? Math.max(1, Math.ceil(constanciaGoal * 0.6)));
  const esfuerzoProgress = Number(ringsState?.esfuerzo?.progress ?? Math.min(esfuerzoGoal, Math.floor(constanciaProgress * 0.6)));
  const conexionGoal = Number(ringsState?.conexion?.goal ?? 10);
  const conexionProgress = Number(ringsState?.conexion?.progress ?? Math.min(conexionGoal, Math.floor((walletPoints % 500) / 50)));
  const ringMetrics: KalaRing[] = [
    {
      key: "constancia",
      label: "Constancia",
      value: `${constanciaProgress}/${constanciaGoal}`,
      goalLabel: "clases asistidas",
      progress: ringPercent(constanciaProgress, constanciaGoal),
      ...KALA_RING_COLORS.constancia,
    },
    {
      key: "esfuerzo",
      label: "Esfuerzo",
      value: `${esfuerzoProgress}/${esfuerzoGoal}`,
      goalLabel: "retos o intensas",
      progress: ringPercent(esfuerzoProgress, esfuerzoGoal),
      ...KALA_RING_COLORS.esfuerzo,
    },
    {
      key: "conexion",
      label: "Conexión",
      value: `${conexionProgress}/${conexionGoal}`,
      goalLabel: "puntos comunidad",
      progress: ringPercent(conexionProgress, conexionGoal),
      ...KALA_RING_COLORS.conexion,
    },
  ];
  const ringsClosed = Number.isFinite(Number(ringsState?.rings_closed))
    ? Number(ringsState?.rings_closed)
    : ringMetrics.filter((ring) => ring.progress >= 100).length;
  const message = hasClassGoal
    ? ringsClosed >= 3
      ? "Cerraste tus 3 anillos de la semana. Tu recompensa Kala queda desbloqueada."
      : classesTaken === 0
        ? "Tus anillos empiezan con tu primera asistencia."
        : `Llevas ${ringsClosed}/3 anillos cerrados esta semana. La siguiente visita suma constancia.`
    : "Compra un paquete y cada asistencia empezara a cerrar tus anillos semanales.";

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[#11100d] p-1.5 shadow-[0_24px_80px_-40px_rgba(217,108,117,0.55)]">
      <div className="relative overflow-hidden rounded-[calc(2rem-0.375rem)] bg-[radial-gradient(circle_at_20%_10%,rgba(217,108,117,0.18),transparent_32%),linear-gradient(145deg,#171410_0%,#0e0d0b_55%,#17110f_100%)] px-5 py-6 sm:px-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#d96c75]/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-[#8a9a5b]/10 blur-3xl" />

        <div className="relative grid gap-6 lg:grid-cols-[minmax(220px,0.85fr)_1.15fr] lg:items-center">
          <div className="flex justify-center lg:justify-start">
            <div className="rounded-full bg-[#0c0b09] p-2 shadow-[inset_0_1px_2px_rgba(255,255,255,0.08),0_18px_60px_-30px_rgba(0,0,0,0.9)]">
              <RingsTriple
                rings={ringMetrics}
                centerLabel="esta semana"
                centerValue={`${ringsClosed}/3`}
                centerSub="anillos cerrados"
                shellClassName="h-[224px] w-[224px] sm:h-[254px] sm:w-[254px] border-white/10 shadow-none"
              />
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-white/55">
              <Target size={12} />
              esfera de progreso
            </div>
            <h2 className="mt-4 max-w-[560px] text-3xl font-bold leading-tight text-[#FFF0E4] sm:text-4xl">
              Tu mes se llena una clase a la vez.
            </h2>
            <p className="mt-3 max-w-[58ch] text-sm leading-7 text-white/56">{message}</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#d96c75]/20 bg-[#d96c75]/10 p-4">
                <p className="text-[0.65rem] uppercase tracking-[0.16em] text-[#ec9fa6]">constancia</p>
                <p className="mt-1 text-2xl font-semibold text-[#FFF0E4] tabular-nums">
                  {ringMetrics[0].value}
                </p>
              </div>
              <div className="rounded-2xl border border-[#8a9a5b]/20 bg-[#8a9a5b]/10 p-4">
                <p className="text-[0.65rem] uppercase tracking-[0.16em] text-[#c2ce8a]">esfuerzo</p>
                <p className="mt-1 text-2xl font-semibold text-[#FFF0E4] tabular-nums">
                  {ringMetrics[1].value}
                </p>
              </div>
              <div className="rounded-2xl border border-[#f3c178]/20 bg-[#f3c178]/10 p-4">
                <p className="text-[0.65rem] uppercase tracking-[0.16em] text-[#f3c178]">conexión</p>
                <p className="mt-1 text-2xl font-semibold text-[#FFF0E4] tabular-nums">{ringMetrics[2].value}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild className="rounded-full bg-[#d96c75] text-white hover:bg-[#c75e67]">
                <Link to="/app/classes">
                  Reservar siguiente clase
                  <ArrowUpRight size={15} className="ml-2" />
                </Link>
              </Button>
              <p className="text-xs text-white/42">
                {membership ? planName : "Cuando actives un paquete, este anillo vivira en tu inicio."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const Dashboard = () => {
  const { user } = useAuthStore();

  const { data: membershipData, isLoading: loadingMembership } = useQuery({
    queryKey: ["my-membership"],
    queryFn: async () => (await api.get("/memberships/my")).data,
  });

  const { data: bookingsData, isLoading: loadingBookings } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => (await api.get("/bookings/my-bookings")).data,
  });

  const { data: walletData, isError: walletError } = useQuery({
    queryKey: ["wallet-pass"],
    queryFn: async () => (await api.get("/wallet/pass")).data,
    retry: false,
  });

  const { data: ringsData } = useQuery({
    queryKey: ["me-rings"],
    queryFn: async () => (await api.get("/me/rings")).data,
    retry: false,
  });

  const { data: videosData } = useQuery({
    queryKey: ["recent-videos"],
    queryFn: async () => (await api.get("/videos?limit=4")).data,
  });

  const membership: ClientMembership | null = membershipData?.data ?? membershipData ?? null;
  const bookings: BookingClient[] = Array.isArray(bookingsData?.data) ? bookingsData.data : Array.isArray(bookingsData) ? bookingsData : [];
  const wallet = walletData?.data ?? walletData ?? null;
  const videos = Array.isArray(videosData?.data) ? videosData.data : Array.isArray(videosData) ? videosData : [];

  // Support both camelCase (server response) and snake_case (legacy)
  const planName = membership?.planName ?? membership?.plan_name ?? "Membresía";
  const classLimit = membership?.classLimit ?? membership?.class_limit ?? null;
  const classesRemaining = membership?.classesRemaining ?? membership?.classes_remaining ?? null;

  const upcomingBookings = bookings
    .filter((b) => b.status === "confirmed" || b.status === "waitlist")
    .slice(0, 2);

  const walletPoints = Number(wallet?.points ?? 0);

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">¡Hola, {user?.display_name?.split(" ")[0]}!</h1>
            <p className="text-sm text-muted-foreground">Tu progreso de hoy en Kala</p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3">
            <Button asChild size="sm"><Link to="/app/classes"><Calendar size={16} className="mr-2" />Reservar clase</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/app/bookings"><ClipboardList size={16} className="mr-2" />Mis reservas</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/app/videos"><Play size={16} className="mr-2" />Explorar videos</Link></Button>
          </div>

          <GoalSphere
            membership={membership}
            planName={planName}
            classLimit={classLimit}
            classesRemaining={classesRemaining}
            walletPoints={walletPoints}
            ringsState={(ringsData?.data ?? ringsData)?.current}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Membresía */}
            <Card className="sm:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Mi membresía</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingMembership ? (
                  <Skeleton className="h-40 w-full rounded-2xl" />
                ) : membership ? (
                  <MembershipCard membership={membership} />
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">No tienes membresía activa</p>
                    <Button asChild size="sm"><Link to="/app/checkout">Adquirir membresía</Link></Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Puntos */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Puntos de lealtad</CardTitle>
              </CardHeader>
              <CardContent>
                {(wallet || walletError) ? (
                  <div className="space-y-2">
                    <p className="text-3xl font-bold">{walletPoints}</p>
                    <p className="text-xs text-muted-foreground">puntos acumulados</p>
                    <Button asChild variant="outline" size="sm"><Link to="/app/wallet">Ver wallet</Link></Button>
                  </div>
                ) : (
                  <Skeleton className="h-16 w-full" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Próximas clases */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Próximas clases</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBookings ? (
                <Skeleton className="h-20 w-full" />
              ) : upcomingBookings.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">No tienes clases próximas</p>
                  <Button asChild size="sm"><Link to="/app/classes">Reservar ahora</Link></Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingBookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="font-medium text-sm">{b.class_type_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.start_time ? format(safeParse(b.start_time), "EEEE d MMM · HH:mm", { locale: es }) : "—"} · {b.instructor_name ?? b.class_type_name}
                        </p>
                      </div>
                      <Badge variant={b.status === "waitlist" ? "secondary" : "default"}>
                        {b.status === "waitlist" ? "Espera" : "Confirmada"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Videos recientes */}
          {videos.length > 0 && (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
                <h2 className="font-semibold">Videos recientes</h2>
                <Link to="/app/videos" className="text-sm text-primary hover:underline">Ver todos</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:grid-cols-4">
                {videos.map((v: any) => (
                  <Link key={v.id} to={`/app/videos/${v.id}`}>
                    <div className="rounded-xl overflow-hidden border group cursor-pointer">
                      <div className="aspect-video bg-muted relative overflow-hidden">
                        {v.thumbnail_url && (
                          <img src={v.thumbnail_url} className="object-cover w-full h-full group-hover:scale-105 transition-transform" />
                        )}
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs rounded px-1">
                          {Math.floor((v.duration_seconds ?? 0) / 60)} min
                        </div>
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-medium line-clamp-1">{v.title}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default Dashboard;
