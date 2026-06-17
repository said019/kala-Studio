import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { es } from "date-fns/locale";
import { format, isToday, isTomorrow } from "date-fns";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import { safeParse } from "@/lib/utils";
import { KALA_RING_COLORS, RingsTriple, type KalaRing } from "@/components/kala/RingsTriple";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  Stat,
  Tag,
  EmptyState,
  PrimaryButton,
  GhostButton,
  ActionRow,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import {
  CalendarDays,
  Play,
  Sparkles,
  Award,
  ClipboardList,
  Wallet as WalletIcon,
  Film,
  ArrowRight,
} from "lucide-react";
import type { ClientMembership } from "@/types/membership";
import type { BookingClient } from "@/types/booking";

const ringPercent = (progress: number, goal: number) =>
  goal > 0 ? Math.min(100, Math.max(0, (progress / goal) * 100)) : 0;

const formatBookingTime = (iso: string | null | undefined) => {
  if (!iso) return "Por confirmar";
  const d = safeParse(iso);
  if (isToday(d)) return `Hoy · ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `Mañana · ${format(d, "HH:mm")}`;
  return format(d, "EEE d MMM · HH:mm", { locale: es });
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

  const { data: walletData } = useQuery({
    queryKey: ["wallet-pass"],
    queryFn: async () => (await api.get("/wallet/pass")).data,
    retry: false,
  });

  const { data: ringsData } = useQuery({
    queryKey: ["me-rings"],
    queryFn: async () => (await api.get("/me/rings")).data,
    retry: false,
  });

  const { data: milestonesData } = useQuery({
    queryKey: ["my-milestones"],
    queryFn: async () => (await api.get("/loyalty/milestones/me")).data,
    retry: false,
  });
  const ms = milestonesData?.data ?? null;

  const { data: videosData } = useQuery({
    queryKey: ["recent-videos"],
    queryFn: async () => (await api.get("/videos?limit=4")).data,
  });

  const { data: vaData } = useQuery({
    queryKey: ["me-video-access"],
    queryFn: async () => (await api.get("/me/video-access")).data,
    staleTime: 30_000,
  });
  const access = vaData?.data; // { state, planName?, offers? }

  const membership: ClientMembership | null = membershipData?.data ?? membershipData ?? null;
  const bookings: BookingClient[] = Array.isArray(bookingsData?.data) ? bookingsData.data : Array.isArray(bookingsData) ? bookingsData : [];
  const wallet = walletData?.data ?? walletData ?? null;
  const videos = Array.isArray(videosData?.data) ? videosData.data : Array.isArray(videosData) ? videosData : [];

  const planName = membership?.planName ?? membership?.plan_name ?? "Sin paquete activo";
  const classLimit = membership?.classLimit ?? membership?.class_limit ?? null;
  const classesRemaining = membership?.classesRemaining ?? membership?.classes_remaining ?? null;
  const membershipExpired = Boolean(membership?.isExpired);
  const walletPoints = Number(wallet?.points ?? 0);

  const ringsState = (ringsData?.data ?? ringsData)?.current;
  const rings = useMemo<{ metrics: KalaRing[]; closed: number; message: string }>(() => {
    const classesTaken = classLimit && classesRemaining !== null
      ? Math.max((classLimit ?? 0) - (classesRemaining ?? 0), 0)
      : 0;
    const fallbackConstanciaGoal = classLimit ? Math.max(1, Math.ceil(classLimit / 4)) : 1;
    const constanciaProgress = Number(ringsState?.constancia?.progress ?? Math.min(fallbackConstanciaGoal, classesTaken));
    const constanciaGoal = Number(ringsState?.constancia?.goal ?? fallbackConstanciaGoal);
    const esfuerzoGoal = Number(ringsState?.esfuerzo?.goal ?? Math.max(1, Math.ceil(constanciaGoal * 0.6)));
    const esfuerzoProgress = Number(ringsState?.esfuerzo?.progress ?? Math.min(esfuerzoGoal, Math.floor(constanciaProgress * 0.6)));
    const conexionGoal = Number(ringsState?.conexion?.goal ?? 10);
    const conexionProgress = Number(ringsState?.conexion?.progress ?? Math.min(conexionGoal, Math.floor((walletPoints % 500) / 50)));
    const metrics: KalaRing[] = [
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
        goalLabel: "puntos de comunidad",
        progress: ringPercent(conexionProgress, conexionGoal),
        ...KALA_RING_COLORS.conexion,
      },
    ];
    const closedCount = Number.isFinite(Number(ringsState?.rings_closed))
      ? Number(ringsState?.rings_closed)
      : metrics.filter((r) => r.progress >= 100).length;
    const hasGoal = Boolean(membership && classLimit && classesRemaining !== null);
    const message = hasGoal
      ? closedCount >= 3
        ? "Cerraste tus tres anillos esta semana. Tu recompensa Kala queda desbloqueada."
        : classesTaken === 0
          ? "Tus anillos empiezan con tu primera asistencia."
          : `Llevas ${closedCount}/3 anillos cerrados. La siguiente clase suma constancia.`
      : "Activa un paquete y cada asistencia empieza a cerrar tus anillos.";
    return { metrics, closed: closedCount, message };
  }, [ringsState, classLimit, classesRemaining, walletPoints, membership]);

  const upcoming = bookings
    .filter((b) => b.status === "confirmed" || b.status === "waitlist")
    .slice(0, 3);
  const nextBooking = upcoming[0];

  const firstName = (user?.displayName ?? user?.display_name ?? "").split(" ")[0] || "alumna";

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell>
        <PageHeader
          eyebrow={`Hoy · ${format(new Date(), "EEEE d MMM", { locale: es })}`}
          title={<>Tu semana en</>}
          titleAccent="Kala."
          subtitle={rings.message}
        />

        {/* ── Next class — primary action ── */}
        <div className="mt-2">
          {loadingBookings ? (
            <SkeletonRow height={108} />
          ) : nextBooking ? (
            <ActionRow
              to="/app/bookings"
              eyebrow="Tu próxima clase"
              title={nextBooking.class_type_name ?? "Clase"}
              meta={
                <>
                  {formatBookingTime(nextBooking.start_time)}
                  {nextBooking.instructor_name ? ` · ${nextBooking.instructor_name}` : ""}
                  {nextBooking.status === "waitlist" ? " · en lista de espera" : ""}
                </>
              }
              rightLabel="Ver detalle"
              tint="berry"
            />
          ) : (
            <ActionRow
              to="/app/classes"
              eyebrow="Sin clase reservada"
              title="Reserva tu próxima clase"
              meta="Cinco lugares por sesión, cada clase es distinta."
              rightLabel="Reservar"
              tint="coral"
            />
          )}
        </div>

        {/* ── Rings ── */}
        <Section title="Tres anillos">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 lg:gap-10 items-center">
            <div className="lg:col-span-5 flex justify-center lg:justify-start">
              <div className="rounded-full p-3" style={{ backgroundColor: KALA.ink }}>
                <RingsTriple
                  rings={rings.metrics}
                  centerLabel="esta semana"
                  centerValue={`${rings.closed}/3`}
                  centerSub="anillos cerrados"
                  shellClassName="border-transparent shadow-none"
                />
              </div>
            </div>
            <div className="lg:col-span-7 grid grid-cols-3 gap-5 sm:gap-7" data-stagger>
              {rings.metrics.map((m) => (
                <div key={m.key} data-stagger-item>
                  <Stat
                    value={m.value}
                    label={m.label}
                    tint={m.key === "constancia" ? "berry" : m.key === "esfuerzo" ? "olive" : "orange"}
                  />
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ── Próximo milestone (recompensa por asistencia) ── */}
        {ms?.next_milestone && (
          <Section
            title="Tu próximo logro"
            trailing={
              <Link to="/app/wallet/rewards" className="no-underline" style={{ color: KALA.berry }}>
                Ver todos
              </Link>
            }
          >
            <Link
              to="/app/wallet/rewards"
              data-lift
              className="block no-underline rounded-3xl p-5 sm:p-6"
              style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}
            >
              <div className="flex items-start gap-4">
                <span
                  className="grid h-12 w-12 place-items-center rounded-2xl shrink-0"
                  style={{ backgroundColor: `${KALA.orange}1f`, color: KALA.orange }}
                >
                  <Award size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <h3 className="font-bebas leading-tight" style={{ color: KALA.ink, fontSize: "1.25rem" }}>
                      {ms.next_milestone.name}
                    </h3>
                    <span className="text-[0.7rem] uppercase tracking-[0.18em]" style={{ color: KALA.berry }}>
                      +{ms.next_milestone.award_points} pts
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[0.74rem]">
                      <span style={{ color: KALA.ink, opacity: 0.7 }}>
                        <strong style={{ color: KALA.berry }}>{ms.lifetime_classes}</strong> de {ms.next_milestone.classes_required} clases
                      </span>
                      <span style={{ color: KALA.olive, fontWeight: 600 }}>
                        Te faltan {ms.next_remaining ?? 0}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: KALA.blush }}>
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
                        style={{
                          width: `${Math.min(100, Math.round((ms.lifetime_classes / Math.max(1, ms.next_milestone.classes_required)) * 100))}%`,
                          background: `linear-gradient(90deg, ${KALA.berry}, ${KALA.coral})`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </Section>
        )}

        {/* ── Membership + wallet, side by side ── */}
        <Section title="Tu cuenta">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 rounded-3xl p-5 sm:p-6" style={{ backgroundColor: KALA.blush }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-[0.62rem] font-medium uppercase tracking-[0.24em]" style={{ color: KALA.berry }}>
                  Membresía
                </span>
                {membership && membershipExpired ? (
                  <Tag tint="destructive">Vencida</Tag>
                ) : membership && classLimit !== null ? (
                  <Tag tint="olive">Activa</Tag>
                ) : null}
              </div>
              {loadingMembership ? (
                <SkeletonRow height={88} />
              ) : membership ? (
                <>
                  <h3 className="font-bebas leading-tight" style={{ color: KALA.ink, fontSize: "clamp(1.6rem, 2.6vw, 2.1rem)" }}>
                    {planName}
                  </h3>
                  <div className="mt-4 grid grid-cols-2 gap-5">
                    <Stat
                      value={membershipExpired ? "·" : (classesRemaining ?? "·")}
                      label={membershipExpired ? "Sin clases (vencida)" : "Clases por usar"}
                      tint={membershipExpired ? "destructive" : "berry"}
                    />
                    <Stat
                      value={classLimit ?? "·"}
                      label="Total del paquete"
                      tint="olive"
                    />
                  </div>
                  {membershipExpired && (
                    <p className="mt-3 text-[0.85rem] leading-[1.55]" style={{ color: KALA.ink, opacity: 0.65 }}>
                      Tu paquete venció. Renueva para volver a reservar.
                    </p>
                  )}
                  <div className="mt-5 flex flex-wrap gap-3">
                    <PrimaryButton size="sm" to="/app/profile/membership">Ver membresía</PrimaryButton>
                    <GhostButton to="/app/checkout">Renovar</GhostButton>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-bebas leading-tight" style={{ color: KALA.ink, fontSize: "clamp(1.6rem, 2.6vw, 2.1rem)" }}>
                    Sin paquete activo
                  </h3>
                  <p className="mt-2 text-[0.92rem] leading-[1.6]" style={{ color: KALA.ink, opacity: 0.65 }}>
                    Cuando actives un paquete, tus anillos empiezan a contar y reservas en un tap.
                  </p>
                  <div className="mt-5">
                    <PrimaryButton size="sm" to="/app/checkout">Ver paquetes</PrimaryButton>
                  </div>
                </>
              )}
            </div>

            <Link
              to="/app/wallet"
              className="lg:col-span-5 rounded-3xl p-5 sm:p-6 no-underline transition-transform hover:-translate-y-px flex flex-col justify-between gap-5"
              style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}`, color: KALA.ink }}
            >
              <div>
                <span className="text-[0.62rem] font-medium uppercase tracking-[0.24em]" style={{ color: KALA.orange }}>
                  Wallet
                </span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="font-bebas leading-none tabular-nums" style={{ color: KALA.ink, fontSize: "clamp(2.4rem, 4vw, 3.4rem)" }}>
                    {walletPoints}
                  </span>
                  <span className="text-[0.74rem] uppercase tracking-[0.18em]" style={{ opacity: 0.55 }}>puntos</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[0.78rem]" style={{ color: KALA.berry }}>
                <span className="uppercase tracking-[0.18em]">Ver recompensas</span>
                <WalletIcon size={16} />
              </div>
            </Link>
          </div>
        </Section>

        {/* ── Próximas clases (if more than the headlined one) ── */}
        {!loadingBookings && upcoming.length > 1 && (
          <Section title="También en tu agenda" trailing={<Link to="/app/bookings" className="no-underline" style={{ color: KALA.berry }}>Ver todas</Link>}>
            <ListGroup>
              {upcoming.slice(1).map((b) => (
                <ListRow
                  key={b.id}
                  to="/app/bookings"
                  icon={<CalendarDays size={17} strokeWidth={1.7} />}
                  iconTint={b.status === "waitlist" ? "coral" : "berry"}
                  title={b.class_type_name ?? "Clase"}
                  description={
                    <>
                      {formatBookingTime(b.start_time)}
                      {b.instructor_name ? ` · ${b.instructor_name}` : ""}
                    </>
                  }
                  trailing={
                    b.status === "waitlist" ? (
                      <Tag tint="coral">Lista</Tag>
                    ) : (
                      <Tag tint="olive">Confirmada</Tag>
                    )
                  }
                />
              ))}
            </ListGroup>
          </Section>
        )}

        {!loadingBookings && upcoming.length === 0 && (
          <Section title="Tu agenda">
            <EmptyState
              icon={<CalendarDays size={20} />}
              title="Aún no tienes clases reservadas."
              description="Cinco lugares por sesión, cada clase es distinta. Reserva la tuya."
              ctaLabel="Reservar clase"
              ctaTo="/app/classes"
            />
          </Section>
        )}

        {/* ── Quick links — hairline rows, not card grid ── */}
        <Section title="Atajos">
          <ListGroup>
            <ListRow
              to="/app/bookings"
              icon={<ClipboardList size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Mis reservas"
              description="Próximas y pasadas"
            />
            <ListRow
              to="/app/wallet/rewards"
              icon={<Award size={17} strokeWidth={1.7} />}
              iconTint="orange"
              title="Recompensas"
              description="Canjea tus puntos"
            />
            <ListRow
              to="/app/profile/refer"
              icon={<Sparkles size={17} strokeWidth={1.7} />}
              iconTint="coral"
              title="Invita a una amiga"
              description="Las dos ganan"
            />
            <ListRow
              to="/app/events"
              icon={<CalendarDays size={17} strokeWidth={1.7} />}
              iconTint="olive"
              title="Eventos del estudio"
              description="Talleres, invitadas y comunidad"
            />
          </ListGroup>
        </Section>

        {/* ── Video library access card ── */}
        {access && access.state !== "locked_no_plan" && (
          <Section>
            <Link
              to="/app/videos"
              className="block no-underline rounded-3xl p-5 sm:p-6"
              data-lift
              style={{
                backgroundColor: KALA.blush,
                border: `1px solid ${KALA.berry}22`,
                color: KALA.ink,
              }}
            >
              <div className="flex items-center gap-4">
                <span
                  className="grid h-12 w-12 place-items-center rounded-2xl shrink-0"
                  style={{
                    backgroundColor: access.state === "unlocked" ? KALA.berry : KALA.orange,
                    color: KALA.cream,
                  }}
                >
                  <Film size={20} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[0.66rem] uppercase tracking-[0.22em]"
                    style={{ color: KALA.ink, opacity: 0.55 }}
                  >
                    Biblioteca de videos
                  </p>
                  <p
                    className="mt-1 text-[1rem] font-medium leading-tight"
                    style={{ color: KALA.ink }}
                  >
                    {access.state === "unlocked"
                      ? "Tienes acceso a la biblioteca"
                      : "Tu acceso está en revisión"}
                  </p>
                  <p
                    className="mt-1 text-[0.82rem]"
                    style={{ color: KALA.ink, opacity: 0.65 }}
                  >
                    {access.state === "unlocked"
                      ? "Reproduce las clases cuando quieras."
                      : "Mientras tanto, puedes ver las clases muestra."}
                  </p>
                </div>
                <ArrowRight size={18} style={{ color: KALA.berry, opacity: 0.7 }} />
              </div>
            </Link>
          </Section>
        )}

        {/* ── Recent videos ── */}
        {videos.length > 0 && (
          <Section
            title="Videos recientes"
            trailing={<Link to="/app/videos" className="no-underline" style={{ color: KALA.berry }}>Ver todos</Link>}
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-stagger>
              {videos.slice(0, 4).map((v: any) => (
                <Link key={v.id} to={`/app/videos/${v.id}`} data-stagger-item data-lift className="group block no-underline">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl" style={{ backgroundColor: KALA.blush }}>
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} alt={v.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center" style={{ color: KALA.berry }}>
                        <Play size={28} />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 p-3" style={{ background: "linear-gradient(180deg, transparent, rgba(46,32,28,0.55))" }}>
                      <span className="text-[0.66rem] uppercase tracking-[0.2em]" style={{ color: KALA.cream }}>
                        {Math.floor((v.duration_seconds ?? 0) / 60)} min
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-[0.86rem] leading-tight line-clamp-2" style={{ color: KALA.ink }}>
                    {v.title}
                  </p>
                </Link>
              ))}
            </div>
          </Section>
        )}

        <p className="mt-12 lg:mt-16 text-[0.74rem]" style={{ color: KALA.ink, opacity: 0.45 }}>
          Buena clase, {firstName}.
        </p>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Dashboard;
