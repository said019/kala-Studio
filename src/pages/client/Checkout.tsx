import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Check, Loader2, CreditCard, Copy, Banknote, Building2,
  Tag, ChevronRight, ArrowLeft, Upload, CheckCircle, Sparkles,
} from "lucide-react";
import imgTrampoline from "@/assets/trampoline_2982156.png";
import imgPilates from "@/assets/pilates_2320695.png";

type Step = "select" | "method" | "bank" | "cash" | "upload" | "done";
type PaymentMethod = "transfer" | "cash";

function flag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["true", "1", "yes", "si", "sí", "t"].includes(value.toLowerCase());
  return false;
}

function detectPlanCategory(plan: any): "jumping" | "pilates" | "mixto" | "all" {
  const raw = String(plan.classCategory ?? plan.class_category ?? "").toLowerCase();
  if (["jumping", "pilates", "mixto", "all"].includes(raw)) return raw as "jumping" | "pilates" | "mixto" | "all";
  const byName = String(plan.name ?? "").toLowerCase();
  if (byName.includes("jump")) return "jumping";
  if (byName.includes("pilates")) return "pilates";
  if (byName.includes("mixto")) return "mixto";
  return "all";
}

// ── Plan card ─────────────────────────────────────────────────────────────────
const PlanCard = ({
  plan, selected, onSelect,
}: { plan: any; selected: boolean; onSelect: () => void }) => {
  const durationDays = Number(plan.durationDays ?? plan.duration_days ?? 0);
  const classLimit = plan.classLimit ?? plan.class_limit ?? null;
  const nonTransferable = flag(plan.isNonTransferable ?? plan.is_non_transferable);
  const nonRepeatable = flag(plan.isNonRepeatable ?? plan.is_non_repeatable);
  const category = detectPlanCategory(plan);
  const categoryLabel =
    category === "jumping" ? "Jumping" :
    category === "pilates" ? "Pilates" :
    category === "mixto" ? "Mixto" : "General";
  const accent =
    category === "jumping" ? "#76214D" :
    category === "pilates" ? "#E9745F" :
    category === "mixto" ? "#F58A24" : "#FFF6E6";
  const iconSrc =
    category === "jumping" ? imgTrampoline :
    category === "pilates" ? imgPilates :
    category === "mixto" ? imgTrampoline : imgTrampoline;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative w-full text-left rounded-2xl border p-4 transition-all duration-200 overflow-hidden",
        selected
          ? "border-[#76214D]/60 bg-gradient-to-br from-[#76214D]/10 to-[#E9745F]/5 shadow-[0_0_20px_rgba(118,33,77,0.15)]"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
      )}
    >
      <div className="pointer-events-none absolute -top-12 -right-10 h-28 w-28 rounded-full opacity-30 blur-2xl" style={{ backgroundColor: accent }} />
      {selected && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-gradient-to-br from-[#76214D] to-[#E9745F] flex items-center justify-center">
          <Check size={11} className="text-white" />
        </span>
      )}
      <div className="flex items-start gap-3 pr-7">
        <div
          className="h-11 w-11 rounded-xl border flex items-center justify-center shrink-0"
          style={{ borderColor: `${accent}55`, background: `${accent}20` }}
        >
          <img src={iconSrc} alt="" className="h-7 w-7 object-contain" style={{ filter: "brightness(0) invert(1) sepia(1) saturate(0.1) hue-rotate(10deg) brightness(1.05)", opacity: 0.85 }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white/85 leading-snug">{plan.name}</p>
          <div className="mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold" style={{ borderColor: `${accent}55`, color: accent }}>
            <Sparkles size={10} /> {categoryLabel}
          </div>
        </div>
      </div>
      <div className="flex items-baseline gap-1 mt-2">
        <span className="text-2xl font-bold text-white">${Number(plan.price ?? 0).toLocaleString("es-MX")}</span>
        <span className="text-xs text-white/35">{plan.currency ?? "MXN"}</span>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {durationDays > 0 && (
          <span className="text-[10px] text-[#E9745F]/70 bg-[#E9745F]/8 border border-[#E9745F]/15 rounded-full px-2 py-0.5">
            {durationDays} días
          </span>
        )}
        {Number(classLimit) > 0 && Number(classLimit) < 900 && (
          <span className="text-[10px] text-[#F58A24]/70 bg-[#F58A24]/8 border border-[#F58A24]/15 rounded-full px-2 py-0.5">
            {classLimit} clases
          </span>
        )}
        {Number(classLimit) >= 900 && (
          <span className="text-[10px] text-[#F58A24]/70 bg-[#F58A24]/8 border border-[#F58A24]/15 rounded-full px-2 py-0.5">
            Ilimitado
          </span>
        )}
        {nonTransferable && (
          <span className="text-[10px] text-amber-300/80 bg-amber-300/10 border border-amber-300/20 rounded-full px-2 py-0.5">
            No transferible
          </span>
        )}
        {nonRepeatable && (
          <span className="text-[10px] text-rose-300/80 bg-rose-300/10 border border-rose-300/20 rounded-full px-2 py-0.5">
            No repetible
          </span>
        )}
      </div>
    </button>
  );
};

