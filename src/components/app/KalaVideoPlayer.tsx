import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Loader2 } from "lucide-react";
import { KALA } from "@/components/app/tokens";

/* ── KalaLoader ────────────────────────────────────────────────────────────
   Loader con identidad Kala: anillo concéntrico animado en berry/coral
   sobre fondo blush. Útil mientras pedimos la URL firmada o esperamos
   metadata del video.
*/
export const KalaLoader = ({
  label = "Preparando tu clase…",
  sublabel,
}: {
  label?: string;
  sublabel?: string;
}) => (
  <div
    className="aspect-video w-full rounded-3xl flex flex-col items-center justify-center gap-5 px-6 text-center overflow-hidden relative"
    style={{ backgroundColor: KALA.blush }}
  >
    {/* Decoración sutil */}
    <div
      className="absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
      style={{ background: `radial-gradient(circle, ${KALA.coral} 0%, transparent 70%)` }}
      aria-hidden
    />
    <div
      className="absolute -bottom-32 -left-20 h-72 w-72 rounded-full opacity-30 blur-3xl"
      style={{ background: `radial-gradient(circle, ${KALA.berry} 0%, transparent 70%)` }}
      aria-hidden
    />

    {/* Anillo doble */}
    <div className="relative h-16 w-16">
      <span
        className="absolute inset-0 rounded-full kala-spin-slow"
        style={{
          background: `conic-gradient(from 0deg, transparent, ${KALA.berry})`,
          mask: "radial-gradient(circle, transparent 58%, black 60%)",
          WebkitMask: "radial-gradient(circle, transparent 58%, black 60%)",
        }}
      />
      <span
        className="absolute inset-2 rounded-full kala-spin-fast"
        style={{
          background: `conic-gradient(from 180deg, transparent, ${KALA.coral})`,
          mask: "radial-gradient(circle, transparent 52%, black 56%)",
          WebkitMask: "radial-gradient(circle, transparent 52%, black 56%)",
        }}
      />
      <span
        className="absolute inset-[18px] rounded-full"
        style={{ backgroundColor: KALA.cream }}
      />
    </div>

    <div className="relative">
      <p
        className="font-bebas tracking-wide"
        style={{ color: KALA.ink, fontSize: "clamp(1.05rem, 1.6vw, 1.4rem)" }}
      >
        {label}
      </p>
      {sublabel && (
        <p className="mt-1 font-alilato italic text-[0.92rem]" style={{ color: KALA.berry, opacity: 0.8 }}>
          {sublabel}
        </p>
      )}
    </div>

    <style>{`
      @keyframes kala-spin { to { transform: rotate(360deg); } }
      .kala-spin-slow { animation: kala-spin 2.2s linear infinite; }
      .kala-spin-fast { animation: kala-spin 1.3s linear infinite reverse; }
    `}</style>
  </div>
);

/* ── Tiempo helper ───────────────────────────────────────────────────────── */
const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

/* ── KalaVideoPlayer ───────────────────────────────────────────────────────
   <video> con controles propios alineados al sistema Kala.
   - Scrubber muestra:
     · capa base (border) · buffer cargado (cream translúcido) ·
     · progreso reproducido (gradiente berry → coral) · pulgar al hover/scrub
   - Overlay de buffering con anillo Kala cuando estamos en waiting/seeking
*/
type Props = {
  src: string;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onLoadedMetadata?: (el: HTMLVideoElement) => void;
  onError?: () => void;
  onPlay?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement>;
};

