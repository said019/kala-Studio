import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2, ArrowRight, Check, AlertCircle } from "lucide-react";
import kalaLogoUrl from "@/assets/kala/kala-logo.png";

/* ── Brand color roles, mirror landing ── */
export const KALA = {
  cream: "#FFF7F2",
  blush: "#FCE6E1",
  ink: "#2E201C",
  berry: "#76214D",
  coral: "#E9745F",
  olive: "#778455",
  orange: "#F58A24",
  border: "#E8CAC1",
  destructive: "#B23A48",
} as const;

type Tint = "berry" | "coral" | "olive";

const TINT_VALUE: Record<Tint, string> = {
  berry: KALA.berry,
  coral: KALA.coral,
  olive: KALA.olive,
};

export type AuthShellProps = {
  brandPhoto: string;
  brandPhotoAlt: string;
  brandTint?: Tint;
  brandEyebrow: string;
  brandHeadline: ReactNode;
  brandHeadlineItalic?: string;
  brandSubline?: string;
  brandList?: { label: string }[];
  brandQuote?: string;

  formEyebrow: string;
  formHeadline: ReactNode;
  formHeadlineItalic?: string;
  formIntro?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/* ═══════════════════════════════════════════════════════════
   AuthShell — split layout shared by Login, Register, Forgot, Reset
   Mobile: photo collapses to 30vh header banner with title overlay.
   Desktop: 50/50 split, brand left, form right.
   ═══════════════════════════════════════════════════════════ */
export const AuthShell = ({
  brandPhoto,
  brandPhotoAlt,
  brandTint = "berry",
  brandEyebrow,
  brandHeadline,
  brandHeadlineItalic,
  brandSubline,
  brandList,
  brandQuote,
  formEyebrow,
  formHeadline,
  formHeadlineItalic,
  formIntro,
  children,
  footer,
}: AuthShellProps) => {
  const tint = TINT_VALUE[brandTint];

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2" style={{ backgroundColor: KALA.cream, color: KALA.ink }}>
      {/* ── BRAND PANEL ── */}
      <aside
        className="relative overflow-hidden lg:min-h-screen"
        style={{ minHeight: "30vh" }}
      >
        <img
          src={brandPhoto}
          alt={brandPhotoAlt}
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
        />
        {/* Tint wash */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(140deg, ${tint}d9 0%, ${tint}80 45%, ${tint}40 100%)`,
          }}
        />
        {/* Vertical readability gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${KALA.ink}59 0%, transparent 35%, ${KALA.ink}73 100%)`,
          }}
        />

        <div className="relative z-10 flex h-full min-h-[30vh] lg:min-h-screen flex-col justify-between p-6 sm:p-9 lg:p-12">
          <Link
            to="/"
            className="inline-flex items-center no-underline"
            aria-label="Inicio Kala Barre Studio"
          >
            <img
              src={kalaLogoUrl}
              alt="Kala Barre Studio"
              className="h-10 sm:h-12 w-auto object-contain"
              style={{ filter: "brightness(0) invert(1)" }}
            />
          </Link>

          <div className="max-w-[440px]">
            <span className="text-[0.62rem] font-medium uppercase tracking-[0.32em]" style={{ color: KALA.cream, opacity: 0.78 }}>
              {brandEyebrow}
            </span>
            <h2
              className="font-bebas mt-4 leading-[0.92]"
              style={{ color: KALA.cream, fontSize: "clamp(2.1rem, 4.4vw, 3.8rem)" }}
            >
              {brandHeadline}
              {brandHeadlineItalic && (
                <span
                  className="block italic font-alilato font-normal"
                  style={{ color: KALA.cream, opacity: 0.92, fontSize: "0.78em" }}
                >
                  {brandHeadlineItalic}
                </span>
              )}
            </h2>
            {brandSubline && (
              <p className="mt-5 text-[0.95rem] leading-[1.7] max-w-[34ch]" style={{ color: KALA.cream, opacity: 0.85 }}>
                {brandSubline}
              </p>
            )}

            {brandList && brandList.length > 0 && (
              <ul className="mt-7 hidden lg:flex flex-col list-none p-0 m-0">
                {brandList.map((item, i) => (
                  <li
                    key={item.label}
                    className="grid grid-cols-[auto_1fr] items-center gap-4 py-3"
                    style={{
                      borderTop: `1px solid ${KALA.cream}33`,
                      borderBottom: i === brandList.length - 1 ? `1px solid ${KALA.cream}33` : undefined,
                    }}
                  >
                    <span
                      className="grid h-7 w-7 place-items-center rounded-full"
                      style={{ backgroundColor: KALA.cream, color: tint }}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="text-[0.88rem] leading-[1.55]" style={{ color: KALA.cream, opacity: 0.92 }}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {brandQuote && (
              <p className="mt-7 hidden lg:block font-alilato italic text-[0.95rem] leading-[1.55] max-w-[32ch]" style={{ color: KALA.cream, opacity: 0.85 }}>
                «{brandQuote}»
              </p>
            )}
          </div>

          <div className="hidden lg:flex items-center justify-between text-[0.7rem] uppercase tracking-[0.22em]" style={{ color: KALA.cream, opacity: 0.55 }}>
            <span>Kala Barre Studio</span>
            <span>San Luis Potosí, MX</span>
          </div>
        </div>
      </aside>

      {/* ── FORM PANEL ── */}
      <main className="relative flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-10 lg:py-12">
        <div className="mx-auto w-full max-w-[460px]">
          <div className="mb-9">
            <span className="inline-flex items-center gap-2 text-[0.66rem] font-medium uppercase tracking-[0.32em]" style={{ color: tint }}>
              <span className="inline-block h-px w-5" style={{ backgroundColor: tint }} />
              {formEyebrow}
            </span>
            <h1
              className="font-bebas mt-4 leading-[0.92] tracking-[-0.005em]"
              style={{ color: KALA.ink, fontSize: "clamp(2.3rem, 4vw, 3.2rem)" }}
            >
              {formHeadline}
              {formHeadlineItalic && (
                <span
                  className="block italic font-alilato font-normal"
                  style={{ color: tint, fontSize: "0.78em" }}
                >
                  {formHeadlineItalic}
                </span>
              )}
            </h1>
            {formIntro && (
              <p className="mt-4 text-[0.95rem] leading-[1.65] max-w-[44ch]" style={{ color: KALA.ink, opacity: 0.7 }}>
                {formIntro}
              </p>
            )}
          </div>

          {children}

          {footer && <div className="mt-8">{footer}</div>}

          <p className="mt-10 text-[0.7rem] uppercase tracking-[0.2em]" style={{ color: KALA.ink, opacity: 0.42 }}>
            © {new Date().getFullYear()} Kala Barre Studio
          </p>
        </div>
      </main>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   AuthField — input with label + error
   ═══════════════════════════════════════════════════════════ */

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  rightSlot?: ReactNode;
};

export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(
  ({ label, error, hint, rightSlot, className, id, ...rest }, ref) => {
    const inputId = id ?? `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={inputId}
            className="text-[0.64rem] font-medium uppercase tracking-[0.22em]"
            style={{ color: KALA.ink, opacity: 0.62 }}
          >
            {label}
          </label>
          {rightSlot}
        </div>
        <input
          ref={ref}
          id={inputId}
          className={
            "w-full rounded-2xl px-4 py-3.5 text-[0.95rem] outline-none transition-all duration-200 placeholder:text-[color:rgba(46,32,28,0.32)] focus-visible:ring-2 " +
            (className ?? "")
          }
          style={{
            backgroundColor: KALA.cream,
            color: KALA.ink,
            border: `1px solid ${error ? KALA.destructive : KALA.border}`,
            boxShadow: error ? `0 0 0 2px ${KALA.destructive}1a` : undefined,
          }}
          {...rest}
        />
        {error ? (
          <p className="flex items-center gap-1.5 text-[0.78rem] mt-0.5" style={{ color: KALA.destructive }}>
            <AlertCircle size={13} />
            {error}
          </p>
        ) : hint ? (
          <p className="text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
AuthField.displayName = "AuthField";

/* ═══════════════════════════════════════════════════════════
   AuthPasswordField — with eye toggle
   ═══════════════════════════════════════════════════════════ */

type AuthPasswordFieldProps = Omit<AuthFieldProps, "type" | "rightSlot"> & {
  forgotLink?: string;
};

export const AuthPasswordField = forwardRef<HTMLInputElement, AuthPasswordFieldProps>(
  ({ label, error, hint, forgotLink, className, id, ...rest }, ref) => {
    const [show, setShow] = useState(false);
    const inputId = id ?? `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={inputId}
            className="text-[0.64rem] font-medium uppercase tracking-[0.22em]"
            style={{ color: KALA.ink, opacity: 0.62 }}
          >
            {label}
          </label>
          {forgotLink && (
            <Link
              to={forgotLink}
              className="text-[0.74rem] no-underline transition-colors hover:opacity-80"
              style={{ color: KALA.berry }}
            >
              ¿Olvidaste?
            </Link>
          )}
        </div>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={show ? "text" : "password"}
            className={
              "w-full rounded-2xl pl-4 pr-12 py-3.5 text-[0.95rem] outline-none transition-all duration-200 placeholder:text-[color:rgba(46,32,28,0.32)] focus-visible:ring-2 " +
              (className ?? "")
            }
            style={{
              backgroundColor: KALA.cream,
              color: KALA.ink,
              border: `1px solid ${error ? KALA.destructive : KALA.border}`,
              boxShadow: error ? `0 0 0 2px ${KALA.destructive}1a` : undefined,
            }}
            {...rest}
          />
          <button
            type="button"
            aria-pressed={show}
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full transition-colors"
            style={{ color: KALA.ink, opacity: 0.55 }}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {error ? (
          <p className="flex items-center gap-1.5 text-[0.78rem] mt-0.5" style={{ color: KALA.destructive }}>
            <AlertCircle size={13} />
            {error}
          </p>
        ) : hint ? (
          <p className="text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
AuthPasswordField.displayName = "AuthPasswordField";

/* ═══════════════════════════════════════════════════════════
   AuthSubmit — pill button with loading
   ═══════════════════════════════════════════════════════════ */

type AuthSubmitProps = {
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
  disabled?: boolean;
};

export const AuthSubmit = ({ loading, loadingLabel, children, disabled }: AuthSubmitProps) => (
  <button
    type="submit"
    disabled={disabled || loading}
    className="group relative mt-2 inline-flex w-full items-center justify-center gap-3 rounded-full px-7 py-4 text-[0.84rem] font-medium uppercase tracking-[0.18em] transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0 disabled:cursor-not-allowed"
    style={{ backgroundColor: KALA.berry, color: KALA.cream, boxShadow: `0 12px 28px ${KALA.berry}30` }}
  >
    {loading ? (
      <>
        <Loader2 size={15} className="animate-spin" />
        {loadingLabel ?? "Cargando…"}
      </>
    ) : (
      <>
        {children}
        <span
          className="grid h-7 w-7 place-items-center rounded-full transition-transform group-hover:translate-x-0.5"
          style={{ backgroundColor: `${KALA.cream}26` }}
        >
          <ArrowRight size={13} />
        </span>
      </>
    )}
  </button>
);

/* ═══════════════════════════════════════════════════════════
   AuthSecondaryLink — full-width ghost link styled as button
   ═══════════════════════════════════════════════════════════ */

type AuthSecondaryLinkProps = {
  to: string;
  children: ReactNode;
};

export const AuthSecondaryLink = ({ to, children }: AuthSecondaryLinkProps) => (
  <Link
    to={to}
    className="inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[0.78rem] font-medium uppercase tracking-[0.2em] no-underline transition-colors duration-200"
    style={{ border: `1px solid ${KALA.border}`, color: KALA.ink, opacity: 0.85 }}
  >
    {children}
  </Link>
);

/* ═══════════════════════════════════════════════════════════
   AuthErrorBanner — global form error
   ═══════════════════════════════════════════════════════════ */

export const AuthErrorBanner = ({ message }: { message: string }) => (
  <div
    role="alert"
    className="mb-6 flex items-start gap-3 rounded-2xl px-4 py-3 text-[0.86rem]"
    style={{
      backgroundColor: `${KALA.destructive}10`,
      border: `1px solid ${KALA.destructive}40`,
      color: KALA.destructive,
    }}
  >
    <AlertCircle size={16} className="mt-0.5 shrink-0" />
    <span className="leading-[1.5]">{message}</span>
  </div>
);

/* ═══════════════════════════════════════════════════════════
   AuthDivider — hairline with optional center label
   ═══════════════════════════════════════════════════════════ */

export const AuthDivider = ({ label }: { label?: string }) => (
  <div className="my-7 flex items-center gap-4">
    <span className="flex-1 h-px" style={{ backgroundColor: KALA.border }} />
    {label && (
      <span className="text-[0.66rem] uppercase tracking-[0.22em]" style={{ color: KALA.ink, opacity: 0.45 }}>
        {label}
      </span>
    )}
    <span className="flex-1 h-px" style={{ backgroundColor: KALA.border }} />
  </div>
);

/* ═══════════════════════════════════════════════════════════
   AuthCheckbox — controlled custom checkbox row
   ═══════════════════════════════════════════════════════════ */

type AuthCheckboxProps = {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  error?: string;
};

export const AuthCheckbox = ({ checked, onChange, children, error }: AuthCheckboxProps) => (
  <div className="flex flex-col gap-1">
    <label className="flex items-start gap-3 cursor-pointer group">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md transition-all"
        style={{
          backgroundColor: checked ? KALA.berry : "transparent",
          border: `1px solid ${checked ? KALA.berry : KALA.border}`,
        }}
      >
        {checked && <Check size={12} strokeWidth={3} style={{ color: KALA.cream }} />}
      </button>
      <span className="text-[0.86rem] leading-[1.5]" style={{ color: KALA.ink, opacity: 0.78 }}>
        {children}
      </span>
    </label>
    {error && (
      <p className="flex items-center gap-1.5 pl-8 text-[0.78rem]" style={{ color: KALA.destructive }}>
        <AlertCircle size={13} />
        {error}
      </p>
    )}
  </div>
);

/* ═══════════════════════════════════════════════════════════
   AuthPasswordRules — live requirements list
   ═══════════════════════════════════════════════════════════ */

type Rule = { label: string; ok: boolean };
export const AuthPasswordRules = ({ password = "" }: { password?: string }) => {
  const rules: Rule[] = [
    { label: "Mínimo 8 caracteres", ok: password.length >= 8 },
    { label: "Una mayúscula", ok: /[A-Z]/.test(password) },
    { label: "Un número", ok: /[0-9]/.test(password) },
  ];
  return (
    <ul className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-y-1 gap-x-4 list-none p-0 m-0">
      {rules.map((r) => (
        <li key={r.label} className="flex items-center gap-2 text-[0.74rem]" style={{ color: r.ok ? KALA.olive : KALA.ink, opacity: r.ok ? 1 : 0.5 }}>
          <span
            className="grid h-4 w-4 place-items-center rounded-full transition-colors"
            style={{
              backgroundColor: r.ok ? KALA.olive : "transparent",
              border: `1px solid ${r.ok ? KALA.olive : KALA.border}`,
              color: KALA.cream,
            }}
          >
            {r.ok && <Check size={9} strokeWidth={3.5} />}
          </span>
          {r.label}
        </li>
      ))}
    </ul>
  );
};
