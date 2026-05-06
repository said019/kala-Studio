import { useState, useRef } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Plus, Upload } from "lucide-react";

const instructorSchema = z.object({
  displayName: z.string().min(1),
  email: z.string().email(),
  bio: z.string().optional(),
  specialties: z.string().optional(),
  isActive: z.boolean().default(true),
  photoFocusX: z.coerce.number().min(0).max(100).default(50),
  photoFocusY: z.coerce.number().min(0).max(100).default(50),
});

type InstructorFormData = z.infer<typeof instructorSchema>;
interface Instructor extends Omit<InstructorFormData, "specialties"> {
  id: string;
  specialties?: string[] | string | null;
  photoUrl?: string;
  photoFocusX?: number;
  photoFocusY?: number;
}

function clampFocus(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeSpecialties(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
    } catch (_) {
      // fallback to comma-separated text
    }
    return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function getFocusFromPointerEvent(event: React.PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const nextX = ((event.clientX - rect.left) / rect.width) * 100;
  const nextY = ((event.clientY - rect.top) / rect.height) * 100;
  return {
    x: clampFocus(nextX),
    y: clampFocus(nextY),
  };
}

const InstructorsList = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Instructor | null>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<{ data: Instructor[] }>({
    queryKey: ["instructors"],
    queryFn: async () => (await api.get("/instructors")).data,
  });
  const instructors = Array.isArray(data?.data) ? data.data : [];

  const form = useForm<InstructorFormData>({
    resolver: zodResolver(instructorSchema),
    defaultValues: { isActive: true, photoFocusX: 50, photoFocusY: 50 },
  });

  const createMutation = useMutation({
    mutationFn: (d: InstructorFormData) => api.post("/instructors", {
      ...d,
      specialties: d.specialties?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
      photoFocusX: clampFocus(d.photoFocusX),
      photoFocusY: clampFocus(d.photoFocusY),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instructors"] }); toast({ title: "Instructor creado" }); setOpen(false); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al crear", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; displayName: string; email: string; bio?: string; specialties?: string; isActive: boolean; photoFocusX: number; photoFocusY: number }) => {
      const { id, specialties, ...rest } = payload;
      return api.put(`/instructors/${id}`, {
        ...rest,
        specialties: specialties ? specialties.split(",").map((s) => s.trim()).filter(Boolean) : [],
        photoFocusX: clampFocus(rest.photoFocusX),
        photoFocusY: clampFocus(rest.photoFocusY),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instructors"] }); toast({ title: "✅ Instructor actualizado" }); setOpen(false); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/instructors/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instructors"] }); toast({ title: "Instructor eliminado" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al eliminar", variant: "destructive" }),
  });

  const magicLinkMutation = useMutation({
    mutationFn: (id: string) => api.post(`/instructors/${id}/magic-link`),
    onSuccess: (res: any) => {
      if (res.data?.data?.link) {
        navigator.clipboard.writeText(res.data.data.link);
        toast({ title: "✅ Magic link copiado al portapapeles" });
      }
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al generar link", variant: "destructive" }),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append("photo", file);
      return api.post(`/instructors/${id}/photo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["instructors"] }); toast({ title: "✅ Foto actualizada" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al subir foto", variant: "destructive" }),
  });

  const openEdit = (i: Instructor) => {
    form.reset({
      ...i,
      specialties: normalizeSpecialties(i.specialties).join(", "),
      photoFocusX: clampFocus(i.photoFocusX),
      photoFocusY: clampFocus(i.photoFocusY),
    });
    setEditing(i);
    setOpen(true);
  };

  const openCreate = () => {
    form.reset({ isActive: true, photoFocusX: 50, photoFocusY: 50 });
    setEditing(null);
    setOpen(true);
  };

  const focusX = clampFocus(form.watch("photoFocusX"));
  const focusY = clampFocus(form.watch("photoFocusY"));
  const applyPreviewFocus = (event: React.PointerEvent<HTMLElement>) => {
    const next = getFocusFromPointerEvent(event);
    form.setValue("photoFocusX", next.x, { shouldDirty: true, shouldTouch: true });
    form.setValue("photoFocusY", next.y, { shouldDirty: true, shouldTouch: true });
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <h1 className="text-2xl font-bold">Instructores / Staff</h1>
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1" />Nuevo instructor</Button>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileRef}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && uploadTargetId) uploadPhotoMutation.mutate({ id: uploadTargetId, file: f });
                e.target.value = "";
                setUploadTargetId(null);
              }}
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Foto</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Especialidades</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array(4).fill(0).map((_, i) => (
                    <TableRow key={i}>{Array(6).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))
                  : instructors.map((ins) => (
                    <TableRow key={ins.id}>
                      <TableCell>
                        {ins.photoUrl
                          ? <img src={ins.photoUrl} className="w-8 h-8 rounded-full object-cover" style={{ objectPosition: `${clampFocus(ins.photoFocusX)}% ${clampFocus(ins.photoFocusY)}%` }} alt="" />
                          : <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">{ins.displayName?.[0]}</div>
                        }
                      </TableCell>
                      <TableCell className="font-medium">{ins.displayName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ins.email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{normalizeSpecialties(ins.specialties).join(", ")}</TableCell>
                      <TableCell><Badge variant={ins.isActive ? "default" : "secondary"}>{ins.isActive ? "Activo" : "Inactivo"}</Badge></TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => openEdit(ins)}>Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setUploadTargetId(ins.id); setTimeout(() => fileRef.current?.click(), 0); }}>Subir foto</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => magicLinkMutation.mutate(ins.id)}>Magic link</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm("¿Eliminar este instructor?")) deleteMutation.mutate(ins.id); }}>Eliminar</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing ? "Editar instructor" : "Nuevo instructor"}</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit((d) => editing
              ? updateMutation.mutate({
                id: editing.id,
                displayName: d.displayName,
                email: d.email,
                bio: d.bio,
                specialties: d.specialties,
                isActive: d.isActive,
                photoFocusX: d.photoFocusX,
                photoFocusY: d.photoFocusY,
              })
              : createMutation.mutate(d))} className="space-y-4">
              <div className="space-y-1"><Label>Nombre</Label><Input {...form.register("displayName")} /></div>
              <div className="space-y-1"><Label>Email</Label><Input type="email" {...form.register("email")} /></div>
              <div className="space-y-1"><Label>Bio</Label><Input {...form.register("bio")} /></div>
              <div className="space-y-1"><Label>Especialidades (separadas por coma)</Label><Input {...form.register("specialties")} /></div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Enfoque horizontal</Label>
                  <span className="text-xs text-muted-foreground">{focusX}%</span>
                </div>
                <Input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={focusX}
                  onChange={(e) => form.setValue("photoFocusX", Number(e.target.value), { shouldDirty: true })}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Enfoque vertical</Label>
                  <span className="text-xs text-muted-foreground">{focusY}%</span>
                </div>
                <Input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={focusY}
                  onChange={(e) => form.setValue("photoFocusY", Number(e.target.value), { shouldDirty: true })}
                />
              </div>
              {editing?.photoUrl && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Vista previa y enfoque</Label>
                    <span className="text-[11px] text-muted-foreground">Haz clic o arrastra sobre la cara</span>
                  </div>
                  <button
                    type="button"
                    onPointerDown={applyPreviewFocus}
                    onPointerMove={(event) => {
                      if (event.buttons !== 1 && event.pointerType !== "touch") return;
                      applyPreviewFocus(event);
                    }}
                    className="group relative mx-auto block h-[360px] w-full max-w-[300px] touch-none overflow-hidden rounded-[28px] border border-border bg-black/30 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E9745F]"
                    aria-label="Seleccionar enfoque de la foto"
                  >
                    <img
                      src={editing.photoUrl}
                      alt={editing.displayName}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      style={{ objectPosition: `${focusX}% ${focusY}%` }}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                    <div
                      className="pointer-events-none absolute h-8 w-8 rounded-full border border-white/80 bg-white/10 shadow-[0_0_0_1px_rgba(0,0,0,0.2)] backdrop-blur-sm"
                      style={{ left: `${focusX}%`, top: `${focusY}%`, transform: "translate(-50%, -50%)" }}
                    >
                      <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-4 py-3 text-[11px] font-medium text-white/80">
                      <span>X {focusX}%</span>
                      <span>Y {focusY}%</span>
                    </div>
                  </button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} />
                <Label>Activo</Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && <span className="mr-2 animate-spin">⏳</span>}
                  {editing ? "Actualizar datos" : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
};

export default InstructorsList;
