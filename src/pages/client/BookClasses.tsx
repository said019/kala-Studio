import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  startOfWeek, endOfWeek, addWeeks, subWeeks, format,
  isBefore,
} from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingClient } from "@/types/booking";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// ── Category helpers ──────────────────────────────────────────────────────────
type ClassCat = "jumping" | "pilates" | "mixto" | "all";

const CAT_COLORS: Record<ClassCat, { bg: string; text: string; border: string; dot: string }> = {
  jumping: { bg: "bg-[#76214D]/15", text: "text-[#76214D]",  border: "border-[#76214D]/40", dot: "bg-[#76214D]"  },
  pilates: { bg: "bg-[#E9745F]/15", text: "text-[#E9745F]",  border: "border-[#E9745F]/40", dot: "bg-[#E9745F]"  },
  mixto:   { bg: "bg-[#F58A24]/15", text: "text-[#F58A24]",  border: "border-[#F58A24]/40", dot: "bg-[#F58A24]"  },
  all:     { bg: "bg-white/5",      text: "text-white/60",   border: "border-white/15",     dot: "bg-white/40"   },
};

const CAT_LABELS: Record<ClassCat, string> = {
  jumping: "Jumping", pilates: "Pilates", mixto: "Mixto", all: "Todas",
};

function inferClassCat(name: string): ClassCat {
  const n = name?.toLowerCase() ?? "";
  if (n.includes("pilates") || n.includes("mat") || n.includes("flow") || n.includes("hot")) return "pilates";
  return "jumping"; // jump, strong jump, dance, tone, mindful jump → jumping
}

function canBook(classCat: ClassCat, membershipCat: ClassCat | null): boolean {
  if (!membershipCat || membershipCat === "all" || membershipCat === "mixto") return true;
  return classCat === membershipCat;
}

// ── Membership banner ─────────────────────────────────────────────────────────
const MembershipBanner = ({ membership }: { membership: any }) => {
  const cat: ClassCat = (membership.classCategory ?? membership.class_category ?? "all") as ClassCat;
  const colors = CAT_COLORS[cat];
  const remaining = membership.classesRemaining ?? membership.classes_remaining;
  const isUnlimited = remaining === null || remaining === undefined || remaining === 9999;
  const endDate = membership.endDate ?? membership.end_date;

  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm", colors.bg, colors.border)}>
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", colors.dot)} />
        <span className={cn("font-semibold truncate", colors.text)}>{membership.planName ?? membership.plan_name}</span>
        <span className={cn("capitalize text-[10px] px-2 py-0.5 rounded-full font-semibold border shrink-0", colors.bg, colors.text, colors.border)}>
          {CAT_LABELS[cat]}
        </span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {!isUnlimited && (
          <div className="text-right">
            <div className={cn("text-base font-bold leading-none", colors.text)}>{remaining}</div>
            <div className="text-[10px] text-white/40">clases</div>
          </div>
        )}
        {isUnlimited && <span className={cn("text-xs font-bold", colors.text)}>∞ Ilimitado</span>}
        {endDate && (
          <div className="text-right">
            <div className="text-xs font-medium text-white/70">
              {new Date(endDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
            <div className="text-[10px] text-white/40">vencimiento</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const BookClasses = () => {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
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

  const myBookedClassIds = new Set(myBookings.map((b) => b.class_id));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

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
      <ClientLayout>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Reservar clase</h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => subWeeks(w, 1))}>
                <ChevronLeft size={16} />
              </Button>
              <span className="text-sm font-medium min-w-[96px] sm:min-w-[130px] text-center">
                {format(weekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM yyyy", { locale: es })}
              </span>
              <Button variant="outline" size="icon" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          {/* Membership status */}
          {hasActive ? (
            <MembershipBanner membership={membership} />
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/8 text-sm">
              <AlertCircle size={15} className="text-amber-400 shrink-0" />
              <span className="text-amber-300/90">
                No tienes membresía activa.{" "}
                <a href="/app/checkout" className="underline font-semibold">Adquiere un plan</a> para reservar.
              </span>
            </div>
          )}

          {/* Filter hint */}
          {membershipCat && membershipCat !== "all" && membershipCat !== "mixto" && (
            <div className="flex items-center gap-1.5 text-xs px-1">
              <CheckCircle2 size={11} className={CAT_COLORS[membershipCat].text} />
              <span className="text-white/40">
                Tu membresía <span className={cn("font-semibold", CAT_COLORS[membershipCat].text)}>{CAT_LABELS[membershipCat]}</span> solo permite reservar clases de esa categoría.
              </span>
            </div>
          )}

          {/* Week grid */}
          <div className="overflow-x-auto">
            <div className="grid grid-cols-7 gap-1 min-w-[520px] sm:min-w-[560px]">
              {days.map((day, i) => (
                <div key={i} className="text-center">
                  <div className="text-xs font-medium text-muted-foreground py-1">{DAYS[i]}</div>
                  <div className="text-sm font-bold pb-2">{format(day, "d")}</div>
                  {loadingClasses ? (
                    <Skeleton className="h-16 w-full rounded-lg" />
                  ) : (
                    <div className="space-y-1">
                      {classesForDay(day).map((cls) => {
                        const isPast = cls.start_time ? isBefore(safeParse(cls.start_time), now) : true;
                        const isBooked = myBookedClassIds.has(cls.id);
                        const classCat = inferClassCat(cls.class_type_name ?? "");
                        const c = CAT_COLORS[classCat];
                        const allowed = canBook(classCat, membershipCat);
                        const locked = !isBooked && !isPast && !allowed;
                        const disabled = isPast || locked;

                        return (
                          <button
                            key={cls.id}
                            disabled={disabled}
                            onClick={() => navigate(`/app/classes/${cls.id}`)}
                            className={cn(
                              "w-full text-left rounded-lg border p-1.5 text-xs transition-all relative",
                              isBooked  && "border-green-500/40 bg-green-500/10",
                              !isBooked && !disabled && cn(c.border, "hover:opacity-90 cursor-pointer", c.bg),
                              !isBooked && isPast  && "opacity-30 cursor-not-allowed border-white/8 bg-transparent",
                              !isBooked && locked  && "opacity-25 cursor-not-allowed border-white/5 bg-transparent",
                            )}
                          >
                            <div className="flex items-center gap-1 mb-0.5">
                              <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", c.dot)} />
                              <p className={cn("font-semibold truncate text-[11px]", c.text)}>
                                {cls.class_type_name}
                              </p>
                            </div>
                            <p className="text-white/40 text-[10px]">
                              {cls.start_time ? format(safeParse(cls.start_time), "HH:mm") : "—"}
                            </p>
                            {isBooked && (
                              <span className="absolute top-1 right-1">
                                <CheckCircle2 size={10} className="text-green-400" />
                              </span>
                            )}
                            {locked && (
                              <span className="absolute top-1 right-1">
                                <Lock size={8} className="text-white/20" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 pt-1">
            {(["jumping", "pilates"] as ClassCat[]).map(cat => (
              <div key={cat} className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium", CAT_COLORS[cat].bg, CAT_COLORS[cat].text, CAT_COLORS[cat].border)}>
                <div className={cn("w-1.5 h-1.5 rounded-full", CAT_COLORS[cat].dot)} />
                {CAT_LABELS[cat]}
              </div>
            ))}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] font-medium text-white/30">
              <Lock size={9} /> Requiere otra membresía
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-green-500/30 bg-green-500/8 text-[11px] font-medium text-green-400">
              <CheckCircle2 size={9} /> Reservada
            </div>
          </div>
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default BookClasses;
