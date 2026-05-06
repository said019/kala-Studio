import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Plus, Star } from "lucide-react";

const tagSchema = z.object({ name: z.string().min(1), color: z.string().default("#8B5CF6") });
type TagFormData = z.infer<typeof tagSchema>;
interface ReviewTag extends TagFormData { id: string }

const ReviewTagsManager = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ReviewTag | null>(null);

  const { data } = useQuery<{ data: ReviewTag[] }>({ queryKey: ["review-tags"], queryFn: async () => (await api.get("/review-tags")).data });
  const tags = Array.isArray(data?.data) ? data.data : [];

  const form = useForm<TagFormData>({ resolver: zodResolver(tagSchema), defaultValues: { color: "#8B5CF6" } });

  const createMutation = useMutation({ mutationFn: (d: TagFormData) => api.post("/review-tags", d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-tags"] }); toast({ title: "Tag creado" }); setOpen(false); } });
  const updateMutation = useMutation({ mutationFn: ({ id, ...d }: ReviewTag) => api.put(`/review-tags/${id}`, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-tags"] }); toast({ title: "Tag actualizado" }); setOpen(false); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.delete(`/review-tags/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-tags"] }); toast({ title: "Tag eliminado" }); } });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h2 className="text-lg font-semibold">Tags de reseñas</h2>
        <Button size="sm" onClick={() => { form.reset({ color: "#8B5CF6" }); setEditing(null); setOpen(true); }}><Plus size={14} className="mr-1" />Nuevo tag</Button>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {tags.map((t) => (
          <div key={t.id} className="flex items-center gap-1">
            <Badge style={{ backgroundColor: `${t.color}22`, color: t.color, borderColor: `${t.color}44` }} variant="outline">{t.name}</Badge>
            <Button variant="ghost" size="icon" className="h-5 w-5 text-xs" onClick={() => { form.reset(t); setEditing(t); setOpen(true); }}>✎</Button>
            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive text-xs" onClick={() => { if (window.confirm("¿Eliminar este tag?")) deleteMutation.mutate(t.id); }}>✕</Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{editing ? "Editar tag" : "Nuevo tag"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => editing ? updateMutation.mutate({ ...d, id: editing.id }) : createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1"><Label>Nombre</Label><Input {...form.register("name")} /></div>
            <div className="space-y-1"><Label>Color</Label><Input type="color" {...form.register("color")} className="h-10 cursor-pointer" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">{editing ? "Actualizar" : "Crear"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface AdminReview {
  id: string;
  user_name?: string;
  user_id?: string;
  email?: string;
  instructor_name?: string;
  instructor_id?: string;
  class_type_name?: string;
  class_date?: string;
  class_start_time?: string;
  rating?: number;
  overall_rating?: number;
  comment?: string;
  is_approved?: boolean;
  created_at?: string;
}

const AdminReviewsDashboard = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: reviewsData, isLoading } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: async () => (await api.get("/admin/reviews")).data,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.put(`/admin/reviews/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      toast({ title: "Reseña aprobada" });
    },
    onError: () => toast({ title: "No se pudo aprobar la reseña", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/reviews/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      toast({ title: "Reseña eliminada" });
    },
    onError: () => toast({ title: "No se pudo eliminar la reseña", variant: "destructive" }),
  });

  const reviews: AdminReview[] = Array.isArray(reviewsData?.data) ? reviewsData.data : [];

  const stats = useMemo(() => {
    const ratings = reviews
      .map((r) => Number(r.rating ?? r.overall_rating ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    const average = ratings.length ? (ratings.reduce((acc, n) => acc + n, 0) / ratings.length).toFixed(1) : "—";
    const pending = reviews.filter((r) => !r.is_approved).length;
    return {
      total: reviews.length,
      average,
      pending,
    };
  }, [reviews]);

  const renderStars = (n: number) => Array(5).fill(0).map((_, i) => (
    <Star key={i} size={12} fill={i < n ? "currentColor" : "none"} className={i < n ? "text-yellow-400" : "text-muted-foreground"} />
  ));

  const renderClassLabel = (r: AdminReview) => {
    const classLabel = r.class_type_name || "Clase";
    if (!r.class_date) return classLabel;
    const date = new Date(r.class_date);
    const dateLabel = Number.isNaN(date.getTime()) ? r.class_date : date.toLocaleDateString("es-MX");
    const timeLabel = r.class_start_time ? String(r.class_start_time).slice(0, 5) : "";
    return `${classLabel} · ${dateLabel}${timeLabel ? ` ${timeLabel}` : ""}`;
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          <h1 className="text-2xl font-bold mb-6">Reseñas</h1>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Total reseñas</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Promedio</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stats.average} ⭐</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Pendientes</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stats.pending}</p></CardContent></Card>
          </div>

          <Tabs defaultValue="list">
            <TabsList>
              <TabsTrigger value="list">Reseñas</TabsTrigger>
              <TabsTrigger value="tags">Tags</TabsTrigger>
            </TabsList>
            <TabsContent value="list" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Clase</TableHead>
                    <TableHead>Instructor</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Estatus</TableHead>
                    <TableHead>Comentario</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="w-[56px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading && reviews.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-sm text-muted-foreground text-center py-8">
                        No hay reseñas para mostrar.
                      </TableCell>
                    </TableRow>
                  )}
                  {reviews.map((r) => {
                    const numericRating = Number(r.rating ?? r.overall_rating ?? 0);
                    const safeRating = Number.isFinite(numericRating) && numericRating > 0
                      ? Math.max(1, Math.min(5, Math.round(numericRating)))
                      : null;

                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.user_name || r.email || r.user_id || "—"}</TableCell>
                        <TableCell>{renderClassLabel(r)}</TableCell>
                        <TableCell>{r.instructor_name || r.instructor_id || "—"}</TableCell>
                        <TableCell>
                          {safeRating ? <div className="flex">{renderStars(safeRating)}</div> : "—"}
                        </TableCell>
                        <TableCell>
                          {r.is_approved ? (
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">Aprobada</Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">Pendiente</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate">{r.comment || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {r.created_at ? new Date(r.created_at).toLocaleString("es-MX") : "—"}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal size={16} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!r.is_approved && (
                                <DropdownMenuItem onClick={() => approveMutation.mutate(r.id)}>
                                  Aprobar
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  if (window.confirm("¿Eliminar esta reseña?")) deleteMutation.mutate(r.id);
                                }}
                              >
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="tags" className="mt-4"><ReviewTagsManager /></TabsContent>
          </Tabs>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default AdminReviewsDashboard;
