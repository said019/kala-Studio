import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { StudioEvent, EVENT_TYPES, EventType } from "./types";
import EventTypeIcon from "./EventTypeIcon";
import { formatCurrency } from "./utils";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";

interface Props {
  initialData?: StudioEvent | null;
  onSave: (payload: Record<string, unknown>, status: "draft" | "published") => void;
  onCancel: () => void;
}

const STEPS = ["Tipo y detalles", "Fecha y lugar", "Precios", "Extras y publicar"] as const;

interface FormState {
  type: EventType;
  title: string;
  description: string;
  instructor_name: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  capacity: number;
  price: number;
  member_discount: number;
  early_bird_price: string;
  early_bird_deadline: string;
  requirements: string;
  includes: string[];
  tags: string;
}

const EMPTY: FormState = {
  type: "masterclass",
  title: "",
  description: "",
  instructor_name: "",
  date: "",
  start_time: "09:00",
  end_time: "11:00",
  location: "",
  capacity: 12,
  price: 0,
  member_discount: 0,
  early_bird_price: "",
  early_bird_deadline: "",
  requirements: "",
  includes: [""],
  tags: "",
};

export default function CreateEventView({ initialData, onSave, onCancel }: Props) {
  const isEdit = !!initialData;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (initialData) {
      setForm({
        type: initialData.type,
        title: initialData.title,
        description: initialData.description,
        instructor_name: initialData.instructor,
        date: initialData.date,
        start_time: initialData.startTime,
        end_time: initialData.endTime,
        location: initialData.location,
        capacity: initialData.capacity,
        price: initialData.price,
        member_discount: initialData.memberDiscount,
        early_bird_price: initialData.earlyBirdPrice != null ? String(initialData.earlyBirdPrice) : "",
        early_bird_deadline: initialData.earlyBirdDeadline ?? "",
        requirements: initialData.requirements,
        includes: initialData.includes.length ? initialData.includes : [""],
        tags: initialData.tags.join(", "),
      });
    }
  }, [initialData]);

  const set = (key: keyof FormState, value: unknown) =>
    setForm((p) => ({ ...p, [key]: value }));

  // Instructors list
  const { data: instructors = [], isError: instructorsError } = useQuery({
    queryKey: ["instructors"],
    queryFn: async () => {
      const res = await api.get("/instructors");
      const list = res.data?.data ?? res.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    staleTime: 60_000,
  });

  // Validate per-step
  const canNext = () => {
    if (step === 0) return form.type && form.title.length >= 3 && form.description.length >= 10 && form.instructor_name.length >= 2;
    if (step === 1) return form.date && form.start_time && form.end_time && form.location.length >= 2 && form.capacity >= 1;
    if (step === 2) return form.price >= 0;
    return true;
  };

  const buildPayload = () => ({
    type: form.type,
    title: form.title.trim(),
    description: form.description.trim(),
    instructor_name: form.instructor_name.trim(),
    date: form.date,
    start_time: form.start_time,
    end_time: form.end_time,
    location: form.location.trim(),
    capacity: form.capacity,
    price: form.price,
    early_bird_price: form.early_bird_price ? Number(form.early_bird_price) : null,
    early_bird_deadline: form.early_bird_deadline || null,
    member_discount: form.member_discount,
    requirements: form.requirements.trim(),
    includes: form.includes.filter(Boolean),
    tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
  });

  // Preview prices
  const price = Number(form.price) || 0;
  const eb = form.early_bird_price ? Number(form.early_bird_price) : null;
  const discount = Number(form.member_discount) || 0;

  const inputCls = "w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[#76214D]/40 focus:bg-white/[0.06] transition-all";
  const labelCls = "block text-xs font-medium text-muted-foreground mb-1.5";

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
          <ArrowLeft size={15} />
          {isEdit ? "Cancelar edición" : "Cancelar"}
        </button>
        <div className="flex-1 text-center">
          <h2 className="text-lg font-bold text-foreground">{isEdit ? "Editar Evento" : "Crear Evento"}</h2>
        </div>
      </div>

      {/* ── Stepper ── */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={i} className="flex flex-1 items-center">
            <button
              onClick={() => i < step && setStep(i)}
              className={cn("flex flex-col items-center gap-1 flex-1", i < step && "cursor-pointer")}
            >
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition-all",
                i < step   ? "bg-[#76214D] border-[#76214D] text-white"
                : i === step ? "border-[#76214D] text-[#76214D] bg-[#76214D]/10"
                : "border-white/15 text-white/30 bg-white/[0.02]"
              )}>
                {i < step ? <Check size={13} /> : i + 1}
              </div>
              <span className={cn("text-[0.62rem] font-medium hidden sm:block", i === step ? "text-[#76214D]" : i < step ? "text-foreground" : "text-white/30")}>
                {label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={cn("h-px flex-1 mx-1 transition-all", i < step ? "bg-[#76214D]/50" : "bg-white/[0.06]")} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 1: Tipo y detalles ── */}
      {step === 0 && (
        <div className="space-y-5">
          {/* Type grid */}
          <div>
            <label className={labelCls}>Tipo de evento</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => set("type", t.value)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl p-3 border transition-all text-left",
                    form.type === t.value ? "border-opacity-50 text-foreground" : "border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:bg-white/[0.04]"
                  )}
                  style={form.type === t.value ? {
                    background: `${t.color}10`,
                    borderColor: `${t.color}40`,
                  } : {}}
                >
                  <EventTypeIcon type={t.value} size={16} />
                  <span className="text-sm font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Título del evento</label>
            <input className={inputCls} placeholder="Ej. Masterclass de Reformer Avanzado" value={form.title} onChange={(e) => set("title", e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Descripción</label>
            <textarea className={cn(inputCls, "resize-none")} rows={4} placeholder="Describe el evento (mín. 10 caracteres)" value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Instructor/a</label>
            {instructors.length > 0 && (
              <select
                className={cn(inputCls, "mb-2")}
                value={instructors.some((i: any) => (i.displayName || i.display_name) === form.instructor_name) ? form.instructor_name : ""}
                onChange={(e) => { if (e.target.value) set("instructor_name", e.target.value); }}
              >
                <option value="">— Seleccionar instructor —</option>
                {instructors.map((ins: any) => {
                  const name = ins.displayName || ins.display_name || ins.name || "";
                  return <option key={ins.id} value={name}>{name}</option>;
                })}
              </select>
            )}
            <input
              className={inputCls}
              placeholder={instructors.length > 0 ? "O escribe el nombre manualmente" : "Nombre del instructor"}
              value={form.instructor_name}
              onChange={(e) => set("instructor_name", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* ── Step 2: Fecha y lugar ── */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Fecha del evento</label>
              <DatePicker
                value={form.date}
                onChange={(v) => set("date", v)}
                min={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div>
              <label className={labelCls}>Capacidad máxima</label>
              <input
                className={inputCls}
                type="number"
                min={1}
                max={500}
                value={form.capacity}
                onChange={(e) => set("capacity", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Hora inicio</label>
              <TimePicker value={form.start_time} onChange={(v) => set("start_time", v)} />
            </div>
            <div>
              <label className={labelCls}>Hora fin</label>
              <TimePicker value={form.end_time} onChange={(v) => set("end_time", v)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Ubicación</label>
            <input className={inputCls} placeholder="Ej. Sala Principal, Estudio 2, Online..." value={form.location} onChange={(e) => set("location", e.target.value)} />
          </div>
        </div>
      )}

      {/* ── Step 3: Precios ── */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Precio general (MXN)</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                placeholder="0 = gratis"
                value={form.price}
                onChange={(e) => set("price", Number(e.target.value))}
              />
              {form.price === 0 && <p className="text-[0.7rem] text-[#4ade80] mt-1">Evento gratuito</p>}
            </div>
            <div>
              <label className={labelCls}>% Descuento para socias</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                max={50}
                placeholder="0"
                value={form.member_discount}
                onChange={(e) => set("member_discount", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
            <p className="text-xs font-semibold text-[#F58A24]/80 uppercase tracking-wider">Early Bird (opcional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Precio early bird (MXN)</label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  placeholder="—"
                  value={form.early_bird_price}
                  onChange={(e) => set("early_bird_price", e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Fecha límite</label>
                <DatePicker value={form.early_bird_deadline} onChange={(v) => set("early_bird_deadline", v)} />
              </div>
            </div>
          </div>

          {/* Price preview */}
          {price > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vista previa de precios</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl p-3 border border-white/[0.06] bg-white/[0.02]">
                  <p className="text-[0.65rem] text-muted-foreground mb-1">General</p>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(price)}</p>
                </div>
                {eb && (
                  <div className="rounded-xl p-3 border border-[#F58A24]/20 bg-[#F58A24]/[0.04]">
                    <p className="text-[0.65rem] text-[#F58A24]/70 mb-1">Early Bird</p>
                    <p className="text-lg font-bold text-[#F58A24]">{formatCurrency(eb)}</p>
                    <p className="text-[0.62rem] text-[#F58A24]/50 mt-0.5">Ahorro: {formatCurrency(price - eb)}</p>
                  </div>
                )}
                {discount > 0 && (
                  <div className="rounded-xl p-3 border border-[#E9745F]/20 bg-[#E9745F]/[0.04]">
                    <p className="text-[0.65rem] text-[#E9745F]/70 mb-1">Para socias</p>
                    <p className="text-lg font-bold text-[#E9745F]">
                      {formatCurrency(Math.round(price * (1 - discount / 100)))}
                    </p>
                    <p className="text-[0.62rem] text-[#E9745F]/50 mt-0.5">{discount}% descuento</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Extras y publicar ── */}
      {step === 3 && (
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Requisitos de entrada</label>
            <input className={inputCls} placeholder="Ej. Mínimo 6 meses de experiencia" value={form.requirements} onChange={(e) => set("requirements", e.target.value)} />
          </div>

          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-2">
              <label className={labelCls}>¿Qué incluye?</label>
              <button
                onClick={() => set("includes", [...form.includes, ""])}
                className="text-[0.7rem] text-[#76214D] flex items-center gap-1 hover:opacity-80"
              >
                <Plus size={12} />
                Agregar
              </button>
            </div>
            <div className="space-y-2">
              {form.includes.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={cn(inputCls, "flex-1")}
                    placeholder={`Item ${i + 1}`}
                    value={item}
                    onChange={(e) => {
                      const arr = [...form.includes];
                      arr[i] = e.target.value;
                      set("includes", arr);
                    }}
                  />
                  <button
                    onClick={() => set("includes", form.includes.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-[#f87171] transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Etiquetas (separadas por coma)</label>
            <input className={inputCls} placeholder="reformer, avanzado, pilates..." value={form.tags} onChange={(e) => set("tags", e.target.value)} />
          </div>

          {/* Final action buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            {!isEdit && (
              <button
                onClick={() => onSave(buildPayload(), "draft")}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold border border-white/[0.12] text-muted-foreground hover:text-foreground hover:border-white/20 transition-all"
              >
                Guardar borrador
              </button>
            )}
            <button
              onClick={() => onSave(buildPayload(), isEdit ? (initialData?.status as "draft" | "published") ?? "draft" : "published")}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white shadow-lg shadow-[#76214D]/20 hover:opacity-90 transition-opacity"
            >
              <Sparkles size={15} />
              {isEdit ? "Guardar cambios" : "Publicar Evento"}
            </button>
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      {step < 3 && (
        <div className="flex justify-between pt-2">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border border-white/[0.08] text-muted-foreground hover:text-foreground hover:border-white/20 disabled:opacity-30 transition-all"
          >
            <ArrowLeft size={15} />
            Anterior
          </button>
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext()}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white shadow-lg shadow-[#76214D]/20 hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Siguiente
            <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
