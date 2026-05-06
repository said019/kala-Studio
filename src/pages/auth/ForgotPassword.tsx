import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";
import opheliaLogo from "@/assets/ophelia-logo-full.webp";

const schema = z.object({ email: z.string().email("Email inválido") });
type FormValues = { email: string };

const ForgotPassword = () => {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", data);
      setSent(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.message ?? "Inténtalo de nuevo", variant: "destructive" });
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
        {sent ? (
          <div className="text-center space-y-3">
            <CheckCircle className="mx-auto text-green-500" size={48} />
            <h2 className="text-xl font-bold">Revisa tu email</h2>
            <p className="text-sm text-muted-foreground">
              Si el email está registrado recibirás un enlace para restablecer tu contraseña.
            </p>
            <Link to="/auth/login" className="text-primary hover:underline text-sm">Volver al inicio</Link>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">Recuperar contraseña</h1>
              <p className="text-sm text-muted-foreground mt-1">Te enviaremos un enlace por email</p>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" placeholder="tu@email.com" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                Enviar enlace
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

export default ForgotPassword;
