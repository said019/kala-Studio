import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { KALA_RING_COLORS, RingsTriple, type KalaRing } from "@/components/kala/RingsTriple";
import { CalendarDays, Download, ExternalLink, Gift, History, RefreshCw, Target } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import opheliaLogo from "@/assets/ophelia-logo-full.webp";
import { useMemo, useState } from "react";

const GoogleIcon = ({ color = "full" }: { color?: "full" | "gray" | "palette" }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.5 6.9c1.32 0 2.21.57 2.72 1.05l1.99-1.94C15.85 4.79 14.35 4 12.5 4c-3.07 0-5.64 2.05-6.52 4.82l2.32 1.8C9.03 8.57 10.6 6.9 12.5 6.9z" fill={color === "full" ? "#EA4335" : color === "palette" ? "#F58A24" : "#888"} />
    <path d="M18.77 12.16c0-.53-.08-1.04-.2-1.52H12.5v2.87h3.52c-.15.8-.61 1.48-1.3 1.94l2.01 1.56c1.2-1.1 1.88-2.73 1.88-4.85h.16z" fill={color === "full" ? "#4285F4" : color === "palette" ? "#76214D" : "#888"} />
    <path d="M8.3 13.38A4.6 4.6 0 018.06 12c0-.48.09-.94.24-1.38l-2.32-1.8A7.52 7.52 0 005 12c0 1.2.29 2.34.8 3.34l2.5-1.96z" fill={color === "full" ? "#FBBC05" : color === "palette" ? "#F58A24" : "#888"} />
    <path d="M12.5 20c1.84 0 3.38-.61 4.51-1.65l-2.01-1.56c-.63.4-1.43.64-2.5.64-1.9 0-3.47-1.27-4.06-3h-2.5l-.03.1A7.99 7.99 0 0012.5 20z" fill={color === "full" ? "#34A853" : color === "palette" ? "#778455" : "#888"} />
  </svg>
);

