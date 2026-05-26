import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import api from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Clock, Camera as CameraIcon } from "lucide-react";

interface ScanResult {
  status: "ok" | "already" | "no_booking" | "not_found" | "error";
  name?: string;
  className?: string;
  time?: string;
  message: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Platform = "ios" | "android" | "desktop";
const detectPlatform = (): Platform => {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
};

// Instrucciones que sí existen en cada plataforma. En Android Chrome NO hay
// "AA"; el menú es el candado → Permisos. Si la dueña ya tocó "Restablecer
// permisos", la entrada Cámara desaparece y el botón Reintentar abajo es
// suficiente (el restablecer deja el estado en "prompt", así que el siguiente
// getUserMedia vuelve a preguntar).
const platformPermissionHint = (p: Platform): string => {
  if (p === "android") {
    return "En Android Chrome: toca el candado a la izquierda de la URL → Permisos → Cámara: Permitir. Si Cámara no aparece (o ya tocaste \"Restablecer permisos\"), simplemente toca \"Reintentar cámara\" aquí abajo.";
  }
  if (p === "ios") {
    return "En iPhone Safari: toca AA a la izquierda de la URL → Configuración del sitio web → Cámara → Permitir. Luego toca \"Reintentar cámara\".";
  }
  return "Toca el candado en la barra de direcciones → Permisos del sitio → Cámara: Permitir. Luego toca \"Reintentar cámara\".";
};

/**
 * Check-in por cámara con @zxing/browser. Funciona en Chrome, Safari iOS y
 * Android. Para iOS hace falta gestionar el stream manualmente y forzar
 * play() después de animar el modal — si no, el <video> queda negro aunque
 * la cámara esté activa.
 */
export const CheckinScanner = ({ open, onOpenChange }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Cuando el error es un fallo de permiso (NotAllowedError), guardamos el
  // tipo para mostrar instrucciones específicas por plataforma + Reintentar.
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [manualSending, setManualSending] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  // Ref al cancelledRef vivo para que Reintentar respete cualquier cierre del modal.
  const activeCancelledRef = useRef<{ cancelled: boolean } | null>(null);
  const platform = detectPlatform();

  const submitCode = async (code: string, opts?: { silent?: boolean }) => {
    const value = String(code || "").trim();
    if (!value) return;
    if (busyRef.current) return;
    const now = Date.now();
    if (lastCodeRef.current && lastCodeRef.current.code === value && now - lastCodeRef.current.at < 3500) return;
    lastCodeRef.current = { code: value, at: now };
    busyRef.current = true;
    try {
      const res = await api.post("/admin/checkin/scan", { code: value });
      setResults((r) => [res.data as ScanResult, ...r].slice(0, 10));
      if (!opts?.silent && navigator.vibrate) navigator.vibrate(80);
    } catch (e: any) {
      const data = e?.response?.data ?? { status: "error", message: "Error al registrar el check-in" };
      setResults((r) => [data as ScanResult, ...r].slice(0, 10));
      if (!opts?.silent && navigator.vibrate) navigator.vibrate(40);
    } finally {
      setTimeout(() => { busyRef.current = false; }, 700);
    }
  };

  const tearDown = () => {
    if (controlsRef.current) {
      try { controlsRef.current.stop(); } catch { /* noop */ }
      controlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch { /* noop */ }
    }
  };

  // Inicia stream + play() — separado para poder llamarlo tras un tap del
  // usuario si iOS bloquea el autoplay inicial.
  const startStream = async (cancelledRef: { cancelled: boolean }) => {
    activeCancelledRef.current = cancelledRef;
    setNeedsTap(false);
    setPermissionBlocked(false);
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setError(
        "La cámara solo funciona con HTTPS. Entra al sitio por https:// o usa el modo manual abajo."
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Tu navegador no soporta acceso a la cámara. Usa el modo manual abajo.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    } catch (e: any) {
      const name = e?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPermissionBlocked(true);
        setError("Permiso de cámara bloqueado.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError("No se encontró ninguna cámara en este dispositivo. Usa el modo manual abajo.");
      } else if (name === "NotReadableError" || name === "AbortError") {
        setError("La cámara está ocupada por otra app o pestaña. Ciérrala y toca \"Reintentar cámara\".");
      } else {
        setError("No se pudo abrir la cámara. Toca \"Reintentar cámara\" o usa el modo manual abajo.");
      }
      return;
    }
    if (cancelledRef.cancelled) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;

    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    video.srcObject = stream;
    // iOS Safari: a veces falla el autoplay sin gesto del usuario. Si así pasa,
    // mostramos botón "Iniciar cámara" para que el usuario lo dispare con tap.
    try {
      await video.play();
    } catch {
      setNeedsTap(true);
      return;
    }

    // Una vez el video corre, zxing decodifica frames continuos.
    try {
      const reader = new BrowserQRCodeReader();
      const controls = reader.decodeFromVideoElement(video, (result, _err) => {
        if (cancelledRef.cancelled) return;
        if (result) submitCode(result.getText());
      });
      controlsRef.current = await controls;
    } catch {
      // Si falla decodificador, mantenemos la cámara visible y el modo manual.
    }
  };

  useEffect(() => {
    if (!open) {
      tearDown();
      return;
    }
    const cancelledRef = { cancelled: false };
    setError(null);
    setNeedsTap(false);
    // Pequeño delay para que el modal termine de animar y el <video>
    // tenga dimensiones reales antes de attach + play. Crítico en iOS.
    const t = setTimeout(() => {
      if (!cancelledRef.cancelled) startStream(cancelledRef);
    }, 200);

    return () => {
      cancelledRef.cancelled = true;
      clearTimeout(t);
      tearDown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const styleFor = (status: ScanResult["status"]) => {
    if (status === "ok") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
    if (status === "already") return "bg-amber-500/10 text-amber-700 border-amber-500/20";
    return "bg-destructive/10 text-destructive border-destructive/20";
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim() || manualSending) return;
    setManualSending(true);
    await submitCode(manualCode);
    setManualCode("");
    setManualSending(false);
  };

  // Reintentar abre un nuevo intento de cámara con un cancelledRef fresco.
  // Sirve para el caso típico de Android: la dueña denegó/restableció el
  // permiso, y ahora tocar el botón vuelve a disparar el prompt del navegador
  // (que requiere un gesto de usuario reciente — este tap lo provee).
  const handleRetryCamera = async () => {
    // Cancelar cualquier intento previo aún colgando.
    if (activeCancelledRef.current) activeCancelledRef.current.cancelled = true;
    tearDown();
    setError(null);
    setPermissionBlocked(false);
    const cancelledRef = { cancelled: false };
    await startStream(cancelledRef);
  };

  const handleTapToStart = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      await v.play();
      setNeedsTap(false);
      if (!controlsRef.current) {
        const reader = new BrowserQRCodeReader();
        const controls = reader.decodeFromVideoElement(v, (result) => {
          if (result) submitCode(result.getText());
        });
        controlsRef.current = await controls;
      }
    } catch {
      setError("No se pudo iniciar la cámara aún después del tap. Usa el modo manual abajo.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pasar lista (cámara)</DialogTitle>
        </DialogHeader>

        {error ? (
          (() => {
            // Reintentar tiene sentido salvo que el entorno sea irrecuperable:
            // sin HTTPS o sin API mediaDevices. En esos casos, solo modo manual.
            const secure =
              typeof window === "undefined" || window.isSecureContext !== false;
            const hasApi = !!navigator.mediaDevices?.getUserMedia;
            const canRetry = secure && hasApi;
            return (
              <div className="space-y-3 rounded-lg bg-destructive/10 px-4 py-4 text-sm text-destructive">
                <p className="font-medium">{error}</p>
                {permissionBlocked && (
                  <p className="text-[12px] leading-relaxed text-destructive/85">
                    {platformPermissionHint(platform)}
                  </p>
                )}
                {canRetry && (
                  <Button
                    type="button"
                    onClick={handleRetryCamera}
                    className="w-full"
                    variant="secondary"
                  >
                    <CameraIcon size={14} className="mr-1.5" />
                    Reintentar cámara
                  </Button>
                )}
              </div>
            );
          })()
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl bg-black aspect-[4/3]">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
                autoPlay
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-40 w-40 rounded-2xl border-2 border-white/80 shadow-[0_0_0_4000px_rgba(0,0,0,0.25)]" />
              </div>
              {needsTap && (
                <button
                  type="button"
                  onClick={handleTapToStart}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white text-sm font-semibold"
                >
                  <CameraIcon size={28} />
                  Tocar para iniciar la cámara
                </button>
              )}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Apunta al <strong>QR del pase</strong> de la clienta para registrar su asistencia.
            </p>
          </div>
        )}

        {/* ── Modo manual: pegar/escribir el código ─────────────────────────── */}
        <form onSubmit={handleManualSubmit} className="space-y-2 border-t border-border pt-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <CameraIcon size={12} />
            Modo manual (si la cámara no funciona)
          </label>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Pídele a la clienta abrir su perfil en la app o su pase de wallet, copia el código del QR y pégalo aquí.
          </p>
          <div className="flex gap-2">
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Código del QR…"
              autoComplete="off"
            />
            <Button type="submit" disabled={!manualCode.trim() || manualSending}>
              {manualSending ? "..." : "Marcar"}
            </Button>
          </div>
        </form>

        {/* ── Resultados ────────────────────────────────────────────────────── */}
        {results.length > 0 && (
          <div className="max-h-52 space-y-1.5 overflow-auto border-t border-border pt-3">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${styleFor(r.status)}`}>
                {r.status === "ok" ? <CheckCircle2 size={16} className="shrink-0" />
                  : r.status === "already" ? <Clock size={16} className="shrink-0" />
                  : <XCircle size={16} className="shrink-0" />}
                <span className="min-w-0">{r.message}</span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CheckinScanner;
