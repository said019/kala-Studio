import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

interface ScheduleSlot {
  id: string;
  time_slot: string;
  day_of_week: number;
  class_label: "JUMPING" | "PILATES" | "SORPRESA";
  shift: "morning" | "evening";
  is_active: boolean;
}

const DAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

const LABEL_STYLE: Record<string, string> = {
  JUMPING: "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30",
  PILATES: "bg-pink-500/20 text-pink-300 border border-pink-500/30",
  SORPRESA: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
};

const AdminSchedule = () => {
  const qc = useQueryClient();

  const [timeSlot, setTimeSlot] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [classLabel, setClassLabel] = useState<"JUMPING" | "PILATES" | "SORPRESA">("JUMPING");
  const [shift, setShift] = useState<"morning" | "evening">("morning");
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: slots = [], isLoading } = useQuery<ScheduleSlot[]>({
    queryKey: ["admin-schedule"],
    queryFn: async () => {
      const res = await api.get<{ data: ScheduleSlot[] }>("/admin/schedule");
      return res.data.data ?? [];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (payload: Omit<ScheduleSlot, "id" | "is_active">) => {
      if (editId) {
        return api.put(`/admin/schedule/${editId}`, payload);
      }
      return api.post("/admin/schedule", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule"] });
      resetForm();
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/admin/schedule/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule"] });
      setDeleteId(null);
    },
  });

  const resetForm = () => {
    setTimeSlot("");
    setDayOfWeek(1);
    setClassLabel("JUMPING");
    setShift("morning");
    setEditId(null);
    setSaving(false);
  };

  const startEdit = (slot: ScheduleSlot) => {
    setEditId(slot.id);
    setTimeSlot(slot.time_slot);
    setDayOfWeek(slot.day_of_week);
    setClassLabel(slot.class_label);
    setShift(slot.shift);
  };

  const handleSave = async () => {
    if (!timeSlot.trim()) return;
    setSaving(true);
    saveMut.mutate({ time_slot: timeSlot.trim(), day_of_week: dayOfWeek, class_label: classLabel, shift });
  };

  const morningSlots = slots.filter((s) => s.shift === "morning");
  const eveningSlots = slots.filter((s) => s.shift === "evening");

  const getUniqueTimes = (list: ScheduleSlot[]) =>
    [...new Set(list.map((s) => s.time_slot))].sort();

  const getCell = (list: ScheduleSlot[], time: string, day: number) =>
    list.find((s) => s.time_slot === time && s.day_of_week === day);

  const renderGrid = (title: string, list: ScheduleSlot[]) => {
    const times = getUniqueTimes(list);
    return (
      <div className="mb-8">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">{title}</h3>
        {times.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sin horarios registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-muted-foreground text-xs">HORA</th>
                  {DAYS.map((d) => (
                    <th key={d} className="text-center py-2 px-3 text-muted-foreground text-xs">{d}</th>
                  ))}
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {times.map((time) => (
                  <tr key={time} className="border-b border-border/50">
                    <td className="py-3 px-3 font-medium text-foreground whitespace-nowrap">{time}</td>
                    {[1, 2, 3, 4, 5, 6].map((day) => {
                      const cell = getCell(list, time, day);
                      return (
                        <td key={day} className="text-center py-3 px-2">
                          {cell ? (
                            <button
                              onClick={() => startEdit(cell)}
                              className={`text-xs font-semibold px-2 py-1 rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${LABEL_STYLE[cell.class_label]}`}
                            >
                              {cell.class_label}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setTimeSlot(time);
                                setDayOfWeek(day);
                                setShift(list === morningSlots ? "morning" : "evening");
                                setEditId(null);
                                setClassLabel("JUMPING");
                              }}
                              className="text-muted-foreground/30 hover:text-muted-foreground text-lg leading-none transition-colors"
                            >
                              +
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-3 px-2 text-right">
                      {list
                        .filter((s) => s.time_slot === time)
                        .map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setDeleteId(s.id)}
                            className="text-destructive hover:opacity-70 text-xs ml-1"
                            title={`Eliminar ${DAY_LABELS[s.day_of_week]} ${s.time_slot}`}
                          >
                            x
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const DAY_LABELS: Record<number, string> = { 1: "LUN", 2: "MAR", 3: "MIÉ", 4: "JUE", 5: "VIE", 6: "SÁB" };

  return (
    <div>
      <h2 className="font-syne font-bold text-xl mb-6">Horarios semanales</h2>
      <p className="text-xs text-muted-foreground mb-6">
        Haz clic en una celda para editarla, o en + para agregar esa combinacion.
      </p>

      {/* Form */}
      <div className="bg-secondary border border-border rounded-2xl p-6 mb-8">
        <h3 className="text-sm font-medium mb-4">{editId ? "Editar slot" : "Agregar slot"}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <input
            value={timeSlot}
            onChange={(e) => setTimeSlot(e.target.value)}
            placeholder="Ej: 7:00am"
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i + 1}>{d}</option>
            ))}
          </select>
          <select
            value={classLabel}
            onChange={(e) => setClassLabel(e.target.value as "JUMPING" | "PILATES" | "SORPRESA")}
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            <option value="JUMPING">JUMPING</option>
            <option value="PILATES">PILATES</option>
            <option value="SORPRESA">SORPRESA</option>
          </select>
          <select
            value={shift}
            onChange={(e) => setShift(e.target.value as "morning" | "evening")}
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            <option value="morning">Manana</option>
            <option value="evening">Tarde</option>
          </select>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={handleSave}
            disabled={saving || saveMut.isPending}
            className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saveMut.isPending ? "Guardando..." : editId ? "Actualizar" : "Agregar"}
          </button>
          {editId && (
            <button
              onClick={resetForm}
              className="border border-border text-foreground px-6 py-2 rounded-xl text-sm hover:bg-secondary transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="bg-secondary border border-border rounded-2xl p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando horarios...</p>
        ) : (
          <>
            {renderGrid("Turno Manana", morningSlots)}
            {renderGrid("Turno Tarde", eveningSlots)}
          </>
        )}
      </div>

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-foreground mb-2">Eliminar slot</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Esta accion no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMut.mutate(deleteId)}
                disabled={deleteMut.isPending}
                className="bg-destructive text-destructive-foreground px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {deleteMut.isPending ? "Eliminando..." : "Eliminar"}
              </button>
              <button
                onClick={() => setDeleteId(null)}
                className="border border-border text-foreground px-4 py-2 rounded-xl text-sm hover:bg-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSchedule;
