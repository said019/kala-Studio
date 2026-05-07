import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type KalaRing = {
  key: "constancia" | "esfuerzo" | "conexion";
  label: string;
  value: string;
  goalLabel: string;
  progress: number;
  color: string;
  track: string;
  radius?: number;
  stroke?: number;
};

type RingsTripleProps = {
  rings: KalaRing[];
  centerLabel: string;
  centerValue: string;
  centerSub: string;
  className?: string;
  shellClassName?: string;
  light?: boolean;
};

const DEFAULT_GEOMETRY: Record<KalaRing["key"], { radius: number; stroke: number }> = {
  constancia: { radius: 104, stroke: 18 },
  esfuerzo: { radius: 77, stroke: 14 },
  conexion: { radius: 52, stroke: 10 },
};

const clampProgress = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

// Emil's strong ease-out (animations.dev). Custom cubic-bezier vs CSS default `ease-out` (too weak).
const EASE_OUT_KALA = "cubic-bezier(0.23, 1, 0.32, 1)";

// Stagger between rings (Emil rec: 30-80ms; 90ms feels right with 1100ms duration on the arcs).
const STAGGER_MS = 90;
const ENTRY_DELAY_MS = 120;

export function RingsTriple({
  rings,
  centerLabel,
  centerValue,
  centerSub,
  className,
  shellClassName,
  light = false,
}: RingsTripleProps) {
  // Targets at first render = 0 to make the arcs literally grow from empty on mount.
  // After mount, each ring animates to its target with stagger.
  const [animated, setAnimated] = useState<number[]>(() => rings.map(() => 0));

  useEffect(() => {
    const targets = rings.map((r) => clampProgress(r.progress));
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setAnimated(targets);
      return;
    }

    // Reset to 0 first, then animate. This handles re-mounts and prop changes.
    setAnimated(rings.map(() => 0));
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    rings.forEach((_, i) => {
      const t = setTimeout(() => {
        setAnimated((prev) => {
          const next = [...prev];
          next[i] = targets[i];
          return next;
        });
      }, ENTRY_DELAY_MS + i * STAGGER_MS);
      timeouts.push(t);
    });
    return () => timeouts.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rings.map((r) => `${r.key}:${r.progress}`).join("|")]);

  return (
    <div
      className={cn(
        "relative h-[254px] w-[254px] shrink-0 rounded-full border p-3 sm:h-[304px] sm:w-[304px]",
        "kala-rings-shell",
        light
          ? "border-[#76214D]/12 bg-[radial-gradient(circle_at_34%_26%,rgba(255,247,242,0.96),rgba(255,240,228,0.92)_48%,rgba(252,230,225,0.92)_100%)] shadow-[inset_0_1px_8px_rgba(255,255,255,0.72),0_24px_70px_rgba(118,33,77,0.10)]"
          : "border-white/30 bg-[radial-gradient(circle_at_34%_26%,rgba(255,247,242,0.18),rgba(46,32,28,0.98)_46%,rgba(24,18,16,0.98)_100%)] shadow-[inset_0_1px_8px_rgba(255,255,255,0.12),0_24px_70px_rgba(46,32,28,0.22)]",
        shellClassName,
      )}
    >
      <div
        className={cn(
          "absolute inset-6 rounded-full border",
          light
            ? "border-[#76214D]/8 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.62),transparent_62%)]"
            : "border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,247,242,0.08),transparent_62%)]",
        )}
      />
      <svg viewBox="0 0 260 260" className={cn("relative h-full w-full -rotate-90", className)} aria-hidden="true">
        {rings.map((ring, i) => {
          const geometry = DEFAULT_GEOMETRY[ring.key];
          const radius = ring.radius ?? geometry.radius;
          const stroke = ring.stroke ?? geometry.stroke;
          const circumference = 2 * Math.PI * radius;
          const offset = circumference - (clampProgress(animated[i] ?? 0) / 100) * circumference;
          return (
            <g key={ring.key}>
              <circle cx="130" cy="130" r={radius} fill="none" stroke={ring.track} strokeWidth={stroke} />
              <circle
                cx="130"
                cy="130"
                r={radius}
                fill="none"
                stroke={ring.color}
                strokeLinecap="round"
                strokeWidth={stroke}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{
                  transition: `stroke-dashoffset 1100ms ${EASE_OUT_KALA}`,
                  willChange: "stroke-dashoffset",
                }}
              />
            </g>
          );
        })}
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center"
        style={{
          opacity: animated.some((v) => v > 0) || rings.every((r) => r.progress === 0) ? 1 : 0.85,
          transform: animated.some((v) => v > 0) || rings.every((r) => r.progress === 0)
            ? "translateY(0)"
            : "translateY(4px)",
          transition: `opacity 600ms ${EASE_OUT_KALA} 250ms, transform 600ms ${EASE_OUT_KALA} 250ms`,
        }}
      >
        <span
          className={cn(
            "text-[0.62rem] font-semibold uppercase tracking-[0.22em]",
            light ? "text-[#76214D]/70" : "text-[#FCE6E1] drop-shadow-[0_2px_8px_rgba(46,32,28,0.45)]",
          )}
        >
          {centerLabel}
        </span>
        <span
          className={cn(
            "mt-1 font-gulfs text-[3.6rem] leading-none tabular-nums sm:text-[4.25rem]",
            light ? "text-[#2E201C]" : "text-[#FFF7F2] drop-shadow-[0_3px_14px_rgba(46,32,28,0.5)]",
          )}
        >
          {centerValue}
        </span>
        <span
          className={cn(
            "mt-1 max-w-[178px] text-xs font-semibold leading-snug",
            light ? "text-[#7B5B52]" : "text-[#FFF7F2] drop-shadow-[0_2px_10px_rgba(46,32,28,0.5)]",
          )}
        >
          {centerSub}
        </span>
      </div>
    </div>
  );
}

export const KALA_RING_COLORS = {
  constancia: {
    color: "#76214D",
    track: "rgba(118,33,77,0.13)",
  },
  esfuerzo: {
    color: "#778455",
    track: "rgba(119,132,85,0.16)",
  },
  conexion: {
    color: "#F58A24",
    track: "rgba(245,138,36,0.16)",
  },
} as const;
