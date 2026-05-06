import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  CalendarDays,
  Clock,
  MapPin,
  UserCircle,
  Users,
  CheckCircle2,
  Hourglass,
  Upload,
  X,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Tag,
  Stat,
  PrimaryButton,
  GhostButton,
  EmptyState,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import {
  BackLink,
  DataRow,
  InfoBanner,
  StatusPill,
  StickyCta,
  formatMoneyMX,
} from "@/components/app/widgets";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/stores/authStore";
import { ClientEvent } from "@/pages/admin/events/types";
import { EVENT_TYPES } from "@/pages/admin/events/types";
import EventTypeIcon from "@/pages/admin/events/EventTypeIcon";
import {
  formatEventDate,
  formatEventDateShort,
  formatCurrency,
  occupancyPercent,
  occupancyColor,
  calcCurrentPrice,
} from "@/pages/admin/events/utils";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12.5 6.9c1.32 0 2.21.57 2.72 1.05l1.99-1.94C15.85 4.79 14.35 4 12.5 4c-3.07 0-5.64 2.05-6.52 4.82l2.32 1.8C9.03 8.57 10.6 6.9 12.5 6.9z" fill="#E9745F" />
    <path d="M18.77 12.16c0-.53-.08-1.04-.2-1.52H12.5v2.87h3.52c-.15.8-.61 1.48-1.3 1.94l2.01 1.56c1.2-1.1 1.88-2.73 1.88-4.85h.16z" fill="#76214D" />
    <path d="M8.3 13.38A4.6 4.6 0 018.06 12c0-.48.09-.94.24-1.38l-2.32-1.8A7.52 7.52 0 005 12c0 1.2.29 2.34.8 3.34l2.5-1.96z" fill="#F58A24" />
    <path d="M12.5 20c1.84 0 3.38-.61 4.51-1.65l-2.01-1.56c-.63.4-1.43.64-2.5.64-1.9 0-3.47-1.27-4.06-3h-2.5l-.03.1A7.99 7.99 0 0012.5 20z" fill="#778455" />
  </svg>
);
const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" fill="#76214D" />
  </svg>
);

const fieldStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  padding: "0.75rem 0.95rem",
  fontSize: "0.92rem",
  color: KALA.ink,
  backgroundColor: KALA.cream,
  border: `1px solid ${KALA.border}`,
  outline: "none",
};
const labelStyle: React.CSSProperties = {
  fontSize: "0.66rem",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.22em",
  color: KALA.ink,
  opacity: 0.62,
  marginBottom: 6,
  display: "block",
};

/* ─────────────────────────────────────────────────────────────────
   RegisterDialog — soft inline sheet, not dark modal
   ───────────────────────────────────────────────────────────────── */
