import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { X, ZoomIn } from "lucide-react";

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  pending_payment: "outline",
  pending_verification: "outline",
  approved: "default",
  rejected: "destructive",
  cancelled: "secondary",
};

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Esperando pago",
  pending_verification: "Por verificar",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

interface Order {
  id: string;
  userName: string;
  userId: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  proofUrl?: string;
  planName?: string;
  notes?: string;
  paymentMethod?: string;
}

const METHOD_LABEL: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta" };

// ── Lightbox ─────────────────────────────────────────────
const Lightbox = ({ src, onClose }: { src: string; onClose: () => void }) => (
  <div
    className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
    onClick={onClose}
  >
    <button
      className="absolute top-4 right-4 text-white/60 hover:text-white bg-white/10 rounded-full p-2"
      onClick={onClose}
    >
      <X size={20} />
    </button>
    <img
      src={src}
      alt="Comprobante"
      className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    />
  </div>
);

const OrdersTable = ({ url, queryKey }: { url: string; queryKey: string[] }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Order | null>(null);
  const [notes, setNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: Order[] }>({
    queryKey,
    queryFn: async () => (await api.get(url)).data,
  });
  const orders = Array.isArray(data?.data) ? data.data : [];

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => api.put(`/admin/orders/${id}/verify`, { notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); toast({ title: "✅ Orden aprobada" }); setSelected(null); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al aprobar", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.put(`/admin/orders/${id}/reject`, { notes: reason, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast({ title: "Orden rechazada · cliente notificado" });
      setSelected(null);
      setShowRejectDialog(false);
      setRejectReason("");
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al rechazar", variant: "destructive" }),
  });

  return (
    <>
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array(4).fill(0).map((_, i) => (
                <TableRow key={i}>{Array(5).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
              : orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{o.userName ?? o.userId}</TableCell>
                  <TableCell>${Number(o.totalAmount).toFixed(2)} MXN</TableCell>
                  <TableCell><Badge variant={o.paymentMethod === "cash" ? "default" : "secondary"}>{METHOD_LABEL[o.paymentMethod ?? ""] ?? o.paymentMethod ?? "—"}</Badge></TableCell>
                  <TableCell><Badge variant={STATUS_BADGE[o.status] ?? "outline"}>{STATUS_LABEL[o.status] ?? o.status}</Badge></TableCell>
                  <TableCell className="text-sm">{new Date(o.createdAt).toLocaleDateString("es-MX")}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => { setSelected(o); setNotes(""); setRejectReason(""); }}>
                      Ver detalle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Order detail dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle de orden #{selected?.id?.slice(0, 8)}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <div><span className="font-medium">Cliente:</span> {selected.userName}</div>
                <div><span className="font-medium">Plan:</span> {selected.planName ?? "—"}</div>
                <div><span className="font-medium">Monto:</span> ${Number(selected.totalAmount).toFixed(2)} MXN</div>
                <div><span className="font-medium">Método de pago:</span> <Badge variant={selected.paymentMethod === "cash" ? "default" : "secondary"}>{METHOD_LABEL[selected.paymentMethod ?? ""] ?? selected.paymentMethod ?? "—"}</Badge></div>
                <div><span className="font-medium">Estado:</span> <Badge variant={STATUS_BADGE[selected.status] ?? "outline"}>{STATUS_LABEL[selected.status] ?? selected.status}</Badge></div>
              </div>
              {selected.proofUrl && (
                <div>
                  <Label className="mb-2 block">Comprobante de pago</Label>
                  {selected.proofUrl.endsWith(".pdf")
                    ? <a href={selected.proofUrl} target="_blank" rel="noreferrer" className="text-primary text-sm underline">Ver PDF</a>
                    : (
                      <div className="relative group cursor-pointer" onClick={() => setLightboxSrc(selected.proofUrl!)}>
                        <img
                          src={selected.proofUrl}
                          alt="Comprobante"
                          className="max-h-56 w-full rounded-lg object-contain border border-border"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                          <ZoomIn size={24} className="text-white" />
                          <span className="text-white text-sm ml-2">Ver completo</span>
                        </div>
                      </div>
                    )
                  }
                </div>
              )}
              <div className="space-y-1">
                <Label>Notas del admin (internas)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional..." />
              </div>
              <DialogFooter>
                {(selected.status === "pending_verification" || selected.status === "pending_payment") && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => setShowRejectDialog(true)}
                    >
                      Rechazar
                    </Button>
                    <Button
                      onClick={() => approveMutation.mutate({ id: selected.id, notes })}
                      disabled={approveMutation.isPending}
                    >
                      {approveMutation.isPending ? "Aprobando…" : "✅ Aprobar"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject reason dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>⚠️ Rechazar transferencia</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Escribe el motivo del rechazo. Se le notificará al cliente por email y WhatsApp.
            </p>
            <div className="space-y-1">
              <Label>Motivo del rechazo *</Label>
              <Textarea
                rows={3}
                placeholder="Ej: El comprobante no es legible, el monto no coincide, imagen borrosa…"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => selected && rejectMutation.mutate({ id: selected.id, reason: rejectReason })}
            >
              {rejectMutation.isPending ? "Rechazando…" : "Confirmar rechazo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const MergedPendingTable = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Order | null>(null);
  const [notes, setNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const { data: verificationData, isLoading: l1 } = useQuery<{ data: Order[] }>({
    queryKey: ["orders", "pending_verification"],
    queryFn: async () => (await api.get("/admin/orders?status=pending_verification")).data,
  });
  const { data: paymentData, isLoading: l2 } = useQuery<{ data: Order[] }>({
    queryKey: ["orders", "pending_payment"],
    queryFn: async () => (await api.get("/admin/orders?status=pending_payment")).data,
  });

  const orders = [
    ...(Array.isArray(verificationData?.data) ? verificationData.data : []),
    ...(Array.isArray(paymentData?.data) ? paymentData.data : []),
  ];
  const isLoading = l1 || l2;

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => api.put(`/admin/orders/${id}/verify`, { notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); toast({ title: "✅ Orden aprobada" }); setSelected(null); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al aprobar", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.put(`/admin/orders/${id}/reject`, { notes: reason, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast({ title: "Orden rechazada · cliente notificado" });
      setSelected(null);
      setShowRejectDialog(false);
      setRejectReason("");
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al rechazar", variant: "destructive" }),
  });

  return (
    <>
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array(4).fill(0).map((_, i) => (
                <TableRow key={i}>{Array(5).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
              : orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{o.userName ?? o.userId}</TableCell>
                  <TableCell>${Number(o.totalAmount).toFixed(2)} MXN</TableCell>
                  <TableCell><Badge variant={o.paymentMethod === "cash" ? "default" : "secondary"}>{METHOD_LABEL[o.paymentMethod ?? ""] ?? o.paymentMethod ?? "—"}</Badge></TableCell>
                  <TableCell><Badge variant={STATUS_BADGE[o.status] ?? "outline"}>{STATUS_LABEL[o.status] ?? o.status}</Badge></TableCell>
                  <TableCell className="text-sm">{new Date(o.createdAt).toLocaleDateString("es-MX")}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => { setSelected(o); setNotes(""); setRejectReason(""); }}>
                      Ver detalle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle de orden #{selected?.id?.slice(0, 8)}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <div><span className="font-medium">Cliente:</span> {selected.userName}</div>
                <div><span className="font-medium">Plan:</span> {selected.planName ?? "—"}</div>
                <div><span className="font-medium">Monto:</span> ${Number(selected.totalAmount).toFixed(2)} MXN</div>
                <div><span className="font-medium">Método de pago:</span> <Badge variant={selected.paymentMethod === "cash" ? "default" : "secondary"}>{METHOD_LABEL[selected.paymentMethod ?? ""] ?? selected.paymentMethod ?? "—"}</Badge></div>
                <div><span className="font-medium">Estado:</span> <Badge variant={STATUS_BADGE[selected.status] ?? "outline"}>{STATUS_LABEL[selected.status] ?? selected.status}</Badge></div>
              </div>
              {selected.proofUrl && (
                <div>
                  <Label className="mb-2 block">Comprobante de pago</Label>
                  {selected.proofUrl.endsWith(".pdf")
                    ? <a href={selected.proofUrl} target="_blank" rel="noreferrer" className="text-primary text-sm underline">Ver PDF</a>
                    : (
                      <div className="relative group cursor-pointer" onClick={() => setLightboxSrc(selected.proofUrl!)}>
                        <img src={selected.proofUrl} alt="Comprobante" className="max-h-56 w-full rounded-lg object-contain border border-border" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                          <ZoomIn size={24} className="text-white" />
                          <span className="text-white text-sm ml-2">Ver completo</span>
                        </div>
                      </div>
                    )
                  }
                </div>
              )}
              <div className="space-y-1">
                <Label>Notas del admin (internas)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional..." />
              </div>
              <DialogFooter>
                {(selected.status === "pending_verification" || selected.status === "pending_payment") && (
                  <>
                    <Button variant="destructive" onClick={() => setShowRejectDialog(true)}>Rechazar</Button>
                    <Button onClick={() => approveMutation.mutate({ id: selected.id, notes })} disabled={approveMutation.isPending}>
                      {approveMutation.isPending ? "Aprobando…" : "✅ Aprobar"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>⚠️ Rechazar transferencia</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Escribe el motivo del rechazo. Se le notificará al cliente por email y WhatsApp.</p>
            <div className="space-y-1">
              <Label>Motivo del rechazo *</Label>
              <Textarea rows={3} placeholder="Ej: El comprobante no es legible, el monto no coincide…" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={!rejectReason.trim() || rejectMutation.isPending} onClick={() => selected && rejectMutation.mutate({ id: selected.id, reason: rejectReason })}>
              {rejectMutation.isPending ? "Rechazando…" : "Confirmar rechazo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const OrdersVerification = () => (
  <AuthGuard>
    <AdminLayout>
      <div className="admin-page max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Verificación de Órdenes</h1>
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Por verificar</TabsTrigger>
            <TabsTrigger value="all">Todas</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-4">
            <MergedPendingTable />
          </TabsContent>
          <TabsContent value="all" className="mt-4">
            <OrdersTable url="/admin/orders" queryKey={["orders", "all"]} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  </AuthGuard>
);

export default OrdersVerification;
