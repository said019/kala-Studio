import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Send, Eye, MessageCircle, Loader2, CheckCircle2, XCircle, MinusCircle, History } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type SegmentInfo = { label: string; count: number; error?: string };
type SegmentsMap = Record<string, SegmentInfo>;

type PreviewData = {
  segment: string;
  label: string;
  total: number;
  sendable: number;
  opted_out: number;
  no_phone: number;
  first_names: string[];
};

type Campaign = {
  id: string;
  name: string;
  segment: string;
  status: "queued" | "sending" | "completed" | "failed";
  total_targets: number;
  total_sent: number;
  total_failed: number;
  total_skipped: number;
  created_at: string;
  completed_at: string | null;
};

type CampaignLog = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  phone: string | null;
  status: "pending" | "sent" | "skipped" | "failed";
  reason: string | null;
  rendered: string | null;
  sent_at: string | null;
};

const STATUS_PILL: Record<Campaign["status"], { label: string; className: string }> = {
  queued: { label: "En cola", className: "border-white/20 bg-white/5 text-white/70" },
  sending: { label: "Enviando", className: "border-[#F58A24]/40 bg-[#F58A24]/10 text-[#F58A24]" },
  completed: { label: "Completada", className: "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#4ade80]" },
  failed: { label: "Falló", className: "border-[#f87171]/40 bg-[#f87171]/10 text-[#f87171]" },
};

const LOG_PILL: Record<CampaignLog["status"], { label: string; className: string; Icon: any }> = {
  pending: { label: "Pendiente", className: "text-white/40", Icon: Loader2 },
  sent: { label: "Enviado", className: "text-[#4ade80]", Icon: CheckCircle2 },
  skipped: { label: "Omitido", className: "text-white/55", Icon: MinusCircle },
  failed: { label: "Falló", className: "text-[#f87171]", Icon: XCircle },
};

const CampaignsPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [segment, setSegment] = useState<string>("");
  const [message, setMessage] = useState("");
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [openCampaign, setOpenCampaign] = useState<Campaign | null>(null);

  const { data: segmentsData } = useQuery<{ data: SegmentsMap }>({
    queryKey: ["campaign-segments"],
    queryFn: async () => (await api.get("/admin/campaigns/segments")).data,
  });
  const segments = segmentsData?.data || {};

  const { data: campaignsData } = useQuery<{ data: Campaign[] }>({
    queryKey: ["campaigns"],
    queryFn: async () => (await api.get("/admin/campaigns")).data,
    refetchInterval: 5000,
  });
  const campaigns = Array.isArray(campaignsData?.data) ? campaignsData.data : [];

  const previewMutation = useMutation({
    mutationFn: async () => (await api.post("/admin/campaigns/preview", { segment })).data,
    onSuccess: (res: { data: PreviewData }) => setPreviewData(res.data),
    onError: () => toast({ title: "Error", description: "No se pudo previsualizar", variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: async () => (await api.post("/admin/campaigns/send", { name, segment, message })).data,
    onSuccess: (res) => {
      toast({
        title: "Campaña en cola",
        description: `Enviando a ${res.data?.total_targets || 0} alumnas. Tarda ~${Math.ceil((res.data?.total_targets || 0) * 1.3 / 60)} min.`,
      });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setName("");
      setSegment("");
      setMessage("");
      setPreviewData(null);
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err?.response?.data?.message || "No se pudo enviar", variant: "destructive" }),
  });

  const { data: logsData } = useQuery<{ data: CampaignLog[] }>({
    queryKey: ["campaign-logs", openCampaign?.id],
    queryFn: async () => (await api.get(`/admin/campaigns/${openCampaign?.id}/logs`)).data,
    enabled: !!openCampaign?.id,
    refetchInterval: openCampaign?.status === "sending" ? 3000 : false,
  });
  const logs = Array.isArray(logsData?.data) ? logsData.data : [];

  const canPreview = !!segment;
  const canSend = !!name.trim() && !!segment && !!message.trim() && !!previewData;
  const segmentLabel = segment ? segments[segment]?.label : "";

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl space-y-6">
          {/* ── Header ── */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="flex items-center gap-2">
              <MessageCircle size={18} className="text-[#E9745F]" />
              <h1 className="text-xl font-bold text-white">Campañas WhatsApp</h1>
            </div>
            <p className="mt-1 text-sm text-white/45">
              Manda promos a un segmento de alumnas. Respeta opt-out y tarda ~1.3s por mensaje.
            </p>
          </div>

          {/* ── Compose ── */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-4">
            <div>
              <Label className="text-white/70 text-xs uppercase tracking-widest mb-1.5 block">
                Nombre interno
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Reactivación mayo"
                className="bg-black/30 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            <div>
              <Label className="text-white/70 text-xs uppercase tracking-widest mb-1.5 block">
                Segmento
              </Label>
              <Select value={segment} onValueChange={(v) => { setSegment(v); setPreviewData(null); }}>
                <SelectTrigger className="bg-black/30 border-white/10 text-white">
                  <SelectValue placeholder="Elige a quién mandar…" />
                </SelectTrigger>
                <SelectContent className="bg-[#0f0518] border-white/10">
                  {Object.entries(segments).map(([key, info]) => (
                    <SelectItem key={key} value={key} className="text-white/80">
                      <span className="flex items-center gap-2">
                        <span>{info.label}</span>
                        <Badge variant="outline" className="border-white/20 text-white/50 text-[10px]">
                          {info.count}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {segment && segments[segment] && (
                <p className="mt-1.5 text-[11px] text-white/40">
                  {segments[segment].count} alumna{segments[segment].count === 1 ? "" : "s"} en este segmento
                </p>
              )}
            </div>

            <div>
              <Label className="text-white/70 text-xs uppercase tracking-widest mb-1.5 block">
                Mensaje
              </Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Hola {firstName}, esta semana te tenemos…"
                rows={4}
                className="bg-black/30 border-white/10 text-white placeholder:text-white/30 resize-none"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                <span className="text-white/40">Variables:</span>
                {["{firstName}", "{days}"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMessage((m) => m + v)}
                    className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white/60 hover:bg-white/10"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Preview result ── */}
            {previewData && (
              <div className="rounded-xl border border-[#76214D]/40 bg-[#76214D]/10 p-4">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-white">
                    <strong>{previewData.sendable}</strong> alumnas recibirán el mensaje
                  </span>
                  <span className="text-white/45 text-xs">
                    · {previewData.opted_out} opt-out · {previewData.no_phone} sin tel
                  </span>
                </div>
                {previewData.first_names.length > 0 && (
                  <p className="mt-2 text-[11px] text-white/55">
                    Empezando por: {previewData.first_names.join(", ")}
                    {previewData.total > previewData.first_names.length && "…"}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-white/40">
                  Tiempo estimado: ~{Math.ceil(previewData.sendable * 1.3 / 60)} min
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={() => previewMutation.mutate()}
                disabled={!canPreview || previewMutation.isPending}
                variant="outline"
                className="border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
              >
                {previewMutation.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Eye size={14} className="mr-2" />}
                Previsualizar
              </Button>
              <Button
                onClick={() => {
                  if (window.confirm(`Mandar a ${previewData?.sendable || 0} alumnas?\n\nUna vez enviada no se puede deshacer.`)) {
                    sendMutation.mutate();
                  }
                }}
                disabled={!canSend || sendMutation.isPending}
                className="bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white hover:opacity-90 disabled:opacity-50"
              >
                {sendMutation.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Send size={14} className="mr-2" />}
                Enviar ahora
              </Button>
            </div>
          </div>

          {/* ── History ── */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="mb-4 flex items-center gap-2">
              <History size={16} className="text-white/55" />
              <h2 className="text-base font-semibold text-white">Historial</h2>
            </div>
            {campaigns.length === 0 ? (
              <p className="text-sm text-white/35">Aún no has mandado ninguna campaña.</p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-white/35">
                      <th className="px-2 py-2 text-left font-normal">Nombre</th>
                      <th className="px-2 py-2 text-left font-normal">Segmento</th>
                      <th className="px-2 py-2 text-right font-normal">Total</th>
                      <th className="px-2 py-2 text-right font-normal">Enviadas</th>
                      <th className="px-2 py-2 text-right font-normal">Status</th>
                      <th className="px-2 py-2 text-right font-normal">Cuándo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setOpenCampaign(c)}
                        className="border-t border-white/[0.04] hover:bg-white/[0.02] cursor-pointer"
                      >
                        <td className="px-2 py-3 text-white/85 truncate max-w-[200px]">{c.name}</td>
                        <td className="px-2 py-3 text-white/55 text-xs truncate max-w-[160px]">
                          {segments[c.segment]?.label || c.segment}
                        </td>
                        <td className="px-2 py-3 text-right text-white/65 tabular-nums">{c.total_targets}</td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          <span className="text-[#4ade80]">{c.total_sent}</span>
                          {c.total_failed > 0 && <span className="text-[#f87171] ml-1">+{c.total_failed}f</span>}
                          {c.total_skipped > 0 && <span className="text-white/40 ml-1">+{c.total_skipped}s</span>}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium", STATUS_PILL[c.status].className)}>
                            {STATUS_PILL[c.status].label}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-right text-white/40 text-[11px] whitespace-nowrap">
                          {format(new Date(c.created_at), "d MMM HH:mm", { locale: es })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Detail dialog ── */}
        <Dialog open={!!openCampaign} onOpenChange={(o) => !o && setOpenCampaign(null)}>
          <DialogContent className="max-w-2xl bg-[#0f0518] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="text-white">{openCampaign?.name}</DialogTitle>
            </DialogHeader>
            {openCampaign && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                    <p className="text-[10px] uppercase text-white/40">Total</p>
                    <p className="text-lg font-bold text-white">{openCampaign.total_targets}</p>
                  </div>
                  <div className="rounded-lg border border-[#4ade80]/30 bg-[#4ade80]/5 p-2">
                    <p className="text-[10px] uppercase text-[#4ade80]/80">Enviadas</p>
                    <p className="text-lg font-bold text-[#4ade80]">{openCampaign.total_sent}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                    <p className="text-[10px] uppercase text-white/40">Omitidas</p>
                    <p className="text-lg font-bold text-white/65">{openCampaign.total_skipped}</p>
                  </div>
                  <div className="rounded-lg border border-[#f87171]/30 bg-[#f87171]/5 p-2">
                    <p className="text-[10px] uppercase text-[#f87171]/80">Fallidas</p>
                    <p className="text-lg font-bold text-[#f87171]">{openCampaign.total_failed}</p>
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto rounded-lg border border-white/10">
                  <table className="w-full text-xs">
                    <tbody>
                      {logs.map((log) => {
                        const pill = LOG_PILL[log.status];
                        const Icon = pill.Icon;
                        return (
                          <tr key={log.id} className="border-t border-white/[0.04]">
                            <td className="px-3 py-2 w-7">
                              <Icon size={12} className={cn(pill.className, log.status === "pending" && "animate-spin")} />
                            </td>
                            <td className="px-2 py-2 text-white/80 truncate max-w-[140px]">
                              {log.display_name || "—"}
                            </td>
                            <td className="px-2 py-2 text-white/40 text-[10px] tabular-nums">{log.phone || "—"}</td>
                            <td className="px-2 py-2 text-white/45 text-[10px]">{log.reason || ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
};

export default CampaignsPage;
