import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Check, X, Upload, Trash2, Loader2, Video, Image as ImageIcon, Dumbbell, Music, Waves, Flame, Zap, Heart, Activity, Sparkles, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDebounce } from "@/hooks/use-debounce";

/** Available icon choices for video cards */
const ICON_OPTIONS: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: "dumbbell", label: "Pesas",     Icon: Dumbbell },
  { value: "music",    label: "Música",    Icon: Music },
  { value: "waves",    label: "Flow",      Icon: Waves },
  { value: "flame",    label: "Fuego",     Icon: Flame },
  { value: "zap",      label: "Energía",   Icon: Zap },
  { value: "heart",    label: "Corazón",   Icon: Heart },
  { value: "activity", label: "Actividad", Icon: Activity },
  { value: "sparkles", label: "Brillo",    Icon: Sparkles },
];

function getIconComponent(emoji?: string): LucideIcon {
  const found = ICON_OPTIONS.find(o => o.value === emoji);
  if (found) return found.Icon;
  // Fallback for old emoji values
  const EMOJI_MAP: Record<string, LucideIcon> = {
    "🏋️": Dumbbell, "🏋": Dumbbell, "💃": Music, "🧘": Waves,
    "🔥": Flame, "⚡": Zap, "❤️": Heart, "💪": Activity, "✨": Sparkles, "🎬": Activity,
  };
  return EMOJI_MAP[emoji || ""] || Activity;
}

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
}

interface HomepageCard {
  id: number;
  sort_order: number;
  title: string;
  description: string;
  emoji: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
}

/** Convert old Google Drive preview URLs to our proxy format */
function normalizeVideoUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/api/drive/video/")) return url;
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)\/preview/);
  if (m) return `/api/drive/video/${m[1]}`;
  return url;
}

