import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";
import {
  AuthShell,
  AuthField,
  AuthPasswordField,
  AuthSubmit,
  AuthErrorBanner,
  AuthDivider,
  AuthSecondaryLink,
  AuthCheckbox,
  AuthPasswordRules,
  KALA,
} from "@/components/auth/AuthShell";
import { Check } from "lucide-react";
import kalaRegister from "@/assets/kala/kala-class-energy.jpg";

const todayISO = new Date().toISOString().slice(0, 10);

const schema = z.object({
  displayName: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 10, "Debe tener 10 dígitos"),
  gender: z.enum(["female", "male", "other"], { required_error: "Selecciona una opción" }),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Selecciona una fecha válida")
    .refine((v) => {
      const d = new Date(v + "T00:00:00Z");
      const y = Number(v.slice(0, 4));
      return !Number.isNaN(d.getTime()) && y >= 1900 && d <= new Date();
    }, "Fecha fuera de rango"),
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Debe incluir una mayúscula")
    .regex(/[0-9]/, "Debe incluir un número"),
  confirmPassword: z.string(),
  acceptsTerms: z.boolean().refine((v) => v, "Debes aceptar los términos"),
  acceptsCommunications: z.boolean().default(false),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type FormValues = {
  displayName: string;
  email: string;
  phone: string;
  gender: "female" | "male" | "other";
  dateOfBirth: string;
  password: string;
  confirmPassword: string;
  acceptsTerms: boolean;
  acceptsCommunications: boolean;
};

const Register = () => {
  const { register: registerUser, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const refCode = params.get("ref");

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { acceptsTerms: false, acceptsCommunications: false },
  });

  const acceptsTerms = watch("acceptsTerms");
  const acceptsCommunications = watch("acceptsCommunications");
  const password = watch("password") ?? "";
  const confirmPassword = watch("confirmPassword") ?? "";
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const onSubmit = async (data: FormValues) => {
    clearError();
    const rawPhone = data.phone.replace(/\D/g, "");
    const phone = rawPhone.startsWith("52") ? `+${rawPhone}` : `+52${rawPhone}`;
    try {
      await registerUser({
        email: data.email,
        password: data.password,
        displayName: data.displayName,
        phone,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth,
        acceptsTerms: data.acceptsTerms,
        acceptsCommunications: data.acceptsCommunications,
        ...(refCode ? { referralCode: refCode } : {}),
      } as any);
      navigate("/app");
    } catch {
      toast({
        title: "No pudimos crear tu cuenta",
        description: error ?? "Inténtalo de nuevo en un momento.",
        variant: "destructive",
      });
    }
  };

  return (
    <AuthShell
      brandPhoto={kalaRegister}
      brandPhotoAlt="Energía de una clase grupal en Kala"
      brandTint="berry"
      brandEyebrow="Nueva en Kala"
      brandHeadline={<>Te recibimos</>}
      brandHeadlineItalic="como te recibe una amiga."
      brandSubline="Crea tu cuenta y reserva tu primera clase. Cinco lugares, atención personalizada, una persona que te enseña."
      brandList={[
        { label: "Reservas y check-in en línea" },
        { label: "Anillos de progreso semanales" },
        { label: "Recordatorios por WhatsApp" },
        { label: "Eventos y videos exclusivos" },
      ]}
      formEyebrow="Crear cuenta"
      formHeadline="Únete a"
      formHeadlineItalic="Kala."
    >
      {refCode && (
        <div
          className="mb-6 flex items-center gap-3 rounded-2xl px-4 py-3 text-[0.84rem]"
          style={{ backgroundColor: KALA.blush, color: KALA.berry, border: `1px solid ${KALA.berry}30` }}
        >
          <span className="grid h-6 w-6 place-items-center rounded-full" style={{ backgroundColor: KALA.berry, color: KALA.cream }}>
            <Check size={11} strokeWidth={3} />
          </span>
          Código de referido <strong className="ml-1 font-bebas tracking-wide">{refCode}</strong>
        </div>
      )}

      {error && <AuthErrorBanner message={error} />}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <AuthField
            label="Nombre"
            placeholder="Tu nombre"
            autoComplete="given-name"
            error={errors.displayName?.message}
            {...register("displayName")}
          />
          <AuthField
            label="WhatsApp"
            placeholder="4271234567"
            inputMode="numeric"
            autoComplete="tel"
            hint="Solo dígitos, agregamos +52"
            error={errors.phone?.message}
            {...register("phone")}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="f-genero"
              className="text-[0.64rem] font-medium uppercase tracking-[0.22em]"
              style={{ color: KALA.ink, opacity: 0.62 }}
            >
              Sexo
            </label>
            <select
              id="f-genero"
              {...register("gender")}
              defaultValue=""
              className="w-full rounded-2xl px-4 py-3.5 text-[0.95rem] outline-none transition-all duration-200 focus-visible:ring-2 appearance-none bg-no-repeat"
              style={{
                backgroundColor: KALA.cream,
                color: KALA.ink,
                border: `1px solid ${errors.gender ? KALA.destructive : KALA.border}`,
                boxShadow: errors.gender ? `0 0 0 2px ${KALA.destructive}1a` : undefined,
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 6L11 1' stroke='%2376214D' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundPosition: "right 1rem center",
                paddingRight: "2.6rem",
              }}
            >
              <option value="" disabled>Selecciona</option>
              <option value="female">Femenino</option>
              <option value="male">Masculino</option>
              <option value="other">Prefiero no decir</option>
            </select>
            {errors.gender && (
              <p className="text-[0.78rem] mt-0.5" style={{ color: KALA.destructive }}>
                {errors.gender.message}
              </p>
            )}
          </div>

          <AuthField
            label="Fecha de nacimiento"
            type="date"
            max={todayISO}
            min="1900-01-01"
            hint="Para felicitarte el día"
            error={errors.dateOfBirth?.message}
            {...register("dateOfBirth")}
          />
        </div>

        <AuthField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="tu@email.com"
          error={errors.email?.message}
          {...register("email")}
        />

        <div className="flex flex-col gap-3">
          <AuthPasswordField
            label="Contraseña"
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
          hint={passwordsMatch ? "Coincide" : undefined}
          {...register("confirmPassword")}
        />

        <div className="flex flex-col gap-3 pt-1">
          <AuthCheckbox
            checked={acceptsTerms}
            onChange={(v) => setValue("acceptsTerms", v, { shouldValidate: true })}
            error={errors.acceptsTerms?.message}
          >
            Acepto los{" "}
            <a
              href="/legal/terminos"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline font-medium"
              style={{ color: KALA.berry }}
            >
              términos y condiciones
            </a>{" "}
            y el{" "}
            <a
              href="/legal/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline font-medium"
              style={{ color: KALA.berry }}
            >
              aviso de privacidad
            </a>
            .
          </AuthCheckbox>

          <AuthCheckbox
            checked={acceptsCommunications}
            onChange={(v) => setValue("acceptsCommunications", v)}
          >
            Quiero recibir recordatorios y novedades por WhatsApp.
          </AuthCheckbox>
        </div>

        <AuthSubmit loading={isLoading} loadingLabel="Creando…">
          Crear mi cuenta
        </AuthSubmit>
      </form>

      <AuthDivider label="¿Ya tienes cuenta?" />

      <AuthSecondaryLink to="/auth/login">Iniciar sesión</AuthSecondaryLink>
    </AuthShell>
  );
};

export default Register;
