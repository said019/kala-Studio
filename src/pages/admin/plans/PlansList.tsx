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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Plus } from "lucide-react";

const CATEGORIES = [
  { value: "barre",   label: "Barre",         color: "bg-[#76214D]/20 text-[#76214D] border-[#76214D]/30" },
  { value: "barre", label: "Barre",         color: "bg-[#76214D]/20 text-[#76214D] border-[#76214D]/30" },
  { value: "pilates", label: "Pilates",        color: "bg-[#E9745F]/20 text-[#E9745F] border-[#E9745F]/30" },
  { value: "mixto",   label: "Mixto",          color: "bg-yellow-400/15 text-yellow-400 border-yellow-400/30" },
  { value: "all",     label: "Todas (sin filtro)", color: "bg-white/10 text-white/60 border-white/15" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

const planSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  description: z.string().optional(),
  price: z.coerce.number().min(0),
  currency: z.string().default("MXN"),
  durationDays: z.coerce.number().min(1),
  classLimit: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().nullable()),
  classCategory: z.enum(["barre", "barre", "pilates", "mixto", "all"]).default("all"),
  features: z.string().optional(),
  isActive: z.boolean().default(true),
  isNonTransferable: z.boolean().default(false),
  isNonRepeatable: z.boolean().default(false),
  repeatKey: z.string().optional(),
  ringConstanciaGoal: z.coerce.number().min(1).default(1),
  ringEsfuerzoGoal: z.coerce.number().min(1).default(1),
  ringConexionGoal: z.coerce.number().min(1).default(10),
  rewardDescription: z.string().optional(),
  sortOrder: z.coerce.number().default(0),
  includesVideoLibrary: z.boolean().default(false),
});

type PlanFormData = z.infer<typeof planSchema>;

interface Plan extends PlanFormData {
  id: string;
}

function normalizePlanRow(row: any): Plan {
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    description: String(row?.description ?? ""),
    price: Number(row?.price ?? 0),
    currency: String(row?.currency ?? "MXN"),
    durationDays: Number(row?.durationDays ?? row?.duration_days ?? 30),
    classLimit: (() => {
      const raw = row?.classLimit ?? row?.class_limit ?? row?.class_limit_override;
      if (raw === "" || raw === undefined || raw === null) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })(),
    classCategory: ((row?.classCategory ?? row?.class_category ?? "all") as CategoryValue),
    features: Array.isArray(row?.features)
      ? row.features.join(", ")
      : String(row?.features ?? ""),
    isActive: Boolean(row?.isActive ?? row?.is_active ?? true),
    isNonTransferable: Boolean(row?.isNonTransferable ?? row?.is_non_transferable ?? false),
    isNonRepeatable: Boolean(row?.isNonRepeatable ?? row?.is_non_repeatable ?? false),
    repeatKey: String(row?.repeatKey ?? row?.repeat_key ?? ""),
    ringConstanciaGoal: Number(row?.ringConstanciaGoal ?? row?.ring_constancia_goal ?? 1),
    ringEsfuerzoGoal: Number(row?.ringEsfuerzoGoal ?? row?.ring_esfuerzo_goal ?? 1),
    ringConexionGoal: Number(row?.ringConexionGoal ?? row?.ring_conexion_goal ?? 10),
    rewardDescription: String(row?.rewardDescription ?? row?.reward_description ?? ""),
    sortOrder: Number(row?.sortOrder ?? row?.sort_order ?? 0),
    includesVideoLibrary: Boolean(row?.includesVideoLibrary ?? row?.includes_video_library ?? false),
  };
}

const EMPTY: PlanFormData = {
  name: "", description: "", price: 0, currency: "MXN",
  durationDays: 30, classLimit: null, classCategory: "all",
  features: "", isActive: true, isNonTransferable: false, isNonRepeatable: false, repeatKey: "",
  ringConstanciaGoal: 1, ringEsfuerzoGoal: 1, ringConexionGoal: 10, rewardDescription: "",
  sortOrder: 0,
  includesVideoLibrary: false,
};

function serializePlan(d: PlanFormData) {
  return {
    ...d,
    repeatKey: d.isNonRepeatable ? (d.repeatKey?.trim() || null) : null,
    rewardDescription: d.rewardDescription?.trim() || null,
    features: d.features
      ? d.features.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    includes_video_library: !!d.includesVideoLibrary,
  };
}

