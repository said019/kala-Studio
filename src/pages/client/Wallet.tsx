import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Stat,
  Tag,
  GhostButton,
  PrimaryButton,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import { InfoBanner } from "@/components/app/widgets";
import { KALA_RING_COLORS, RingsTriple, type KalaRing } from "@/components/kala/RingsTriple";
import { useToast } from "@/hooks/use-toast";
import {
  Download,
  ExternalLink,
  Gift,
  History,
  RefreshCw,
  CalendarDays,
  ScanQrCode,
  Sparkles,
} from "lucide-react";
import kalaIconUrl from "@/assets/kala/kala-icon.png";

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12.5 6.9c1.32 0 2.21.57 2.72 1.05l1.99-1.94C15.85 4.79 14.35 4 12.5 4c-3.07 0-5.64 2.05-6.52 4.82l2.32 1.8C9.03 8.57 10.6 6.9 12.5 6.9z" fill="#E9745F" />
    <path d="M18.77 12.16c0-.53-.08-1.04-.2-1.52H12.5v2.87h3.52c-.15.8-.61 1.48-1.3 1.94l2.01 1.56c1.2-1.1 1.88-2.73 1.88-4.85h.16z" fill="#76214D" />
    <path d="M8.3 13.38A4.6 4.6 0 018.06 12c0-.48.09-.94.24-1.38l-2.32-1.8A7.52 7.52 0 005 12c0 1.2.29 2.34.8 3.34l2.5-1.96z" fill="#F58A24" />
    <path d="M12.5 20c1.84 0 3.38-.61 4.51-1.65l-2.01-1.56c-.63.4-1.43.64-2.5.64-1.9 0-3.47-1.27-4.06-3h-2.5l-.03.1A7.99 7.99 0 0012.5 20z" fill="#778455" />
  </svg>
);

const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" fill="#76214D" />
  </svg>
);

type Membership = {
  plan_name?: string | null;
  class_limit?: number | null;
  classes_remaining?: number | null;
  start_date?: string | null;
  end_date?: string | null;
};

type WalletData = {
  user_name?: string;
  points?: number;
  qr_code?: string;
  membership?: Membership | null;
  rings?: {
    constancia?: { progress?: number; goal?: number };
    esfuerzo?: { progress?: number; goal?: number };
    conexion?: { progress?: number; goal?: number };
    rings_closed?: number;
  } | null;
  next_booking?: {
    class_name?: string | null;
    instructor_name?: string | null;
    date?: string | null;
    start_time?: string | null;
  } | null;
};

const percentFrom = (p: number, g: number) => (g <= 0 ? 0 : Math.min(100, Math.round((Math.max(0, p) / Math.max(1, g)) * 100)));

const formatShortDate = (value?: string | null) => {
  if (!value) return "Sin fecha";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
};

