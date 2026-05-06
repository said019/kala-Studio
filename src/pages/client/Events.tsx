import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, Clock, MapPin, UserCircle, Users, ArrowLeft, CheckCircle,
  AlertCircle, Hourglass, Copy, Upload, X, ChevronRight, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import ClientLayout from "@/components/layout/ClientLayout";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/stores/authStore";
import { ClientEvent } from "@/pages/admin/events/types";
import { EVENT_TYPES } from "@/pages/admin/events/types";
import EventTypeIcon from "@/pages/admin/events/EventTypeIcon";
import { QRCodeSVG } from "qrcode.react";
import {
  formatEventDate, formatEventDateShort, formatCurrency,
  occupancyPercent, occupancyColor, calcCurrentPrice,
} from "@/pages/admin/events/utils";

const GoogleIcon = ({ color = "full" }: { color?: "full" | "gray" | "palette" }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.5 6.9c1.32 0 2.21.57 2.72 1.05l1.99-1.94C15.85 4.79 14.35 4 12.5 4c-3.07 0-5.64 2.05-6.52 4.82l2.32 1.8C9.03 8.57 10.6 6.9 12.5 6.9z" fill={color === "full" ? "#EA4335" : color === "palette" ? "#F58A24" : "#888"} />
    <path d="M18.77 12.16c0-.53-.08-1.04-.2-1.52H12.5v2.87h3.52c-.15.8-.61 1.48-1.3 1.94l2.01 1.56c1.2-1.1 1.88-2.73 1.88-4.85h.16z" fill={color === "full" ? "#4285F4" : color === "palette" ? "#F58A24" : "#888"} />
    <path d="M8.3 13.38A4.6 4.6 0 018.06 12c0-.48.09-.94.24-1.38l-2.32-1.8A7.52 7.52 0 005 12c0 1.2.29 2.34.8 3.34l2.5-1.96z" fill={color === "full" ? "#FBBC05" : color === "palette" ? "#F58A24" : "#888"} />
    <path d="M12.5 20c1.84 0 3.38-.61 4.51-1.65l-2.01-1.56c-.63.4-1.43.64-2.5.64-1.9 0-3.47-1.27-4.06-3h-2.5l-.03.1A7.99 7.99 0 0012.5 20z" fill={color === "full" ? "#34A853" : color === "palette" ? "#F58A24" : "#888"} />
  </svg>
);

