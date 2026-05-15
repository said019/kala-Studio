import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDebounce } from "@/hooks/use-debounce";

interface VideoItem {
  id: string;
  title: string;
  description?: string;
  access_type: "gratuito" | "miembros";
  is_published: boolean;
  thumbnail_url?: string;
  duration_seconds: number;
  sales_enabled: boolean;
  sales_price_mxn: number | null;
  level: string;
  is_trial?: boolean;
}

const VideoList = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery<{ data: VideoItem[]; total: number }>({
    queryKey: ["videos", debouncedSearch],
    queryFn: async () => (await api.get(`/videos?search=${debouncedSearch}&limit=20`)).data,
  });
  const videos = Array.isArray(data?.data) ? data.data : [];

  const { toast } = useToast();
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/videos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["videos"] }); toast({ title: "Video eliminado" }); },
  });

  const updateTrialMutation = useMutation({
    mutationFn: ({ id, is_trial }: { id: string; is_trial: boolean }) =>
      api.put(`/admin/videos/${id}`, { is_trial }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["videos"] });
      // I2: a trial toggle changes whether the video plays without a plan, so the
      // single-video fetch, the signed-URL gate and the alumna's own state must refresh.
      qc.invalidateQueries({ queryKey: ["video", vars.id] });
      qc.invalidateQueries({ queryKey: ["video-stream-url", vars.id] });
      qc.invalidateQueries({ queryKey: ["me-video-access"] });
      toast({ title: "Estado de muestra actualizado" });
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl space-y-10">

          {/* ── Videos ── */}
          <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <h2 className="text-lg font-bold">Videos</h2>
              <Button size="sm" onClick={() => navigate("/admin/videos/upload")}>
                <Plus size={14} className="mr-1" />Nuevo video
              </Button>
            </div>

            <div className="relative mb-4 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar videos..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {isLoading
                ? Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
                : videos.map((v) => (
                  <div key={v.id} className="rounded-xl border border-border overflow-hidden bg-secondary hover:bg-muted transition-colors">
                    {v.thumbnail_url
                      ? <img src={v.thumbnail_url} alt={v.title} className="w-full h-28 object-cover" />
                      : <div className="w-full h-28 bg-muted flex items-center justify-center text-muted-foreground text-xs">Sin miniatura</div>
                    }
                    <div className="p-3">
                      <p className="font-medium text-sm truncate">{v.title}</p>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <Badge variant={v.access_type === "gratuito" ? "default" : "secondary"} className="text-[0.6rem]">{v.access_type}</Badge>
                        {!v.is_published && <Badge variant="outline" className="text-[0.6rem]">Borrador</Badge>}
                        {v.sales_enabled && v.sales_price_mxn && (
                          <Badge variant="outline" className="text-[0.6rem]">${v.sales_price_mxn}</Badge>
                        )}
                        {v.is_trial && (
                          <Badge className="text-[0.6rem] bg-amber-500 hover:bg-amber-500">🎁 Clase muestra</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{formatDuration(v.duration_seconds ?? 0)}</p>
                      <div className="flex items-center justify-end mt-2">
                        <button
                          type="button"
                          className="text-[0.65rem] underline text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                          onClick={() => {
                            const trialCount = videos.filter((vv: VideoItem) => vv.is_trial).length;
                            if (!v.is_trial && trialCount >= 2) {
                              if (!window.confirm("Ya tienes 2 clases marcadas como muestra. ¿Seguro de marcar otra? El trial funciona mejor con 1-2 videos.")) return;
                            }
                            updateTrialMutation.mutate({ id: v.id, is_trial: !v.is_trial });
                          }}
                          disabled={updateTrialMutation.isPending}
                        >
                          {v.is_trial ? "Quitar de muestra" : "Marcar como muestra"}
                        </button>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => navigate(`/admin/videos/upload?id=${v.id}`)}>Editar</Button>
                        <Button size="sm" variant="destructive" className="text-xs" onClick={() => { if (window.confirm("¿Eliminar este video?")) deleteMutation.mutate(v.id); }}>Eliminar</Button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </section>

        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default VideoList;
