import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ArrowRight } from "lucide-react";
import kalaAuthLogin from "@/assets/kala/kala-auth-login.jpg";
import opheliaLogo from "@/assets/ophelia-logo-full.webp";
import { InstallAppPrompt } from "@/components/InstallAppPrompt";

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
  const [showPass, setShowPass] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (isAuthenticated && user) {
      const returnUrl = params.get("returnUrl");
      if (returnUrl) { navigate(returnUrl); return; }
      if (["admin", "super_admin", "instructor", "reception"].includes(user.role)) navigate("/admin/dashboard");
      else navigate("/app");
    }
  }, [isAuthenticated, user]);

  const onSubmit = async (data: FormValues) => {
    clearError();
    try {
      await login(data);
      // Navigate immediately after login resolves, reading fresh state
      const { user: authedUser } = useAuthStore.getState();
      const returnUrl = params.get("returnUrl");
      if (returnUrl) { navigate(returnUrl, { replace: true }); return; }
      if (["admin", "super_admin", "instructor", "reception"].includes(authedUser?.role ?? "")) {
        navigate("/admin/dashboard", { replace: true });
      } else {
        navigate("/app", { replace: true });
      }
    } catch {
      toast({ title: "Error al iniciar sesión", description: error ?? "Verifica tus credenciales", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      <InstallAppPrompt />

      {/* ── LEFT PANEL — foto ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src={kalaAuthLogin}
          alt="Kala Barre Studio"
          className="absolute inset-0 w-full h-full object-cover scale-105"
        />
        {/* gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />

        {/* content over photo */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* logo */}
          <Link to="/" className="block">
            <img
              src={opheliaLogo}
              alt="Kala Barre Studio"
              className="w-[210px] sm:w-[240px] lg:w-[290px] max-w-full object-contain drop-shadow-[0_0_24px_rgba(118,33,77,0.18)]"
            />
          </Link>

          {/* quote */}
          <div>
            <h2 className="font-bebas text-[clamp(2.55rem,4.5vw,4.8rem)] leading-[0.92] text-foreground mb-4">
              LIBERA TU<br />
              <span className="text-primary">ENERGÍA</span><br />
              Y DESCUBRE<br />
              <span className="[-webkit-text-stroke:2px_hsl(var(--foreground)/0.5)] text-transparent">LO FUERTE QUE ERES</span>
            </h2>
            <p className="font-alilato italic text-muted-foreground text-[0.95rem] leading-[1.7] max-w-[340px]">
              &ldquo;Creemos en el poder de moverse con intención, entrenar con alegría y crear la mejor versión de ti&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — form ── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 relative overflow-hidden">
        {/* ambient glow */}
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[120px] bg-[radial-gradient(circle,hsl(var(--primary)/0.12)_0%,transparent_70%)] -top-[100px] -right-[100px] pointer-events-none" />
        <div className="absolute w-[300px] h-[300px] rounded-full blur-[80px] bg-[radial-gradient(circle,hsl(var(--primary)/0.08)_0%,transparent_70%)] bottom-[50px] left-[50px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-[400px]">

          {/* Mobile logo */}
          <Link to="/" className="lg:hidden block mb-10">
            <img
              src={opheliaLogo}
              alt="Kala Barre Studio"
              className="w-[210px] sm:w-[230px] max-w-full object-contain drop-shadow-[0_0_22px_rgba(118,33,77,0.16)]"
            />
          </Link>

          {/* heading */}
          <div className="mb-10">
            <p className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-3 flex items-center gap-2">
              <span className="w-5 h-[1px] bg-primary inline-block" />
              Bienvenida de vuelta
            </p>
            <h1 className="font-bebas text-[2.65rem] leading-none text-foreground">
              INICIAR<br />
              <span className="text-primary">SESIÓN</span>
            </h1>
          </div>

          {/* error global */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-3 rounded-xl mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

            {/* email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Email</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                {...register("email")}
                className="bg-secondary border border-border rounded-xl px-4 py-3.5 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:bg-secondary/80 transition-all"
              />
              {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
            </div>

            {/* password */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Contraseña</label>
                <Link to="/auth/forgot-password" className="text-xs text-primary hover:text-primary/80 transition-colors no-underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register("password")}
                  className="w-full bg-secondary border border-border rounded-xl px-4 py-3.5 pr-12 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:bg-secondary/80 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <span className="text-xs text-destructive">{errors.password.message}</span>}
            </div>

            {/* submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 relative overflow-hidden bg-primary text-primary-foreground py-4 rounded-xl text-sm font-medium tracking-wider uppercase flex items-center justify-center gap-2 hover:-translate-y-[2px] hover:shadow-[0_16px_40px_hsl(var(--primary)/0.4)] transition-all disabled:opacity-60 disabled:translate-y-0"
            >
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Entrar
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-[1px] bg-border" />
            <span className="text-xs text-muted-foreground">¿Primera vez?</span>
            <div className="flex-1 h-[1px] bg-border" />
          </div>

          {/* register CTA */}
          <Link
            to="/auth/register"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl border border-border text-foreground text-sm font-medium tracking-wider uppercase hover:border-primary hover:text-primary transition-all no-underline"
          >
            Crear cuenta nueva
          </Link>

          <p className="text-center text-xs text-muted-foreground/50 mt-8">
            © {new Date().getFullYear()} Kala Barre Studio · San Luis Potosi, SLP
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
