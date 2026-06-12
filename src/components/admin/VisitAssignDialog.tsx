import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, CheckCircle2, UserPlus, X } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

interface VisitPlan {
  id: string;
  name: string;
  price: number;
  classLimit: number | null;
}

interface GuestProfile {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  has_injury: boolean | null;
  injury_details: string | null;
  practiced_barre_before: boolean | null;
}

interface ActiveMembership {
  id: string;
  classes_remaining: number | null;
  plan_name: string;
  class_limit: number | null;
  end_date: string | null;
}

interface HostOption {
  id: string;
  displayName: string;
  display_name?: string;
  email?: string;
  phone?: string | null;
}

interface Props {
  classId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Modal "Asignar visitante" — flujo completo en un paso:
 *  1. Admin escribe el teléfono. Click "Buscar" → autocompleta si la invitada
 *     ya estuvo antes (su cuestionario y pack activo aparecen).
 *  2. Si es nueva: llena nombre + cuestionario inicial (igual al de socias).
 *  3. Si NO tiene pack activo: elige plan de visita + método de pago.
 *  4. "Confirmar" llama a POST /admin/classes/:id/walkin-visit que registra
 *     la reserva (y vende el pack si hace falta).
 */
export const VisitAssignDialog = ({ classId, open, onOpenChange, onSuccess }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Form
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hasInjury, setHasInjury] = useState(false);
  const [injuryDetails, setInjuryDetails] = useState("");
  const [practicedBefore, setPracticedBefore] = useState(false);
  const [waiver, setWaiver] = useState(false);

  // Lookup / sale
  const [foundGuest, setFoundGuest] = useState<GuestProfile | null>(null);
  const [activeMembership, setActiveMembership] = useState<ActiveMembership | null>(null);
  const [searched, setSearched] = useState(false);

