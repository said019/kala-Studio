import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

interface ClassType {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  category: "jumping" | "pilates" | "mixto";
  intensity: "ligera" | "media" | "pesada" | "todas";
  color: string;
  emoji: string;
  level: string;
  duration_min: number;
  capacity: number;
  is_active: boolean;
  sort_order: number;
}

const INTENSITIES = [
  { value: "ligera", label: "🟢 Ligera" },
  { value: "media",  label: "🟡 Media" },
  { value: "pesada", label: "🔴 Pesada" },
  { value: "todas",  label: "⚪ Todas" },
];

const CATEGORIES = [
  { value: "jumping", label: "🏃 Jumping", badge: "bg-fuchsia-500/20 text-fuchsia-400" },
  { value: "pilates", label: "🧘 Pilates", badge: "bg-pink-500/20 text-pink-400" },
  { value: "mixto",   label: "🔀 Mixto",   badge: "bg-violet-500/20 text-violet-400" },
];

const INTENSITY_BADGE: Record<string, string> = {
  ligera: "bg-green-500/15 text-green-400",
  media:  "bg-yellow-500/15 text-yellow-400",
  pesada: "bg-red-500/15 text-red-400",
  todas:  "bg-foreground/10 text-foreground",
};

const EMPTY = {
  name: "", subtitle: "", description: "",
  category: "jumping" as ClassType["category"],
  intensity: "media" as ClassType["intensity"],
  color: "#c026d3", emoji: "🏃",
  level: "Todos los niveles", duration_min: 50, capacity: 15,
  sort_order: 0,
};

