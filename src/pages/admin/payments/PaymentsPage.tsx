import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, User, Package, CheckCircle2, CreditCard, Banknote, ArrowRight, ChevronLeft, History, Sparkles } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value: "cash", label: "Efectivo", icon: Banknote },
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "transfer", label: "Transferencia", icon: ArrowRight },
];

const STEP_META = [
  { label: "Buscar cliente", icon: User },
  { label: "Elegir plan", icon: Package },
  { label: "Confirmar", icon: CheckCircle2 },
];

// ── Category groups for plan display ──────────────────────
function groupPlans(plans: any[]) {
  const groups: Record<string, any[]> = { jumping: [], pilates: [], mixto: [], otro: [] };
  for (const p of plans) {
    const cat = p.classCategory ?? p.class_category ?? "";
    if (cat === "barre") groups.jumping.push(p);
    else if (cat === "pilates") groups.pilates.push(p);
    else if (cat === "mixto") groups.mixto.push(p);
    else if (cat === "all") groups.otro.push(p);
    else if (p.name?.toLowerCase().includes("barre") || p.name?.toLowerCase().includes("jump")) groups.jumping.push(p);
    else if (p.name?.toLowerCase().includes("pilates")) groups.pilates.push(p);
    else if (p.name?.toLowerCase().includes("mixto")) groups.mixto.push(p);
    else groups.otro.push(p);
  }
  return groups;
}

// ── Step indicator ────────────────────────────────────────
const StepBar = ({ step }: { step: number }) => (
  <div className="flex items-center gap-0 mb-8">
    {STEP_META.map((s, i) => {
      const done = step > i + 1;
      const active = step === i + 1;
      return (
        <div key={i} className="flex items-center gap-0">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
            done && "bg-[#76214D]/20 text-[#76214D] border border-[#76214D]/30",
            active && "bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white shadow-[0_0_16px_rgba(118,33,77,0.4)]",
            !done && !active && "bg-white/5 text-white/25 border border-white/10"
          )}>
            <span className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
              done && "bg-[#76214D] text-white",
              active && "bg-white/20 text-white",
              !done && !active && "bg-white/10 text-white/30"
            )}>
              {done ? "✓" : i + 1}
            </span>
            {s.label}
          </div>
          {i < 2 && (
            <div className={cn(
              "w-8 h-px mx-1 transition-all",
              done ? "bg-[#76214D]/50" : "bg-white/10"
            )} />
          )}
        </div>
      );
    })}
  </div>
);

