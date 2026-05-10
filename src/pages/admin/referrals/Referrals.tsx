import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Plus, MoreHorizontal, Copy as CopyIcon } from "lucide-react";

interface ReferralCode {
  id: string;
  code: string;
  user_id: string;
  user_name?: string;
  email?: string;
  uses_count: number;
  max_uses: number | null;
  reward_points: number;
  is_active: boolean;
}

interface Referral {
  id: string;
  referrer_name: string;
  referred_name: string;
  status: "pending" | "completed";
  points_awarded: number;
  completed_at: string | null;
}

const Referrals = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ReferralCode | null>(null);
  const [form, setForm] = useState({
    code: "",
    reward_points: 200,
    max_uses: "",
    is_active: true,
  });

  const { data: codes } = useQuery<{ data: ReferralCode[] }>({
    queryKey: ["referral-codes"],
    queryFn: async () => (await api.get("/referrals/codes")).data,
  });

  const { data: referrals } = useQuery<{ data: Referral[] }>({
    queryKey: ["referrals"],
    queryFn: async () => (await api.get("/referrals")).data,
  });

  const { data: statsData } = useQuery<{ data: { total: number; rewarded: number } }>({
    queryKey: ["referrals-stats"],
    queryFn: async () => (await api.get("/referrals/stats")).data,
  });
  const stats = statsData?.data ?? { total: 0, rewarded: 0 };

  const createMutation = useMutation({
    mutationFn: (d: typeof form) => api.post("/admin/referrals/codes", {
      code: d.code || undefined,
      reward_points: Number(d.reward_points) || 200,
      max_uses: d.max_uses ? Number(d.max_uses) : null,
      is_active: d.is_active,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referral-codes"] });
      toast({ title: "Código creado" });
      setOpen(false);
    },
    onError: (e: any) => toast({
      title: "Error",
      description: e?.response?.data?.message || "No se pudo crear",
      variant: "destructive",
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: ReferralCode) => api.put(`/admin/referrals/codes/${id}`, {
      reward_points: d.reward_points,
      max_uses: d.max_uses,
      is_active: d.is_active,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referral-codes"] });
      toast({ title: "Código actualizado" });
      setOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/referrals/codes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referral-codes"] });
      toast({ title: "Código eliminado" });
    },
  });

  const toggleActive = (c: ReferralCode) => {
    updateMutation.mutate({ ...c, is_active: !c.is_active });
  };

  const openCreate = () => {
    setForm({ code: "", reward_points: 200, max_uses: "", is_active: true });
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (c: ReferralCode) => {
    setForm({
      code: c.code,
      reward_points: c.reward_points,
      max_uses: c.max_uses != null ? String(c.max_uses) : "",
      is_active: c.is_active,
    });
    setEditing(c);
    setOpen(true);
  };

  const handleSubmit = () => {
    if (editing) {
      updateMutation.mutate({
        ...editing,
        reward_points: Number(form.reward_points) || 0,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        is_active: form.is_active,
      });
    } else {
      createMutation.mutate(form);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: "Copiado al portapapeles", description: code });
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h1 className="text-2xl font-bold">Referidos</h1>
            <Button onClick={openCreate} size="sm">
              <Plus size={14} className="mr-1" /> Nuevo código
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Total referidos</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{stats.total}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Recompensados</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{stats.rewarded}</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm text-muted-foreground">Códigos activos</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {(codes?.data || []).filter((c) => c.is_active).length}
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="codes">
            <TabsList>
              <TabsTrigger value="codes">Códigos</TabsTrigger>
              <TabsTrigger value="referrals">Relaciones</TabsTrigger>
            </TabsList>

            <TabsContent value="codes" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>De</TableHead>
                    <TableHead>Usos</TableHead>
                    <TableHead>Máx.</TableHead>
                    <TableHead>Puntos</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(codes?.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                        Sin códigos. Click "Nuevo código" para crear el primero.
                      </TableCell>
                    </TableRow>
                  )}
                  {(codes?.data ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <button
                          onClick={() => copyCode(c.code)}
                          className="font-mono font-bold inline-flex items-center gap-1.5 hover:underline"
                          title="Copiar al portapapeles"
                        >
                          {c.code}
                          <CopyIcon size={12} className="opacity-50" />
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.user_name || "—"}</TableCell>
                      <TableCell className="tabular-nums">{c.uses_count}</TableCell>
                      <TableCell className="tabular-nums">{c.max_uses ?? "∞"}</TableCell>
                      <TableCell>{c.reward_points} pts</TableCell>
                      <TableCell>
                        <Switch
                          checked={c.is_active}
                          onCheckedChange={() => toggleActive(c)}
                        />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => openEdit(c)}>Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copyCode(c.code)}>Copiar código</DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                if (window.confirm(`¿Eliminar código ${c.code}? Esto no afecta los referidos ya completados.`)) {
                                  deleteMutation.mutate(c.id);
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
            </TabsContent>

            <TabsContent value="referrals" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referidor</TableHead>
                    <TableHead>Referida</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Puntos</TableHead>
                    <TableHead>Cuándo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(Array.isArray(referrals?.data) ? referrals.data : []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                        Aún ninguna alumna ha referido a otra.
                      </TableCell>
                    </TableRow>
                  )}
                  {(Array.isArray(referrals?.data) ? referrals.data : []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.referrer_name}</TableCell>
                      <TableCell>{r.referred_name}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "completed" ? "default" : "outline"}>
                          {r.status === "completed" ? "Completado" : "Pendiente"}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.points_awarded}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.completed_at ? new Date(r.completed_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>

          {/* Form dialog */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar código" : "Nuevo código"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Código (deja vacío para auto-generar)</Label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="KALA-XYZ12"
                    disabled={!!editing}
                    className="font-mono"
                  />
                  {!editing && (
                    <p className="text-[11px] text-muted-foreground">
                      Si lo dejas vacío se genera uno tipo "KALA-AB3CD".
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Puntos al referidor</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.reward_points}
                      onChange={(e) => setForm((f) => ({ ...f, reward_points: Number(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Usos máx (∞ vacío)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.max_uses}
                      onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))}
                      placeholder="Sin límite"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                  />
                  <Label>Activo (puede usarse para referir)</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editing ? "Guardar" : "Crear código"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default Referrals;
