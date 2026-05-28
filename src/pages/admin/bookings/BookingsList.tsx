import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Users, CheckCircle2,
  Clock, ArrowLeft, UserCheck, UserX, Calendar, Plus, Search, XCircle, Ban, UserPlus,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import VisitAssignDialog from "@/components/admin/VisitAssignDialog";

// ── Types ──────────────────────────────────────────────────────────────────────
interface RosterEntry {
  bookingId: string;
  status: string;
  checkedInAt: string | null;
  userId: string;
  displayName: string;
  email: string;
  phone: string | null;
  planName: string | null;
  classesRemaining: number | null;
}

interface ClientOption {
  id: string;
  displayName: string;
  email?: string;
  phone?: string | null;
}

// ── Status config ──────────────────────────────────────────────────────────────
const statusConfig: Record<string, { label: string; className: string }> = {
  confirmed:  { label: "Confirmada",   className: "text-[#F58A24] border-[#F58A24]/30 bg-[#F58A24]/5" },
  checked_in: { label: "Asistió ✓",   className: "text-[#166534] border-[#166534]/50 bg-[#166534]/15 font-semibold" },
  waitlist:   { label: "Lista espera", className: "text-[#E9745F] border-[#E9745F]/30 bg-[#E9745F]/5" },
  no_show:    { label: "No asistió",   className: "text-[#f87171] border-[#f87171]/30 bg-[#f87171]/5" },
  cancelled:  { label: "Cancelada",    className: "text-white/30 border-white/10 bg-white/3" },
};

