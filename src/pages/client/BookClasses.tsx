import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
  isBefore,
  isToday,
} from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Tag,
  PrimaryButton,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import { InfoBanner } from "@/components/app/widgets";
import { ChevronLeft, ChevronRight, Lock, CheckCircle2 } from "lucide-react";
import type { BookingClient } from "@/types/booking";

const DAY_LABELS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

type ClassCat = "jumping" | "pilates" | "mixto" | "all";
const CAT_LABEL: Record<ClassCat, string> = {
  jumping: "Jumping",
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

function inferClassCat(name: string): ClassCat {
  const n = name?.toLowerCase() ?? "";
  if (n.includes("pilates") || n.includes("mat") || n.includes("flow") || n.includes("hot")) return "pilates";
  return "jumping";
}

function canBook(classCat: ClassCat, membershipCat: ClassCat | null): boolean {
  if (!membershipCat || membershipCat === "all" || membershipCat === "mixto") return true;
  return classCat === membershipCat;
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

  const classes: any[] = Array.isArray(classesData?.data) ? classesData.data : Array.isArray(classesData) ? classesData : [];
  const myBookings: BookingClient[] = Array.isArray(bookingsData?.data) ? bookingsData.data : Array.isArray(bookingsData) ? bookingsData : [];
  const membership = membershipData?.data ?? null;
  const hasActive = membership?.status === "active";
  const membershipCat: ClassCat | null = hasActive
    ? ((membership.classCategory ?? membership.class_category ?? "all") as ClassCat)
    : null;
  const classesRemaining = membership?.classesRemaining ?? membership?.classes_remaining;
  const isUnlimited = classesRemaining === null || classesRemaining === undefined || classesRemaining === 9999;

  const myBookedClassIds = useMemo(() => new Set(myBookings.map((b) => b.class_id)), [myBookings]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const classesForDay = (day: Date) =>
    classes
      .filter((c) => {
        if (!c.start_time) return false;
        const dt = safeParse(c.start_time);
        return format(dt, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
      })
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));

  const now = new Date();

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Reservar"
          title={<>Tu semana de</>}
          titleAccent="clases."
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekStart((w) => subWeeks(w, 1))}
                aria-label="Semana anterior"
                className="grid h-10 w-10 place-items-center rounded-full bg-transparent border-0 cursor-pointer transition-colors"
                style={{ border: `1px solid ${KALA.border}`, color: KALA.ink }}
              >
                <ChevronLeft size={16} />
              </button>
              <span
                className="font-bebas text-[0.95rem] tabular-nums px-3"
                style={{ color: KALA.ink }}
              >
                {format(weekStart, "d MMM", { locale: es })} — {format(weekEnd, "d MMM", { locale: es })}
              </span>
              <button
                onClick={() => setWeekStart((w) => addWeeks(w, 1))}
                aria-label="Semana siguiente"
                className="grid h-10 w-10 place-items-center rounded-full bg-transparent border-0 cursor-pointer transition-colors"
                style={{ border: `1px solid ${KALA.border}`, color: KALA.ink }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          }
        />

        {/* Membership banner */}
        {hasActive ? (
          <div
            className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
            style={{ backgroundColor: KALA.blush }}
          >
            <div className="flex items-center gap-3">
              <span className="text-[0.62rem] font-medium uppercase tracking-[0.24em]" style={{ color: KALA.berry }}>
                Tu membresía
              </span>
              <span className="font-bebas text-[1.1rem] leading-none" style={{ color: KALA.ink }}>
                {membership.planName ?? membership.plan_name}
              </span>
              <Tag tint={CAT_TINT[membershipCat ?? "all"]}>{CAT_LABEL[membershipCat ?? "all"]}</Tag>
            </div>
            <div className="flex items-baseline gap-2">
              {isUnlimited ? (
                <span className="font-bebas leading-none" style={{ color: KALA.berry, fontSize: "1.6rem" }}>∞</span>
              ) : (
                <>
                  <span className="font-bebas leading-none tabular-nums" style={{ color: KALA.berry, fontSize: "1.6rem" }}>
                    {classesRemaining}
                  </span>
                  <span className="text-[0.7rem] uppercase tracking-[0.18em]" style={{ color: KALA.ink, opacity: 0.55 }}>
                    clases por usar
                  </span>
                </>
              )}
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

        {membershipCat && membershipCat !== "all" && membershipCat !== "mixto" && (
          <p className="mt-3 text-[0.84rem]" style={{ color: KALA.ink, opacity: 0.65 }}>
            Tu membresía permite reservar solo clases de{" "}
            <span style={{ color: KALA[CAT_TINT[membershipCat]], fontWeight: 600 }}>{CAT_LABEL[membershipCat]}</span>.
          </p>
        )}

        {/* Week grid */}
        <Section title="Esta semana">
          <div className="overflow-x-auto -mx-5 sm:-mx-7 lg:mx-0 px-5 sm:px-7 lg:px-0">
            <div className="grid grid-cols-7 gap-2 min-w-[640px]">
              {days.map((day, i) => {
                const todayMark = isToday(day);
                const dayClasses = classesForDay(day);
                return (
                  <div key={i} className="flex flex-col gap-2">
                    <div
                      className="text-center pb-2"
                      style={{ borderBottom: `1px solid ${KALA.border}` }}
                    >
                      <div
                        className="text-[0.62rem] uppercase tracking-[0.22em]"
                        style={{ color: todayMark ? KALA.berry : KALA.ink, opacity: todayMark ? 1 : 0.55 }}
                      >
                        {DAY_LABELS[i]}
                      </div>
                      <div
                        className="font-bebas text-[1.4rem] tabular-nums leading-none mt-1"
                        style={{ color: todayMark ? KALA.berry : KALA.ink }}
                      >
                        {format(day, "d")}
                      </div>
                    </div>
                    {loadingClasses ? (
                      <SkeletonRow height={64} />
                    ) : dayClasses.length === 0 ? (
                      <div
                        className="rounded-xl p-3 text-center text-[0.72rem]"
                        style={{ color: KALA.ink, opacity: 0.35, border: `1px dashed ${KALA.border}` }}
                      >
                        sin clases
                      </div>
                    ) : (
                      dayClasses.map((cls) => {
                        const isPast = cls.start_time ? isBefore(safeParse(cls.start_time), now) : true;
                        const isBooked = myBookedClassIds.has(cls.id);
                        const classCat = inferClassCat(cls.class_type_name ?? "");
                        const tint = CAT_TINT[classCat];
                        const c = KALA[tint];
                        const allowed = canBook(classCat, membershipCat);
                        const locked = !isBooked && !isPast && !allowed;
                        const disabled = isPast || locked || !hasActive;
                        return (
                          <button
                            key={cls.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => navigate(`/app/classes/${cls.id}`)}
                            className="w-full text-left rounded-xl p-2.5 transition-all bg-transparent cursor-pointer disabled:cursor-not-allowed"
                            style={{
                              backgroundColor: isBooked
                                ? `${KALA.olive}1a`
                                : isPast || locked
                                  ? "transparent"
                                  : `${c}12`,
                              border: `1px solid ${
                                isBooked
                                  ? `${KALA.olive}55`
                                  : isPast || locked
                                    ? KALA.border
                                    : `${c}38`
                              }`,
                              opacity: isPast ? 0.4 : locked ? 0.45 : !hasActive ? 0.55 : 1,
                            }}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span
                                className="font-bebas text-[0.86rem] leading-tight tracking-tight truncate"
                                style={{ color: isBooked ? KALA.olive : isPast || locked ? KALA.ink : c }}
                              >
                                {cls.class_type_name}
                              </span>
                              {isBooked && <CheckCircle2 size={11} style={{ color: KALA.olive, marginTop: 2 }} />}
                              {locked && <Lock size={10} style={{ color: KALA.ink, opacity: 0.4, marginTop: 2 }} />}
                            </div>
                            <div
                              className="text-[0.72rem] tabular-nums mt-0.5"
                              style={{ color: KALA.ink, opacity: 0.55 }}
                            >
                              {cls.start_time ? format(safeParse(cls.start_time), "HH:mm") : ""}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-6 flex flex-wrap gap-2">
            {(["jumping", "pilates"] as ClassCat[]).map((cat) => (
              <Tag key={cat} tint={CAT_TINT[cat]}>{CAT_LABEL[cat]}</Tag>
            ))}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.66rem] font-medium uppercase tracking-[0.18em]"
              style={{ backgroundColor: "transparent", border: `1px dashed ${KALA.border}`, color: KALA.ink, opacity: 0.5 }}
            >
              <Lock size={10} /> Otra membresía
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.66rem] font-medium uppercase tracking-[0.18em]"
              style={{ backgroundColor: `${KALA.olive}1a`, color: KALA.olive }}
            >
              <CheckCircle2 size={11} /> Reservada
            </span>
          </div>
        </Section>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default BookClasses;