const VideoList = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [editingCard, setEditingCard] = useState<number | null>(null);
  const [cardDraft, setCardDraft] = useState<Partial<HomepageCard>>({});
  const [uploadingCardId, setUploadingCardId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingThumbId, setUploadingThumbId] = useState<number | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const thumbInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { data, isLoading } = useQuery<{ data: VideoItem[]; total: number }>({
    queryKey: ["videos", debouncedSearch],
    queryFn: async () => (await api.get(`/videos?search=${debouncedSearch}&limit=20`)).data,
  });
  const videos = Array.isArray(data?.data) ? data.data : [];

  const { data: cardsData, isLoading: cardsLoading } = useQuery<{ data: HomepageCard[] }>({
    queryKey: ["homepage-video-cards"],
    queryFn: async () => (await api.get("/homepage-video-cards")).data,
  });
  const cards: HomepageCard[] = cardsData?.data ?? [];

  const { toast } = useToast();
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/videos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["videos"] }); toast({ title: "Video eliminado" }); },
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ id, ...body }: Partial<HomepageCard> & { id: number }) =>
      api.put(`/homepage-video-cards/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homepage-video-cards"] });
      toast({ title: "Tarjeta actualizada" });
      setEditingCard(null);
      setCardDraft({});
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  // Upload video file for a homepage card — chunked upload via server proxy to Google Drive
  const handleCardVideoUpload = async (cardId: number, file: File) => {
    const MAX_MB = 500;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast({ title: `El archivo es demasiado grande. Máximo ${MAX_MB} MB.`, variant: "destructive" });
      return;
    }
    setUploadingCardId(cardId);
    setUploadProgress(0);
    try {
      // Step 1: Init resumable session on server (small JSON request)
      const initResp = await api.post("/drive/init-upload", {
        fileName: `homepage_card_${cardId}_${Date.now()}_${file.name}`,
        mimeType: file.type || "video/mp4",
        fileSize: file.size,
      });
      const { sessionId } = initResp.data?.data || initResp.data || {};
      if (!sessionId) throw new Error("No se obtuvo sesión de subida");

      // Step 2: Upload file in ~5 MB chunks via our server proxy (avoids CORS)
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
      let offset = 0;
      let driveFileId = "";
      while (offset < file.size) {
        const end = Math.min(offset + CHUNK_SIZE, file.size);
        const chunk = file.slice(offset, end);
        const contentRange = `bytes ${offset}-${end - 1}/${file.size}`;

        const resp = await api.put(`/drive/upload-chunk/${sessionId}`, chunk, {
          headers: {
            "Content-Type": file.type || "video/mp4",
            "Content-Range": contentRange,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });

        if (resp.data?.done) {
          driveFileId = resp.data.data?.id;
          break;
        }
        // 308 means chunk accepted, continue
        if (resp.data?.range) {
          const nextOffset = parseInt(resp.data.range.split("-")[1], 10) + 1;
          offset = nextOffset;
        } else {
          offset = end;
        }
        setUploadProgress(Math.round((offset / file.size) * 95));
      }

      if (!driveFileId) throw new Error("Upload terminó sin obtener file ID");
      setUploadProgress(97);

      // Step 3: Make file public
      await api.post(`/drive/make-public/${driveFileId}`);

      // Step 4: Save Drive file ID to homepage card
      await api.post(`/homepage-video-cards/${cardId}/set-drive-video`, { driveFileId });

      setUploadProgress(100);
      qc.invalidateQueries({ queryKey: ["homepage-video-cards"] });
      toast({ title: "✅ Video subido correctamente" });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Error al subir video";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setUploadingCardId(null);
      setUploadProgress(0);
    }
  };

  // Delete video from a homepage card
  const deleteCardVideoMutation = useMutation({
    mutationFn: (cardId: number) => api.delete(`/homepage-video-cards/${cardId}/video`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homepage-video-cards"] });
      toast({ title: "Video eliminado de la tarjeta" });
    },
    onError: () => toast({ title: "Error al eliminar video", variant: "destructive" }),
  });

  // Upload thumbnail image for a homepage card
  const handleThumbnailUpload = async (cardId: number, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "La imagen es muy grande. Máximo 10 MB.", variant: "destructive" });
      return;
    }
    setUploadingThumbId(cardId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post(`/homepage-video-cards/${cardId}/thumbnail`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      qc.invalidateQueries({ queryKey: ["homepage-video-cards"] });
      toast({ title: "✅ Miniatura actualizada" });
    } catch (err: any) {
      toast({ title: err?.response?.data?.message || "Error al subir miniatura", variant: "destructive" });
    } finally {
      setUploadingThumbId(null);
    }
  };

  // Delete thumbnail from a homepage card
  const deleteThumbMutation = useMutation({
    mutationFn: (cardId: number) => api.delete(`/homepage-video-cards/${cardId}/thumbnail`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homepage-video-cards"] });
      toast({ title: "Miniatura eliminada" });
    },
    onError: () => toast({ title: "Error al eliminar miniatura", variant: "destructive" }),
  });

  const startEdit = (card: HomepageCard) => {
    setEditingCard(card.id);
    // Map old emoji values to icon keys if needed
    const emojiToIcon: Record<string, string> = {
      "🏋️": "dumbbell", "🏋": "dumbbell", "💃": "music", "🧘": "waves",
      "🔥": "flame", "⚡": "zap", "❤️": "heart", "💪": "activity", "✨": "sparkles", "🎬": "activity",
    };
    const iconKey = ICON_OPTIONS.find(o => o.value === card.emoji)
      ? card.emoji
      : emojiToIcon[card.emoji] || "activity";
    setCardDraft({ title: card.title, description: card.description, emoji: iconKey });
  };

  const cancelEdit = () => { setEditingCard(null); setCardDraft({}); };

  const saveCard = (id: number) => {
    if (!cardDraft.title?.trim() || !cardDraft.description?.trim()) return;
    updateCardMutation.mutate({ id, ...cardDraft });
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl space-y-10">

          {/* ── Tarjetas del inicio ── */}
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-bold">Tarjetas de inicio</h2>
              <p className="text-sm text-muted-foreground">Edita el nombre, descripción y sube un video para cada tarjeta en la sección «Mira cómo se vive» del inicio.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {cardsLoading
                ? Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)
                : cards.map((card) => (
                  <div key={card.id} className="rounded-xl border border-border bg-secondary p-4 space-y-3">
                    {editingCard === card.id ? (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1 flex-wrap">
                            {ICON_OPTIONS.map(({ value, label, Icon }) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setCardDraft((p) => ({ ...p, emoji: value }))}
                                className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all ${
                                  cardDraft.emoji === value
                                    ? "border-primary bg-primary/20 text-primary"
                                    : "border-border bg-background text-muted-foreground hover:border-primary/50"
                                }`}
                                title={label}
                              >
                                <Icon size={16} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            value={cardDraft.title ?? ""}
                            onChange={(e) => setCardDraft((p) => ({ ...p, title: e.target.value }))}
                            placeholder="Nombre de la clase"
                            className="flex-1"
                          />
                        </div>
                        <Textarea
                          value={cardDraft.description ?? ""}
                          onChange={(e) => setCardDraft((p) => ({ ...p, description: e.target.value }))}
                          placeholder="Descripción breve"
                          rows={3}
                          className="text-sm resize-none"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm" className="flex-1 text-xs gap-1"
                            onClick={() => saveCard(card.id)}
                            disabled={updateCardMutation.isPending}
                          >
                            <Check size={12} />Guardar
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={cancelEdit}>
                            <X size={12} />Cancelar
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          {(() => { const Icon = getIconComponent(card.emoji); return <Icon size={20} className="text-primary flex-shrink-0" />; })()}
                          <p className="font-semibold text-sm">{card.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>

                        {/* Video status */}
                        {normalizeVideoUrl(card.video_url) ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="default" className="text-[0.6rem] bg-green-600">
                                <Video size={10} className="mr-1" />Video cargado
                              </Badge>
                            </div>
                            <div className="rounded-lg overflow-hidden border border-border aspect-video bg-black">
                              <video
                                src={normalizeVideoUrl(card.video_url)!}
                                className="w-full h-full object-cover"
                                controls
                                preload="metadata"
                                playsInline
                              />
                            </div>
                            <Button
                              size="sm" variant="destructive" className="w-full text-xs gap-1"
                              onClick={() => deleteCardVideoMutation.mutate(card.id)}
                              disabled={deleteCardVideoMutation.isPending}
                            >
                              <Trash2 size={11} />Eliminar video
                            </Button>
                          </div>
                        ) : uploadingCardId === card.id ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 size={14} className="animate-spin" />
                              Subiendo video... {uploadProgress}%
                            </div>
                            <Progress value={uploadProgress} className="h-2" />
                          </div>
                        ) : (
                          <div>
                            <input
                              type="file"
                              accept="video/*"
                              className="hidden"
                              ref={(el) => { fileInputRefs.current[card.id] = el; }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleCardVideoUpload(card.id, file);
                                e.target.value = "";
                              }}
                            />
                            <Button
                              size="sm" variant="outline" className="w-full text-xs gap-1 border-dashed"
                              onClick={() => fileInputRefs.current[card.id]?.click()}
                            >
                              <Upload size={11} />Subir video
                            </Button>
                            <p className="text-[0.6rem] text-muted-foreground mt-1 text-center">MP4, MOV — máx 500 MB</p>
                          </div>
                        )}

                        {/* Thumbnail / poster image */}
                        <div className="space-y-2">
                          <p className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wide">Miniatura / Portada</p>
                          {card.thumbnail_url ? (
                            <div className="space-y-1.5">
                              <div className="rounded-lg overflow-hidden border border-border aspect-video bg-black">
                                <img
                                  src={card.thumbnail_url}
                                  alt="Miniatura"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="flex gap-1.5">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  ref={(el) => { thumbInputRefs.current[card.id] = el; }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleThumbnailUpload(card.id, file);
                                    e.target.value = "";
                                  }}
                                />
                                <Button
                                  size="sm" variant="outline" className="flex-1 text-xs gap-1"
                                  onClick={() => thumbInputRefs.current[card.id]?.click()}
                                  disabled={uploadingThumbId === card.id}
                                >
                                  {uploadingThumbId === card.id ? <Loader2 size={11} className="animate-spin" /> : <ImageIcon size={11} />}
                                  Cambiar
                                </Button>
                                <Button
                                  size="sm" variant="destructive" className="text-xs gap-1"
                                  onClick={() => deleteThumbMutation.mutate(card.id)}
                                  disabled={deleteThumbMutation.isPending}
                                >
                                  <Trash2 size={11} />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                ref={(el) => { thumbInputRefs.current[card.id] = el; }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleThumbnailUpload(card.id, file);
                                  e.target.value = "";
                                }}
                              />
                              <Button
                                size="sm" variant="outline" className="w-full text-xs gap-1 border-dashed"
                                onClick={() => thumbInputRefs.current[card.id]?.click()}
                                disabled={uploadingThumbId === card.id}
                              >
                                {uploadingThumbId === card.id ? <Loader2 size={11} className="animate-spin" /> : <ImageIcon size={11} />}
                                Subir miniatura
                              </Button>
                              <p className="text-[0.6rem] text-muted-foreground mt-1 text-center">JPG, PNG — máx 10 MB</p>
                            </div>
                          )}
                        </div>

                        <Button
                          size="sm" variant="outline" className="w-full text-xs gap-1"
                          onClick={() => startEdit(card)}
                        >
                          <Pencil size={11} />Editar texto
                        </Button>
                      </>
                    )}
                  </div>
                ))}
            </div>
          </section>

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
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{formatDuration(v.duration_seconds ?? 0)}</p>
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
