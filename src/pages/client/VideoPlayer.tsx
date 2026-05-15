import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Tag,
  PrimaryButton,
  GhostButton,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import { BackLink, DataRow, formatMoneyMX } from "@/components/app/widgets";
import { useToast } from "@/hooks/use-toast";
import {
  Lock,
  ShoppingBag,
  Upload,
  Check,
  CheckCircle2,
} from "lucide-react";

type PurchaseStep = "idle" | "instructions" | "upload" | "done";

/**
 * YouTube-only embed. Drive playback is handled via the signed `/stream-url`
 * flow inside the player itself (NEVER fall back to the public Drive proxy).
 */
const YouTubeEmbed = ({ url }: { url: string }) => {
  const id = url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1];
  if (!id) return null;
  return (
    <div className="aspect-video w-full rounded-3xl overflow-hidden" style={{ backgroundColor: KALA.ink }}>
      <iframe
        src={`https://www.youtube.com/embed/${id}`}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
};

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

  const { data, isLoading } = useQuery({
    queryKey: ["video", videoId],
    queryFn: async () => (await api.get(`/videos/${videoId}`)).data,
  });

  const video = data?.data ?? data ?? null;

  // Drive videos go through the signed stream URL — never the public proxy.
  const isDriveVideo = !!video?.drive_file_id;
  const isYouTube = typeof video?.video_url === "string" &&
    (video.video_url.includes("youtube.com") || video.video_url.includes("youtu.be"));

  const {
    data: streamData,
    isLoading: streamLoading,
    error: streamError,
  } = useQuery({
    queryKey: ["video-stream-url", videoId],
    queryFn: async () => (await api.get(`/videos/${videoId}/stream-url`)).data,
    enabled: !!videoId && isDriveVideo,
    staleTime: 30 * 60 * 1000, // 30 min — refresh at half of the 60-min token TTL
    refetchInterval: 30 * 60 * 1000,
    retry: false, // 403/404 are not transient
  });
  const streamUrl: string | undefined = streamData?.data?.url;
  const streamErrReason: string | undefined =
    (streamError as any)?.response?.data?.reason;
  const streamErrStatus: number | undefined = (streamError as any)?.response?.status;

  const purchaseMutation = useMutation({
    mutationFn: () => api.post(`/videos/${videoId}/purchase`),
    onSuccess: (res) => {
      const d = res.data?.data ?? res.data;
      setPurchaseId(d.purchase_id);
      setBankDetails(d.bank_details);
      setPurchaseStep("instructions");
    },
    onError: (err: any) =>
      toast({
        title: "No se pudo iniciar la compra",
        description: err.response?.data?.message,
        variant: "destructive",
      }),
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
      toast({
        title: "No pudimos enviar el comprobante",
        description: err.response?.data?.message,
        variant: "destructive",
      }),
  });

  const canWatch =
    video?.has_access ||
    (!video?.sales_unlocks_video && video?.access_type === "gratuito");

  const trackView = () => {
    if (video?.has_access) api.post(`/videos/${videoId}/view`).catch(() => {});
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 14,
    padding: "0.75rem 0.95rem",
    fontSize: "0.92rem",
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

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/videos" label="Biblioteca" />

        {isLoading ? (
          <SkeletonRow height={360} />
        ) : !video ? (
          <p className="text-[0.95rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
            No encontramos este video.
          </p>
        ) : (
          <>
            <Section>
              {isDriveVideo ? (
                streamLoading ? (
                  <SkeletonRow height={360} />
                ) : streamError ? (
                  <div
                    className="aspect-video rounded-3xl flex flex-col items-center justify-center text-center gap-4 p-7"
                    style={{ backgroundColor: KALA.blush }}
                  >
                    <span
                      className="grid h-14 w-14 place-items-center rounded-2xl"
                      style={{ backgroundColor: KALA.berry, color: KALA.cream }}
                    >
                      <Lock size={20} />
                    </span>
                    <div>
                      <h3
                        className="font-bebas leading-tight"
                        style={{ color: KALA.ink, fontSize: "clamp(1.5rem, 2.4vw, 2rem)" }}
                      >
                        {streamErrReason === "pending_grant"
                          ? "Tu acceso está en revisión"
                          : streamErrStatus === 404
                            ? "Video no disponible"
                            : "No tienes acceso a este video"}
                      </h3>
                      <p
                        className="mt-2 text-[0.92rem]"
                        style={{ color: KALA.ink, opacity: 0.7 }}
                      >
                        {streamErrReason === "pending_grant"
                          ? "Estamos activando tu acceso. Te avisaremos en cuanto esté listo."
                          : streamErrStatus === 404
                            ? "Este video aún no tiene archivo disponible."
                            : "Adquiere un paquete que incluya videos para ver esta clase."}
                      </p>
                    </div>
                    {streamErrReason !== "pending_grant" && streamErrStatus !== 404 && (
                      <PrimaryButton to="/app/checkout">Ver paquetes</PrimaryButton>
                    )}
                    <Link
                      to="/app/videos"
                      className="text-[0.82rem] no-underline"
                      style={{ color: KALA.ink, opacity: 0.6 }}
                    >
                      Volver a la biblioteca
                    </Link>
                  </div>
                ) : streamUrl ? (
                  <div
                    className="rounded-3xl overflow-hidden flex items-center justify-center"
                    style={{ backgroundColor: KALA.ink }}
                    onPlay={trackView}
                  >
                    <video
                      src={streamUrl}
                      controls
                      preload="metadata"
                      playsInline
                      controlsList="nodownload"
                      onContextMenu={(e) => e.preventDefault()}
                      className="max-h-[78vh] w-full object-contain"
                    />
                  </div>
                ) : null
              ) : canWatch && isYouTube ? (
                <div onPlay={trackView}>
                  <YouTubeEmbed url={video.video_url} />
                </div>
              ) : video.sales_unlocks_video && purchaseStep === "idle" ? (
                <div
                  className="aspect-video rounded-3xl flex flex-col items-center justify-center text-center gap-4 p-7"
                  style={{ backgroundColor: KALA.blush }}
                >
                  <span
                    className="grid h-14 w-14 place-items-center rounded-2xl"
                    style={{ backgroundColor: KALA.orange, color: KALA.cream }}
                  >
                    <ShoppingBag size={20} />
                  </span>
                  <div>
                    <h3 className="font-bebas leading-tight" style={{ color: KALA.ink, fontSize: "clamp(1.5rem, 2.4vw, 2rem)" }}>
                      Acceso individual
                    </h3>
                    <p className="mt-2 text-[0.92rem]" style={{ color: KALA.ink, opacity: 0.7 }}>
                      Compra este video por ${formatMoneyMX(video.sales_price_mxn)} MXN.
                    </p>
                  </div>
                  <PrimaryButton
                    onClick={() => purchaseMutation.mutate()}
                    loading={purchaseMutation.isPending}
                    loadingLabel="Procesando…"
                  >
                    {video.sales_cta_text ?? "Comprar ahora"}
                  </PrimaryButton>
                </div>
              ) : video.access_type === "miembros" && !video.sales_unlocks_video ? (
                <div
                  className="aspect-video rounded-3xl flex flex-col items-center justify-center text-center gap-4 p-7"
                  style={{ backgroundColor: KALA.blush }}
                >
                  <span
                    className="grid h-14 w-14 place-items-center rounded-2xl"
                    style={{ backgroundColor: KALA.berry, color: KALA.cream }}
                  >
                    <Lock size={20} />
                  </span>
                  <div>
                    <h3 className="font-bebas leading-tight" style={{ color: KALA.ink, fontSize: "clamp(1.5rem, 2.4vw, 2rem)" }}>
                      Solo para alumnas Kala
                    </h3>
                    <p className="mt-2 text-[0.92rem]" style={{ color: KALA.ink, opacity: 0.7 }}>
                      Activa una membresía para acceder a este y todos los videos del estudio.
                    </p>
                  </div>
                  <PrimaryButton to="/app/checkout">Ver paquetes</PrimaryButton>
                </div>
              ) : null}
            </Section>

            {purchaseStep === "instructions" && bankDetails && (
              <Section title="Datos para transferir">
                <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
                  {[
                    { label: "CLABE", value: bankDetails.clabe, mono: true },
                    { label: "Cuenta", value: bankDetails.account_number ?? bankDetails.accountNumber, mono: true },
                    { label: "Banco", value: bankDetails.bank },
                    { label: "Titular", value: bankDetails.account_holder ?? bankDetails.accountHolder },
                    {
                      label: "Monto",
                      value: `$${formatMoneyMX(bankDetails.amount)} ${bankDetails.currency ?? "MXN"}`,
                      mono: true,
                    },
                  ].filter((r) => r.value).map((row) => (
                    <DataRow
                      key={row.label}
                      label={row.label}
                      value={row.value}
                      mono={row.mono}
                      copyable={typeof row.value === "string" ? row.value : undefined}
                    />
                  ))}
                </div>
                <div className="mt-5">
                  <PrimaryButton onClick={() => setPurchaseStep("upload")}>
                    Ya transferí
                  </PrimaryButton>
                </div>
              </Section>
            )}

            {purchaseStep === "upload" && (
              <Section title="Subir comprobante">
                <div className="rounded-3xl p-5 sm:p-7 grid gap-5" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
                  <div>
                    <label style={labelStyle}>Comprobante (imagen o PDF)</label>
                    <div
                      onClick={() => fileRef.current?.click()}
                      className="rounded-2xl p-6 text-center cursor-pointer transition-colors"
                      style={{
                        backgroundColor: file ? `${KALA.olive}10` : "transparent",
                        border: `1px dashed ${file ? KALA.olive : KALA.border}`,
                      }}
                    >
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        ref={fileRef}
                        className="hidden"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                      <span
                        className="grid h-11 w-11 mx-auto place-items-center rounded-full mb-2"
                        style={{ backgroundColor: file ? KALA.olive : KALA.blush, color: file ? KALA.cream : KALA.berry }}
                      >
                        {file ? <Check size={18} strokeWidth={3} /> : <Upload size={16} />}
                      </span>
                      <p className="text-[0.9rem] font-medium" style={{ color: KALA.ink }}>
                        {file ? file.name : "Toca o arrastra el archivo"}
                      </p>
                      <p className="mt-1 text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
                        JPG, PNG o PDF
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label style={labelStyle}>Referencia (opcional)</label>
                      <input
                        style={fieldStyle}
                        value={proofRef}
                        onChange={(e) => setProofRef(e.target.value)}
                        placeholder="Número de referencia"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Fecha de transferencia</label>
                      <input
                        style={fieldStyle}
                        type="date"
                        value={proofDate}
                        onChange={(e) => setProofDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <PrimaryButton
                      disabled={!file || uploadProofMutation.isPending}
                      onClick={() => uploadProofMutation.mutate()}
                      loading={uploadProofMutation.isPending}
                      loadingLabel="Enviando…"
                    >
                      Enviar comprobante
                    </PrimaryButton>
                    {file && <GhostButton onClick={() => setFile(null)}>Cambiar</GhostButton>}
                  </div>
                </div>
              </Section>
            )}

            {purchaseStep === "done" && (
              <Section>
                <div
                  className="rounded-3xl p-7 sm:p-10 text-center"
                  style={{ backgroundColor: KALA.blush }}
                >
                  <span
                    className="grid h-14 w-14 mx-auto place-items-center rounded-2xl mb-4"
                    style={{ backgroundColor: KALA.olive, color: KALA.cream }}
                  >
                    <CheckCircle2 size={22} />
                  </span>
                  <h3 className="font-bebas leading-tight" style={{ color: KALA.ink, fontSize: "clamp(1.5rem, 2.4vw, 2rem)" }}>
                    Comprobante recibido.
                  </h3>
                  <p className="mt-2 text-[0.92rem] max-w-[40ch] mx-auto" style={{ color: KALA.ink, opacity: 0.7 }}>
                    Verificamos tu pago y te liberamos el video en cuanto quede aprobado.
                  </p>
                </div>
              </Section>
            )}

            <Section>
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h1 className="font-bebas leading-tight" style={{ color: KALA.ink, fontSize: "clamp(1.7rem, 3vw, 2.5rem)" }}>
                    {video.title}
                  </h1>
                  <div className="flex flex-wrap gap-2">
                    {video.level && <Tag tint="olive">{video.level}</Tag>}
                    {video.access_type && <Tag tint={video.access_type === "miembros" ? "berry" : "coral"}>{video.access_type}</Tag>}
                  </div>
                </div>
                {video.instructor_name && (
                  <p className="text-[0.84rem] uppercase tracking-[0.18em]" style={{ color: KALA.ink, opacity: 0.6 }}>
                    Por {video.instructor_name}
                  </p>
                )}
                {video.description && (
                  <p className="text-[0.95rem] leading-[1.7] max-w-[70ch]" style={{ color: KALA.ink, opacity: 0.78 }}>
                    {video.description}
                  </p>
                )}
              </div>
            </Section>
          </>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default VideoPlayer;
