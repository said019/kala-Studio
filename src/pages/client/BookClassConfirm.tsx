import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Tag,
  PrimaryButton,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import { BackLink, DataRow, StickyCta } from "@/components/app/widgets";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Clock, Users, UserRound } from "lucide-react";

const BookClassConfirm = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: classData, isLoading } = useQuery({
    queryKey: ["class-detail", classId],
    queryFn: async () => (await api.get(`/classes/${classId}`)).data,
  });

  const cls = classData?.data ?? classData ?? null;

  const bookMutation = useMutation({
    mutationFn: () => api.post("/bookings", { classId }),
    onSuccess: (res) => {
      const data = res.data;
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["my-membership"] });
      qc.invalidateQueries({ queryKey: ["public-classes"] });
      if (data?.booking?.status === "waitlist") {
        toast({ title: "Quedaste en lista de espera", description: "Te avisamos si se libera un lugar." });
      } else {
        toast({ title: "Reserva confirmada." });
      }
      navigate("/app/bookings");
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo reservar",
        description: err.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const remaining = cls
    ? Math.max(0, Number(cls.max_capacity ?? 0) - Number(cls.current_bookings ?? 0))
    : 0;
  const isFull = cls && remaining === 0;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/classes" label="Volver al calendario" />
        <PageHeader
          eyebrow="Confirmar reserva"
          title={cls ? <>{cls.class_type_name}</> : <>Cargando…</>}
        />

        {isLoading ? (
          <SkeletonRow height={200} />
        ) : cls ? (
          <>
            <Section>
              <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: KALA.blush }}>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <Tag tint="berry">{cls.level ?? "Todos los niveles"}</Tag>
                  {isFull ? (
                    <Tag tint="coral">Lista de espera</Tag>
                  ) : (
                    <Tag tint="olive">{remaining} {remaining === 1 ? "lugar" : "lugares"}</Tag>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  <DataRow
                    label="Día"
                    value={cls.start_time ? format(safeParse(cls.start_time), "EEEE d 'de' MMMM", { locale: es }) : "—"}
                  />
                  <DataRow
                    label="Hora"
                    value={
                      <>
                        {cls.start_time ? format(safeParse(cls.start_time), "HH:mm") : "—"}
                        {cls.end_time ? ` — ${format(safeParse(cls.end_time), "HH:mm")}` : ""}
                      </>
                    }
                  />
                  <DataRow label="Coach" value={cls.instructor_name ?? "Por confirmar"} />
                  <DataRow label="Cupo" value={`${cls.current_bookings ?? 0} / ${cls.max_capacity}`} />
                </div>
              </div>
            </Section>

            <Section title="Lo que tienes que saber">
              <ul className="list-none m-0 p-0">
                {[
                  { icon: <CalendarDays size={15} />, text: "Llega 10 minutos antes para acomodarte." },
                  { icon: <Clock size={15} />, text: "Cancela mínimo 4 horas antes para no perder la clase." },
                  { icon: <Users size={15} />, text: "Cupos limitados. Si está llena entras a lista de espera." },
                  { icon: <UserRound size={15} />, text: "Trae ropa cómoda y algo para hidratarte." },
                ].map((it, i, arr) => (
                  <li
                    key={i}
                    className="grid grid-cols-[auto_1fr] items-center gap-4 py-3"
                    style={{ borderTop: `1px solid ${KALA.border}`, borderBottom: i === arr.length - 1 ? `1px solid ${KALA.border}` : undefined }}
                  >
                    <span
                      className="grid h-9 w-9 place-items-center rounded-full"
                      style={{ backgroundColor: KALA.blush, color: KALA.berry }}
                    >
                      {it.icon}
                    </span>
                    <span className="text-[0.92rem] leading-[1.55]" style={{ color: KALA.ink, opacity: 0.78 }}>
                      {it.text}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <StickyCta>
              <button
                type="button"
                disabled={bookMutation.isPending}
                onClick={() => bookMutation.mutate()}
                className="w-full inline-flex items-center justify-center gap-3 rounded-full px-7 py-4 text-[0.84rem] font-medium uppercase tracking-[0.18em] transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0 cursor-pointer"
                style={{ backgroundColor: KALA.berry, color: KALA.cream, border: 0 }}
              >
                {bookMutation.isPending
                  ? "Reservando…"
                  : isFull
                    ? "Unirme a la lista de espera"
                    : "Confirmar reserva"}
              </button>
            </StickyCta>
          </>
        ) : (
          <p className="text-[0.95rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
            No encontramos esa clase.
          </p>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default BookClassConfirm;