const AdminClasses = () => {
  const qc = useQueryClient();

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["admin-class-types"],
    queryFn: () => api.get<{ data: ClassType[] }>("/admin/class-types").then(r => r.data),
  });
  const classes: ClassType[] = Array.isArray(rawData?.data) ? rawData.data : [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-class-types"] });

  const saveMut = useMutation({
    mutationFn: (body: typeof EMPTY & { id?: string }) => {
      const { id, ...rest } = body;
      return id
        ? api.put(`/admin/class-types/${id}`, rest).then(r => r.data)
        : api.post("/admin/class-types", rest).then(r => r.data);
    },
    onSuccess: () => { invalidate(); resetForm(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/class-types/${id}`).then(r => r.data),
    onSuccess: invalidate,
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/admin/class-types/${id}`, { is_active }).then(r => r.data),
    onSuccess: invalidate,
  });

  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [expandDesc, setExpandDesc] = useState(false);

  const set = (key: keyof typeof EMPTY, val: string | number) =>
    setForm(p => ({ ...p, [key]: val }));

  function startEdit(c: ClassType) {
    setEditId(c.id);
    setForm({
      name: c.name, subtitle: c.subtitle ?? "", description: c.description ?? "",
      category: c.category, intensity: c.intensity,
      color: c.color, emoji: c.emoji ?? "🏃",
      level: c.level ?? "Todos los niveles",
      duration_min: c.duration_min ?? 50, capacity: c.capacity ?? 15,
      sort_order: c.sort_order,
    });
    setExpandDesc(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() { setEditId(null); setForm(EMPTY); setExpandDesc(false); }

  function handleSave() {
    if (!form.name.trim()) return;
    saveMut.mutate({ ...form, sort_order: Number(form.sort_order), ...(editId ? { id: editId } : {}) });
  }

  const groups = [
    { label: "🏃 Jumping", items: classes.filter(c => c.category === "jumping") },
    { label: "🧘 Pilates", items: classes.filter(c => c.category === "pilates") },
    { label: "🔀 Mixto",   items: classes.filter(c => c.category === "mixto")   },
  ];

  return (
    <div>
      <h2 className="font-syne font-bold text-xl mb-1">Clases disponibles</h2>
      <p className="text-muted-foreground text-sm mb-6">Gestiona los tipos de clase que ofrece el estudio.</p>

      {/* Form */}
      <div className="bg-secondary border border-border rounded-2xl p-6 mb-8">
        <h3 className="text-sm font-semibold mb-4">{editId ? "✏️ Editar clase" : "➕ Agregar clase"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input
            value={form.name} onChange={e => set("name", e.target.value)}
            placeholder="Nombre  ej: Jumping Fitness"
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary sm:col-span-2"
          />
          <input
            value={form.subtitle} onChange={e => set("subtitle", e.target.value)}
            placeholder="Subtítulo  ej: Full Body"
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          />
          <div className="flex gap-2 items-center">
            <input
              value={form.emoji} onChange={e => set("emoji", e.target.value)}
              placeholder="🏃" className="w-14 bg-background border border-border rounded-xl px-3 py-2.5 text-lg text-center focus:outline-none focus:border-primary"
            />
            <input
              type="color" value={form.color} onChange={e => set("color", e.target.value)}
              className="w-12 h-[42px] rounded-xl border border-border bg-background cursor-pointer"
            />
            <span className="text-xs text-muted-foreground">{form.color}</span>
          </div>
          <select
            value={form.category} onChange={e => set("category", e.target.value)}
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select
            value={form.intensity} onChange={e => set("intensity", e.target.value)}
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          >
            {INTENSITIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
          <input
            value={form.duration_min} onChange={e => set("duration_min", Number(e.target.value))}
            placeholder="Duración (min)" type="number" min={15} max={120}
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          />
          <input
            value={form.capacity} onChange={e => set("capacity", Number(e.target.value))}
            placeholder="Capacidad máx." type="number" min={1} max={100}
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          />
          <input
            value={form.sort_order} onChange={e => set("sort_order", e.target.value)}
            placeholder="Orden (1, 2…)" type="number" min={0}
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <button type="button" onClick={() => setExpandDesc(p => !p)} className="text-xs text-primary mb-2 hover:underline">
          {expandDesc ? "▲ Ocultar descripción" : "▼ Agregar descripción"}
        </button>
        {expandDesc && (
          <textarea
            value={form.description} onChange={e => set("description", e.target.value)}
            rows={3} placeholder="Descripción larga (se muestra en landing y portal)"
            className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary resize-none mb-3"
          />
        )}
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleSave} disabled={saveMut.isPending}
            className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saveMut.isPending ? "Guardando…" : editId ? "Actualizar" : "Agregar"}
          </button>
          {editId && (
            <button onClick={resetForm} className="text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
          )}
        </div>
        {saveMut.isError && (
          <p className="text-destructive text-xs mt-2">{(saveMut.error as Error).message}</p>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando clases…</p>
      ) : classes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay clases. Agrega la primera arriba.</p>
      ) : (
        groups.map(({ label, items }) =>
          items.length > 0 && (
            <div key={label} className="mb-8">
              <h3 className="font-syne font-bold text-base mb-3">{label}</h3>
              <div className="space-y-2">
                {items.map(c => (
                  <div key={c.id} className={`bg-secondary border border-border rounded-xl px-5 py-4 flex items-center gap-4 ${!c.is_active ? "opacity-40" : ""}`}>
                    <span className="text-2xl flex-shrink-0">{c.emoji}</span>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{c.name}</span>
                        {c.subtitle && <span className="text-muted-foreground text-xs">— {c.subtitle}</span>}
                        <span className={`text-[0.6rem] px-2 py-0.5 rounded-full uppercase tracking-wider font-medium ${CATEGORIES.find(x => x.value === c.category)?.badge ?? ""}`}>
                          {c.category}
                        </span>
                        <span className={`text-[0.6rem] px-2 py-0.5 rounded-full uppercase tracking-wider font-medium ${INTENSITY_BADGE[c.intensity] ?? ""}`}>
                          {c.intensity}
                        </span>
                      </div>
                      {c.description && <p className="text-muted-foreground text-xs mt-1 truncate max-w-lg">{c.description}</p>}
                      <div className="flex gap-3 mt-1">
                        <span className="text-[0.7rem] text-muted-foreground">⏱ {c.duration_min} min</span>
                        <span className="text-[0.7rem] text-muted-foreground">👥 Max. {c.capacity}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleMut.mutate({ id: c.id, is_active: !c.is_active })}
                        className={`text-xs px-3 py-1 rounded-lg border transition-colors ${c.is_active ? "border-border text-muted-foreground hover:text-foreground" : "border-primary/40 text-primary"}`}
                      >
                        {c.is_active ? "Ocultar" : "Activar"}
                      </button>
                      <button
                        onClick={() => startEdit(c)}
                        className="text-xs px-3 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => { if (window.confirm(`¿Eliminar "${c.name}"?`)) deleteMut.mutate(c.id); }}
                        className="text-xs px-3 py-1 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )
      )}

      <p className="text-xs text-muted-foreground mt-4">
        💡 Cada semana cambian los <strong>tipos</strong> de clase impartidos según el horario semanal.
      </p>
    </div>
  );
};

export default AdminClasses;
