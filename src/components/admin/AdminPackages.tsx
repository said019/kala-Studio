import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

interface Package {
  id: string;
  name: string;
  num_classes: string;
  price: number;
  category: "jumping" | "pilates" | "mixtos";
  validity_days: number;
  is_active: boolean;
  sort_order: number;
}

const CATEGORIES: { key: Package["category"]; label: string }[] = [
  { key: "jumping", label: "Paquetes Jumping" },
  { key: "pilates", label: "Paquetes Pilates" },
  { key: "mixtos", label: "Paquetes Mixtos" },
];

const AdminPackages = () => {
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [numClasses, setNumClasses] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<Package["category"]>("jumping");
  const [validityDays, setValidityDays] = useState("30");
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: packages = [], isLoading } = useQuery<Package[]>({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const res = await api.get<{ data: Package[] }>("/packages");
      return res.data.data ?? [];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (payload: Omit<Package, "id" | "sort_order">) => {
      if (editId) {
        return api.put(`/admin/packages/${editId}`, payload);
      }
      return api.post("/admin/packages", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-packages"] });
      resetForm();
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      return api.put(`/admin/packages/${id}`, { is_active });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-packages"] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/admin/packages/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-packages"] });
      setDeleteId(null);
    },
  });

  const resetForm = () => {
    setName(""); setNumClasses(""); setPrice(""); setCategory("jumping"); setValidityDays("30"); setEditId(null);
  };

  const startEdit = (p: Package) => {
    setEditId(p.id);
    setName(p.name ?? "");
    setNumClasses(String(p.num_classes));
    setPrice(String(p.price));
    setCategory(p.category);
    setValidityDays(String(p.validity_days ?? 30));
  };

  const handleSave = () => {
    if (!numClasses.trim() || !price.trim()) return;
    saveMut.mutate({
      name: name.trim() || `${numClasses} clases`,
      num_classes: numClasses.trim(),
      price: Number(price),
      category,
      validity_days: Number(validityDays) || 30,
      is_active: true,
    });
  };

  const CATEGORY_BADGE: Record<Package["category"], string> = {
    jumping: "bg-fuchsia-500/20 text-fuchsia-300",
    pilates: "bg-pink-500/20 text-pink-300",
    mixtos: "bg-violet-500/20 text-violet-300",
  };

  return (
    <div>
      <h2 className="font-syne font-bold text-xl mb-6">Paquetes de clases</h2>

      {/* Form */}
      <div className="bg-secondary border border-border rounded-2xl p-6 mb-8">
        <h3 className="text-sm font-medium mb-4">{editId ? "Editar paquete" : "Agregar paquete"}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (opcional)"
            className="col-span-2 sm:col-span-3 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <input
            value={numClasses}
            onChange={(e) => setNumClasses(e.target.value)}
            placeholder='Ej: 4, 8, ILIMITADO'
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Precio (MXN)"
            type="number"
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <input
            value={validityDays}
            onChange={(e) => setValidityDays(e.target.value)}
            placeholder="Vigencia (dias)"
            type="number"
            className="bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Package["category"])}
            className="col-span-2 sm:col-span-3 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            <option value="jumping">Jumping</option>
            <option value="pilates">Pilates</option>
            <option value="mixtos">Mixtos</option>
          </select>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={handleSave}
            disabled={saveMut.isPending}
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

      {/* Lists by category */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando paquetes...</p>
      ) : (
        CATEGORIES.map(({ key, label }) => {
          const catPkgs = packages.filter((p) => p.category === key);
          return (
            <div key={key} className="mb-8">
              <h3 className="font-syne font-bold text-base mb-3">{label}</h3>
              {catPkgs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-2">Sin paquetes aun.</p>
              ) : (
                <div className="bg-secondary border border-border rounded-2xl overflow-hidden">
                  {catPkgs.map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between px-5 py-4 border-b border-border/50 last:border-b-0 transition-opacity ${p.is_active ? "" : "opacity-40"}`}
                    >
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="font-medium text-sm min-w-[80px]">{p.num_classes} clases</span>
                        <span className="font-bebas text-2xl text-primary">${Number(p.price).toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground">{p.validity_days ?? 30} dias</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_BADGE[p.category]}`}>
                          {p.category}
                        </span>
                        {p.name && <span className="text-xs text-muted-foreground">{p.name}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleMut.mutate({ id: p.id, is_active: !p.is_active })}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          title={p.is_active ? "Ocultar" : "Mostrar"}
                        >
                          {p.is_active ? "Ocultar" : "Mostrar"}
                        </button>
                        <button
                          onClick={() => startEdit(p)}
                          className="text-xs text-primary hover:opacity-70 transition-opacity"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setDeleteId(p.id)}
                          className="text-xs text-destructive hover:opacity-70 transition-opacity"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-2xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-foreground mb-2">Eliminar paquete</h3>
            <p className="text-sm text-muted-foreground mb-6">Esta accion no se puede deshacer.</p>
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

export default AdminPackages;
