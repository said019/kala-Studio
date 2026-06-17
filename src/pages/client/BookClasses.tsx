import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  addWeeks,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isToday,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PrimaryButton,
  SkeletonRow,
  Tag,
  KALA,
} from "@/components/app/AppShell";
import { InfoBanner } from "@/components/app/widgets";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Lock,
  Sparkles,
  Users,
} from "lucide-react";
import type { BookingClient } from "@/types/booking";

const DAY_LABELS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

type ClassCat = "jumping" | "pilates" | "mixto" | "all";
const CAT_LABEL: Record<ClassCat, string> = {
  jumping: "Barre",
  pilates: "Pilates",
  mixto: "Mixto",
  all: "Todas",
};
const CAT_TINT: Record<ClassCat, keyof typeof KALA> = {
  jumping: "berry",
  pilates: "coral",
  mixto: "orange",
  all: "olive",
};

type ScheduleClass = {
  id: string;
  start_time?: string | null;
  end_time?: string | null;
  class_type_name?: string | null;
  instructor_name?: string | null;
  current_bookings?: number | null;
  max_capacity?: number | null;
  capacity?: number | null;
};

type DecoratedClass = {
  raw: ScheduleClass;
  start: Date | null;
  end: Date | null;
  timeLabel: string;
  endLabel: string | null;
  name: string;
  instructor: string;
  classCat: ClassCat;
  tint: keyof typeof KALA;
  color: string;
  capacity: number;
  booked: number;
  remaining: number;
};

function inferClassCat(name: string): ClassCat {
  const n = name?.toLowerCase() ?? "";
  if (n.includes("pilates") || n.includes("mat") || n.includes("flow") || n.includes("hot")) return "pilates";
  return "jumping";
}

function canBook(classCat: ClassCat, membershipCat: ClassCat | null): boolean {
  if (!membershipCat || membershipCat === "all" || membershipCat === "mixto") return true;
  return classCat === membershipCat;
}

function decorateClass(cls: ScheduleClass): DecoratedClass {
  const start = cls.start_time ? safeParse(cls.start_time) : null;
  const end = cls.end_time ? safeParse(cls.end_time) : null;
  const name = cls.class_type_name ?? "Clase";
  const classCat = inferClassCat(name);
  const tint = CAT_TINT[classCat];
  const capacity = Number(cls.max_capacity ?? cls.capacity ?? 5);
  const booked = Number(cls.current_bookings ?? 0);
  return {
    raw: cls,
    start,
    end,
    timeLabel: start ? format(start, "HH:mm") : "--:--",
    endLabel: end ? format(end, "HH:mm") : null,
    name,
    instructor: cls.instructor_name ?? "Kala Studio",
    classCat,
    tint,
    color: KALA[tint],
    capacity,
    booked,
    remaining: Math.max(0, capacity - booked),
  };
}

