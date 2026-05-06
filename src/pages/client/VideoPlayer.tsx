import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Lock, ShoppingBag, Copy, Upload, Loader2, CheckCircle } from "lucide-react";

// ── Paywall components ──────────────────────────────────────────────

type PurchaseStep = "idle" | "instructions" | "upload" | "done";

const VideoPaywall = ({ video, onPurchase }: { video: any; onPurchase: () => void }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/30 aspect-video gap-4 p-6 text-center">
    <ShoppingBag size={40} className="text-primary" />
    <div>
      <p className="text-lg font-bold">Acceso individual</p>
      <p className="text-sm text-muted-foreground">Compra este video por ${video.sales_price_mxn} MXN</p>
    </div>
    <Button onClick={onPurchase}>{video.sales_cta_text ?? "Comprar ahora"}</Button>
  </div>
);

const MembershipPaywall = () => (
  <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/30 aspect-video gap-4 p-6 text-center">
    <Lock size={40} className="text-muted-foreground" />
    <div>
      <p className="text-lg font-bold">Solo para miembros</p>
      <p className="text-sm text-muted-foreground">Este video está disponible con membresía activa</p>
    </div>
    <Button asChild><Link to="/app/checkout">Adquirir membresía</Link></Button>
  </div>
);

const VideoEmbed = ({ url }: { url: string }) => {
  // Support YouTube embed or direct video
  if (url?.includes("youtube") || url?.includes("youtu.be")) {
    const id = url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1];
    return (
      <div className="aspect-video w-full rounded-xl overflow-hidden">
        <iframe
          src={`https://www.youtube.com/embed/${id}`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  // Normalize old Google Drive preview URLs to proxy
  let videoSrc = url;
  const m = url?.match(/drive\.google\.com\/file\/d\/([^/]+)\/preview/);
  if (m) videoSrc = `/api/drive/video/${m[1]}`;
  return (
    <div className="w-full rounded-xl overflow-hidden bg-black flex items-center justify-center">
      <video
        src={videoSrc}
        controls
        playsInline
        className="max-h-[78vh] w-auto max-w-full object-contain"
      />
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────

const VideoPlayer = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [purchaseStep, setPurchaseStep] = useState<PurchaseStep>("idle");
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [bankDetails, setBankDetails] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [proofRef, setProofRef] = useState("");
  const [proofDate, setProofDate] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["video", videoId],
    queryFn: async () => (await api.get(`/videos/${videoId}`)).data,
  });

  const video = data?.data ?? data ?? null;

  const purchaseMutation = useMutation({
    mutationFn: () => api.post(`/videos/${videoId}/purchase`),
    onSuccess: (res) => {
      const d = res.data?.data ?? res.data;
      setPurchaseId(d.purchase_id);
      setBankDetails(d.bank_details);
      setPurchaseStep("instructions");
    },
    onError: (err: any) =>
      toast({ title: "Error al iniciar compra", description: err.response?.data?.message, variant: "destructive" }),
  });

  const uploadProofMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("file", file!);
      if (proofRef) fd.append("payment_reference", proofRef);
      if (proofDate) fd.append("transfer_date", proofDate);
      return api.post(`/videos/purchases/${purchaseId}/proof`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video", videoId] });
      setPurchaseStep("done");
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.response?.data?.message, variant: "destructive" }),
  });

  const canWatch =
    video?.has_access ||
    (!video?.sales_unlocks_video && video?.access_type === "gratuito");

  // Track view
  const trackView = () => {
    if (video?.has_access) api.post(`/videos/${videoId}/view`).catch(() => {});
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="max-w-3xl space-y-4">
          {isLoading ? (
            <Skeleton className="aspect-video w-full rounded-xl" />
          ) : !video ? (
            <p className="text-sm text-muted-foreground">Video no encontrado</p>
          ) : (
            <>
              {/* Player or paywalls */}
              {canWatch ? (
                <div onPlay={trackView}>
                  <VideoEmbed url={video.video_url} />
                </div>
              ) : video.sales_unlocks_video && purchaseStep === "idle" ? (
                <VideoPaywall video={video} onPurchase={() => purchaseMutation.mutate()} />
              ) : video.access_type === "miembros" && !video.sales_unlocks_video ? (
                <MembershipPaywall />
              ) : null}

              {/* Purchase flow: bank instructions */}
              {purchaseStep === "instructions" && bankDetails && (
                <Card>
                  <CardHeader><CardTitle>Datos de transferencia</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: "CLABE", value: bankDetails.clabe },
                      { label: "Cuenta", value: bankDetails.account_number ?? bankDetails.accountNumber },
                      { label: "Banco", value: bankDetails.bank },
                      { label: "Titular", value: bankDetails.account_holder ?? bankDetails.accountHolder },
                      { label: "Monto", value: `$${bankDetails.amount} ${bankDetails.currency ?? "MXN"}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-medium">{value}</span>
                          <button onClick={() => navigator.clipboard.writeText(String(value))}>
                            <Copy size={12} className="text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <Button className="w-full mt-2" onClick={() => setPurchaseStep("upload")}>
                      Ya realicé la transferencia
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Upload proof */}
              {purchaseStep === "upload" && (
                <Card>
                  <CardHeader><CardTitle>Subir comprobante</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1">
                      <Label>Comprobante (imagen o PDF)</Label>
                      <Input type="file" accept="image/*,.pdf" ref={fileRef} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Referencia de pago (opcional)</Label>
                      <Input value={proofRef} onChange={(e) => setProofRef(e.target.value)} placeholder="Número de referencia" />
                    </div>
                    <div className="space-y-1">
                      <Label>Fecha de transferencia (opcional)</Label>
                      <Input type="date" value={proofDate} onChange={(e) => setProofDate(e.target.value)} />
                    </div>
                    <Button
                      className="w-full"
                      disabled={!file || uploadProofMutation.isPending}
                      onClick={() => uploadProofMutation.mutate()}
                    >
                      {uploadProofMutation.isPending ? <Loader2 className="animate-spin mr-2" size={16} /> : <Upload size={16} className="mr-2" />}
                      Enviar comprobante
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Done */}
              {purchaseStep === "done" && (
                <Card>
                  <CardContent className="py-8 text-center space-y-3">
                    <CheckCircle size={40} className="mx-auto text-green-500" />
                    <p className="font-bold text-lg">¡Comprobante recibido!</p>
                    <p className="text-sm text-muted-foreground">
                      Verificaremos tu pago en breve. Recibirás acceso cuando sea aprobado.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Video info */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-xl font-bold">{video.title}</h1>
                  <div className="flex gap-1 flex-shrink-0">
                    {video.level && <Badge variant="outline">{video.level}</Badge>}
                    {video.access_type && <Badge>{video.access_type}</Badge>}
                  </div>
                </div>
                {video.instructor_name && (
                  <p className="text-sm text-muted-foreground">Por {video.instructor_name}</p>
                )}
                {video.description && (
                  <p className="text-sm text-muted-foreground">{video.description}</p>
                )}
              </div>
            </>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default VideoPlayer;
