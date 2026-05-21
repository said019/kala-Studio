import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Video, Image, CheckCircle2 } from "lucide-react";
import { KALA } from "@/components/app/tokens";

// String opcional que NO se rompe si la BD manda null (Zod .optional() solo
// admite undefined). Convertimos null → "" para que el form nunca bloquee.
const optStr = z.preprocess((v) => (v == null ? "" : v), z.string()).optional();

const videoSchema = z.object({
  title: z.string().min(1, "Título requerido"),
  description: optStr,
  tagline: optStr,
  subtitle: optStr,
  days: optStr,
  // Tolerantes: un valor inesperado guardado en BD no debe bloquear el submit.
  level: optStr,
  access_type: optStr,
  is_published: z.boolean().default(false),
  is_featured: z.boolean().default(false),
  duration_seconds: z.coerce.number().default(0),
  sort_order: z.coerce.number().default(0),
  sales_enabled: z.boolean().default(false),
  sales_unlocks_video: z.boolean().default(false),
  sales_price_mxn: z.coerce.number().nullable().optional(),
  sales_class_credits: z.coerce.number().nullable().optional(),
  sales_cta_text: optStr,
  category_id: optStr,
  brand_color: optStr,
  // set by upload response
  drive_file_id: optStr,
  cloudinary_id: optStr,
  thumbnail_url: optStr,
  thumbnail_drive_id: optStr,
  plan_ids: z.array(z.string()).default([]),
});

type VideoFormData = z.infer<typeof videoSchema>;

/* ── Helpers de subida resiliente ────────────────────────────────────────
   Para archivos enormes (≥1GB) la red flaquea cada tantos minutos. Un chunk
   que falle por timeout o 5xx transitorio no debe matar todo el upload —
   se reintenta con backoff. Solo abortamos ante 4xx no recuperables.
*/
const UPLOAD_CHUNK_SIZE = 16 * 1024 * 1024; // 16 MB (múltiplo de 256 KB que Drive exige)
const UPLOAD_MAX_MB = 12 * 1024;            // 12 GB tope
const UPLOAD_CHUNK_RETRIES = 5;
const UPLOAD_RESUME_KEY = "kala_video_upload_v1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sube una imagen de miniatura a Drive vía el proxy de chunks y devuelve
 * { driveId, url } donde url apunta a nuestro proxy (no a drive.google.com,
 * que solo carga si la carpeta es pública). Devuelve null si falla.
 */
const uploadThumbnail = async (
  blob: Blob,
  name: string,
  mime: string,
): Promise<{ driveId: string; url: string } | null> => {
  const init = await api.post("/drive/init-upload", {
    fileName: `thumb_${Date.now()}_${name || "thumbnail.jpg"}`,
    mimeType: mime,
    fileSize: blob.size,
  });
  const sessionId = init.data?.data?.sessionId;
  if (!sessionId) return null;
  const resp = await api.put(`/drive/upload-chunk/${sessionId}`, blob, {
    headers: {
      "Content-Type": mime,
      "Content-Range": `bytes 0-${blob.size - 1}/${blob.size}`,
    },
    maxBodyLength: Infinity,
  });
  if (resp.data?.done && resp.data.data?.id) {
    const driveId = resp.data.data.id;
    await api.post(`/drive/make-public/${driveId}`).catch(() => { /* opcional */ });
    return { driveId, url: `/api/drive/video/${driveId}` };
  }
  return null;
};