const Wallet = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [appleLoading, setAppleLoading] = useState(false);
  const [gwRetrying, setGwRetrying] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["wallet-pass"],
    queryFn: async () => (await api.get("/wallet/pass")).data,
  });
  const wallet: WalletData | null = data?.data ?? data ?? null;

  const metrics = useMemo(() => {
    const m = wallet?.membership;
    if (!m) {
      return {
        hasMembership: false,
        isUnlimited: false,
        total: 0,
        remaining: 0,
        used: 0,
        planName: "Sin paquete",
      };
    }
    const isUnlimited = m.class_limit === null || Number(m.class_limit) >= 9999;
    const total = isUnlimited ? 0 : Math.max(0, Number(m.class_limit || 0));
    const remaining = isUnlimited ? 0 : Math.max(0, Number(m.classes_remaining ?? total));
    const used = total > 0 ? Math.max(0, total - remaining) : 0;
    return {
      hasMembership: true,
      isUnlimited,
      total,
      remaining,
      used,
      planName: m.plan_name || "Kala Pass",
    };
  }, [wallet?.membership]);

  const ringsState = useMemo(() => {
    const points = Number(wallet?.points ?? 0);
    const r = wallet?.rings ?? undefined;
    const weeklyClassGoal = metrics.isUnlimited ? 5 : Math.max(1, Math.min(5, Math.ceil((metrics.total || 4) / 4)));
    const constanciaProgress = Number(r?.constancia?.progress ?? Math.min(weeklyClassGoal, metrics.used));
    const constanciaGoal = Number(r?.constancia?.goal ?? weeklyClassGoal);
    const esfuerzoGoal = Number(r?.esfuerzo?.goal ?? Math.max(1, Math.ceil(constanciaGoal * 0.6)));
    const esfuerzoProgress = Number(r?.esfuerzo?.progress ?? Math.min(esfuerzoGoal, Math.floor(constanciaProgress * 0.6)));
    const conexionGoal = Number(r?.conexion?.goal ?? 10);
    const conexionProgress = Number(r?.conexion?.progress ?? Math.min(conexionGoal, Math.floor((points % 500) / 50)));
    const rings: KalaRing[] = [
      { key: "constancia", label: "Constancia", value: `${constanciaProgress}/${constanciaGoal}`, goalLabel: "clases asistidas", progress: percentFrom(constanciaProgress, constanciaGoal), ...KALA_RING_COLORS.constancia },
      { key: "esfuerzo", label: "Esfuerzo", value: `${esfuerzoProgress}/${esfuerzoGoal}`, goalLabel: "clases intensas", progress: percentFrom(esfuerzoProgress, esfuerzoGoal), ...KALA_RING_COLORS.esfuerzo },
      { key: "conexion", label: "Conexión", value: `${conexionProgress}/${conexionGoal}`, goalLabel: "puntos comunidad", progress: percentFrom(conexionProgress, conexionGoal), ...KALA_RING_COLORS.conexion },
    ];
    const ringsClosed = Number.isFinite(Number(r?.rings_closed)) ? Number(r?.rings_closed) : rings.filter((x) => x.progress >= 100).length;
    return { rings, ringsClosed };
  }, [wallet?.points, wallet?.rings, metrics]);

  const { data: gwData, isLoading: gwLoading } = useQuery({
    queryKey: ["google-wallet-save"],
    queryFn: async () => {
      const resp = await api.get("/wallet/google/save-url");
      return resp.data?.data ?? resp.data ?? null;
    },
    retry: 2,
    retryDelay: 1000,
    staleTime: 5 * 60 * 1000,
  });
  const googleSaveUrl = gwData?.saveUrl || null;

  const handleGoogleRetry = async () => {
    setGwRetrying(true);
    try {
      await qc.invalidateQueries({ queryKey: ["google-wallet-save"] });
    } finally {
      setTimeout(() => setGwRetrying(false), 1200);
    }
  };

  const handleAppleWalletDownload = async () => {
    setAppleLoading(true);
    try {
      const resp = await api.get("/wallet/apple/pkpass", { responseType: "blob" });
      const contentType = resp.headers?.["content-type"] || "";
      if (contentType.includes("application/vnd.apple.pkpass")) {
        const blob = new Blob([resp.data], { type: "application/vnd.apple.pkpass" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "kala-pass.pkpass";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 500);
        toast({ title: "Pase descargado", description: "Ábrelo para agregarlo a Apple Wallet." });
      } else {
        toast({ title: "Pase no disponible", description: "Inténtalo de nuevo en un momento.", variant: "destructive" });
      }
    } catch {
      toast({ title: "No se pudo descargar el pase.", variant: "destructive" });
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Kala Club"
          title={<>Tu pase</>}
          titleAccent="del estudio."
          subtitle="Tres anillos que cuentan tu semana y un QR para hacer check-in al llegar."
        />

        {isLoading ? (
          <SkeletonRow height={520} />
        ) : (
          <Section>
            {/* ── Double-Bezel pass card ── */}
            <div
              className="relative rounded-[2.4rem] p-1.5 sm:p-2 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{
                backgroundColor: KALA.cream,
                border: `1px solid ${KALA.border}`,
                boxShadow:
                  "0 30px 80px -40px rgba(118,33,77,0.35), inset 0 1px 0 rgba(255,255,255,0.5)",
              }}
            >
              <div
                className="relative overflow-hidden"
                style={{
                  borderRadius: "calc(2.4rem - 0.375rem)",
                  backgroundColor: KALA.berry,
                  color: KALA.cream,
                  boxShadow:
                    "inset 0 1px 0 rgba(255,247,242,0.16), inset 0 -40px 80px -40px rgba(46,32,28,0.35)",
                }}
              >
                {/* Decorative icon watermark */}
                <img
                  src={kalaIconUrl}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -bottom-12 h-[280px] w-[280px] object-contain opacity-[0.10] select-none"
                  style={{ filter: "brightness(0) invert(1) saturate(0)" }}
                />

                {/* ── Header row ── */}
                <header className="relative flex items-start justify-between gap-4 px-6 sm:px-8 pt-6 sm:pt-7">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid h-12 w-12 sm:h-14 sm:w-14 place-items-center rounded-2xl shrink-0"
                      style={{
                        backgroundColor: `${KALA.cream}15`,
                        border: `1px solid ${KALA.cream}24`,
                        boxShadow: "inset 0 1px 0 rgba(255,247,242,0.2)",
                      }}
                    >
                      <img
                        src={kalaIconUrl}
                        alt=""
                        className="h-8 w-8 sm:h-9 sm:w-9 object-contain"
                        style={{ filter: "brightness(0) invert(1)" }}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[0.6rem] font-medium uppercase tracking-[0.32em]" style={{ color: KALA.cream, opacity: 0.7 }}>
                        Kala Club
                      </p>
                      <h2
                        className="font-bebas leading-none mt-1 truncate"
                        style={{ color: KALA.cream, fontSize: "clamp(1.4rem, 2.4vw, 1.85rem)", letterSpacing: "0.01em" }}
                      >
                        {metrics.planName}
                      </h2>
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6rem] font-medium uppercase tracking-[0.22em] shrink-0"
                    style={{
                      backgroundColor: metrics.hasMembership ? `${KALA.olive}30` : `${KALA.coral}40`,
                      color: KALA.cream,
                      border: `1px solid ${KALA.cream}1f`,
                    }}
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: KALA.cream }} />
                    {metrics.hasMembership ? "Activo" : "Sin paquete"}
                  </span>
                </header>

                {/* ── Card body: 3 columns desktop, stack mobile ── */}
                <div className="relative grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-7 lg:gap-9 items-center px-6 sm:px-8 py-7 sm:py-9">
                  {/* Rings stage */}
                  <div className="flex justify-center lg:justify-start">
                    <div
                      className="rounded-full p-2.5 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
                      style={{
                        backgroundColor: `${KALA.ink}cc`,
                        border: `1px solid ${KALA.cream}22`,
                        boxShadow:
                          "inset 0 1px 0 rgba(255,247,242,0.18), 0 16px 40px -12px rgba(0,0,0,0.45)",
                      }}
                    >
                      <RingsTriple
                        rings={ringsState.rings}
                        centerLabel="esta semana"
                        centerValue={`${ringsState.ringsClosed}/3`}
                        centerSub="anillos"
                        shellClassName="border-transparent shadow-none"
                      />
                    </div>
                  </div>

                  {/* Right column: anillo bars + cuadricula */}
                  <div className="flex flex-col gap-5 min-w-0">
                    <ul className="grid grid-cols-1 gap-2.5 list-none m-0 p-0" data-stagger>
                      {ringsState.rings.map((ring) => (
                        <li
                          key={ring.key}
                          data-stagger-item
                          className="rounded-2xl px-4 py-3"
                          style={{
                            backgroundColor: `${KALA.cream}10`,
                            border: `1px solid ${KALA.cream}14`,
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em]" style={{ color: KALA.cream, opacity: 0.78 }}>
                              {ring.label}
                            </span>
                            <span className="font-bebas tabular-nums" style={{ color: KALA.cream, fontSize: "1rem" }}>
                              {ring.value}
                            </span>
                          </div>
                          <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${KALA.cream}1a` }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${ring.progress}%`,
                                backgroundColor: ring.color,
                                transition: "width 1100ms var(--ease-kala-out)",
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>

                    {/* Stats: 3 cols hairline */}
                    <div
                      className="grid grid-cols-3 gap-0 rounded-2xl overflow-hidden"
                      style={{ backgroundColor: `${KALA.cream}0d`, border: `1px solid ${KALA.cream}14` }}
                    >
                      {[
                        { label: "Por usar", value: metrics.isUnlimited ? "∞" : metrics.remaining },
                        { label: "Vence", value: formatShortDate(wallet?.membership?.end_date) },
                        { label: "Puntos", value: (wallet?.points ?? 0).toLocaleString("es-MX") },
                      ].map((s, i, arr) => (
                        <div
                          key={s.label}
                          className="px-4 py-3"
                          style={i < arr.length - 1 ? { borderRight: `1px solid ${KALA.cream}14` } : undefined}
                        >
                          <p className="text-[0.58rem] uppercase tracking-[0.2em]" style={{ color: KALA.cream, opacity: 0.65 }}>
                            {s.label}
                          </p>
                          <p
                            className="font-bebas leading-none mt-1 tabular-nums truncate"
                            style={{ color: KALA.cream, fontSize: "clamp(1.05rem, 1.6vw, 1.35rem)" }}
                          >
                            {s.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── QR strip (inner double-bezel) ── */}
                {wallet?.qr_code && (
                  <div className="relative px-4 sm:px-6 pb-6">
                    <div
                      className="rounded-2xl p-1.5"
                      style={{
                        backgroundColor: `${KALA.cream}18`,
                        border: `1px solid ${KALA.cream}26`,
                        boxShadow: "inset 0 1px 0 rgba(255,247,242,0.18)",
                      }}
                    >
                      <div
                        className="rounded-xl px-5 py-4 flex items-center gap-5"
                        style={{
                          backgroundColor: KALA.cream,
                          color: KALA.ink,
                        }}
                      >
                        <div
                          className="grid place-items-center rounded-xl p-2 shrink-0"
                          style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}
                        >
                          <QRCodeSVG value={wallet.qr_code} size={92} bgColor={KALA.cream} fgColor={KALA.ink} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[0.62rem] font-medium uppercase tracking-[0.24em] flex items-center gap-1.5" style={{ color: KALA.berry }}>
                            <ScanQrCode size={12} />
                            Check-in en recepción
                          </p>
                          <p className="font-bebas leading-tight mt-1.5 truncate" style={{ color: KALA.ink, fontSize: "clamp(1.15rem, 2vw, 1.4rem)" }}>
                            {wallet?.user_name || "Tu pase"}
                          </p>
                          <p className="text-[0.78rem] mt-1" style={{ color: KALA.ink, opacity: 0.6 }}>
                            Presenta este código al llegar.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Next class banner inside drench */}
                {wallet?.next_booking && (
                  <div className="relative px-6 sm:px-8 pb-6 sm:pb-7">
                    <div
                      className="rounded-2xl px-4 py-3 flex items-center gap-3"
                      style={{
                        backgroundColor: `${KALA.olive}1a`,
                        border: `1px solid ${KALA.olive}55`,
                        color: KALA.cream,
                      }}
                    >
                      <span
                        className="grid h-9 w-9 place-items-center rounded-full shrink-0"
                        style={{ backgroundColor: KALA.olive, color: KALA.cream }}
                      >
                        <CalendarDays size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[0.6rem] uppercase tracking-[0.22em]" style={{ color: KALA.cream, opacity: 0.78 }}>
                          Próxima clase
                        </p>
                        <p className="font-bebas leading-tight truncate mt-0.5" style={{ color: KALA.cream, fontSize: "1.1rem" }}>
                          {wallet.next_booking.class_name || "Barre"}
                          <span className="ml-2 text-[0.78rem] font-alilato font-normal italic opacity-85">
                            {formatShortDate(wallet.next_booking.date)} ·{" "}
                            {String(wallet.next_booking.start_time || "").slice(0, 5)}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pass legend */}
            <p
              className="mt-4 text-center text-[0.66rem] uppercase tracking-[0.24em] flex items-center justify-center gap-2"
              style={{ color: KALA.ink, opacity: 0.55 }}
            >
              <Sparkles size={11} />
              Tu pase del estudio
              <Sparkles size={11} />
            </p>
          </Section>
        )}

        {/* ── Phone previews: Apple & Google ── */}
        <Section title="Cómo se ve en tu teléfono">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Apple Wallet preview */}
            <figure className="m-0 flex flex-col items-center gap-3">
              <div
                className="relative w-full max-w-[300px] rounded-[28px] p-5 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5"
                style={{
                  backgroundColor: KALA.berry,
                  color: KALA.cream,
                  boxShadow: "0 22px 50px -20px rgba(118,33,77,0.55), inset 0 1px 0 rgba(255,247,242,0.15)",
                }}
              >
                <img
                  src={kalaIconUrl}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-6 -bottom-8 h-[160px] w-[160px] object-contain opacity-[0.10]"
                  style={{ filter: "brightness(0) invert(1) saturate(0)" }}
                />
                <div className="relative flex items-start justify-between gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ backgroundColor: `${KALA.cream}1a`, border: `1px solid ${KALA.cream}28` }}>
                    <img src={kalaIconUrl} alt="" className="h-6 w-6 object-contain" style={{ filter: "brightness(0) invert(1)" }} />
                  </span>
                  <span className="text-[0.58rem] font-medium uppercase tracking-[0.24em]" style={{ color: KALA.cream, opacity: 0.7 }}>
                    Wallet
                  </span>
                </div>
                <div className="relative mt-5">
                  <p className="text-[0.55rem] uppercase tracking-[0.22em]" style={{ color: KALA.cream, opacity: 0.6 }}>
                    {metrics.planName}
                  </p>
                  <p className="font-bebas mt-1 leading-none truncate" style={{ color: KALA.cream, fontSize: "1.45rem" }}>
                    {wallet?.user_name || "Alumna"}
                  </p>
                </div>
                <div className="relative mt-5 grid grid-cols-3 gap-3">
                  {[
                    { l: "Anillos", v: `${ringsState.ringsClosed}/3` },
                    { l: "Restan", v: metrics.isUnlimited ? "∞" : String(metrics.remaining) },
                    { l: "Puntos", v: String(wallet?.points ?? 0) },
                  ].map((s) => (
                    <div key={s.l}>
                      <p className="text-[0.5rem] uppercase tracking-[0.18em]" style={{ color: KALA.cream, opacity: 0.55 }}>
                        {s.l}
                      </p>
                      <p className="font-bebas leading-none tabular-nums mt-1" style={{ color: KALA.cream, fontSize: "0.95rem" }}>
                        {s.v}
                      </p>
                    </div>
                  ))}
                </div>
                {wallet?.qr_code && (
                  <div className="relative mt-5 grid place-items-center">
                    <div className="rounded-lg p-1.5" style={{ backgroundColor: KALA.cream }}>
                      <QRCodeSVG value={wallet.qr_code} size={80} bgColor={KALA.cream} fgColor={KALA.ink} />
                    </div>
                  </div>
                )}
              </div>
              <figcaption className="text-[0.66rem] uppercase tracking-[0.22em]" style={{ color: KALA.ink, opacity: 0.55 }}>
                Apple Wallet
              </figcaption>
            </figure>

            {/* Google Wallet preview */}
            <figure className="m-0 flex flex-col items-center gap-3">
              <div
                className="relative w-full max-w-[300px] rounded-[24px] overflow-hidden transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5"
                style={{
                  backgroundColor: KALA.cream,
                  border: `1px solid ${KALA.border}`,
                  boxShadow: "0 22px 50px -20px rgba(46,32,28,0.18)",
                }}
              >
                {/* Top accent bar Google-style */}
                <div className="h-2" style={{ backgroundColor: KALA.berry }} />
                <div className="px-5 pt-4 pb-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl shrink-0" style={{ backgroundColor: KALA.blush }}>
                      <img src={kalaIconUrl} alt="" className="h-7 w-7 object-contain" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.6rem] font-medium uppercase tracking-[0.22em]" style={{ color: KALA.berry }}>
                        Kala Barre Studio
                      </p>
                      <p className="text-[0.78rem] truncate" style={{ color: KALA.ink, opacity: 0.7 }}>
                        Kala Club
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-[0.58rem] uppercase tracking-[0.22em]" style={{ color: KALA.ink, opacity: 0.55 }}>
                      Puntos
                    </p>
                    <p className="font-bebas leading-none mt-1 tabular-nums" style={{ color: KALA.berry, fontSize: "1.85rem" }}>
                      {(wallet?.points ?? 0).toLocaleString("es-MX")}
                    </p>
                  </div>
                  <div
                    className="mt-4 grid grid-cols-2 gap-0 rounded-xl overflow-hidden"
                    style={{ backgroundColor: KALA.blush }}
                  >
                    {[
                      { l: "Plan", v: metrics.planName },
                      { l: "Anillos", v: `${ringsState.ringsClosed}/3` },
                    ].map((s, i) => (
                      <div
                        key={s.l}
                        className="px-3 py-2.5"
                        style={i === 0 ? { borderRight: `1px solid ${KALA.border}` } : undefined}
                      >
                        <p className="text-[0.55rem] uppercase tracking-[0.2em]" style={{ color: KALA.berry, opacity: 0.85 }}>
                          {s.l}
                        </p>
                        <p className="text-[0.84rem] font-medium truncate mt-0.5" style={{ color: KALA.ink }}>
                          {s.v}
                        </p>
                      </div>
                    ))}
                  </div>
                  {wallet?.qr_code && (
                    <div className="mt-4 grid place-items-center">
                      <div className="rounded-lg p-1.5" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
                        <QRCodeSVG value={wallet.qr_code} size={80} bgColor={KALA.cream} fgColor={KALA.ink} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <figcaption className="text-[0.66rem] uppercase tracking-[0.22em]" style={{ color: KALA.ink, opacity: 0.55 }}>
                Google Wallet
              </figcaption>
            </figure>
          </div>
        </Section>

        {/* Add to phone */}
        <Section title="Agregar a tu teléfono">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {gwLoading || gwRetrying ? (
              <div
                className="flex items-center justify-center gap-3 rounded-2xl py-3.5"
                style={{ backgroundColor: KALA.blush, color: KALA.ink, opacity: 0.65 }}
              >
                <RefreshCw size={15} className="animate-spin" />
                <span className="text-[0.84rem]">Cargando Google Wallet…</span>
              </div>
            ) : googleSaveUrl ? (
              <a
                href={googleSaveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 rounded-2xl py-3.5 no-underline transition-colors"
                style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}`, color: KALA.ink }}
              >
                <GoogleIcon />
                <span className="text-[0.84rem] font-medium">Agregar a Google Wallet</span>
                <ExternalLink size={13} style={{ color: KALA.berry, opacity: 0.7 }} />
              </a>
            ) : (
              <button
                onClick={handleGoogleRetry}
                className="flex items-center justify-center gap-3 rounded-2xl py-3.5 cursor-pointer transition-colors bg-transparent"
                style={{ border: `1px dashed ${KALA.border}`, color: KALA.ink, opacity: 0.7 }}
              >
                <GoogleIcon />
                <span className="text-[0.84rem]">Reintentar Google Wallet</span>
                <RefreshCw size={13} />
              </button>
            )}

            <button
              onClick={handleAppleWalletDownload}
              disabled={appleLoading}
              className="flex items-center justify-center gap-3 rounded-2xl py-3.5 cursor-pointer transition-colors bg-transparent disabled:opacity-60"
              style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}`, color: KALA.ink }}
            >
              <AppleIcon />
              <span className="text-[0.84rem] font-medium">
                {appleLoading ? "Preparando…" : "Agregar a Apple Wallet"}
              </span>
              {!appleLoading && <Download size={13} style={{ color: KALA.berry, opacity: 0.7 }} />}
            </button>
          </div>
        </Section>

        {/* Quick actions */}
        <Section>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              to="/app/wallet/history"
              className="flex items-center justify-center gap-2 rounded-2xl py-3.5 no-underline transition-colors"
              style={{ backgroundColor: KALA.blush, color: KALA.berry }}
            >
              <History size={15} />
              <span className="text-[0.78rem] font-medium uppercase tracking-[0.18em]">Historial</span>
            </Link>
            <Link
              to="/app/wallet/rewards"
              className="flex items-center justify-center gap-2 rounded-2xl py-3.5 no-underline transition-colors"
              style={{ backgroundColor: KALA.berry, color: KALA.cream }}
            >
              <Gift size={15} />
              <span className="text-[0.78rem] font-medium uppercase tracking-[0.18em]">Canjear puntos</span>
            </Link>
            <Link
              to="/app/classes"
              className="flex items-center justify-center gap-2 rounded-2xl py-3.5 no-underline transition-colors"
              style={{ backgroundColor: `${KALA.orange}1a`, color: KALA.orange }}
            >
              <CalendarDays size={15} />
              <span className="text-[0.78rem] font-medium uppercase tracking-[0.18em]">Reservar clase</span>
            </Link>
          </div>
        </Section>

        {!metrics.hasMembership && (
          <Section>
            <InfoBanner
              tone="coral"
              title="Aún no activas un paquete."
              description="Compra uno y empezamos a contar tus anillos automáticamente."
              action={<PrimaryButton size="sm" to="/app/checkout">Ver paquetes</PrimaryButton>}
            />
          </Section>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Wallet;
