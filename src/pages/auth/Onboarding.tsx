import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";
import {
  AuthShell,
  AuthSubmit,
  AuthErrorBanner,
  KALA,
} from "@/components/auth/AuthShell";
import type { User } from "@/types/auth";
import kalaBarre from "@/assets/kala/kala-barre-line.jpg";

type YesNo = "yes" | "no" | null;

const YesNoField = ({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: YesNo;
  onChange: (v: "yes" | "no") => void;
  error?: string;
}) => (
  <div className="flex flex-col gap-2">
    <span
      className="text-[0.84rem] font-medium"
      style={{ color: KALA.ink }}
    >
      {label}
    </span>
    <div className="grid grid-cols-2 gap-3">
      {(["yes", "no"] as const).map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className="rounded-2xl px-4 py-3 text-[0.9rem] font-medium transition-all duration-200"
            style={{
              backgroundColor: active ? KALA.berry : KALA.cream,
              color: active ? KALA.cream : KALA.ink,
              border: `1px solid ${active ? KALA.berry : KALA.border}`,
            }}
          >
            {opt === "yes" ? "Sí" : "No"}
          </button>
        );
      })}
    </div>
    {error && (
      <p className="text-[0.78rem]" style={{ color: KALA.destructive }}>
        {error}
      </p>
    )}
  </div>
);

const Onboarding = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, updateUser } = useAuthStore();

  const [hasInjury, setHasInjury] = useState<YesNo>(null);
  const [practicedBarre, setPracticedBarre] = useState<YesNo>(null);
  const [injuryDetails, setInjuryDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const injuryReported = hasInjury === "yes";
  const detailsMissing = injuryReported && injuryDetails.trim().length === 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (hasInjury === null || practicedBarre === null) {
      setError("Responde ambas preguntas para continuar.");
      return;
    }
    if (detailsMissing) {
      setError("Cuéntanos qué lesión o condición debemos tener en cuenta.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ user: User }>("/auth/onboarding", {
        hasInjury: injuryReported,
        practicedBarreBefore: practicedBarre === "yes",
        injuryDetails: injuryReported ? injuryDetails.trim() : null,
      });
      if (res.data?.user && user) {
        updateUser({ ...user, ...res.data.user });
      }
      navigate("/app");
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "No pudimos guardar tus respuestas.";
      setError(msg);
      toast({ title: "Algo salió mal", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      brandPhoto={kalaBarre}
      brandPhotoAlt="Línea de barre en una clase de Kala"
      brandTint="berry"
      brandEyebrow="Casi listas"
      brandHeadline={<>Antes de tu</>}
      brandHeadlineItalic="primera clase."
      brandSubline="Estas respuestas nos ayudan a cuidarte. Tu instructora las verá para adaptar los ejercicios a ti."
      brandList={[
        { label: "Atención personalizada" },
        { label: "Ejercicios adaptados a tu cuerpo" },
        { label: "Cinco lugares por clase" },
      ]}
      formEyebrow="Un último paso"
      formHeadline="Cuéntanos sobre"
      formHeadlineItalic="ti."
    >
      <p
        className="mb-6 text-[0.88rem] leading-relaxed"
        style={{ color: KALA.ink, opacity: 0.6 }}
      >
        Necesitamos saber esto antes de que entres. Solo toma un momento.
      </p>

      {error && <AuthErrorBanner message={error} />}

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <YesNoField
          label="¿Tienes alguna lesión o condición física actual?"
          value={hasInjury}
          onChange={(v) => setHasInjury(v)}
          error={touched && hasInjury === null ? "Selecciona una opción" : undefined}
        />

        {injuryReported && (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="injury-details"
              className="text-[0.84rem] font-medium"
              style={{ color: KALA.ink }}
            >
              Cuéntanos qué debemos saber (lesión, cirugía, embarazo, etc.)
            </label>
            <textarea
              id="injury-details"
              rows={4}
              value={injuryDetails}
              onChange={(e) => setInjuryDetails(e.target.value)}
              placeholder="Ej: Lesión de rodilla derecha hace 3 meses, evito impacto."
              className="w-full rounded-2xl px-4 py-3.5 text-[0.95rem] outline-none transition-all duration-200 focus-visible:ring-2 resize-none"
              style={{
                backgroundColor: KALA.cream,
                color: KALA.ink,
                border: `1px solid ${
                  touched && detailsMissing ? KALA.destructive : KALA.border
                }`,
              }}
            />
            {touched && detailsMissing && (
              <p className="text-[0.78rem]" style={{ color: KALA.destructive }}>
                Este dato es importante para cuidarte.
              </p>
            )}
          </div>
        )}

        <YesNoField
          label="¿Habías practicado barre antes?"
          value={practicedBarre}
          onChange={(v) => setPracticedBarre(v)}
          error={touched && practicedBarre === null ? "Selecciona una opción" : undefined}
        />

        <AuthSubmit loading={submitting} loadingLabel="Guardando…">
          Entrar a Kala
        </AuthSubmit>
      </form>
    </AuthShell>
  );
};

export default Onboarding;