const AppleIcon = ({ color = "white" }: { color?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" fill={color} />
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

const percentFrom = (progress: number, goal: number) => {
  if (!goal) return 0;
  return Math.min(100, Math.round((Math.max(0, progress) / Math.max(1, goal)) * 100));
};

const formatShortDate = (value?: string | null) => {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
};

const getMembershipMetrics = (membership?: Membership | null) => {
  if (!membership) {
    return {
      hasMembership: false,
      isUnlimited: false,
      total: 0,
      remaining: 0,
      used: 0,
      percent: 0,
      label: "Sin meta activa",
      remainingLabel: "Activa un plan",
      planName: "Kala Pass",
    };
  }

  const isUnlimited = membership.class_limit === null || Number(membership.class_limit) >= 9999;
  if (isUnlimited) {
    return {
      hasMembership: true,
      isUnlimited: true,
      total: 0,
      remaining: 0,
      used: 0,
      percent: 100,
      label: "Meta abierta",
      remainingLabel: "Clases ilimitadas",
      planName: membership.plan_name || "Kala Pass",
    };
  }

  const total = Math.max(0, Number(membership.class_limit || 0));
  const remaining = Math.max(0, Number(membership.classes_remaining ?? total));
  const used = Math.max(0, total - remaining);
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return {
    hasMembership: true,
    isUnlimited: false,
    total,
    remaining,
    used,
    percent,
    label: total > 0 ? `${used}/${total} completadas` : "Sin meta activa",
    remainingLabel: total > 0 ? `${remaining} restantes` : "Sin clases asignadas",
    planName: membership.plan_name || "Kala Pass",
  };
};

const getWalletRings = (metrics: ReturnType<typeof getMembershipMetrics>, points: number, rings?: WalletData["rings"]) => {
  const weeklyClassGoal = metrics.isUnlimited ? 5 : Math.max(1, Math.min(5, Math.ceil((metrics.total || 4) / 4)));
  const constanciaProgress = Number(rings?.constancia?.progress ?? Math.min(weeklyClassGoal, metrics.used));
  const constanciaGoal = Number(rings?.constancia?.goal ?? weeklyClassGoal);
  const esfuerzoGoal = Number(rings?.esfuerzo?.goal ?? Math.max(1, Math.ceil(constanciaGoal * 0.6)));
  const esfuerzoProgress = Number(rings?.esfuerzo?.progress ?? Math.min(esfuerzoGoal, Math.floor(constanciaProgress * 0.6)));
  const conexionGoal = Number(rings?.conexion?.goal ?? 10);
  const conexionProgress = Number(rings?.conexion?.progress ?? Math.min(conexionGoal, Math.floor((points % 500) / 50)));

  const nextRings: KalaRing[] = [
    {
      key: "constancia",
      label: "Constancia",
      value: `${constanciaProgress}/${constanciaGoal}`,
      goalLabel: "clases asistidas",
      progress: percentFrom(constanciaProgress, constanciaGoal),
      ...KALA_RING_COLORS.constancia,
    },
    {
      key: "esfuerzo",
      label: "Esfuerzo",
      value: `${esfuerzoProgress}/${esfuerzoGoal}`,
      goalLabel: "clases intensas",
      progress: percentFrom(esfuerzoProgress, esfuerzoGoal),
      ...KALA_RING_COLORS.esfuerzo,
    },
    {
      key: "conexion",
      label: "Conexión",
      value: `${conexionProgress}/${conexionGoal}`,
      goalLabel: "puntos comunidad",
      progress: percentFrom(conexionProgress, conexionGoal),
      ...KALA_RING_COLORS.conexion,
    },
  ];

  const ringsClosed = Number.isFinite(Number(rings?.rings_closed))
    ? Number(rings?.rings_closed)
    : nextRings.filter((ring) => ring.progress >= 100).length;

  return { rings: nextRings, ringsClosed };
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
  const metrics = useMemo(() => getMembershipMetrics(wallet?.membership), [wallet?.membership]);
  const ringState = useMemo(() => getWalletRings(metrics, Number(wallet?.points ?? 0), wallet?.rings), [metrics, wallet?.points, wallet?.rings]);

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
      setTimeout(() => setGwRetrying(false), 1500);
    }
  };

  const openWebPass = async () => {
    try {
      if (!wallet) return;

      const userName = wallet.user_name || "Miembro Kala";
      const points = wallet.points ?? 0;
      const qrCode = wallet.qr_code || "";
      const plan = metrics.planName;
      const validity = wallet.membership?.end_date ? formatShortDate(wallet.membership.end_date) : "Sin vigencia";
      const nextClass = wallet.next_booking
        ? `${wallet.next_booking.class_name || "Barre"} · ${formatShortDate(wallet.next_booking.date)} ${String(wallet.next_booking.start_time || "").slice(0, 5)}`
        : "Sin reserva próxima";

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Kala Pass</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#FFF7F2;color:#2E201C;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.pass{width:100%;max-width:380px;border-radius:28px;overflow:hidden;background:#FFFFFF;border:1px solid rgba(118,33,77,.18);box-shadow:0 20px 60px rgba(93,58,43,.14)}
.header{padding:22px 22px 10px;display:flex;align-items:center;justify-content:space-between}
.brand{font-size:18px;font-weight:850;letter-spacing:.01em}
.badge{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#76214D;border:1px solid rgba(118,33,77,.24);padding:5px 10px;border-radius:999px;background:#FCE6E1}
.name{padding:0 22px;color:#7B5B52;font-size:13px}
.sphere{margin:18px auto 14px;width:168px;height:168px;border-radius:999px;display:grid;place-items:center;background:conic-gradient(#76214D ${metrics.percent}%, #F3C6D6 0);position:relative}
.sphere:before{content:"";position:absolute;inset:15px;border-radius:999px;background:#FFFFFF;border:7px solid #D7DDC1}
.sphere:after{content:"";position:absolute;inset:-7px;border-radius:999px;border:4px solid #F58A24;clip-path:polygon(50% 0,100% 0,100% 45%,50% 45%)}
.sphere-content{position:relative;text-align:center}
.kicker{font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:#76214D;font-weight:800}
.percent{font-size:42px;line-height:1;font-weight:950;margin-top:4px}
.caption{font-size:12px;color:#7B5B52;margin-top:5px}
.fields{padding:6px 22px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.field{border:1px solid rgba(118,33,77,.12);border-radius:14px;padding:11px 12px;background:#FFF7F2}
.field.wide{grid-column:1/-1}
.label{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#76214D;font-weight:800}
.value{font-size:13px;line-height:1.25;color:#2E201C;margin-top:4px;font-weight:700}
.qr{display:flex;justify-content:center;padding:0 22px 20px}
.qr img{width:150px;height:150px;background:#fff;border-radius:18px;padding:12px}
.hint{text-align:center;font-size:11px;color:#B78B7E;padding:0 22px 22px}
.footer{display:flex;gap:8px;padding:0 22px 22px}
button{flex:1;border:0;border-radius:14px;padding:12px 14px;font-weight:750;color:#2E201C;background:#F58A24}
button.secondary{background:#FFF7F2;color:#2E201C;border:1px solid rgba(118,33,77,.16)}
</style>
</head>
<body>
<div class="pass">
  <div class="header"><div class="brand">Kala Barre Studio</div><div class="badge">Club</div></div>
  <div class="name">${userName}</div>
  <div class="sphere"><div class="sphere-content"><div class="kicker">anillos</div><div class="percent">${ringState.ringsClosed}/3</div><div class="caption">esta semana</div></div></div>
  <div class="fields">
    <div class="field wide"><div class="label">Plan</div><div class="value">${plan}</div></div>
    <div class="field wide"><div class="label">Constancia</div><div class="value">${ringState.rings[0].value} · ${ringState.rings[0].goalLabel}</div></div>
    <div class="field"><div class="label">Esfuerzo</div><div class="value">${ringState.rings[1].value}</div></div>
    <div class="field"><div class="label">Conexión</div><div class="value">${ringState.rings[2].value}</div></div>
    <div class="field"><div class="label">Disponibles</div><div class="value">${metrics.remainingLabel}</div></div>
    <div class="field"><div class="label">Vigencia</div><div class="value">${validity}</div></div>
    <div class="field wide"><div class="label">Próxima clase</div><div class="value">${nextClass}</div></div>
    <div class="field wide"><div class="label">Puntos Kala Club</div><div class="value">${points.toLocaleString("es-MX")} pts</div></div>
  </div>
  <div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrCode)}&bgcolor=FFFFFF&color=322028" alt="QR" /></div>
  <div class="hint">Presenta este QR al llegar al estudio.</div>
  <div class="footer"><button onclick="window.print()">Imprimir</button><button class="secondary" onclick="alert('En Safari: Compartir, Agregar a pantalla de inicio')">Guardar</button></div>
</div>
</body>
</html>`;
      const newWindow = window.open("", "_blank");
      if (newWindow) {
        newWindow.document.open();
        newWindow.document.write(html);
        newWindow.document.close();
      }
    } catch (e) {
      console.error("Web pass error:", e);
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
      } else if (contentType.includes("text/html")) {
        const htmlText = await resp.data.text();
        const newWindow = window.open("", "_blank");
        if (newWindow) {
          newWindow.document.open();
          newWindow.document.write(htmlText);
          newWindow.document.close();
          toast({ title: "Pase web abierto", description: "Puedes guardarlo desde el navegador." });
        } else {
          toast({ title: "Ventana bloqueada", description: "Permite ventanas emergentes e intenta de nuevo.", variant: "destructive" });
        }
      } else if (contentType.includes("application/json")) {
        const text = await resp.data.text();
        try {
          const json = JSON.parse(text);
          if (json.fallback === "webpass") {
            toast({ title: "Pase .pkpass no disponible", description: "Se abrirá tu pase digital web." });
            openWebPass();
          } else {
            toast({ title: "Error", description: json.message || "No se pudo generar el pase.", variant: "destructive" });
          }
        } catch {
          toast({ title: "Error", description: "Respuesta inesperada del servidor.", variant: "destructive" });
        }
      } else {
        toast({ title: "Error", description: "No se pudo generar el pase. Intenta de nuevo.", variant: "destructive" });
      }
    } catch (err: any) {
      console.error("Apple Wallet error:", err);
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json.fallback === "webpass") {
            toast({ title: "Pase .pkpass no disponible", description: "Se abrirá tu pase digital web." });
            openWebPass();
            return;
          }
        } catch {
          // Ignore parse error and show generic toast below.
        }
      }
      toast({ title: "Error", description: "No se pudo descargar el pase. Intenta de nuevo.", variant: "destructive" });
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="mx-auto max-w-md space-y-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#76214D]">Kala Club</p>
            <h1 className="text-2xl font-black tracking-tight">Tu pase</h1>
          </div>

          {isLoading ? (
            <Skeleton className="h-[560px] w-full rounded-[28px]" />
          ) : (
            <div className="overflow-hidden rounded-[28px] border border-[#76214D]/15 bg-white text-[#2E201C] shadow-2xl shadow-[#8a5d4a]/10">
              <div className="flex items-start justify-between gap-4 px-6 pt-6">
                <img src={opheliaLogo} alt="Kala Barre Studio" className="h-10 w-auto opacity-95" />
                <div className="rounded-full border border-[#76214D]/20 bg-[#FCE6E1] px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#76214D]">
                  Club
                </div>
              </div>

              <div className="px-6 pt-5">
                <p className="text-sm font-medium text-[#7B5B52]">{metrics.planName}</p>
                <div className="mt-5 flex flex-col items-center gap-5">
                  <RingsTriple
                    rings={ringState.rings}
                    centerLabel="esta semana"
                    centerValue={`${ringState.ringsClosed}/3`}
                    centerSub="anillos cerrados"
                    light
                    shellClassName="scale-[0.86] sm:scale-[0.9] -my-5"
                  />
                  <div className="w-full space-y-3">
                    <div>
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[#76214D]">anillos semanales</p>
                      <p className="mt-1 text-2xl font-black leading-tight">{ringState.ringsClosed} de 3 cerrados</p>
                      <p className="mt-1 text-sm text-[#7B5B52]">{metrics.remainingLabel}</p>
                    </div>
                    <div className="grid gap-2">
                      {ringState.rings.map((ring) => (
                        <div key={ring.key} className="rounded-2xl border border-[#76214D]/10 bg-[#FFF7F2] p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em]" style={{ color: ring.color }}>{ring.label}</p>
                            <p className="text-sm font-bold">{ring.value}</p>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#E8CAC1]/65">
                            <div className="h-full rounded-full" style={{ width: `${ring.progress}%`, backgroundColor: ring.color }} />
                          </div>
                          <p className="mt-1 text-[0.68rem] text-[#7B5B52]">{ring.goalLabel}</p>
                        </div>
                      ))}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-2xl border border-[#76214D]/10 bg-white p-3">
                          <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[#76214D]">vigencia</p>
                          <p className="mt-1 text-sm font-bold">{formatShortDate(wallet?.membership?.end_date)}</p>
                        </div>
                        <div className="rounded-2xl border border-[#76214D]/10 bg-white p-3">
                          <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[#76214D]">puntos</p>
                          <p className="mt-1 text-sm font-bold">{(wallet?.points ?? 0).toLocaleString("es-MX")} pts</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {wallet?.next_booking && (
                  <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#778455]/25 bg-[#778455]/12 p-3">
                    <CalendarDays size={18} className="shrink-0 text-[#778455]" />
                    <div className="min-w-0">
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#778455]">próxima clase</p>
                      <p className="truncate text-sm font-semibold">
                        {wallet.next_booking.class_name || "Barre"} · {formatShortDate(wallet.next_booking.date)} {String(wallet.next_booking.start_time || "").slice(0, 5)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {wallet?.qr_code && (
                <div className="px-6 py-6">
                  <div className="mx-auto flex aspect-square max-w-[190px] items-center justify-center rounded-[24px] bg-[#FFF7F2] p-4 shadow-xl shadow-[#8a5d4a]/10">
                    <QRCodeSVG value={wallet.qr_code} size={150} className="h-full w-full" />
                  </div>
                  <p className="mx-auto mt-3 max-w-[220px] text-center text-xs leading-relaxed text-[#B78B7E]">
                    Presenta este QR al llegar. Tus anillos se actualizan con cada visita.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Agregar a tu teléfono
            </p>
            <div className="flex flex-col gap-2.5">
              {gwLoading || gwRetrying ? (
                <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#76214D]/10 bg-white py-3.5">
                  <GoogleIcon />
                  <span className="text-sm font-medium text-[#7B5B52]">Cargando Google Wallet...</span>
                </div>
              ) : googleSaveUrl ? (
                <a
                  href={googleSaveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 rounded-2xl border border-[#76214D]/15 bg-white py-3.5 shadow-md shadow-[#8a5d4a]/10 transition-all hover:border-[#76214D]/30"
                >
                  <GoogleIcon color="palette" />
                  <span className="text-sm font-semibold text-[#2E201C]">Agregar a Google Wallet</span>
                  <ExternalLink size={14} className="text-[#F58A24]/75" />
                </a>
              ) : (
                <button
                  onClick={handleGoogleRetry}
                  className="flex items-center justify-center gap-3 rounded-2xl border border-[#76214D]/15 bg-white py-3.5 transition-all hover:border-[#76214D]/30"
                >
                  <GoogleIcon color="palette" />
                  <span className="text-sm font-medium text-[#2E201C]/70">Reintentar Google Wallet</span>
                  <RefreshCw size={13} className="text-[#F58A24]/70" />
                </button>
              )}

              <button
                onClick={handleAppleWalletDownload}
                disabled={appleLoading}
                className={cn(
                  "flex items-center justify-center gap-3 rounded-2xl border border-[#76214D]/15 bg-white py-3.5 shadow-md shadow-[#8a5d4a]/10 transition-all hover:border-[#76214D]/30",
                  appleLoading && "cursor-wait opacity-60",
                )}
              >
                <AppleIcon color="#F58A24" />
                <span className="text-sm font-semibold text-[#2E201C]">
                  {appleLoading ? "Preparando pase..." : "Agregar a Apple Wallet"}
                </span>
                {!appleLoading && <Download size={14} className="text-[#F58A24]/75" />}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Link
              to="/app/wallet/history"
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#76214D]/15 bg-white py-3.5 text-sm font-medium text-[#2E201C] transition-all hover:border-[#76214D]/30 hover:bg-[#FCE6E1]/50"
            >
              <History size={16} className="text-[#76214D]" />
              Historial
            </Link>
            <Link
              to="/app/wallet/rewards"
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#76214D] py-3.5 text-sm font-bold text-white transition-all hover:bg-[#5F193E]"
            >
              <Gift size={16} />
              Canjear
            </Link>
          </div>

          <Link
            to="/app/bookings"
            className="flex items-center justify-center gap-2 rounded-2xl border border-[#F58A24]/25 bg-[#F58A24]/10 py-3.5 text-sm font-bold text-[#F58A24] transition-all hover:bg-[#F58A24]/15"
          >
            <Target size={16} />
            Reservar siguiente clase
          </Link>
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default Wallet;
