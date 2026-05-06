import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  PrimaryButton,
  GhostButton,
  KALA,
} from "@/components/app/AppShell";
import { BackLink } from "@/components/app/widgets";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";
import type { UpdateProfileData } from "@/types/auth";

const schema = z.object({
  displayName: z.string().min(2, "Mínimo 2 caracteres"),
  phone: z
    .string()
    .regex(/^\+52[0-9]{10}$/, "Formato: +521234567890")
    .or(z.literal("")),
  gender: z.enum(["female", "male", "other", ""]).optional(),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  healthNotes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const fieldStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 16,
  padding: "0.85rem 1rem",
  fontSize: "0.95rem",
  color: KALA.ink,
  backgroundColor: KALA.cream,
  border: `1px solid ${KALA.border}`,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.66rem",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.22em",
  color: KALA.ink,
  opacity: 0.62,
  marginBottom: 6,
  display: "block",
};

const ProfileEdit = () => {
  const { user, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (user) {
      reset({
        displayName: user.displayName ?? user.display_name ?? "",
        phone: user.phone ?? "",
        gender: (user as any).gender ?? "",
        dateOfBirth: user.dateOfBirth ?? user.date_of_birth ?? "",
        emergencyContactName: user.emergencyContactName ?? user.emergency_contact_name ?? "",
        emergencyContactPhone: user.emergencyContactPhone ?? user.emergency_contact_phone ?? "",
        healthNotes: user.healthNotes ?? user.health_notes ?? "",
      });
    }
  }, [user, reset]);

  const mutation = useMutation({
    mutationFn: (data: UpdateProfileData) => api.put(`/users/${user?.id}`, data),
    onSuccess: (res) => {
      const updated = res.data?.data ?? res.data;
      if (updated?.user) updateUser(updated.user);
      toast({ title: "Perfil actualizado." });
      navigate("/app/profile");
    },
    onError: () => toast({ title: "No se guardaron los cambios", variant: "destructive" }),
  });

  const onSubmit = (data: FormValues) => {
    mutation.mutate({
      displayName: data.displayName,
      phone: data.phone || undefined,
      gender: data.gender || undefined,
      dateOfBirth: data.dateOfBirth || undefined,
      emergencyContactName: data.emergencyContactName || undefined,
      emergencyContactPhone: data.emergencyContactPhone || undefined,
      healthNotes: data.healthNotes || undefined,
    } as any);
  };

  const FieldError = ({ msg }: { msg?: string }) =>
    msg ? (
      <p className="flex items-center gap-1.5 mt-1 text-[0.78rem]" style={{ color: KALA.destructive }}>
        <AlertCircle size={13} />
        {msg}
      </p>
    ) : null;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/profile" label="Perfil" />
        <PageHeader
          eyebrow="Editar perfil"
          title={<>Tus datos</>}
          titleAccent="al día."
          subtitle="Esto nos ayuda a recibirte mejor y a comunicarnos contigo cuando lo necesitemos."
        />

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <Section title="Personal">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label style={labelStyle}>Nombre completo</label>
                <input style={fieldStyle} placeholder="Tu nombre" {...register("displayName")} />
                <FieldError msg={errors.displayName?.message} />
              </div>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input style={fieldStyle} placeholder="+521234567890" {...register("phone")} />
                <FieldError msg={errors.phone?.message} />
              </div>
              <div>
                <label style={labelStyle}>Sexo</label>
                <select style={fieldStyle} {...register("gender")}>
                  <option value="">Selecciona</option>
                  <option value="female">Femenino</option>
                  <option value="male">Masculino</option>
                  <option value="other">Prefiero no decir</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Fecha de nacimiento</label>
                <input type="date" style={fieldStyle} {...register("dateOfBirth")} />
              </div>
            </div>
          </Section>

          <Section title="En caso de emergencia">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label style={labelStyle}>Nombre del contacto</label>
                <input style={fieldStyle} placeholder="Nombre completo" {...register("emergencyContactName")} />
              </div>
              <div>
                <label style={labelStyle}>Teléfono del contacto</label>
                <input style={fieldStyle} placeholder="10 dígitos" {...register("emergencyContactPhone")} />
              </div>
            </div>
          </Section>

          <Section title="Salud">
            <label style={labelStyle}>Notas (opcional)</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 110, resize: "vertical" as const }}
              placeholder="Lesiones, alergias, condiciones que debamos saber al ajustar tu clase."
              {...register("healthNotes")}
            />
            <p className="mt-2 text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
              Solo Karla y el equipo del estudio ven esta información.
            </p>
          </Section>

          <div className="flex flex-wrap gap-3 pt-2">
            <PrimaryButton
              type="submit"
              disabled={mutation.isPending}
              loading={mutation.isPending}
              loadingLabel="Guardando…"
            >
              Guardar cambios
            </PrimaryButton>
            <GhostButton onClick={() => navigate("/app/profile")} disabled={mutation.isPending || !isDirty}>
              Descartar
            </GhostButton>
          </div>
        </form>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default ProfileEdit;