function normalizePlan(p: Plan): PlanFormData {
  return {
    ...p,
    classCategory: ((p as any).classCategory ?? (p as any).class_category ?? "all") as CategoryValue,
    features: Array.isArray(p.features)
      ? (p.features as unknown as string[]).join(", ")
      : (p.features as unknown as string) ?? "",
    isNonTransferable: Boolean((p as any).isNonTransferable ?? (p as any).is_non_transferable),
    isNonRepeatable: Boolean((p as any).isNonRepeatable ?? (p as any).is_non_repeatable),
    repeatKey: String((p as any).repeatKey ?? (p as any).repeat_key ?? ""),
    ringConstanciaGoal: Number((p as any).ringConstanciaGoal ?? (p as any).ring_constancia_goal ?? 1),
    ringEsfuerzoGoal: Number((p as any).ringEsfuerzoGoal ?? (p as any).ring_esfuerzo_goal ?? 1),
    ringConexionGoal: Number((p as any).ringConexionGoal ?? (p as any).ring_conexion_goal ?? 10),
    rewardDescription: String((p as any).rewardDescription ?? (p as any).reward_description ?? ""),
    includesVideoLibrary: Boolean((p as any).includesVideoLibrary ?? (p as any).includes_video_library ?? false),
  };
}

const PlansList = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const { data, isLoading } = useQuery<{ data: Plan[] }>({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/plans")).data,
  });
  const plans = Array.isArray(data?.data) ? data.data.map(normalizePlanRow) : [];

  const form = useForm<PlanFormData>({ resolver: zodResolver(planSchema), defaultValues: EMPTY });

  const createMutation = useMutation({
    mutationFn: (d: PlanFormData) => api.post("/plans", serializePlan(d)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plans"] }); toast({ title: "Plan creado" }); closeDialog(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al crear", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: Plan) => api.put(`/plans/${id}`, serializePlan(d)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plans"] }); toast({ title: "Plan actualizado" }); closeDialog(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, cascade }: { id: string; cascade?: boolean }) =>
      api.delete(`/plans/${id}${cascade ? "?cascade=true" : ""}`),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      const msg = res?.data?.message ?? "Plan eliminado";
      toast({ title: msg });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al eliminar", variant: "destructive" }),
  });

  const openCreate = () => { form.reset(EMPTY); setEditing(null); setOpen(true); };
  const openEdit = (p: Plan) => { form.reset(normalizePlan(p)); setEditing(p); setOpen(true); };
  const closeDialog = () => { setOpen(false); setEditing(null); };

  const onSubmit = (d: PlanFormData) => {
    if (editing) updateMutation.mutate({ ...d, id: editing.id });
    else createMutation.mutate(d);
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <h1 className="text-2xl font-bold">Planes</h1>
            <Button onClick={openCreate} size="sm"><Plus size={14} className="mr-1" />Nuevo plan</Button>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Límite clases</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Anillos</TableHead>
                  <TableHead>Reglas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array(4).fill(0).map((_, i) => (
                    <TableRow key={i}>{Array(9).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))
                  : plans.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>${p.price} {p.currency}</TableCell>
                      <TableCell>{p.durationDays} días</TableCell>
                      <TableCell>{p.classLimit == null ? "Ilimitado" : p.classLimit === 0 ? "0" : p.classLimit}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(() => {
                            const cat = CATEGORIES.find((c) => c.value === (p.classCategory ?? "all")) ?? CATEGORIES[3];
                            return <Badge className={`border ${cat.color}`}>{cat.label}</Badge>;
                          })()}
                          {Boolean((p as any).includesVideoLibrary ?? (p as any).includes_video_library) && (
                            <Badge variant="secondary" className="text-[0.6rem]">📹 Videos</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          <Badge variant="outline" className="border-[#76214D]/25 text-[#76214D]">C {p.ringConstanciaGoal}</Badge>
                          <Badge variant="outline" className="border-[#778455]/25 text-[#778455]">E {p.ringEsfuerzoGoal}</Badge>
                          <Badge variant="outline" className="border-[#F58A24]/25 text-[#F58A24]">X {p.ringConexionGoal}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {Boolean((p as any).isNonTransferable ?? (p as any).is_non_transferable) && (
                            <Badge variant="outline">No transferible</Badge>
                          )}
                          {Boolean((p as any).isNonRepeatable ?? (p as any).is_non_repeatable) && (
                            <Badge variant="outline">No repetible</Badge>
                          )}
                          {!Boolean((p as any).isNonTransferable ?? (p as any).is_non_transferable) &&
                            !Boolean((p as any).isNonRepeatable ?? (p as any).is_non_repeatable) && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.isActive ? "default" : "secondary"}>
                          {p.isActive ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => openEdit(p)}>Editar</DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => updateMutation.mutate({ ...p, isActive: !p.isActive })}
                            >
                              {p.isActive ? "Desactivar" : "Activar"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                const isLegacySession = p.name === "Sesión Extra (Socias o Inscritas)";
                                const msg = isLegacySession
                                  ? "¿Eliminar esta sesión y todos sus datos relacionados?"
                                  : "¿Eliminar este plan?";
                                if (window.confirm(msg)) {
                                  deleteMutation.mutate({ id: p.id, cascade: isLegacySession });
                                }
                              }}
                            >
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar plan" : "Nuevo plan"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input {...form.register("name")} />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Categoría de clases</Label>
                <Select
                  value={form.watch("classCategory") ?? "all"}
                  onValueChange={(v) => form.setValue("classCategory", v as CategoryValue)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Descripción</Label>
                <Input {...form.register("description")} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Precio (MXN)</Label>
                  <Input type="number" {...form.register("price")} />
                </div>
                <div className="space-y-1">
                  <Label>Duración (días)</Label>
                  <Input type="number" {...form.register("durationDays")} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Límite de clases (vacío = ilimitado)</Label>
                <Input type="number" placeholder="null = ilimitado" {...form.register("classLimit")} />
              </div>
              <div className="space-y-1">
                <Label>Beneficios (separados por coma)</Label>
                <Input {...form.register("features")} />
              </div>
              <div className="rounded-2xl border border-[#E8CAC1] bg-[#FFF7F2] p-4">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-[#2E201C]">Metas de anillos por semana</p>
                  <p className="text-xs text-muted-foreground">Kala define estas metas por plan. La alumna solo asiste y participa.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Constancia</Label>
                    <Input type="number" min={1} {...form.register("ringConstanciaGoal")} />
                  </div>
                  <div className="space-y-1">
                    <Label>Esfuerzo</Label>
                    <Input type="number" min={1} {...form.register("ringEsfuerzoGoal")} />
                  </div>
                  <div className="space-y-1">
                    <Label>Conexión</Label>
                    <Input type="number" min={1} {...form.register("ringConexionGoal")} />
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Label>Recompensa al cerrar 3 anillos</Label>
                  <Input placeholder="Ej: Clase extra o premio interno" {...form.register("rewardDescription")} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <Switch
                    checked={form.watch("isNonTransferable")}
                    onCheckedChange={(v) => form.setValue("isNonTransferable", v)}
                  />
                  <Label>No transferible</Label>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <Switch
                    checked={form.watch("isNonRepeatable")}
                    onCheckedChange={(v) => form.setValue("isNonRepeatable", v)}
                  />
                  <Label>No repetible</Label>
                </div>
              </div>
              {form.watch("isNonRepeatable") && (
                <div className="space-y-1">
                  <Label>Clave de repetición (grupo)</Label>
                  <Input placeholder="ej. trial_single_session" {...form.register("repeatKey")} />
                </div>
              )}
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.watch("isActive")}
                  onCheckedChange={(v) => form.setValue("isActive", v)}
                />
                <Label>Activo</Label>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border p-3">
                <Switch
                  checked={form.watch("includesVideoLibrary")}
                  onCheckedChange={(v) => form.setValue("includesVideoLibrary", v)}
                />
                <div className="space-y-0.5">
                  <Label className="cursor-pointer">Incluye acceso a biblioteca de videos</Label>
                  <p className="text-xs text-muted-foreground">
                    Las alumnas con este plan podrán acceder a las clases grabadas (requiere conceder acceso manualmente).
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
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

export default PlansList;
