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
import { MessageSquare, Eye, RotateCcw, Save, Loader2, Sparkles } from "lucide-react";

interface Template { subject: string; body: string }
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
  { id: "bookings", label: "Reservas", keys: ["booking_confirmed", "booking_cancelled", "class_reminder", "class_attended"] },
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
  toast,
}: {
  templateKey: string;
  template: Template;
  variables: string[];
  isModified: boolean;
  onSave: (key: string, t: Template) => Promise<void>;
  onReset: (key: string) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) => {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(template.subject || "");
  const [body, setBody] = useState(template.body || "");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);

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

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-[11px] px-1.5 py-0.5 rounded bg-secondary font-mono">{templateKey}</code>
            {isModified && <Badge variant="default" className="text-[10px] h-4">editado</Badge>}
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