export const KalaVideoPlayer = ({
  src,
  className,
  onTimeUpdate,
  onLoadedMetadata,
  onError,
  onPlay,
  videoRef: externalRef,
}: Props) => {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalRef ?? internalRef;
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [waiting, setWaiting] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFs, setIsFs] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  /* ── Auto-hide controls cuando reproduce ── */
  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !scrubbing) {
        setShowControls(false);
      }
    }, 2400);
  }, [scrubbing, videoRef]);

  useEffect(() => () => {
    if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
  }, []);

  /* ── Fullscreen sync ──
     Desktop/Android: Fullscreen API estándar sobre el div contenedor (wrapRef).
     iOS Safari: NO soporta requestFullscreen() en elementos que no sean <video>,
     solo video.webkitEnterFullscreen(). Por eso también escuchamos los eventos
     webkit que dispara el propio <video>. */
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);

    const v = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
    }) | null;
    const onWebkitBegin = () => setIsFs(true);
    const onWebkitEnd = () => setIsFs(false);
    v?.addEventListener("webkitbeginfullscreen", onWebkitBegin);
    v?.addEventListener("webkitendfullscreen", onWebkitEnd);

    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      v?.removeEventListener("webkitbeginfullscreen", onWebkitBegin);
      v?.removeEventListener("webkitendfullscreen", onWebkitEnd);
    };
  }, [videoRef]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    const video = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
    }) | null;

    // iOS Safari: el <div> contenedor nunca soporta requestFullscreen. Si el
    // <video> expone la API nativa de iOS, úsala directamente sobre el video.
    if (!el?.requestFullscreen && video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
      return;
    }

    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen?.();
  };

  const seekTo = (pct: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, pct * v.duration));
  };

  /* ── Scrubber: pointer events para soportar desktop y touch ── */
  const trackRef = useRef<HTMLDivElement>(null);
  const onTrackPointerDown = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track) return;
    track.setPointerCapture(e.pointerId);
    setScrubbing(true);
    const rect = track.getBoundingClientRect();
    seekTo((e.clientX - rect.left) / rect.width);
  };
  const onTrackPointerMove = (e: React.PointerEvent) => {
    if (!scrubbing) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    seekTo((e.clientX - rect.left) / rect.width);
  };
  const onTrackPointerUp = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (track && track.hasPointerCapture(e.pointerId)) {
      track.releasePointerCapture(e.pointerId);
    }
    setScrubbing(false);
  };

  /* ── Keyboard shortcuts ── */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "m") {
      toggleMute();
    } else if (e.key === "f") {
      toggleFullscreen();
    } else if (e.key === "ArrowRight") {
      const v = videoRef.current;
      if (v) v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
    } else if (e.key === "ArrowLeft") {
      const v = videoRef.current;
      if (v) v.currentTime = Math.max(0, v.currentTime - 5);
    }
  };

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const bufPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  return (
    <div
      ref={wrapRef}
      className={
        "relative rounded-3xl overflow-hidden select-none group/player outline-none " +
        (className ?? "")
      }
      style={{ backgroundColor: KALA.ink }}
      onMouseMove={bumpControls}
      onMouseLeave={() => {
        if (videoRef.current && !videoRef.current.paused) setShowControls(false);
      }}
      onKeyDown={onKey}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        playsInline
        controlsList="nodownload"
        onContextMenu={(e) => e.preventDefault()}
        onClick={togglePlay}
        onPlay={() => { setPlaying(true); onPlay?.(); bumpControls(); }}
        onPause={() => { setPlaying(false); setShowControls(true); }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setCurrent(t);
          // buffered end (último rango)
          const b = e.currentTarget.buffered;
          if (b.length > 0) setBuffered(b.end(b.length - 1));
          onTimeUpdate?.(t);
        }}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          onLoadedMetadata?.(e.currentTarget);
        }}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted);
          setVolume(e.currentTarget.volume);
        }}
        onError={onError}
        className="block w-full max-h-[78vh] object-contain bg-transparent cursor-pointer"
      />

      {/* Overlay de buffering centrado */}
      {waiting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className="grid h-14 w-14 place-items-center rounded-full backdrop-blur-md"
            style={{ backgroundColor: "rgba(255,247,242,0.18)" }}
          >
            <Loader2 size={22} className="animate-spin" color={KALA.cream} />
          </span>
        </div>
      )}

      {/* Botón play central (pausado) */}
      {!playing && !waiting && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Reproducir"
          className="absolute inset-0 m-auto h-16 w-16 sm:h-20 sm:w-20 rounded-full grid place-items-center cursor-pointer border-0 transition-transform hover:scale-105 active:scale-95"
          style={{
            backgroundColor: KALA.cream,
            color: KALA.berry,
            boxShadow: "0 16px 40px -16px rgba(46,32,28,0.55)",
          }}
        >
          <Play size={26} fill={KALA.berry} className="ml-1" />
        </button>
      )}

      {/* Controles abajo */}
      <div
        className="absolute inset-x-0 bottom-0 px-4 sm:px-5 pb-3 pt-10 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, rgba(46,32,28,0) 0%, rgba(46,32,28,0.78) 100%)",
          opacity: showControls || !playing ? 1 : 0,
          transition: "opacity 280ms ease",
        }}
      >
        {/* Scrubber */}
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
          className="relative h-3 cursor-pointer pointer-events-auto"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(current)}
          aria-label="Progreso del video"
        >
          {/* track base */}
          <div
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full"
            style={{ backgroundColor: "rgba(255,247,242,0.22)" }}
          />
          {/* buffered */}
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full transition-[width] duration-200"
            style={{ width: `${bufPct}%`, backgroundColor: "rgba(255,247,242,0.4)" }}
          />
          {/* progreso */}
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${KALA.berry}, ${KALA.coral})`,
              transition: scrubbing ? "none" : "width 120ms linear",
            }}
          />
          {/* thumb */}
          <span
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full transition-transform"
            style={{
              left: `${pct}%`,
              backgroundColor: KALA.cream,
              boxShadow: `0 0 0 2px ${KALA.berry}`,
              transform: `translate(-50%, -50%) scale(${scrubbing ? 1.35 : 1})`,
            }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 pointer-events-auto">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pausar" : "Reproducir"}
              className="grid h-9 w-9 place-items-center rounded-full border-0 cursor-pointer transition-transform hover:scale-110 active:scale-95"
              style={{ backgroundColor: KALA.cream, color: KALA.berry }}
            >
              {playing ? <Pause size={14} fill={KALA.berry} /> : <Play size={14} fill={KALA.berry} className="ml-0.5" />}
            </button>

            <div className="hidden sm:flex items-center gap-2 group/vol">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? "Quitar silencio" : "Silenciar"}
                className="grid h-8 w-8 place-items-center rounded-full border-0 cursor-pointer"
                style={{ backgroundColor: "rgba(255,247,242,0.14)", color: KALA.cream }}
              >
                {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  const next = Number(e.target.value);
                  v.volume = next;
                  v.muted = next === 0;
                }}
                aria-label="Volumen"
                className="kala-volume w-0 group-hover/vol:w-20 transition-[width] duration-300"
              />
            </div>

            <span
              className="font-bebas tracking-wider text-[0.82rem] tabular-nums"
              style={{ color: KALA.cream }}
            >
              {fmtTime(current)} <span style={{ opacity: 0.55 }}>/ {fmtTime(duration)}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFs ? "Salir de pantalla completa" : "Pantalla completa"}
            className="grid h-9 w-9 place-items-center rounded-full border-0 cursor-pointer transition-transform hover:scale-110"
            style={{ backgroundColor: "rgba(255,247,242,0.14)", color: KALA.cream }}
          >
            {isFs ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
        </div>
      </div>

      <style>{`
        .kala-volume {
          -webkit-appearance: none;
          appearance: none;
          height: 3px;
          background: rgba(255,247,242,0.35);
          border-radius: 999px;
          outline: none;
        }
        .kala-volume::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 12px;
          width: 12px;
          border-radius: 999px;
          background: ${KALA.cream};
          box-shadow: 0 0 0 2px ${KALA.coral};
          cursor: pointer;
        }
        .kala-volume::-moz-range-thumb {
          height: 12px;
          width: 12px;
          border: 0;
          border-radius: 999px;
          background: ${KALA.cream};
          box-shadow: 0 0 0 2px ${KALA.coral};
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};

