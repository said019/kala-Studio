import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Tag,
  PrimaryButton,
  GhostButton,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import {
  Stepper,
  StickyCta,
  DataRow,
  InfoBanner,
  formatMoneyMX,
} from "@/components/app/widgets";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  CheckCircle2,
  CreditCard,
  Banknote,
  Building2,
  Tag as TagIcon,
  Upload,
  ArrowLeft,
  Film,
} from "lucide-react";

type Step = "select" | "method" | "bank" | "cash" | "upload" | "done";
type PaymentMethod = "transfer" | "cash";

const flag = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["true", "1", "yes", "si", "sí", "t"].includes(value.toLowerCase());
  return false;
};

const detectCategory = (plan: any): "barre" | "all" | "online" => {
  const raw = String(plan.classCategory ?? plan.class_category ?? "").toLowerCase();
  if (raw === "online") return "online";
  if (["barre", "pilates", "mixto", "all"].includes(raw)) return raw as any;
  const byName = String(plan.name ?? "").toLowerCase();
  if (byName.includes("online")) return "online";
  if (byName.includes("jump")) return "barre";
  if (byName.includes("pilates")) return "pilates";
  if (byName.includes("mixto")) return "mixto";
  return "all";
};

const CATEGORY_TINT: Record<string, keyof typeof KALA> = {
  jumping: "berry",
  pilates: "coral",
  mixto: "orange",
  all: "olive",
  online: "coral",
};

const CATEGORY_LABEL: Record<string, string> = {
  jumping: "Barre",
  pilates: "Pilates",
  mixto: "Mixto",
  all: "Suelta",
  online: "En línea",
};

/* ── PlanRow ─────────────────────────────────────────────── */
const PlanRow = ({ plan, selected, onSelect }: { plan: any; selected: boolean; onSelect: () => void }) => {
  const category = detectCategory(plan);
  const tint = CATEGORY_TINT[category];
  const c = KALA[tint];
  const isOnline = category === "online";
  const durationDays = Number(plan.durationDays ?? plan.duration_days ?? 0);
  const classLimit = plan.classLimit ?? plan.class_limit ?? null;
  // "Ilimitado" solo aplica a planes presenciales con clases ilimitadas; un
  // plan online NO da clases presenciales (es solo acceso a videos).
  const isUnlimited = !isOnline && Number(classLimit) >= 900;
  const nonTransferable = flag(plan.isNonTransferable ?? plan.is_non_transferable);
  const nonRepeatable = flag(plan.isNonRepeatable ?? plan.is_non_repeatable);
  // Plan presencial que regala la biblioteca online (ej. 5 clases/semana).
  // El plan online en sí también la incluye, pero ahí es obvio por el nombre.
  const includesVideos =
    flag(plan.includesVideoLibrary ?? plan.includes_video_library) &&
    String(plan.classCategory ?? plan.class_category ?? "").toLowerCase() !== "online";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="w-full text-left bg-transparent border-0 cursor-pointer p-0"
    >
      <div
        className="rounded-2xl p-4 sm:p-5 grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto] items-center gap-4 transition-colors"
        style={{
          backgroundColor: selected ? KALA.blush : KALA.cream,
          border: `1px solid ${selected ? c : KALA.border}`,
          boxShadow: selected ? `0 0 0 2px ${c}1a` : "none",
        }}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Tag tint={tint}>{CATEGORY_LABEL[category]}</Tag>
            {isOnline ? (
              <span className="inline-flex items-center gap-1 text-[0.7rem] uppercase tracking-[0.18em]" style={{ color: KALA.ink, opacity: 0.55 }}>
                <Film size={11} /> Solo videos
              </span>
            ) : (
              <>
                {isUnlimited && <Tag tint="orange">Ilimitado</Tag>}
                {!isUnlimited && Number(classLimit) > 0 && (
                  <span className="text-[0.7rem] uppercase tracking-[0.18em]" style={{ color: KALA.ink, opacity: 0.55 }}>
                    {classLimit} clases
                  </span>
                )}
                {includesVideos && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.58rem] font-medium uppercase tracking-[0.14em]"
                    style={{ backgroundColor: `${KALA.olive}1f`, color: KALA.olive }}
                  >
                    <Film size={10} /> Incluye videos
                  </span>
                )}
              </>
            )}
          </div>
          <h3 className="font-bebas leading-tight" style={{ color: KALA.ink, fontSize: "clamp(1.1rem, 1.6vw, 1.35rem)" }}>
            {plan.name}
          </h3>
          {durationDays > 0 && (
            <p className="text-[0.74rem] mt-0.5" style={{ color: KALA.ink, opacity: 0.55 }}>
              {durationDays} días de vigencia
              {nonTransferable && " · No transferible"}
              {nonRepeatable && " · No repetible"}
            </p>
          )}
          {isOnline && (
            <p className="text-[0.74rem] mt-0.5" style={{ color: KALA.coral }}>
              Acceso a la biblioteca de videos. No incluye clases presenciales.
            </p>
          )}
          {includesVideos && (
            <p className="text-[0.74rem] mt-0.5 font-medium" style={{ color: KALA.olive }}>
              ✓ Incluye la membresía online (biblioteca completa de videos)
            </p>
          )}
        </div>
        <div className="text-right hidden sm:block">
          {!isOnline && !isUnlimited && Number(plan.price) > 0 && Number(classLimit) > 0 && Number(classLimit) < 900 && (
            <p className="text-[0.72rem]" style={{ color: KALA.ink, opacity: 0.45 }}>
              ${formatMoneyMX(Math.round(Number(plan.price) / Number(classLimit)))}/clase
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="font-bebas leading-none tabular-nums" style={{ color: KALA.berry, fontSize: "clamp(1.4rem, 2.2vw, 1.8rem)" }}>
            ${formatMoneyMX(plan.price ?? 0)}
          </div>
          <div className="text-[0.66rem] uppercase tracking-[0.18em] mt-0.5" style={{ color: KALA.ink, opacity: 0.45 }}>
            MXN
          </div>
        </div>
        <span
          className="grid h-9 w-9 place-items-center rounded-full transition-colors"
          style={{
            backgroundColor: selected ? c : "transparent",
            color: selected ? KALA.cream : KALA.ink,
            border: selected ? "0" : `1px solid ${KALA.border}`,
            opacity: selected ? 1 : 0.5,
          }}
        >
          <Check size={14} strokeWidth={selected ? 3 : 2} />
        </span>
      </div>
    </button>
  );
};