const BookClasses = () => {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const navigate = useNavigate();

  const { data: classesData, isLoading: loadingClasses } = useQuery({
    queryKey: ["public-classes", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () =>
      (await api.get(`/classes?start=${format(weekStart, "yyyy-MM-dd")}&end=${format(weekEnd, "yyyy-MM-dd")}`)).data,
  });

  const { data: bookingsData } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => (await api.get("/bookings/my-bookings")).data,
  });

  const { data: membershipData } = useQuery({
    queryKey: ["my-membership"],
    queryFn: async () => (await api.get("/memberships/my")).data,
  });

  const { data: weeklyStatusData } = useQuery({
    queryKey: ["weekly-status", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () =>
      (await api.get(`/bookings/weekly-status?date=${format(weekStart, "yyyy-MM-dd")}`)).data,
  });

  const classes: ScheduleClass[] = Array.isArray(classesData?.data) ? classesData.data : Array.isArray(classesData) ? classesData : [];
  const myBookings: BookingClient[] = Array.isArray(bookingsData?.data) ? bookingsData.data : Array.isArray(bookingsData) ? bookingsData : [];
  const membership = membershipData?.data ?? null;
  // Una membresía vencida sigue status='active' en DB pero no es reservable:
  // el backend la marca con isExpired, y la tratamos como sin paquete activo.
  const hasActive = membership?.status === "active" && !membership?.isExpired;
  const membershipCat: ClassCat | null = hasActive
    ? ((membership.classCategory ?? membership.class_category ?? "all") as ClassCat)
    : null;
  const classesRemaining = membership?.classesRemaining ?? membership?.classes_remaining;
  const isUnlimited = classesRemaining === null || classesRemaining === undefined || classesRemaining === 9999;
  const weeklyStatus: { plan_name: string; limit: number; used: number; remaining: number }[] =
    Array.isArray(weeklyStatusData?.data) ? weeklyStatusData.data : [];
  const weeklyCap = weeklyStatus[0] ?? null;
  const myBookedClassIds = useMemo(() => new Set(myBookings.map((b) => b.class_id)), [myBookings]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const decoratedClasses = useMemo(
    () => classes.map(decorateClass).sort((a, b) => (a.raw.start_time ?? "").localeCompare(b.raw.start_time ?? "")),
    [classes]
  );

  const classesForDay = (day: Date) =>
    decoratedClasses.filter((cls) => cls.start && isSameDay(cls.start, day));

  const now = new Date();
  const totalClasses = decoratedClasses.length;
  const bookedThisWeek = decoratedClasses.filter((cls) => myBookedClassIds.has(cls.raw.id)).length;
  const nextBookable = decoratedClasses.find((cls) => {
    if (!cls.start || isBefore(cls.start, now) || myBookedClassIds.has(cls.raw.id)) return false;
    return hasActive && canBook(cls.classCat, membershipCat);
  });

  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM", { locale: es })}`;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <section
          className="relative overflow-hidden rounded-[2rem] p-5 sm:p-7 lg:p-8"
          style={{ backgroundColor: KALA.blush, border: `1px solid ${KALA.border}` }}
        >
          <div
            className="absolute -right-20 -top-24 h-72 w-72 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${KALA.coral}26 0%, transparent 68%)` }}
          />
          <div
            className="absolute -bottom-28 left-1/3 h-72 w-72 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${KALA.olive}22 0%, transparent 68%)` }}
          />

          <div className="relative grid gap-7 xl:grid-cols-[1fr_auto] xl:items-end">
            <div>
              <span className="inline-flex items-center gap-2 text-[0.66rem] font-medium uppercase tracking-[0.24em]" style={{ color: KALA.berry }}>
                <Sparkles size={13} />
                Tu agenda Kala
              </span>
              <h1 className="mt-3 font-bebas leading-[0.95] tracking-tight" style={{ color: KALA.ink, fontSize: "clamp(2rem, 4.6vw, 4.2rem)" }}>
                Reserva tu clase
                <span className="block italic font-alilato font-normal" style={{ color: KALA.berry, fontSize: "0.7em" }}>
                  sin perder el ritmo.
                </span>
              </h1>
              <p className="mt-4 max-w-[62ch] text-[0.98rem] leading-[1.7]" style={{ color: KALA.ink, opacity: 0.68 }}>
                Revisa cupos, horarios y tu tope semanal en una sola vista. Las clases disponibles aparecen listas para reservar.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <button
                onClick={() => setWeekStart((w) => subWeeks(w, 1))}
                aria-label="Semana anterior"
                className="grid h-11 w-11 place-items-center rounded-full bg-transparent cursor-pointer transition-transform hover:-translate-y-0.5"
                style={{ border: `1px solid ${KALA.border}`, color: KALA.ink }}
              >
                <ChevronLeft size={17} />
              </button>
              <div className="rounded-full px-5 py-3 text-center" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
                <p className="text-[0.58rem] uppercase tracking-[0.24em]" style={{ color: KALA.berry }}>Semana</p>
                <p className="mt-0.5 font-bebas text-[1.15rem] leading-none tabular-nums" style={{ color: KALA.ink }}>
                  {weekLabel}
                </p>
              </div>
              <button
                onClick={() => setWeekStart((w) => addWeeks(w, 1))}
                aria-label="Semana siguiente"
                className="grid h-11 w-11 place-items-center rounded-full bg-transparent cursor-pointer transition-transform hover:-translate-y-0.5"
                style={{ border: `1px solid ${KALA.border}`, color: KALA.ink }}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-[1.3fr_0.9fr_0.8fr]">
          {hasActive ? (
            <div className="rounded-[1.5rem] p-4 sm:p-5" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.62rem] font-medium uppercase tracking-[0.22em]" style={{ color: KALA.berry }}>
                  Tu membresía
                </span>
                <Tag tint={CAT_TINT[membershipCat ?? "all"]}>{CAT_LABEL[membershipCat ?? "all"]}</Tag>
              </div>
              <div className="mt-3 flex items-end justify-between gap-4">
                <p className="font-bebas text-[1.45rem] leading-none" style={{ color: KALA.ink }}>
                  {membership.planName ?? membership.plan_name}
                </p>
                <div className="text-right">
                  <p className="font-bebas text-[2rem] leading-none tabular-nums" style={{ color: KALA.berry }}>
                    {isUnlimited ? "∞" : classesRemaining}
                  </p>
                  <p className="text-[0.62rem] uppercase tracking-[0.18em]" style={{ color: KALA.ink, opacity: 0.55 }}>
                    clases por usar
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <InfoBanner
              tone="orange"
              title="No tienes paquete activo."
              description="Compra un paquete para reservar clases. Puedes empezar con una clase muestra."
              action={<PrimaryButton size="sm" to="/app/checkout">Ver paquetes</PrimaryButton>}
            />
          )}

          <div className="rounded-[1.5rem] p-4 sm:p-5" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
            <span className="text-[0.62rem] font-medium uppercase tracking-[0.22em]" style={{ color: weeklyCap?.remaining === 0 ? KALA.coral : KALA.olive }}>
              Tope semanal
            </span>
            <div className="mt-3 flex items-end justify-between gap-4">
              <p className="text-[0.9rem] leading-[1.55]" style={{ color: KALA.ink, opacity: 0.72 }}>
                {weeklyCap
                  ? weeklyCap.remaining === 0
                    ? "Semana completa. Cancela una clase si quieres mover tu agenda."
                    : "Todavía puedes reservar esta semana."
                  : "Te mostraremos tu límite semanal al cargar tu plan."}
              </p>
              <p className="font-bebas text-[2rem] leading-none tabular-nums" style={{ color: KALA.olive }}>
                {weeklyCap ? `${weeklyCap.remaining}/${weeklyCap.limit}` : "--"}
              </p>
            </div>
          </div>

          <div className="rounded-[1.5rem] p-4 sm:p-5" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
            <span className="text-[0.62rem] font-medium uppercase tracking-[0.22em]" style={{ color: KALA.coral }}>
              Próxima disponible
            </span>
            <div className="mt-3 flex items-end justify-between gap-4">
              <p className="text-[0.9rem] leading-[1.55]" style={{ color: KALA.ink, opacity: 0.72 }}>
                {nextBookable?.start
                  ? format(nextBookable.start, "EEE d, HH:mm", { locale: es })
                  : loadingClasses
                    ? "Buscando horarios..."
                    : "Sin clases reservables."}
              </p>
              <CalendarDays size={24} style={{ color: KALA.coral }} />
            </div>
          </div>
        </section>

        {membershipCat && membershipCat !== "all" && membershipCat !== "mixto" && (
          <p className="mt-3 text-[0.84rem]" style={{ color: KALA.ink, opacity: 0.65 }}>
            Tu membresía permite reservar solo clases de{" "}
            <span style={{ color: KALA[CAT_TINT[membershipCat]], fontWeight: 600 }}>{CAT_LABEL[membershipCat]}</span>.
          </p>
        )}

        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[0.7rem] font-medium uppercase tracking-[0.24em]" style={{ color: KALA.ink, opacity: 0.65 }}>
                Vista semanal
              </h2>
              <p className="mt-1 text-[0.86rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
                {totalClasses} clases publicadas, {bookedThisWeek} reservadas por ti.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["jumping", "pilates"] as ClassCat[]).map((cat) => (
                <Tag key={cat} tint={CAT_TINT[cat]}>{CAT_LABEL[cat]}</Tag>
              ))}
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.66rem] font-medium uppercase tracking-[0.18em]"
                style={{ backgroundColor: `${KALA.olive}1a`, color: KALA.olive }}
              >
                <CheckCircle2 size={11} /> Reservada
              </span>
            </div>
          </div>

          <div className="hidden lg:grid grid-cols-7 gap-3">
            {days.map((day, i) => {
              const todayMark = isToday(day);
              const dayClasses = classesForDay(day);
              return (
                <DayColumn
                  key={format(day, "yyyy-MM-dd")}
                  day={day}
                  dayIndex={i}
                  todayMark={todayMark}
                  dayClasses={dayClasses}
                  loadingClasses={loadingClasses}
                  now={now}
                  hasActive={hasActive}
                  membershipCat={membershipCat}
                  myBookedClassIds={myBookedClassIds}
                  onPick={(id) => navigate(`/app/classes/${id}`)}
                />
              );
            })}
          </div>

          <div className="lg:hidden space-y-3">
            <p className="text-[0.66rem] font-medium uppercase tracking-[0.24em]" style={{ color: KALA.berry }}>
              Lista móvil
            </p>
            {days.map((day, i) => {
              const dayClasses = classesForDay(day);
              return (
                <MobileDay
                  key={format(day, "yyyy-MM-dd")}
                  day={day}
                  dayIndex={i}
                  dayClasses={dayClasses}
                  loadingClasses={loadingClasses}
                  now={now}
                  hasActive={hasActive}
                  membershipCat={membershipCat}
                  myBookedClassIds={myBookedClassIds}
                  onPick={(id) => navigate(`/app/classes/${id}`)}
                />
              );
            })}
          </div>
        </section>
      </AppShell>
    </ClientAuthGuard>
  );
};

