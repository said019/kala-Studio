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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Plus, Search, X } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { useDebounce } from "@/hooks/use-debounce";

const STATUS_OPTIONS = ["active", "pending_payment", "pending_activation", "expired", "cancelled"] as const;
type MembershipStatus = (typeof STATUS_OPTIONS)[number];

const STATUS_LABELS: Record<MembershipStatus, string> = {
  active: "Activa",
  pending_payment: "Pendiente pago",
  pending_activation: "Pendiente activación",
  expired: "Expirada",
  cancelled: "Cancelada",
};

const STATUS_VARIANTS: Record<MembershipStatus, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  pending_payment: "outline",
  pending_activation: "outline",
  expired: "secondary",
  cancelled: "destructive",
};

interface Membership {
  id: string;
  userId: string;
  userName?: string;
  planId: string;
  planName?: string;
  classCategory?: string;
  status: MembershipStatus;
  paymentMethod?: string;
  startDate?: string;
  endDate?: string;
  classesRemaining?: number | null;
  classLimit?: number | null;
  isExpired?: boolean;
}

interface ClientOption {
  id: string;
  displayName: string;
  email?: string;
  phone?: string | null;
}

const membershipSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  paymentMethod: z.enum(["efectivo", "tarjeta", "transferencia"]).optional(),
  startDate: z.string().min(1),
});

type MembershipFormData = z.infer<typeof membershipSchema>;

