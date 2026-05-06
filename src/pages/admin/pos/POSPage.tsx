import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Plus, Search, Trash2, Minus } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

const productSchema = z.object({
  name: z.string().min(1),
  price: z.coerce.number().min(0),
  category: z.enum(["suplementos", "ropa", "accesorios"]),
  stock: z.coerce.number().min(0),
  sku: z.string().optional(),
  isActive: z.boolean().default(true),
});
type ProductFormData = z.infer<typeof productSchema>;
interface Product extends ProductFormData { id: string }

interface CartItem { product: Product; qty: number }

function normalizeProduct(row: any): Product {
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    price: Number(row?.price ?? 0),
    category: (row?.category ?? "accesorios") as ProductFormData["category"],
    stock: Number(row?.stock ?? 0),
    sku: String(row?.sku ?? ""),
    isActive: Boolean(row?.isActive ?? row?.is_active ?? true),
  };
}

// ── Products CRUD ────────────────────────────────────────
const ProductsPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const { data } = useQuery<{ data: Product[] }>({
    queryKey: ["products", debouncedSearch],
    queryFn: async () => (await api.get(`/products?search=${debouncedSearch}`)).data,
  });
  const products = Array.isArray(data?.data) ? data.data.map(normalizeProduct) : [];

  const form = useForm<ProductFormData>({ resolver: zodResolver(productSchema), defaultValues: { isActive: true, category: "suplementos" } });

  const createMutation = useMutation({ mutationFn: (d: ProductFormData) => api.post("/products", d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast({ title: "Producto creado" }); setOpen(false); } });
  const updateMutation = useMutation({ mutationFn: ({ id, ...d }: Product) => api.put(`/products/${id}`, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast({ title: "Producto actualizado" }); setOpen(false); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => api.delete(`/products/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast({ title: "Producto eliminado" }); } });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => { form.reset({ isActive: true, category: "suplementos" }); setEditing(null); setOpen(true); }}>
          <Plus size={14} className="mr-1" />Nuevo producto
        </Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Categoría</TableHead><TableHead>Precio</TableHead><TableHead>Stock</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{p.category}</TableCell>
              <TableCell>${p.price}</TableCell>
              <TableCell>{p.stock}</TableCell>
              <TableCell><Badge variant={p.isActive ? "default" : "secondary"}>{p.isActive ? "Activo" : "Inactivo"}</Badge></TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => { form.reset(normalizeProduct(p)); setEditing(p); setOpen(true); }}>Editar</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => { if (window.confirm("¿Eliminar este producto?")) deleteMutation.mutate(p.id); }}>Eliminar</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar producto" : "Nuevo producto"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => editing ? updateMutation.mutate({ ...d, id: editing.id }) : createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1"><Label>Nombre</Label><Input {...form.register("name")} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Precio</Label><Input type="number" {...form.register("price")} /></div>
              <div className="space-y-1"><Label>Stock</Label><Input type="number" {...form.register("stock")} /></div>
            </div>
            <div className="space-y-1">
              <Label>Categoría</Label>
              <Select value={form.watch("category")} onValueChange={(v) => form.setValue("category", v as ProductFormData["category"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="suplementos">Suplementos</SelectItem>
                  <SelectItem value="ropa">Ropa</SelectItem>
                  <SelectItem value="accesorios">Accesorios</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>SKU</Label><Input {...form.register("sku")} /></div>
            <div className="flex items-center gap-3"><Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} /><Label>Activo</Label></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">{editing ? "Actualizar" : "Crear"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── POS Terminal ─────────────────────────────────────────
const POSTerminal = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discountCode, setDiscountCode] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const { data } = useQuery<{ data: Product[] }>({
    queryKey: ["products", debouncedSearch],
    queryFn: async () => (await api.get(`/products?search=${debouncedSearch}&active=true`)).data,
  });
  const products = Array.isArray(data?.data) ? data.data.map(normalizeProduct) : [];

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.product.id === p.id);
      if (ex) return prev.map((c) => c.product.id === p.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { product: p, qty: 1 }];
    });
  };

  const remove = (id: string) => setCart((prev) => prev.filter((c) => c.product.id !== id));
  const adjustQty = (id: string, delta: number) => setCart((prev) => prev.map((c) => c.product.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c));
  const total = cart.reduce((sum, c) => sum + c.product.price * c.qty, 0);

  const checkoutMutation = useMutation({
    mutationFn: () => api.post("/pos/checkout", {
      items: cart.map((c) => ({ productId: c.product.id, qty: c.qty })),
      paymentMethod,
      total,
      discountCode: discountCode.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Venta realizada" });
      setCart([]);
      setDiscountCode("");
    },
    onError: (err: any) => {
      toast({ title: "No se pudo completar la venta", description: err?.response?.data?.message, variant: "destructive" });
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Products */}
      <div>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {products.map((p) => (
            <div
              key={p.id}
              onClick={() => addToCart(p)}
              className="p-3 rounded-xl border border-border hover:bg-muted cursor-pointer"
            >
              <p className="font-medium text-sm">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.category}</p>
              <p className="font-bold mt-1">${p.price}</p>
              <p className="text-xs text-muted-foreground">Stock: {p.stock}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div className="bg-secondary rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">Carrito</h3>
        {cart.length === 0 ? <p className="text-sm text-muted-foreground">Agrega productos...</p> : null}
        {cart.map((item) => (
          <div key={item.product.id} className="flex items-center justify-between text-sm">
            <span className="flex-1 truncate">{item.product.name}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => adjustQty(item.product.id, -1)}><Minus size={10} /></Button>
              <span className="w-5 text-center">{item.qty}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => adjustQty(item.product.id, 1)}><Plus size={10} /></Button>
              <span className="w-20 text-right font-medium">${item.product.price * item.qty}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => remove(item.product.id)}><Trash2 size={10} /></Button>
            </div>
          </div>
        ))}
        {cart.length > 0 && (
          <>
            <div className="border-t border-border pt-3 flex justify-between font-bold">
              <span>Total</span>
              <span>${total} MXN</span>
            </div>
            <div className="space-y-1">
              <Label>Método de pago</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="card">Tarjeta</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Código de descuento (opcional)</Label>
              <Input
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                placeholder="Ej. OPHELIA10"
              />
            </div>
            <Button className="w-full" onClick={() => checkoutMutation.mutate()} disabled={checkoutMutation.isPending}>
              Confirmar venta
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

// ── Main POS Page ─────────────────────────────────────────
const POSPage = () => (
  <AuthGuard>
    <AdminLayout>
      <div className="admin-page max-w-5xl">
        <h1 className="text-2xl font-bold mb-6">Punto de Venta</h1>
        <Tabs defaultValue="pos">
          <TabsList>
            <TabsTrigger value="pos">Terminal POS</TabsTrigger>
            <TabsTrigger value="products">Productos</TabsTrigger>
          </TabsList>
          <TabsContent value="pos" className="mt-4"><POSTerminal /></TabsContent>
          <TabsContent value="products" className="mt-4"><ProductsPage /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  </AuthGuard>
);

export default POSPage;
