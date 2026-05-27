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
import { Loader2, Search, CheckCircle2, UserPlus } from "lucide-react";

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
      if (!activeMembership) {
        if (!planId) throw new Error("Selecciona un plan de visita");
        body.sale = { planId, paymentMethod };
      }
      const r = await api.post(`/admin/classes/${classId}/walkin-visit`, body);
      return r.data;
    },
    onSuccess: (data: any) => {
      toast({
        title: "✓ Visitante asignada",
        description: data?.data?.soldOrder
          ? "Reserva creada + pack vendido."
          : "Reserva creada con su pack existente.",
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

  const canSubmit =
    !!name.trim() && !!phone.trim() && waiver &&
    (activeMembership ? true : !!planId);

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

          {/* Venta — solo si NO tiene pack */}
          {!activeMembership && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Venta de pack en este momento
              </p>
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