type ClassCardProps = {
  cls: DecoratedClass;
  now: Date;
  hasActive: boolean;
  membershipCat: ClassCat | null;
  myBookedClassIds: Set<string>;
  onPick: (id: string) => void;
  compact?: boolean;
};

const ClassCard = ({ cls, now, hasActive, membershipCat, myBookedClassIds, onPick, compact = false }: ClassCardProps) => {
  const isPast = cls.start ? isBefore(cls.start, now) : true;
  const isBooked = myBookedClassIds.has(cls.raw.id);
  const allowed = canBook(cls.classCat, membershipCat);
  const locked = !isBooked && !isPast && !allowed;
  const full = cls.remaining === 0;
  const disabled = isPast || locked || !hasActive;
  const capacityPct = cls.capacity > 0 ? Math.min(100, Math.round((cls.booked / cls.capacity) * 100)) : 0;
  const statusLabel = isBooked
    ? "Reservada"
    : locked
      ? "Otra membresía"
      : isPast
        ? "Pasó"
        : full
          ? "Lista de espera"
          : "Reservar clase";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(cls.raw.id)}
      className="group w-full text-left rounded-[1.25rem] p-3.5 transition-all bg-transparent cursor-pointer disabled:cursor-not-allowed"
      style={{
        backgroundColor: isBooked
          ? `${KALA.olive}1a`
          : isPast || locked
            ? `${KALA.ink}05`
            : `${cls.color}10`,
        border: `1px solid ${
          isBooked
            ? `${KALA.olive}66`
            : isPast || locked
              ? KALA.border
              : `${cls.color}40`
        }`,
        opacity: isPast ? 0.52 : locked ? 0.56 : !hasActive ? 0.62 : 1,
      }}
    >
      <div className={compact ? "flex items-start gap-3" : ""}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bebas text-[1.05rem] leading-tight tracking-tight truncate" style={{ color: isBooked ? KALA.olive : disabled ? KALA.ink : cls.color }}>
                {cls.name}
              </span>
              {isBooked && <CheckCircle2 size={13} style={{ color: KALA.olive }} />}
              {locked && <Lock size={12} style={{ color: KALA.ink, opacity: 0.45 }} />}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-[0.78rem] tabular-nums" style={{ color: KALA.ink, opacity: 0.62 }}>
              <Clock3 size={12} />
              {cls.timeLabel}{cls.endLabel ? ` - ${cls.endLabel}` : ""}
            </p>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.14em]"
            style={{
              backgroundColor: isBooked ? `${KALA.olive}1f` : `${cls.color}18`,
              color: isBooked ? KALA.olive : cls.color,
            }}
          >
            {statusLabel}
          </span>
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[0.72rem]" style={{ color: KALA.ink, opacity: 0.62 }}>
            <span className="inline-flex items-center gap-1.5">
              <Users size={12} />
              {cls.remaining} lugares libres
            </span>
            <span>{cls.booked}/{cls.capacity}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `${KALA.ink}12` }}>
            <span
              className="block h-full rounded-full transition-[width] duration-300"
              style={{ width: `${capacityPct}%`, backgroundColor: full ? KALA.coral : cls.color }}
            />
          </div>
        </div>
      </div>
    </button>
  );
};

