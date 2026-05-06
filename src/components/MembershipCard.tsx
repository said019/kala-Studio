/**
 * MembershipCard v2 -- Premium glassmorphism membership card
 * Ophelia Studio -- Dark, feminine, boutique fitness aesthetic
 *
 * Design pillars:
 *  - Hero number: remaining classes as the dominant visual
 *  - Glassmorphism panels with layered depth
 *  - Arc progress ring with gradient glow
 *  - Holographic shimmer stripe on hover
 *  - Grain texture overlay + decorative orbs
 *  - Stamps kept for small plans (<=12) but redesigned as glowing dots
 */

import { useMemo, useId } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  Infinity as InfinityIcon,
  CalendarDays,
  Flame,
  Clock,
  Sparkles,
} from "lucide-react";
import { safeParse } from "@/lib/utils";
import type { ClientMembership } from "@/types/membership";
import imgTrampoline from "@/assets/trampoline_2982156.png";
import imgPilates from "@/assets/pilates_2320695.png";

// ─────────────────────────────────────────────
// Category detection
// ─────────────────────────────────────────────
type PlanCategory = "jumping" | "pilates" | "mixto" | "other";

function detectCategory(planName: string): PlanCategory {
  const lower = planName.toLowerCase();
  if (lower.includes("mixto")) return "mixto";
  if (lower.includes("jumping")) return "jumping";
  if (lower.includes("pilates")) return "pilates";
  return "other";
}

// ─────────────────────────────────────────────
// Palette
// ─────────────────────────────────────────────
const PALETTE = {
  jumping: {
    gradient: "linear-gradient(145deg, #120318 0%, #1e0630 35%, #2d0a3d 65%, #1a0522 100%)",
    glow1: "#76214D",
    glow2: "#F3C6D6",
    accent: "#76214D",
    accentLight: "#F3C6D6",
    badge: "rgba(118,33,77,0.12)",
    badgeText: "#F3C6D6",
    badgeBorder: "rgba(118,33,77,0.25)",
    label: "Jumping",
    border: "rgba(118,33,77,0.18)",
    glass: "rgba(118,33,77,0.06)",
    glassBorder: "rgba(118,33,77,0.12)",
    dotActive: "#F58A24",
    dotGlow: "rgba(245,138,36,0.5)",
    iconMuted: "rgba(255,255,255,0.12)",
    progressFrom: "#76214D",
    progressTo: "#F3C6D6",
    progressVia: "#E9745F",
    shimmer: "rgba(254,165,220,0.08)",
    heroGlow: "rgba(118,33,77,0.25)",
    divider: "rgba(118,33,77,0.10)",
  },
  pilates: {
    gradient: "linear-gradient(145deg, #080d02 0%, #151d0a 35%, #1c2510 65%, #0d1205 100%)",
    glow1: "#F58A24",
    glow2: "#FFF6E6",
    accent: "#F58A24",
    accentLight: "#FFF6E6",
    badge: "rgba(245,138,36,0.10)",
    badgeText: "#F58A24",
    badgeBorder: "rgba(245,138,36,0.20)",
    label: "Pilates",
    border: "rgba(245,138,36,0.15)",
    glass: "rgba(245,138,36,0.05)",
    glassBorder: "rgba(245,138,36,0.10)",
    dotActive: "#76214D",
    dotGlow: "rgba(118,33,77,0.5)",
    iconMuted: "rgba(255,255,255,0.12)",
    progressFrom: "#F58A24",
    progressTo: "#FFF6E6",
    progressVia: "#d4d85e",
    shimmer: "rgba(245,138,36,0.06)",
    heroGlow: "rgba(245,138,36,0.20)",
    divider: "rgba(245,138,36,0.08)",
  },
  mixto: {
    gradient: "linear-gradient(145deg, #0b0418 0%, #150830 35%, #1e0c3a 65%, #0c0520 100%)",
    glow1: "#E9745F",
    glow2: "#FCE6E1",
    accent: "#E9745F",
    accentLight: "#FCE6E1",
    badge: "rgba(233,116,95,0.12)",
    badgeText: "#FCE6E1",
    badgeBorder: "rgba(233,116,95,0.25)",
    label: "Mixto",
    border: "rgba(233,116,95,0.18)",
    glass: "rgba(233,116,95,0.06)",
    glassBorder: "rgba(233,116,95,0.12)",
    dotActive: "#F58A24",
    dotGlow: "rgba(245,138,36,0.5)",
    iconMuted: "rgba(255,255,255,0.12)",
    progressFrom: "#E9745F",
    progressTo: "#FCE6E1",
    progressVia: "#76214D",
    shimmer: "rgba(233,116,95,0.07)",
    heroGlow: "rgba(233,116,95,0.22)",
    divider: "rgba(233,116,95,0.10)",
  },
  other: {
    gradient: "linear-gradient(145deg, #120318 0%, #1e0630 35%, #280940 65%, #160420 100%)",
    glow1: "#76214D",
    glow2: "#E9745F",
    accent: "#F3C6D6",
    accentLight: "#FCE6E1",
    badge: "rgba(254,165,220,0.10)",
    badgeText: "#F3C6D6",
    badgeBorder: "rgba(254,165,220,0.20)",
    label: "Membresia",
    border: "rgba(254,165,220,0.16)",
    glass: "rgba(254,165,220,0.05)",
    glassBorder: "rgba(254,165,220,0.10)",
    dotActive: "#F58A24",
    dotGlow: "rgba(245,138,36,0.5)",
    iconMuted: "rgba(255,255,255,0.12)",
    progressFrom: "#76214D",
    progressTo: "#E9745F",
    progressVia: "#F3C6D6",
    shimmer: "rgba(254,165,220,0.06)",
    heroGlow: "rgba(254,165,220,0.20)",
    divider: "rgba(254,165,220,0.08)",
  },
} as const;