function RegisterSheet({
  event,
  onClose,
  onDone,
}: {
  event: ClientEvent;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [method, setMethod] = useState<"transfer" | "cash">("transfer");
  const [name, setName] = useState((user as any)?.display_name ?? user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");

  const isFree = event.price === 0;

  const registerMutation = useMutation({
    mutationFn: () =>
      api.post(`/events/${event.id}/register`, {
        name,
        email,
        phone,
        payment_method: isFree ? "free" : method,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-events"] });
      qc.invalidateQueries({ queryKey: ["client-event", event.id] });
      toast({ title: isFree ? "Registro confirmado." : "Registro enviado, completa tu pago." });
      onDone();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? "No pudimos registrarte.";
      toast({ title: msg, variant: "destructive" });
    },
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: "rgba(46,32,28,0.55)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 space-y-5"
        style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}`, boxShadow: "0 24px 60px rgba(46,32,28,0.18)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[0.62rem] font-medium uppercase tracking-[0.24em]" style={{ color: KALA.berry }}>
              Inscripción
            </span>
            <h3
              className="font-bebas leading-tight mt-1 truncate"
              style={{ color: KALA.ink, fontSize: "clamp(1.4rem, 2.4vw, 1.8rem)" }}
            >
              {event.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-9 w-9 place-items-center rounded-full bg-transparent border-0 cursor-pointer"
            style={{ border: `1px solid ${KALA.border}`, color: KALA.ink, opacity: 0.6 }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Tag tint="berry">
            {isFree ? "Gratis" : formatCurrency(calcCurrentPrice(event))}
          </Tag>
          {event.earlyBirdPrice && event.earlyBirdDeadline && calcCurrentPrice(event) === event.earlyBirdPrice && (
            <Tag tint="orange">Early bird</Tag>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label style={labelStyle}>Nombre completo</label>
            <input style={fieldStyle} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={fieldStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Teléfono (opcional)</label>
            <input style={fieldStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        {!isFree && (
          <div>
            <label style={labelStyle}>Método de pago</label>
            <div className="grid grid-cols-2 gap-2">
              {(["transfer", "cash"] as const).map((m) => {
                const sel = method === m;
                const tint = m === "transfer" ? KALA.berry : KALA.orange;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className="rounded-2xl p-3 cursor-pointer transition-colors text-left bg-transparent"
                    style={{
                      backgroundColor: sel ? KALA.blush : "transparent",
                      border: `1px solid ${sel ? tint : KALA.border}`,
                    }}
                  >
                    <p className="font-bebas text-[1rem] leading-tight" style={{ color: KALA.ink }}>
                      {m === "transfer" ? "Transferencia" : "Efectivo"}
                    </p>
                    <p className="text-[0.72rem] mt-0.5" style={{ color: KALA.ink, opacity: 0.6 }}>
                      {m === "transfer" ? "SPEI" : "En estudio"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <PrimaryButton
          onClick={() => registerMutation.mutate()}
          disabled={!name || !email || registerMutation.isPending}
          loading={registerMutation.isPending}
          loadingLabel="Registrando…"
          className="w-full"
        >
          {isFree ? "Confirmar registro" : "Inscribirme"}
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   PaymentSection — pay flow inside event detail
   ───────────────────────────────────────────────────────────────── */
function PaymentSection({ event, onDone }: { event: ClientEvent; onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [method, setMethod] = useState<"transfer" | "cash">("transfer");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const paymentMutation = useMutation({
    mutationFn: async () => {
      let fileData: string | null = null;
      if (file) {
        fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      return api.put(`/events/${event.id}/register/payment`, {
        payment_method: method,
        transfer_reference: reference || null,
        transfer_date: date || null,
        file_data: fileData,
        file_name: file?.name ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-event", event.id] });
      toast({ title: method === "cash" ? "Pago en estudio registrado." : "Comprobante enviado." });
      onDone();
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo enviar",
        description: err?.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const amount = event.myRegistration?.amount ?? event.price;

  return (
    <div className="rounded-3xl p-5 sm:p-7 space-y-5" style={{ backgroundColor: KALA.blush }}>
      <div>
        <span className="text-[0.62rem] font-medium uppercase tracking-[0.24em]" style={{ color: KALA.berry }}>
          Completa tu pago
        </span>
        <h3 className="font-bebas mt-1 leading-tight" style={{ color: KALA.ink, fontSize: "clamp(1.3rem, 2vw, 1.7rem)" }}>
          {formatCurrency(amount)}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["transfer", "cash"] as const).map((m) => {
          const sel = method === m;
          const tint = m === "transfer" ? KALA.berry : KALA.orange;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className="rounded-2xl p-3 text-left bg-transparent cursor-pointer transition-colors"
              style={{
                backgroundColor: sel ? KALA.cream : "transparent",
                border: `1px solid ${sel ? tint : KALA.border}`,
              }}
            >
              <p className="font-bebas text-[1rem] leading-tight" style={{ color: KALA.ink }}>
                {m === "transfer" ? "Transferencia" : "Efectivo"}
              </p>
              <p className="text-[0.72rem] mt-0.5" style={{ color: KALA.ink, opacity: 0.6 }}>
                {m === "transfer" ? "SPEI" : "En estudio"}
              </p>
            </button>
          );
        })}
      </div>

      {method === "transfer" ? (
        <div className="space-y-4">
          <div className="rounded-2xl p-4" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
            {[
              { label: "Banco", value: "BBVA" },
              { label: "Titular", value: "Montserrath Cornejo Ramírez" },
              { label: "Cuenta", value: "157 824 4526", copy: true, mono: true },
              { label: "CLABE", value: "012 180 01578244526 8", copy: true, mono: true },
              { label: "Monto", value: formatCurrency(amount), mono: true },
            ].map((row) => (
              <DataRow
                key={row.label}
                label={row.label}
                value={row.value}
                mono={row.mono}
                copyable={row.copy ? row.value : undefined}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Referencia (opcional)</label>
              <input style={fieldStyle} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Fecha de transferencia</label>
              <input style={fieldStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Comprobante</label>
            {!file ? (
              <label
                className="rounded-2xl p-5 text-center cursor-pointer block"
                style={{ border: `1px dashed ${KALA.border}`, color: KALA.ink, opacity: 0.7 }}
              >
                <Upload size={18} style={{ margin: "0 auto 6px", color: KALA.berry, opacity: 0.65 }} />
                <p className="text-[0.86rem]">Subir imagen o PDF (máx 5MB)</p>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 5 * 1024 * 1024) {
                      toast({ title: "Máximo 5 MB", variant: "destructive" });
                      return;
                    }
                    setFile(f);
                  }}
                />
              </label>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.olive}55` }}>
                <span className="grid h-9 w-9 place-items-center rounded-xl shrink-0" style={{ backgroundColor: KALA.olive, color: KALA.cream }}>
                  <CheckCircle2 size={15} />
                </span>
                <p className="flex-1 truncate text-[0.88rem]" style={{ color: KALA.ink }}>
                  {file.name}
                </p>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="bg-transparent border-0 cursor-pointer"
                  style={{ color: KALA.ink, opacity: 0.55 }}
                >
                  <X size={15} />
                </button>
              </div>
            )}
          </div>

          <PrimaryButton
            onClick={() => paymentMutation.mutate()}
            disabled={(!reference && !file) || paymentMutation.isPending}
            loading={paymentMutation.isPending}
            loadingLabel="Enviando…"
            className="w-full"
          >
            Enviar comprobante
          </PrimaryButton>
        </div>
      ) : (
        <div className="space-y-4">
          <InfoBanner
            tone="orange"
            title="Págalo en recepción"
            description={`Presenta tu confirmación y paga ${formatCurrency(amount)}. Al confirmar, queda tu lugar.`}
          />
          <PrimaryButton
            onClick={() => paymentMutation.mutate()}
            disabled={paymentMutation.isPending}
            loading={paymentMutation.isPending}
            loadingLabel="Marcando…"
            className="w-full"
          >
            Marcar como pago en estudio
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   EventDetail
   ───────────────────────────────────────────────────────────────── */
function EventDetail({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { data: event, isLoading } = useQuery<ClientEvent>({
    queryKey: ["client-event", eventId],
    queryFn: async () => (await api.get(`/events/${eventId}`)).data,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.delete(`/events/${eventId}/register`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-event", eventId] });
      qc.invalidateQueries({ queryKey: ["client-events"] });
      toast({ title: "Inscripción cancelada." });
    },
    onError: () => toast({ title: "No se pudo cancelar", variant: "destructive" }),
  });

  if (isLoading || !event) {
    return (
      <>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-[0.74rem] uppercase tracking-[0.2em] mb-5 bg-transparent border-0 cursor-pointer"
          style={{ color: KALA.ink, opacity: 0.55 }}
        >
          ← Eventos
        </button>
        <SkeletonRow height={300} />
      </>
    );
  }

  const typeInfo = EVENT_TYPES.find((t) => t.value === event.type);
  const pct = occupancyPercent(event.registered, event.capacity);
  const barColor = occupancyColor(pct);
  const currentPrice = calcCurrentPrice(event);
  const myReg = event.myRegistration;
  const isFull = event.registered >= event.capacity;
  const eventPassCode = myReg?.eventPassCode || "";

  const handleGoogleWalletAdd = async () => {
    setGoogleLoading(true);
    try {
      const resp = await api.get("/wallet/events/google/save-url", { params: { eventId } });
      const saveUrl = resp.data?.data?.saveUrl || resp.data?.saveUrl;
      if (!saveUrl) throw new Error("No save URL");
      window.open(saveUrl, "_blank", "noopener,noreferrer");
      toast({ title: "Abriendo Google Wallet…" });
    } catch (err: any) {
      const msg = err?.response?.data?.message || "No se pudo abrir Google Wallet.";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleWalletAdd = async () => {
    setAppleLoading(true);
    try {
      const resp = await api.get("/wallet/events/apple/pkpass", {
        params: { eventId },
        responseType: "blob",
      });
      const contentType = String(resp.headers?.["content-type"] || "");
      if (contentType.includes("application/vnd.apple.pkpass")) {
        const blob = new Blob([resp.data], { type: "application/vnd.apple.pkpass" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "kala-event-pass.pkpass";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 500);
        toast({ title: "Pase descargado", description: "Ábrelo para Apple Wallet." });
      } else {
        toast({ title: "No se pudo generar el pase.", variant: "destructive" });
      }
    } catch {
      toast({ title: "No se pudo abrir Apple Wallet.", variant: "destructive" });
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-[0.74rem] uppercase tracking-[0.2em] mb-4 bg-transparent border-0 cursor-pointer"
        style={{ color: KALA.ink, opacity: 0.55 }}
      >
        ← Todos los eventos
      </button>

      <PageHeader
        eyebrow={typeInfo?.label ?? "Evento"}
        title={event.title}
        actions={
          event.price === 0 ? (
            <Tag tint="olive">Gratis</Tag>
          ) : (
            <Tag tint="berry">{formatCurrency(currentPrice)}</Tag>
          )
        }
      />

      <Section>
        <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: KALA.blush }}>
          <div className="flex items-start gap-4">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
              style={{ backgroundColor: KALA.cream, color: KALA.berry }}
            >
              <EventTypeIcon type={event.type} size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.7 }}>
                {event.instructor}
              </p>
              {event.description && (
                <p className="mt-2 text-[0.95rem] leading-[1.7]" style={{ color: KALA.ink, opacity: 0.8 }}>
                  {event.description}
                </p>
              )}
            </div>
          </div>
          {event.earlyBirdPrice && calcCurrentPrice(event) === event.earlyBirdPrice && (
            <div className="mt-4">
              <Tag tint="orange">Early bird vigente</Tag>
            </div>
          )}
          {event.memberDiscount > 0 && (
            <p className="mt-3 text-[0.86rem]" style={{ color: KALA.olive }}>
              {event.memberDiscount}% de descuento aplica si tienes membresía activa.
            </p>
          )}
        </div>
      </Section>

      <Section title="Detalle">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <DataRow label="Día" value={formatEventDate(event.date)} />
          <DataRow label="Hora" value={`${event.startTime} a ${event.endTime}`} />
          <DataRow label="Lugar" value={event.location} />
          <DataRow label="Coach" value={event.instructor} />
        </div>
      </Section>

      <Section title="Cupo">
        <div className="rounded-2xl p-5" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <span className="text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.6 }}>
              {event.registered} de {event.capacity} inscritas
            </span>
            <span className="font-bebas tabular-nums text-[1.1rem]" style={{ color: barColor }}>
              {pct}%
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: KALA.blush }}>
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }}
            />
          </div>
          {isFull && !myReg && (
            <p className="mt-3 text-[0.84rem]" style={{ color: KALA.coral }}>
              Lugar lleno, puedes inscribirte en lista de espera.
            </p>
          )}
        </div>
      </Section>

      {event.requirements && (
        <Section title="Requisitos">
          <p className="text-[0.95rem] leading-[1.7]" style={{ color: KALA.ink, opacity: 0.78 }}>
            {event.requirements}
          </p>
        </Section>
      )}

      {event.includes.length > 0 && (
        <Section title="Incluye">
          <ul className="list-none m-0 p-0">
            {event.includes.map((item, i, arr) => (
              <li
                key={i}
                className="grid grid-cols-[auto_1fr] items-center gap-3 py-3"
                style={{
                  borderTop: `1px solid ${KALA.border}`,
                  borderBottom: i === arr.length - 1 ? `1px solid ${KALA.border}` : undefined,
                }}
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-full"
                  style={{ backgroundColor: `${KALA.olive}1a`, color: KALA.olive }}
                >
                  <CheckCircle2 size={13} />
                </span>
                <span className="text-[0.92rem] leading-[1.55]" style={{ color: KALA.ink, opacity: 0.78 }}>
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Estado / CTA */}
      {!myReg ? (
        <StickyCta>
          <PrimaryButton onClick={() => setShowRegister(true)} className="w-full">
            {isFull
              ? "Unirme a lista de espera"
              : event.price === 0
                ? "Registrarme gratis"
                : `Inscribirme · ${formatCurrency(currentPrice)}`}
          </PrimaryButton>
        </StickyCta>
      ) : myReg.status === "confirmed" ? (
        <Section title="Tu pase">
          <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: KALA.blush }}>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 size={16} style={{ color: KALA.olive }} />
              <p className="text-[0.92rem] font-medium" style={{ color: KALA.ink }}>
                {myReg.checkedIn
                  ? "Check-in registrado, disfruta el evento."
                  : "Estás inscrita, te esperamos."}
              </p>
            </div>
            {eventPassCode ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <div
                  className="rounded-2xl p-3 grid place-items-center"
                  style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}
                >
                  <QRCodeSVG value={eventPassCode} size={120} bgColor={KALA.cream} fgColor={KALA.ink} />
                </div>
                <div className="min-w-0">
                  <p className="text-[0.62rem] uppercase tracking-[0.22em]" style={{ color: KALA.berry }}>
                    Código del pase
                  </p>
                  <p className="mt-1 font-mono text-[0.86rem] break-all" style={{ color: KALA.ink, opacity: 0.78 }}>
                    {eventPassCode}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(eventPassCode);
                      toast({ title: "Código copiado." });
                    }}
                    className="mt-2 text-[0.78rem] no-underline bg-transparent border-0 cursor-pointer"
                    style={{ color: KALA.berry }}
                  >
                    Copiar código
                  </button>
                  <p className="mt-3 text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
                    Presenta el QR en recepción para tu check-in.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[0.86rem]" style={{ color: KALA.ink, opacity: 0.6 }}>
                Tu pase se está generando. Si no aparece en unos segundos, recarga la pantalla.
              </p>
            )}

            {eventPassCode && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5">
                <button
                  type="button"
                  onClick={handleAppleWalletAdd}
                  disabled={appleLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl py-2.5 text-[0.78rem] font-medium cursor-pointer transition-colors"
                  style={{ backgroundColor: KALA.cream, color: KALA.ink, border: `1px solid ${KALA.border}` }}
                >
                  <AppleIcon />
                  {appleLoading ? "Generando…" : "Apple Wallet"}
                  <ExternalLink size={12} style={{ opacity: 0.55 }} />
                </button>
                <button
                  type="button"
                  onClick={handleGoogleWalletAdd}
                  disabled={googleLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl py-2.5 text-[0.78rem] font-medium cursor-pointer transition-colors"
                  style={{ backgroundColor: KALA.cream, color: KALA.ink, border: `1px solid ${KALA.border}` }}
                >
                  <GoogleIcon />
                  {googleLoading ? "Abriendo…" : "Google Wallet"}
                  <ExternalLink size={12} style={{ opacity: 0.55 }} />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => cancelMutation.mutate()}
              className="mt-5 text-[0.78rem] bg-transparent border-0 cursor-pointer"
              style={{ color: KALA.destructive, opacity: 0.85 }}
            >
              Cancelar inscripción
            </button>
          </div>
        </Section>
      ) : myReg.status === "waitlist" ? (
        <Section>
          <InfoBanner
            tone="coral"
            title="Estás en lista de espera."
            description="Te avisamos en cuanto se libere un lugar."
            action={
              <GhostButton onClick={() => cancelMutation.mutate()}>
                Salir de lista
              </GhostButton>
            }
          />
        </Section>
      ) : myReg.status === "pending" ? (
        myReg.hasPaymentProof || myReg.paymentMethod === "cash" ? (
          <Section>
            <InfoBanner
              tone="orange"
              title={
                myReg.paymentMethod === "cash"
                  ? "Pendiente de pago en estudio."
                  : "Comprobante en revisión."
              }
              description="Te confirmamos en cuanto el equipo lo revise."
              action={
                <GhostButton onClick={() => cancelMutation.mutate()}>
                  Cancelar
                </GhostButton>
              }
            />
          </Section>
        ) : (
          <Section title="Tu pago">
            <InfoBanner
              tone="orange"
              title="Pendiente de pago."
              description="Completa tu pago para asegurar tu lugar."
            />
            {!showPayment ? (
              <div className="mt-4">
                <PrimaryButton onClick={() => setShowPayment(true)}>
                  Realizar pago
                </PrimaryButton>
              </div>
            ) : (
              <div className="mt-4">
                <PaymentSection event={event} onDone={() => setShowPayment(false)} />
              </div>
            )}
          </Section>
        )
      ) : null}

      {showRegister && (
        <RegisterSheet
          event={event}
          onClose={() => setShowRegister(false)}
          onDone={() => {
            setShowRegister(false);
            qc.invalidateQueries({ queryKey: ["client-event", eventId] });
          }}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────
   EventCard
   ───────────────────────────────────────────────────────────────── */
function EventCard({ event, onSelect }: { event: ClientEvent; onSelect: () => void }) {
  const typeInfo = EVENT_TYPES.find((t) => t.value === event.type);
  const pct = occupancyPercent(event.registered, event.capacity);
  const barColor = occupancyColor(pct);
  const currentPrice = calcCurrentPrice(event);
  const myReg = event.myRegistration;
  const myStatus =
    myReg?.status === "confirmed"
      ? { label: "Inscrita", tone: "olive" as const }
      : myReg?.status === "waitlist"
        ? { label: "En espera", tone: "coral" as const }
        : myReg?.status === "pending"
          ? { label: "Pendiente", tone: "orange" as const }
          : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left bg-transparent border-0 p-0 cursor-pointer"
    >
      <div
        className="rounded-3xl p-5 transition-colors"
        style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}
      >
        <div className="grid grid-cols-[auto_1fr_auto] items-start gap-4">
          <span
            className="grid h-11 w-11 place-items-center rounded-2xl shrink-0"
            style={{ backgroundColor: KALA.blush, color: KALA.berry }}
          >
            <EventTypeIcon type={event.type} size={18} />
          </span>
          <div className="min-w-0">
            <h3
              className="font-bebas leading-tight truncate"
              style={{ color: KALA.ink, fontSize: "clamp(1.15rem, 1.6vw, 1.4rem)" }}
            >
              {event.title}
            </h3>
            <p className="mt-1 text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.6 }}>
              {event.instructor} · {typeInfo?.label}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bebas leading-none tabular-nums" style={{ color: KALA.berry, fontSize: "1.15rem" }}>
              {event.price === 0 ? "Gratis" : formatCurrency(currentPrice)}
            </p>
            {event.earlyBirdPrice && calcCurrentPrice(event) === event.earlyBirdPrice && (
              <p className="mt-0.5 text-[0.62rem] uppercase tracking-[0.18em]" style={{ color: KALA.orange }}>
                Early bird
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.6 }}>
          <span className="flex items-center gap-1.5"><CalendarDays size={11} />{formatEventDateShort(event.date)}</span>
          <span className="flex items-center gap-1.5"><Clock size={11} />{event.startTime}</span>
          <span className="flex items-center gap-1.5 truncate"><MapPin size={11} />{event.location}</span>
        </div>

        <div className="mt-4">
          <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: KALA.blush }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[0.7rem] flex items-center gap-1.5" style={{ color: KALA.ink, opacity: 0.55 }}>
              <Users size={11} /> {event.registered}/{event.capacity}
            </span>
            {myStatus && <StatusPill label={myStatus.label} tone={myStatus.tone} />}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Page
   ───────────────────────────────────────────────────────────────── */
export default function Events() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const { data: rawEvents, isLoading } = useQuery({
    queryKey: ["client-events"],
    queryFn: async () => (await api.get("/events?upcoming=true")).data,
  });

  const events: ClientEvent[] = Array.isArray(rawEvents)
    ? (rawEvents as ClientEvent[])
    : Array.isArray((rawEvents as any)?.data)
      ? ((rawEvents as any).data as ClientEvent[])
      : [];
  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);
  const usedTypes = [...new Set(events.map((e) => e.type))];

  return (
    <ClientAuthGuard>
      <AppShell hideGreeting>
        {selectedId ? (
          <EventDetail eventId={selectedId} onBack={() => setSelectedId(null)} />
        ) : (
          <>
            <PageHeader
              eyebrow="Eventos"
              title={<>Talleres, masterclasses</>}
              titleAccent="y comunidad."
              subtitle="Lo que pasa este mes en el estudio. Reserva tu lugar."
            />

            {events.length > 0 && (
              <Section>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className="rounded-full px-3.5 py-1.5 text-[0.74rem] font-medium uppercase tracking-[0.16em] cursor-pointer transition-colors"
                    style={{
                      backgroundColor: filter === "all" ? KALA.berry : "transparent",
                      color: filter === "all" ? KALA.cream : KALA.ink,
                      border: `1px solid ${filter === "all" ? KALA.berry : KALA.border}`,
                    }}
                  >
                    Todos
                  </button>
                  {EVENT_TYPES.filter((t) => usedTypes.includes(t.value)).map((t) => {
                    const sel = filter === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setFilter(t.value)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.74rem] font-medium uppercase tracking-[0.16em] cursor-pointer transition-colors"
                        style={{
                          backgroundColor: sel ? KALA.berry : "transparent",
                          color: sel ? KALA.cream : KALA.ink,
                          border: `1px solid ${sel ? KALA.berry : KALA.border}`,
                        }}
                      >
                        <EventTypeIcon type={t.value} size={11} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}

            <Section>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <SkeletonRow key={i} height={140} />)}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<Sparkles size={20} />}
                  title={filter === "all" ? "Aún no hay eventos." : "Sin eventos en esta categoría."}
                  description="Cuando publiquemos un evento nuevo, aparece aquí."
                  ctaLabel={filter !== "all" ? "Ver todos" : undefined}
                  onCta={filter !== "all" ? () => setFilter("all") : undefined}
                />
              ) : (
                <ul className="list-none m-0 p-0 grid grid-cols-1 gap-3">
                  {filtered.map((ev) => (
                    <li key={ev.id}>
                      <EventCard event={ev} onSelect={() => setSelectedId(ev.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
}
