import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TimePicker } from "@/components/ui/time-picker";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Plus, Sparkles } from "lucide-react";

const scheduleSchema = z.object({
  dayOfWeek: z.coerce.number().min(0).max(6),
  classTypeId: z.string().min(1),
  instructorId: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  maxCapacity: z.coerce.number().min(1),
  isActive: z.boolean().default(true),
});

type ScheduleFormData = z.infer<typeof scheduleSchema>;
interface Schedule extends ScheduleFormData { id: string; classTypeName?: string; instructorName?: string }

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const WeeklySchedule = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [mobileDay, setMobileDay] = useState(new Date().getDay());

  const { data } = useQuery<{ data: Schedule[] }>({
    queryKey: ["schedules"],
    queryFn: async () => (await api.get("/schedules")).data,
  });
  const schedules = Array.isArray(data?.data) ? data.data : [];

  const { data: typesData } = useQuery<{ data: { id: string; name: string }[] }>({
    queryKey: ["class-types"],
    queryFn: async () => (await api.get("/class-types")).data,
  });

  const { data: instructorsData } = useQuery<{ data: { id: string; displayName: string }[] }>({
    queryKey: ["instructors"],
    queryFn: async () => (await api.get("/instructors")).data,
  });

  const form = useForm<ScheduleFormData>({ resolver: zodResolver(scheduleSchema), defaultValues: { maxCapacity: 20, isActive: true } });

  const createMutation = useMutation({
    mutationFn: (d: ScheduleFormData) => api.post("/schedules", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); toast({ title: "Horario creado" }); setOpen(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: Schedule) => api.put(`/schedules/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); toast({ title: "Horario actualizado" }); setOpen(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/schedules/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); toast({ title: "Horario eliminado" }); },
  });

  const resetKalaMutation = useMutation({
    mutationFn: () => api.post("/schedules/reset-kala"),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      toast({ title: "Horario Kala restablecido", description: res.data?.message || "23 slots cargados" });
    },
    onError: () => toast({ title: "Error", description: "No se pudo restablecer", variant: "destructive" }),
  });

  const openEdit = (s: Schedule) => { form.reset(s); setEditing(s); setOpen(true); };
  const openCreate = (dayOfWeek = mobileDay) => {
    form.reset({ dayOfWeek, maxCapacity: 20, isActive: true });
    setEditing(null);
    setOpen(true);
  };

  const grouped = DAYS.reduce((acc, _, i) => {
    acc[i] = schedules.filter((s) => s.dayOfWeek === i);
    return acc;
  }, {} as Record<number, Schedule[]>);

  const scheduleCard = (s: Schedule) => (
    <div key={s.id} className="mb-2 p-2.5 bg-white/[0.03] rounded-xl border border-white/[0.05] text-xs">
      <div className="font-semibold text-white/80 text-[11px] truncate">{s.classTypeName ?? s.classTypeId}</div>
      <div className="text-[#F58A24]/70 text-[10px] mt-0.5">{s.startTime}–{s.endTime}</div>
      <div className="text-white/35 text-[10px] truncate">{s.instructorName ?? s.instructorId}</div>
      <div className="flex items-center justify-between mt-1.5">
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${s.isActive ? "text-[#4ade80] border-[#4ade80]/30 bg-[#4ade80]/5" : "text-white/25 border-white/10"}`}>
          {s.isActive ? "Activo" : "Inactivo"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 min-h-[44px] min-w-[44px] text-white/20 hover:text-white/60">
              <MoreHorizontal size={12} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#0f0518] border-white/10">
            <DropdownMenuItem className="text-white/70 hover:text-white" onClick={() => openEdit(s)}>Editar</DropdownMenuItem>
            <DropdownMenuItem className="text-[#f87171]" onClick={() => { if (window.confirm("¿Eliminar este horario?")) deleteMutation.mutate(s.id); }}>Eliminar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="admin-title font-bold text-white">Horarios semanales</h1>
              <p className="text-sm text-white/35">Plantilla semanal para crear clases más rápido.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (window.confirm("Esto borrará TODOS los horarios actuales y dejará el horario Kala oficial:\n\nLun–Vie: 7am, 8am, 7pm, 8pm\nSábado: 7am, 8am, 9am\n\n¿Continuar?")) {
                    resetKalaMutation.mutate();
                  }
                }}
                disabled={resetKalaMutation.isPending}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] disabled:opacity-60"
              >
                <Sparkles size={14} /> {resetKalaMutation.isPending ? "Aplicando…" : "Horario Kala oficial"}
              </button>
              <button
                onClick={() => openCreate(isMobile ? mobileDay : new Date().getDay())}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#76214D] to-[#E9745F] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Plus size={14} /> Nuevo horario
              </button>
            </div>
          </div>

          {isMobile ? (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] p-2">
                <div className="flex min-w-max gap-2">
                  {DAYS.map((day, i) => {
                    const active = mobileDay === i;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setMobileDay(i)}
                        className={cn(
                          "flex min-h-[52px] min-w-[84px] flex-col items-center justify-center rounded-xl border px-2 text-xs transition-colors",
                          active
                            ? "border-[#76214D]/60 bg-gradient-to-r from-[#76214D]/20 to-[#E9745F]/20 text-white"
                            : "border-white/10 bg-black/30 text-white/70",
                        )}
                      >
                        <span className="text-[10px] uppercase">{day.slice(0, 3)}</span>
                        <span className="text-base font-bold leading-none">{grouped[i].length}</span>
                        <span className="mt-0.5 text-[10px] text-white/55">clases</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-white/45">{DAYS[mobileDay].slice(0, 3)}</p>
                    <p className="text-sm font-semibold text-white">{DAYS[mobileDay]}</p>
                  </div>
                  <Button size="sm" className="h-9" onClick={() => openCreate(mobileDay)}>
                    <Plus size={14} className="mr-1" /> Nueva
                  </Button>
                </div>

                {grouped[mobileDay].length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-xs text-white/45">
                    Sin horarios para este día.
                  </div>
                ) : (
                  grouped[mobileDay].map((s) => scheduleCard(s))
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-7 gap-3">
              {DAYS.map((day, i) => (
                <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <p className="text-[10px] font-bold text-center mb-3 text-[#E9745F]/60 uppercase tracking-widest">
                    {day.slice(0, 3)}
                  </p>
                  {grouped[i].length === 0 ? (
                    <p className="text-center text-white/15 text-xs py-3">—</p>
                  ) : grouped[i].map((s) => scheduleCard(s))}
                </div>
              ))}
            </div>
          )}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md bg-[#0f0518] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="text-white">{editing ? "Editar horario" : "Nuevo horario"}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={form.handleSubmit((d) =>
                editing ? updateMutation.mutate({ ...d, id: editing.id }) : createMutation.mutate(d)
              )}
              className="space-y-4"
            >
              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Día</Label>
                <Select
                  value={String(form.watch("dayOfWeek"))}
                  onValueChange={(v) => form.setValue("dayOfWeek", Number(v))}
                >
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue placeholder="Seleccionar día" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f0518] border-white/10">
                    {DAYS.map((d, i) => (
                      <SelectItem key={i} value={String(i)} className="text-white">{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Tipo de clase</Label>
                <Select onValueChange={(v) => form.setValue("classTypeId", v)}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f0518] border-white/10">
                    {(Array.isArray(typesData?.data) ? typesData.data : []).map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-white">{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Instructor</Label>
                <Select onValueChange={(v) => form.setValue("instructorId", v)}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue placeholder="Instructor" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f0518] border-white/10">
                    {(Array.isArray(instructorsData?.data) ? instructorsData.data : []).map((i) => (
                      <SelectItem key={i.id} value={i.id} className="text-white">{i.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Hora inicio</Label>
                  <TimePicker
                    value={form.watch("startTime")}
                    onChange={(v) => form.setValue("startTime", v)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Hora fin</Label>
                  <TimePicker
                    value={form.watch("endTime")}
                    onChange={(v) => form.setValue("endTime", v)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Capacidad máx.</Label>
                <Input
                  type="number"
                  className="bg-white/[0.04] border-white/[0.08] text-white"
                  {...form.register("maxCapacity")}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} />
                <Label className="text-white/60 text-xs">Activo</Label>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/10 text-white/60 hover:bg-white/5"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white border-0"
                >
                  {editing ? "Actualizar" : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
};

export default WeeklySchedule;
