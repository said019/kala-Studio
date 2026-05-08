import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, startOfWeek, addDays, parseISO, eachDayOfInterval } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Palette, Zap, MoreHorizontal, Loader2, UserCheck, Sparkles, Calendar } from "lucide-react";

/* ── Palette ── */
const PALETTE_COLORS = [
  { label: "Rosa", value: "#76214D" },
  { label: "Violeta", value: "#E9745F" },
  { label: "Lima", value: "#F58A24" },
  { label: "Púrpura", value: "#8B5CF6" },
  { label: "Magenta", value: "#c026d3" },
  { label: "Azul", value: "#3B82F6" },
  { label: "Esmeralda", value: "#10B981" },
  { label: "Naranja", value: "#F97316" },
];

/* ── Types ── */
interface ClassInstance {
  id: string;
  classTypeId: string;
  classTypeName?: string;
  classTypeColor?: string;
  instructorId: string;
  instructorName?: string;
  instructorPhoto?: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  capacity?: number;
  bookedCount?: number;
  currentBookings?: number;
  isCancelled: boolean;
  notes?: string;
}

interface ClassType {
  id: string;
  name: string;
  color: string;
  category?: "jumping" | "pilates";
  defaultDuration?: number;
  durationMin?: number;
  maxCapacity?: number;
  capacity?: number;
  isActive?: boolean;
}

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const GENERATE_DAYS = [
  { label: "Lun", value: 1 },
  { label: "Mar", value: 2 },
  { label: "Mié", value: 3 },
  { label: "Jue", value: 4 },
  { label: "Vie", value: 5 },
  { label: "Sáb", value: 6 },
  { label: "Dom", value: 0 },
];

