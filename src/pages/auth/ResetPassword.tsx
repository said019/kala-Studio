import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import {
  AuthShell,
  AuthPasswordField,
  AuthSubmit,
  AuthErrorBanner,
  AuthPasswordRules,
  KALA,
} from "@/components/auth/AuthShell";
import kalaReset from "@/assets/kala/kala-barre-line.jpg";

const schema = z.object({
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Debe incluir una mayúscula")
    .regex(/[0-9]/, "Debe incluir un número"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type FormValues = { password: string; confirmPassword: string };

const ResetPassword = () => {
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = params.get("token");

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const password = watch("password") ?? "";
  const confirmPassword = watch("confirmPassword") ?? "";
  const matches = password.length > 0 && password === confirmPassword;

  const onSubmit = async (data: FormValues) => {
    if (!token) {
      setGlobalError("El enlace no es válido o expiró. Solicita uno nuevo desde 'Olvidé mi contraseña'.");
      return;
    }
    setLoading(true);
    setGlobalError(null);
    try {
      await api.post("/auth/reset-password", { token, password: data.password });
      setDone(true);
      setTimeout(() => navigate("/auth/login"), 1800);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "El enlace ya no es válido. Pide uno nuevo.";
      setGlobalError(msg);
      toast({ title: "No pudimos cambiar la contraseña", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      brandPhoto={kalaReset}
      brandPhotoAlt="Detalle de la barra del estudio"
      brandTint="coral"
      brandEyebrow="Nueva contraseña"
      brandHeadline={<>Casi listo,</>}
      brandHeadlineItalic="elige una clave nueva."
      brandSubline="Algo que recuerdes pero que no sea fácil de adivinar. Mínimo 8 caracteres, una mayúscula y un número."
      formEyebrow="Restablecer contraseña"
      formHeadline={done ? "Listo." : "Crea tu"}
      formHeadlineItalic={done ? "Te llevamos a iniciar sesión." : "nueva contraseña."}
    >
      {done ? (
        <div
          className="flex items-start gap-4 rounded-2xl px-5 py-5"
          style={{ backgroundColor: KALA.blush, border: `1px solid ${KALA.olive}40` }}
        >
          <span className="grid h-10 w-10 place-items-center rounded-full shrink-0" style={{ backgroundColor: KALA.olive, color: KALA.cream }}>
            <CheckCircle2 size={18} />
          </span>
          <div>
            <p className="text-[0.96rem] leading-[1.5]" style={{ color: KALA.ink }}>
              Contraseña actualizada. Te llevamos a iniciar sesión en un momento.
            </p>
            <Link
              to="/auth/login"
              className="mt-3 inline-flex items-center gap-2 text-[0.86rem] font-medium no-underline"
              style={{ color: KALA.berry }}
            >
              Entrar ahora
            </Link>
          </div>
        </div>
      ) : !token ? (
        <div
          role="alert"
          className="flex items-start gap-4 rounded-2xl px-5 py-5"
          style={{ backgroundColor: `${KALA.destructive}10`, border: `1px solid ${KALA.destructive}40`, color: KALA.destructive }}
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-[0.96rem] leading-[1.55]">
              El enlace no es válido o ya expiró. Pide uno nuevo y revisa tu correo.
            </p>
            <Link
              to="/auth/forgot-password"
              className="mt-3 inline-flex items-center gap-2 text-[0.86rem] font-medium no-underline"
              style={{ color: KALA.berry }}
            >
              Pedir un enlace nuevo
            </Link>
          </div>
        </div>
      ) : (
        <>
          {globalError && <AuthErrorBanner message={globalError} />}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <AuthPasswordField
                label="Nueva contraseña"
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                error={errors.password?.message}
                {...register("password")}
              />
              <AuthPasswordRules password={password} />
            </div>

            <AuthPasswordField
              label="Confirmar"
              placeholder="Repite tu contraseña"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              hint={matches ? "Coincide" : undefined}
              {...register("confirmPassword")}
            />

            <AuthSubmit loading={loading} loadingLabel="Guardando…">
              Cambiar contraseña
            </AuthSubmit>
          </form>

          <p className="mt-7 text-center text-[0.86rem]" style={{ color: KALA.ink, opacity: 0.7 }}>
            <Link to="/auth/login" className="no-underline font-medium" style={{ color: KALA.berry }}>
              Volver a iniciar sesión
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
};

export default ResetPassword;
