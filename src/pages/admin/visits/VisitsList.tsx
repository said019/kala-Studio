import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, UserPlus, Edit, Phone, Mail, ShieldCheck, AlertTriangle } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

interface ActivePack {
  id: string;
  plan_name: string;
  classes_remaining: number | null;
  end_date: string | null;
}

interface Guest {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  has_injury: boolean | null;
  injury_details: string | null;
  practiced_barre_before: boolean | null;
  accepted_waiver_at: string | null;
  host_name: string | null;
  host_phone: string | null;
  active_pack: ActivePack | null;
  updated_at: string;
}

const VisitsList = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 250);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Guest | null>(null);

  const { data, isLoading } = useQuery<{ data: Guest[] }>({
    queryKey: ["guest-profiles", debounced],
    queryFn: async () => (await api.get(`/admin/guest-profiles${debounced ? `?search=${encodeURIComponent(debounced)}` : ""}`)).data,
  });
  const guests = data?.data ?? [];

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [hasInjury, setHasInjury] = useState(false);
  const [injuryDetails, setInjuryDetails] = useState("");
  const [practicedBefore, setPracticedBefore] = useState(false);
  const [waiver, setWaiver] = useState(false);

  const resetForm = () => {
    setName(""); setPhone(""); setEmail("");
    setHasInjury(false); setInjuryDetails("");
    setPracticedBefore(false); setWaiver(false);
    setEditing(null);
  };

  const openEdit = (g: Guest) => {
    setEditing(g);
    setName(g.display_name);
    setPhone(g.phone || "");
    setEmail(g.email || "");
    setHasInjury(g.has_injury === true);
    setInjuryDetails(g.injury_details || "");
    setPracticedBefore(g.practiced_barre_before === true);
    setWaiver(Boolean(g.accepted_waiver_at));
    setFormOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        phone,
        email: email || undefined,
        hasInjury,
        injuryDetails: hasInjury ? (injuryDetails || null) : null,
        practicedBarreBefore: practicedBefore,
        acceptedWaiver: waiver,
      };
      if (editing) {
        return (await api.put(`/admin/guest-profiles/${editing.id}`, body)).data;
      } else {
        return (await api.post("/admin/guest-profiles", body)).data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guest-profiles"] });
      toast({
        title: editing ? "Invitada actualizada" : "Invitada registrada",
        description: name,
      });
      setFormOpen(false);
      resetForm();
    },
    onError: (e: any) =>
      toast({
        title: "Error al guardar",
        description: e?.response?.data?.message || "Inténtalo de nuevo",
        variant: "destructive",
      }),
  });

  const canSubmit = name.trim() && phone.trim() && (editing || waiver);

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Invitadas / Visitas</h1>
              <p className="mt-1 text-sm text-white/45">
                Registro de acompañantes y sus cuestionarios iniciales. El cuestionario se reusa la próxima vez que vengan.
              </p>
            </div>
            <Button
              onClick={() => { resetForm(); setFormOpen(true); }}
              className="bg-gradient-to-r from-[#E9745F] to-[#76214D] text-white"
            >
              <Plus size={14} className="mr-1.5" /> Nueva invitada
            </Button>
          </div>

          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <Input
              className="pl-8 bg-white/[0.04] border-white/[0.08]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono"
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : guests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <UserPlus size={32} className="mx-auto text-white/30 mb-3" />
              <p className="text-sm text-white/60">Aún no hay invitadas registradas.</p>
              <p className="mt-1 text-xs text-white/40">
                Se registran automáticamente al asignarlas a una clase, o aquí con <strong>"Nueva invitada"</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {guests.map((g) => (
                <div
                  key={g.id}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-white">{g.display_name}</p>
                      {g.active_pack && (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                          {g.active_pack.classes_remaining ?? "—"} clase{g.active_pack.classes_remaining === 1 ? "" : "s"} · {g.active_pack.plan_name}
                        </Badge>
                      )}
                      {!g.active_pack && (
                        <Badge variant="outline" className="border-white/10 text-white/40 text-[10px]">
                          Sin pack activo
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-white/55">
                      {g.phone && <span className="flex items-center gap-1"><Phone size={11} /> {g.phone}</span>}
                      {g.email && <span className="flex items-center gap-1"><Mail size={11} /> {g.email}</span>}
                      {g.host_name && <span>Trajo: <strong className="text-white/75">{g.host_name}</strong></span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                      {g.has_injury === true && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2 py-0.5">
                          <AlertTriangle size={9} /> Lesión: {g.injury_details || "—"}
                        </span>
                      )}
                      {g.practiced_barre_before === true && (
                        <span className="rounded-full bg-white/5 border border-white/10 text-white/60 px-2 py-0.5">
                          Ya practicó barre
                        </span>
                      )}
                      {g.accepted_waiver_at && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5">
                          <ShieldCheck size={9} /> Waiver aceptado
                        </span>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openEdit(g)} className="border-white/15">
                    <Edit size={12} className="mr-1.5" /> Editar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Form modal */}
        <Dialog open={formOpen} onOpenChange={(v) => { if (!saveMutation.isPending) { setFormOpen(v); if (!v) resetForm(); } }}>
          <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar invitada" : "Nueva invitada"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Nombre *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Teléfono *</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 dígitos" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email (opcional)</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ej. ana@correo.com" />
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cuestionario</p>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm">¿Tiene lesión o condición física?</Label>
                  <Switch checked={hasInjury} onCheckedChange={setHasInjury} />
                </div>
                {hasInjury && (
                  <Textarea rows={2} value={injuryDetails} onChange={(e) => setInjuryDetails(e.target.value)} placeholder="Detalles relevantes" />
                )}
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm">¿Practicó barre antes?</Label>
                  <Switch checked={practicedBefore} onCheckedChange={setPracticedBefore} />
                </div>
                <div className="flex items-start justify-between gap-2 border-t border-border pt-2.5">
                  <Label className="text-xs leading-relaxed">
                    Confirma que la invitada leyó y aceptó los términos y riesgos de la clase.
                  </Label>
                  <Switch checked={waiver} onCheckedChange={setWaiver} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setFormOpen(false); resetForm(); }} disabled={saveMutation.isPending}>
                Cancelar
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!canSubmit || saveMutation.isPending}
                className="bg-gradient-to-r from-[#E9745F] to-[#76214D] text-white"
              >
                {saveMutation.isPending ? "Guardando…" : (editing ? "Guardar cambios" : "Registrar")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
};

export default VisitsList;