// ── Class Roster panel ─────────────────────────────────────────────────────────
const ClassRoster = ({ classId, onBack }: { classId: string; onBack: () => void }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const debouncedMemberSearch = useDebounce(memberSearch, 250);

  // ── Asignar miembro + acompañante (opcional, descuenta 2 créditos) ──
  const [assignWithGuest, setAssignWithGuest] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ClientOption | null>(null);
  const [agGuestPhone, setAgGuestPhone] = useState("");
  const [agGuestName, setAgGuestName] = useState("");
  const [agGuestEmail, setAgGuestEmail] = useState("");
  const [agGuestInjury, setAgGuestInjury] = useState(false);
  const [agGuestInjuryDetails, setAgGuestInjuryDetails] = useState("");
  const [agGuestPracticed, setAgGuestPracticed] = useState(false);
  const [agGuestWaiver, setAgGuestWaiver] = useState(false);
  const [agSearching, setAgSearching] = useState(false);
  const [agFound, setAgFound] = useState(false);

  const resetAssignForm = () => {
    setAssignWithGuest(false);
    setSelectedMember(null);
    setMemberSearch("");
    setAgGuestPhone(""); setAgGuestName(""); setAgGuestEmail("");
    setAgGuestInjury(false); setAgGuestInjuryDetails("");
    setAgGuestPracticed(false); setAgGuestWaiver(false);
    setAgFound(false);
  };

  const searchAdminGuest = async () => {
    if (!agGuestPhone.trim()) return;
    setAgSearching(true);
    try {
      const r = await api.get(`/admin/guest-profiles/search?phone=${encodeURIComponent(agGuestPhone)}`);
      const data = r.data?.data;
      if (data?.profile) {
        const g = data.profile;
        setAgFound(true);
        setAgGuestName(g.display_name || "");
        setAgGuestEmail(g.email || "");
        setAgGuestInjury(g.has_injury === true);
        setAgGuestInjuryDetails(g.injury_details || "");
        setAgGuestPracticed(g.practiced_barre_before === true);
        toast({ title: "Acompañante encontrada", description: "Cuestionario cargado." });
      } else {
        setAgFound(false);
        toast({ title: "Nueva acompañante", description: "Llena el cuestionario abajo." });
      }
    } catch {
      toast({ title: "Error al buscar", variant: "destructive" });
    } finally {
      setAgSearching(false);
    }
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["roster", classId],
    queryFn: async () => (await api.get(`/classes/${classId}/roster`)).data,
    refetchInterval: 15000,
  });

  const classInfo = data?.data?.class ?? null;
  const roster: RosterEntry[] = data?.data?.roster ?? [];
  const { data: usersData, isFetching: searchingUsers } = useQuery<{ data: ClientOption[] }>({
    queryKey: ["booking-assign-users", classId, debouncedMemberSearch],
    enabled: assignOpen,
    queryFn: async () => (
      await api.get(`/users?role=client${debouncedMemberSearch ? `&search=${encodeURIComponent(debouncedMemberSearch)}` : ""}`)
    ).data,
  });
  const userOptions = Array.isArray(usersData?.data) ? usersData.data : [];

  const checkinMutation = useMutation({
    mutationFn: (id: string) => api.put(`/bookings/${id}/check-in`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      toast({ title: "✅ Check-in registrado" });
    },
    onError: () => toast({ title: "Error al hacer check-in", variant: "destructive" }),
  });

  const noShowMutation = useMutation({
    mutationFn: (id: string) => api.put(`/bookings/${id}/no-show`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      toast({ title: "Marcado como no asistió" });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  // Admin cancela reserva (override política 2h, devuelve crédito).
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.delete(`/admin/bookings/${id}`, { data: { reason } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      const restored = res?.data?.data?.credit_restored;
      toast({
        title: "Reserva cancelada",
        description: restored ? "Crédito devuelto a la alumna." : "Cancelada (sin crédito por devolver).",
      });
    },
    onError: (e: any) => toast({
      title: "Error al cancelar",
      description: e?.response?.data?.message || "Inténtalo de nuevo",
      variant: "destructive",
    }),
  });

  // Admin cancela la clase completa (cascada: todos los bookings + créditos + WA).
  const cancelClassMutation = useMutation({
    mutationFn: (reason?: string) =>
      api.put(`/classes/${classId}/cancel`, { reason }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      qc.invalidateQueries({ queryKey: ["classes"] });
      const d = res?.data?.data || {};
      toast({
        title: "Clase cancelada",
        description: `${d.bookings_cancelled ?? 0} reservas canceladas · ${d.credits_restored ?? 0} créditos devueltos · ${d.wa_sent ?? 0} WhatsApps`,
      });
    },
    onError: (e: any) => toast({
      title: "Error",
      description: e?.response?.data?.message || "No se pudo cancelar",
      variant: "destructive",
    }),
  });

  const assignMutation = useMutation({
    mutationFn: (vars: { userId: string; guest?: any }) =>
      api.post("/admin/bookings/assign", { classId, userId: vars.userId, guest: vars.guest }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      const msg = res?.data?.message ?? "Reserva asignada";
      toast({ title: msg });
      setAssignOpen(false);
      resetAssignForm();
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "Error al asignar reserva", variant: "destructive" });
    },
  });

  const checkedIn = roster.filter((r) => r.status === "checked_in").length;
  const confirmed = roster.filter((r) => r.status === "confirmed").length;
  const waitlist  = roster.filter((r) => r.status === "waitlist").length;
  const noShow    = roster.filter((r) => r.status === "no_show").length;

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
      >
        <ArrowLeft size={14} /> Volver al calendario
      </button>

      {/* Class header */}
      {isLoading ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : classInfo && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: classInfo.color || "#76214D" }}
                />
                <h2 className="text-xl font-bold text-white">{classInfo.classTypeName}</h2>
              </div>
              <p className="text-sm text-white/50">
                {classInfo.startsAt
                  ? format(new Date(classInfo.startsAt), "EEEE d 'de' MMMM · HH:mm", { locale: es })
                  : classInfo.date ?? "—"}
              </p>
              <p className="text-xs text-white/35 mt-0.5">Instructor: {classInfo.instructorName}</p>
            </div>
            <button
              onClick={() => refetch()}
              className="text-xs text-[#E9745F]/60 hover:text-[#E9745F] transition-colors flex items-center gap-1"
            >
              <Clock size={11} /> Actualizar
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setAssignOpen(true)}
              data-press
              className="bg-gradient-to-r from-[#E9745F] to-[#76214D] text-white"
            >
              <Plus size={14} className="mr-1" /> Asignar miembro
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setVisitOpen(true)}
              data-press
              className="border-[#778455]/40 bg-[#778455]/5 text-[#778455] hover:bg-[#778455]/10"
            >
              <UserPlus size={14} className="mr-1" /> Asignar visitante
            </Button>
            {(confirmed > 0 || waitlist > 0) && (
              <Button
                size="sm"
                variant="outline"
                data-press
                onClick={() => {
                  const total = confirmed + waitlist;
                  const reason = window.prompt(
                    `Motivo de cancelación (se incluye en el WA a las ${total} alumna${total === 1 ? "" : "s"}):`,
                    "",
                  );
                  if (reason === null) return;
                  if (!window.confirm(
                    `¿Cancelar la clase completa?\n\n${total} reserva${total === 1 ? "" : "s"} se cancelarán y ${confirmed} crédito${confirmed === 1 ? "" : "s"} se devolverán automáticamente. WhatsApp a cada alumna.`,
                  )) return;
                  cancelClassMutation.mutate(reason || undefined);
                }}
                disabled={cancelClassMutation.isPending}
                className="border-[#E9745F]/40 text-[#E9745F]/85 hover:bg-[#E9745F]/10"
              >
                <Ban size={14} className="mr-1" /> Cancelar clase
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Confirmadas", value: confirmed, color: "#F58A24" },
              { label: "Asistieron",  value: checkedIn, color: "#4ade80" },
              { label: "Lista esp.",  value: waitlist,  color: "#E9745F" },
              { label: "No asistió",  value: noShow,    color: "#f87171" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-center">
                <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] text-white/35 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Roster list */}
      <div className="space-y-2">
        {isLoading
          ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
          : roster.length === 0
            ? (
              <div className="text-center py-12 text-white/25 text-sm">
                <Users size={28} className="mx-auto mb-2 opacity-30" />
                No hay reservas para esta clase
              </div>
            )
            : roster.map((entry) => {
              const sc = statusConfig[entry.status] ?? statusConfig.confirmed;
              const canCheckin = entry.status === "confirmed" || entry.status === "waitlist";
              const canNoShow  = entry.status === "confirmed";
              const canCancel  = entry.status === "confirmed" || entry.status === "waitlist";
              return (
                <div
                  key={entry.bookingId}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border transition-all",
                    entry.status === "checked_in"
                      ? "border-[#4ade80]/20 bg-[#4ade80]/5"
                      : entry.status === "no_show"
                        ? "border-[#f87171]/15 bg-[#f87171]/3 opacity-60"
                        : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                    entry.status === "checked_in"
                      ? "bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/30"
                      : "bg-gradient-to-br from-[#76214D]/20 to-[#E9745F]/10 border border-[#76214D]/20 text-[#76214D]"
                  )}>
                    {entry.status === "checked_in"
                      ? <UserCheck size={16} />
                      : entry.displayName?.[0]?.toUpperCase() ?? "?"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-white/90 truncate">{entry.displayName}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-xs text-white/35 truncate">{entry.email}</span>
                      {entry.phone && <span className="text-xs text-white/25">{entry.phone}</span>}
                    </div>
                    {entry.planName && (
                      <p className="text-[10px] text-[#E9745F]/60 mt-0.5">
                        {entry.planName}
                        {entry.classesRemaining !== null
                          ? ` · ${entry.classesRemaining} clases restantes`
                          : " · Ilimitado"}
                      </p>
                    )}
                  </div>

                  {/* Status badge */}
                  <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0", sc.className)}>
                    {sc.label}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {canCheckin && (
                      <button
                        onClick={() => checkinMutation.mutate(entry.bookingId)}
                        disabled={checkinMutation.isPending}
                        title="Check-in"
                        className="w-8 h-8 rounded-lg bg-[#4ade80]/10 border border-[#4ade80]/25 text-[#4ade80] hover:bg-[#4ade80]/20 flex items-center justify-center transition-all disabled:opacity-40"
                      >
                        <CheckCircle2 size={14} />
                      </button>
                    )}
                    {canNoShow && (
                      <button
                        onClick={() => noShowMutation.mutate(entry.bookingId)}
                        disabled={noShowMutation.isPending}
                        title="No asistió"
                        className="w-8 h-8 rounded-lg bg-[#f87171]/8 border border-[#f87171]/20 text-[#f87171]/70 hover:bg-[#f87171]/15 flex items-center justify-center transition-all disabled:opacity-40"
                      >
                        <UserX size={14} />
                      </button>
                    )}
                    {canCancel && (
                      <button
                        data-press
                        onClick={() => {
                          const reason = window.prompt(`Motivo de cancelación (opcional, va al WhatsApp de ${entry.userName || "la alumna"}):`, "");
                          if (reason === null) return; // user cancelled
                          if (!window.confirm(`¿Cancelar reserva de ${entry.userName || "esta alumna"}?\n\nSe devolverá el crédito a su paquete (si aplica).`)) return;
                          cancelMutation.mutate({ id: entry.bookingId, reason: reason || undefined });
                        }}
                        disabled={cancelMutation.isPending}
                        title="Cancelar reserva (devuelve crédito)"
                        className="w-8 h-8 rounded-lg bg-[#E9745F]/8 border border-[#E9745F]/25 text-[#E9745F]/80 hover:bg-[#E9745F]/15 flex items-center justify-center transition-all disabled:opacity-40"
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
        }
      </div>

      <Dialog
        open={assignOpen}
        onOpenChange={(next) => {
          setAssignOpen(next);
          if (!next) resetAssignForm();
        }}
      >
        <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Asignar reserva a miembro</DialogTitle>
          </DialogHeader>

          {/* Toggle "+ acompañante" */}
          <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={assignWithGuest}
              onChange={(e) => { setAssignWithGuest(e.target.checked); if (!e.target.checked) setSelectedMember(null); }}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Llevará acompañante</span>
              <p className="text-[11px] text-muted-foreground">
                Descuenta 2 créditos: 1 del pack regular + 1 del pack de visitas de la socia.
              </p>
            </div>
          </label>

          {/* Paso 1: elegir socia */}
          {(!assignWithGuest || !selectedMember) && (
            <div className="space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                <Input
                  className="pl-8"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Buscar por nombre, email o teléfono"
                />
              </div>
              <div className="max-h-60 overflow-auto rounded-xl border border-border">
                {searchingUsers ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
                ) : userOptions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                ) : (
                  userOptions.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      disabled={assignMutation.isPending}
                      onClick={() => {
                        if (assignWithGuest) {
                          setSelectedMember(u);
                        } else {
                          assignMutation.mutate({ userId: u.id });
                        }
                      }}
                      className="w-full px-3 py-2.5 text-left hover:bg-white/5 border-b last:border-b-0 border-border disabled:opacity-60"
                    >
                      <p className="text-sm font-medium">{u.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.email ?? "—"}
                        {u.phone ? ` · ${u.phone}` : ""}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Paso 2: socia ya elegida + form acompañante */}
          {assignWithGuest && selectedMember && (
            <div className="space-y-3">
              {/* Tarjeta de socia seleccionada */}
              <div className="rounded-xl border border-[#76214D]/40 bg-[#76214D]/10 px-3 py-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-[#E9745F]/80">Socia</p>
                  <p className="text-sm font-medium truncate">{selectedMember.displayName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {selectedMember.email ?? "—"}{selectedMember.phone ? ` · ${selectedMember.phone}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-[11px] text-white/40 hover:text-white"
                  onClick={() => setSelectedMember(null)}
                >
                  Cambiar
                </button>
              </div>

              {/* Form acompañante */}
              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Acompañante
                </p>

                <div className="space-y-1">
                  <label className="text-xs">Teléfono</label>
                  <div className="flex gap-2">
                    <Input
                      value={agGuestPhone}
                      onChange={(e) => { setAgGuestPhone(e.target.value); setAgFound(false); }}
                      placeholder="10 dígitos"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={searchAdminGuest}
                      disabled={!agGuestPhone.trim() || agSearching}
                    >
                      {agSearching ? "…" : <Search size={14} />}
                    </Button>
                  </div>
                  {agFound && (
                    <p className="text-[11px] text-emerald-600">
                      ✓ Ya estuvo antes — cuestionario cargado.
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs">Nombre</label>
                  <Input
                    value={agGuestName}
                    onChange={(e) => setAgGuestName(e.target.value)}
                    placeholder="Nombre y apellido"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs">Email (opcional)</label>
                  <Input
                    type="email"
                    value={agGuestEmail}
                    onChange={(e) => setAgGuestEmail(e.target.value)}
                    placeholder="ej. ana@correo.com"
                  />
                </div>

                <div className="space-y-2 border-t border-border pt-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Cuestionario inicial
                  </p>

                  <label className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                    <span>¿Tiene lesión o condición física?</span>
                    <input
                      type="checkbox"
                      checked={agGuestInjury}
                      onChange={(e) => setAgGuestInjury(e.target.checked)}
                    />
                  </label>
                  {agGuestInjury && (
                    <textarea
                      rows={2}
                      value={agGuestInjuryDetails}
                      onChange={(e) => setAgGuestInjuryDetails(e.target.value)}
                      placeholder="Cuéntanos qué debemos saber"
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs"
                    />
                  )}

                  <label className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                    <span>¿Practicó barre antes?</span>
                    <input
                      type="checkbox"
                      checked={agGuestPracticed}
                      onChange={(e) => setAgGuestPracticed(e.target.checked)}
                    />
                  </label>

                  <label className="flex items-start justify-between gap-2 text-[11px] cursor-pointer border-t border-border pt-2">
                    <span className="leading-relaxed">
                      Confirmo que la acompañante leyó y aceptó los términos y riesgos.
                    </span>
                    <input
                      type="checkbox"
                      checked={agGuestWaiver}
                      onChange={(e) => setAgGuestWaiver(e.target.checked)}
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setAssignOpen(false); resetAssignForm(); }}
                  disabled={assignMutation.isPending}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => assignMutation.mutate({
                    userId: selectedMember.id,
                    guest: {
                      name: agGuestName,
                      phone: agGuestPhone,
                      email: agGuestEmail || undefined,
                      hasInjury: agGuestInjury,
                      injuryDetails: agGuestInjury ? (agGuestInjuryDetails || null) : null,
                      practicedBarreBefore: agGuestPracticed,
                      acceptedWaiver: agGuestWaiver,
                    },
                  })}
                  disabled={
                    !agGuestName.trim() || !agGuestPhone.trim() || !agGuestWaiver ||
                    assignMutation.isPending
                  }
                  className="flex-1 bg-gradient-to-r from-[#E9745F] to-[#76214D] text-white"
                >
                  {assignMutation.isPending ? "Asignando…" : "Confirmar (2 créditos)"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <VisitAssignDialog
        classId={classId}
        open={visitOpen}
        onOpenChange={setVisitOpen}
        onSuccess={() => refetch()}
      />
    </div>
  );
};

// ── Weekly class picker ────────────────────────────────────────────────────────
const ClassPicker = ({ onSelectClass }: { onSelectClass: (id: string) => void }) => {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-classes-week", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () =>
      (await api.get(`/classes?start=${format(weekStart, "yyyy-MM-dd")}&end=${format(weekEnd, "yyyy-MM-dd")}`)).data,
  });
  const classes: any[] = Array.isArray(data?.data) ? data.data : [];

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-5">
      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setWeekStart((w) => subWeeks(w, 1))}
          className="w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 flex items-center justify-center transition-all"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-semibold text-white/70 min-w-[200px] text-center">
          {format(weekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM yyyy", { locale: es })}
        </span>
        <button
          onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          className="w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 flex items-center justify-center transition-all"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          className="ml-2 text-xs text-[#76214D]/60 hover:text-[#76214D] transition-colors"
        >
          Hoy
        </button>
      </div>

      {/* Days */}
      <div className="space-y-4">
        {days.map((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const dayClasses = classes
            .filter((c) => {
              // date field is always YYYY-MM-DD after server normalisation
              const d = (c.date as string)?.slice(0, 10)
                ?? (c.start_time as string)?.slice(0, 10);
              return d === dayStr;
            })
            .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));

          if (!dayClasses.length && !isLoading) return null;

          const isToday = dayStr === todayStr;

          return (
            <div key={dayStr}>
              <div className="flex items-center gap-2 mb-2">
                <p className={cn(
                  "text-xs font-semibold uppercase tracking-wider",
                  isToday ? "text-[#76214D]" : "text-white/30"
                )}>
                  {format(day, "EEEE d", { locale: es })}
                </p>
                {isToday && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#76214D]/15 text-[#76214D] border border-[#76214D]/25 font-semibold">
                    Hoy
                  </span>
                )}
              </div>

              {isLoading ? (
                <Skeleton className="h-16 rounded-xl" />
              ) : (
                <div className="space-y-2">
                  {dayClasses.map((cls) => {
                    const time = cls.start_time
                      ? format(new Date(cls.start_time), "HH:mm")
                      : cls.startTime ?? "—";
                    const capacity = cls.max_capacity ?? 0;
                    const booked   = cls.current_bookings ?? 0;
                    const full     = capacity > 0 && booked >= capacity;
                    const pct      = capacity > 0 ? Math.min(Math.round((booked / capacity) * 100), 100) : 0;

                    return (
                      <button
                        key={cls.id}
                        onClick={() => onSelectClass(cls.id)}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:border-[#76214D]/30 hover:bg-[#76214D]/5 transition-all group text-left"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cls.class_type_color ?? cls.color ?? "#76214D" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white/85 truncate">
                            {cls.class_type_name ?? cls.className ?? "Clase"}
                          </p>
                          <p className="text-xs text-white/35">{time} · {cls.instructor_name ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className={cn("text-sm font-bold", full ? "text-[#f87171]" : "text-white/70")}>
                              {booked}/{capacity}
                            </p>
                            <p className="text-[10px] text-white/25">lugares</p>
                          </div>
                          <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", full ? "bg-[#f87171]" : "bg-[#76214D]")}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <ChevronRight size={14} className="text-white/20 group-hover:text-[#76214D]/60 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!isLoading && classes.length === 0 && (
          <div className="text-center py-16 text-white/25 text-sm">
            <Calendar size={28} className="mx-auto mb-2 opacity-30" />
            No hay clases programadas esta semana
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────────
const BookingsList = () => {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-3xl">
          <div className="mb-7">
            <h1 className="text-3xl font-bold text-white mb-1">Reservas</h1>
            <p className="text-sm text-white/35">
              {selectedClassId
                ? "Lista de alumnos · check-in y asistencia"
                : "Selecciona una clase para ver su lista de alumnos"}
            </p>
          </div>

          {selectedClassId ? (
            <ClassRoster classId={selectedClassId} onBack={() => setSelectedClassId(null)} />
          ) : (
            <ClassPicker onSelectClass={setSelectedClassId} />
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default BookingsList;