const isRetryableUploadError = (err: any) => {
  const status = err?.response?.status;
  if (!status) return true;                  // red caída / sin respuesta
  if (status === 408 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
};

/**
 * Carga el video en el navegador y devuelve:
 *   - duration: duración real en segundos (entero), o null si no se pudo leer.
 *   - thumb:    Blob JPEG con un frame al `atRatio` (default 10%), o null.
 *
 * Hacemos las dos cosas en una sola pasada para no abrir el archivo dos
 * veces. Si el navegador no puede leer el codec/contenedor (timeout 20s)
 * todo cae a null y el caller decide cómo seguir.
 */
const probeVideoLocally = (
  file: File,
  atRatio = 0.1,
): Promise<{ duration: number | null; thumb: Blob | null }> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    let settled = false;
    let duration: number | null = null;
    const cleanup = () => { try { URL.revokeObjectURL(url); } catch { /* no-op */ } };
    const done = (thumb: Blob | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ duration, thumb });
    };
    // Timeout duro: si el navegador no puede leer el video en 20s, abortamos.
    const timer = window.setTimeout(() => done(null), 20000);

    video.addEventListener("loadedmetadata", () => {
      const dur = video.duration;
      if (Number.isFinite(dur) && dur > 0) {
        duration = Math.round(dur);
      }
      if (!Number.isFinite(dur) || dur <= 0) {
        window.clearTimeout(timer);
        done(null);
        return;
      }
      // Saltamos a la posición elegida (10%). Mínimo 0.5s para evitar el
      // frame 0 que muchas veces es negro.
      const target = Math.max(0.5, Math.min(dur - 0.1, dur * atRatio));
      video.currentTime = target;
    });
    video.addEventListener("seeked", () => {
      try {
        // Cap a 1280px de ancho — suficiente para una miniatura, evita
        // JPEGs gigantes.
        const w = video.videoWidth || 1280;
        const h = video.videoHeight || 720;
        const scale = Math.min(1, 1280 / w);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { window.clearTimeout(timer); done(null); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          window.clearTimeout(timer);
          done(blob);
        }, "image/jpeg", 0.85);
      } catch {
        window.clearTimeout(timer);
        done(null);
      }
    });
    video.addEventListener("error", () => { window.clearTimeout(timer); done(null); });
    video.src = url;
  });