type Pal = (typeof PALETTE)[PlanCategory];

// ─────────────────────────────────────────────
// SVG Noise texture (inline, no external asset)
// ─────────────────────────────────────────────
const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`;

// ─────────────────────────────────────────────
// Arc Progress Ring -- Hero element
// ─────────────────────────────────────────────
function ArcProgress({
  percentage,
  remaining,
  total,
  pal,
  uid,
}: {
  percentage: number;
  remaining: number;
  total: number;
  pal: Pal;
  uid: string;
}) {
  const size = 140;
  const strokeWidth = 6;
  const r = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (percentage / 100) * circumference;
  const gradId = `arc-grad-${uid}`;
  const glowId = `arc-glow-${uid}`;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Outer ambient glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${pal.heroGlow} 0%, transparent 70%)`,
          filter: "blur(20px)",
          transform: "scale(1.3)",
        }}
      />

      <svg width={size} height={size} className="relative -rotate-90" style={{ filter: `drop-shadow(0 0 8px ${pal.accent}44)` }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={pal.progressFrom} />
            <stop offset="50%" stopColor={pal.progressVia} />
            <stop offset="100%" stopColor={pal.progressTo} />
          </linearGradient>
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={strokeWidth}
        />
        {/* Tick marks */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i / 24) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const x1 = size / 2 + (r - 2) * Math.cos(rad);
          const y1 = size / 2 + (r - 2) * Math.sin(rad);
          const x2 = size / 2 + (r + 2) * Math.cos(rad);
          const y2 = size / 2 + (r + 2) * Math.sin(rad);
          return (
            <line
              key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={0.5}
            />
          );
        })}
        {/* Progress arc */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          filter={`url(#${glowId})`}
          className="transition-all duration-1000 ease-out"
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-bebas leading-none"
          style={{
            fontSize: remaining >= 100 ? "2.5rem" : "3.25rem",
            color: pal.accent,
            textShadow: `0 0 24px ${pal.accent}66, 0 0 48px ${pal.accent}22`,
          }}
        >
          {remaining}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/30 mt-0.5">
          de {total}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Dot Grid -- For small plans (<=12 classes)
// Glowing dots replace the old circular stamps
// ─────────────────────────────────────────────
function DotGrid({
  classLimit,
  classesRemaining,
  category,
  pal,
}: {
  classLimit: number;
  classesRemaining: number;
  category: PlanCategory;
  pal: Pal;
}) {
  const used = classLimit - classesRemaining;

  const getImg = (i: number) => {
    if (category === "pilates") return imgPilates;
    if (category === "mixto") return i % 2 === 0 ? imgTrampoline : imgPilates;
    return imgTrampoline;
  };

  const dotSize = classLimit <= 4 ? 40 : classLimit <= 8 ? 34 : 28;

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {Array.from({ length: classLimit }).map((_, i) => {
        const active = i >= used;
        return (
          <div
            key={i}
            className="transition-all duration-500"
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: active
                ? `radial-gradient(circle, ${pal.glass} 0%, transparent 100%)`
                : "rgba(255,255,255,0.015)",
              border: `1.5px solid ${active ? pal.glassBorder : "rgba(255,255,255,0.04)"}`,
              boxShadow: active
                ? `0 0 12px ${pal.dotGlow}, inset 0 0 6px ${pal.accent}10`
                : "none",
              opacity: active ? 1 : 0.18,
              filter: active ? "none" : "saturate(0.1) brightness(0.5)",
              padding: Math.round(dotSize * 0.18),
            }}
          >
            <span
              aria-hidden
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                background: active ? pal.dotActive : pal.iconMuted,
                filter: active ? `drop-shadow(0 0 4px ${pal.dotGlow})` : "none",
                WebkitMaskImage: `url(${getImg(i)})`,
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                WebkitMaskSize: "contain",
                maskImage: `url(${getImg(i)})`,
                maskRepeat: "no-repeat",
                maskPosition: "center",
                maskSize: "contain",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Inline keyframe styles (injected once)
// ─────────────────────────────────────────────
const CARD_KEYFRAMES = `
@keyframes mc-shimmer {
  0% { transform: translateX(-100%) skewX(-15deg); }
  100% { transform: translateX(200%) skewX(-15deg); }
}
@keyframes mc-pulse-soft {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@keyframes mc-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-4px); }
}
`;

let keyframesInjected = false;
function ensureKeyframes() {
  if (keyframesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = CARD_KEYFRAMES;
  document.head.appendChild(style);
  keyframesInjected = true;
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
interface MembershipCardProps {
  membership: ClientMembership & { classCategory?: string };
  expanded?: boolean;
}

export function MembershipCard({ membership }: MembershipCardProps) {
  const uid = useId();
  ensureKeyframes();

  const planName = membership.plan_name ?? membership.planName ?? "Plan personalizado";
  const classLimit = membership.class_limit ?? membership.classLimit ?? null;
  const classesRemaining = membership.classes_remaining ?? membership.classesRemaining ?? null;
  const endDate = membership.end_date ?? membership.endDate ?? null;
  const isUnlimited = classLimit === null;

  const category = detectCategory(planName);
  const pal = PALETTE[category];

  const used =
    classLimit !== null && classesRemaining !== null ? classLimit - classesRemaining : 0;
  const daysRemaining = endDate
    ? Math.max(differenceInCalendarDays(safeParse(endDate), new Date()), 0)
    : null;
  const percentage =
    classLimit && classesRemaining !== null
      ? Math.round((classesRemaining / classLimit) * 100)
      : 100;

  const showDots = !isUnlimited && classLimit !== null && classLimit <= 12;
  const showArc = !isUnlimited && classLimit !== null && classLimit > 12;
  const isLow = daysRemaining !== null && daysRemaining <= 5;

  // Pre-compute formatted expiration
  const expirationText = useMemo(() => {
    if (!endDate || daysRemaining === null) return null;
    if (daysRemaining === 0) return "Vence hoy";
    if (daysRemaining <= 5) return `${daysRemaining}d restantes`;
    return format(safeParse(endDate), "d MMM yyyy", { locale: es });
  }, [endDate, daysRemaining]);

  return (
    <div
      className="group relative overflow-hidden rounded-2xl select-none"
      style={{
        background: pal.gradient,
        border: `1px solid ${pal.border}`,
        boxShadow: `
          0 0 0 0.5px rgba(255,255,255,0.04),
          0 8px 40px ${pal.glow1}12,
          0 2px 12px rgba(0,0,0,0.5)
        `,
      }}
    >
      {/* ── Grain texture overlay ── */}
      <div
        className="pointer-events-none absolute inset-0 z-10 mix-blend-soft-light"
        style={{ backgroundImage: NOISE_SVG, opacity: 0.5 }}
      />

      {/* ── Holographic shimmer stripe (on hover) ── */}
      <div
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-500"
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "40%",
            height: "100%",
            background: `linear-gradient(105deg, transparent 30%, ${pal.shimmer} 50%, transparent 70%)`,
            animation: "mc-shimmer 2s ease-in-out infinite",
          }}
        />
      </div>

      {/* ── Top edge highlight ── */}
      <div
        className="pointer-events-none absolute top-0 left-0 right-0 h-px z-10"
        style={{
          background: `linear-gradient(90deg, transparent 5%, ${pal.accent}35 30%, ${pal.accent}50 50%, ${pal.accent}35 70%, transparent 95%)`,
        }}
      />

      {/* ── Decorative orbs ── */}
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-60 w-60 rounded-full blur-[100px]"
        style={{ background: `${pal.glow1}10` }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full blur-[80px]"
        style={{ background: `${pal.glow2}0C` }}
      />
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-[60px]"
        style={{ background: `${pal.accent}08` }}
      />

      {/* ── Card body ── */}
      <div className="relative z-[5] p-5 sm:p-6">

        {/* ══════ TOP ROW: Badge + Plan name ══════ */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex flex-col gap-2 min-w-0">
            {/* Category badge */}
            <span
              className="inline-flex items-center gap-1.5 self-start px-2.5 py-[4px] rounded-full text-[9px] font-bold uppercase tracking-[0.16em]"
              style={{
                background: pal.badge,
                color: pal.badgeText,
                border: `1px solid ${pal.badgeBorder}`,
                backdropFilter: "blur(8px)",
              }}
            >
              <span
                className="h-[4px] w-[4px] rounded-full"
                style={{
                  background: pal.badgeText,
                  animation: "mc-pulse-soft 2s ease-in-out infinite",
                }}
              />
              {pal.label}
            </span>

            {/* Plan name */}
            <h3
              className="font-bebas text-[1.5rem] sm:text-[1.75rem] leading-[0.95] text-white/90 tracking-wide"
              style={{ textShadow: `0 0 30px ${pal.accent}30` }}
            >
              {planName}
            </h3>
          </div>

          {/* Sparkle icon - decorative */}
          <div
            className="shrink-0 mt-1"
            style={{
              color: pal.accent,
              opacity: 0.2,
              animation: "mc-float 4s ease-in-out infinite",
            }}
          >
            <Sparkles size={18} />
          </div>
        </div>

        {/* ══════ HERO SECTION: Class Counter ══════ */}
        {/* Glass panel containing the main content */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: pal.glass,
            border: `1px solid ${pal.glassBorder}`,
            backdropFilter: "blur(12px)",
          }}
        >
          {!isUnlimited && classesRemaining !== null && classLimit !== null ? (
            <div className="p-4 sm:p-5">
              {showDots ? (
                /* ── Small plans: Hero number + dot grid ── */
                <div className="flex flex-col items-center gap-4">
                  {/* Big remaining number */}
                  <div className="flex items-baseline gap-2">
                    <span
                      className="font-bebas leading-none"
                      style={{
                        fontSize: "4rem",
                        color: pal.accent,
                        textShadow: `0 0 30px ${pal.accent}55, 0 0 60px ${pal.accent}22`,
                      }}
                    >
                      {classesRemaining}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-[0.14em] text-white/25">
                        clases
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-white/25">
                        restantes
                      </span>
                    </div>
                  </div>

                  {/* Thin separator */}
                  <div
                    className="w-16 h-px"
                    style={{ background: `linear-gradient(90deg, transparent, ${pal.accent}30, transparent)` }}
                  />

                  {/* Dot grid */}
                  <DotGrid
                    classLimit={classLimit}
                    classesRemaining={classesRemaining}
                    category={category}
                    pal={pal}
                  />

                  {/* Subtle usage label */}
                  <span className="text-[10px] text-white/20">
                    {used} de {classLimit} usadas
                  </span>
                </div>
              ) : showArc ? (
                /* ── Larger plans: Side-by-side with arc ring ── */
                <div className="flex items-center gap-5">
                  {/* Arc progress */}
                  <div className="shrink-0">
                    <ArcProgress
                      percentage={percentage}
                      remaining={classesRemaining}
                      total={classLimit}
                      pal={pal}
                      uid={uid}
                    />
                  </div>

                  {/* Text info */}
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <span className="text-[9px] uppercase tracking-[0.18em] text-white/25">
                      Clases restantes
                    </span>
                    <span
                      className="font-bebas leading-none"
                      style={{
                        fontSize: "3rem",
                        color: pal.accent,
                        textShadow: `0 0 20px ${pal.accent}44`,
                      }}
                    >
                      {classesRemaining}
                    </span>
                    {/* Mini progress bar */}
                    <div className="mt-1.5">
                      <div
                        className="h-1 rounded-full overflow-hidden w-full max-w-[120px]"
                        style={{ background: "rgba(255,255,255,0.04)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${percentage}%`,
                            background: `linear-gradient(90deg, ${pal.progressFrom}, ${pal.progressVia}, ${pal.progressTo})`,
                            boxShadow: `0 0 6px ${pal.progressFrom}55`,
                          }}
                        />
                      </div>
                      <span className="text-[9px] text-white/18 mt-1 block">
                        {used} de {classLimit} usadas
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : isUnlimited ? (
            /* ── Unlimited plan ── */
            <div className="p-5 flex items-center gap-4">
              <div
                className="shrink-0 flex items-center justify-center rounded-2xl h-16 w-16"
                style={{
                  background: `radial-gradient(circle, ${pal.accent}12 0%, transparent 70%)`,
                  border: `1px solid ${pal.accent}18`,
                }}
              >
                <InfinityIcon
                  size={26}
                  style={{
                    color: pal.accent,
                    filter: `drop-shadow(0 0 8px ${pal.accent}55)`,
                  }}
                />
              </div>
              <div>
                <p
                  className="font-bebas text-xl text-white/90 tracking-wide"
                  style={{ textShadow: `0 0 20px ${pal.accent}30` }}
                >
                  Clases ilimitadas
                </p>
                <p className="text-[11px] text-white/30">
                  Sin limite de sesiones
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* ══════ FOOTER: Expiration info ══════ */}
        {expirationText && (
          <div className="mt-4 flex items-center gap-2.5">
            {/* Icon */}
            {isLow ? (
              <Flame size={13} className="shrink-0" style={{ color: "#f87171", opacity: 0.8 }} />
            ) : daysRemaining !== null && daysRemaining <= 10 ? (
              <Clock size={13} className="shrink-0" style={{ color: pal.accent, opacity: 0.5 }} />
            ) : (
              <CalendarDays size={13} className="shrink-0" style={{ color: pal.accent, opacity: 0.4 }} />
            )}

            <div className="flex items-baseline gap-1.5">
              <span
                className="text-[10px] uppercase tracking-[0.12em]"
                style={{ color: isLow ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.22)" }}
              >
                Vence
              </span>
              <span
                className="text-[12px] font-medium"
                style={{ color: isLow ? "#f87171" : "rgba(255,255,255,0.50)" }}
              >
                {expirationText}
              </span>
            </div>

            {/* Remaining days pill (only when <= 10 days) */}
            {daysRemaining !== null && daysRemaining <= 10 && daysRemaining > 0 && (
              <span
                className="ml-auto text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold"
                style={{
                  background: isLow ? "rgba(248,113,113,0.10)" : `${pal.accent}10`,
                  color: isLow ? "#f87171" : pal.accent,
                  border: `1px solid ${isLow ? "rgba(248,113,113,0.18)" : `${pal.accent}18`}`,
                }}
              >
                {daysRemaining}d
              </span>
            )}
          </div>
        )}

        {/* Bottom accent line */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent 10%, ${pal.accent}18 50%, transparent 90%)`,
          }}
        />
      </div>
    </div>
  );
}

export default MembershipCard;
