import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  format, addDays, startOfWeek, isSameDay, parseISO,
  isToday, addWeeks, subWeeks, differenceInMinutes,
} from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, ChevronLeft, ChevronRight, Clock, ArrowUpRight } from "lucide-react";
import api from "@/lib/api";
import { BookingDialog, type ClassItem } from "@/components/BookingDialog";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiClass {
  id: string;
  date: string;
  class_date: string;
  start_time: string;
  end_time: string;
  class_type_name: string;
  class_type_color: string;
  instructor_name: string;
  instructor_photo?: string;
  capacity: number;
  max_capacity?: number;
  current_bookings: number;
  status: string;
}

interface ScheduleClass {
  id: string;
  name: string;
  time: string;      // ISO 'YYYY-MM-DDTHH:MM'
  endTime: string;
  duration: number;
  instructor: string;
  instructorPhoto?: string | null;
  spots: number;
  maxSpots: number;
  color: string;
}

// ─── Fallback colors ──────────────────────────────────────────────────────────

const fallbackColors: Record<string, string> = {
  "Barre": "#76214D",
  "Jumping Fitness": "#76214D",
  "Jumping Dance":   "#E9745F",
  "Jump & Tone":     "#F58A24",
  "Strong Jump":     "#76214D",
  "Mindful Jump":    "#E9745F",
  "Hot Pilates":     "#F58A24",
  "Flow Pilates":    "#76214D",
  "Pilates Mat":     "#E9745F",
};
const DEFAULT_COLOR = "#778455";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  try { return format(parseISO(iso), "HH:mm"); } catch { return iso.slice(11, 16); }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Schedule() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekStart, setWeekStart] = useState<Date>(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState(new Date());
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Tick every 30 s for real-time badges
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Reset filter when day changes
  useEffect(() => { setFilter("all"); }, [selectedDate]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const startDate = format(weekStart, "yyyy-MM-dd");
  const endDate   = format(addDays(weekStart, 13), "yyyy-MM-dd");

  const { data: rawClasses, isLoading } = useQuery<ApiClass[]>({
    queryKey: ["public-classes", startDate, endDate],
    queryFn: async () => {
      const { data } = await api.get(`/classes?start=${startDate}&end=${endDate}`);
      // API returns { data: [...] } or directly [...]
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
    staleTime: 1000 * 60 * 2,
  });

  // ── Transform ──────────────────────────────────────────────────────────────
  const allClasses: ScheduleClass[] = useMemo(() => {
    if (!rawClasses) return [];
    return rawClasses
      .filter((c) => c.status !== "cancelled")
      .map((c) => {
        // start_time is now a full ISO string "YYYY-MM-DDTHH:mm" from the server
        const dateStr = (c.date || c.class_date || (c.start_time?.split("T")[0]) || "").split("T")[0];
        // Extract just the HH:mm part from whatever format start_time comes in
        const startTimePart = c.start_time?.includes("T")
          ? c.start_time.split("T")[1].slice(0, 5)
          : (c.start_time ?? "00:00").slice(0, 5);
        const endTimePart = c.end_time?.includes("T")
          ? c.end_time.split("T")[1].slice(0, 5)
          : (c.end_time ?? "").slice(0, 5);
        const available = (c.capacity ?? c.max_capacity ?? 0) - (c.current_bookings ?? 0);
        return {
          id:         c.id,
          name:       c.class_type_name ?? "Clase",
          time:       `${dateStr}T${startTimePart}`,
          endTime:    endTimePart,
          duration:   50,
          instructor: c.instructor_name ?? "Por confirmar",
          instructorPhoto: (c as any).instructor_photo ?? null,
          spots:      Math.max(0, available),
          maxSpots:   c.capacity ?? (c as any).max_capacity ?? 1,
          color:      c.class_type_color || fallbackColors[c.class_type_name] || DEFAULT_COLOR,
        };
      });
  }, [rawClasses]);

  // ── Week days ──────────────────────────────────────────────────────────────
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // ── Day classes ────────────────────────────────────────────────────────────
  const dayClasses = useMemo(
    () => allClasses.filter((c) => {
      try { return isSameDay(parseISO(c.time), selectedDate); } catch { return false; }
    }).sort((a, b) => a.time.localeCompare(b.time)),
    [allClasses, selectedDate]
  );

  // ── Unique types for filter pills ──────────────────────────────────────────
  const uniqueTypes = useMemo(
    () => [...new Set(dayClasses.map((c) => c.name))],
    [dayClasses]
  );

  const filteredClasses = useMemo(
    () => filter === "all" ? dayClasses : dayClasses.filter((c) => c.name === filter),
    [dayClasses, filter]
  );

  // ── Real-time status ───────────────────────────────────────────────────────
  const getTimeStatus = (cls: ScheduleClass) => {
    try {
      const classStart = parseISO(cls.time);
      if (!isToday(classStart)) return null;

      const dateStr     = cls.time.split("T")[0];
      const endDateTime = cls.endTime
        ? parseISO(`${dateStr}T${cls.endTime.slice(0, 5)}`)
        : new Date(classStart.getTime() + cls.duration * 60_000);

      if (now >= endDateTime) return { status: "past", label: "Finalizada" };
      if (now >= classStart) {
        const minsLeft = differenceInMinutes(endDateTime, now);
        return { status: "in-progress", label: `En curso · ${minsLeft} min restantes` };
      }
      const minsUntil = differenceInMinutes(classStart, now);
      if (minsUntil < 60) return { status: "upcoming", label: `En ${minsUntil} min` };
      const hours = Math.floor(minsUntil / 60);
      const mins  = minsUntil % 60;
      return { status: "upcoming", label: mins === 0 ? `En ${hours}h` : `En ${hours}h ${mins}m` };
    } catch { return null; }
  };

  // ── Dots per day ───────────────────────────────────────────────────────────
  const classCountByDay = useMemo(() => {
    const map: Record<string, number> = {};
    allClasses.forEach((c) => {
      const key = c.time.split("T")[0];
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [allClasses]);

  // ── Book handler ───────────────────────────────────────────────────────────
  const handleBook = (cls: ScheduleClass) => {
    setSelectedClass({
      id:         cls.id,
      time:       formatTime(cls.time),
      type:       cls.name,
      instructor: cls.instructor,
      spots:      cls.spots,
      duration:   `${cls.duration} min`,
      date:       parseISO(cls.time),
      color:      cls.color,
    });
    setDialogOpen(true);
  };

  // ── isPastDay ──────────────────────────────────────────────────────────────
  const isPastDay = (d: Date) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const check = new Date(d);  check.setHours(0, 0, 0, 0);
    return check < today;
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <section id="horario" className="scroll-mt-16 bg-background relative overflow-hidden">

      {/* ── Atmospheric glows ─────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(119,132,85,0.10) 0%, transparent 70%)" }} />
      <div className="pointer-events-none fixed bottom-0 right-0 w-[400px] h-[400px] rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(233,116,95,0.06) 0%, transparent 70%)" }} />

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 lg:px-10">

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div className="pt-14 pb-0">

          {/* Studio label */}
          <p className="text-[11px] font-normal tracking-[0.25em] uppercase text-muted-foreground mb-8">
            Kala · Barre Studio
          </p>

          <div className="mb-8 grid grid-cols-1 gap-3 rounded-3xl border border-primary/15 bg-white/70 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Horarios</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Lunes a viernes: 7:00 AM, 8:00 AM, 7:00 PM y 8:00 PM.
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Sábados: 7:00 AM, 8:00 AM y 9:00 AM.
              </p>
            </div>
            <span className="w-fit rounded-full bg-primary/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              Cupos de 4 a 5 alumnas
            </span>
          </div>

          {/* Month nav */}
          <div className="flex items-center gap-5 mb-8">
            <button
              onClick={() => setWeekStart((p) => subWeeks(p, 1))}
              className="w-10 h-10 rounded-full border border-primary/10 bg-white flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="flex-1 font-bebas text-[2.1rem] font-semibold tracking-tight text-foreground">
              <span className="capitalize">{format(weekStart, "MMMM", { locale: es })}</span>{" "}
              <span className="font-bold text-primary">{format(weekStart, "yyyy")}</span>
            </h2>
            <button
              onClick={() => setWeekStart((p) => addWeeks(p, 1))}
              className="w-10 h-10 rounded-full border border-primary/10 bg-white flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Week strip — day pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-14 scrollbar-none"
            style={{ scrollbarWidth: "none" }}>
            {weekDays.map((day) => {
              const past     = isPastDay(day);
              const selected = isSameDay(day, selectedDate);
              const todayDay = isToday(day);
              const dayKey   = format(day, "yyyy-MM-dd");
              const count    = classCountByDay[dayKey] ?? 0;
              const dotCount = Math.min(count, 4);

              return (
                <button
                  key={dayKey}
                  disabled={past}
                  onClick={() => setSelectedDate(day)}
                  style={selected ? {
                    background: "linear-gradient(135deg, var(--color-primary, #778455) 0%, #5E643E 100%)",
                    boxShadow: "0 8px 32px rgba(119,132,85,0.38), inset 0 0 0 1px rgba(255,255,255,0.1)",
                    transform: "translateY(-3px) scale(1.04)",
                    borderColor: "transparent",
                  } : {}}
                  className={[
                    "flex flex-col items-center gap-1.5 px-5 py-3.5 rounded-[20px] min-w-[72px] select-none transition-all duration-200 border",
                    past ? "opacity-25 cursor-not-allowed" : "cursor-pointer",
                    selected
                      ? "text-white"
                      : todayDay
                      ? "bg-white border-primary/30 text-foreground"
                      : "bg-white/80 border-primary/10 text-foreground/80 hover:border-primary/30 hover:-translate-y-0.5",
                  ].join(" ")}
                >
                  <span className={[
                    "text-[10px] font-semibold tracking-[0.12em] uppercase transition-colors",
                    selected ? "text-white/75" : "text-muted-foreground",
                  ].join(" ")}>
                    {format(day, "EEE", { locale: es })}
                  </span>
                  <span className={[
                    "font-bebas text-[1.6rem] font-semibold leading-none transition-colors",
                    !selected && todayDay ? "text-primary" : "",
                  ].join(" ")}>
                    {format(day, "d")}
                  </span>
                  {/* Dots */}
                  <div className="flex gap-[3px] h-[8px] items-center justify-center">
                    {Array.from({ length: dotCount }).map((_, i) => (
                      <span
                        key={i}
                        className="w-1 h-1 rounded-full transition-all"
                        style={{
                          background: selected ? "rgba(255,255,255,0.75)"
                            : todayDay ? "var(--color-primary, #778455)"
                            : "rgba(118,33,77,0.25)",
                        }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── FILTERS ROW ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 flex-wrap">
          <div className="font-bebas text-[1.35rem] font-semibold text-foreground">
            {filteredClasses.length} clase{filteredClasses.length !== 1 ? "s" : ""}{" "}
            <span className="text-muted-foreground text-base font-light font-sans">
              · {format(selectedDate, "EEE d 'de' MMMM", { locale: es })}
            </span>
          </div>

          {uniqueTypes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilter("all")}
                className={[
                  "px-4 py-[7px] rounded-full text-xs font-medium transition-all border tracking-wide",
                  filter === "all"
                    ? "bg-primary border-transparent text-white shadow-[0_4px_16px_rgba(119,132,85,0.35)]"
                    : "bg-white/80 border-primary/10 text-muted-foreground hover:border-primary/40 hover:text-primary",
                ].join(" ")}
              >
                Todas
              </button>
              {uniqueTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={[
                    "px-4 py-[7px] rounded-full text-xs font-medium transition-all border tracking-wide",
                    filter === t
                      ? "bg-primary border-transparent text-white shadow-[0_4px_16px_rgba(119,132,85,0.35)]"
                      : "bg-white/80 border-primary/10 text-muted-foreground hover:border-primary/40 hover:text-primary",
                  ].join(" ")}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── CARDS ───────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm tracking-wide">Cargando clases…</span>
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <p className="text-sm">No hay clases para este día.</p>
            {filter !== "all" && (
              <button onClick={() => setFilter("all")} className="mt-3 text-primary text-sm underline underline-offset-2">
                Ver todas
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 pb-16">
            {filteredClasses.map((cls, idx) => {
              const ts           = getTimeStatus(cls);
              const isPast       = ts?.status === "past";
              const inProg       = ts?.status === "in-progress";
              const upcoming     = ts?.status === "upcoming";
              const full         = cls.spots === 0;
              const spotsPercent = ((cls.maxSpots - cls.spots) / cls.maxSpots) * 100;
              const accent       = isPast ? "rgba(123,91,82,0.35)" : cls.color;
              const initials     = cls.instructor.split(" ").map((w: string) => w[0]).slice(0, 2).join("");

              // Status badge config
              const badgeCfg = (() => {
                if (isPast)   return { label: "Finalizada",      bg: "rgba(123,91,82,0.08)", color: "rgba(123,91,82,0.75)", dot: false };
                if (inProg)   return { label: ts!.label,         bg: `${accent}22`,            color: accent,                   dot: "pulse" };
                if (upcoming) return { label: ts!.label,         bg: `${accent}18`,            color: accent,                   dot: true };
                return null;
              })();

              return (
                <div
                  key={cls.id}
                  style={{
                    animationDelay: `${idx * 0.07}s`,
                    ["--card-accent" as string]: accent,
                    background: isPast
                      ? "linear-gradient(135deg, rgba(241,214,206,0.70) 0%, rgba(255,247,242,0.92) 100%)"
                      : `linear-gradient(135deg, #FFFFFF 0%, ${accent}0d 70%, rgba(255,240,228,0.74) 100%)`,
                    borderColor: isPast ? "rgba(123,91,82,0.10)" : `${accent}28`,
                  }}
                  className={[
                    "relative border rounded-3xl p-7 overflow-hidden",
                    "transition-all duration-300 cursor-pointer group",
                    isPast ? "" : "hover:-translate-y-1.5 hover:scale-[1.01]",
                    isPast ? "" : "hover:shadow-[0_20px_60px_rgba(118,33,77,0.14)]",
                    isPast ? "opacity-60 pointer-events-none" : "",
                    "animate-[fadeSlideUp_0.4s_both]",
                  ].join(" ")}
                >
                  {/* Top accent line on hover */}
                  <div
                    className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
                  />

                  {/* Background glow orb */}
                  <div
                    className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-[0.06] group-hover:opacity-[0.12] transition-opacity pointer-events-none"
                    style={{ background: accent }}
                  />

                  {/* ── Card top row ── */}
                  <div className="flex items-start justify-between mb-5">
                    {/* Status badge */}
                    {badgeCfg ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-[11px] py-[5px] rounded-full text-[11px] font-semibold tracking-wide uppercase border"
                        style={{
                          background: badgeCfg.bg,
                          color: badgeCfg.color,
                          borderColor: `${badgeCfg.color}40`,
                        }}
                      >
                        {badgeCfg.dot && (
                          <span
                            className={["w-1.5 h-1.5 rounded-full", badgeCfg.dot === "pulse" ? "animate-pulse" : ""].join(" ")}
                            style={{ background: badgeCfg.color }}
                          />
                        )}
                        {badgeCfg.label}
                      </span>
                    ) : (
                      <span />
                    )}

                    {/* Book button */}
                    {!isPast && (
                      <button
                        disabled={full}
                        onClick={(e) => { e.stopPropagation(); !full && handleBook(cls); }}
                        className={[
                          "px-5 py-[9px] rounded-full text-[12px] font-semibold tracking-wide transition-all",
                          full
                            ? "bg-[#F1D6CE] text-muted-foreground cursor-not-allowed"
                            : "text-white hover:scale-105",
                        ].join(" ")}
                        style={!full ? {
                          background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)`,
                          boxShadow: `0 4px 20px ${accent}55`,
                        } : {}}
                      >
                        {full ? "Llena" : "Reservar"}
                      </button>
                    )}
                  </div>

                  {/* ── Class name ── */}
                  <h3 className="font-bebas text-[1.6rem] font-semibold leading-tight tracking-tight text-foreground mb-4">
                    {cls.name}
                  </h3>

                  {/* ── Time row ── */}
                  <div className="flex items-center gap-2 mb-3 text-muted-foreground text-[13px] font-medium">
                    <Clock size={13} className="opacity-60 shrink-0" />
                    <span className="text-foreground text-[14px] font-medium">
                      {formatTime(cls.time)}{cls.endTime ? ` — ${cls.endTime.slice(0, 5)}` : ""}
                    </span>
                    <span className="ml-auto bg-[#FCE6E1] text-[#7B5B52] text-[11px] px-2 py-0.5 rounded-md">
                      {cls.duration} min
                    </span>
                  </div>

                  {/* ── Instructor ── */}
                  <div className="flex items-center gap-2.5 mb-5">
                    {cls.instructorPhoto ? (
                      <img
                        src={cls.instructorPhoto}
                        alt={cls.instructor}
                        className="w-7 h-7 rounded-full object-cover ring-[1.5px] ring-white/15 shrink-0"
                      />
                    ) : (
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white ring-[1.5px] ring-white/15 shrink-0"
                        style={{ background: `linear-gradient(135deg, ${accent}cc 0%, ${accent} 100%)` }}
                      >
                        {initials}
                      </span>
                    )}
                    <span className="text-[13px] text-muted-foreground font-normal">{cls.instructor}</span>
                  </div>

                  {/* ── Divider ── */}
                  <div className="h-px bg-primary/10 mb-4" />

                  {/* ── Capacity bar ── */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">Lugares</span>
                      <span
                        className="text-[12px] font-semibold"
                        style={{ color: full ? accent : "#2E201C" }}
                      >
                        {full
                          ? `${cls.maxSpots} / ${cls.maxSpots} — Lleno`
                          : `${cls.spots} disponibles`}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-[#F1D6CE] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${spotsPercent}%`,
                          background: full
                            ? `linear-gradient(90deg, ${accent}, ${accent}cc)`
                            : spotsPercent > 60
                            ? `linear-gradient(90deg, rgba(245,138,36,0.8), ${accent})`
                            : `linear-gradient(90deg, ${accent}cc, ${accent})`,
                          boxShadow: full ? `0 0 8px ${accent}88` : "none",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <div className="mb-16 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-primary/[0.03] to-transparent p-10 text-center">
          <p className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-2">
            ¿Primera vez en Kala?
          </p>
          <h3 className="font-bebas text-[clamp(1.7rem,2.7vw,2.3rem)] leading-none text-foreground mb-3">
            Prueba una clase muestra
          </h3>
          <p className="text-sm text-muted-foreground mb-7 max-w-sm mx-auto">
            Reserva tu clase muestra y descubre una experiencia cercana, energetica y personalizada.
          </p>
          <Link
            to="/auth/register?returnUrl=/app/book"
            className="inline-flex items-center gap-2 bg-primary text-white px-8 py-3.5 rounded-full text-[0.82rem] font-medium tracking-wider uppercase hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(119,132,85,0.35)] transition-all"
          >
            Reservar mi primera clase
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>

      {/* Booking dialog */}
      <BookingDialog
        classData={selectedClass}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {}}
      />

      {/* Keyframe for card entrance */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </section>
  );
}
