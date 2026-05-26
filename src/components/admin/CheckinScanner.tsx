import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

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
 * Check-in por cámara. Lee el QR del pase de la clienta (codifica base64(userId))
 * con la API nativa BarcodeDetector (Chrome / Android) y llama al backend
 * POST /api/admin/checkin/scan, que marca la asistencia de la clase de hoy.
 */
export const CheckinScanner = ({ open, onOpenChange }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let detector: any = null;

    const handleCode = async (code: string) => {
      if (!code || busyRef.current) return;
      const now = Date.now();
      // Evitar re-escaneo del mismo QR repetido en 3.5 s.
      if (lastCodeRef.current && lastCodeRef.current.code === code && now - lastCodeRef.current.at < 3500) return;
      lastCodeRef.current = { code, at: now };
      busyRef.current = true;
      try {
        const res = await api.post("/admin/checkin/scan", { code });
        setResults((r) => [res.data as ScanResult, ...r].slice(0, 10));
        if (navigator.vibrate) navigator.vibrate(80);
      } catch (e: any) {
        const data = e?.response?.data ?? { status: "error", message: "Error al registrar el check-in" };
        setResults((r) => [data as ScanResult, ...r].slice(0, 10));
        if (navigator.vibrate) navigator.vibrate(40);
      } finally {
        setTimeout(() => { busyRef.current = false; }, 700);
      }
    };

    const loop = async () => {
      if (cancelled || !videoRef.current || !detector) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes && codes.length) await handleCode(codes[0].rawValue);
      } catch { /* frame sin lectura */ }
      if (!cancelled) timerRef.current = setTimeout(loop, 300);
    };

    const start = async () => {
      if (!("BarcodeDetector" in window)) {
        setError("Este navegador no soporta el escáner de QR. Usa Google Chrome (computadora o Android).");
        return;
      }
      try {
        detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
      } catch {
        setError("No se pudo iniciar el lector de QR.");
        return;
      }
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
      } catch {
        setError("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pasar lista (cámara)</DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 px-3 py-3 text-sm text-destructive">{error}</div>
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

            {results.length > 0 && (
              <div className="max-h-52 space-y-1.5 overflow-auto">
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CheckinScanner;