const AppleIcon = ({ color = "white" }: { color?: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" fill={color} />
  </svg>
);

// ── Registration dialog ────────────────────────────────────────────────────────
interface RegisterDialogProps {
  event: ClientEvent;
  onClose: () => void;
  onDone: () => void;
}

function RegisterDialog({ event, onClose, onDone }: RegisterDialogProps) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [method, setMethod] = useState<"transfer" | "cash">("transfer");
  const [name, setName] = useState(user?.display_name ?? user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");

  const isFree = event.price === 0;

  const registerMutation = useMutation({
    mutationFn: () =>
      api.post(`/events/${event.id}/register`, {
        name, email, phone,
        payment_method: isFree ? "free" : method,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-events"] });
      qc.invalidateQueries({ queryKey: ["client-event", event.id] });
      toast({ title: isFree ? "🎉 ¡Registro confirmado!" : "✅ Registro enviado. Completa tu pago." });
      onDone();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Error al registrarse";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const inputCls = "w-full rounded-xl bg-white/[0.05] border border-white/[0.08] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#76214D]/40 transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0f0518] p-5 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground">Inscribirme al evento</h3>
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{event.title}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Price chip */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Total:</span>
          <span className="text-lg font-bold text-[#76214D]">
            {isFree ? "Gratis" : formatCurrency(calcCurrentPrice(event))}
          </span>
          {event.earlyBirdPrice && event.earlyBirdDeadline && calcCurrentPrice(event) === event.earlyBirdPrice && (
            <span className="text-[0.65rem] bg-[#F58A24]/10 border border-[#F58A24]/30 text-[#F58A24] rounded-full px-2 py-0.5 font-medium">
              Early Bird
            </span>
          )}
        </div>

        {/* Contact fields */}
        <div className="space-y-3">
          <input className={inputCls} placeholder="Nombre completo" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={inputCls} type="email" placeholder="Correo electrónico" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={inputCls} placeholder="Teléfono (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        {/* Payment method (only if not free) */}
        {!isFree && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Método de pago</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(["transfer", "cash"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={cn(
                    "rounded-xl p-3 border text-left transition-all",
                    method === m
                      ? m === "transfer" ? "border-[#E9745F]/50 bg-[#E9745F]/10 text-[#E9745F]" : "border-[#F58A24]/50 bg-[#F58A24]/10 text-[#F58A24]"
                      : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:bg-white/[0.04]"
                  )}
                >
                  <p className="text-sm font-semibold">{m === "transfer" ? "Transferencia" : "En studio"}</p>
                  <p className="text-[0.68rem] mt-0.5">{m === "transfer" ? "SPEI / Banco" : "Efectivo en recepción"}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => registerMutation.mutate()}
          disabled={!name || !email || registerMutation.isPending}
          className="w-full rounded-xl py-3 text-sm font-bold bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white shadow-lg shadow-[#76214D]/20 hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {registerMutation.isPending ? "Registrando..." : isFree ? "Confirmar registro gratuito" : "Inscribirme"}
        </button>
      </div>
    </div>
  );
}

// ── Payment section ────────────────────────────────────────────────────────────
function PaymentSection({ event, onDone }: { event: ClientEvent; onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [method, setMethod] = useState<"transfer" | "cash">("transfer");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "✅ Copiado al portapapeles" });
  };

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
      toast({ title: method === "cash" ? "✅ Seleccionado pago en studio" : "📤 Comprobante enviado" });
      onDone();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Error al enviar";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const inputCls = "w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#76214D]/40 transition-all";

  return (
    <div className="rounded-2xl border border-[#E9745F]/20 bg-[#E9745F]/[0.04] p-5 space-y-5">
      <p className="text-sm font-semibold text-foreground">Completa tu pago</p>

      {/* Method selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(["transfer", "cash"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={cn(
              "rounded-xl p-3 border text-left transition-all",
              method === m
                ? m === "transfer" ? "border-[#E9745F]/50 bg-[#E9745F]/10 text-[#E9745F]" : "border-[#F58A24]/50 bg-[#F58A24]/10 text-[#F58A24]"
                : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:bg-white/[0.04]"
            )}
          >
            <p className="text-sm font-semibold">{m === "transfer" ? "Transferencia" : "Pagar en studio"}</p>
            <p className="text-[0.68rem] mt-0.5">{m === "transfer" ? "SPEI / Banco" : "Efectivo en recepción"}</p>
          </button>
        ))}
      </div>

      {/* Transfer section */}
      {method === "transfer" && (
        <div className="space-y-4">
          {/* Bank info */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Datos bancarios</p>
            {[
              { label: "Banco",    value: "BBVA" },
              { label: "Titular",  value: "Montserrath Cornejo Ramírez" },
              { label: "Cuenta",   value: "157 824 4526" },
              { label: "CLABE",    value: "012 180 01578244526 8" },
              { label: "Monto",    value: formatCurrency(event.myRegistration?.amount ?? event.price) },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[0.65rem] text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium text-foreground">{item.value}</p>
                </div>
                {["Cuenta", "CLABE"].includes(item.label) && (
                  <button onClick={() => copyToClipboard(item.value)} className="text-[#E9745F] hover:opacity-70 transition-opacity">
                    <Copy size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Comprobante form */}
          <div className="space-y-3">
            <input
              className={inputCls}
              placeholder="Referencia de transferencia"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <input
              className={inputCls}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {/* File upload */}
            {!file ? (
              <label className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-white/[0.10] p-5 cursor-pointer hover:border-[#76214D]/30 transition-all">
                <Upload size={20} className="text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Subir comprobante (imagen o PDF)</p>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 5 * 1024 * 1024) { toast({ title: "Máximo 5 MB", variant: "destructive" }); return; }
                    setFile(f);
                    if (f.type.startsWith("image/")) {
                      const reader = new FileReader();
                      reader.onload = () => setFilePreview(reader.result as string);
                      reader.readAsDataURL(f);
                    } else {
                      setFilePreview(null);
                    }
                  }}
                />
              </label>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                {filePreview ? (
                  <img src={filePreview} className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                    <Upload size={18} className="text-muted-foreground" />
                  </div>
                )}
                <p className="flex-1 text-sm text-foreground truncate">{file.name}</p>
                <button onClick={() => { setFile(null); setFilePreview(null); }} className="text-muted-foreground hover:text-[#f87171] transition-colors">
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => paymentMutation.mutate()}
            disabled={(!reference && !file) || paymentMutation.isPending}
            className="w-full rounded-xl py-3 text-sm font-bold bg-gradient-to-r from-[#E9745F] to-[#76214D] text-white shadow-lg shadow-[#E9745F]/20 hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {paymentMutation.isPending ? "Enviando..." : "Enviar comprobante"}
          </button>
        </div>
      )}

      {/* Cash section */}
      {method === "cash" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#F58A24]/20 bg-[#F58A24]/[0.04] p-4">
            <p className="text-sm text-[#F58A24] font-medium">Paga en recepción del studio</p>
            <p className="text-xs text-muted-foreground mt-1">
              Presenta tu confirmación en recepción y realiza el pago de{" "}
              <strong className="text-[#F58A24]">{formatCurrency(event.myRegistration?.amount ?? event.price)}</strong>.
              Tu lugar será confirmado inmediatamente.
            </p>
          </div>
          <button
            onClick={() => paymentMutation.mutate()}
            disabled={paymentMutation.isPending}
            className="w-full rounded-xl py-3 text-sm font-bold bg-gradient-to-r from-[#F58A24] to-[#F58A24]/70 text-[#080808] shadow-lg shadow-[#F58A24]/10 hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {paymentMutation.isPending ? "..." : "Marcar como pago en studio"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Event detail view (inline) ────────────────────────────────────────────────
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
      toast({ title: "Inscripción cancelada" });
    },
    onError: () => toast({ title: "Error al cancelar", variant: "destructive" }),
  });

  if (isLoading || !event) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32 rounded-xl" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }

  const typeInfo = EVENT_TYPES.find((t) => t.value === event.type);
  const color = typeInfo?.color ?? "#76214D";
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
      toast({ title: "Abriendo Google Wallet..." });
    } catch (err: unknown) {
      console.error("Google Wallet event add error:", err);
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "No se pudo abrir Google Wallet";
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
        a.download = "ophelia-event-pass.pkpass";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 500);
        toast({ title: "Pase descargado", description: "Ábrelo para agregarlo a Apple Wallet." });
      } else if (contentType.includes("text/html")) {
        const htmlText = await resp.data.text();
        const newWindow = window.open("", "_blank");
        if (!newWindow) {
          toast({ title: "Permite ventanas emergentes para abrir el pase", variant: "destructive" });
          return;
        }
        newWindow.document.open();
        newWindow.document.write(htmlText);
        newWindow.document.close();
        toast({ title: "Pase web abierto" });
      } else {
        toast({ title: "No se pudo generar el pase", variant: "destructive" });
      }
    } catch (err: unknown) {
      console.error("Apple Wallet event add error:", err);
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "No se pudo abrir Apple Wallet";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} />
        Todos los eventos
      </button>

      {/* Main card */}
      <div className="rounded-2xl border bg-white/[0.02] p-5 space-y-4" style={{ borderColor: `${color}22` }}>
        <div className="flex items-start gap-4">
          <EventTypeIcon type={event.type} size={22} withBg className="flex-shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-foreground">{event.title}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm font-semibold" style={{ color }}>
                {event.price === 0 ? "Gratis" : formatCurrency(currentPrice)}
              </span>
              {event.earlyBirdPrice && calcCurrentPrice(event) === event.earlyBirdPrice && (
                <span className="text-[0.65rem] bg-[#F58A24]/10 border border-[#F58A24]/30 text-[#F58A24] rounded-full px-2 py-0.5">
                  Early Bird
                </span>
              )}
              {event.price > 0 && event.memberDiscount > 0 && (
                <span className="text-[0.65rem] bg-[#E9745F]/10 border border-[#E9745F]/30 text-[#E9745F] rounded-full px-2 py-0.5">
                  {event.memberDiscount}% socias
                </span>
              )}
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">{event.description}</p>

        {/* Info chips */}
        <div className="flex flex-wrap gap-2">
          {[
            { icon: Calendar, text: formatEventDate(event.date) },
            { icon: Clock, text: `${event.startTime} – ${event.endTime}` },
            { icon: MapPin, text: event.location },
            { icon: UserCircle, text: event.instructor },
          ].map((chip) => (
            <span key={chip.text} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-white/[0.04] border border-white/[0.06] rounded-full px-3 py-1">
              <chip.icon size={11} />
              {chip.text}
            </span>
          ))}
        </div>

        {/* Capacity bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span className="flex items-center gap-1"><Users size={11} /> {event.registered}/{event.capacity} inscritos</span>
            <span style={{ color: barColor }}>{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
          </div>
          {isFull && !myReg && (
            <p className="text-xs text-[#fbbf24] mt-1">Evento lleno — puedes inscribirte en lista de espera.</p>
          )}
        </div>
      </div>

      {/* Requirements */}
      {event.requirements && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Requisitos</p>
          <p className="text-sm text-foreground">{event.requirements}</p>
        </div>
      )}

      {/* Includes */}
      {event.includes.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Incluye</p>
          <div className="space-y-2">
            {event.includes.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <CheckCircle size={13} className="text-[#4ade80] flex-shrink-0" />
                <p className="text-sm text-foreground">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member discount card */}
      {event.memberDiscount > 0 && (
        <div className="rounded-2xl border border-[#E9745F]/20 bg-[#E9745F]/[0.04] p-4">
          <p className="text-sm font-semibold text-[#E9745F]">🎉 {event.memberDiscount}% de descuento para socias</p>
          <p className="text-xs text-muted-foreground mt-1">Tu membresía activa aplica automáticamente al inscribirte.</p>
        </div>
      )}

      {/* ── Status banner / CTA ── */}
      {!myReg ? (
        <button
          onClick={() => setShowRegister(true)}
          className="w-full rounded-2xl py-3.5 text-sm font-bold bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white shadow-lg shadow-[#76214D]/20 hover:opacity-90 transition-opacity"
        >
          {isFull ? "Inscribirme en lista de espera" : event.price === 0 ? "Registrarme gratis" : `Inscribirme — ${formatCurrency(currentPrice)}`}
        </button>
      ) : myReg.status === "confirmed" ? (
        <div className="rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/[0.04] p-4 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-[#4ade80]" />
            <p className="text-sm font-semibold text-[#4ade80]">
              {myReg.checkedIn ? "Check-in registrado. ¡Disfruta el evento!" : "¡Estás inscrita! Te esperamos en el evento."}
            </p>
          </div>
          {eventPassCode ? (
            <div className="rounded-xl border border-[#4ade80]/25 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-semibold text-[#4ade80] uppercase tracking-wider">Tu pase del evento</p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(eventPassCode);
                    toast({ title: "✅ Código del pase copiado" });
                  }}
                  className="text-[0.65rem] font-medium text-[#4ade80] hover:opacity-80 transition-opacity"
                >
                  Copiar código
                </button>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="rounded-xl bg-white p-2 shadow-sm">
                  <QRCodeSVG value={eventPassCode} size={110} />
                </div>
                <div className="min-w-0 text-center sm:text-left">
                  <p className="text-[0.65rem] text-muted-foreground">Presenta este QR en recepción para check-in.</p>
                  <p className="mt-1 text-xs font-semibold text-[#F58A24] break-all">{eventPassCode}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={handleAppleWalletAdd}
                  disabled={appleLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs font-semibold text-foreground transition-all disabled:opacity-60"
                >
                  <AppleIcon />
                  {appleLoading ? "Generando..." : "Agregar a Apple Wallet"}
                  <ExternalLink size={13} className="opacity-70" />
                </button>
                <button
                  onClick={handleGoogleWalletAdd}
                  disabled={googleLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs font-semibold text-foreground transition-all disabled:opacity-60"
                >
                  <GoogleIcon />
                  {googleLoading ? "Abriendo..." : "Agregar a Google Wallet"}
                  <ExternalLink size={13} className="opacity-70" />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Tu pase se está generando. Si no aparece en unos segundos, recarga la pantalla.
            </p>
          )}
          <button
            onClick={() => cancelMutation.mutate()}
            className="text-xs text-muted-foreground hover:text-[#f87171] transition-colors"
          >
            Cancelar inscripción
          </button>
        </div>
      ) : myReg.status === "waitlist" ? (
        <div className="rounded-2xl border border-[#E9745F]/20 bg-[#E9745F]/[0.04] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Hourglass size={16} className="text-[#E9745F]" />
            <p className="text-sm font-semibold text-[#E9745F]">Estás en la lista de espera. Te avisaremos si se libera un lugar.</p>
          </div>
          <button onClick={() => cancelMutation.mutate()} className="text-xs text-muted-foreground hover:text-[#f87171] transition-colors">
            Salir de la lista de espera
          </button>
        </div>
      ) : myReg.status === "pending" ? (
        <div className="space-y-4">
          {myReg.hasPaymentProof || myReg.paymentMethod === "cash" ? (
            <div className="rounded-2xl border border-[#fbbf24]/20 bg-[#fbbf24]/[0.04] p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={16} className="text-[#fbbf24]" />
                <p className="text-sm font-semibold text-[#fbbf24]">
                  {myReg.paymentMethod === "cash" ? "Pendiente de pago en studio" : "Comprobante enviado — en revisión"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">El equipo confirmará tu lugar pronto.</p>
              <button onClick={() => cancelMutation.mutate()} className="text-xs text-muted-foreground hover:text-[#f87171] transition-colors mt-2 block">
                Cancelar inscripción
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-[#fbbf24]/20 bg-[#fbbf24]/[0.04] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle size={16} className="text-[#fbbf24]" />
                  <p className="text-sm font-semibold text-[#fbbf24]">Pendiente de pago</p>
                </div>
                <p className="text-xs text-muted-foreground">Completa tu pago para confirmar tu lugar.</p>
                <button onClick={() => cancelMutation.mutate()} className="text-xs text-muted-foreground hover:text-[#f87171] transition-colors mt-2 block">
                  Cancelar inscripción
                </button>
              </div>
              {!showPayment ? (
                <button
                  onClick={() => setShowPayment(true)}
                  className="w-full rounded-2xl py-3 text-sm font-bold border border-[#E9745F]/30 bg-[#E9745F]/10 text-[#E9745F] hover:bg-[#E9745F]/15 transition-all"
                >
                  Realizar pago
                </button>
              ) : (
                <PaymentSection event={event} onDone={() => setShowPayment(false)} />
              )}
            </>
          )}
        </div>
      ) : null}

      {/* Register dialog */}
      {showRegister && (
        <RegisterDialog
          event={event}
          onClose={() => setShowRegister(false)}
          onDone={() => {
            setShowRegister(false);
            qc.invalidateQueries({ queryKey: ["client-event", eventId] });
          }}
        />
      )}
    </div>
  );
}

// ── Event card ─────────────────────────────────────────────────────────────────
function EventCard({ event, onSelect }: { event: ClientEvent; onSelect: () => void }) {
  const typeInfo = EVENT_TYPES.find((t) => t.value === event.type);
  const color = typeInfo?.color ?? "#76214D";
  const pct = occupancyPercent(event.registered, event.capacity);
  const barColor = occupancyColor(pct);
  const currentPrice = calcCurrentPrice(event);
  const myReg = event.myRegistration;

  return (
    <button
      onClick={onSelect}
      className="text-left w-full rounded-2xl border bg-white/[0.02] hover:bg-white/[0.04] transition-all p-4 space-y-3"
      style={{ borderColor: `${color}22` }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <EventTypeIcon type={event.type} size={18} withBg className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground leading-tight truncate">{event.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{event.instructor} · {typeInfo?.label}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-sm font-bold" style={{ color }}>
            {event.price === 0 ? "Gratis" : formatCurrency(currentPrice)}
          </p>
          {event.earlyBirdPrice && calcCurrentPrice(event) === event.earlyBirdPrice && (
            <p className="text-[0.6rem] text-[#F58A24] mt-0.5">Early Bird</p>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Calendar size={10} />{formatEventDateShort(event.date)}</span>
        <span className="flex items-center gap-1"><Clock size={10} />{event.startTime}</span>
        <span className="flex items-center gap-1"><MapPin size={10} className="flex-shrink-0" />{event.location}</span>
      </div>

      {/* Occupancy + status */}
      <div className="space-y-1.5">
        <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] text-muted-foreground">{event.registered}/{event.capacity} inscritos</span>
          {myReg && myReg.status !== "cancelled" && (
            <span
              className="text-[0.62rem] font-semibold border rounded-full px-2 py-0.5"
              style={
                myReg.status === "confirmed" ? { color: "#4ade80", borderColor: "#4ade8040", background: "#4ade8010" }
                : myReg.status === "waitlist" ? { color: "#E9745F", borderColor: "#E9745F40", background: "#E9745F10" }
                : { color: "#fbbf24", borderColor: "#fbbf2440", background: "#fbbf2410" }
              }
            >
              {myReg.status === "confirmed" ? "✓ Inscrita" : myReg.status === "waitlist" ? "En espera" : "Pendiente"}
            </span>
          )}
          <ChevronRight size={13} className="text-muted-foreground/50" />
        </div>
      </div>
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Events() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  const { data: events = [], isLoading } = useQuery<ClientEvent[]>({
    queryKey: ["client-events"],
    queryFn: async () => (await api.get("/events?upcoming=true")).data,
  });

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);
  const usedTypes = [...new Set(events.map((e) => e.type))];

  return (
    <ClientAuthGuard>
      <ClientLayout>
        <div className="max-w-2xl mx-auto p-4 pb-6 space-y-5">
          {selectedId ? (
            <EventDetail eventId={selectedId} onBack={() => setSelectedId(null)} />
          ) : (
            <>
              {/* Header */}
              <div>
                <h1 className="text-2xl font-bold text-foreground">Eventos</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Masterclasses, workshops y más</p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilter("all")}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium border transition-all",
                    filter === "all"
                      ? "bg-[#76214D]/15 border-[#76214D]/40 text-[#76214D]"
                      : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                  )}
                >
                  Todos
                </button>
                {EVENT_TYPES.filter((t) => usedTypes.includes(t.value)).map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setFilter(t.value)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all",
                      filter === t.value ? "text-foreground" : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                    )}
                    style={filter === t.value ? {
                      background: `${t.color}18`, borderColor: `${t.color}50`, color: t.color,
                    } : {}}
                  >
                    <EventTypeIcon type={t.value} size={11} />
                    {t.label}
                  </button>
                ))}
              </div>

              {/* List */}
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-20 text-center">
                  <Calendar size={40} className="text-white/20 mx-auto mb-3" />
                  <p className="text-muted-foreground">No hay eventos disponibles.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((ev) => (
                    <EventCard key={ev.id} event={ev} onSelect={() => setSelectedId(ev.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
}