const VideoUpload = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("id");

  // Upload state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedEmbedUrl, setUploadedEmbedUrl] = useState<string | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);

  const { data: existingData } = useQuery({
    queryKey: ["video", editId],
    queryFn: async () => (await api.get(`/videos/${editId}`)).data,
    enabled: !!editId,
  });

  const existing = existingData?.data ?? existingData ?? null;

  const { data: plansData } = useQuery<{ data: { id: string; name: string; includes_video_library?: boolean; includesVideoLibrary?: boolean }[] }>({
    queryKey: ["plans-for-video"],
    queryFn: async () => (await api.get("/plans")).data,
  });
  const plans = plansData?.data ?? [];

  const { data: categoriesData } = useQuery<{ data: { id: string; name: string }[] }>({
    queryKey: ["video-categories"],
    queryFn: async () => (await api.get("/videos/categories")).data,
  });

  const form = useForm<VideoFormData>({
    resolver: zodResolver(videoSchema),
    defaultValues: {
      level: "todos",
      access_type: "gratuito",
      is_published: false,
      is_featured: false,
      sales_enabled: false,
      sales_unlocks_video: false,
      sales_price_mxn: null,
      sales_class_credits: 0,
      sales_cta_text: "Comprar acceso",
      duration_seconds: 0,
      sort_order: 0,
      brand_color: "#76214D",
      plan_ids: [],
      // Saneamos lo que viene de la BD: quitamos los null para no pisar los
      // defaults de arriba (un null en un Select/Input lo deja descontrolado).
      ...Object.fromEntries(
        Object.entries(existing ?? {}).filter(([, v]) => v !== null && v !== undefined)
      ),
    },
  });

  // Pre-fill embed URL when editing
  const existingDriveId = existing?.drive_file_id;
  if (existingDriveId && !uploadedEmbedUrl) {
    setUploadedEmbedUrl(`/api/drive/video/${existingDriveId}`);
  }

  const createMutation = useMutation({
    mutationFn: (d: VideoFormData) => api.post("/videos", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["videos"] }); toast({ title: "✅ Video creado" }); navigate("/admin/videos"); },
    onError: () => toast({ title: "Error al crear video", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (d: VideoFormData) => api.put(`/videos/${editId}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["videos"] }); toast({ title: "✅ Video actualizado" }); navigate("/admin/videos"); },
    onError: () => toast({ title: "Error al actualizar video", variant: "destructive" }),
  });

  // Chunked, resumable upload via server proxy → Google Drive.
  // Para 5-12GB necesitamos resiliencia: cada chunk se reintenta con backoff
  // ante errores transitorios (red, 5xx, 429). Si la sesión se pierde mid-upload
  // tras un error fatal, se borra la entrada de resume; si solo es un retry de
  // chunk, mantenemos sessionId/offset en localStorage para reanudar si la
  // pestaña se recarga sin querer.
  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const videoFile = e.target.files?.[0];
    if (!videoFile) return;

    if (videoFile.size > UPLOAD_MAX_MB * 1024 * 1024) {
      const gb = (UPLOAD_MAX_MB / 1024).toFixed(0);
      toast({ title: `El archivo es demasiado grande. Máximo ${gb} GB.`, variant: "destructive" });
      return;
    }

    setVideoFileName(videoFile.name);
    setIsUploading(true);
    setUploadProgress(0);
    setUploadedEmbedUrl(null);

    // Probe local: duración real y frame para miniatura, en una sola pasada.
    // Lo hacemos antes de pegarle a la red para que el form ya tenga la
    // duración aunque la subida tarde minutos.
    const probe = await probeVideoLocally(videoFile, 0.1);
    if (probe.duration && probe.duration > 0) {
      form.setValue("duration_seconds", probe.duration);
    }

    try {
      // Step 1: Init resumable session on server (small JSON request)
      const initResp = await api.post("/drive/init-upload", {
        fileName: `video_${Date.now()}_${videoFile.name}`,
        mimeType: videoFile.type || "video/mp4",
        fileSize: videoFile.size,
      });
      const { sessionId } = initResp.data?.data || initResp.data || {};
      if (!sessionId) throw new Error("No se obtuvo sesión de subida");

      // Persistir progreso para resumir si la pestaña se recarga sin querer.
      try {
        localStorage.setItem(UPLOAD_RESUME_KEY, JSON.stringify({
          sessionId, fileName: videoFile.name, fileSize: videoFile.size, startedAt: Date.now(),
        }));
      } catch { /* localStorage lleno o privado — seguimos sin resume */ }

      // Step 2: Sube en chunks de 16MB. Cada chunk: reintenta hasta 5 veces con
      // backoff exponencial (1s, 2s, 4s, 8s, 16s) ante errores transitorios.
      let offset = 0;
      let driveFileId = "";

      while (offset < videoFile.size) {
        const end = Math.min(offset + UPLOAD_CHUNK_SIZE, videoFile.size);
        const chunk = videoFile.slice(offset, end);
        const contentRange = `bytes ${offset}-${end - 1}/${videoFile.size}`;

        let lastError: any = null;
        let chunkOk = false;
        for (let attempt = 0; attempt < UPLOAD_CHUNK_RETRIES; attempt++) {
          try {
            const resp = await api.put(`/drive/upload-chunk/${sessionId}`, chunk, {
              headers: {
                "Content-Type": videoFile.type || "video/mp4",
                "Content-Range": contentRange,
              },
              maxBodyLength: Infinity,
              maxContentLength: Infinity,
              // Sin timeout para chunks grandes; axios default puede ser muy estricto.
              timeout: 0,
            });

            if (resp.data?.done) {
              driveFileId = resp.data.data?.id;
              offset = videoFile.size;
            } else if (resp.data?.range) {
              // Drive nos dice hasta dónde recibió (formato "0-N"). Avanzamos a N+1.
              const lastByte = parseInt(resp.data.range.split("-")[1], 10);
              if (Number.isFinite(lastByte)) {
                offset = lastByte + 1;
              } else {
                offset = end;
              }
            } else {
              offset = end;
            }
            chunkOk = true;
            break;
          } catch (err: any) {
            lastError = err;
            if (!isRetryableUploadError(err)) {
              // 4xx (token expirado, formato, etc.): no tiene sentido reintentar.
              throw err;
            }
            const backoffMs = Math.min(16000, 1000 * Math.pow(2, attempt));
            await sleep(backoffMs);
            // Antes de reintentar, preguntamos al server cuánto recibió Drive:
            // si el chunk anterior llegó (total o parcialmente) avanzamos el
            // offset y NO reenviamos bytes ya almacenados.
            try {
              const status = await api.get(`/drive/upload-chunk/${sessionId}/status`);
              if (status.data?.done) {
                driveFileId = status.data.data?.id;
                offset = videoFile.size;
                chunkOk = true;
                break;
              }
              const next = Number(status.data?.nextOffset);
              if (Number.isFinite(next) && next > offset) {
                // Drive ya tiene parte del chunk: avanzamos al nuevo offset y
                // damos por bueno este intento; el while exterior re-calcula
                // el slice para los bytes restantes.
                offset = next;
                chunkOk = true;
                break;
              }
            } catch { /* status falló: dejamos que la próxima iteración reintente igual */ }
          }
        }
        if (!chunkOk) {
          throw lastError ?? new Error("No se pudo subir un fragmento del video");
        }

        // Progreso del 0 al 90% durante la subida; 90-100% se reserva para
        // make-public + thumbnail + guardado en BD.
        setUploadProgress(Math.round((offset / videoFile.size) * 90));
      }

      if (!driveFileId) throw new Error("La subida terminó sin obtener file ID");
      setUploadProgress(93);

      // Ya está completo en Drive: limpiamos la marca de resume.
      try { localStorage.removeItem(UPLOAD_RESUME_KEY); } catch { /* no-op */ }

      // Step 3: Make file public
      await api.post(`/drive/make-public/${driveFileId}`);
      setUploadProgress(96);

      // Step 4: Miniatura.
      //   - Si la admin subió una, usamos esa.
      //   - Si no, extraemos un frame del 10% del video en el navegador y la
      //     generamos automáticamente como JPEG.
      //   La URL final apunta a nuestro proxy /api/drive/video/{id}, no a
      //   drive.google.com (que solo carga si la carpeta es pública).
      const uploadedThumb = thumbInputRef.current?.files?.[0] || null;
      let thumbBlob: Blob | null = uploadedThumb;
      let thumbName = uploadedThumb?.name || "";
      let thumbMime = uploadedThumb?.type || "image/jpeg";
      if (!uploadedThumb && probe.thumb) {
        // Frame al 10% extraído arriba en probeVideoLocally.
        thumbBlob = probe.thumb;
        thumbName = `auto_${videoFile.name.replace(/\.[^.]+$/, "")}.jpg`;
        thumbMime = "image/jpeg";
      }

      let thumbnailDriveId = "";
      let thumbnailUrl = "";
      if (thumbBlob) {
        const up = await uploadThumbnail(thumbBlob, thumbName, thumbMime);
        if (up) {
          thumbnailDriveId = up.driveId;
          thumbnailUrl = up.url;
        }
      }

      setUploadProgress(100);

      // Set form values
      form.setValue("drive_file_id", driveFileId);
      form.setValue("cloudinary_id", driveFileId);
      form.setValue("thumbnail_url", thumbnailUrl);
      form.setValue("thumbnail_drive_id", thumbnailDriveId);
      setUploadedEmbedUrl(`/api/drive/video/${driveFileId}`);
      toast({ title: "✅ Video subido" });
    } catch (err: any) {
      // Error fatal: el resume no sirve (la sesión seguramente está rota).
      try { localStorage.removeItem(UPLOAD_RESUME_KEY); } catch { /* no-op */ }
      const msg = err?.response?.data?.message || err?.message || "Error al subir video";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleThumbFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setThumbPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const [savingThumb, setSavingThumb] = useState(false);

  const onSubmit = async (d: VideoFormData) => {
    // Si la admin eligió una imagen de miniatura nueva (típico en modo
    // edición, donde no se re-sube el video), la subimos ahora a Drive y
    // reemplazamos el thumbnail antes de guardar.
    let payload = d;
    const newThumb = thumbInputRef.current?.files?.[0] || null;
    if (newThumb) {
      try {
        setSavingThumb(true);
        const up = await uploadThumbnail(newThumb, newThumb.name, newThumb.type || "image/jpeg");
        if (up) {
          payload = { ...d, thumbnail_url: up.url, thumbnail_drive_id: up.driveId };
          form.setValue("thumbnail_url", up.url);
          form.setValue("thumbnail_drive_id", up.driveId);
        } else {
          toast({ title: "No se pudo subir la portada", description: "Guardamos el resto igual.", variant: "destructive" });
        }
      } catch {
        toast({ title: "No se pudo subir la portada", description: "Guardamos el resto igual.", variant: "destructive" });
      } finally {
        setSavingThumb(false);
      }
    }
    if (editId) updateMutation.mutate(payload);
    else createMutation.mutate(payload);
  };

  // Si react-hook-form bloquea el submit por validación, el botón parecía
  // "muerto" sin feedback. Aquí avisamos exactamente qué campo falla.
  const onInvalid = (errors: Record<string, { message?: string }>) => {
    const first = Object.entries(errors)[0];
    const field = first?.[0] ?? "";
    const labels: Record<string, string> = {
      title: "Título", duration_seconds: "Duración", access_type: "Acceso al video",
      sales_price_mxn: "Precio", level: "Nivel",
    };
    toast({
      title: "Revisa el formulario",
      description: first?.[1]?.message
        ? `${labels[field] ?? field}: ${first[1].message}`
        : `Hay un campo con error: ${labels[field] ?? field}`,
      variant: "destructive",
    });
  };

  const salesEnabled = form.watch("sales_enabled");
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-3xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <h1 className="text-2xl font-bold">{editId ? "Editar video" : "Nuevo video"}</h1>
            <Button variant="outline" onClick={() => navigate("/admin/videos")}>Cancelar</Button>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-8">

            {/* ── UPLOAD ─────────────────────────────────────────────── */}
            <section className="space-y-4 rounded-xl border p-5">
              <h2 className="font-semibold flex items-center gap-2"><Video size={16} /> Archivo de video</h2>

              {/* Aviso explícito en modo edición: el video actual sigue ahí.
                  Si la admin solo edita metadatos NO tiene que volver a subir. */}
              {editId && existing?.drive_file_id && !videoFileName && (
                <div
                  className="rounded-lg border p-3 flex items-center gap-3"
                  style={{ borderColor: KALA.border, backgroundColor: KALA.blush }}
                >
                  <CheckCircle2 size={18} style={{ color: KALA.olive }} />
                  <div className="text-sm">
                    <p className="font-medium" style={{ color: KALA.ink }}>
                      Ya hay un video guardado.
                    </p>
                    <p className="text-xs" style={{ color: KALA.ink, opacity: 0.65 }}>
                      Puedes editar los datos sin tocar nada más. Solo sube otro archivo si quieres reemplazarlo.
                    </p>
                  </div>
                </div>
              )}

              {/* Video file picker */}
              <div
                className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => videoInputRef.current?.click()}
              >
                {videoFileName ? (
                  <p className="text-sm font-medium flex items-center gap-2">
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} className="text-green-500" />}
                    {videoFileName}
                  </p>
                ) : editId && existing?.drive_file_id ? (
                  <>
                    <Upload size={28} className="text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Reemplazar el video (opcional)</p>
                    <p className="text-xs text-muted-foreground">Solo si quieres sustituir el archivo actual.</p>
                  </>
                ) : (
                  <>
                    <Upload size={28} className="text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Haz click para seleccionar el video</p>
                    <p className="text-xs text-muted-foreground">MP4, MOV, AVI — máx. 12 GB · sin recompresión, sube en buena calidad</p>
                  </>
                )}
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleVideoFileChange}
                />
              </div>

              {/* Upload progress */}
              {isUploading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Subiendo video…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              {/* Preview embed once uploaded */}
              {uploadedEmbedUrl && !isUploading && (
                <div className="space-y-2">
                  <p className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle2 size={13} /> Video subido</p>
                  <video
                    src={uploadedEmbedUrl}
                    className="w-full rounded-lg border aspect-video bg-black"
                    controls
                    preload="metadata"
                    playsInline
                  />
                </div>
              )}

              {/* Thumbnail */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Image size={14} /> Miniatura (opcional)</Label>
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => thumbInputRef.current?.click()}>
                    Seleccionar imagen
                  </Button>
                  {thumbPreview && <img src={thumbPreview} className="h-16 rounded object-cover" alt="thumb" />}
                  <input ref={thumbInputRef} type="file" accept="image/*" className="hidden" onChange={handleThumbFileChange} />
                </div>
                <p className="text-xs text-muted-foreground">Si no subes miniatura tomamos un fotograma del video al 10% de duración.</p>
              </div>

              {/* Internal: drive_file_id se rellena al subir; queda en el form pero
                  oculto al admin (no mostrar el proveedor de almacenamiento). */}
              <input type="hidden" {...form.register("drive_file_id")} />
            </section>

            {/* ── METADATA ───────────────────────────────────────────── */}
            <section className="space-y-4 rounded-xl border p-5">
              <h2 className="font-semibold">Metadatos</h2>
              <div className="space-y-1"><Label>Título *</Label><Input {...form.register("title")} /></div>
              <div className="space-y-1"><Label>Descripción</Label><Input {...form.register("description")} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Subtítulo</Label><Input {...form.register("subtitle")} /></div>
                <div className="space-y-1"><Label>Tagline</Label><Input {...form.register("tagline")} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Días de clase</Label><Input {...form.register("days")} placeholder="Lunes, Miércoles y Viernes" /></div>
                <div className="space-y-1">
                  <Label>Duración (minutos)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Se detecta al subir"
                    value={(() => {
                      const s = Number(form.watch("duration_seconds")) || 0;
                      return s > 0 ? Math.round((s / 60) * 10) / 10 : "";
                    })()}
                    onChange={(e) => {
                      const min = parseFloat(e.target.value);
                      form.setValue("duration_seconds", Number.isFinite(min) ? Math.round(min * 60) : 0);
                    }}
                  />
                  <p className="text-[0.7rem] text-muted-foreground">Se llena solo al subir el video; puedes ajustarlo.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Nivel</Label>
                  <Select value={form.watch("level")} onValueChange={(v) => form.setValue("level", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["principiante", "intermedio", "avanzado", "todos"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Categoría</Label>
                  <Select value={form.watch("category_id") || ""} onValueChange={(v) => form.setValue("category_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(categoriesData?.data) ? categoriesData.data : []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[0.7rem] text-muted-foreground">Agrupa el video en la biblioteca (ej. Fuerza, Estiramiento). Opcional.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Color de marca</Label><div className="flex gap-2"><Input type="color" {...form.register("brand_color")} className="h-10 w-14 cursor-pointer p-1" /><Input {...form.register("brand_color")} className="font-mono" /></div></div>
                <div className="space-y-1"><Label>Orden</Label><Input type="number" {...form.register("sort_order")} /></div>
              </div>
            </section>

            {/* ── ACCESS ─────────────────────────────────────────────── */}
            <section className="space-y-4 rounded-xl border p-5">
              <h2 className="font-semibold">Acceso y publicación</h2>
              <div className="space-y-2">
                <Label>Acceso al video</Label>
                <Select
                  value={form.watch("access_type") === "gratuito" || form.watch("access_type") === "free" ? "gratuito" : "miembros"}
                  onValueChange={(v) => form.setValue("access_type", v as VideoFormData["access_type"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gratuito">Gratis — cualquier alumna registrada</SelectItem>
                    <SelectItem value="miembros">Por planes — solo ciertos planes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.watch("access_type") === "miembros" && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <Label className="text-sm">Planes que desbloquean este video</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-auto">
                    {plans.map((p) => {
                      const selected = (form.watch("plan_ids") ?? []).includes(p.id);
                      const isFullLib = Boolean(p.includes_video_library ?? p.includesVideoLibrary);
                      return (
                        <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              const cur = form.watch("plan_ids") ?? [];
                              form.setValue(
                                "plan_ids",
                                e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)
                              );
                            }}
                          />
                          <span>{p.name}</span>
                          {isFullLib && (
                            <Badge variant="secondary" className="text-[0.6rem]">biblioteca completa</Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  {(form.watch("plan_ids") ?? []).length === 0 &&
                    !plans.some((p) => Boolean(p.includes_video_library ?? p.includesVideoLibrary)) &&
                    !salesEnabled && (
                      <p className="text-xs text-amber-600">
                        ⚠️ Nadie podrá ver este video. Selecciona planes o activa la compra individual.
                      </p>
                    )}
                </div>
              )}

              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-3">
                  <Switch checked={form.watch("is_published")} onCheckedChange={(v) => form.setValue("is_published", v)} />
                  <Label>Publicado</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.watch("is_featured")} onCheckedChange={(v) => form.setValue("is_featured", v)} />
                  <Label>Destacado</Label>
                </div>
              </div>
            </section>

            {/* ── SALES ──────────────────────────────────────────────── */}
            <section className="space-y-4 rounded-xl border p-5">
              <h2 className="font-semibold">Venta individual</h2>
              <div className="flex items-center gap-3">
                <Switch checked={salesEnabled} onCheckedChange={(v) => form.setValue("sales_enabled", v)} />
                <Label>Activar precio / venta</Label>
              </div>
              {salesEnabled && (
                <div className="space-y-4 pl-2 border-l-2 border-primary/30">
                  <div className="flex items-center gap-3">
                    <Switch checked={form.watch("sales_unlocks_video")} onCheckedChange={(v) => form.setValue("sales_unlocks_video", v)} />
                    <Label>Bloquear video hasta que el pago sea aprobado</Label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Precio (MXN)</Label><Input type="number" {...form.register("sales_price_mxn")} /></div>
                    <div className="space-y-1"><Label>Créditos de clase</Label><Input type="number" {...form.register("sales_class_credits")} /></div>
                  </div>
                  <div className="space-y-1"><Label>Texto del botón CTA</Label><Input {...form.register("sales_cta_text")} placeholder="Comprar acceso" /></div>
                </div>
              )}
            </section>

            <div className="flex gap-3">
              <Button type="submit" disabled={isPending || isUploading || savingThumb} className="flex-1">
                {(isPending || savingThumb) ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
                {savingThumb ? "Subiendo portada…" : editId ? "Guardar cambios" : "Crear video"}
              </Button>
            </div>
          </form>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default VideoUpload;

