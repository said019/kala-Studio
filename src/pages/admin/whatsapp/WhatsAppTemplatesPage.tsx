import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Eye, RotateCcw, Save, Loader2, Sparkles, Send, BellOff, Bell } from "lucide-react";

interface Template { subject: string; body: string; enabled?: boolean }
interface ApiResponse {
  data: {
    templates: Record<string, Template>;
    defaults: Record<string, Template>;
    variables: Record<string, string[]>;
  };
}

// Categorías para agrupar templates
const CATEGORIES: { id: string; label: string; keys: string[] }[] = [
  { id: "onboarding", label: "Onboarding", keys: ["welcome", "password_reset"] },
  { id: "bookings", label: "Reservas", keys: ["booking_confirmed", "booking_cancelled", "class_reminder", "class_attended", "admin_new_booking"] },
  { id: "membership", label: "Membresía", keys: ["membership_activated", "membership_expiring_today", "membership_expiring_tomorrow", "membership_expiring_n_days", "membership_expired", "renewal_reminder", "transfer_rejected"] },
  { id: "loyalty", label: "Lealtad", keys: ["rings_closed", "points_earned", "reward_redeemed", "milestone_classes_5", "milestone_classes_10", "milestone_classes_25", "milestone_classes_50", "milestone_classes_100"] },
  { id: "events", label: "Eventos", keys: ["event_registered"] },
  { id: "motivation", label: "Motivación", keys: ["motivation_first_class_week", "motivation_almost_ringed", "motivation_streak_2_weeks", "motivation_streak_4_weeks", "motivation_streak_8_weeks", "motivation_comeback"] },
  { id: "promos", label: "Promos", keys: ["promo_custom", "promo_dormant_invite", "promo_expiring_offer", "promo_birthday_month"] },
];

// Vars de muestra para preview
const SAMPLE_VARS: Record<string, string | number> = {
  firstName: "María",
  name: "María González",
  class: "Barre",
  date: "viernes 9 de mayo",
  time: "07:00",
  startDate: "1 mayo",
  endDate: "31 mayo",
  plan: "Barre — 4 Clases por semana",
  expiresAt: "31 mayo",
  reason: "comprobante ilegible",
  link: "https://kala-studio.app/r/xyz",
  creditRestored: "Sí",
  classesThisWeek: 1,
  weekGoal: 4,
  days: 18,
  classes: 25,
  points: 250,
  totalPoints: 1500,
  rewardName: "Clase muestra gratis",
  eventTitle: "Clase muestra mensual",
  message: "te queremos de regreso al estudio",
};