const MembershipTable = ({ status, title }: { status?: string; title: string }) => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const url = status ? `/memberships?status=${status}` : "/memberships";
  const { data, isLoading } = useQuery<{ data: Membership[] }>({
    queryKey: ["memberships", status],
    queryFn: async () => (await api.get(url)).data,
  });
  const memberships = Array.isArray(data?.data) ? data.data : [];

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.put(`/memberships/${id}/activate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memberships"] }); toast({ title: "Membresía activada" }); },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.put(`/memberships/${id}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["memberships"] }); toast({ title: "Membresía cancelada" }); },
  });

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>Clases</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array(4).fill(0).map((_, i) => (
                <TableRow key={i}>{Array(6).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
              : memberships.map((m) => {
                const catColors: Record<string, string> = {
                  jumping: "bg-[#76214D]/15 text-[#76214D] border-[#76214D]/30",
                  pilates: "bg-[#E9745F]/15 text-[#E9745F] border-[#E9745F]/30",
                  mixto: "bg-[#F58A24]/15 text-[#F58A24] border-[#F58A24]/30",
                };
                const cat = m.classCategory ?? "";
                // status puede seguir 'active' aunque el plan esté vencido (end_date pasada);
                // el backend lo marca con isExpired. Lo mostramos como expirado.
                const isExpired = Boolean(m.isExpired) || m.status === "expired";
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.userName ?? m.userId}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{m.planName ?? m.planId}</span>
                        {cat && cat !== "all" && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize ${catColors[cat] ?? "text-white/40 border-white/10"}`}>
                            {cat}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isExpired ? STATUS_VARIANTS.expired : STATUS_VARIANTS[m.status]}>
                        {isExpired ? STATUS_LABELS.expired : STATUS_LABELS[m.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.endDate ? new Date(m.endDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell className={isExpired ? "text-muted-foreground line-through" : undefined}>
                      {m.classesRemaining === null || m.classesRemaining === undefined
                        ? (m.classLimit === null ? "∞" : "—")
                        : m.classesRemaining === 9999
                          ? "∞"
                          : `${m.classesRemaining}${m.classLimit ? ` / ${m.classLimit}` : ""}`
                      }
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {m.status !== "active" && (
                            <DropdownMenuItem onClick={() => activateMutation.mutate(m.id)}>Activar</DropdownMenuItem>
                          )}
                          {m.status !== "cancelled" && (
                            <DropdownMenuItem className="text-destructive" onClick={() => cancelMutation.mutate(m.id)}>Cancelar</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            }
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

const MembershipsList = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<ClientOption | null>(null);
  const debouncedUserSearch = useDebounce(userSearch, 250);

  const form = useForm<MembershipFormData>({
    resolver: zodResolver(membershipSchema),
    defaultValues: { userId: "", startDate: new Date().toISOString().split("T")[0] },
  });

  const createMutation = useMutation({
    mutationFn: (d: MembershipFormData) => api.post("/memberships", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memberships"] });
      toast({ title: "Membresía asignada" });
      setOpen(false);
      setSelectedUser(null);
      setUserSearch("");
      form.reset({ userId: "", startDate: new Date().toISOString().split("T")[0] });
    },
  });

  const { data: usersData, isFetching: searchingUsers } = useQuery<{ data: ClientOption[] }>({
    queryKey: ["membership-users-search", debouncedUserSearch],
    enabled: open,
    queryFn: async () => (
      await api.get(`/users?role=client${debouncedUserSearch ? `&search=${encodeURIComponent(debouncedUserSearch)}` : ""}`)
    ).data,
  });
  const userOptions = Array.isArray(usersData?.data) ? usersData.data : [];

  const { data: plansData } = useQuery<{ data: { id: string; name: string }[] }>({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/plans")).data,
  });

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <h1 className="text-2xl font-bold">Membresías</h1>
            <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} className="mr-1" />Asignar</Button>
          </div>

          <Tabs defaultValue="all">
            <TabsList className="mb-6">
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="active">Activas</TabsTrigger>
              <TabsTrigger value="expiring">Por vencer</TabsTrigger>
              <TabsTrigger value="pending">Pendientes</TabsTrigger>
            </TabsList>
            <TabsContent value="all"><MembershipTable title="Todas las membresías" /></TabsContent>
            <TabsContent value="active"><MembershipTable status="active" title="Membresías activas" /></TabsContent>
            <TabsContent value="expiring"><MembershipTable status="expiring" title="Por vencer (7 días)" /></TabsContent>
            <TabsContent value="pending"><MembershipTable status="pending_payment" title="Pendientes de pago" /></TabsContent>
          </Tabs>
        </div>

        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setSelectedUser(null);
              setUserSearch("");
              form.reset({ userId: "", startDate: new Date().toISOString().split("T")[0] });
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Asignar membresía</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <div className="space-y-1">
                <Label>Cliente</Label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <Input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-8"
                    placeholder="Buscar por nombre, email o teléfono"
                  />
                </div>
                {selectedUser && (
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{selectedUser.displayName}</p>
                      <p className="text-xs text-muted-foreground">{selectedUser.email ?? "—"}{selectedUser.phone ? ` · ${selectedUser.phone}` : ""}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedUser(null);
                        form.setValue("userId", "", { shouldValidate: true });
                      }}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                )}
                {!selectedUser && (
                  <div className="max-h-40 overflow-auto rounded-md border border-border">
                    {searchingUsers ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
                    ) : userOptions.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                    ) : (
                      userOptions.map((u) => (
                        <button
                          type="button"
                          key={u.id}
                          className="w-full px-3 py-2 text-left hover:bg-white/5 border-b last:border-b-0 border-border"
                          onClick={() => {
                            setSelectedUser(u);
                            form.setValue("userId", u.id, { shouldValidate: true });
                            setUserSearch(u.displayName ?? "");
                          }}
                        >
                          <p className="text-sm font-medium">{u.displayName}</p>
                          <p className="text-xs text-muted-foreground">{u.email ?? "—"}{u.phone ? ` · ${u.phone}` : ""}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label>Plan</Label>
                <Select onValueChange={(v) => form.setValue("planId", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar plan" /></SelectTrigger>
                  <SelectContent>
                    {(Array.isArray(plansData?.data) ? plansData.data : []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Método de pago</Label>
                <Select onValueChange={(v) => form.setValue("paymentMethod", v as "efectivo")}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Fecha de inicio</Label>
                <DatePicker value={form.watch("startDate")} onChange={(v) => form.setValue("startDate", v)} />
              </div>
              {createMutation.isError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {(createMutation.error as any)?.response?.data?.message
                    || (createMutation.error as any)?.response?.data?.error
                    || (createMutation.error as any)?.message
                    || "No se pudo asignar la membresía. Inténtalo de nuevo."}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Asignando…" : "Asignar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
};

export default MembershipsList;