// ── Cash Assignment Wizard ──────────────────────────────
const CashAssignment = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [selectedUser, setSelectedUser] = useState<{ id: string; displayName: string; email?: string; phone?: string | null } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<{ id: string; name: string; price: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const { data: usersData, isLoading: usersLoading } = useQuery<{ data: { id: string; displayName: string; email: string; phone?: string | null }[] }>({
    queryKey: ["users-search", debouncedSearch],
    queryFn: async () => (
      await api.get(`/users?role=client${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""}`)
    ).data,
  });

  const allUsers = Array.isArray(usersData?.data) ? usersData.data : [];
  const filteredUsers = allUsers;

  const { data: plansData } = useQuery<{ data: { id: string; name: string; price: number; classLimit?: number | null; durationDays?: number; classCategory?: string }[] }>({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/plans")).data,
  });

  const assignMutation = useMutation({
    mutationFn: () => api.post("/memberships", {
      userId: selectedUser?.id,
      planId: selectedPlan?.id,
      paymentMethod,
      startDate: new Date().toISOString().split("T")[0],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memberships"] });
      toast({ title: "✅ Membresía activada correctamente" });
      setStep(1); setSelectedUser(null); setSelectedPlan(null); setSearch("");
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al asignar", variant: "destructive" }),
  });

  const plans = (Array.isArray(plansData?.data) ? plansData.data : []).filter((p) => (p as any).isActive !== false && (p as any).is_active !== false);
  const planGroups = groupPlans(plans);

  return (
    <div className="max-w-2xl mx-auto">
      <StepBar step={step} />

      {/* ── Step 1: Buscar cliente ─────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Buscar cliente</h3>
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#E9745F]/60" />
              <Input
                className="pl-9 bg-white/[0.04] border-white/10 focus:border-[#76214D]/50 focus:ring-[#76214D]/20 text-white placeholder:text-white/25 rounded-xl"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre, email o teléfono…"
                autoFocus
              />
            </div>
          </div>

          {usersLoading && (
            <div className="flex items-center justify-center py-8 text-[#E9745F]/60">
              <Loader2 className="animate-spin mr-2" size={16} /> Buscando…
            </div>
          )}

          <div className="space-y-2">
            {filteredUsers.map((u) => (
              <button
                key={u.id}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] hover:bg-[#76214D]/5 hover:border-[#76214D]/25 transition-all group text-left"
                onClick={() => { setSelectedUser(u); setStep(2); }}
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#76214D]/30 to-[#E9745F]/20 border border-[#76214D]/30 flex items-center justify-center text-sm font-bold text-[#76214D] shrink-0">
                  {u.displayName?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-white/90 truncate">{u.displayName}</p>
                  <p className="text-xs text-white/35 truncate">
                    {u.email}
                    {u.phone ? ` · ${u.phone}` : ""}
                  </p>
                </div>
                <ArrowRight size={14} className="text-white/20 group-hover:text-[#76214D]/60 transition-colors shrink-0" />
              </button>
            ))}
            {filteredUsers.length === 0 && !usersLoading && (
              <p className="text-center py-6 text-white/30 text-sm">No se encontraron clientes</p>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Elegir plan ────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Cliente seleccionado */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[#76214D]/8 border border-[#76214D]/20">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#76214D] to-[#E9745F] flex items-center justify-center text-xs font-bold text-white">
              {selectedUser?.displayName?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-white/90">{selectedUser?.displayName}</p>
              <p className="text-xs text-white/40">{selectedUser?.email}</p>
            </div>
            <Button variant="ghost" size="sm" className="ml-auto text-white/30 hover:text-white/60 text-xs" onClick={() => setStep(1)}>
              <ChevronLeft size={12} className="mr-1" /> Cambiar
            </Button>
          </div>

          {/* Plan groups */}
          {Object.entries(planGroups).map(([group, items]) => {
            if (!items.length) return null;
            const groupColors: Record<string, string> = {
              jumping: "text-[#76214D]",
              pilates: "text-[#E9745F]",
              mixto: "text-[#F58A24]",
              otro: "text-white/50",
            };
            const groupLabels: Record<string, string> = {
              jumping: "Paquetes Barre",
              pilates: "Paquetes Pilates",
              mixto: "Paquetes Mixto",
              otro: "Otros paquetes",
            };
            return (
              <div key={group}>
                <p className={cn("text-[11px] font-semibold uppercase tracking-widest mb-2 px-1", groupColors[group])}>
                  {groupLabels[group] ?? group}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {items.map((p) => (
                    <button
                      key={p.id}
                      className={cn(
                        "w-full flex items-center justify-between p-3.5 rounded-xl border transition-all text-left group",
                        selectedPlan?.id === p.id
                          ? "border-[#76214D]/50 bg-gradient-to-r from-[#76214D]/10 to-[#E9745F]/5 shadow-[0_0_16px_rgba(118,33,77,0.12)]"
                          : "border-white/[0.07] bg-white/[0.02] hover:border-[#76214D]/25 hover:bg-[#76214D]/5"
                      )}
                      onClick={() => setSelectedPlan(p)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-2 h-2 rounded-full shrink-0 transition-all",
                          selectedPlan?.id === p.id
                            ? "bg-[#76214D] shadow-[0_0_8px_#76214D]"
                            : "bg-white/15 group-hover:bg-[#76214D]/50"
                        )} />
                        <div>
                          <p className="text-sm font-semibold text-white/85">{p.name}</p>
                          <p className="text-xs text-white/30">
                            {p.classLimit === null ? "Ilimitado" : `${p.classLimit} clases`}
                            {p.durationDays ? ` · ${p.durationDays} días` : ""}
                          </p>
                        </div>
                      </div>
                      <span className={cn(
                        "text-sm font-bold transition-colors",
                        selectedPlan?.id === p.id ? "text-[#76214D]" : "text-white/60 group-hover:text-white/90"
                      )}>
                        ${Number(p.price).toLocaleString()} MXN
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="border-white/10 text-white/50 hover:text-white hover:border-white/20" onClick={() => setStep(1)}>
              <ChevronLeft size={14} className="mr-1" /> Volver
            </Button>
            <Button
              className="flex-1 bg-gradient-to-r from-[#76214D] to-[#E9745F] hover:opacity-90 text-white font-semibold shadow-[0_0_20px_rgba(118,33,77,0.3)]"
              disabled={!selectedPlan}
              onClick={() => setStep(3)}
            >
              Continuar <ArrowRight size={14} className="ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Confirmar ─────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          {/* Resumen */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.07] flex items-center gap-2">
              <Sparkles size={14} className="text-[#F58A24]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Resumen de la membresía</span>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/50">Cliente</span>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#76214D] to-[#E9745F] flex items-center justify-center text-[9px] font-bold text-white">
                    {selectedUser?.displayName?.[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold text-white/90">{selectedUser?.displayName}</span>
                </div>
              </div>
              <div className="h-px bg-white/[0.05]" />
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/50">Plan</span>
                <span className="text-sm font-semibold text-white/90">{selectedPlan?.name}</span>
              </div>
              <div className="h-px bg-white/[0.05]" />
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/50">Total</span>
                <span className="text-lg font-bold text-[#76214D]">${Number(selectedPlan?.price).toLocaleString()} MXN</span>
              </div>
            </div>
          </div>

          {/* Método de pago */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3 block">Método de pago</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                    paymentMethod === value
                      ? "border-[#76214D]/50 bg-[#76214D]/10 text-[#76214D]"
                      : "border-white/[0.07] bg-white/[0.02] text-white/40 hover:border-white/15 hover:text-white/70"
                  )}
                  onClick={() => setPaymentMethod(value)}
                >
                  <Icon size={16} />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="border-white/10 text-white/50 hover:text-white hover:border-white/20" onClick={() => setStep(2)}>
              <ChevronLeft size={14} className="mr-1" /> Volver
            </Button>
            <Button
              className="flex-1 bg-gradient-to-r from-[#76214D] to-[#E9745F] hover:opacity-90 text-white font-bold shadow-[0_0_24px_rgba(118,33,77,0.35)] h-11"
              onClick={() => assignMutation.mutate()}
              disabled={assignMutation.isPending}
            >
              {assignMutation.isPending
                ? <><Loader2 className="animate-spin mr-2" size={14} /> Activando…</>
                : <><CheckCircle2 size={15} className="mr-2" /> Confirmar y activar membresía</>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Payments History ──────────────────────────────────────
const PaymentsHistory = () => {
  const { data } = useQuery<{ data: any[] }>({
    queryKey: ["payments"],
    queryFn: async () => (await api.get("/payments")).data,
  });
  const payments = Array.isArray(data?.data) ? data.data : [];

  const methodStyles: Record<string, string> = {
    cash: "text-[#F58A24] border-[#F58A24]/30 bg-[#F58A24]/5",
    card: "text-[#E9745F] border-[#E9745F]/30 bg-[#E9745F]/5",
    transfer: "text-[#76214D] border-[#76214D]/30 bg-[#76214D]/5",
  };
  const methodLabels: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" };

  if (!payments.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <History size={32} className="text-white/10 mb-3" />
        <p className="text-white/30 text-sm">Sin pagos registrados aún</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {payments.map((p: any) => (
        <div key={p.id} className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#76214D]/20 to-[#E9745F]/10 border border-[#76214D]/20 flex items-center justify-center shrink-0">
            <CreditCard size={13} className="text-[#76214D]/70" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/85 truncate">{p.userName ?? p.userId ?? "—"}</p>
            <p className="text-xs text-white/30">{p.createdAt ? new Date(p.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full border", methodStyles[p.method] ?? "text-white/40 border-white/10 bg-white/5")}>
              {methodLabels[p.method] ?? p.method ?? "—"}
            </span>
            <span className="text-sm font-bold text-white/90">${Number(p.total_amount ?? p.amount ?? 0).toLocaleString()} MXN</span>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Main Payments Page ────────────────────────────────────
const PaymentsPage = () => {
  const [activeTab, setActiveTab] = useState<"cash" | "history">("cash");

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-3xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-1">Pagos</h1>
            <p className="text-sm text-white/35">Asigna membresías en efectivo y consulta el historial</p>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] w-fit mb-8">
            {([["cash", "Asignación efectivo"], ["history", "Historial"]] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setActiveTab(val)}
                className={cn(
                  "px-5 py-2 rounded-lg text-sm font-semibold transition-all",
                  activeTab === val
                    ? "bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white shadow-[0_0_14px_rgba(118,33,77,0.3)]"
                    : "text-white/40 hover:text-white/70"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "cash" && <CashAssignment />}
          {activeTab === "history" && <PaymentsHistory />}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default PaymentsPage;
