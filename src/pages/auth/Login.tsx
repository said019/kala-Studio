import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";
import { InstallAppPrompt } from "@/components/InstallAppPrompt";
import {
  AuthShell,
  AuthField,
  AuthPasswordField,
  AuthSubmit,
  AuthErrorBanner,
  AuthDivider,
  AuthSecondaryLink,
} from "@/components/auth/AuthShell";
import kalaAuthLogin from "@/assets/kala/kala-auth-login.jpg";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Requerido"),
});
type FormValues = { email: string; password: string };

const Login = () => {
  const { login, isLoading, error, clearError, isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (isAuthenticated && user) {
      const returnUrl = params.get("returnUrl");
      if (returnUrl) { navigate(returnUrl); return; }
      if (["admin", "super_admin", "instructor", "reception"].includes(user.role)) navigate("/admin/dashboard");
      else if (user.onboardingCompleted === false) navigate("/auth/onboarding");
      else navigate("/app");
    }
  }, [isAuthenticated, user]);

  const onSubmit = async (data: FormValues) => {
    clearError();
    try {
      await login(data);
      const { user: authedUser } = useAuthStore.getState();
      const returnUrl = params.get("returnUrl");
      if (returnUrl) { navigate(returnUrl, { replace: true }); return; }
      if (["admin", "super_admin", "instructor", "reception"].includes(authedUser?.role ?? "")) {
        navigate("/admin/dashboard", { replace: true });
      } else if (authedUser?.onboardingCompleted === false) {
        navigate("/auth/onboarding", { replace: true });
      } else {
        navigate("/app", { replace: true });
      }
    } catch {
      toast({
        title: "No pudimos entrar",
        description: error ?? "Verifica tu correo y contraseña.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <InstallAppPrompt />
      <AuthShell
        brandPhoto={kalaAuthLogin}
        brandPhotoAlt="Karla guía una clase de barre en Kala"
        brandTint="berry"
        brandEyebrow="Bienvenida de vuelta"
        brandHeadline={<>Pasa,</>}
        brandHeadlineItalic="te estábamos esperando."
        brandSubline="Tu cuenta guarda tus reservas, tu progreso y los recordatorios de cada clase."
        brandQuote="Aquí no solo entrenas, vuelves a ti."
        formEyebrow="Iniciar sesión"
        formHeadline="Entra a tu"
        formHeadlineItalic="cuenta."
      >
        {error && <AuthErrorBanner message={error} />}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <AuthField
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tu@email.com"
            error={errors.email?.message}
            {...register("email")}
          />

          <AuthPasswordField
            label="Contraseña"
            autoComplete="current-password"
            placeholder="••••••••"
            forgotLink="/auth/forgot-password"
            error={errors.password?.message}
            {...register("password")}
          />

          <AuthSubmit loading={isLoading} loadingLabel="Entrando…">
            Entrar
          </AuthSubmit>
        </form>

        <AuthDivider label="¿Primera vez?" />

        <AuthSecondaryLink to="/auth/register">Crear cuenta nueva</AuthSecondaryLink>
      </AuthShell>
    </>
  );
};

export default Login;
