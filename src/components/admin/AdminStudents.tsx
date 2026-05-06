import { useEffect, useState } from "react";
import api from "@/lib/api";

type StudentRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  package_id: string | null;
  classes_remaining: number | null;
  notes: string | null;
  is_active: boolean;
};

type PackageRow = {
  id: string;
  category: string;
  num_classes: string;
  price: number;
  sort_order: number;
};

const AdminStudents = () => {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", package_id: "", classes_remaining: 0, notes: "" });
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    const [sr, pr] = await Promise.all([
      api.get<{ data: StudentRow[] }>("/clients?sort=display_name"),
      api.get<{ data: PackageRow[] }>("/plans?is_active=true"),
    ]);
    if (sr.data?.data) setStudents(sr.data.data);
    if (pr.data?.data) setPackages(pr.data.data);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    if (!form.full_name.trim()) return;
    const payload = {
      display_name: form.full_name,
      phone: form.phone || null,
      email: form.email || null,
      plan_id: form.package_id || null,
      classes_remaining: form.classes_remaining,
      notes: form.notes || null,
    };
    if (editId) {
      await api.put(`/users/${editId}`, payload);
    } else {
      await api.post("/clients", payload);
    }
    setForm({ full_name: "", phone: "", email: "", package_id: "", classes_remaining: 0, notes: "" });
    setEditId(null); setShowForm(false);
    fetchData();
  };

  const handleEdit = (s: StudentRow) => {
    setEditId(s.id);
    setForm({ full_name: s.full_name, phone: s.phone || "", email: s.email || "", package_id: s.package_id || "", classes_remaining: s.classes_remaining || 0, notes: s.notes || "" });
    setShowForm(true);
  };

  const toggleActive = async (s: StudentRow) => {
    await api.patch(`/users/${s.id}`, { is_active: !s.is_active });
    fetchData();
  };

  const getPackageLabel = (pkgId: string | null) => {
    if (!pkgId) return "Sin paquete";
    const pkg = packages.find(p => p.id === pkgId);
    return pkg ? `${pkg.category} · ${pkg.num_classes} clases` : "—";
  };

  const filtered = students.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone && s.phone.includes(search))
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-syne font-bold text-xl">Alumnas inscritas</h2>
        <button
          onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ full_name: "", phone: "", email: "", package_id: "", classes_remaining: 0, notes: "" }); }}
          className="bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {showForm ? "Cerrar" : "+ Nueva alumna"}
        </button>
      </div>

      {showForm && (
        <div className="bg-secondary border border-border rounded-2xl p-6 mb-8">
          <h3 className="text-sm font-medium mb-4">{editId ? "Editar alumna" : "Registrar alumna"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Nombre completo" className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Teléfono" className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email (opcional)" className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
            <select value={form.package_id} onChange={(e) => setForm({ ...form, package_id: e.target.value })} className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary">
              <option value="">Sin paquete</option>
              {packages.map(p => (
                <option key={p.id} value={p.id}>{p.category} — {p.num_classes} clases (${p.price})</option>
              ))}
            </select>
            <input value={form.classes_remaining} onChange={(e) => setForm({ ...form, classes_remaining: Number(e.target.value) })} placeholder="Clases restantes" type="number" className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notas" className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
          </div>
          <button onClick={handleSave} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity mt-4">
            {editId ? "Actualizar" : "Registrar"}
          </button>
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre o teléfono..."
        className="bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-full mb-4"
      />

      <div className="bg-secondary border border-border rounded-2xl overflow-hidden">
        <div className="hidden sm:grid grid-cols-[2fr_1fr_1.5fr_1fr_auto] gap-4 px-5 py-3 border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
          <span>Nombre</span>
          <span>Teléfono</span>
          <span>Paquete</span>
          <span>Clases rest.</span>
          <span>Acciones</span>
        </div>
        {filtered.length === 0 && (
          <div className="px-5 py-8 text-center text-muted-foreground text-sm">No hay alumnas registradas</div>
        )}
        {filtered.map((s) => (
          <div key={s.id} className={`grid grid-cols-1 sm:grid-cols-[2fr_1fr_1.5fr_1fr_auto] gap-2 sm:gap-4 px-5 py-4 border-b border-border/50 last:border-b-0 items-center ${!s.is_active ? "opacity-40" : ""}`}>
            <div>
              <span className="font-medium text-sm">{s.full_name}</span>
              {s.email && <span className="text-xs text-muted-foreground block">{s.email}</span>}
            </div>
            <span className="text-sm text-muted-foreground">{s.phone || "—"}</span>
            <span className="text-xs text-muted-foreground">{getPackageLabel(s.package_id)}</span>
            <span className={`text-sm font-medium ${(s.classes_remaining || 0) <= 2 ? "text-destructive" : "text-primary"}`}>
              {s.classes_remaining ?? 0}
            </span>
            <div className="flex gap-2">
              <button onClick={() => handleEdit(s)} className="text-xs text-primary hover:text-primary/80">Editar</button>
              <button onClick={() => toggleActive(s)} className="text-xs text-muted-foreground hover:text-foreground">{s.is_active ? "Desact." : "Activar"}</button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3">Total: {filtered.length} alumna(s)</p>
    </div>
  );
};

export default AdminStudents;
