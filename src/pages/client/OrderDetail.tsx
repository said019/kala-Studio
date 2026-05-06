import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Copy, Loader2, Upload } from "lucide-react";
import type { Order } from "@/types/order";

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Pago pendiente",
  pending_verification: "En verificación",
  approved: "Aprobado — membresía activa",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
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
      toast({ title: "Comprobante enviado" });
      setFile(null);
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.response?.data?.message, variant: "destructive" }),
  });

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="max-w-lg space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/app/orders")}>
            <ArrowLeft size={16} className="mr-2" />Volver a mis órdenes
          </Button>
          <h1 className="text-xl font-bold">Detalle de orden</h1>
          {isLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : order ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {order.plan_name}
                  <Badge>{STATUS_LABELS[order.status] ?? order.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monto</span>
                    <span className="font-semibold">${order.total_amount ?? order.amount} {order.currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fecha</span>
                    <span>{order.created_at ? format(safeParse(order.created_at), "d MMM yyyy", { locale: es }) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Método</span>
                    <span>{order.payment_method}</span>
                  </div>
                </div>

                {/* Bank data for pending_payment */}
                {order.status === "pending_payment" && order.bank_clabe && (
                  <div className="rounded-lg bg-muted p-4 space-y-2">
                    <p className="text-sm font-semibold">Datos para transferencia</p>
                    {[
                      { label: "CLABE", value: order.bank_clabe },
                      { label: "Banco", value: order.bank_name },
                      { label: "Titular", value: order.bank_account_holder },
                    ].map(({ label, value }) => value ? (
                      <div key={label} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono">{value}</span>
                          <button onClick={() => navigator.clipboard.writeText(value)}>
                            <Copy size={12} className="text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    ) : null)}
                  </div>
                )}

                {/* Upload proof */}
                {order.status === "pending_payment" && (
                  <div className="space-y-2">
                    <Label>Subir comprobante de transferencia</Label>
                    <Input
                      type="file"
                      accept="image/*,.pdf"
                      ref={fileRef}
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                    <Button
                      className="w-full"
                      disabled={!file || uploadMutation.isPending}
                      onClick={() => uploadMutation.mutate()}
                    >
                      {uploadMutation.isPending ? <Loader2 className="animate-spin mr-2" size={16} /> : <Upload size={16} className="mr-2" />}
                      Enviar comprobante
                    </Button>
                  </div>
                )}

                {/* Proof already uploaded */}
                {order.proof_url && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Comprobante enviado:</p>
                    <a href={order.proof_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">Ver comprobante</a>
                  </div>
                )}

                {/* Admin notes */}
                {order.admin_notes && (
                  <div className="rounded-lg border p-3 text-sm">
                    <p className="font-medium mb-1">Nota del administrador:</p>
                    <p className="text-muted-foreground">{order.admin_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Orden no encontrada</p>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default OrderDetail;
