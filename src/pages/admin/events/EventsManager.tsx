import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import { StudioEvent } from "./types";
import EventListView from "./EventListView";
import EventDetailView from "./EventDetailView";
import CreateEventView from "./CreateEventView";

type View = "list" | "detail" | "create" | "edit";

export default function EventsManager() {
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<StudioEvent | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Query ──
  const { data: events = [], isLoading } = useQuery<StudioEvent[]>({
    queryKey: ["admin-events"],
    queryFn: async () => (await api.get("/events/admin/all")).data,
  });

  // ── Helpers ──
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-events"] });

  // Refresh selected event from new data
  const refreshSelected = (newEvents: StudioEvent[]) => {
    if (selected) {
      const updated = newEvents.find((e) => e.id === selected.id);
      if (updated) setSelected(updated);
    }
  };

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post("/events", payload),
    onSuccess: (_, vars) => {
      invalidate();
      const s = (vars as Record<string, unknown>).status;
      toast({ title: s === "published" ? "🎉 ¡Evento publicado!" : "📝 Borrador guardado" });
      setView("list");
    },
    onError: () => toast({ title: "Error al guardar evento", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.put(`/events/${id}`, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-events"] });
      toast({ title: "✅ Evento actualizado" });
      setView("detail");
    },
    onError: () => toast({ title: "Error al actualizar evento", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/events/${id}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "🗑️ Evento eliminado" });
      setView("list");
      setSelected(null);
    },
    onError: () => toast({ title: "Error al eliminar evento", variant: "destructive" }),
  });

  const updateRegMutation = useMutation({
    mutationFn: ({ eventId, regId, status, notes }: { eventId: string; regId: string; status: string; notes?: string }) =>
      api.put(`/events/${eventId}/registrations/${regId}`, { status, notes }),
    onSuccess: (_, { status }) => {
      invalidate();
      const msgs: Record<string, string> = {
        confirmed: "✅ Inscripción confirmada",
        cancelled: "❌ Inscripción cancelada",
      };
      toast({ title: msgs[status] ?? "Inscripción actualizada" });
    },
    onError: () => toast({ title: "Error al actualizar inscripción", variant: "destructive" }),
  });

  const checkinMutation = useMutation({
    mutationFn: ({ eventId, regId }: { eventId: string; regId: string }) =>
      api.post(`/events/${eventId}/checkin/${regId}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "✅ Check-in exitoso" });
    },
    onError: () => toast({ title: "Error en check-in", variant: "destructive" }),
  });

  const scanCheckinMutation = useMutation({
    mutationFn: ({ eventId, code }: { eventId: string; code: string }) =>
      api.post(`/events/${eventId}/checkin/scan`, { code }),
    onSuccess: (resp) => {
      invalidate();
      const data = (resp as any)?.data?.data ?? {};
      const name = data?.name ? `: ${data.name}` : "";
      toast({ title: data?.alreadyCheckedIn ? `ℹ️ Ya estaba registrada${name}` : `✅ Check-in por QR${name}` });
    },
    onError: (err: any) =>
      toast({ title: err?.response?.data?.message ?? "Error al validar QR", variant: "destructive" }),
  });

  // ── Render ──
  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-48 rounded-xl" />
              <Skeleton className="h-48 rounded-2xl" />
              <Skeleton className="h-48 rounded-2xl" />
            </div>
          ) : (
            <>
              {/* List view */}
              {view === "list" && (
                <EventListView
                  events={events}
                  onCreateNew={() => setView("create")}
                  onSelect={(ev) => { setSelected(ev); setView("detail"); }}
                />
              )}

              {/* Detail view */}
              {view === "detail" && selected && (
                <EventDetailView
                  event={
                    // Always use freshest data
                    events.find((e) => e.id === selected.id) ?? selected
                  }
                  onBack={() => { setView("list"); setSelected(null); }}
                  onEdit={() => setView("edit")}
                  onUpdateStatus={(status) =>
                    updateMutation.mutate({ id: selected.id, payload: { status } })
                  }
                  onConfirmReg={(regId) =>
                    updateRegMutation.mutate({ eventId: selected.id, regId, status: "confirmed" })
                  }
                  onCancelReg={(regId) =>
                    updateRegMutation.mutate({ eventId: selected.id, regId, status: "cancelled" })
                  }
                  onCheckin={(regId) =>
                    checkinMutation.mutate({ eventId: selected.id, regId })
                  }
                  onScanCheckin={async (code) => {
                    const resp = await scanCheckinMutation.mutateAsync({ eventId: selected.id, code });
                    return (resp as any)?.data?.data ?? null;
                  }}
                  onDelete={() => deleteMutation.mutate(selected.id)}
                />
              )}

              {/* Create view */}
              {view === "create" && (
                <CreateEventView
                  onCancel={() => setView("list")}
                  onSave={(payload, status) =>
                    createMutation.mutate({ ...payload, status })
                  }
                />
              )}

              {/* Edit view */}
              {view === "edit" && selected && (
                <CreateEventView
                  initialData={events.find((e) => e.id === selected.id) ?? selected}
                  onCancel={() => setView("detail")}
                  onSave={(payload, _) =>
                    updateMutation.mutate({ id: selected.id, payload })
                  }
                />
              )}
            </>
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
