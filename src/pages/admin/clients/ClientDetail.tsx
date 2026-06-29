import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Film, Pencil } from "lucide-react";
import { KALA_RING_COLORS, RingsTriple, type KalaRing } from "@/components/kala/RingsTriple";

// Formatea fecha de nacimiento sin que el timezone corra un día: toma solo
// la parte YYYY-MM-DD y la muestra en es-MX (ej. "19 abr 2000").
const fmtBirthdate = (value?: string | null) => {
  if (!value) return "—";
  const ymd = String(value).slice(0, 10);
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
};

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adjPoints, setAdjPoints] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [communityPoints, setCommunityPoints] = useState("1");
  const [communityType, setCommunityType] = useState("story");
  const [communityDescription, setCommunityDescription] = useState("");

  // Edición de membresía (créditos / estado / vencimiento)
  const [editMem, setEditMem] = useState<any | null>(null);
  const [editCredits, setEditCredits] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editWeeklyExtra, setEditWeeklyExtra] = useState("");

  const { data: user, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => (await api.get(`/users/${id}`)).data,
    enabled: !!id,
  });

  const { data: bookings } = useQuery({
    queryKey: ["client-bookings", id],
    queryFn: async () => (await api.get(`/bookings?userId=${id}`)).data,
    enabled: !!id,
  });

  const { data: memberships } = useQuery({
    queryKey: ["client-memberships", id],
    queryFn: async () => (await api.get(`/memberships?userId=${id}`)).data,
    enabled: !!id,
  });

  const { data: payments } = useQuery({
    queryKey: ["client-payments", id],
    queryFn: async () => (await api.get(`/payments?userId=${id}`)).data,
    enabled: !!id,
  });

  const { data: loyalty, refetch: refetchLoyalty } = useQuery({
    queryKey: ["client-loyalty", id],
    queryFn: async () => (await api.get(`/loyalty/points/${id}`)).data,
    enabled: !!id,
  });

  const { data: rings } = useQuery({
    queryKey: ["client-rings", id],
    queryFn: async () => (await api.get(`/admin/rings/users/${id}`)).data,
    enabled: !!id,
  });

  const { data: vaData } = useQuery({
    queryKey: ["video-access", id],
    queryFn: async () => (await api.get(`/admin/users/${id}/video-access`)).data,
    enabled: !!id,
  });
  const access = vaData?.data;

  const grantVideoMutation = useMutation({
    mutationFn: () => api.post(`/admin/users/${id}/video-access`, { note: "Concedido desde ficha" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video-access", id] });
      qc.invalidateQueries({ queryKey: ["video-access-pending"] });
      qc.invalidateQueries({ queryKey: ["me-video-access"] });
      toast({ title: "✅ Acceso concedido. Le mandamos WA." });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al conceder acceso", variant: "destructive" }),
  });
  const revokeVideoMutation = useMutation({
    mutationFn: () => api.delete(`/admin/users/${id}/video-access`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video-access", id] });
      qc.invalidateQueries({ queryKey: ["video-access-pending"] });
      qc.invalidateQueries({ queryKey: ["me-video-access"] });
      toast({ title: "Acceso revocado." });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al revocar acceso", variant: "destructive" }),
  });

  const adjustMutation = useMutation({
    mutationFn: ({ points, reason, type }: { points: number; reason: string; type: "earn" | "redeem" }) =>
      api.post("/admin/loyalty/adjust", { userId: id, points, reason, type }),
    onSuccess: () => {
      refetchLoyalty();
      qc.invalidateQueries({ queryKey: ["client-loyalty", id] });
      toast({ title: "✅ Puntos ajustados" });
      setAdjPoints("");
      setAdjReason("");
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al ajustar puntos", variant: "destructive" }),
  });

  const recalcMutation = useMutation({
    mutationFn: () => api.post(`/admin/loyalty/recalculate/${id}`),
    onSuccess: (res: any) => {
      refetchLoyalty();
      qc.invalidateQueries({ queryKey: ["client-loyalty", id] });
      const msg = res?.data?.data?.message ?? "Recalculado";
      toast({ title: `✅ ${msg}` });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al recalcular", variant: "destructive" }),
  });

  const communityMutation = useMutation({
    mutationFn: () => api.post("/admin/rings/community-events", {
      userId: id,
      pointsAwarded: Math.max(1, Number(communityPoints) || 1),
      eventType: communityType,
      description: communityDescription || "Acción de comunidad",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-rings", id] });
      qc.invalidateQueries({ queryKey: ["me-rings"] });
      toast({ title: "✅ Conexión actualizada" });
      setCommunityPoints("1");
      setCommunityDescription("");
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al sumar conexión", variant: "destructive" }),
  });

  const openEditMem = (m: any) => {
    setEditMem(m);
    setEditCredits(m.classesRemaining == null ? "" : String(m.classesRemaining));
    setEditStatus(m.status ?? "active");
    setEditEndDate(m.endDate ? String(m.endDate).slice(0, 10) : "");
    setEditWeeklyExtra(String(m.weeklyExtraClasses ?? 0));
  };

  const grantWeeklyExtraMutation = useMutation({
    mutationFn: (membershipId: string) =>
      api.post(`/admin/memberships/${membershipId}/grant-weekly-extra`, { amount: 1 }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["client-memberships", id] });
      toast({ title: res?.data?.message ?? "+1 clase esta semana" });
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? "Error al regalar clase",
      variant: "destructive",
    }),
  });

  const editMemMutation = useMutation({
    mutationFn: () => {
      const body: any = { status: editStatus };
      // Vacío = sin tope (ilimitado). El backend trata null como "no cambiar",
      // así que enviamos 9999 para representar ilimitado de forma consistente.
      body.classesRemaining = editCredits.trim() === "" ? 9999 : Math.max(0, Number(editCredits));
      if (editEndDate) body.endDate = editEndDate;
      // Solo mandar el extra si la admin lo tocó (distinto al valor inicial).
      // Si no lo manda, el backend auto-bumpeará si subió classesRemaining.
      if (editWeeklyExtra.trim() !== "" && Number(editWeeklyExtra) !== Number(editMem.weeklyExtraClasses ?? 0)) {
        body.weeklyExtraClasses = Math.max(0, Number(editWeeklyExtra));
      }
      return api.put(`/memberships/${editMem.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-memberships", id] });
      qc.invalidateQueries({ queryKey: ["client", id] });
      toast({ title: "✅ Membresía actualizada" });
      setEditMem(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al actualizar", variant: "destructive" }),
  });

  const u = user?.data ?? user;
  const ringData = rings?.data ?? rings ?? {};
  const currentRing = ringData.current ?? null;
  // Datos para el anillo animado (mismo componente que ve la clienta en su pase).
  const ringPct = (p: number, g: number) =>
    Number(g) > 0 ? Math.min(100, Math.max(0, Math.round((Number(p) / Number(g)) * 100))) : 0;
  const ringMetrics: KalaRing[] = [
    {
      key: "constancia",
      label: "Constancia",
      value: `${currentRing?.constancia_progress ?? 0}/${currentRing?.constancia_goal ?? 1}`,
      goalLabel: "clases asistidas",
      progress: ringPct(currentRing?.constancia_progress ?? 0, currentRing?.constancia_goal ?? 1),
      ...KALA_RING_COLORS.constancia,
    },
    {
      key: "esfuerzo",
      label: "Esfuerzo",
      value: `${currentRing?.esfuerzo_progress ?? 0}/${currentRing?.esfuerzo_goal ?? 1}`,
      goalLabel: "retos o intensas",
      progress: ringPct(currentRing?.esfuerzo_progress ?? 0, currentRing?.esfuerzo_goal ?? 1),
      ...KALA_RING_COLORS.esfuerzo,
    },
    {
      key: "conexion",
      label: "Conexión",
      value: `${currentRing?.conexion_progress ?? 0}/${currentRing?.conexion_goal ?? 10}`,
      goalLabel: "puntos de comunidad",
      progress: ringPct(currentRing?.conexion_progress ?? 0, currentRing?.conexion_goal ?? 10),
      ...KALA_RING_COLORS.conexion,
    },
  ];
  const ringsClosed = Number(
    currentRing?.rings_closed ?? ringMetrics.filter((r) => r.progress >= 100).length,
  );
  const communityEvents = Array.isArray(ringData.communityEvents) ? ringData.communityEvents : [];

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          {isLoading ? (
            <Skeleton className="h-10 w-60 mb-4" />
          ) : (
            <div className="mb-6">
              <h1 className="text-2xl font-bold">{u?.displayName}</h1>
              <p className="text-muted-foreground text-sm">{u?.email} · {u?.phone}</p>
            </div>
          )}

          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">Perfil</TabsTrigger>
              <TabsTrigger value="memberships">Membresías</TabsTrigger>
              <TabsTrigger value="bookings">Reservas</TabsTrigger>
              <TabsTrigger value="payments">Pagos</TabsTrigger>
              <TabsTrigger value="loyalty">Lealtad</TabsTrigger>
              <TabsTrigger value="rings">Anillos</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-4">
              {isLoading ? <Skeleton className="h-40 w-full" /> : (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div><span className="font-medium">Fecha de nacimiento:</span> {fmtBirthdate(u?.dateOfBirth)}</div>
                    <div><span className="font-medium">Emergencia:</span> {u?.emergencyContactName ?? "—"} {u?.emergencyContactPhone ?? ""}</div>
                    <div className="col-span-2"><span className="font-medium">Notas de salud:</span> {u?.healthNotes ?? "—"}</div>
                  </div>

                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h3 className="text-sm font-semibold">Cuestionario de ingreso</h3>
                    {u?.onboardingCompleted === false ? (
                      <p className="text-sm text-muted-foreground">
                        La alumna aún no ha respondido el cuestionario.
                      </p>
                    ) : (
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">¿Tiene lesión o condición?</span>
                          {u?.hasInjury == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : u?.hasInjury ? (
                            <Badge variant="destructive">Sí — revisar</Badge>
                          ) : (
                            <Badge variant="outline">No</Badge>
                          )}
                        </div>
                        {u?.hasInjury && (
                          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                            <p className="text-xs font-medium text-destructive mb-1">Lesión / condición reportada</p>
                            <p className="whitespace-pre-wrap">{u?.injuryDetails || "Sin detalle."}</p>
                          </div>
                        )}
                        <div>
                          <span className="font-medium">¿Había practicado barre antes?</span>{" "}
                          {u?.practicedBarreBefore == null
                            ? "—"
                            : u?.practicedBarreBefore
                              ? "Sí"
                              : "No, es nueva"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="memberships" className="mt-4 space-y-6">
              <Table>
                <TableHeader><TableRow><TableHead>Plan</TableHead><TableHead>Estado</TableHead><TableHead>Vence</TableHead><TableHead>Clases</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {(Array.isArray(memberships?.data) ? memberships.data : []).map((m: any) => {
                    const isExpired = Boolean(m.isExpired) || m.status === "expired";
                    const isActive = m.status === "active" && !isExpired;
                    const hasWeeklyLimit = m.weeklyClassLimit != null && m.weeklyClassLimit > 0;
                    const weeklyExtra = Number(m.weeklyExtraClasses ?? 0);
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div>{m.planName ?? m.planId}</div>
                          {hasWeeklyLimit && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Tope: {m.weeklyClassLimit}/sem
                              {weeklyExtra > 0 && (
                                <span className="ml-1 text-emerald-500">+ {weeklyExtra} extra</span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{isExpired ? <Badge variant="destructive">Vencida</Badge> : <Badge>{m.status}</Badge>}</TableCell>
                        <TableCell>{m.endDate ? new Date(m.endDate).toLocaleDateString("es-MX") : "—"}</TableCell>
                        <TableCell className={isExpired ? "text-muted-foreground line-through" : undefined}>
                          {m.classesRemaining == null || Number(m.classesRemaining) >= 9999 ? "∞" : m.classesRemaining}
                          {isExpired && <span className="ml-1 text-[10px] no-underline">(vencida)</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            {isActive && hasWeeklyLimit && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                                onClick={() => grantWeeklyExtraMutation.mutate(m.id)}
                                disabled={grantWeeklyExtraMutation.isPending}
                                title="Regalarle 1 clase esta semana (sube créditos y permite saltar el tope semanal)"
                              >
                                +1 esta semana
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => openEditMem(m)}>
                              <Pencil size={12} className="mr-1" /> Editar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(!Array.isArray(memberships?.data) || memberships.data.length === 0) && (
                    <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground py-6 text-center">Sin membresías.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="rounded-xl border border-border p-4 max-w-xl space-y-3">
                <div className="flex items-center gap-2">
                  <Film size={15} className="text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Acceso a biblioteca de videos</h3>
                </div>
                {!access ? (
                  <Skeleton className="h-12" />
                ) : access.state === "unlocked" ? (
                  <div className="space-y-2">
                    <Badge className="bg-green-600 hover:bg-green-600">Con acceso</Badge>
                    <p className="text-xs text-muted-foreground">
                      {access.full_library
                        ? "Tiene un plan con biblioteca completa."
                        : "Acceso concedido manualmente (cortesía)."}
                    </p>
                    {access.has_grant && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs"
                        onClick={() => {
                          if (window.confirm("¿Revocar el acceso de cortesía a la biblioteca de videos?")) {
                            revokeVideoMutation.mutate();
                          }
                        }}
                        disabled={revokeVideoMutation.isPending}
                      >
                        Revocar acceso de cortesía
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Badge variant="outline">Sin acceso</Badge>
                    <p className="text-xs text-muted-foreground">
                      No tiene plan de biblioteca completa. Puedes concederle acceso de cortesía a toda la biblioteca.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => grantVideoMutation.mutate()}
                      disabled={grantVideoMutation.isPending}
                    >
                      Conceder acceso de cortesía
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="bookings" className="mt-4">
              <Table>
                <TableHeader><TableRow><TableHead>Clase</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(Array.isArray(bookings?.data) ? bookings.data : []).map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.className ?? b.classId}</TableCell>
                      <TableCell>{b.startTime ? new Date(b.startTime).toLocaleString("es-MX", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                      <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="payments" className="mt-4">
              <Table>
                <TableHeader><TableRow><TableHead>Monto</TableHead><TableHead>Método</TableHead><TableHead>Fecha</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(Array.isArray(payments?.data) ? payments.data : []).map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>${p.total_amount ?? p.amount}</TableCell>
                      <TableCell>{p.method}</TableCell>
                      <TableCell>{p.createdAt ? new Date(p.createdAt).toLocaleDateString("es-MX") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="loyalty" className="mt-4 space-y-6">
              <div className="flex items-end gap-4">
                <div>
                  <div className="text-4xl font-bold">{(loyalty as any)?.data?.balance ?? (loyalty as any)?.balance ?? (loyalty as any)?.points ?? 0}</div>
                  <p className="text-muted-foreground text-sm">puntos acumulados</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={recalcMutation.isPending}
                  onClick={() => recalcMutation.mutate()}
                >
                  {recalcMutation.isPending ? "Recalculando…" : "🔄 Recalcular desde membresías"}
                </Button>
              </div>
              <div className="rounded-xl border p-4 space-y-3 max-w-sm">
                <p className="text-sm font-semibold">Ajustar puntos manualmente</p>
                <div className="space-y-1">
                  <Label>Puntos (número positivo)</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Ej: 150"
                    value={adjPoints}
                    onChange={(e) => setAdjPoints(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Motivo</Label>
                  <Input
                    placeholder="Ej: Membresía no contabilizada"
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    disabled={!adjPoints || adjustMutation.isPending}
                    onClick={() => adjustMutation.mutate({ points: Math.abs(Number(adjPoints)), reason: adjReason || "Ajuste manual", type: "earn" })}
                  >
                    + Agregar puntos
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!adjPoints || adjustMutation.isPending}
                    onClick={() => adjustMutation.mutate({ points: Math.abs(Number(adjPoints)), reason: adjReason || "Ajuste manual", type: "redeem" })}
                  >
                    − Deducir puntos
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="rings" className="mt-4 space-y-6">
              {/* Anillo animado (igual al que ve la clienta en su pase) */}
              <div className="flex flex-col items-center gap-3 py-2">
                <RingsTriple
                  rings={ringMetrics}
                  centerLabel="esta semana"
                  centerValue={`${ringsClosed}/3`}
                  centerSub={ringsClosed >= 3 ? "¡Tres anillos cerrados!" : "anillos cerrados"}
                />
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
                  {ringMetrics.map((r) => (
                    <span key={r.key} className="inline-flex items-center gap-1.5 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                      {r.label} {r.value}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-2xl border border-border bg-secondary p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cerrados</p>
                  <p className="mt-2 text-3xl font-bold">{currentRing?.rings_closed ?? 0}/3</p>
                </div>
                <div className="rounded-2xl border border-[#76214D]/25 bg-[#76214D]/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#76214D]">Constancia</p>
                  <p className="mt-2 text-2xl font-bold">{currentRing?.constancia_progress ?? 0}/{currentRing?.constancia_goal ?? 1}</p>
                </div>
                <div className="rounded-2xl border border-[#778455]/25 bg-[#778455]/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#778455]">Esfuerzo</p>
                  <p className="mt-2 text-2xl font-bold">{currentRing?.esfuerzo_progress ?? 0}/{currentRing?.esfuerzo_goal ?? 1}</p>
                </div>
                <div className="rounded-2xl border border-[#F58A24]/25 bg-[#F58A24]/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#F58A24]">Conexión</p>
                  <p className="mt-2 text-2xl font-bold">{currentRing?.conexion_progress ?? 0}/{currentRing?.conexion_goal ?? 10}</p>
                </div>
              </div>

              <div className="rounded-xl border p-4 space-y-3 max-w-xl">
                <p className="text-sm font-semibold">Sumar puntos de Conexión</p>
                <div className="grid gap-3 sm:grid-cols-[110px_160px_1fr]">
                  <div className="space-y-1">
                    <Label>Puntos</Label>
                    <Input
                      type="number"
                      min="1"
                      value={communityPoints}
                      onChange={(e) => setCommunityPoints(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo</Label>
                    <Input
                      value={communityType}
                      onChange={(e) => setCommunityType(e.target.value)}
                      placeholder="story, invitada"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Descripción</Label>
                    <Input
                      value={communityDescription}
                      onChange={(e) => setCommunityDescription(e.target.value)}
                      placeholder="Ej: Story etiquetando a Kala"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={communityMutation.isPending || !id}
                  onClick={() => communityMutation.mutate()}
                >
                  {communityMutation.isPending ? "Guardando..." : "Sumar a Conexión"}
                </Button>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3">Eventos recientes de comunidad</h3>
                <Table>
                  <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Puntos</TableHead><TableHead>Descripción</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {communityEvents.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">Sin eventos registrados.</TableCell></TableRow>
                    ) : communityEvents.map((event: any) => (
                      <TableRow key={event.id}>
                        <TableCell>{event.occurred_at ? new Date(event.occurred_at).toLocaleDateString("es-MX") : "—"}</TableCell>
                        <TableCell><Badge variant="outline">{event.event_type}</Badge></TableCell>
                        <TableCell>{event.points_awarded}</TableCell>
                        <TableCell>{event.description || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Editar membresía (créditos / estado / vencimiento) ── */}
        <Dialog open={!!editMem} onOpenChange={(v) => !v && setEditMem(null)}>
          <DialogContent className="bg-[#0f0518] border-white/10 text-white max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Editar membresía</DialogTitle>
            </DialogHeader>
            {editMem && (
              <div className="space-y-4">
                <p className="text-sm text-white/55">
                  {editMem.planName ?? editMem.planId}
                </p>

                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Clases restantes</Label>
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="Vacío = ilimitado"
                    className="bg-white/[0.04] border-white/[0.08] text-white"
                    value={editCredits}
                    onChange={(e) => setEditCredits(e.target.value)}
                  />
                  <p className="text-[10px] text-white/35">
                    Ajusta los créditos de la alumna (sirve para paquetes por semana o por mes). Déjalo vacío para ilimitado.
                  </p>
                </div>

                {/* Extra semanal: permite reservar más allá del tope del plan */}
                {editMem?.weeklyClassLimit ? (
                  <div className="space-y-1">
                    <Label className="text-white/60 text-xs">
                      Clases extra esta semana
                      <span className="ml-1 text-white/35 font-normal">
                        (sobre el tope de {editMem.weeklyClassLimit}/sem)
                      </span>
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="0"
                      className="bg-white/[0.04] border-white/[0.08] text-white"
                      value={editWeeklyExtra}
                      onChange={(e) => setEditWeeklyExtra(e.target.value)}
                    />
                    <p className="text-[10px] text-white/35">
                      Permite reservar esta semana aunque ya consumió sus {editMem.weeklyClassLimit} clases.
                      Si subes "Clases restantes" sin tocar este campo, se ajusta solo por la misma diferencia.
                    </p>
                  </div>
                ) : null}

                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Estado</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0f0518] border-white/10">
                      {[
                        ["active", "Activa"],
                        ["paused", "Pausada"],
                        ["expired", "Vencida"],
                        ["cancelled", "Cancelada"],
                        ["pending_activation", "Por activar"],
                        ["pending_payment", "Pago pendiente"],
                      ].map(([v, label]) => (
                        <SelectItem key={v} value={v} className="text-white">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Vence (opcional)</Label>
                  <Input
                    type="date"
                    className="bg-white/[0.04] border-white/[0.08] text-white"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" className="border-white/10 text-white/60 hover:bg-white/5" onClick={() => setEditMem(null)}>
                Cancelar
              </Button>
              <Button
                className="bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white border-0"
                disabled={editMemMutation.isPending}
                onClick={() => editMemMutation.mutate()}
              >
                {editMemMutation.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
};

export default ClientDetail;
