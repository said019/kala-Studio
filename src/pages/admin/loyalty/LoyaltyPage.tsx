import { useState, useEffect } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Plus, Settings, Sparkles, Trophy } from "lucide-react";

// ── Loyalty Config ──────────────────────────────────────
const defaultConfig = { enabled: true, points_per_class: 10, points_per_peso: 1, welcome_bonus: 50, birthday_bonus: 100 };

const LoyaltyConfig = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["loyalty-config"], queryFn: async () => (await api.get("/loyalty/config")).data });
  const config = data?.data ?? data ?? {};

  const [form, setForm] = useState({ ...defaultConfig });

  // Sync form when config loads from server
  useEffect(() => {
    if (config && Object.keys(config).length) {
      setForm((f) => ({ ...f, ...config }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (d: typeof form) => api.put("/loyalty/config", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loyalty-config"] }); toast({ title: "Configuración guardada" }); },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="max-w-md space-y-4">
      <div className="flex items-center gap-3">
        <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
        <Label>Programa activo</Label>
      </div>
      {[
        ["points_per_class", "Puntos por clase"],
        ["points_per_peso", "Puntos por peso gastado"],
        ["welcome_bonus", "Bono de bienvenida"],
        ["birthday_bonus", "Bono de cumpleaños"],
      ].map(([key, label]) => (
        <div key={key} className="space-y-1">
          <Label>{label}</Label>
          <Input type="number" value={(form as any)[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))} />
        </div>
      ))}
      <Button onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending}>Guardar</Button>
    </div>
  );
};

// ── Rewards CRUD ────────────────────────────────────────
const rewardSchema = z.object({
  name: z.string().min(1),
  points_cost: z.coerce.number().min(1),
  reward_type: z.enum(["discount", "free_class", "product", "custom"]),
  reward_value: z.string(),
  is_active: z.boolean().default(true),
  stock: z.coerce.number().nullable(),
});
type RewardFormData = z.infer<typeof rewardSchema>;
interface Reward extends RewardFormData { id: string }

const LoyaltyRewards = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reward | null>(null);

  const { data } = useQuery<{ data: Reward[] }>({ queryKey: ["loyalty-rewards"], queryFn: async () => (await api.get("/loyalty/rewards")).data });
  const rewards = Array.isArray(data?.data) ? data.data : [];

  const form = useForm<RewardFormData>({ resolver: zodResolver(rewardSchema), defaultValues: { reward_type: "discount", is_active: true, stock: null } });

  const createMutation = useMutation({ mutationFn: (d: RewardFormData) => api.post("/loyalty/rewards", d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["loyalty-rewards"] }); toast({ title: "Recompensa creada" }); setOpen(false); } });
  const updateMutation = useMutation({ mutationFn: ({ id, ...d }: Reward) => api.put(`/loyalty/rewards/${id}`, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["loyalty-rewards"] }); toast({ title: "Recompensa actualizada" }); setOpen(false); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.delete(`/loyalty/rewards/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["loyalty-rewards"] }); toast({ title: "Recompensa eliminada" }); } });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h2 className="text-lg font-semibold">Recompensas</h2>
        <Button size="sm" onClick={() => { form.reset({ reward_type: "discount", is_active: true, stock: null }); setEditing(null); setOpen(true); }}>
          <Plus size={14} className="mr-1" />Nueva
        </Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Puntos</TableHead><TableHead>Tipo</TableHead><TableHead>Stock</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {rewards.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell>{r.points_cost} pts</TableCell>
              <TableCell><Badge variant="outline">{r.reward_type}</Badge></TableCell>
              <TableCell>{r.stock ?? "∞"}</TableCell>
              <TableCell><Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Activa" : "Inactiva"}</Badge></TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => { form.reset(r); setEditing(r); setOpen(true); }}>Editar</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm("¿Eliminar esta recompensa?")) deleteMutation.mutate(r.id); }}>Eliminar</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar recompensa" : "Nueva recompensa"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => editing ? updateMutation.mutate({ ...d, id: editing.id }) : createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1"><Label>Nombre</Label><Input {...form.register("name")} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Costo en puntos</Label><Input type="number" {...form.register("points_cost")} /></div>
              <div className="space-y-1"><Label>Stock (vacío=∞)</Label><Input type="number" {...form.register("stock")} /></div>
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select defaultValue="discount" onValueChange={(v) => form.setValue("reward_type", v as "discount")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount">Descuento</SelectItem>
                  <SelectItem value="free_class">Clase gratis</SelectItem>
                  <SelectItem value="product">Producto</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Valor</Label><Input {...form.register("reward_value")} placeholder="Ej: 50, free_yoga, etc." /></div>
            <div className="flex items-center gap-3"><Switch checked={form.watch("is_active")} onCheckedChange={(v) => form.setValue("is_active", v)} /><Label>Activa</Label></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">{editing ? "Actualizar" : "Crear"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Milestones CRUD ──────────────────────────────────────
const milestoneSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  classes_required: z.coerce.number().min(1),
  period: z.enum(["lifetime", "month", "year"]).default("lifetime"),
  award_type: z.enum(["points", "reward"]).default("points"),
  award_points: z.coerce.number().min(0).default(0),
  award_reward_id: z.string().nullable().optional(),
  message_template_key: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().default(0),
});
type MilestoneFormData = z.infer<typeof milestoneSchema>;
interface Milestone extends MilestoneFormData {
  id: string;
  awarded_count?: number;
}

interface AwardLog {
  id: string;
  user_id: string;
  classes_at_award: number;
  awarded_at: string;
  display_name: string | null;
  phone: string | null;
  milestone_name: string;
  classes_required: number;
  award_type: string;
  award_points: number;
}

const PERIOD_LABEL: Record<string, string> = {
  lifetime: "Total",
  month: "Mes",
  year: "Año",
};

const LoyaltyMilestones = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);

  const { data, isLoading } = useQuery<{ data: Milestone[] }>({
    queryKey: ["loyalty-milestones"],
    queryFn: async () => (await api.get("/admin/loyalty-milestones")).data,
  });
  const milestones = Array.isArray(data?.data) ? data.data : [];

  const { data: rewardsData } = useQuery<{ data: Reward[] }>({
    queryKey: ["loyalty-rewards"],
    queryFn: async () => (await api.get("/loyalty/rewards")).data,
  });
  const rewards = Array.isArray(rewardsData?.data) ? rewardsData.data : [];

  const { data: templatesData } = useQuery<{ data: { templates: Record<string, { subject: string; body: string }> } }>({
    queryKey: ["whatsapp-templates"],
    queryFn: async () => (await api.get("/admin/whatsapp-templates")).data,
  });
  const templateKeys = Object.keys(templatesData?.data?.templates ?? {});

  const { data: awardsData } = useQuery<{ data: AwardLog[] }>({
    queryKey: ["loyalty-milestone-awards"],
    queryFn: async () => (await api.get("/admin/loyalty-milestones/awards?limit=50")).data,
    refetchInterval: 30000,
  });
  const awards = Array.isArray(awardsData?.data) ? awardsData.data : [];

  const form = useForm<MilestoneFormData>({
    resolver: zodResolver(milestoneSchema),
    defaultValues: {
      period: "lifetime",
      award_type: "points",
      award_points: 0,
      is_active: true,
      sort_order: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: (d: MilestoneFormData) => api.post("/admin/loyalty-milestones", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty-milestones"] });
      toast({ title: "Milestone creado" });
      setOpen(false);
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err?.response?.data?.message || "No se pudo crear", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: Milestone) => api.put(`/admin/loyalty-milestones/${id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty-milestones"] });
      toast({ title: "Milestone actualizado" });
      setOpen(false);
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err?.response?.data?.message || "No se pudo actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/loyalty-milestones/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loyalty-milestones"] });
      toast({ title: "Milestone eliminado" });
    },
  });

  const openCreate = () => {
    form.reset({
      name: "",
      description: "",
      classes_required: 10,
      period: "lifetime",
      award_type: "points",
      award_points: 100,
      award_reward_id: null,
      message_template_key: "",
      is_active: true,
      sort_order: milestones.length * 10,
    });
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (m: Milestone) => {
    form.reset({
      name: m.name,
      description: m.description ?? "",
      classes_required: m.classes_required,
      period: m.period,
      award_type: m.award_type,
      award_points: m.award_points ?? 0,
      award_reward_id: m.award_reward_id ?? null,
      message_template_key: m.message_template_key ?? "",
      is_active: m.is_active,
      sort_order: m.sort_order ?? 0,
    });
    setEditing(m);
    setOpen(true);
  };

  const onSubmit = (d: MilestoneFormData) => {
    const payload = {
      ...d,
      description: d.description || null,
      message_template_key: d.message_template_key || null,
      award_reward_id: d.award_type === "reward" ? d.award_reward_id || null : null,
      award_points: d.award_type === "points" ? d.award_points : 0,
    };
    if (editing) updateMutation.mutate({ ...payload, id: editing.id } as Milestone);
    else createMutation.mutate(payload);
  };

  const awardType = form.watch("award_type");

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando milestones…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Trophy size={18} className="text-[#F58A24]" />
            Recompensas por asistencia
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Otorga puntos automáticamente cuando una alumna alcanza N clases (lifetime/mes/año).
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} className="mr-1" />Nuevo milestone
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Umbral</TableHead>
            <TableHead>Período</TableHead>
            <TableHead>Recompensa</TableHead>
            <TableHead>Template WA</TableHead>
            <TableHead>Otorgados</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {milestones.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                Sin milestones configurados. Click "Nuevo milestone" para crear el primero.
              </TableCell>
            </TableRow>
          )}
          {milestones.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <div className="font-medium">{m.name}</div>
                {m.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{m.description}</div>
                )}
              </TableCell>
              <TableCell className="tabular-nums">{m.classes_required}</TableCell>
              <TableCell>
                <Badge variant="outline">{PERIOD_LABEL[m.period] || m.period}</Badge>
              </TableCell>
              <TableCell>
                {m.award_type === "points" ? (
                  <span className="text-sm">+{m.award_points} pts</span>
                ) : (
                  <Badge variant="outline">Reward</Badge>
                )}
              </TableCell>
              <TableCell>
                {m.message_template_key ? (
                  <code className="text-[11px] px-1.5 py-0.5 rounded bg-secondary">
                    {m.message_template_key}
                  </code>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="tabular-nums text-center">
                <Badge variant={m.awarded_count ? "default" : "secondary"}>
                  {m.awarded_count ?? 0}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={m.is_active ? "default" : "secondary"}>
                  {m.is_active ? "Activo" : "Inactivo"}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => openEdit(m)}>Editar</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        if (window.confirm(`¿Eliminar milestone "${m.name}"?\n\nLas alumnas que ya lo recibieron mantienen sus puntos, pero el registro de award se borra.`)) {
                          deleteMutation.mutate(m.id);
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

      {/* ── Recent awards feed ── */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Sparkles size={14} className="text-[#F58A24]" />
          Últimas alumnas premiadas
        </h3>
        {awards.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4">
            Aún ninguna alumna ha alcanzado un milestone.
          </p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Alumna</TableHead>
                  <TableHead>Milestone</TableHead>
                  <TableHead className="text-right">Otorgado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {awards.slice(0, 10).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{a.display_name || "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{a.phone}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{a.milestone_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {a.classes_at_award} clases · +{a.award_points} pts
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-[11px] text-muted-foreground tabular-nums">
                      {new Date(a.awarded_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Form dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar milestone" : "Nuevo milestone"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input {...form.register("name")} placeholder="Ej. Hábito en marcha" />
            </div>
            <div className="space-y-1">
              <Label>Descripción (opcional)</Label>
              <Input {...form.register("description")} placeholder="10 clases. Esto ya es hábito." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Clases requeridas</Label>
                <Input type="number" min="1" {...form.register("classes_required")} />
              </div>
              <div className="space-y-1">
                <Label>Período</Label>
                <Select
                  value={form.watch("period")}
                  onValueChange={(v) => form.setValue("period", v as "lifetime" | "month" | "year")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lifetime">Total (lifetime)</SelectItem>
                    <SelectItem value="month">Por mes</SelectItem>
                    <SelectItem value="year">Por año</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Tipo de recompensa</Label>
              <Select
                value={awardType}
                onValueChange={(v) => form.setValue("award_type", v as "points" | "reward")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="points">Puntos</SelectItem>
                  <SelectItem value="reward">Reward auto-otorgado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {awardType === "points" ? (
              <div className="space-y-1">
                <Label>Puntos a otorgar</Label>
                <Input type="number" min="0" {...form.register("award_points")} />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Reward a otorgar</Label>
                <Select
                  value={form.watch("award_reward_id") ?? ""}
                  onValueChange={(v) => form.setValue("award_reward_id", v || null)}
                >
                  <SelectTrigger><SelectValue placeholder="Selecciona reward" /></SelectTrigger>
                  <SelectContent>
                    {rewards.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} ({r.points_cost} pts)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Template WhatsApp (opcional)</Label>
              <Select
                value={form.watch("message_template_key") ?? ""}
                onValueChange={(v) => form.setValue("message_template_key", v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin notificación WA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin notificación</SelectItem>
                  {templateKeys
                    .filter((k) => k.startsWith("milestone_"))
                    .map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Se manda a la alumna cuando alcanza este milestone. Edita el texto en /admin/settings.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label>Orden</Label>
                <Input type="number" {...form.register("sort_order")} />
              </div>
              <div className="flex items-center gap-3 pb-2">
                <Switch
                  checked={form.watch("is_active")}
                  onCheckedChange={(v) => form.setValue("is_active", v)}
                />
                <Label>Activo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const LoyaltyPage = () => (
  <AuthGuard>
    <AdminLayout>
      <div className="admin-page max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Programa de Lealtad</h1>
        <Tabs defaultValue="rewards">
          <TabsList>
            <TabsTrigger value="rewards">Recompensas</TabsTrigger>
            <TabsTrigger value="milestones"><Trophy size={14} className="mr-1" />Milestones</TabsTrigger>
            <TabsTrigger value="config"><Settings size={14} className="mr-1" />Configuración</TabsTrigger>
          </TabsList>
          <TabsContent value="rewards" className="mt-4"><LoyaltyRewards /></TabsContent>
          <TabsContent value="milestones" className="mt-4"><LoyaltyMilestones /></TabsContent>
          <TabsContent value="config" className="mt-4"><LoyaltyConfig /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  </AuthGuard>
);

export default LoyaltyPage;
