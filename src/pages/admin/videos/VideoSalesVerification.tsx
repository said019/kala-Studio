import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface VideoPurchase {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  video_id: string;
  video_title?: string;
  video_thumbnail_url?: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: "pending_payment" | "pending_verification" | "approved" | "rejected" | "cancelled" | "expired";
  has_proof: boolean;
  proof_file_url?: string | null;
  proof_file_type?: string | null;
  admin_notes?: string | null;
  customer_notes?: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  pending_payment: "outline",
  pending_verification: "outline",
  approved: "default",
  rejected: "destructive",
  cancelled: "secondary",
  expired: "secondary",
};

const PurchasesTable = ({ status }: { status?: string }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<VideoPurchase | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const url = status ? `/videos/purchases/pending` : `/videos/purchases/pending`;
  const { data, isLoading } = useQuery<{ data: VideoPurchase[] }>({
    queryKey: ["video-purchases", status],
    queryFn: async () => (await api.get(url)).data,
  });
  const purchases = (Array.isArray(data?.data) ? data.data : []).filter((p) => !status || p.status === status);

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => api.post(`/videos/purchases/${id}/approve`, { admin_notes: notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["video-purchases"] }); toast({ title: "Compra aprobada · video desbloqueado" }); setSelected(null); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => api.post(`/videos/purchases/${id}/reject`, { admin_notes: notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["video-purchases"] }); toast({ title: "Compra rechazada" }); setSelected(null); },
  });

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Video</TableHead>
            <TableHead>Monto</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array(4).fill(0).map((_, i) => (
              <TableRow key={i}>{Array(6).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
            ))
            : purchases.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{p.user_name}</p>
                    <p className="text-xs text-muted-foreground">{p.user_email}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{p.video_title}</TableCell>
                <TableCell>${p.amount} {p.currency}</TableCell>
                <TableCell className="text-sm">{new Date(p.created_at).toLocaleDateString("es-MX")}</TableCell>
                <TableCell><Badge variant={STATUS_BADGE[p.status] ?? "outline"}>{p.status}</Badge></TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => { setSelected(p); setAdminNotes(p.admin_notes ?? ""); }}>
                    Ver detalle
                  </Button>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle de compra</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex gap-4">
                {selected.video_thumbnail_url && (
                  <img src={selected.video_thumbnail_url} alt="" className="w-20 h-14 rounded-lg object-cover border border-border shrink-0" />
                )}
                <div className="text-sm space-y-1">
                  <div><span className="font-medium">Video:</span> {selected.video_title}</div>
                  <div><span className="font-medium">Cliente:</span> {selected.user_name} ({selected.user_email})</div>
                  <div><span className="font-medium">Monto:</span> ${selected.amount} {selected.currency}</div>
                  <div><span className="font-medium">Método:</span> {selected.payment_method}</div>
                </div>
              </div>

              {selected.has_proof && selected.proof_file_url && (
                <div>
                  <Label className="mb-2 block">Comprobante de pago</Label>
                  {selected.proof_file_type?.includes("pdf")
                    ? <a href={selected.proof_file_url} target="_blank" rel="noreferrer" className="text-primary text-sm underline">Ver PDF</a>
                    : <img src={selected.proof_file_url} alt="Comprobante" className="max-h-52 rounded-lg object-contain border border-border" />
                  }
                </div>
              )}

              {selected.customer_notes && (
                <div className="text-sm"><span className="font-medium">Notas del cliente:</span> {selected.customer_notes}</div>
              )}

              <div className="space-y-1">
                <Label>Notas del admin</Label>
                <Input value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Opcional..." />
              </div>

              {selected.status === "pending_verification" && (
                <DialogFooter>
                  <Button variant="destructive" onClick={() => rejectMutation.mutate({ id: selected.id, notes: adminNotes })}>Rechazar</Button>
                  <Button onClick={() => approveMutation.mutate({ id: selected.id, notes: adminNotes })}>Aprobar · Desbloquear video</Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

const VideoSalesVerification = () => (
  <AuthGuard>
    <AdminLayout>
      <div className="admin-page max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Ventas de Videos</h1>
        <Tabs defaultValue="pending_verification">
          <TabsList>
            <TabsTrigger value="pending_verification">Por verificar</TabsTrigger>
            <TabsTrigger value="pending_payment">Esperando pago</TabsTrigger>
          </TabsList>
          <TabsContent value="pending_verification" className="mt-4">
            <PurchasesTable status="pending_verification" />
          </TabsContent>
          <TabsContent value="pending_payment" className="mt-4">
            <PurchasesTable status="pending_payment" />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  </AuthGuard>
);

export default VideoSalesVerification;
