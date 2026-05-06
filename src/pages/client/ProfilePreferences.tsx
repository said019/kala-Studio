import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  PrimaryButton,
  KALA,
} from "@/components/app/AppShell";
import { BackLink } from "@/components/app/widgets";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type PrefKey = "receiveReminders" | "receivePromotions" | "receiveWeeklySummary";

const ProfilePreferences = () => {
  const { user, updateUser } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>({
    receiveReminders: user?.receiveReminders ?? user?.receive_reminders ?? true,
    receivePromotions: user?.receivePromotions ?? user?.receive_promotions ?? false,
    receiveWeeklySummary: user?.receiveWeeklySummary ?? user?.receive_weekly_summary ?? false,
  });

  const mutation = useMutation({
    mutationFn: () => api.put(`/users/${user?.id}`, prefs),
    onSuccess: (res) => {
      const updated = res.data?.data ?? res.data;
      if (updated?.user) updateUser(updated.user);
      qc.invalidateQueries({ queryKey: ["me"] });
      toast({ title: "Preferencias guardadas." });
    },
    onError: () => toast({ title: "No se guardaron", variant: "destructive" }),
  });

  const items: { key: PrefKey; label: string; desc: string }[] = [
    {
      key: "receiveReminders",
      label: "Recordatorios de clase",
      desc: "Te avisamos antes de cada clase reservada.",
    },
    {
      key: "receivePromotions",
      label: "Promociones y eventos",
      desc: "Descuentos, masterclasses y eventos especiales.",
    },
    {
      key: "receiveWeeklySummary",
      label: "Resumen semanal",
      desc: "Cómo te fue, anillos cerrados y lo que viene.",
    },
  ];

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/profile" label="Perfil" />
        <PageHeader
          eyebrow="Preferencias"
          title={<>Qué te</>}
          titleAccent="avisamos."
          subtitle="Tú decides qué mensajes te llegan por WhatsApp y email."
        />

        <Section>
          <ul className="list-none m-0 p-0">
            {items.map((it, i, arr) => (
              <li
                key={it.key}
                className="grid grid-cols-[1fr_auto] items-center gap-5 py-5"
                style={{
                  borderTop: `1px solid ${KALA.border}`,
                  borderBottom: i === arr.length - 1 ? `1px solid ${KALA.border}` : undefined,
                }}
              >
                <div>
                  <p className="text-[0.94rem] font-medium leading-tight" style={{ color: KALA.ink }}>
                    {it.label}
                  </p>
                  <p className="mt-1 text-[0.84rem] leading-[1.55]" style={{ color: KALA.ink, opacity: 0.6 }}>
                    {it.desc}
                  </p>
                </div>
                <Switch
                  checked={prefs[it.key]}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, [it.key]: v }))}
                />
              </li>
            ))}
          </ul>
        </Section>

        <div className="mt-8">
          <PrimaryButton
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            loading={mutation.isPending}
            loadingLabel="Guardando…"
          >
            Guardar preferencias
          </PrimaryButton>
        </div>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default ProfilePreferences;
