import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import api from "@/lib/api";
import { KALA } from "@/components/app/tokens";

// Mensaje del día que la dueña configura en Admin → Configuración → Mensaje del día.
// Se muestra en el inicio de la app de la clienta (reemplaza el aviso por WhatsApp).
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
      className="mt-4 flex items-start gap-3 rounded-2xl px-4 py-3.5"
      style={{ backgroundColor: KALA.blush, border: `1px solid ${KALA.border}` }}
    >
      <Sparkles size={16} className="mt-0.5 shrink-0" style={{ color: KALA.berry }} />
      <p className="text-sm leading-snug" style={{ color: KALA.ink }}>
        {text}
      </p>
    </div>
  );
};
