import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  PrimaryButton,
  GhostButton,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import {
  BackLink,
  DataRow,
  StatusPill,
  InfoBanner,
  formatMoneyMX,
} from "@/components/app/widgets";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, Check } from "lucide-react";
import type { Order } from "@/types/order";

const STATUS: Record<string, { label: string; tone: keyof typeof KALA }> = {
  pending_payment: { label: "Pago pendiente", tone: "coral" },
  pending_verification: { label: "En verificación", tone: "orange" },
  approved: { label: "Aprobado · membresía activa", tone: "olive" },
  rejected: { label: "Rechazado", tone: "destructive" },
  cancelled: { label: "Cancelado", tone: "destructive" },
};

const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: async () => (await api.get(`/orders/${orderId}`)).data,
  });
  const order: Order | null = data?.data ?? data ?? null;

  const uploadMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("file", file!);
      return api.post(`/orders/${orderId}/proof`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["my-orders"] });
      toast({ title: "Comprobante enviado." });
      setFile(null);
    },
    onError: (err: any) =>
      toast({
        title: "No se pudo enviar",
        description: err.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      }),
  });

  const status = order ? STATUS[order.status] ?? { label: order.status, tone: "berry" as const } : null;
  const amountStr = order ? `$${formatMoneyMX(order.total_amount ?? order.amount)} ${order.currency ?? "MXN"}` : "";

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/orders" label="Mis órdenes" />

        {isLoading ? (
          <SkeletonRow height={300} />
        ) : !order ? (
          <p className="text-[0.95rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
            No encontramos esta orden.
          </p>
        ) : (
          <>
            <PageHeader
              eyebrow="Detalle"
              title={order.plan_name ?? "Compra"}
              actions={status ? <StatusPill label={status.label} tone={status.tone} /> : null}
            />

            <Section>
              <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: KALA.blush }}>
                <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3" style={{ borderBottom: `1px solid ${KALA.border}` }}>
                  <span className="text-[0.62rem] font-medium uppercase tracking-[0.24em]" style={{ color: KALA.berry }}>
                    Total
                  </span>
                  <span className="font-bebas leading-none" style={{ color: KALA.ink, fontSize: "clamp(1.85rem, 3vw, 2.6rem)" }}>
                    {amountStr}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  <DataRow
                    label="Fecha"
                    value={order.created_at ? format(safeParse(order.created_at), "d MMM yyyy", { locale: es }) : "—"}
                  />
                  <DataRow label="Método" value={order.payment_method === "cash" ? "Efectivo" : "Transferencia"} />
                  {(order as any).orderNumber && (
                    <DataRow label="Folio" value={(order as any).orderNumber} mono />
                  )}
                </div>
              </div>
            </Section>

            {order.status === "pending_payment" && order.bank_clabe && (
              <Section title="Datos para transferencia">
                <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: KALA.cream, border: `1px solid ${KALA.border}` }}>
                  <DataRow label="CLABE" value={order.bank_clabe} mono copyable={String(order.bank_clabe)} />
                  {order.bank_name && <DataRow label="Banco" value={order.bank_name} />}
                  {order.bank_account_holder && (
                    <DataRow label="Titular" value={order.bank_account_holder} />
                  )}
                  <DataRow label="Monto" value={amountStr} mono copyable={amountStr.replace(/[^0-9.]/g, "")} />
                </div>
              </Section>
            )}

            {order.status === "pending_payment" && (
              <Section title="Subir comprobante">
                <div
                  onClick={() => fileRef.current?.click()}
                  className="rounded-3xl p-7 text-center cursor-pointer transition-colors"
                  style={{
                    backgroundColor: file ? `${KALA.olive}10` : "transparent",
                    border: `1px dashed ${file ? KALA.olive : KALA.border}`,
                    color: KALA.ink,
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
                    className="grid h-12 w-12 mx-auto place-items-center rounded-full mb-3"
                    style={{ backgroundColor: file ? KALA.olive : KALA.blush, color: file ? KALA.cream : KALA.berry }}
                  >
                    {file ? <Check size={20} strokeWidth={3} /> : <Upload size={18} />}
                  </span>
                  <p className="text-[0.92rem] font-medium" style={{ color: KALA.ink }}>
                    {file ? file.name : "Toca aquí o arrastra el archivo"}
                  </p>
                  <p className="mt-1 text-[0.78rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
                    JPG, PNG o PDF
                  </p>
                </div>

                <div className="mt-5 flex gap-3">
                  <PrimaryButton
                    onClick={() => uploadMutation.mutate()}
                    disabled={!file || uploadMutation.isPending}
                    loading={uploadMutation.isPending}
                    loadingLabel="Enviando…"
                  >
                    Enviar comprobante
                  </PrimaryButton>
                  {file && <GhostButton onClick={() => setFile(null)}>Cambiar</GhostButton>}
                </div>
              </Section>
            )}

            {order.proof_url && (
              <Section title="Comprobante enviado">
                <a
                  href={order.proof_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 no-underline transition-colors"
                  style={{ backgroundColor: KALA.blush, color: KALA.berry }}
                >
                  <FileText size={15} />
                  Ver archivo
                </a>
              </Section>
            )}

            {order.admin_notes && (
              <Section>
                <InfoBanner
                  tone="orange"
                  title="Nota del estudio"
                  description={order.admin_notes}
                />
              </Section>
            )}
          </>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default OrderDetail;
