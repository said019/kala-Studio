import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export function formatEventDate(dateStr: string): string {
  try {
    const d = dateStr.includes("T") ? parseISO(dateStr) : new Date(dateStr + "T12:00:00");
    return format(d, "EEEE d 'de' MMMM yyyy", { locale: es });
  } catch {
    return dateStr;
  }
}

export function formatEventDateShort(dateStr: string): string {
  try {
    const d = dateStr.includes("T") ? parseISO(dateStr) : new Date(dateStr + "T12:00:00");
    return format(d, "d MMM yyyy", { locale: es });
  } catch {
    return dateStr;
  }
}

export function formatCurrency(amount: number, currency = "MXN"): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function calcCurrentPrice(event: {
  price: number;
  earlyBirdPrice?: number | null;
  earlyBirdDeadline?: string | null;
}): number {
  if (event.earlyBirdPrice && event.earlyBirdDeadline) {
    const deadline = new Date(event.earlyBirdDeadline + "T23:59:59");
    if (new Date() <= deadline) return event.earlyBirdPrice;
  }
  return event.price;
}

export function occupancyPercent(registered: number, capacity: number): number {
  if (!capacity) return 0;
  return Math.round((registered / capacity) * 100);
}

export function occupancyColor(pct: number): string {
  if (pct > 80) return "#f87171";  // red
  if (pct > 50) return "#fbbf24";  // amber
  return "#4ade80";                // green
}