type DayProps = {
  day: Date;
  dayIndex: number;
  dayClasses: DecoratedClass[];
  loadingClasses: boolean;
  now: Date;
  hasActive: boolean;
  membershipCat: ClassCat | null;
  myBookedClassIds: Set<string>;
  onPick: (id: string) => void;
};

const DayColumn = ({
  day,
  dayIndex,
  dayClasses,
  loadingClasses,
  now,
  hasActive,
  membershipCat,
  myBookedClassIds,
  onPick,
  todayMark,
}: DayProps & { todayMark: boolean }) => (
  <article
    className="min-h-[520px] rounded-[1.5rem] p-3"
    style={{
      backgroundColor: todayMark ? `${KALA.blush}` : KALA.cream,
      border: `1px solid ${todayMark ? `${KALA.berry}33` : KALA.border}`,
    }}
  >
    <div className="mb-3 flex items-end justify-between gap-2">
      <div>
        <p className="text-[0.62rem] uppercase tracking-[0.2em]" style={{ color: todayMark ? KALA.berry : KALA.ink, opacity: todayMark ? 1 : 0.5 }}>
          {DAY_LABELS[dayIndex]}
        </p>
        <p className="font-bebas text-[2rem] leading-none tabular-nums" style={{ color: todayMark ? KALA.berry : KALA.ink }}>
          {format(day, "d")}
        </p>
      </div>
      <span className="rounded-full px-2 py-1 text-[0.62rem] font-medium" style={{ backgroundColor: todayMark ? KALA.cream : KALA.blush, color: KALA.berry }}>
        {dayClasses.length}
      </span>
    </div>

    <div className="space-y-2.5">
      {loadingClasses ? (
        <>
          <SkeletonRow height={86} />
          <SkeletonRow height={86} />
        </>
      ) : dayClasses.length === 0 ? (
        <div className="rounded-[1rem] border border-dashed p-4 text-center text-[0.78rem]" style={{ color: KALA.ink, borderColor: KALA.border, opacity: 0.45 }}>
          Sin clases
        </div>
      ) : (
        dayClasses.map((cls) => (
          <ClassCard
            key={cls.raw.id}
            cls={cls}
            now={now}
            hasActive={hasActive}
            membershipCat={membershipCat}
            myBookedClassIds={myBookedClassIds}
            onPick={onPick}
          />
        ))
      )}
    </div>
  </article>
);