// ── Step pill bar ──────────────────────────────────────────────────────────────
const STEPS: { id: Step; label: string }[] = [
  { id: "select", label: "Plan" },
  { id: "method", label: "Pago" },
  { id: "upload", label: "Comprobante" },
  { id: "done",   label: "Listo" },
];

const StepBar = ({ current }: { current: Step }) => {
  const order: Step[] = ["select", "method", "bank", "cash", "upload", "done"];
  const currentIdx = order.indexOf(current);
  const visibleSteps = STEPS;

  return (
    <div className="flex items-center gap-1">
      {visibleSteps.map((s, i) => {
        const sIdx = order.indexOf(s.id === "method" ? "method" : s.id);
        const done = currentIdx > sIdx;
        const active = s.id === current || (current === "bank" && s.id === "method") || (current === "cash" && s.id === "method");
        return (
          <div key={s.id} className="flex items-center gap-1">
            {i > 0 && (
              <div className={cn("h-px w-6 rounded", done ? "bg-[#76214D]/60" : "bg-white/10")} />
            )}
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all",
              active
                ? "border-[#76214D]/40 bg-[#76214D]/10 text-[#76214D]"
                : done
                  ? "border-[#4ade80]/30 bg-[#4ade80]/5 text-[#4ade80]"
                  : "border-white/10 text-white/25"
            )}>
              {done ? <Check size={10} /> : <span>{i + 1}</span>}
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const Checkout = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("select");
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>("jumping");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  const [discountCode, setDiscountCode] = useState("");
  const [discountResult, setDiscountResult] = useState<any>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [bankDetails, setBankDetails] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);

  const { data: plansData, isLoading: loadingPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/plans")).data,
  });
  const rawPlans: any[] = Array.isArray(plansData?.data) ? plansData.data : Array.isArray(plansData) ? plansData : [];
  const activePlans = rawPlans.filter((p) => (p.isActive ?? p.is_active) !== false);

  // Merge all "Ilimitado" plans into a single one ($1,000)
  const ilimitados = activePlans.filter((p) => String(p.name ?? "").toLowerCase().includes("ilimitado"));
  const nonIlimitados = activePlans.filter((p) => !String(p.name ?? "").toLowerCase().includes("ilimitado"));
  const mergedIlimitado = ilimitados.length > 0
    ? [{
        ...ilimitados[0],
        id: ilimitados[0].id,
        name: "Ilimitado",
        classCategory: "mixto",
        class_category: "mixto",
        price: 1000,
        classLimit: 9999,
        class_limit: 9999,
        durationDays: 30,
        duration_days: 30,
      }]
    : [];

  const plans = [...nonIlimitados, ...mergedIlimitado];

  // Group plans by category
  const grouped = plans.reduce((acc: Record<string, any[]>, p) => {
    const cat = String(p.classCategory ?? p.class_category ?? "all").toLowerCase();
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const categoryOrder = ["all", "jumping", "pilates", "mixto", "otro"];
  const sortedCategories = [
    ...categoryOrder.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !categoryOrder.includes(c)),
  ];

  const categoryLabel = (cat: string) => {
    if (cat === "jumping") return "Jumping";
    if (cat === "pilates") return "Pilates";
    if (cat === "mixto") return "Mixto / Ilimitado";
    if (cat === "all") return "Clase suelta";
    return "Otro";
  };

  const validateCodeMutation = useMutation({
    mutationFn: () => api.post("/discount-codes/validate", { code: discountCode, planId: selectedPlan?.id }),
    onSuccess: (res) => setDiscountResult(res.data?.data ?? res.data),
    onError: () => toast({ title: "Código inválido", variant: "destructive" }),
  });

  const createOrderMutation = useMutation({
    mutationFn: () =>
      api.post("/orders", {
        planId: selectedPlan.id,
        discountCode: discountResult?.code,
        paymentMethod,
      }),
    onSuccess: (res) => {
      const data = res.data?.data ?? res.data;
      setOrderId(data.orderId ?? data.id);
      setOrderNumber(data.orderNumber ?? data.order_number ?? null);
      setBankDetails(data.bankDetails ?? data.bank_details);
      if (paymentMethod === "transfer") setStep("bank");
      else setStep("cash");
    },
    onError: (err: any) =>
      toast({ title: "Error al crear orden", description: err.response?.data?.message, variant: "destructive" }),
  });

  const uploadProofMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("file", file!);
      return api.post(`/orders/${orderId}/proof`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-orders"] }); setStep("done"); },
    onError: (err: any) =>
      toast({ title: "Error al subir comprobante", description: err.response?.data?.message, variant: "destructive" }),
  });

  const finalAmount = discountResult
    ? (selectedPlan?.price ?? 0) - (discountResult.discount_amount ?? 0)
    : selectedPlan?.price ?? 0;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="max-w-xl mx-auto space-y-6">
          <h1 className="text-xl font-bold text-white">Comprar membresía</h1>

          <StepBar current={step} />

          {/* ── Step 1: Select plan ── */}
          {step === "select" && (
            <div className="space-y-5">
              {loadingPlans ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array(4).fill(0).map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl border border-white/[0.07] bg-white/[0.02] animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Visita / Clase suelta — always visible at top */}
                  {grouped["all"]?.length > 0 && (
                    <div className="rounded-2xl border border-[#FFF6E6]/20 bg-[#FFF6E6]/[0.03] p-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl border border-[#FFF6E6]/30 bg-[#FFF6E6]/10 flex items-center justify-center">
                            <Sparkles size={16} className="text-[#FFF6E6]" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white/85">Clase suelta — Visita</p>
                            <p className="text-[10px] text-white/40 mt-0.5">Todas las disciplinas · 1 clase · 7 días</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-bold text-[#FFF6E6]">${Number(grouped["all"][0]?.price ?? 80).toLocaleString("es-MX")} <span className="text-xs font-normal text-white/35">MXN</span></span>
                          <button
                            onClick={() => setSelectedPlan(grouped["all"][0])}
                            className={cn(
                              "px-4 py-2 rounded-full text-xs font-semibold tracking-wider uppercase transition-all",
                              selectedPlan?.id === grouped["all"][0]?.id
                                ? "bg-[#FFF6E6] text-black"
                                : "border border-[#FFF6E6]/30 text-[#FFF6E6] hover:bg-[#FFF6E6]/10"
                            )}
                          >
                            {selectedPlan?.id === grouped["all"][0]?.id ? "✓ Seleccionada" : "Elegir"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Category tabs */}
                  <div className="flex gap-2 flex-wrap">
                    {(["jumping", "pilates", "mixto"] as const).map((cat) => {
                      const tabColors: Record<string, string> = { jumping: "#76214D", pilates: "#E9745F", mixto: "#F58A24" };
                      const tabLabels: Record<string, string> = { jumping: "Jumping", pilates: "Pilates", mixto: "Mixto" };
                      const color = tabColors[cat] ?? "#76214D";
                      const isActive = activeTab === cat;
                      return (
                        <button key={cat} onClick={() => setActiveTab(cat)}
                          className={cn(
                            "px-5 py-2 rounded-full text-xs font-semibold tracking-wider uppercase transition-all",
                            isActive ? "text-black shadow-lg" : "border text-white/50 hover:text-white/80"
                          )}
                          style={isActive
                            ? { backgroundColor: color, borderColor: color }
                            : { borderColor: color + "40" }
                          }>
                          {tabLabels[cat]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Plans for active tab */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(grouped[activeTab] ?? []).map((plan: any) => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        selected={selectedPlan?.id === plan.id}
                        onSelect={() => setSelectedPlan(plan)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {selectedPlan && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-4">
                  {/* Discount code */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#F58A24]/50" />
                      <Input
                        className="pl-8 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/25 uppercase"
                        placeholder="Código de descuento"
                        value={discountCode}
                        onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      />
                    </div>
                    <button
                      onClick={() => validateCodeMutation.mutate()}
                      disabled={!discountCode || validateCodeMutation.isPending}
                      className="px-4 py-2 rounded-xl text-xs font-semibold border border-[#F58A24]/30 text-[#F58A24] bg-[#F58A24]/5 hover:bg-[#F58A24]/10 transition-all disabled:opacity-40"
                    >
                      Aplicar
                    </button>
                  </div>
                  {discountResult && (
                    <div className="flex items-center gap-2 text-xs text-[#4ade80]">
                      <Check size={12} />
                      Descuento aplicado: -${discountResult.discount_amount} MXN
                    </div>
                  )}

                  {/* Total */}
                  <div className="flex items-center justify-between py-3 border-t border-white/[0.06]">
                    <span className="text-sm text-white/60">Total a pagar</span>
                    <span className="text-2xl font-bold text-white">${finalAmount.toLocaleString("es-MX")} <span className="text-sm font-normal text-white/35">MXN</span></span>
                  </div>

                  <button
                    onClick={() => setStep("method")}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-[#76214D] to-[#E9745F] hover:opacity-90 transition-opacity"
                  >
                    Seleccionar método de pago <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Payment method ── */}
          {step === "method" && (
            <div className="space-y-4">
              <button onClick={() => setStep("select")} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
                <ArrowLeft size={13} /> Cambiar plan
              </button>

              {/* Selected plan summary */}
              <div className="rounded-2xl border border-[#76214D]/20 bg-[#76214D]/5 px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-white/70">{selectedPlan?.name}</span>
                <span className="text-lg font-bold text-white">${finalAmount.toLocaleString("es-MX")} MXN</span>
              </div>

              <p className="text-sm font-semibold text-white/80">¿Cómo quieres pagar?</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Transfer */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod("transfer")}
                  className={cn(
                    "flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all",
                    paymentMethod === "transfer"
                      ? "border-[#E9745F]/50 bg-[#E9745F]/10 shadow-[0_0_16px_rgba(233,116,95,0.15)]"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    paymentMethod === "transfer" ? "bg-[#E9745F]/20 text-[#E9745F]" : "bg-white/5 text-white/40"
                  )}>
                    <Building2 size={22} />
                  </div>
                  <div className="text-center">
                    <p className={cn("text-sm font-semibold", paymentMethod === "transfer" ? "text-[#E9745F]" : "text-white/60")}>
                      Transferencia
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">SPEI / banco</p>
                  </div>
                  {paymentMethod === "transfer" && (
                    <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E9745F] to-[#76214D] flex items-center justify-center">
                      <Check size={10} className="text-white" />
                    </span>
                  )}
                </button>

                {/* Cash in studio */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={cn(
                    "flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all",
                    paymentMethod === "cash"
                      ? "border-[#F58A24]/50 bg-[#F58A24]/10 shadow-[0_0_16px_rgba(245,138,36,0.12)]"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    paymentMethod === "cash" ? "bg-[#F58A24]/20 text-[#F58A24]" : "bg-white/5 text-white/40"
                  )}>
                    <Banknote size={22} />
                  </div>
                  <div className="text-center">
                    <p className={cn("text-sm font-semibold", paymentMethod === "cash" ? "text-[#F58A24]" : "text-white/60")}>
                      Efectivo
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">Pagar en estudio</p>
                  </div>
                  {paymentMethod === "cash" && (
                    <span className="w-5 h-5 rounded-full bg-[#F58A24] flex items-center justify-center">
                      <Check size={10} className="text-[#080808]" />
                    </span>
                  )}
                </button>
              </div>

              <button
                onClick={() => createOrderMutation.mutate()}
                disabled={createOrderMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-[#76214D] to-[#E9745F] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {createOrderMutation.isPending
                  ? <Loader2 className="animate-spin" size={16} />
                  : <CreditCard size={16} />}
                {createOrderMutation.isPending ? "Procesando…" : "Confirmar"}
              </button>
            </div>
          )}

          {/* ── Step 3a: Bank details (transfer) ── */}
          {step === "bank" && bankDetails && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#E9745F]/20 bg-[#E9745F]/5 p-5 space-y-4">
                <p className="text-sm font-semibold text-[#E9745F]">Datos de transferencia SPEI</p>
                <p className="text-xs text-white/40">Realiza la transferencia con los siguientes datos. Luego sube tu comprobante.</p>
                {[
                  { label: "CLABE", value: bankDetails.clabe },
                  { label: "Cuenta", value: bankDetails.account_number ?? bankDetails.accountNumber },
                  { label: "Banco", value: bankDetails.bank },
                  { label: "Titular", value: bankDetails.account_holder ?? bankDetails.accountHolder },
                  { label: "Monto", value: `$${bankDetails.amount?.toLocaleString("es-MX")} MXN` },
                ].map(({ label, value }) => value && (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.06] last:border-0">
                    <span className="text-xs text-white/40">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white/80">{value}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(String(value)); toast({ title: "Copiado" }); }}
                        className="text-[#E9745F]/50 hover:text-[#E9745F] transition-colors"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStep("upload")}
                className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-[#76214D] to-[#E9745F] hover:opacity-90 transition-opacity"
              >
                Ya realicé la transferencia →
              </button>
            </div>
          )}

          {/* ── Step 3b: Cash in studio ── */}
          {step === "cash" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#F58A24]/20 bg-[#F58A24]/5 p-6 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-[#F58A24]/15 flex items-center justify-center mx-auto">
                  <Banknote size={26} className="text-[#F58A24]" />
                </div>
                <p className="font-semibold text-[#F58A24]">Pago en el estudio</p>
                <p className="text-sm text-white/50">
                  Acércate a la recepción con el número de orden para completar tu pago en efectivo.
                </p>
                {(orderNumber || orderId) && (
                  <div className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2 inline-block">
                    <p className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">Número de orden</p>
                    <p className="font-mono font-bold text-white text-lg tracking-widest">{orderNumber ?? orderId}</p>
                  </div>
                )}
                <p className="text-xs text-white/30">
                  Tu membresía se activará una vez que el equipo confirme el pago.
                </p>
              </div>
              <button
                onClick={() => window.location.replace("/app/orders")}
                className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-[#76214D] to-[#E9745F] hover:opacity-90 transition-opacity"
              >
                Ver mis órdenes
              </button>
            </div>
          )}

          {/* ── Step 4: Upload proof ── */}
          {step === "upload" && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
              <p className="font-semibold text-white">Subir comprobante</p>
              <p className="text-xs text-white/40">Sube una foto o PDF de tu comprobante de transferencia.</p>

              <div
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-8 cursor-pointer text-center transition-all",
                  file
                    ? "border-[#4ade80]/40 bg-[#4ade80]/5"
                    : "border-white/[0.10] hover:border-[#76214D]/30 hover:bg-[#76214D]/3"
                )}
              >
                <input
                  type="file"
                  accept="image/*,.pdf"
                  ref={fileRef}
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <>
                    <Check size={24} className="text-[#4ade80] mx-auto mb-2" />
                    <p className="text-sm text-[#4ade80] font-medium">{file.name}</p>
                  </>
                ) : (
                  <>
                    <Upload size={24} className="text-white/20 mx-auto mb-2" />
                    <p className="text-sm text-white/40">Haz clic o arrastra tu comprobante aquí</p>
                    <p className="text-xs text-white/20 mt-1">JPG, PNG o PDF</p>
                  </>
                )}
              </div>

              <button
                onClick={() => uploadProofMutation.mutate()}
                disabled={!file || uploadProofMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-[#76214D] to-[#E9745F] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {uploadProofMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                {uploadProofMutation.isPending ? "Enviando…" : "Enviar comprobante"}
              </button>
            </div>
          )}

          {/* ── Step 5: Done ── */}
          {step === "done" && (
            <div className="rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/5 p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#4ade80]/20 to-[#4ade80]/5 border border-[#4ade80]/30 flex items-center justify-center mx-auto">
                <CheckCircle size={30} className="text-[#4ade80]" />
              </div>
              <h2 className="text-xl font-bold text-white">¡Comprobante recibido!</h2>
              <p className="text-sm text-white/45 max-w-xs mx-auto">
                Verificaremos tu pago en breve. Recibirás una notificación cuando tu membresía esté activa.
              </p>
              <button
                onClick={() => window.location.replace("/app/orders")}
                className="mt-2 px-6 py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-white/70 hover:text-white hover:border-white/30 transition-all"
              >
                Ver mis órdenes
              </button>
            </div>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default Checkout;