const TABS = [
  { key: "calendar",     label: "Calendario",    icon: CalendarDays },
  { key: "types",        label: "Tipos de clase", icon: Palette },
  { key: "generate",     label: "Generar semana", icon: Zap },
  { key: "instructors",  label: "Instructoras",   icon: UserCheck },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/* ── Schemas ── */
const classSchema = z.object({
  classTypeId: z.string().min(1),
  instructorId: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  maxCapacity: z.coerce.number().min(1),
  notes: z.string().optional(),
});
type ClassFormData = z.infer<typeof classSchema>;

const typeSchema = z.object({
  name: z.string().min(1),
  color: z.string().default("#E9745F"),
  category: z.enum(["jumping", "pilates"]).default("jumping"),
  defaultDuration: z.coerce.number().min(1),
  maxCapacity: z.coerce.number().min(1),
  isActive: z.boolean().default(true),
});
type TypeFormData = z.infer<typeof typeSchema>;

/* ── Instructor schemas ── */
const instructorSchema = z.object({
  displayName: z.string().trim().min(1, "Nombre requerido"),
  email: z.string().trim().email("Email inválido"),
  bio: z.string().optional(),
  specialties: z.string().optional(),
  isActive: z.boolean().default(true),
  photoFocusX: z.coerce.number().min(0).max(100).default(50),
  photoFocusY: z.coerce.number().min(0).max(100).default(50),
});
type InstructorFormData = z.infer<typeof instructorSchema>;
interface Instructor extends Omit<InstructorFormData, "specialties"> {
  id: string;
  specialties?: string[] | string | null;
  photoUrl?: string;
  photoFocusX?: number;
  photoFocusY?: number;
}

function clampFocus(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeSpecialties(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch (_) {
      // fallback parsing below
    }
    return value
      .replace(/^\{|\}$/g, "")
      .split(",")
      .map((item) => item.replace(/^"+|"+$/g, "").trim())
      .filter(Boolean);
  }
  return [];
}

function instructorPayload(d: InstructorFormData) {
  return {
    displayName: d.displayName.trim(),
    email: d.email.trim().toLowerCase(),
    bio: d.bio?.trim() || null,
    specialties: normalizeSpecialties(d.specialties),
    isActive: d.isActive,
    photoFocusX: clampFocus(d.photoFocusX),
    photoFocusY: clampFocus(d.photoFocusY),
  };
}

function getFocusFromPointerEvent(event: React.PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const nextX = ((event.clientX - rect.left) / rect.width) * 100;
  const nextY = ((event.clientY - rect.top) / rect.height) * 100;
  return {
    x: clampFocus(nextX),
    y: clampFocus(nextY),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
const ClassesCalendar = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<TabKey>("calendar");

  const { data: typesData } = useQuery<{ data: ClassType[] }>({
    queryKey: ["class-types"],
    queryFn: async () => (await api.get("/class-types")).data,
  });
  const types = Array.isArray(typesData?.data) ? typesData.data : [];

  const { data: instructorsData } = useQuery<{ data: { id: string; displayName: string }[] }>({
    queryKey: ["instructors"],
    queryFn: async () => (await api.get("/instructors")).data,
  });
  const instructors = Array.isArray(instructorsData?.data) ? instructorsData.data : [];

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="admin-title font-bold text-white">Clases</h1>
              <p className="mt-1 text-xs text-white/45 sm:text-sm">Gestiona calendario, tipos, generación semanal e instructoras.</p>
            </div>
            <div className="w-full sm:w-auto overflow-x-auto">
              <div className="flex min-w-max gap-1 rounded-xl bg-secondary p-1">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={
                    "flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-all sm:px-4 sm:text-sm " +
                    (tab === key
                      ? "bg-gradient-to-r from-[#E9745F] to-[#76214D] text-white shadow-md shadow-[#76214D]/25"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5")
                  }
                >
                  <Icon size={15} />
                  {isMobile
                    ? key === "types"
                      ? "Tipos"
                      : key === "generate"
                        ? "Generar"
                        : label
                    : label}
                </button>
              ))}
              </div>
            </div>
          </div>

          {tab === "calendar" && <CalendarTab types={types} instructors={instructors} toast={toast} qc={qc} />}
          {tab === "types" && <TypesTab types={types} toast={toast} qc={qc} />}
          {tab === "generate" && <GenerateTab types={types} instructors={instructors} toast={toast} />}
          {tab === "instructors" && <InstructorsTab toast={toast} qc={qc} />}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   TAB 1 – CALENDAR
   ═══════════════════════════════════════════════════════════════════ */
function CalendarTab({
  types,
  instructors,
  toast,
  qc,
}: {
  types: ClassType[];
  instructors: { id: string; displayName: string }[];
  toast: any;
  qc: any;
}) {
  const isMobile = useIsMobile();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedClass, setSelectedClass] = useState<ClassInstance | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mobileDay, setMobileDay] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const start = format(weekStart, "yyyy-MM-dd");
  const end = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const { data } = useQuery<{ data: ClassInstance[] }>({
    queryKey: ["classes", start, end],
    queryFn: async () => {
      const res = await api.get("/classes?start=" + start + "&end=" + end);
      const raw: any[] = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      // Normalise snake_case → camelCase expected by ClassInstance
      const mapped: ClassInstance[] = raw.map((c: any) => ({
        id:               c.id,
        classTypeId:      c.class_type_id,
        classTypeName:    c.class_type_name,
        classTypeColor:   c.class_type_color,
        instructorId:     c.instructor_id,
        instructorName:   c.instructor_name,
        instructorPhoto:  c.instructor_photo,
        startTime:        c.start_time,   // already full ISO from server normalisation
        endTime:          c.end_time,
        maxCapacity:      c.max_capacity ?? c.capacity ?? 10,
        capacity:         c.max_capacity ?? c.capacity ?? 10,
        bookedCount:      c.current_bookings ?? 0,
        currentBookings:  c.current_bookings ?? 0,
        isCancelled:      c.status === "cancelled" || c.is_cancelled === true,
        notes:            c.notes,
      }));
      return { data: mapped };
    },
  });
  const classes = Array.isArray(data?.data) ? data.data : [];

  const form = useForm<ClassFormData>({ resolver: zodResolver(classSchema) });

  const createMutation = useMutation({
    mutationFn: (d: ClassFormData) => api.post("/classes", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      toast({ title: "Clase creada" });
      setCreateOpen(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.put("/classes/" + id + "/cancel"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      toast({ title: "Clase cancelada" });
      setSheetOpen(false);
    },
  });

  const clearWeekMutation = useMutation({
    mutationFn: () => api.delete("/classes/week", { data: { startDate: start, endDate: end } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      const deleted = Number(res?.data?.deleted ?? 0);
      toast({
        title: deleted === 1 ? "1 clase eliminada de la semana" : `${deleted} clases eliminadas de la semana`,
      });
      setSheetOpen(false);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? "No se pudo limpiar la semana";
      toast({ title: message, variant: "destructive" });
    },
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const classesForDay = (date: Date) =>
    classes.filter((c) => c.startTime?.startsWith(format(date, "yyyy-MM-dd")));

  useEffect(() => {
    const currentWeekDays = days.map((d) => format(d, "yyyy-MM-dd"));
    if (!currentWeekDays.includes(mobileDay)) {
      setMobileDay(currentWeekDays[0]);
    }
  }, [weekStart, mobileDay, days]);

  const openCreate = (date: string) => {
    setSelectedDate(date);
    form.reset({ startTime: date + "T09:00", endTime: date + "T10:00", maxCapacity: 10 });
    setCreateOpen(true);
  };

  const shiftWeek = (offset: number) => {
    const next = addDays(weekStart, offset);
    setWeekStart(next);
    if (isMobile) setMobileDay(format(next, "yyyy-MM-dd"));
  };

  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} – ${format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}`;

  const handleClearWeek = () => {
    if (classes.length === 0 || clearWeekMutation.isPending) return;
    const confirmed = window.confirm(
      `Esto eliminará todas las clases de la semana (${weekLabel}). Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    clearWeekMutation.mutate();
  };

  const mobileDayDate = parseISO(mobileDay);
  const mobileClasses = classes.filter((c) => c.startTime?.startsWith(mobileDay));

  return (
    <>
      {/* Week nav */}
      <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          <Button variant="outline" size="icon" onClick={() => shiftWeek(-7)}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-center text-xs font-medium sm:text-sm">{weekLabel}</span>
          <Button variant="outline" size="icon" onClick={() => shiftWeek(7)}>
            <ChevronRight size={14} />
          </Button>
        </div>
        <div className="flex justify-center sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleClearWeek}
            disabled={clearWeekMutation.isPending || classes.length === 0}
            className="min-h-[44px] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {clearWeekMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
            Limpiar semana
          </Button>
        </div>
      </div>

      {isMobile ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] p-2">
            <div className="flex min-w-max gap-2">
              {days.map((day) => {
                const dayKey = format(day, "yyyy-MM-dd");
                const isActive = dayKey === mobileDay;
                const count = classesForDay(day).length;
                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => setMobileDay(dayKey)}
                    className={cn(
                      "flex min-h-[52px] min-w-[76px] flex-col items-center justify-center rounded-xl border px-2 text-xs transition-colors",
                      isActive
                        ? "border-[#76214D]/60 bg-gradient-to-r from-[#76214D]/20 to-[#E9745F]/20 text-white"
                        : "border-white/10 bg-black/30 text-white/70",
                    )}
                  >
                    <span className="text-[10px] uppercase">{DAYS_ES[day.getDay()]}</span>
                    <span className="text-base font-bold leading-none">{format(day, "d")}</span>
                    <span className="mt-0.5 text-[10px] text-white/55">{count} cls</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-widest text-white/45">{DAYS_ES[mobileDayDate.getDay()]}</p>
                <p className="text-sm font-semibold text-white">{format(mobileDayDate, "d 'de' MMMM", { locale: es })}</p>
              </div>
              <Button size="sm" className="h-9" onClick={() => openCreate(mobileDay)}>
                <Plus size={14} className="mr-1" /> Nueva
              </Button>
            </div>

            {mobileClasses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-xs text-white/45">
                Sin clases programadas para este día.
              </div>
            ) : (
              <div className="space-y-2">
                {mobileClasses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelectedClass(c); setSheetOpen(true); }}
                    className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-left"
                    style={{ borderLeftColor: c.classTypeColor ?? "#E9745F", borderLeftWidth: 3 }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{c.classTypeName ?? "Clase"}</p>
                        <p className="text-xs text-white/60">
                          {c.startTime ? format(parseISO(c.startTime), "HH:mm") : "—"}
                          {" - "}
                          {c.endTime ? format(parseISO(c.endTime), "HH:mm") : "—"}
                        </p>
                      </div>
                      <Badge variant={c.isCancelled ? "destructive" : "secondary"} className="text-[10px]">
                        {c.isCancelled ? "Cancelada" : "Activa"}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {c.instructorPhoto ? (
                        <img
                          src={c.instructorPhoto}
                          alt={c.instructorName ?? ""}
                          className="h-6 w-6 rounded-full object-cover ring-1 ring-white/25"
                        />
                      ) : (
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-full text-[0.6rem] font-bold text-white"
                          style={{ background: c.classTypeColor ?? "#E9745F" }}
                        >
                          {(c.instructorName ?? "?")[0].toUpperCase()}
                        </span>
                      )}
                      <span className="truncate text-xs text-white/60">{c.instructorName ?? "—"}</span>
                      <span className="ml-auto text-xs text-white/55">
                        {(c.bookedCount ?? c.currentBookings ?? 0)}/{c.maxCapacity ?? c.capacity ?? "?"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-7 gap-2">
            {days.map((day, i) => {
              const dayClasses = classesForDay(day);
              return (
                <div key={i} className="min-h-[320px]">
                  <div
                    className="mb-2 cursor-pointer text-center text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => openCreate(format(day, "yyyy-MM-dd"))}
                  >
                    <div>{DAYS_ES[day.getDay()]}</div>
                    <div className="text-lg font-bold text-foreground">{format(day, "d")}</div>
                  </div>
                  <div className="space-y-1">
                    {dayClasses.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => { setSelectedClass(c); setSheetOpen(true); }}
                        className="cursor-pointer rounded-lg px-2 py-1.5 text-xs transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: c.classTypeColor ? c.classTypeColor + "33" : "hsl(var(--primary)/0.2)",
                          borderLeft: "3px solid " + (c.classTypeColor ?? "hsl(var(--primary))"),
                        }}
                      >
                        <div className="truncate font-medium">{c.classTypeName ?? "Clase"}</div>
                        <div className="text-muted-foreground">{c.startTime ? format(parseISO(c.startTime), "HH:mm") : ""}</div>
                        <div className="mt-1 flex items-center gap-1">
                          {c.instructorPhoto ? (
                            <img
                              src={c.instructorPhoto}
                              alt={c.instructorName ?? ""}
                              className="h-4 w-4 rounded-full object-cover ring-1 ring-white/30"
                            />
                          ) : (
                            <span
                              className="flex h-4 w-4 items-center justify-center rounded-full text-[0.5rem] font-bold text-white ring-1 ring-white/30"
                              style={{ background: c.classTypeColor ?? "#E9745F" }}
                            >
                              {(c.instructorName ?? "?")[0].toUpperCase()}
                            </span>
                          )}
                          <span className="truncate text-[0.65rem] text-muted-foreground">{c.instructorName ?? "—"}</span>
                        </div>
                        <div className="mt-0.5 text-muted-foreground">
                          {(c.bookedCount ?? c.currentBookings ?? 0)}/{c.maxCapacity ?? c.capacity ?? "?"}
                        </div>
                        {c.isCancelled && <Badge variant="destructive" className="mt-1 px-1 text-[0.6rem]">Cancelada</Badge>}
                      </div>
                    ))}
                    <button
                      onClick={() => openCreate(format(day, "yyyy-MM-dd"))}
                      className="w-full py-1 text-center text-lg text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                    >
                      <Plus size={12} className="mx-auto" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva clase</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>Tipo de clase</Label>
              <Select onValueChange={(v) => form.setValue("classTypeId", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Instructor</Label>
              <Select onValueChange={(v) => form.setValue("instructorId", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar instructor" /></SelectTrigger>
                <SelectContent>
                  {instructors.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Inicio</Label><Input type="datetime-local" {...form.register("startTime")} /></div>
              <div className="space-y-1"><Label>Fin</Label><Input type="datetime-local" {...form.register("endTime")} /></div>
            </div>
            <div className="space-y-1"><Label>Capacidad máxima</Label><Input type="number" {...form.register("maxCapacity")} /></div>
            <div className="space-y-1"><Label>Notas</Label><Input {...form.register("notes")} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-gradient-to-r from-[#E9745F] to-[#76214D] text-white">Crear</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>{selectedClass?.classTypeName ?? "Clase"}</SheetTitle></SheetHeader>
          {selectedClass && (
            <div className="mt-6 space-y-4 text-sm">
              {/* Instructor with avatar */}
              <div className="flex items-center gap-3">
                {selectedClass.instructorPhoto ? (
                  <img src={selectedClass.instructorPhoto} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-offset-1" style={{ outline: `2px solid ${selectedClass.classTypeColor ?? "#E9745F"}` }} />
                ) : (
                  <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm" style={{ background: selectedClass.classTypeColor ?? "#E9745F" }}>
                    {(selectedClass.instructorName ?? "?")[0].toUpperCase()}
                  </span>
                )}
                <div>
                  <div className="font-medium">{selectedClass.instructorName ?? selectedClass.instructorId}</div>
                  <div className="text-xs text-muted-foreground">Instructor</div>
                </div>
              </div>
              <div><span className="font-medium">Inicio:</span> {selectedClass.startTime ? new Date(selectedClass.startTime).toLocaleString("es-MX", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</div>
              <div><span className="font-medium">Cupo:</span> {(selectedClass.bookedCount ?? selectedClass.currentBookings ?? 0) + " / " + (selectedClass.maxCapacity ?? selectedClass.capacity ?? "?")}</div>
              {selectedClass.notes && <div><span className="font-medium">Notas:</span> {selectedClass.notes}</div>}
              <div className="pt-4 flex flex-col gap-2">
                {!selectedClass.isCancelled && (
                  <Button variant="destructive" onClick={() => cancelMutation.mutate(selectedClass.id)} disabled={cancelMutation.isPending}>
                    Cancelar clase
                  </Button>
                )}
                {selectedClass.isCancelled && <Badge variant="destructive">Clase cancelada</Badge>}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 2 – CLASS TYPES
   ═══════════════════════════════════════════════════════════════════ */
function TypesTab({ types, toast, qc }: { types: ClassType[]; toast: any; qc: any }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClassType | null>(null);
  const form = useForm<TypeFormData>({
    resolver: zodResolver(typeSchema),
    defaultValues: { color: "#E9745F", category: "jumping", defaultDuration: 50, maxCapacity: 10, isActive: true },
  });

  const createMutation = useMutation({
    mutationFn: (d: TypeFormData) => api.post("/class-types", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-types"] });
      toast({ title: "Tipo creado" });
      setOpen(false);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => api.put("/class-types/" + id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-types"] });
      toast({ title: "Tipo actualizado" });
      setOpen(false);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete("/class-types/" + id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-types"] });
      toast({ title: "Tipo eliminado" });
    },
  });

  const openEdit = (t: ClassType) => {
    form.reset({
      name: t.name,
      color: t.color,
      category: (t.category === "pilates" ? "pilates" : "jumping") as "jumping" | "pilates",
      defaultDuration: t.defaultDuration ?? t.durationMin ?? 50,
      maxCapacity: t.maxCapacity ?? t.capacity ?? 10,
      isActive: t.isActive ?? true,
    });
    setEditing(t);
    setOpen(true);
  };
  const openCreate = () => {
    form.reset({ color: "#E9745F", category: "jumping", defaultDuration: 50, maxCapacity: 10, isActive: true });
    setEditing(null);
    setOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <p className="text-sm text-muted-foreground">{types.length} tipos registrados</p>
        <Button size="sm" onClick={openCreate} className="bg-gradient-to-r from-[#E9745F] to-[#76214D] text-white">
          <Plus size={14} className="mr-1" />Nuevo tipo
        </Button>
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {types.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-xs text-white/45">
              Sin tipos registrados.
            </div>
          ) : (
            types.map((t) => (
              <div key={t.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: t.color }} />
                      <p className="truncate text-sm font-semibold text-white">{t.name}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.category === "jumping" && <Badge className="bg-[#76214D]/20 text-[#76214D] border border-[#76214D]/30">Jumping</Badge>}
                      {t.category === "pilates" && <Badge className="bg-[#E9745F]/20 text-[#E9745F] border border-[#E9745F]/30">Pilates</Badge>}
                      {!t.category && <Badge variant="secondary">—</Badge>}
                      <Badge variant="outline">{(t.defaultDuration ?? t.durationMin ?? "—") + " min"}</Badge>
                      <Badge variant="outline">{(t.maxCapacity ?? t.capacity ?? "—") + " cupos"}</Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-11 w-11 min-h-[44px] min-w-[44px]">
                        <MoreHorizontal size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => openEdit(t)}>Editar</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm("¿Eliminar este tipo de clase?")) deleteMutation.mutate(t.id); }}>Eliminar</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-2">
                  <Badge
                    variant={t.isActive !== false ? "default" : "secondary"}
                    className={t.isActive !== false ? "bg-[#E9745F]/20 text-[#E9745F] border border-[#E9745F]/30" : ""}
                  >
                    {t.isActive !== false ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Color</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Capacidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><div className="w-6 h-6 rounded-full shadow-sm" style={{ backgroundColor: t.color }} /></TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>
                    {t.category === "jumping" && <Badge className="bg-[#76214D]/20 text-[#76214D] border border-[#76214D]/30">Jumping</Badge>}
                    {t.category === "pilates" && <Badge className="bg-[#E9745F]/20 text-[#E9745F] border border-[#E9745F]/30">Pilates</Badge>}
                    {!t.category && <Badge variant="secondary">—</Badge>}
                  </TableCell>
                  <TableCell>{(t.defaultDuration ?? t.durationMin ?? "—") + " min"}</TableCell>
                  <TableCell>{t.maxCapacity ?? t.capacity ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={t.isActive !== false ? "default" : "secondary"}
                      className={t.isActive !== false ? "bg-[#E9745F]/20 text-[#E9745F] border border-[#E9745F]/30" : ""}
                    >
                      {t.isActive !== false ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => openEdit(t)}>Editar</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm("¿Eliminar este tipo de clase?")) deleteMutation.mutate(t.id); }}>Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* CRUD dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar tipo" : "Nuevo tipo de clase"}</DialogTitle></DialogHeader>
          <form
            onSubmit={form.handleSubmit((d) =>
              editing ? updateMutation.mutate({ ...d, id: editing.id }) : createMutation.mutate(d)
            )}
            className="space-y-4"
          >
            <div className="space-y-1"><Label>Nombre</Label><Input {...form.register("name")} /></div>
            <div className="space-y-1">
              <Label>Categoría</Label>
              <Select
                value={form.watch("category")}
                onValueChange={(v) => form.setValue("category", v as "jumping" | "pilates")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jumping">Jumping</SelectItem>
                  <SelectItem value="pilates">Pilates</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PALETTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => form.setValue("color", c.value)}
                    className={
                      "w-8 h-8 rounded-full border-2 transition-all " +
                      (form.watch("color") === c.value
                        ? "border-foreground scale-110 ring-2 ring-offset-2 ring-offset-background ring-[#E9745F]"
                        : "border-transparent opacity-70 hover:opacity-100")
                    }
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
              <Input type="color" {...form.register("color")} className="h-8 w-16 cursor-pointer" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Duración (min)</Label><Input type="number" {...form.register("defaultDuration")} /></div>
              <div className="space-y-1"><Label>Capacidad máx.</Label><Input type="number" {...form.register("maxCapacity")} /></div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} />
              <Label>Activo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-gradient-to-r from-[#E9745F] to-[#76214D] text-white">
                {editing ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 3 – GENERATE WEEK  (beautiful version)
   ═══════════════════════════════════════════════════════════════════ */
function GenerateTab({
  types,
  instructors,
  toast,
}: {
  types: ClassType[];
  instructors: { id: string; displayName: string }[];
  toast: any;
}) {
  const qc = useQueryClient();
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [classTypeId, setClassTypeId] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [maxCapacity, setMaxCapacity] = useState(10);

  const [presetInstructorId, setPresetInstructorId] = useState("");
  const [presetWeeks, setPresetWeeks] = useState(4);

  const resetKalaMutation = useMutation({
    mutationFn: (params: { generate: boolean; instructorId?: string; weeks?: number }) =>
      api.post("/schedules/reset-kala", {
        generateClasses: params.generate,
        weeksAhead: params.weeks,
        instructorId: params.instructorId,
      }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["classes"] });
      const created = res.data?.data?.classesCreated ?? 0;
      const skipped = res.data?.data?.classesSkipped ?? 0;
      toast({
        title: "✨ Horario Kala aplicado",
        description: created > 0
          ? `${created} clases creadas${skipped ? ` · ${skipped} ya existían` : ""}.`
          : (res.data?.message || "Plantilla guardada"),
      });
    },
    onError: (err: any) =>
      toast({
        title: "Error",
        description: err?.response?.data?.message || "No se pudo aplicar",
        variant: "destructive",
      }),
  });

  const selectedType = types.find((t) => t.id === classTypeId);
  const selectedInstructor = instructors.find((i) => i.id === instructorId);

  // Preview: how many classes will be generated
  const preview = useMemo(() => {
    if (!startDate || !endDate || !selectedDays.length) return [];
    try {
      const days = eachDayOfInterval({
        start: parseISO(startDate),
        end: parseISO(endDate),
      });
      return days.filter((d) => selectedDays.includes(d.getDay()));
    } catch {
      return [];
    }
  }, [startDate, endDate, selectedDays]);

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post("/classes/generate", {
        classTypeId,
        instructorId,
        startDate,
        endDate,
        daysOfWeek: selectedDays,
        startTime,
        endTime,
        maxCapacity,
      }),
    onSuccess: (res: any) => toast({ title: `✨ ${res.data?.created ?? 0} clases generadas` }),
    onError: (error: any) =>
      toast({
        title: error?.response?.data?.message ?? "Error generando clases",
        variant: "destructive",
      }),
  });

  const toggleDay = (v: number) => {
    setSelectedDays((prev) =>
      prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v]
    );
  };

  const canGenerate = classTypeId && instructorId && startDate && endDate && selectedDays.length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center mb-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#E9745F]/10 to-[#76214D]/10 border border-[#E9745F]/20 mb-3">
          <Sparkles size={14} className="text-[#F58A24]" />
          <span className="text-xs font-semibold text-[#E9745F]">Generador de clases</span>
        </div>
        <h2 className="text-2xl font-bold text-white">Generar clases en bloque</h2>
        <p className="text-sm text-white/40 mt-1">Selecciona tipo, instructor, rango de fechas y días</p>
      </div>

      {/* ── Preset: Horario Kala oficial ── */}
      <div className="rounded-2xl border border-[#76214D]/30 bg-gradient-to-br from-[#76214D]/10 to-[#E9745F]/5 p-5 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[#F58A24]" />
            <span className="text-xs font-semibold text-[#E9745F] uppercase tracking-wider">Preset Kala</span>
          </div>
          <p className="mt-1.5 text-sm font-medium text-white">Horario oficial del estudio</p>
          <p className="mt-0.5 text-xs text-white/50">
            Lun–Vie: 7am, 8am, 7pm, 8pm · Sáb: 7am, 8am, 9am · 23 slots semanales
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Instructora</Label>
            <Select value={presetInstructorId} onValueChange={setPresetInstructorId}>
              <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                <SelectValue placeholder="Seleccionar instructora" />
              </SelectTrigger>
              <SelectContent>
                {instructors.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Semanas a generar</Label>
            <Select value={String(presetWeeks)} onValueChange={(v) => setPresetWeeks(Number(v))}>
              <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 4, 6, 8, 12].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} semana{n === 1 ? "" : "s"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            onClick={() => {
              if (
                window.confirm(
                  `Esto creará ~${presetWeeks * 23} clases (${presetWeeks} semana${presetWeeks === 1 ? "" : "s"} × 23 slots) con la instructora seleccionada. Las que ya existan se omiten.\n\n¿Continuar?`,
                )
              ) {
                resetKalaMutation.mutate({ generate: true, instructorId: presetInstructorId, weeks: presetWeeks });
              }
            }}
            disabled={resetKalaMutation.isPending || !presetInstructorId}
            className="bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white disabled:opacity-50"
          >
            {resetKalaMutation.isPending ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : (
              <Sparkles size={14} className="mr-2" />
            )}
            Aplicar y generar clases
          </Button>
          <Button
            onClick={() => {
              if (window.confirm("Esto solo guarda la plantilla (23 slots). NO crea las clases reales.\n\n¿Continuar?")) {
                resetKalaMutation.mutate({ generate: false });
              }
            }}
            disabled={resetKalaMutation.isPending}
            variant="outline"
            className="border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
          >
            Solo plantilla
          </Button>
        </div>
        {!presetInstructorId && instructors.length === 0 && (
          <p className="text-xs text-[#F58A24] flex items-center gap-1.5 mt-2">
            <Sparkles size={12} /> Crea una instructora primero en la tab "Instructoras".
          </p>
        )}
        {!presetInstructorId && instructors.length > 0 && (
          <p className="text-xs text-white/45 mt-2">
            Selecciona una instructora arriba para activar el botón.
          </p>
        )}
      </div>

      {/* ── Step 1: Class type + Instructor ── */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#E9745F]/20 text-[#E9745F] text-xs font-bold">1</span>
          <span className="text-xs font-semibold text-[#E9745F]/70 uppercase tracking-wider">Clase e instructor</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Tipo de clase</Label>
            <Select onValueChange={setClassTypeId}>
              <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Instructor</Label>
            <Select onValueChange={setInstructorId}>
              <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                <SelectValue placeholder="Seleccionar instructor" />
              </SelectTrigger>
              <SelectContent>
                {instructors.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Step 2: Date range ── */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#76214D]/20 text-[#76214D] text-xs font-bold">2</span>
          <span className="text-xs font-semibold text-[#76214D]/70 uppercase tracking-wider">Rango de fechas</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Fecha inicio</Label>
            <DatePicker value={startDate} onChange={setStartDate} placeholder="Desde" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Fecha fin</Label>
            <DatePicker value={endDate} onChange={setEndDate} placeholder="Hasta" min={startDate} />
          </div>
        </div>
      </div>

      {/* ── Step 3: Days of week ── */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F58A24]/20 text-[#F58A24] text-xs font-bold">3</span>
          <span className="text-xs font-semibold text-[#F58A24]/70 uppercase tracking-wider">Días de la semana</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {GENERATE_DAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              className={
                "relative px-5 py-2.5 rounded-xl text-sm font-semibold transition-all " +
                (selectedDays.includes(d.value)
                  ? "bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white shadow-[0_0_12px_rgba(118,33,77,0.3)]"
                  : "bg-white/[0.04] border border-white/[0.07] text-white/45 hover:text-white/75 hover:border-white/20")
              }
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={() => setSelectedDays([1, 2, 3, 4, 5])}
            className="text-[10px] text-[#E9745F] font-medium hover:underline"
          >
            Lun–Vie
          </button>
          <button
            type="button"
            onClick={() => setSelectedDays([1, 2, 3, 4, 5, 6])}
            className="text-[10px] text-[#E9745F] font-medium hover:underline"
          >
            Lun–Sáb
          </button>
          <button
            type="button"
            onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
            className="text-[10px] text-[#E9745F] font-medium hover:underline"
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setSelectedDays([])}
            className="text-[10px] text-white/30 font-medium hover:underline"
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* ── Step 4: Time + Capacity ── */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#8B5CF6]/20 text-[#8B5CF6] text-xs font-bold">4</span>
          <span className="text-xs font-semibold text-[#8B5CF6]/70 uppercase tracking-wider">Horario y capacidad</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Hora inicio</Label>
            <TimePicker value={startTime} onChange={setStartTime} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Hora fin</Label>
            <TimePicker value={endTime} onChange={setEndTime} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Capacidad máx.</Label>
            <Input
              type="number"
              value={maxCapacity}
              onChange={(e) => setMaxCapacity(Number(e.target.value))}
              className="bg-white/[0.04] border-white/[0.08] text-white text-center"
            />
          </div>
        </div>
      </div>

      {/* ── Preview ── */}
      {preview.length > 0 && (
        <div className="rounded-2xl border border-[#E9745F]/20 bg-gradient-to-br from-[#E9745F]/5 to-[#76214D]/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-[#F58A24]" />
              <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Vista previa</span>
            </div>
            <Badge variant="outline" className="border-[#E9745F]/30 text-[#E9745F] font-bold">
              {preview.length} {preview.length === 1 ? "clase" : "clases"}
            </Badge>
          </div>

          <div className="hidden grid-cols-7 gap-1.5 sm:grid">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-white/25 uppercase">{d}</div>
            ))}
          </div>

          <div className="grid max-h-[220px] grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-7">
            {preview.map((d) => (
              <div
                key={d.toISOString()}
                className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg bg-white/[0.03] border border-white/[0.05]"
              >
                <span className="text-[10px] text-white/40">
                  {format(d, "MMM", { locale: es })}
                </span>
                <span className="text-sm font-bold text-white">
                  {format(d, "d")}
                </span>
                <span className="text-[9px] text-[#F58A24]/60 font-medium">
                  {startTime}
                </span>
                {selectedType && (
                  <span
                    className="w-2 h-2 rounded-full mt-0.5"
                    style={{ backgroundColor: selectedType.color }}
                  />
                )}
              </div>
            ))}
          </div>

          {selectedType && (
            <div className="flex items-center gap-3 pt-2 border-t border-white/[0.05]">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedType.color }} />
              <span className="text-xs text-white/60">
                <strong className="text-white/80">{selectedType.name}</strong>
                {selectedInstructor && <> · {selectedInstructor.displayName}</>}
                {" · "}{startTime}–{endTime} · {maxCapacity} cupos
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Generate Button ── */}
      <button
        type="button"
        disabled={!canGenerate || generateMutation.isPending}
        onClick={() => generateMutation.mutate()}
        className={
          "w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-white transition-all " +
          (canGenerate
            ? "bg-gradient-to-r from-[#76214D] to-[#E9745F] hover:opacity-90 shadow-[0_4px_20px_rgba(118,33,77,0.25)]"
            : "bg-white/[0.05] text-white/25 cursor-not-allowed")
        }
      >
        {generateMutation.isPending ? (
          <Loader2 className="animate-spin" size={16} />
        ) : (
          <Sparkles size={16} />
        )}
        {generateMutation.isPending
          ? "Generando…"
          : preview.length > 0
          ? `Generar ${preview.length} clases`
          : "Generar clases"}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 4 – INSTRUCTORAS
   ═══════════════════════════════════════════════════════════════════ */
function InstructorsTab({ toast, qc }: { toast: any; qc: any }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Instructor | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: Instructor[] }>({
    queryKey: ["instructors"],
    queryFn: async () => (await api.get("/instructors")).data,
  });
  const instructors = Array.isArray(data?.data) ? data.data : [];

  const form = useForm<InstructorFormData>({
    resolver: zodResolver(instructorSchema),
    defaultValues: { isActive: true, photoFocusX: 50, photoFocusY: 50 },
  });

  const createMutation = useMutation({
    mutationFn: (d: InstructorFormData) => api.post("/instructors", instructorPayload(d)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instructors"] });
      toast({ title: "Instructora creada" });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "Error al crear instructora", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: { id: string } & InstructorFormData) =>
      api.put(`/instructors/${id}`, instructorPayload(d)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instructors"] });
      toast({ title: "Instructora actualizada" });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "Error al actualizar instructora", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/instructors/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instructors"] }); toast({ title: "Instructora eliminada" }); },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "Error al eliminar instructora", variant: "destructive" });
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append("photo", file);
      return api.post(`/instructors/${id}/photo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instructors"] }); toast({ title: "Foto actualizada" }); },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "Error al subir foto", variant: "destructive" });
    },
  });

  const openEdit = (i: Instructor) => {
    form.reset({
      displayName: i.displayName ?? "",
      email: i.email ?? "",
      bio: i.bio ?? "",
      specialties: normalizeSpecialties(i.specialties).join(", "),
      isActive: i.isActive ?? true,
      photoFocusX: clampFocus(i.photoFocusX),
      photoFocusY: clampFocus(i.photoFocusY),
    });
    setEditing(i);
    setOpen(true);
  };
  const openCreate = () => {
    form.reset({ displayName: "", email: "", bio: "", specialties: "", isActive: true, photoFocusX: 50, photoFocusY: 50 });
    setEditing(null);
    setOpen(true);
  };
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const focusX = clampFocus(form.watch("photoFocusX"));
  const focusY = clampFocus(form.watch("photoFocusY"));
  const applyPreviewFocus = (event: React.PointerEvent<HTMLElement>) => {
    const next = getFocusFromPointerEvent(event);
    form.setValue("photoFocusX", next.x, { shouldDirty: true, shouldTouch: true });
    form.setValue("photoFocusY", next.y, { shouldDirty: true, shouldTouch: true });
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <p className="text-sm text-muted-foreground">{instructors.length} instructora{instructors.length !== 1 ? "s" : ""} registrada{instructors.length !== 1 ? "s" : ""}</p>
        <Button
          size="sm"
          onClick={openCreate}
          className="bg-gradient-to-r from-[#E9745F] to-[#76214D] text-white"
        >
          <Plus size={14} className="mr-1" />Nueva instructora
        </Button>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileRef}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && uploadTarget) uploadPhotoMutation.mutate({ id: uploadTarget, file: f });
          e.target.value = "";
          setUploadTarget(null);
        }}
      />

      {isMobile ? (
        <div className="space-y-2">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
          ) : instructors.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-xs text-white/45">
              Sin instructoras registradas.
            </div>
          ) : (
            instructors.map((ins) => (
              <div key={ins.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {ins.photoUrl ? (
                        <img
                          src={ins.photoUrl}
                          className="h-9 w-9 rounded-full object-cover ring-2 ring-[#E9745F]/30"
                          style={{ objectPosition: `${clampFocus(ins.photoFocusX)}% ${clampFocus(ins.photoFocusY)}%` }}
                          alt=""
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#E9745F] to-[#76214D] text-xs font-bold text-white">
                          {ins.displayName?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{ins.displayName}</p>
                        <p className="truncate text-xs text-white/55">{ins.email}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-white/55">{normalizeSpecialties(ins.specialties).join(", ") || "Sin especialidades"}</p>
                    <div className="mt-2">
                      <Badge
                        variant={ins.isActive ? "default" : "secondary"}
                        className={ins.isActive ? "bg-[#E9745F]/20 text-[#E9745F] border border-[#E9745F]/30" : ""}
                      >
                        {ins.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-11 w-11 min-h-[44px] min-w-[44px]">
                        <MoreHorizontal size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => openEdit(ins)}>Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setUploadTarget(ins.id); setTimeout(() => fileRef.current?.click(), 50); }}>
                        Subir foto
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm("¿Eliminar este instructor?")) deleteMutation.mutate(ins.id); }}>
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Foto</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Especialidades</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array(4).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    {Array(6).fill(0).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
                : instructors.map((ins) => (
                  <TableRow key={ins.id}>
                    <TableCell>
                      {ins.photoUrl ? (
                        <img
                          src={ins.photoUrl}
                          className="w-9 h-9 rounded-full object-cover ring-2 ring-[#E9745F]/30"
                          style={{ objectPosition: `${clampFocus(ins.photoFocusX)}% ${clampFocus(ins.photoFocusY)}%` }}
                          alt=""
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#E9745F] to-[#76214D] flex items-center justify-center text-xs font-bold text-white">
                          {ins.displayName?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{ins.displayName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ins.email}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{normalizeSpecialties(ins.specialties).join(", ")}</TableCell>
                    <TableCell>
                      <Badge
                        variant={ins.isActive ? "default" : "secondary"}
                        className={ins.isActive ? "bg-[#E9745F]/20 text-[#E9745F] border border-[#E9745F]/30" : ""}
                      >
                        {ins.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => openEdit(ins)}>Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setUploadTarget(ins.id); setTimeout(() => fileRef.current?.click(), 50); }}>
                            Subir foto
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm("¿Eliminar este instructor?")) deleteMutation.mutate(ins.id); }}>
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </div>
      )}

      {/* CRUD dialog */}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar instructora" : "Nueva instructora"}</DialogTitle>
          </DialogHeader>
          <form
            noValidate
            onSubmit={form.handleSubmit(
              (d) => {
                if (editing) {
                  updateMutation.mutate({ ...d, id: editing.id });
                  return;
                }
                createMutation.mutate(d);
              },
              (errors) => {
                const first = Object.values(errors)[0];
                toast({
                  title: first?.message ? String(first.message) : "Revisa los campos del formulario",
                  variant: "destructive",
                });
              },
            )}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input {...form.register("displayName")} />
              {form.formState.errors.displayName && (
                <p className="text-xs text-destructive">{String(form.formState.errors.displayName.message)}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{String(form.formState.errors.email.message)}</p>
              )}
            </div>
            <div className="space-y-1"><Label>Bio</Label><Input {...form.register("bio")} /></div>
            <div className="space-y-1">
              <Label>Especialidades (separadas por coma)</Label>
              <Input {...form.register("specialties")} placeholder="Ej: Jumping, Pilates, Cardio" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Enfoque horizontal</Label>
                <span className="text-xs text-muted-foreground">{focusX}%</span>
              </div>
              <Input
                type="range"
                min={0}
                max={100}
                step={1}
                value={focusX}
                onChange={(e) => form.setValue("photoFocusX", Number(e.target.value), { shouldDirty: true })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Enfoque vertical</Label>
                <span className="text-xs text-muted-foreground">{focusY}%</span>
              </div>
              <Input
                type="range"
                min={0}
                max={100}
                step={1}
                value={focusY}
                onChange={(e) => form.setValue("photoFocusY", Number(e.target.value), { shouldDirty: true })}
              />
            </div>
            {editing?.photoUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Vista previa y enfoque</Label>
                  <span className="text-[11px] text-muted-foreground">Haz clic o arrastra sobre la cara</span>
                </div>
                <button
                  type="button"
                  onPointerDown={applyPreviewFocus}
                  onPointerMove={(event) => {
                    if (event.buttons !== 1 && event.pointerType !== "touch") return;
                    applyPreviewFocus(event);
                  }}
                  className="group relative mx-auto block h-[360px] w-full max-w-[300px] touch-none overflow-hidden rounded-[28px] border border-white/10 bg-black/30 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E9745F]"
                  aria-label="Seleccionar enfoque de la foto"
                >
                  <img
                    src={editing.photoUrl}
                    alt={editing.displayName}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    style={{ objectPosition: `${focusX}% ${focusY}%` }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                  <div
                    className="pointer-events-none absolute h-8 w-8 rounded-full border border-white/80 bg-white/10 shadow-[0_0_0_1px_rgba(0,0,0,0.2)] backdrop-blur-sm"
                    style={{ left: `${focusX}%`, top: `${focusY}%`, transform: "translate(-50%, -50%)" }}
                  >
                    <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-4 py-3 text-[11px] font-medium text-white/80">
                    <span>X {focusX}%</span>
                    <span>Y {focusY}%</span>
                  </div>
                </button>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v, { shouldDirty: true })} />
              <Label>Activa</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving} className="bg-gradient-to-r from-[#E9745F] to-[#76214D] text-white">
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving ? "Guardando..." : editing ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ClassesCalendar;
