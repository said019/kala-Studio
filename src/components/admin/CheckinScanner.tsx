import { useEffect, useRef, useState } from "react";
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

/**
 * Check-in por cámara o por código manual. Lee el QR del pase de la clienta
 * (codifica base64(userId)) con BarcodeDetector (Chrome / Android) y llama al
 * backend POST /api/admin/checkin/scan, que marca la asistencia.
 *
 * El acceso a la cámara requiere HTTPS (excepto localhost). Si no se puede,
 * el admin puede usar el modo manual para pegar el código.
 */
export const CheckinScanner = ({ open, onOpenChange }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [manualSending, setManualSending] = useState(false);

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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let detector: any = null;

    const loop = async () => {
      if (cancelled || !videoRef.current || !detector) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes && codes.length) await submitCode(codes[0].rawValue);
      } catch { /* frame sin lectura */ }
      if (!cancelled) timerRef.current = setTimeout(loop, 300);
    };

    const start = async () => {
      // 1) Contexto seguro: getUserMedia requiere HTTPS (o localhost).
      if (typeof window !== "undefined" && window.isSecureContext === false) {
        setError(
          "La cámara solo funciona con HTTPS. Este sitio se está cargando como «No seguro» (http://). Pide al equipo de despliegue que active el certificado SSL, o usa el modo manual abajo."
        );
        return;
      }
      // 2) Soporte de BarcodeDetector (Chrome, Edge, Android Chrome; no Safari).
      if (!("BarcodeDetector" in window)) {
        setError(
          "Este navegador no puede leer QR automáticamente (Safari). Usa Google Chrome o el modo manual abajo."
        );
        return;
      }
      try {
        detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
      } catch {
        setError("No se pudo iniciar el lector de QR. Usa el modo manual abajo.");
        return;
      }
      // 3) Permisos / disponibilidad de cámara.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        loop();
      } catch (e: any) {
        // NotAllowedError = permisos negados; NotFoundError = sin cámara; etc.
        const reason = e?.name === "NotAllowedError"
          ? "Negaste el permiso de cámara al navegador. Da clic en el candado de la URL → Permisos del sitio → permite Cámara, y recarga."
          : e?.name === "NotFoundError"
            ? "No se encontró ninguna cámara conectada."
            : "No se pudo abrir la cámara. Revisa los permisos del navegador o usa el modo manual abajo.";
        setError(reason);
      }
    };

    setError(null);
    start();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pasar lista (cámara)</DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl bg-black aspect-[4/3]">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-40 w-40 rounded-2xl border-2 border-white/80 shadow-[0_0_0_4000px_rgba(0,0,0,0.25)]" />
              </div>
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
