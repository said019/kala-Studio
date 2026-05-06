import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, ArrowLeft } from "lucide-react";
import { KALA, type KalaTone } from "@/components/app/tokens";

/* ═══════════════════════════════════════════════════════════
   formatMoneyMX
   ═══════════════════════════════════════════════════════════ */
export const formatMoneyMX = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  return n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
};

/* ═══════════════════════════════════════════════════════════
   SegmentedTabs
   ═══════════════════════════════════════════════════════════ */
type SegmentedTabsProps<T extends string> = {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
};
export function SegmentedTabs<T extends string>({ options, value, onChange }: SegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      className="inline-flex p-1 rounded-full"
      style={{ backgroundColor: KALA.blush }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[0.78rem] font-medium uppercase tracking-[0.16em] transition-colors"
            style={{
              backgroundColor: active ? KALA.berry : "transparent",
              color: active ? KALA.cream : KALA.ink,
              opacity: active ? 1 : 0.65,
            }}
          >
            {opt.label}
            {typeof opt.count === "number" && (
              <span
                className="text-[0.66rem] font-bebas tabular-nums"
                style={{ opacity: 0.85 }}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   BackLink
   ═══════════════════════════════════════════════════════════ */
type BackLinkProps = { to: string; label: string };
export const BackLink = ({ to, label }: BackLinkProps) => (
  <Link
    to={to}
    className="inline-flex items-center gap-2 text-[0.74rem] uppercase tracking-[0.2em] no-underline transition-opacity hover:opacity-100 mb-4"
    style={{ color: KALA.ink, opacity: 0.55 }}
  >
    <ArrowLeft size={13} />
    {label}
  </Link>
);

/* ═══════════════════════════════════════════════════════════
   DataRow — key-value
   ═══════════════════════════════════════════════════════════ */
type DataRowProps = {
  label: string;
  value: ReactNode;
  mono?: boolean;
  copyable?: string;
};
export const DataRow = ({ label, value, mono, copyable }: DataRowProps) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!copyable) return;
    navigator.clipboard.writeText(copyable).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div
      className="grid grid-cols-[1fr_auto] items-baseline gap-4 py-3"
      style={{ borderTop: `1px solid ${KALA.border}` }}
    >
      <span className="text-[0.74rem] uppercase tracking-[0.18em]" style={{ color: KALA.ink, opacity: 0.55 }}>
        {label}
      </span>
      <div className="flex items-center gap-2 justify-end">
        <span
          className={"text-right " + (mono ? "font-mono text-[0.92rem]" : "text-[0.94rem] font-medium")}
          style={{ color: KALA.ink }}
        >
          {value}
        </span>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copiado" : "Copiar"}
            className="grid h-7 w-7 place-items-center rounded-full bg-transparent border-0 cursor-pointer transition-colors"
            style={{ color: copied ? KALA.olive : KALA.berry }}
          >
            {copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={13} />}
          </button>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   Stepper — top progress for multi-step flows
   ═══════════════════════════════════════════════════════════ */
type StepperProps<T extends string> = {
  steps: { id: T; label: string }[];
  current: T;
};
export function Stepper<T extends string>({ steps, current }: StepperProps<T>) {
  const currentIdx = Math.max(0, steps.findIndex((s) => s.id === current));
  return (
    <ol className="flex items-center gap-2 list-none m-0 p-0 overflow-x-auto">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const numColor = active ? KALA.berry : done ? KALA.olive : KALA.ink;
        const labelOpacity = active ? 1 : done ? 0.85 : 0.45;
        return (
          <li key={s.id} className="flex items-center gap-2 shrink-0">
            <span
              className="grid h-7 w-7 place-items-center rounded-full text-[0.7rem] font-bebas tabular-nums"
              style={{
                backgroundColor: active ? KALA.berry : done ? KALA.blush : "transparent",
                color: active ? KALA.cream : numColor,
                border: active || done ? "0" : `1px solid ${KALA.border}`,
              }}
            >
              {done ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            <span
              className="text-[0.72rem] uppercase tracking-[0.18em]"
              style={{ color: KALA.ink, opacity: labelOpacity }}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span
                className="hidden sm:inline-block h-px w-6 ml-1"
                style={{ backgroundColor: done ? KALA.olive : KALA.border }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ═══════════════════════════════════════════════════════════
   StickyCta — sticky bottom action for confirm flows
   ═══════════════════════════════════════════════════════════ */
type StickyCtaProps = {
  children: ReactNode;
};
export const StickyCta = ({ children }: StickyCtaProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sentinel = document.createElement("div");
    el.parentElement?.insertBefore(sentinel, el);
    const obs = new IntersectionObserver(([entry]) => {
      setStuck(!entry.isIntersecting);
    }, { rootMargin: "-1px 0px 0px 0px", threshold: [1] });
    obs.observe(sentinel);
    return () => {
      obs.disconnect();
      sentinel.remove();
    };
  }, []);
  return (
    <div
      ref={ref}
      className="sticky bottom-20 lg:bottom-6 z-20 mt-6"
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div
        className="rounded-3xl p-3 transition-shadow"
        style={{
          backgroundColor: stuck ? `${KALA.cream}f5` : "transparent",
          border: stuck ? `1px solid ${KALA.border}` : "0",
          boxShadow: stuck ? "0 12px 32px rgba(46,32,28,0.08)" : "none",
          backdropFilter: stuck ? "blur(12px)" : "none",
          WebkitBackdropFilter: stuck ? "blur(12px)" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   StatusPill — semantic status (booking, order, etc.)
   ═══════════════════════════════════════════════════════════ */
type StatusPillProps = {
  label: string;
  tone: KalaTone;
  variant?: "soft" | "solid";
};
export const StatusPill = ({ label, tone, variant = "soft" }: StatusPillProps) => {
  const c = KALA[tone];
  const isSoft = variant === "soft";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.66rem] font-medium uppercase tracking-[0.18em]"
      style={
        isSoft
          ? { backgroundColor: `${c}1a`, color: c }
          : { backgroundColor: c, color: KALA.cream }
      }
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: isSoft ? c : KALA.cream }} />
      {label}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════
   InfoBanner — soft inline banner (not toast)
   ═══════════════════════════════════════════════════════════ */
type InfoBannerProps = {
  tone?: KalaTone;
  title: string;
  description?: string;
  action?: ReactNode;
};
export const InfoBanner = ({ tone = "berry", title, description, action }: InfoBannerProps) => {
  const c = KALA[tone];
  return (
    <div
      className="flex items-start gap-4 rounded-2xl p-4"
      style={{ backgroundColor: `${c}10`, border: `1px solid ${c}30`, color: KALA.ink }}
    >
      <span className="mt-1 inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c }} />
      <div className="min-w-0 flex-1">
        <p className="text-[0.92rem] font-medium leading-snug" style={{ color: KALA.ink }}>{title}</p>
        {description && (
          <p className="mt-1 text-[0.84rem] leading-[1.5]" style={{ color: KALA.ink, opacity: 0.7 }}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
