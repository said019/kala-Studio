import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/stores/authStore";
import { useNavigate } from "react-router-dom";
import {
  AuthPasswordField,
  AuthSubmit,
  AuthErrorBanner,
  AuthPasswordRules,
  KALA,
} from "@/components/auth/AuthShell";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Escribe tu contraseña actual"),
    newPassword: z
      .string()
      .min(8, "Mínimo 8 caracteres")
      .regex(/[A-Z]/, "Debe incluir una mayúscula")
      .regex(/[0-9]/, "Debe incluir un número"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "La nueva contraseña debe ser distinta a la actual",
    path: ["newPassword"],
  });

type FormValues = z.infer<typeof schema>;

/**
 * Tarjeta reutilizable para cambiar la contraseña estando logueado.
 * La usan tanto el perfil del cliente como la config del admin.
 *
 * Props:
 *  - logoutAfter: si true, al cambiar la contraseña cierra sesión y manda
 *    a /auth/login (recomendado para que el usuario re-entre con la nueva).
 */
export const ChangePassword = ({
  logoutAfter = false,
}: {
  logoutAfter?: boolean;
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const newPassword = watch("newPassword") ?? "";

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    try {
      await api.post("/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setDone(true);
      reset();
      toast({ title: "✅ Contraseña actualizada" });
      if (logoutAfter) {
        setTimeout(() => {
          logout();
          navigate("/auth/login");
        }, 1200);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "No pudimos cambiar la contraseña.";
      setServerError(msg);
    }
  };

  if (done && !logoutAfter) {
    return (
      <div
        className="rounded-2xl px-5 py-4 text-[0.9rem]"
        style={{ backgroundColor: `${KALA.olive}14`, border: `1px solid ${KALA.olive}40`, color: KALA.ink }}
      >
        Tu contraseña se actualizó correctamente.{" "}
        <button
          type="button"
          onClick={() => setDone(false)}
          className="font-medium underline bg-transparent border-0 p-0 cursor-pointer"
          style={{ color: KALA.berry }}
        >
          Cambiar de nuevo
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {serverError && <AuthErrorBanner message={serverError} />}

      <AuthPasswordField
        label="Contraseña actual"
        placeholder="Tu contraseña actual"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register("currentPassword")}
      />

      <div className="flex flex-col gap-3">
        <AuthPasswordField
          label="Nueva contraseña"
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <AuthPasswordRules password={newPassword} />
      </div>

      <AuthPasswordField
        label="Confirmar nueva contraseña"
        placeholder="Repite la nueva contraseña"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <AuthSubmit loading={isSubmitting} loadingLabel="Guardando…">
        Cambiar contraseña
      </AuthSubmit>
    </form>
  );
};

export default ChangePassword;