  const [planId, setPlanId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "card">("cash");

  // Anfitriona (socia que la invita). Si se selecciona, el crédito se descuenta
  // de SU pack de visitas en lugar del de la invitada.
  const [host, setHost] = useState<HostOption | null>(null);
  const [hostSearch, setHostSearch] = useState("");
  // Premio: +1 punto de Conexión (anillos) a la anfitriona por traer amiga.
  const [hostRewardRings, setHostRewardRings] = useState(true);
  const debouncedHostSearch = useDebounce(hostSearch, 250);
  const { data: hostsData, isFetching: searchingHosts } = useQuery<{ data: HostOption[] }>({
    queryKey: ["visit-host-search", debouncedHostSearch],
    enabled: open && !host && debouncedHostSearch.trim().length >= 2,
    queryFn: async () =>
      (await api.get(`/users?role=client&search=${encodeURIComponent(debouncedHostSearch)}`)).data,
  });
  const hostOptions = (Array.isArray(hostsData?.data) ? hostsData!.data : []).map((u: any) => ({
    id: u.id,
    displayName: u.display_name ?? u.displayName ?? "—",
    email: u.email,
    phone: u.phone,
  }));

  // Carga planes is_visit_pack
  const { data: plansData } = useQuery<{ data: any[] }>({
    queryKey: ["visit-plans"],
    queryFn: async () => (await api.get("/plans")).data,
    enabled: open,
  });
  const visitPlans: VisitPlan[] = (Array.isArray(plansData?.data) ? plansData.data : [])
    .filter((p: any) => p.is_visit_pack === true || p.isVisitPack === true)
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price ?? 0),
      classLimit: p.class_limit ?? p.classLimit ?? null,
    }));

  const resetAll = () => {
    setPhone(""); setName(""); setEmail("");
    setHasInjury(false); setInjuryDetails(""); setPracticedBefore(false);
    setWaiver(false);
    setFoundGuest(null); setActiveMembership(null); setSearched(false);
    setPlanId(""); setPaymentMethod("cash");
    setHost(null); setHostSearch("");
    setHostRewardRings(true);
  };

  const searchMutation = useMutation({
    mutationFn: async (phoneArg: string) => {
      const r = await api.get(`/admin/guest-profiles/search?phone=${encodeURIComponent(phoneArg)}`);
      return r.data?.data ?? null;
    },
    onSuccess: (data: any) => {
      setSearched(true);
      if (data?.profile) {
        const g: GuestProfile = data.profile;
        setFoundGuest(g);
        setName(g.display_name || "");
        setEmail(g.email || "");
        setHasInjury(g.has_injury === true);
        setInjuryDetails(g.injury_details || "");
        setPracticedBefore(g.practiced_barre_before === true);
        setActiveMembership(data.activeMembership ?? null);
        toast({
          title: "Visitante encontrada",
          description: data.activeMembership
            ? `Pack activo: ${data.activeMembership.plan_name} (${data.activeMembership.classes_remaining ?? "—"} clases restantes)`
            : "Sin pack activo. Tendrás que venderle uno.",
        });
      } else {
        setFoundGuest(null);
        setActiveMembership(null);
        toast({ title: "No encontrada", description: "Es nueva. Llena el cuestionario abajo." });
      }
    },
    onError: () => toast({ title: "Error al buscar", variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        profile: {
          name,
          phone,
          email: email || undefined,
          hasInjury,
          injuryDetails: hasInjury ? (injuryDetails || null) : null,
          practicedBarreBefore: practicedBefore,
          acceptedWaiver: waiver,
        },
      };
      if (host?.id) {
        body.hostUserId = host.id;
        body.hostConexionPoints = hostRewardRings ? 1 : 0;
      }
      // Si la invitada tiene pack activo propio NO necesitamos vender; pero si
      // la anfitriona tiene pack de visitas, tampoco hace falta venta (se
      // descuenta del host). Mandamos `sale` solo si no hay ninguna de las dos.
      if (!activeMembership && !host) {
        if (!planId) throw new Error("Selecciona un plan de visita");
        body.sale = { planId, paymentMethod };
      } else if (!activeMembership && host && planId) {
        // Si la admin igual eligió un plan como fallback (por si el host no
        // tiene créditos), lo mandamos — el backend lo usará si no encuentra
        // pack del host ni de la invitada.
        body.sale = { planId, paymentMethod };
      }
      const r = await api.post(`/admin/classes/${classId}/walkin-visit`, body);
      return r.data;
    },
    onSuccess: (data: any) => {
      const chargedHost = data?.data?.chargedHostUserId;
      const conexion = Number(data?.data?.conexionPointsAwarded || 0);
      const conexionNote = conexion > 0 ? ` +${conexion} punto de Conexión para ella 💜` : "";
      toast({
        title: "✓ Visitante asignada",
        description: chargedHost
          ? `Reserva creada. Crédito descontado del pack de visitas de ${host?.displayName ?? "la anfitriona"}.${conexionNote}`
          : data?.data?.soldOrder
            ? `Reserva creada + pack vendido.${conexionNote}`
            : `Reserva creada con su pack existente.${conexionNote}`,
      });
      qc.invalidateQueries({ queryKey: ["class-roster-sheet"] });
      qc.invalidateQueries({ queryKey: ["roster"] });
      qc.invalidateQueries({ queryKey: ["classes"] });
      onSuccess?.();
      resetAll();
      onOpenChange(false);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || "Error al asignar";
      toast({ title: "No se asignó", description: msg, variant: "destructive" });
    },
  });

  // Si la invitada tiene su pack o viene con anfitriona, no exigimos planId.
  // Si NO trae nada (sin pack ni anfitriona), se vuelve venta obligatoria.
  const canSubmit =
    !!name.trim() && !!phone.trim() && waiver &&
    (activeMembership || host ? true : !!planId);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitMutation.isPending && !searchMutation.isPending) {
          if (!v) resetAll();
          onOpenChange(v);
        }
      }}
    >
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={18} /> Asignar visitante
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Teléfono + buscar */}
          <div className="space-y-1">
            <Label>Teléfono *</Label>
            <div className="flex gap-2">
              <Input
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setSearched(false); }}
                placeholder="ej. 4441234567"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => searchMutation.mutate(phone)}
                disabled={!phone.trim() || searchMutation.isPending}
              >
                {searchMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              </Button>
            </div>
            {searched && (
              <p className="text-[11px] text-muted-foreground">
                {foundGuest
                  ? `Visitante existente — su cuestionario está pre-cargado.`
                  : `Nueva visitante — llena el cuestionario abajo.`}
              </p>
            )}
          </div>

          {/* Pack activo */}
          {activeMembership && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <CheckCircle2 size={14} /> Pack activo
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeMembership.plan_name} — {activeMembership.classes_remaining ?? "—"} clase{activeMembership.classes_remaining === 1 ? "" : "s"} restante{activeMembership.classes_remaining === 1 ? "" : "s"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Se descuenta 1 al confirmar.
              </p>
            </div>
          )}

          {/* Anfitriona (socia que la invita) — el crédito se descuenta de SU pack de visitas */}
          <div className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Trajo (opcional)
              </Label>
              {host && (
                <button
                  type="button"
                  onClick={() => { setHost(null); setHostSearch(""); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <X size={11} /> quitar
                </button>
              )}
            </div>
            {host ? (
              <div className="rounded-lg bg-[#76214D]/5 border border-[#76214D]/20 px-3 py-2 text-sm space-y-2">
                <div>
                  <p className="font-medium">{host.displayName}</p>
                  {(host.email || host.phone) && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {[host.email, host.phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="text-[11px] text-[#76214D] mt-1">
                    El crédito se descuenta del pack de visitas de {host.displayName.split(" ")[0]}.
                  </p>
                </div>
                <label className="flex items-start gap-2 cursor-pointer border-t border-[#76214D]/15 pt-2 text-[11px]">
                  <input
                    type="checkbox"
                    checked={hostRewardRings}
                    onChange={(e) => setHostRewardRings(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    💜 Premiar a {host.displayName.split(" ")[0]} con <strong>+1 punto de Conexión</strong> (anillos) por traer amiga
                  </span>
                </label>
              </div>
            ) : (
              <>
                <Input
                  value={hostSearch}
                  onChange={(e) => setHostSearch(e.target.value)}
                  placeholder="Buscar socia por nombre o teléfono…"
                />
                {hostSearch.trim().length >= 2 && (
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-card">
                    {searchingHosts ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                        <Loader2 size={11} className="animate-spin" /> Buscando…
                      </p>
                    ) : hostOptions.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                    ) : (
                      hostOptions.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => { setHost(u); setHostSearch(""); }}
                          className="block w-full text-left px-3 py-2 hover:bg-muted/60 border-b border-border last:border-b-0"
                        >
                          <p className="text-sm font-medium">{u.displayName}</p>
                          {(u.email || u.phone) && (
                            <p className="text-[11px] text-muted-foreground">
                              {[u.email, u.phone].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Si llenas esto, el crédito se descuenta del pack de visitas de la socia, no de la invitada.
                </p>
              </>
            )}
          </div>

          {/* Nombre + email */}
          <div className="space-y-1">
            <Label>Nombre *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la visitante" />
          </div>
          <div className="space-y-1">
            <Label>Email (opcional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ej. ana@correo.com" />
          </div>

          {/* Cuestionario */}
          <div className="rounded-xl border border-border p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cuestionario inicial</p>

            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm">¿Tiene alguna lesión o condición física?</Label>
              <Switch checked={hasInjury} onCheckedChange={setHasInjury} />
            </div>
            {hasInjury && (
              <Textarea
                rows={2}
                value={injuryDetails}
                onChange={(e) => setInjuryDetails(e.target.value)}
                placeholder="Cuéntanos qué debemos saber (lesión, cirugía, embarazo, etc.)"
              />
            )}

            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm">¿Practicó barre antes?</Label>
              <Switch checked={practicedBefore} onCheckedChange={setPracticedBefore} />
            </div>

            <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
              <Label className="text-xs">
                Confirmo que la visitante leyó y aceptó los términos y riesgos de la clase.
              </Label>
              <Switch checked={waiver} onCheckedChange={setWaiver} />
            </div>
          </div>

          {/* Venta — visible siempre que la visitante NO tenga pack propio.
              Con anfitriona seleccionada es OPCIONAL: el crédito sale del
              pack de visitas de la socia, y este plan solo se usa como
              fallback si la socia no tiene créditos. */}
          {!activeMembership && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                {host ? "Venta de pack (opcional)" : "Venta de pack en este momento"}
              </p>
              {host && (
                <p className="text-[11px] text-muted-foreground">
                  El crédito se descuenta del pack de visitas de {host.displayName.split(" ")[0]}.
                  Elige un plan solo como respaldo por si no tiene créditos.
                </p>
              )}
              <div className="space-y-1">
                <Label className="text-sm">Plan de visita</Label>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder={visitPlans.length === 0 ? "Sin planes (márcalos en /planes)" : "Seleccionar plan"} />
                  </SelectTrigger>
                  <SelectContent>
                    {visitPlans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {p.classLimit ?? "?"} clases · ${p.price.toLocaleString("es-MX")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {visitPlans.length === 0 && (
                  <p className="text-[11px] text-destructive">
                    Marca al menos un plan como "Paquete de visitas" en <strong>Planes</strong>.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Método de pago</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={!canSubmit || submitMutation.isPending}
          >
            {submitMutation.isPending ? <><Loader2 size={14} className="animate-spin mr-2" />Asignando…</> : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VisitAssignDialog;
