import { useState } from "react";
import { Plus, Calendar, Users, TrendingUp, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudioEvent, EVENT_TYPES } from "./types";
import EventTypeIcon from "./EventTypeIcon";
import { formatEventDateShort, formatCurrency, occupancyPercent, occupancyColor, calcCurrentPrice } from "./utils";

interface Props {
  events: StudioEvent[];
  onCreateNew: () => void;
  onSelect: (event: StudioEvent) => void;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  published: { label: "Publicado",  className: "text-[#4ade80] border-[#4ade80]/30 bg-[#4ade80]/5" },
  draft:     { label: "Borrador",   className: "text-white/50 border-white/15 bg-white/3" },
  cancelled: { label: "Cancelado",  className: "text-[#f87171] border-[#f87171]/30 bg-[#f87171]/5" },
  completed: { label: "Completado", className: "text-[#E9745F] border-[#E9745F]/30 bg-[#E9745F]/5" },
};

export default function EventListView({ events, onCreateNew, onSelect }: Props) {
  const [filter, setFilter] = useState<string>("all");

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);
  const active = events.filter((e) => e.status === "published").length;
  const totalIncome = events.reduce((sum, e) => {
    return sum + e.registrations.filter((r) => r.status === "confirmed").reduce((s, r) => s + r.amount, 0);
  }, 0);
  const totalRegs = events.reduce((sum, e) => sum + e.registrations.filter((r) => r.status === "confirmed").length, 0);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Eventos del Estudio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {events.length} evento{events.length !== 1 ? "s" : ""} creado{events.length !== 1 ? "s" : ""} · {active} activo{active !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={onCreateNew}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-[#76214D] to-[#E9745F] text-white shadow-lg shadow-[#76214D]/20 hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Crear Evento
        </button>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total eventos", value: String(events.length), icon: Calendar, color: "#76214D" },
          { label: "Publicados",    value: String(active),         icon: TrendingUp, color: "#4ade80" },
          { label: "Inscritos",     value: String(totalRegs),      icon: Users,      color: "#E9745F" },
          { label: "Ingresos",      value: formatCurrency(totalIncome), icon: TrendingUp, color: "#F58A24" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl p-4 border border-white/[0.06] bg-white/[0.02]"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <stat.icon size={14} style={{ color: stat.color }} />
              <span className="text-[0.7rem] text-muted-foreground">{stat.label}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── Type filters ── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium border transition-all",
            filter === "all"
              ? "bg-[#76214D]/15 border-[#76214D]/40 text-[#76214D]"
              : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
          )}
        >
          Todos ({events.length})
        </button>
        {EVENT_TYPES.map((t) => {
          const count = events.filter((e) => e.type === t.value).length;
          if (count === 0) return null;
          return (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all",
                filter === t.value
                  ? "border-opacity-40 text-white"
                  : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
              )}
              style={filter === t.value ? {
                background: `${t.color}18`,
                borderColor: `${t.color}50`,
                color: t.color,
              } : {}}
            >
              <EventTypeIcon type={t.value} size={12} />
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {/* ── Event cards ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Calendar size={40} className="text-white/20 mb-3" />
          <p className="text-muted-foreground">No hay eventos aún.</p>
          <button onClick={onCreateNew} className="mt-4 text-sm text-[#76214D] hover:underline">
            Crear el primero
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((ev) => {
            const info = EVENT_TYPES.find((t) => t.value === ev.type);
            const color = info?.color ?? "#76214D";
            const pct = occupancyPercent(ev.registered, ev.capacity);
            const barColor = occupancyColor(pct);
            const badge = STATUS_BADGE[ev.status] ?? STATUS_BADGE.draft;
            const confirmed = ev.registrations.filter((r) => r.status === "confirmed").length;
            const income = ev.registrations.filter((r) => r.status === "confirmed").reduce((s, r) => s + r.amount, 0);
            const currentPrice = calcCurrentPrice(ev);

            return (
              <button
                key={ev.id}
                onClick={() => onSelect(ev)}
                className="text-left rounded-2xl border bg-white/[0.02] hover:bg-white/[0.04] transition-all p-5 space-y-4"
                style={{ borderColor: `${color}22` }}
              >
                {/* Title row */}
                <div className="flex items-start gap-3">
                  <EventTypeIcon type={ev.type} size={18} withBg className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground truncate">{ev.title}</p>
                      <span className={cn("text-[0.65rem] font-semibold border rounded-full px-2 py-0.5", badge.className)}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {ev.instructor} · {info?.label}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-base font-bold" style={{ color }}>
                      {ev.price === 0 ? "Gratis" : formatCurrency(currentPrice)}
                    </p>
                    {ev.earlyBirdPrice && ev.price !== ev.earlyBirdPrice && (
                      <p className="text-[0.65rem] text-muted-foreground line-through">
                        {formatCurrency(ev.price)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {formatEventDateShort(ev.date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {ev.startTime}–{ev.endTime}
                  </span>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: "Capacidad",   value: `${ev.registered}/${ev.capacity}`, color: "#76214D" },
                    { label: "Ocupación",   value: `${pct}%`,                         color: barColor },
                    { label: "Confirmados", value: String(confirmed),                  color: "#4ade80" },
                    { label: "Ingresos",    value: formatCurrency(income),             color: "#F58A24" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl p-2.5 bg-white/[0.03] border border-white/[0.05]">
                      <p className="text-[0.6rem] text-muted-foreground mb-0.5">{s.label}</p>
                      <p className="text-xs font-semibold" style={{ color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Occupancy bar */}
                <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
