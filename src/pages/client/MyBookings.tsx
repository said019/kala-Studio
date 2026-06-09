import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  EmptyState,
  Tag,
  PrimaryButton,
  GhostButton,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import { SegmentedTabs } from "@/components/app/widgets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Star, CalendarDays, X } from "lucide-react";
import type { BookingClient } from "@/types/booking";

type TabId = "upcoming" | "past" | "cancelled";

const STATUS_TINT: Record<string, keyof typeof KALA> = {
  confirmed: "olive",
  waitlist: "coral",
  checked_in: "olive",
  no_show: "destructive",
  cancelled: "destructive",
};
const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmada",
  waitlist: "Lista de espera",
  checked_in: "Asistida",
  no_show: "No asistió",
  cancelled: "Cancelada",
};

const MyBookings = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>("upcoming");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reviewBooking, setReviewBooking] = useState<BookingClient | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => (await api.get("/bookings/my-bookings")).data,
  });

  const { data: tagsData } = useQuery({
    queryKey: ["public-review-tags"],
    queryFn: async () => (await api.get("/public/review-tags")).data,
    staleTime: 1000 * 60 * 10,
  });
  const reviewTags: { id: string; name: string; color: string }[] = Array.isArray(tagsData?.data) ? tagsData.data : [];

  const bookings: BookingClient[] = Array.isArray(bookingsData?.data) ? bookingsData.data : Array.isArray(bookingsData) ? bookingsData : [];
  const now = new Date();

  const { upcoming, past, cancelled } = useMemo(() => {
    const upcoming = bookings.filter((b) =>
      (b.status === "confirmed" || b.status === "waitlist") && new Date(b.start_time) >= now
    );
    const past = bookings.filter((b) =>
      b.status === "checked_in" || b.status === "no_show" || (b.status !== "cancelled" && new Date(b.start_time) < now)
    );
    const cancelled = bookings.filter((b) => b.status === "cancelled");
    return { upcoming, past, cancelled };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/bookings/${id}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["my-membership"] });
      qc.invalidateQueries({ queryKey: ["public-classes"] });
      const serverMsg: string = res?.data?.message || "";
      const creditRestored = res?.data?.creditRestored;
      const wasWaitlist = serverMsg.toLowerCase().includes("lista de espera");
      toast({
        title: wasWaitlist ? "Saliste de la lista de espera" : "Reserva cancelada",
        description: wasWaitlist
          ? "Nunca se descontó crédito. Puedes volver a unirte cuando quieras."
          : creditRestored
            ? "Tu clase regresó al paquete."
            : "La clase no se devuelve, fue cancelación tardía.",
      });
      setCancelId(null);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || "No se pudo cancelar.";
      toast({ title: "No pudimos cancelar", description: msg, variant: "destructive" });
      setCancelId(null);
    },
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      api.post("/reviews", {
        bookingId: reviewBooking?.id,
        rating,
        comment,
        tagIds: selectedTags,
      }),
    onSuccess: () => {
      toast({ title: "Gracias por tu reseña." });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      setReviewBooking(null);
      setComment("");
      setSelectedTags([]);
      setRating(5);
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) {
        qc.invalidateQueries({ queryKey: ["my-bookings"] });
        setReviewBooking(null);
      }
      const msg = err?.response?.data?.message || "No se pudo enviar la reseña.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const list = tab === "upcoming" ? upcoming : tab === "past" ? past : cancelled;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Mis reservas"
          title={<>Tus clases</>}
          titleAccent="en Kala."
        />

        <SegmentedTabs<TabId>
          value={tab}
          onChange={setTab}
          options={[
            { value: "upcoming", label: "Próximas", count: upcoming.length },
            { value: "past", label: "Pasadas", count: past.length },
            { value: "cancelled", label: "Canceladas", count: cancelled.length },
          ]}
        />

        <Section>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <SkeletonRow key={i} />)}
            </div>
          ) : list.length === 0 ? (
            tab === "upcoming" ? (
              <EmptyState
                icon={<CalendarDays size={20} />}
                title="No tienes clases reservadas."
                description="Cinco lugares por sesión. Reserva la tuya."
                ctaLabel="Reservar clase"
                ctaTo="/app/classes"
              />
            ) : tab === "past" ? (
              <EmptyState
                title="Todavía no tienes historial."
                description="Aquí van a aparecer las clases ya tomadas."
              />
            ) : (
              <EmptyState
                title="Sin cancelaciones."
                description="Cuando canceles una clase, aparece aquí."
              />
            )
          ) : (
            <ListGroup>
              {list.map((b) => {
                const isPast = new Date(b.start_time) < new Date();
                const hasReview = Boolean(b.has_review);
                // Las reservas en lista de espera SIEMPRE se pueden abandonar
                // (nunca se cobró crédito, no aplica la ventana de cancelación).
                const isCancellable = (b.status === "confirmed" || b.status === "waitlist") && !isPast;
                const canReview = isPast && b.status === "checked_in" && !hasReview;
                return (
                  <ListRow
                    key={b.id}
                    icon={<CalendarDays size={17} strokeWidth={1.7} />}
                    iconTint={STATUS_TINT[b.status] ?? "berry"}
                    title={b.class_type_name ?? "Clase"}
                    description={
                      <>
                        {b.start_time ? format(safeParse(b.start_time), "EEE d MMM · HH:mm", { locale: es }) : "—"}
                        {b.instructor_name ? ` · ${b.instructor_name}` : ""}
                      </>
                    }
                    trailing={
                      <div className="flex items-center gap-2">
                        <Tag tint={STATUS_TINT[b.status] ?? "berry"}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </Tag>
                        {isCancellable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCancelId(b.id);
                            }}
                            aria-label="Cancelar reserva"
                            className="grid h-8 w-8 place-items-center rounded-full bg-transparent border-0 cursor-pointer transition-colors"
                            style={{ color: KALA.destructive, border: `1px solid ${KALA.destructive}30` }}
                          >
                            <X size={13} />
                          </button>
                        )}
                        {canReview && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setReviewBooking(b);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.66rem] uppercase tracking-[0.16em] bg-transparent cursor-pointer transition-colors"
                            style={{ border: `1px solid ${KALA.berry}`, color: KALA.berry }}
                          >
                            <Star size={11} /> Reseña
                          </button>
                        )}
                        {hasReview && (
                          <Tag tint="olive">Reseña enviada</Tag>
                        )}
                      </div>
                    }
                  />
                );
              })}
            </ListGroup>
          )}
        </Section>

        {/* Cancel confirm */}
        {(() => {
          const cancelTarget = cancelId ? bookings.find((b) => b.id === cancelId) : null;
          const isWaitlistCancel = cancelTarget?.status === "waitlist";
          return (
            <AlertDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isWaitlistCancel ? "¿Salir de la lista de espera?" : "¿Cancelar reserva?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {isWaitlistCancel
                      ? "No pasa nada: nunca se descontó crédito de tu paquete. Puedes volver a unirte cuando quieras."
                      : "Si cancelas con menos de 4 horas, tu clase no regresa al paquete."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Volver</AlertDialogCancel>
                  <AlertDialogAction
                    style={{ backgroundColor: KALA.destructive, color: KALA.cream }}
                    onClick={() => cancelId && cancelMutation.mutate(cancelId)}
                  >
                    {isWaitlistCancel ? "Sí, salir" : "Sí, cancelar"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        })()}

        {/* Review dialog */}
        <Dialog
          open={!!reviewBooking}
          onOpenChange={(o) => {
            if (!o) {
              setReviewBooking(null);
              setSelectedTags([]);
              setComment("");
              setRating(5);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reseña · {reviewBooking?.class_type_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div>
                <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] mb-2" style={{ color: KALA.ink, opacity: 0.6 }}>
                  Calificación
                </p>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRating(s)}
                      className="bg-transparent border-0 cursor-pointer p-1"
                      aria-label={`${s} estrellas`}
                    >
                      <Star
                        size={26}
                        strokeWidth={1.5}
                        style={{
                          color: s <= rating ? KALA.orange : KALA.ink,
                          opacity: s <= rating ? 1 : 0.3,
                          fill: s <= rating ? KALA.orange : "transparent",
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
              {reviewTags.length > 0 && (
                <div>
                  <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] mb-2" style={{ color: KALA.ink, opacity: 0.6 }}>
                    ¿Qué te gustó?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {reviewTags.map((tag) => {
                      const isSel = selectedTags.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() =>
                            setSelectedTags((prev) =>
                              isSel ? prev.filter((t) => t !== tag.id) : [...prev, tag.id]
                            )
                          }
                          className="rounded-full px-3 py-1.5 text-[0.74rem] cursor-pointer transition-colors"
                          style={{
                            backgroundColor: isSel ? `${KALA.berry}1a` : "transparent",
                            border: `1px solid ${isSel ? KALA.berry : KALA.border}`,
                            color: isSel ? KALA.berry : KALA.ink,
                            fontWeight: isSel ? 600 : 400,
                          }}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] mb-2" style={{ color: KALA.ink, opacity: 0.6 }}>
                  Comentario (opcional)
                </p>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Cuéntanos cómo fue tu clase."
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <GhostButton onClick={() => setReviewBooking(null)}>Cancelar</GhostButton>
              <PrimaryButton onClick={() => reviewMutation.mutate()} loading={reviewMutation.isPending} loadingLabel="Enviando…">
                Enviar reseña
              </PrimaryButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default MyBookings;
