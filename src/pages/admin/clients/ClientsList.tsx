import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Plus, Search, UserPlus, CreditCard, Banknote, Building2, Film } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

// ── Schemas ────────────────────────────────────────────────────────────────────
const editSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  displayName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  healthNotes: z.string().optional(),
  acceptsCommunications: z.boolean().default(true),
});

const manualSchema = z.object({
  displayName: z.string().min(1, "Nombre requerido"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  healthNotes: z.string().optional(),
  planId: z.string().optional(),
  paymentMethod: z.enum(["cash", "card", "transfer"]).optional(),
  startDate: z.string().optional(),
  notes: z.string().optional(),
  discountCode: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;
type ManualFormData = z.infer<typeof manualSchema>;

interface Client extends EditFormData {
  id: string;
  role: string;
}

interface Plan { id: string; name: string; price: number; category: string; classLimit?: number | null; }

// ── Payment method selector ────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value: "cash",     label: "Efectivo",     Icon: Banknote },
  { value: "card",     label: "Tarjeta",      Icon: CreditCard },
  { value: "transfer", label: "Transferencia",Icon: Building2 },
] as const;

// ── Main component ─────────────────────────────────────────────────────────────
const ClientsList = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing]   = useState<Client | null>(null);
  // Manual registration dialog
  const [manualOpen, setManualOpen] = useState(false);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Clients list
  const { data, isLoading } = useQuery<{ data: Client[] }>({
    queryKey: ["clients", debouncedSearch],
    queryFn: async () => (await api.get(`/users?role=client&search=${debouncedSearch}`)).data,
  });
  const clients = Array.isArray(data?.data) ? data.data : [];

  // Video access pending list
  const { data: pendingData } = useQuery({
    queryKey: ["video-access-pending"],
    queryFn: async () => (await api.get("/admin/video-access/pending")).data,
    staleTime: 60_000,
  });
  const pendingClients: any[] = Array.isArray(pendingData?.data) ? pendingData.data : [];
  const pendingIds = new Set(pendingClients.map((c: any) => c.id));

  const [searchParams] = useSearchParams();
  const [showOnlyPending, setShowOnlyPending] = useState(searchParams.get("pending") === "1");
  // I4: re-sync when the URL param changes (e.g. dashboard widget click while
  // already on /admin/clients — useState initializer alone wouldn't re-fire).
  useEffect(() => {
    if (searchParams.get("pending") === "1") setShowOnlyPending(true);
  }, [searchParams]);
  const filteredClients = showOnlyPending
    ? clients.filter((c: any) => pendingIds.has(c.id))
    : clients;

  const grantInlineMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post(`/admin/users/${userId}/video-access`, { note: "Concedido desde lista" }),
    onSuccess: (_res, userId) => {
      const granted = pendingClients.find((c: any) => c.id === userId);
      qc.invalidateQueries({ queryKey: ["video-access-pending"] });
      qc.invalidateQueries({ queryKey: ["video-access", userId] });
      qc.invalidateQueries({ queryKey: ["me-video-access"] });
      toast({ title: `✅ Acceso dado a ${granted?.display_name ?? "alumna"}` });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al conceder acceso", variant: "destructive" }),
  });

  // Plans for the manual dialog
  const { data: plansData } = useQuery<{ data: Plan[] }>({
    queryKey: ["plans-active"],
    queryFn: async () => (await api.get("/plans?active=true")).data,
    staleTime: 60_000,
  });
  const plans: Plan[] = Array.isArray(plansData?.data) ? plansData.data : [];

  // ── Edit form ──────────────────────────────────────────────────────────────
  const editForm = useForm<EditFormData>({ resolver: zodResolver(editSchema) });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: Client) => api.put(`/users/${id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente actualizado" });
      setEditOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Cliente eliminado" });
    },
  });

  const openEdit = (c: Client) => { editForm.reset(c); setEditing(c); setEditOpen(true); };
  const onEditSubmit = (d: EditFormData) => {
    if (editing) updateMutation.mutate({ ...d, id: editing.id, role: "client" });
  };

  // ── Manual registration form ───────────────────────────────────────────────
  const manualForm = useForm<ManualFormData>({
    resolver: zodResolver(manualSchema),
    defaultValues: { startDate: format(new Date(), "yyyy-MM-dd") },
  });
  const selectedPlanId = manualForm.watch("planId");
  const selectedPlan   = plans.find((p) => p.id === selectedPlanId);
  const paymentMethod  = manualForm.watch("paymentMethod");

  const manualMutation = useMutation({
    mutationFn: (d: ManualFormData) => api.post("/admin/clients/manual", d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      const msg = res.data?.data?.membershipId
        ? "Clienta registrada y membresía activada ✓"
        : "Clienta registrada ✓";
      toast({ title: msg });
      setManualOpen(false);
      manualForm.reset({ startDate: format(new Date(), "yyyy-MM-dd") });
    },
    onError: (err: any) => {
      toast({
        title: "Error al registrar",
        description: err?.response?.data?.error ?? "Revisa los datos e intenta de nuevo",
        variant: "destructive",
      });
    },
  });

  const onManualSubmit = (d: ManualFormData) => manualMutation.mutate(d);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-7">
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">Clientas</h1>
              <p className="text-sm text-white/35">
                {showOnlyPending
                  ? `${filteredClients.length} pendientes de acceso a videos`
                  : `${clients.length} clientas registradas`}
              </p>
            </div>
            <button
              onClick={() => setManualOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#76214D] to-[#E9745F] hover:opacity-90 transition-opacity"
            >
              <UserPlus size={15} /> Nueva clienta
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-5 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <Input
              className="pl-8 bg-white/[0.03] border-white/[0.08] text-white placeholder:text-white/25 focus:border-[#76214D]/40"
              placeholder="Buscar clienta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Pending video access filter */}
          {pendingClients.length > 0 && (
            <button
              type="button"
              onClick={() => setShowOnlyPending((s) => !s)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-4 transition-colors",
                showOnlyPending
                  ? "bg-amber-500 text-white hover:bg-amber-500/90"
                  : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
              )}
            >
              <Film size={12} /> Pendientes de acceso ({pendingClients.length})
              {showOnlyPending && <span className="ml-1 opacity-80">· quitar filtro</span>}
            </button>
          )}

          {/* Table */}
          <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-white/[0.01]">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.07] hover:bg-transparent">
                  <TableHead className="text-white/40 font-semibold text-xs uppercase tracking-wider">Nombre</TableHead>
                  <TableHead className="text-white/40 font-semibold text-xs uppercase tracking-wider">Email</TableHead>
                  <TableHead className="text-white/40 font-semibold text-xs uppercase tracking-wider">Teléfono</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array(5).fill(0).map((_, i) => (
                    <TableRow key={i} className="border-white/[0.05]">
                      {Array(4).fill(0).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full bg-white/[0.05]" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                  : filteredClients.length === 0 && showOnlyPending ? (
                    <TableRow className="border-white/[0.05]">
                      <TableCell colSpan={4} className="text-center text-sm text-white/40 py-8">
                        Ninguna clienta pendiente de acceso a videos.
                      </TableCell>
                    </TableRow>
                  ) : filteredClients.map((c) => (
                    <TableRow key={c.id} className="border-white/[0.05] hover:bg-white/[0.03] transition-colors">
                      <TableCell className="font-semibold text-white/85">
                        <div className="flex items-center gap-2">
                          <span>{c.displayName}</span>
                          {pendingIds.has(c.id) && (
                            <Film size={12} className="text-amber-400" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-white/45">{c.email}</TableCell>
                      <TableCell className="text-sm text-white/45">{c.phone ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          {showOnlyPending && pendingIds.has(c.id) && (
                            <Button
                              size="sm"
                              className="text-xs h-7 bg-amber-500 hover:bg-amber-500/90 text-white border-0"
                              disabled={grantInlineMutation.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                grantInlineMutation.mutate(c.id);
                              }}
                            >
                              ✓ Conceder
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-white/30 hover:text-white/70 hover:bg-white/5">
                                <MoreHorizontal size={14} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-[#0f0518] border-white/10">
                              <DropdownMenuItem
                                className="text-white/70 hover:text-white focus:text-white hover:bg-white/5 focus:bg-white/5"
                                onClick={() => navigate(`/admin/clients/${c.id}`)}
                              >
                                Ver detalle
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-white/70 hover:text-white focus:text-white hover:bg-white/5 focus:bg-white/5"
                                onClick={() => openEdit(c)}
                              >
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-[#f87171] hover:text-[#f87171] focus:text-[#f87171] hover:bg-[#f87171]/5 focus:bg-[#f87171]/5"
                                onClick={() => { if (window.confirm("¿Eliminar este cliente?")) deleteMutation.mutate(c.id); }}
                              >
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ── Edit dialog ──────────────────────────────────────────────────── */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg bg-[#0f0518] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="text-white">Editar clienta</DialogTitle>
            </DialogHeader>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Nombre</Label>
                  <Input className="bg-white/[0.04] border-white/[0.08] text-white" {...editForm.register("displayName")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Email</Label>
                  <Input type="email" className="bg-white/[0.04] border-white/[0.08] text-white" {...editForm.register("email")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Teléfono</Label>
                  <Input className="bg-white/[0.04] border-white/[0.08] text-white" {...editForm.register("phone")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Fecha de nacimiento</Label>
                  <DatePicker value={editForm.watch("dateOfBirth")} onChange={(v) => editForm.setValue("dateOfBirth", v)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Notas de salud</Label>
                <Input className="bg-white/[0.04] border-white/[0.08] text-white" {...editForm.register("healthNotes")} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Contacto de emergencia</Label>
                  <Input className="bg-white/[0.04] border-white/[0.08] text-white" placeholder="Nombre" {...editForm.register("emergencyContactName")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Teléfono emergencia</Label>
                  <Input className="bg-white/[0.04] border-white/[0.08] text-white" {...editForm.register("emergencyContactPhone")} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="border-white/10 text-white/60 hover:bg-white/5" onClick={() => setEditOpen(false)}>Cancelar</Button>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white border-0"
                >
                  Actualizar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Manual registration dialog ───────────────────────────────────── */}
        <Dialog open={manualOpen} onOpenChange={(v) => { setManualOpen(v); if (!v) manualForm.reset({ startDate: format(new Date(), "yyyy-MM-dd") }); }}>
          <DialogContent className="max-w-xl bg-[#0f0518] border-white/10 text-white max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <UserPlus size={18} className="text-[#76214D]" />
                Nueva clienta
              </DialogTitle>
              <p className="text-xs text-white/35 mt-0.5">Registro manual · La clienta recibe su contraseña por email</p>
            </DialogHeader>

            <form onSubmit={manualForm.handleSubmit(onManualSubmit)} className="space-y-5 pt-1">
              {/* Personal info */}
              <div>
                <p className="text-[11px] text-[#76214D]/70 font-semibold uppercase tracking-wider mb-3">Datos personales</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-white/60 text-xs">Nombre completo *</Label>
                    <Input
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                      placeholder="Ana García"
                      {...manualForm.register("displayName")}
                    />
                    {manualForm.formState.errors.displayName && (
                      <p className="text-[10px] text-[#f87171]">{manualForm.formState.errors.displayName.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/60 text-xs">Email *</Label>
                    <Input
                      type="email"
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                      placeholder="ana@email.com"
                      {...manualForm.register("email")}
                    />
                    {manualForm.formState.errors.email && (
                      <p className="text-[10px] text-[#f87171]">{manualForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/60 text-xs">Teléfono</Label>
                    <Input
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                      placeholder="55 1234 5678"
                      {...manualForm.register("phone")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/60 text-xs">Fecha de nacimiento</Label>
                    <DatePicker value={manualForm.watch("dateOfBirth")} onChange={(v) => manualForm.setValue("dateOfBirth", v)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/60 text-xs">Notas de salud</Label>
                    <Input
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                      placeholder="Lesiones, condiciones..."
                      {...manualForm.register("healthNotes")}
                    />
                  </div>
                </div>
              </div>

              {/* Plan (optional) */}
              <div>
                <p className="text-[11px] text-[#E9745F]/70 font-semibold uppercase tracking-wider mb-3">Membresía (opcional)</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-white/60 text-xs">Plan</Label>
                    <Select
                      value={selectedPlanId ?? "none"}
                      onValueChange={(v) => manualForm.setValue("planId", v === "none" ? undefined : v)}
                    >
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                        <SelectValue placeholder="Sin plan (solo crear cuenta)" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0f0518] border-white/10">
                        <SelectItem value="none" className="text-white/50">Sin plan</SelectItem>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-white">
                            {p.name}
                            {typeof p.classLimit === "number" && p.classLimit < 9999 && (
                              <span className="ml-2 text-fuchsia-300/70">· {p.classLimit} clase{p.classLimit === 1 ? "" : "s"}</span>
                            )}
                            {p.price > 0 && (
                              <span className="ml-2 text-white/40">${p.price.toLocaleString("es-MX")}</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Show price of selected plan */}
                  {selectedPlan && (
                    <div className="flex items-center justify-between rounded-xl border border-[#E9745F]/20 bg-[#E9745F]/5 px-4 py-2.5">
                      <span className="text-sm text-white/70">{selectedPlan.name}</span>
                      <span className="text-lg font-bold text-[#E9745F]">${selectedPlan.price.toLocaleString("es-MX")}</span>
                    </div>
                  )}

                  {/* Payment method — only if plan selected */}
                  {selectedPlanId && selectedPlanId !== "none" && (
                    <div className="space-y-1">
                      <Label className="text-white/60 text-xs">Método de pago</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {PAYMENT_METHODS.map(({ value, label, Icon }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => manualForm.setValue("paymentMethod", value)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all",
                              paymentMethod === value
                                ? "border-[#76214D]/50 bg-[#76214D]/10 text-[#76214D]"
                                : "border-white/[0.07] bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white/60"
                            )}
                          >
                            <Icon size={16} />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Start date — only if plan selected */}
                  {selectedPlanId && selectedPlanId !== "none" && (
                    <div className="space-y-1">
                      <Label className="text-white/60 text-xs">Fecha de inicio</Label>
                      <DatePicker value={manualForm.watch("startDate")} onChange={(v) => manualForm.setValue("startDate", v)} />
                    </div>
                  )}

                  {/* Discount code — only if plan selected */}
                  {selectedPlanId && selectedPlanId !== "none" && (
                    <div className="space-y-1">
                      <Label className="text-white/60 text-xs">Cupón de descuento (opcional)</Label>
                      <Input
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 uppercase"
                        placeholder="Ej: ONLINE75"
                        {...manualForm.register("discountCode")}
                      />
                      <p className="text-[10px] text-white/35">Se valida contra el plan elegido y queda anotado en la membresía.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Internal notes */}
              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Notas internas</Label>
                <Input
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20"
                  placeholder="Referida por, observaciones..."
                  {...manualForm.register("notes")}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/10 text-white/60 hover:bg-white/5"
                  onClick={() => setManualOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={manualMutation.isPending}
                  className="bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white border-0 min-w-[140px]"
                >
                  {manualMutation.isPending ? "Registrando…" : selectedPlanId && selectedPlanId !== "none" ? "Registrar + activar plan" : "Registrar clienta"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

      </AdminLayout>
    </AuthGuard>
  );
};

export default ClientsList;
