import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, Check, ArrowRight } from "lucide-react";
import kalaAuthRegister from "@/assets/kala/kala-detail-ankle-weights.jpg";
import opheliaLogo from "@/assets/ophelia-logo-full.webp";

const schema = z.object({
  displayName: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))           // quitar no-dígitos
    .refine((v) => v.length === 10, "Debe tener 10 dígitos"),
  gender: z.enum(["female", "male", "other"]),
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
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { acceptsTerms: false, acceptsCommunications: false },
  });

  const acceptsTerms = watch("acceptsTerms");
  const acceptsCommunications = watch("acceptsCommunications");

  const onSubmit = async (data: FormValues) => {
    clearError();
    // normalizar teléfono: quitar no-dígitos y agregar prefijo +52
    const rawPhone = data.phone.replace(/\D/g, "");
    const phone = rawPhone.startsWith("52") ? `+${rawPhone}` : `+52${rawPhone}`;
    try {
      await registerUser({
        email: data.email,
        password: data.password,
        displayName: data.displayName,
        phone,
        gender: data.gender,
        acceptsTerms: data.acceptsTerms,
        acceptsCommunications: data.acceptsCommunications,
        ...(refCode ? { referralCode: refCode } : {}),
      } as any);
      navigate("/app");
    } catch {
      toast({ title: "Error al registrarse", description: error ?? "Inténtalo de nuevo", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── LEFT PANEL — photo ── */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden">
        <img
          src={kalaAuthRegister}
          alt="Kala Barre Studio"
          className="absolute inset-0 w-full h-full object-cover scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-transparent to-transparent" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link to="/" className="block">
            <img
              src={opheliaLogo}
              alt="Kala Barre Studio"
              className="w-[210px] sm:w-[240px] lg:w-[290px] max-w-full object-contain drop-shadow-[0_0_24px_rgba(118,33,77,0.18)]"
            />
          </Link>

          <div>
            <h2 className="font-bebas text-[clamp(2.45rem,4.1vw,4.45rem)] leading-[0.92] text-foreground mb-5">
              FORMA PARTE<br />
              <span className="text-primary">DE KALA</span>
            </h2>
            <p className="text-muted-foreground text-[0.88rem] leading-[1.7] max-w-[320px] mb-8">
              Crea tu cuenta
            </p>
            {/* benefits list */}
            <div className="flex flex-col gap-3">
              {[
                "Acceso a reservas de clases en línea",
                "Programa de lealtad con recompensas",
                "Videos exclusivos para alumnas",
                "Notificaciones y recordatorios",
              ].map((b) => (
                <div key={b} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0">
                    <Check size={11} className="text-primary" />
                  </span>
                  <span className="text-[0.82rem] text-muted-foreground">{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — form ── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-10 relative overflow-hidden">
        {/* ambient glows */}
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[120px] bg-[radial-gradient(circle,hsl(var(--primary)/0.10)_0%,transparent_70%)] -top-[80px] -right-[80px] pointer-events-none" />
        <div className="absolute w-[300px] h-[300px] rounded-full blur-[80px] bg-[radial-gradient(circle,hsl(var(--primary)/0.07)_0%,transparent_70%)] bottom-[30px] left-[30px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-[420px]">

          {/* Mobile logo */}
          <Link to="/" className="lg:hidden block mb-8">
            <img
              src={opheliaLogo}
              alt="Kala Barre Studio"
              className="w-[210px] sm:w-[230px] max-w-full object-contain drop-shadow-[0_0_22px_rgba(118,33,77,0.16)]"
            />
          </Link>

          {/* heading */}
          <div className="mb-8">
            <p className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-3 flex items-center gap-2">
              <span className="w-5 h-[1px] bg-primary inline-block" />
              Nuevo registro
            </p>
            <h1 className="font-bebas text-[2.65rem] leading-none text-foreground">
              CREAR<br />
              <span className="text-primary">CUENTA</span>
            </h1>
          </div>

          {/* ref code badge */}
          {refCode && (
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 px-4 py-2.5 rounded-xl mb-6 text-sm text-primary">
              <Check size={14} />
              Código de referido: <strong>{refCode}</strong>
            </div>
          )}

          {/* global error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-xl mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">

            {/* 2-col: name + phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Nombre</label>
                <input
                  placeholder="Tu nombre"
                  {...register("displayName")}
                  className="bg-secondary border border-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-all"
                />
                {errors.displayName && <span className="text-xs text-destructive">{errors.displayName.message}</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Teléfono</label>
                <input
                  placeholder="4271234567"
                  inputMode="numeric"
                  {...register("phone")}
                  className="bg-secondary border border-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-all"
                />
                {errors.phone && <span className="text-xs text-destructive">{errors.phone.message}</span>}
              </div>
            </div>

            {/* gender */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Sexo</label>
              <select
                {...register("gender")}
                className="bg-secondary border border-border rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:border-primary transition-all"
                defaultValue=""
              >
                <option value="" disabled>Selecciona…</option>
                <option value="female">Femenino</option>
                <option value="male">Masculino</option>
                <option value="other">Otro</option>
              </select>
              {errors.gender && <span className="text-xs text-destructive">{errors.gender.message}</span>}
            </div>

            {/* email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Email</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                {...register("email")}
                className="bg-secondary border border-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-all"
              />
              {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
            </div>

            {/* 2-col: password + confirm */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    {...register("password")}
                    className="w-full bg-secondary border border-border rounded-xl px-4 py-3 pr-11 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-all"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && <span className="text-xs text-destructive">{errors.password.message}</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Confirmar</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    placeholder="••••••••"
                    {...register("confirmPassword")}
                    className="w-full bg-secondary border border-border rounded-xl px-4 py-3 pr-11 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-all"
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.confirmPassword && <span className="text-xs text-destructive">{errors.confirmPassword.message}</span>}
              </div>
            </div>

            {/* checkboxes */}
            <div className="flex flex-col gap-3 pt-1">
              {/* terms */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <button
                  type="button"
                  onClick={() => setValue("acceptsTerms", !acceptsTerms)}
                  className={`mt-0.5 w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-all ${
                    acceptsTerms ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
                  }`}
                >
                  {acceptsTerms && <Check size={12} className="text-primary-foreground" />}
                </button>
                <span className="text-sm text-muted-foreground leading-snug">
                  Acepto los{" "}
                  <Link to="/legal/terminos" className="text-primary hover:underline" target="_blank">términos y condiciones</Link>
                </span>
              </label>
              {errors.acceptsTerms && <span className="text-xs text-destructive -mt-1">{errors.acceptsTerms.message}</span>}

              {/* communications */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <button
                  type="button"
                  onClick={() => setValue("acceptsCommunications", !acceptsCommunications)}
                  className={`mt-0.5 w-5 h-5 rounded-md border flex-shrink-0 flex items-center justify-center transition-all ${
                    acceptsCommunications ? "bg-primary border-primary" : "border-border group-hover:border-primary/50"
                  }`}
                >
                  {acceptsCommunications && <Check size={12} className="text-primary-foreground" />}
                </button>
                <span className="text-sm text-muted-foreground leading-snug">
                  Quiero recibir promociones y noticias
                </span>
              </label>
            </div>

            {/* submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-3 bg-primary text-primary-foreground py-4 rounded-xl text-sm font-medium tracking-wider uppercase flex items-center justify-center gap-2 hover:-translate-y-[2px] hover:shadow-[0_16px_40px_hsl(var(--primary)/0.4)] transition-all disabled:opacity-60 disabled:translate-y-0"
            >
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Crear mi cuenta
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-[1px] bg-border" />
            <span className="text-xs text-muted-foreground">¿Ya tienes cuenta?</span>
            <div className="flex-1 h-[1px] bg-border" />
          </div>

          <Link
            to="/auth/login"
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl border border-border text-foreground text-sm font-medium tracking-wider uppercase hover:border-primary hover:text-primary transition-all no-underline"
          >
            Iniciar sesión
          </Link>

          <p className="text-center text-xs text-muted-foreground/50 mt-6">
            © {new Date().getFullYear()} Kala Barre Studio · San Luis Potosi, SLP
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