const TemplateCard = ({
  templateKey,
  template,
  variables,
  isModified,
  onSave,
  onReset,
  onToggleEnabled,
  toast,
}: {
  templateKey: string;
  template: Template;
  variables: string[];
  isModified: boolean;
  onSave: (key: string, t: Template) => Promise<void>;
  onReset: (key: string) => void;
  onToggleEnabled: (key: string, next: boolean) => Promise<void>;
  toast: ReturnType<typeof useToast>["toast"];
}) => {
  const enabled = template.enabled !== false;
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(template.subject || "");
  const [body, setBody] = useState(template.body || "");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  const dirty = subject !== template.subject || body !== template.body;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(templateKey, { subject, body });
      toast({ title: "Template guardado", description: templateKey });
    } catch {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const r = await api.post("/admin/whatsapp-templates/preview", {
        templateKey,
        vars: SAMPLE_VARS,
      });
      setPreview(r.data?.data || null);
    } catch {
      toast({ title: "Error al previsualizar", variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const insertVariable = (v: string) => {
    setBody((prev) => prev + `{${v}}`);
  };

  const handleTestSend = async () => {
    const phone = window.prompt(
      `Manda esta plantilla como WhatsApp de prueba.\n\nTeléfono (con o sin +52, solo números):`,
      "",
    );
    if (!phone) return;
    setSendingTest(true);
    try {
      await api.post("/admin/whatsapp-templates/test-send", {
        templateKey,
        phone,
      });
      toast({ title: "✓ Enviado", description: `WA de prueba mandado a ${phone}` });
    } catch (e: any) {
      toast({
        title: "No se envió",
        description: e?.response?.data?.message || "Verifica conexión Evolution",
        variant: "destructive",
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleToggle = async () => {
    const next = !enabled;
    setToggling(true);
    try {
      await onToggleEnabled(templateKey, next);
      toast({
        title: next ? "Aviso activado" : "Aviso desactivado",
        description: next
          ? `Se enviará el WhatsApp '${templateKey}' automáticamente.`
          : `Ya no se enviará el WhatsApp '${templateKey}'.`,
      });
    } catch {
      toast({ title: "Error al cambiar el estado", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden ${!enabled ? "opacity-60" : ""}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-[11px] px-1.5 py-0.5 rounded bg-secondary font-mono">{templateKey}</code>
            {isModified && <Badge variant="default" className="text-[10px] h-4">editado</Badge>}
            {!enabled && (
              <Badge variant="outline" className="text-[10px] h-4 border-destructive/40 text-destructive">
                desactivado
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium mt-1 truncate">{template.subject}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{template.body.slice(0, 90)}…</p>
        </div>
        <span className="text-muted-foreground text-xs ml-2">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="border-t border-white/[0.04] p-4 space-y-4 bg-white/[0.01]">
          <div className="space-y-1.5">
            <Label className="text-xs">Subject (asunto interno)</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-white/[0.04] border-white/[0.08]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mensaje (cuerpo del WhatsApp)</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="bg-white/[0.04] border-white/[0.08] resize-none font-mono text-sm"
            />
            {variables.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[11px] text-muted-foreground">Variables:</span>
                {variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] hover:bg-white/10 font-mono"
                  >
                    {`{${v}}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {preview && (
            <div className="rounded-xl border border-[#76214D]/30 bg-[#76214D]/5 p-3">
              <p className="text-[10px] uppercase tracking-widest text-[#76214D] mb-1.5">Preview con datos de muestra</p>
              <p className="text-sm font-medium">{preview.subject}</p>
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{preview.body}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={handlePreview}
              disabled={previewing}
              variant="outline"
              size="sm"
              className="border-white/15 bg-white/[0.04]"
            >
              {previewing ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Eye size={13} className="mr-1.5" />}
              Preview
            </Button>
            <Button
              onClick={handleTestSend}
              disabled={sendingTest || dirty}
              variant="outline"
              size="sm"
              className="border-[#778455]/40 bg-[#778455]/5 text-[#778455]"
              title={dirty ? "Guarda primero los cambios antes de enviar prueba" : "Mandar WA de prueba a un teléfono"}
            >
              {sendingTest ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Send size={13} className="mr-1.5" />}
              Enviar prueba
            </Button>
            <Button
              onClick={handleSave}
              disabled={!dirty || saving}
              size="sm"
              className="bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white"
            >
              {saving ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Save size={13} className="mr-1.5" />}
              Guardar
            </Button>
            {isModified && (
              <Button
                onClick={() => {
                  if (window.confirm(`¿Restaurar "${templateKey}" al texto Kala default?`)) onReset(templateKey);
                }}
                variant="outline"
                size="sm"
                className="border-white/15 bg-white/[0.04]"
              >
                <RotateCcw size={13} className="mr-1.5" />
                Restaurar default
              </Button>
            )}
            <Button
              onClick={() => {
                if (enabled
                  ? window.confirm(`Desactivar el aviso "${templateKey}" — ya no se enviará automáticamente. ¿Continuar?`)
                  : true
                ) handleToggle();
              }}
              disabled={toggling}
              variant="outline"
              size="sm"
              className={enabled
                ? "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
                : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/10"}
              title={enabled ? "Detener el envío automático de este aviso" : "Volver a enviar este aviso"}
            >
              {toggling ? <Loader2 size={13} className="mr-1.5 animate-spin" />
                : enabled ? <BellOff size={13} className="mr-1.5" />
                : <Bell size={13} className="mr-1.5" />}
              {enabled ? "Desactivar aviso" : "Activar aviso"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const WhatsAppTemplatesPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ["whatsapp-templates"],
    queryFn: async () => (await api.get("/admin/whatsapp-templates")).data,
  });

  const updateMutation = useMutation({
    mutationFn: (templates: Record<string, Template>) => api.put("/admin/whatsapp-templates", { templates }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });

  const resetMutation = useMutation({
    mutationFn: () => api.post("/admin/whatsapp-templates/reset"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      toast({ title: "Templates restaurados a defaults Kala" });
    },
  });

  const templates = data?.data?.templates ?? {};
  const defaults = data?.data?.defaults ?? {};
  const variables = data?.data?.variables ?? {};

  // ── Admin phones (a quién se le manda 'admin_new_booking' y similares) ───
  const { data: notifSettings, refetch: refetchSettings } = useQuery<{ data: { admin_phones?: string[] } }>({
    queryKey: ["notification-settings"],
    queryFn: async () => (await api.get("/admin/notification-settings")).data,
  });
  const adminPhones: string[] = Array.isArray(notifSettings?.data?.admin_phones)
    ? notifSettings.data.admin_phones
    : [];
  const [phoneInput, setPhoneInput] = useState("");
  const updatePhonesMutation = useMutation({
    mutationFn: (phones: string[]) => api.put("/admin/notification-settings", { admin_phones: phones }),
    onSuccess: () => { refetchSettings(); },
  });
  const addAdminPhone = async () => {
    const v = phoneInput.trim();
    if (!v) return;
    if (adminPhones.includes(v)) {
      toast({ title: "Ese teléfono ya está en la lista" });
      return;
    }
    try {
      await updatePhonesMutation.mutateAsync([...adminPhones, v]);
      setPhoneInput("");
      toast({ title: "Teléfono agregado", description: `Ahora recibirá los avisos administrativos.` });
    } catch {
      toast({ title: "Error al guardar", variant: "destructive" });
    }
  };
  const removeAdminPhone = async (p: string) => {
    if (!window.confirm(`Quitar ${p} de los destinatarios de avisos administrativos?`)) return;
    try {
      await updatePhonesMutation.mutateAsync(adminPhones.filter((x) => x !== p));
      toast({ title: "Teléfono quitado" });
    } catch {
      toast({ title: "Error al guardar", variant: "destructive" });
    }
  };

  const isModified = (key: string) => {
    const cur = templates[key];
    const def = defaults[key];
    if (!cur || !def) return false;
    return cur.subject !== def.subject || cur.body !== def.body;
  };

  const handleSave = async (key: string, t: Template) => {
    await updateMutation.mutateAsync({ ...templates, [key]: t });
  };

  const handleResetOne = async (key: string) => {
    if (!defaults[key]) return;
    await updateMutation.mutateAsync({ ...templates, [key]: defaults[key] });
    toast({ title: "Template restaurado al default", description: key });
  };

  // Activa/desactiva el envío automático del template (no se elimina el copy:
  // solo se marca enabled=false para que el server lo salte).
  const handleToggleEnabled = async (key: string, next: boolean) => {
    const cur = templates[key];
    if (!cur) return;
    await updateMutation.mutateAsync({ ...templates, [key]: { ...cur, enabled: next } });
  };

  // Agrupar templates no listados explícitamente bajo "Otros"
  const allKeys = Object.keys(templates);
  const categorized = new Set(CATEGORIES.flatMap((c) => c.keys));
  const others = allKeys.filter((k) => !categorized.has(k));
  const allCategories = others.length > 0
    ? [...CATEGORIES, { id: "others", label: "Otros", keys: others }]
    : CATEGORIES;

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-4xl">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 mb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <MessageSquare size={18} className="text-[#E9745F]" />
                  <h1 className="text-xl font-bold text-white">Templates WhatsApp</h1>
                </div>
                <p className="mt-1 text-sm text-white/45">
                  Edita el copy de las {allKeys.length} notificaciones automáticas. Los cambios aplican al instante.
                </p>
              </div>
              <Button
                onClick={() => {
                  if (window.confirm("Esto restaurará TODOS los templates a los textos Kala default. ¿Continuar?")) {
                    resetMutation.mutate();
                  }
                }}
                disabled={resetMutation.isPending}
                variant="outline"
                className="border-white/15 bg-white/[0.04] text-white/80"
              >
                <Sparkles size={14} className="mr-1.5" />
                Restaurar todos a default
              </Button>
            </div>
          </div>

          {/* ── Destinatarios de avisos administrativos ───────────────── */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60 mb-1">
              Avisos a la dueña / staff
            </h2>
            <p className="text-xs text-white/45 mb-3">
              Teléfonos que reciben los WhatsApps administrativos (ej. <code>admin_new_booking</code>). Agrega tu número y el de quien quieras que reciba estas alertas. Formato: <code>+524441234567</code>.
            </p>
            <div className="flex gap-2">
              <Input
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+524441234567"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAdminPhone(); } }}
                className="bg-white/[0.04] border-white/[0.08]"
              />
              <Button
                onClick={addAdminPhone}
                disabled={!phoneInput.trim() || updatePhonesMutation.isPending}
                size="sm"
                className="bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white"
              >
                Agregar
              </Button>
            </div>
            {adminPhones.length === 0 ? (
              <p className="mt-3 text-xs text-white/40">
                Sin teléfonos configurados. Mientras tanto, los avisos van a usuarios con role admin que tengan teléfono.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {adminPhones.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/10 px-2.5 py-1 text-xs">
                    <code className="font-mono">{p}</code>
                    <button
                      type="button"
                      onClick={() => removeAdminPhone(p)}
                      className="text-white/40 hover:text-destructive transition-colors"
                      title="Quitar"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando templates…</p>
          ) : (
            <Tabs defaultValue={allCategories[0].id}>
              <TabsList className="flex flex-wrap h-auto">
                {allCategories.map((cat) => {
                  const editedCount = cat.keys.filter((k) => isModified(k)).length;
                  return (
                    <TabsTrigger key={cat.id} value={cat.id} className="text-xs">
                      {cat.label}
                      <span className="ml-1.5 text-[10px] text-muted-foreground">{cat.keys.length}</span>
                      {editedCount > 0 && (
                        <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#E9745F]" />
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {allCategories.map((cat) => (
                <TabsContent key={cat.id} value={cat.id} className="mt-4 space-y-2">
                  {cat.keys.filter((k) => templates[k]).map((k) => (
                    <TemplateCard
                      key={k}
                      templateKey={k}
                      template={templates[k]}
                      variables={variables[k] || []}
                      isModified={isModified(k)}
                      onSave={handleSave}
                      onReset={handleResetOne}
                      onToggleEnabled={handleToggleEnabled}
                      toast={toast}
                    />
                  ))}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default WhatsAppTemplatesPage;