/* ── Checkout ─────────────────────────────────────────────── */
const Checkout = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("select");
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
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

  // Para Kala (barre boutique de una disciplina): no se usan tabs jumping/pilates/mixto.
  // Sólo se separan las clases sueltas (1 clase) de los paquetes mensuales (>1 clase).
  // El plan "Clase muestra" del trial ($50) NO aparece aquí, va en el landing como hook.
  const allMonthlyPackages = useMemo(() => {
    return activePlans
      .filter((p) => Number(p.classLimit ?? p.class_limit ?? 0) > 1)
      .filter((p) => !String(p.name ?? "").toLowerCase().includes("muestra"))
      .sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansData]);

  const singleClassPlan = useMemo(() => {
    return activePlans.find((p) => {
      const limit = Number(p.classLimit ?? p.class_limit ?? 0);
      const name = String(p.name ?? "").toLowerCase();
      return limit === 1 && !name.includes("muestra");
    }) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansData]);

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
      setStep(paymentMethod === "transfer" ? "bank" : "cash");
    },
    onError: (err: any) =>
      toast({
        title: "No se pudo crear la orden",
        description: err.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      }),
  });

  const uploadProofMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("file", file!);
      return api.post(`/orders/${orderId}/proof`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-orders"] });
      setStep("done");
    },
    onError: (err: any) =>
      toast({
        title: "No se pudo enviar el comprobante",
        description: err.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      }),
  });

  const finalAmount = discountResult
    ? (selectedPlan?.price ?? 0) - (discountResult.discount_amount ?? 0)
    : selectedPlan?.price ?? 0;

  const STEPS: { id: Step; label: string }[] = [
    { id: "select", label: "Plan" },
    { id: "method", label: "Pago" },
    { id: "upload", label: "Comprobante" },
    { id: "done", label: "Listo" },
  ];

  const stepperCurrent: Step =
    step === "bank" || step === "cash" ? "method" : step;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Membresía"
          title={<>Compra tu</>}
          titleAccent="paquete."
          subtitle="Cuatro pasos: elige plan, elige cómo pagar, sube el comprobante y listo."
        />

        <Section>
          <Stepper steps={STEPS} current={stepperCurrent} />
        </Section>

        {/* ── Step 1: Select plan ── */}
        {step === "select" && (
          <>
            <Section title="Clase suelta">
              {loadingPlans ? (
                <SkeletonRow height={88} />
              ) : singleClassPlan ? (
                <PlanRow
                  plan={singleClassPlan}
                  selected={selectedPlan?.id === singleClassPlan.id}
                  onSelect={() => setSelectedPlan(singleClassPlan)}
                />
              ) : (
                <p className="text-[0.86rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
                  No hay clase suelta disponible.
                </p>
              )}
            </Section>

            <Section title="Paquetes mensuales">
              {loadingPlans ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <SkeletonRow key={i} height={88} />)}
                </div>
              ) : allMonthlyPackages.length === 0 ? (
                <p className="text-[0.86rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
                  Aún no hay paquetes activos. Si esto persiste, escríbenos por WhatsApp.
                </p>
              ) : (
                <div className="space-y-3">
                  {allMonthlyPackages.map((plan: any) => (
                    <PlanRow
                      key={plan.id}
                      plan={plan}
                      selected={selectedPlan?.id === plan.id}
                      onSelect={() => setSelectedPlan(plan)}
                    />
                  ))}
                </div>
              )}
            </Section>

            {selectedPlan && (
              <Section title="Resumen">
                <div className="rounded-3xl p-5 sm:p-6 space-y-4" style={{ backgroundColor: KALA.blush }}>
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-full" style={{ backgroundColor: KALA.cream, color: KALA.orange }}>
                      <TagIcon size={14} />
                    </span>
                    <span className="text-[0.7rem] uppercase tracking-[0.18em]" style={{ color: KALA.ink, opacity: 0.6 }}>
                      Código de descuento
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="CODIGO"
                      className="uppercase"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      style={{ backgroundColor: KALA.cream, borderColor: KALA.border }}
                    />
                    <button
                      onClick={() => validateCodeMutation.mutate()}
                      disabled={!discountCode || validateCodeMutation.isPending}
                      className="rounded-full px-5 py-2 text-[0.74rem] font-medium uppercase tracking-[0.18em] cursor-pointer disabled:opacity-50"
                      style={{ border: `1px solid ${KALA.berry}`, color: KALA.berry, background: "transparent" }}
                    >
                      Aplicar
                    </button>
                  </div>
                  {discountResult && (
                    <p className="flex items-center gap-2 text-[0.84rem]" style={{ color: KALA.olive }}>
                      <CheckCircle2 size={14} />
                      Descuento ${formatMoneyMX(discountResult.discount_amount)} MXN aplicado
                    </p>
                  )}

                  <div className="flex items-baseline justify-between pt-3" style={{ borderTop: `1px solid ${KALA.border}` }}>
                    <span className="text-[0.78rem] uppercase tracking-[0.18em]" style={{ color: KALA.ink, opacity: 0.6 }}>
                      Total
                    </span>
                    <span className="font-bebas tabular-nums" style={{ color: KALA.ink, fontSize: "clamp(2rem, 3vw, 2.6rem)" }}>
                      ${formatMoneyMX(finalAmount)} <span className="text-[0.78rem] uppercase tracking-[0.18em]" style={{ color: KALA.ink, opacity: 0.55 }}>MXN</span>
                    </span>
                  </div>
                </div>

                <StickyCta>
                  <PrimaryButton onClick={() => setStep("method")} className="w-full">
                    Continuar a pago
                  </PrimaryButton>
                </StickyCta>
              </Section>
            )}
          </>
        )}

        {/* ── Step 2: Payment method ── */}
        {step === "method" && (
          <>
            <button
              type="button"
              onClick={() => setStep("select")}
              className="inline-flex items-center gap-2 text-[0.74rem] uppercase tracking-[0.2em] mb-5 bg-transparent border-0 cursor-pointer"
              style={{ color: KALA.ink, opacity: 0.55 }}
            >
              <ArrowLeft size={13} /> Cambiar plan
            </button>

            <Section>
              <div className="rounded-2xl p-4 flex items-center justify-between gap-3" style={{ backgroundColor: KALA.blush }}>
                <span className="text-[0.92rem]" style={{ color: KALA.ink }}>{selectedPlan?.name}</span>
                <span className="font-bebas tabular-nums" style={{ color: KALA.berry, fontSize: "1.3rem" }}>
                  ${formatMoneyMX(finalAmount)} MXN
                </span>
              </div>
            </Section>

            <Section title="¿Cómo quieres pagar?">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { id: "transfer" as const, label: "Transferencia", sub: "SPEI · BBVA", icon: Building2, tint: "berry" as const },
                  { id: "cash" as const, label: "Efectivo", sub: "Pagar en estudio", icon: Banknote, tint: "orange" as const },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const sel = paymentMethod === opt.id;
                  const tint = KALA[opt.tint];
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPaymentMethod(opt.id)}
                      aria-pressed={sel}
                      className="w-full text-left bg-transparent border-0 cursor-pointer p-0"
                    >
                      <div
                        className="rounded-3xl p-5 flex items-start gap-4 transition-colors"
                        style={{
                          backgroundColor: sel ? KALA.blush : KALA.cream,
                          border: `1px solid ${sel ? tint : KALA.border}`,
                          boxShadow: sel ? `0 0 0 2px ${tint}1a` : "none",
                        }}
                      >
                        <span
                          className="grid h-12 w-12 place-items-center rounded-2xl shrink-0"
                          style={{ backgroundColor: sel ? tint : `${tint}1a`, color: sel ? KALA.cream : tint }}
                        >
                          <Icon size={20} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bebas leading-tight" style={{ color: KALA.ink, fontSize: "1.15rem" }}>
                            {opt.label}
                          </p>
                          <p className="text-[0.78rem] mt-0.5" style={{ color: KALA.ink, opacity: 0.6 }}>
                            {opt.sub}
                          </p>
                        </div>
                        {sel && (
                          <span className="grid h-7 w-7 place-items-center rounded-full" style={{ backgroundColor: tint, color: KALA.cream }}>
                            <Check size={13} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Section>

            <StickyCta>
              <PrimaryButton
                onClick={() => createOrderMutation.mutate()}
                disabled={createOrderMutation.isPending}
                loading={createOrderMutation.isPending}
                loadingLabel="Procesando…"
                className="w-full"
              >
                <CreditCard size={14} />
                Confirmar
              </PrimaryButton>
            </StickyCta>
          </>
        )}

        {/* ── Step 3a: Bank details ── */}
        {step === "bank" && bankDetails && (
          <>
            <Section title="Transferencia SPEI">
              <p className="mb-4 text-[0.92rem] leading-[1.6]" style={{ color: KALA.ink, opacity: 0.7 }}>
                Realiza la transferencia con los datos abajo. Después sube el comprobante para que activemos tu paquete.
              </p>
              <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
                {[
                  { label: "CLABE", value: bankDetails.clabe, mono: true },
                  { label: "Cuenta", value: bankDetails.account_number ?? bankDetails.accountNumber, mono: true },
                  { label: "Banco", value: bankDetails.bank },
                  { label: "Titular", value: bankDetails.account_holder ?? bankDetails.accountHolder },
                  { label: "Monto", value: `$${formatMoneyMX(bankDetails.amount)} MXN`, mono: true, copyable: String(bankDetails.amount ?? "") },
                ].filter((r) => r.value).map((row) => (
                  <DataRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    mono={row.mono}
                    copyable={row.copyable ?? (typeof row.value === "string" ? row.value : undefined)}
                  />
                ))}
              </div>
            </Section>
            <StickyCta>
              <PrimaryButton onClick={() => setStep("upload")} className="w-full">
                Ya transferí
              </PrimaryButton>
            </StickyCta>
          </>
        )}

        {/* ── Step 3b: Cash ── */}
        {step === "cash" && (
          <Section>
            <div className="rounded-3xl p-7 sm:p-10 text-center" style={{ backgroundColor: KALA.blush }}>
              <span
                className="grid h-14 w-14 mx-auto place-items-center rounded-2xl mb-4"
                style={{ backgroundColor: KALA.orange, color: KALA.cream }}
              >
                <Banknote size={22} />
              </span>
              <h3 className="font-bebas leading-tight" style={{ color: KALA.ink, fontSize: "clamp(1.6rem, 2.6vw, 2.1rem)" }}>
                Págalo en el estudio
              </h3>
              <p className="mt-3 text-[0.92rem] leading-[1.6] max-w-[44ch] mx-auto" style={{ color: KALA.ink, opacity: 0.7 }}>
                Acércate a recepción con tu número de orden. Activamos tu paquete cuando confirmemos el pago.
              </p>
              {(orderNumber || orderId) && (
                <div
                  className="inline-flex flex-col gap-1 px-5 py-3 rounded-2xl mt-5"
                  style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}
                >
                  <span className="text-[0.62rem] uppercase tracking-[0.24em]" style={{ color: KALA.ink, opacity: 0.55 }}>
                    Número de orden
                  </span>
                  <span className="font-mono text-[1.1rem] tracking-widest font-medium" style={{ color: KALA.berry }}>
                    {orderNumber ?? orderId}
                  </span>
                </div>
              )}
            </div>
            <StickyCta>
              <PrimaryButton to="/app/orders" className="w-full">
                Ver mis órdenes
              </PrimaryButton>
            </StickyCta>
          </Section>
        )}

        {/* ── Step 4: Upload proof ── */}
        {step === "upload" && (
          <>
            <Section title="Subir comprobante">
              <div
                onClick={() => fileRef.current?.click()}
                className="rounded-3xl p-7 text-center cursor-pointer transition-colors"
                style={{
                  backgroundColor: file ? `${KALA.olive}10` : "transparent",
                  border: `1px dashed ${file ? KALA.olive : KALA.border}`,
                  color: KALA.ink,
                }}
              >
                <input
                  type="file"
                  accept="image/*,.pdf"
                  ref={fileRef}
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <span
                  className="grid h-12 w-12 mx-auto place-items-center rounded-full mb-3"
                  style={{ backgroundColor: file ? KALA.olive : KALA.blush, color: file ? KALA.cream : KALA.berry }}
                >
                  {file ? <Check size={20} strokeWidth={3} /> : <Upload size={18} />}
                </span>
                <p className="text-[0.92rem] font-medium" style={{ color: KALA.ink }}>
                  {file ? file.name : "Toca aquí o arrastra el archivo"}
                </p>
                <p className="mt-1 text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
                  JPG, PNG o PDF
                </p>
              </div>
            </Section>
            <StickyCta>
              <div className="flex gap-3">
                <PrimaryButton
                  onClick={() => uploadProofMutation.mutate()}
                  disabled={!file || uploadProofMutation.isPending}
                  loading={uploadProofMutation.isPending}
                  loadingLabel="Enviando…"
                  className="flex-1"
                >
                  Enviar comprobante
                </PrimaryButton>
                {file && <GhostButton onClick={() => setFile(null)}>Cambiar</GhostButton>}
              </div>
            </StickyCta>
          </>
        )}

        {/* ── Step 5: Done ── */}
        {step === "done" && (
          <Section>
            <div className="rounded-3xl p-7 sm:p-10 text-center" style={{ backgroundColor: KALA.blush }}>
              <span
                className="grid h-14 w-14 mx-auto place-items-center rounded-2xl mb-4"
                style={{ backgroundColor: KALA.olive, color: KALA.cream }}
              >
                <CheckCircle2 size={22} />
              </span>
              <h3 className="font-bebas leading-tight" style={{ color: KALA.ink, fontSize: "clamp(1.7rem, 2.8vw, 2.3rem)" }}>
                Comprobante recibido
              </h3>
              <p className="mt-3 text-[0.92rem] leading-[1.6] max-w-[44ch] mx-auto" style={{ color: KALA.ink, opacity: 0.7 }}>
                Estamos verificando tu pago. Te avisamos en cuanto tu paquete esté activo.
              </p>
            </div>
            <StickyCta>
              <PrimaryButton to="/app/orders" className="w-full">
                Ver mis órdenes
              </PrimaryButton>
            </StickyCta>
          </Section>
        )}

        {step === "select" && !selectedPlan && (
          <Section>
            <InfoBanner
              tone="orange"
              title="Selecciona un paquete para continuar."
              description="Si nunca has venido, prueba con la clase muestra desde el sitio principal."
            />
          </Section>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Checkout;