const MobileDay = ({
  day,
  dayIndex,
  dayClasses,
  loadingClasses,
  now,
  hasActive,
  membershipCat,
  myBookedClassIds,
  onPick,
}: DayProps) => (
  <article className="rounded-[1.5rem] p-4" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-[0.62rem] uppercase tracking-[0.2em]" style={{ color: isToday(day) ? KALA.berry : KALA.ink, opacity: isToday(day) ? 1 : 0.55 }}>
          {DAY_LABELS[dayIndex]}
        </p>
        <h3 className="font-bebas text-[1.55rem] leading-none" style={{ color: KALA.ink }}>
          {format(day, "d 'de' MMMM", { locale: es })}
        </h3>
      </div>
      <span className="rounded-full px-3 py-1 text-[0.7rem] font-medium" style={{ backgroundColor: KALA.blush, color: KALA.berry }}>
        {dayClasses.length} clases
      </span>
    </div>

    <div className="space-y-2.5">
      {loadingClasses ? (
        <SkeletonRow height={88} />
      ) : dayClasses.length === 0 ? (
        <div className="rounded-[1rem] border border-dashed p-4 text-[0.84rem]" style={{ borderColor: KALA.border, color: KALA.ink, opacity: 0.5 }}>
          Sin clases publicadas para este día.
        </div>
      ) : (
        dayClasses.map((cls) => (
          <ClassCard
            key={cls.raw.id}
            cls={cls}
            now={now}
            hasActive={hasActive}
            membershipCat={membershipCat}
            myBookedClassIds={myBookedClassIds}
            onPick={onPick}
            compact
          />
        ))
      )}
    </div>
  </article>
);

export default BookClasses;