/* ── KalaProgressBar ───────────────────────────────────────────────────────
   Barra de progreso elegante para subida de archivos.
   - 0–95%: progreso real del upload (axios onUploadProgress)
   - 95–99%: animación shimmer mientras el server procesa (no sabemos cuánto)
*/
export const KalaProgressBar = ({
  value,
  label,
  hint,
}: {
  value: number; // 0–100
  label?: string;
  hint?: string;
}) => {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: KALA.blush, border: `1px solid ${KALA.border}` }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span
          className="text-[0.66rem] font-medium uppercase tracking-[0.22em]"
          style={{ color: KALA.berry }}
        >
          {label ?? "Subiendo comprobante"}
        </span>
        <span className="font-bebas tabular-nums text-[1rem]" style={{ color: KALA.ink }}>
          {Math.floor(v)}%
        </span>
      </div>

      <div
        className="relative h-2 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: "rgba(118,33,77,0.12)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out kala-bar-fill"
          style={{
            width: `${v}%`,
            background: `linear-gradient(90deg, ${KALA.berry} 0%, ${KALA.coral} 100%)`,
          }}
        />
        {/* Shimmer activo mientras sube y aún no termina */}
        {v > 0 && v < 100 && (
          <div
            className="absolute inset-y-0 left-0 kala-bar-shimmer pointer-events-none"
            style={{
              width: `${v}%`,
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,247,242,0.55) 50%, transparent 100%)",
            }}
          />
        )}
      </div>

      {hint && (
        <p className="mt-2 text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.6 }}>
          {hint}
        </p>
      )}

      <style>{`
        @keyframes kala-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .kala-bar-shimmer { animation: kala-shimmer 1.4s ease-in-out infinite; }
      `}</style>
    </div>
  );
};
