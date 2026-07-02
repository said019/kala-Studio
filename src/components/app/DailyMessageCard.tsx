import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import api from "@/lib/api";
import { KALA } from "@/components/app/tokens";

// Mensaje del día que la dueña configura en el dashboard del admin.
// Se muestra en el inicio de la app de la clienta (reemplaza el aviso por WhatsApp).
// Tratamiento diferenciado a propósito: gradiente cálido + badge + eyebrow, para
// que se lea como "el mensaje de Kala" y no se confunda con las tarjetas vecinas.
export const DailyMessageCard = () => {
  const { data } = useQuery({
    queryKey: ["daily-message"],
    queryFn: async () => (await api.get("/daily-message")).data,
    staleTime: 5 * 60 * 1000,
  });

  const text = data?.data?.text;
  if (!text || !String(text).trim()) return null;

  return (
    <div
      className="relative mt-4 overflow-hidden rounded-2xl px-4 py-4 sm:px-5"
      style={{
        background: `linear-gradient(135deg, ${KALA.berry}14 0%, ${KALA.coral}16 52%, ${KALA.cream} 100%)`,
        border: `1px solid ${KALA.berry}2e`,
        boxShadow: `0 12px 32px -20px ${KALA.berry}`,
      }}
    >
      {/* glow decorativo */}
      <div
        className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-40 blur-2xl"
        style={{ background: `radial-gradient(circle, ${KALA.coral} 0%, transparent 70%)` }}
        aria-hidden
      />
      <div className="relative flex items-start gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: KALA.berry, color: KALA.cream, boxShadow: `0 6px 16px -6px ${KALA.berry}` }}
        >
          <Sparkles size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em]" style={{ color: KALA.berry }}>
            Mensaje de hoy
          </p>
          <p className="mt-1 text-[0.95rem] font-medium leading-snug" style={{ color: KALA.ink }}>
            {text}
          </p>
        </div>
      </div>
    </div>
  );
};
