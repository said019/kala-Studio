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
import { MoreHorizontal, Plus, Settings } from "lucide-react";

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

const LoyaltyPage = () => (
  <AuthGuard>
    <AdminLayout>
      <div className="admin-page max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Programa de Lealtad</h1>
        <Tabs defaultValue="rewards">
          <TabsList>
            <TabsTrigger value="rewards">Recompensas</TabsTrigger>
            <TabsTrigger value="config"><Settings size={14} className="mr-1" />Configuración</TabsTrigger>
          </TabsList>
          <TabsContent value="rewards" className="mt-4"><LoyaltyRewards /></TabsContent>
          <TabsContent value="config" className="mt-4"><LoyaltyConfig /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  </AuthGuard>
);

export default LoyaltyPage;
