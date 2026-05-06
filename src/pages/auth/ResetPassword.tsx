import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";
import opheliaLogo from "@/assets/ophelia-logo-full.webp";

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
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = params.get("token");

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    if (!token) { toast({ title: "Token inválido", variant: "destructive" }); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password: data.password });
      setDone(true);
      setTimeout(() => navigate("/auth/login"), 2000);
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message ?? "Link inválido o expirado", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <Link to="/">
            <img src={opheliaLogo} alt="Kala Barre Studio" className="h-16 w-auto" />
          </Link>
        </div>
        {done ? (
          <div className="text-center space-y-3">
            <CheckCircle className="mx-auto text-green-500" size={48} />
            <h2 className="text-xl font-bold">¡Contraseña actualizada!</h2>
            <p className="text-sm text-muted-foreground">Redirigiendo al inicio de sesión...</p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">Nueva contraseña</h1>
              <p className="text-sm text-muted-foreground mt-1">Ingresa tu nueva contraseña</p>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label>Nueva contraseña</Label>
                <Input type="password" placeholder="••••••••" {...register("password")} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Confirmar contraseña</Label>
                <Input type="password" placeholder="••••••••" {...register("confirmPassword")} />
                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={loading || !token}>
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                Cambiar contraseña
              </Button>
            </form>
            <p className="text-center text-sm">
              <Link to="/auth/login" className="text-primary hover:underline">Volver al inicio</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
