import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Users, Clock, RotateCcw, UserX } from "lucide-react";

interface RosterEntry {
  booking_id: string;
  class_id: string;
  status: string;
  checked_in_at: string | null;
  guest_profile_id: string | null;
  user_id: string | null;
  display_name: string | null;
  phone: string | null;
  guest_name: string | null;
  host_name: string | null;
}

interface ClassRow {
  id: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  class_type_name: string;
  class_type_color: string;
  instructor_name: string;
  roster: RosterEntry[];
}

const TodayAttendance = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<{ data: ClassRow[] }>({
    queryKey: ["today-roster"],
    queryFn: async () => (await api.get("/admin/today-roster")).data,
    refetchInterval: 30000,
  });
  const classes = data?.data ?? [];

  const checkinMutation = useMutation({
    mutationFn: (bookingId: string) => api.put(`/bookings/${bookingId}/check-in`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["today-roster"] });
      if (navigator.vibrate) navigator.vibrate(60);
    },
    onError: (e: any) => toast({
      title: "Error al hacer check-in",
      description: e?.response?.data?.message,
      variant: "destructive",
    }),
  });

  const noShowMutation = useMutation({
    mutationFn: (bookingId: string) => api.put(`/bookings/${bookingId}/no-show`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["today-roster"] });
    },
  });

  const labelOf = (r: RosterEntry) =>
    r.guest_name ?? r.display_name ?? "—";

  const isGuest = (r: RosterEntry) => Boolean(r.guest_profile_id);

  const counts = (roster: RosterEntry[]) => ({
    confirmed: roster.filter((r) => r.status === "confirmed").length,
    checked_in: roster.filter((r) => r.status === "checked_in").length,
    no_show: roster.filter((r) => r.status === "no_show").length,
    waitlist: roster.filter((r) => r.status === "waitlist").length,
  });

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-4xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Pasar lista (lista del día)</h1>
              <p className="mt-1 text-sm text-white/45">
                Marca asistencia con un tap. Sin cámara, sin QR. Solo las clases de hoy.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()} className="border-white/15">
              <RotateCcw size={13} className="mr-1.5" /> Actualizar
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : classes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <Clock size={32} className="mx-auto text-white/30 mb-3" />
              <p className="text-sm text-white/60">No hay clases programadas hoy.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {classes.map((c) => {
                const stats = counts(c.roster);
                return (
                  <div key={c.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                    {/* Header de clase */}
                    <div
                      className="px-4 py-3 flex items-center justify-between gap-3 border-b border-white/[0.04]"
                      style={{ background: `linear-gradient(90deg, ${c.class_type_color}25, transparent)` }}
                    >
                      <div>
                        <p className="text-sm font-bold text-white">
                          {c.start_time?.slice(0, 5)} · {c.class_type_name}
                        </p>
                        <p className="text-[11px] text-white/55">
                          {c.instructor_name} · Cupo {stats.confirmed + stats.checked_in}/{c.max_capacity}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                          {stats.checked_in} asistió
                        </Badge>
                        <Badge variant="outline" className="border-[#F58A24]/40 text-[#F58A24]">
                          {stats.confirmed} pendiente{stats.confirmed === 1 ? "" : "s"}
                        </Badge>
                      </div>
                    </div>

                    {/* Roster */}
                    {c.roster.length === 0 ? (
                      <div className="p-4 text-center">
                        <Users size={20} className="mx-auto text-white/25 mb-1.5" />
                        <p className="text-xs text-white/40">Sin reservas para esta clase.</p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-white/[0.04]">
                        {c.roster.map((r) => {
                          const isCheckedIn = r.status === "checked_in";
                          const isNoShow = r.status === "no_show";
                          const isWaitlist = r.status === "waitlist";
                          const name = labelOf(r);
                          const isMutating = checkinMutation.isPending || noShowMutation.isPending;
                          return (
                            <li
                              key={r.booking_id}
                              className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                                isCheckedIn ? "bg-emerald-500/[0.06]" :
                                isNoShow ? "bg-red-500/[0.06] opacity-60" :
                                isWaitlist ? "bg-amber-500/[0.04]" :
                                "hover:bg-white/[0.02]"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm font-medium ${isCheckedIn ? "text-emerald-300" : "text-white"}`}>
                                  {name}
                                  {isGuest(r) && r.host_name && (
                                    <span className="ml-1.5 text-[11px] font-normal text-white/45">
                                      (invitada de {r.host_name})
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-white/45">
                                  {r.phone ?? "—"}
                                  {isWaitlist && <span className="ml-1.5 text-amber-400">· Lista de espera</span>}
                                  {isNoShow && <span className="ml-1.5 text-red-400">· No asistió</span>}
                                  {isCheckedIn && <span className="ml-1.5 text-emerald-400">· ✓ Asistió</span>}
                                </p>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                {!isCheckedIn && !isWaitlist && (
                                  <Button
                                    size="sm"
                                    onClick={() => checkinMutation.mutate(r.booking_id)}
                                    disabled={isMutating}
                                    className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
                                  >
                                    <CheckCircle2 size={14} className="mr-1" />
                                    Check-in
                                  </Button>
                                )}
                                {isCheckedIn && (
                                  <Badge className="h-9 px-3 bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                                    Listo ✓
                                  </Badge>
                                )}
                                {!isCheckedIn && !isNoShow && !isWaitlist && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      if (window.confirm(`¿Marcar a ${name} como NO asistió?`)) {
                                        noShowMutation.mutate(r.booking_id);
                                      }
                                    }}
                                    disabled={isMutating}
                                    className="h-9 border-white/15 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
                                  >
                                    <UserX size={13} />
                                  </Button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default TodayAttendance;
