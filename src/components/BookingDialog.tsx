import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Clock, User, CalendarDays, CheckCircle2, UserPlus, Search } from "lucide-react";

export interface ClassItem {
  id: string;
  time: string;       // 'HH:MM'
  type: string;
  instructor: string;
  spots: number;
  duration: string;   // '50 min'
  date?: Date;
  color?: string;
}

interface Props {
  classData: ClassItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export const BookingDialog = ({ classData, open, onOpenChange, onSuccess }: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // ── Modo acompañante ─────────────────────────────────────────────────────
  const [withGuest, setWithGuest] = useState(false);
  const [guestPhone, setGuestPhone] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestHasInjury, setGuestHasInjury] = useState(false);
  const [guestInjuryDetails, setGuestInjuryDetails] = useState("");
  const [guestPracticedBefore, setGuestPracticedBefore] = useState(false);
  const [guestWaiver, setGuestWaiver] = useState(false);
  const [guestFound, setGuestFound] = useState<{ display_name: string } | null>(null);
  const [searching, setSearching] = useState(false);

  const resetGuestForm = () => {
    setWithGuest(false);
    setGuestPhone(""); setGuestName(""); setGuestEmail("");
    setGuestHasInjury(false); setGuestInjuryDetails(""); setGuestPracticedBefore(false);
    setGuestWaiver(false); setGuestFound(null);
  };

  if (!classData) return null;

  const handleSearchGuest = async () => {
    if (!guestPhone.trim()) return;
    setSearching(true);
    try {
      const r = await api.get(`/my-guests/search?phone=${encodeURIComponent(guestPhone)}`);
      const g = r.data?.data ?? null;
      if (g) {
        setGuestFound(g);
        setGuestName(g.display_name || "");
        setGuestEmail(g.email || "");
        setGuestHasInjury(g.has_injury === true);
        setGuestInjuryDetails(g.injury_details || "");
        setGuestPracticedBefore(g.practiced_barre_before === true);
        toast({
          title: "Acompañante encontrada",
          description: `Sus respuestas anteriores ya están cargadas. Solo confirma el waiver.`,
        });
      } else {
        setGuestFound(null);
        toast({ title: "Es nueva acompañante", description: "Llena los datos y el cuestionario." });
      }
    } catch (err: any) {
      toast({
        title: "Error al buscar",
        description: err?.response?.data?.message ?? "Inténtalo de nuevo",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const handleBook = async () => {
    if (!user) {
      onOpenChange(false);
      navigate(`/auth/login?returnUrl=/`);
      return;
    }
    setLoading(true);
    try {
      if (withGuest) {
        if (!guestName.trim() || !guestPhone.trim() || !guestWaiver) {
          throw new Error("Faltan datos de la acompañante (nombre, teléfono, waiver).");
        }
        await api.post("/bookings/with-guest", {
          classId: classData.id,
          guest: {
            name: guestName,
            phone: guestPhone,
            email: guestEmail || undefined,
            hasInjury: guestHasInjury,
            injuryDetails: guestHasInjury ? (guestInjuryDetails || null) : null,
            practicedBarreBefore: guestPracticedBefore,
            acceptedWaiver: guestWaiver,
          },
        });
        setDone(true);
        toast({
          title: "✅ Reserva confirmada para tu acompañante",
          description: `${guestName} · ${classData.type} ${classData.time}`,
        });
      } else {
        await api.post("/bookings", { classId: classData.id });
        setDone(true);
        toast({ title: "✅ ¡Reserva confirmada!", description: `${classData.type} · ${classData.time}` });
      }
      onSuccess?.();
      setTimeout(() => {
        setDone(false);
        resetGuestForm();
        onOpenChange(false);
      }, 2000);
    } catch (err: any) {
      toast({
        title: "Error al reservar",
        description: err?.response?.data?.message ?? err?.message ?? "Inténtalo de nuevo",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const accentColor = classData.color ?? "#778455";

  // Las reservas cierran 2 h antes del inicio (debe coincidir con el backend).
  const BOOKING_LEAD_MS = 2 * 60 * 60 * 1000;
  const startsAt = (() => {
    if (!classData.date) return null;
    const [h, m] = (classData.time || "00:00").split(":").map(Number);
    const d = new Date(classData.date);
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  })();
  const bookingClosed = startsAt ? startsAt.getTime() - Date.now() < BOOKING_LEAD_MS : false;

  const canBook = withGuest
    ? Boolean(guestName.trim() && guestPhone.trim() && guestWaiver)
    : true;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (loading) return;
        if (!v) { setDone(false); resetGuestForm(); }
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-sm max-h-[85dvh] overflow-y-auto">
        {/* Color bar */}
        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ background: accentColor }} />

        <DialogHeader className="pt-3">
          <DialogTitle className="text-xl">{classData.type}</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 size={52} className="text-green-500" />
            <p className="font-semibold text-lg">
              {withGuest ? "Acompañante confirmada" : "¡Reserva confirmada!"}
            </p>
            <p className="text-sm text-muted-foreground">Te esperamos en el estudio 🎉</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 py-2">
              {classData.date && (
                <div className="flex items-center gap-3 text-sm">
                  <CalendarDays size={15} className="text-muted-foreground shrink-0" />
                  <span className="capitalize">
                    {format(classData.date, "EEEE dd 'de' MMMM", { locale: es })}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <Clock size={15} className="text-muted-foreground shrink-0" />
                <span>{classData.time} · {classData.duration}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <User size={15} className="text-muted-foreground shrink-0" />
                <span>{classData.instructor}</span>
              </div>
              <div className="rounded-lg px-4 py-3 text-sm mt-2"
                style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}33` }}>
                <span style={{ color: accentColor }} className="font-semibold">
                  {classData.spots} lugar{classData.spots !== 1 ? "es" : ""} disponible{classData.spots !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {bookingClosed && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-xs text-destructive">
                Las reservas cierran <strong>2 horas antes</strong> del inicio de la clase.
              </div>
            )}

            {/* Toggle acompañante — solo para socias logueadas */}
            {user && !bookingClosed && (
              <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <Switch
                  checked={withGuest}
                  onCheckedChange={(v) => { setWithGuest(v); if (!v) resetGuestForm(); }}
                  disabled={loading}
                />
                <div className="space-y-0.5">
                  <Label className="cursor-pointer text-sm flex items-center gap-1.5">
                    <UserPlus size={13} /> Reservar para una acompañante
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Usa una clase de tu paquete de visitas para alguien que viene contigo.
                  </p>
                </div>
              </div>
            )}

            {/* Form acompañante */}
            {user && withGuest && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 -mt-1">
                {/* Teléfono + buscar */}
                <div className="space-y-1">
                  <Label className="text-xs">Teléfono de la acompañante</Label>
                  <div className="flex gap-2">
                    <Input
                      value={guestPhone}
                      onChange={(e) => { setGuestPhone(e.target.value); setGuestFound(null); }}
                      placeholder="10 dígitos"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleSearchGuest}
                      disabled={!guestPhone.trim() || searching}
                    >
                      {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    </Button>
                  </div>
                  {guestFound && (
                    <p className="text-[11px] text-emerald-700">
                      ✓ Ya la habías traído antes — su cuestionario está cargado.
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Nombre</Label>
                  <Input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Nombre y apellido"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Email (opcional)</Label>
                  <Input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="ej. ana@correo.com"
                  />
                </div>

                <div className="space-y-2 border-t border-border pt-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Cuestionario inicial
                  </p>

                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">¿Tiene lesión o condición física?</Label>
                    <Switch checked={guestHasInjury} onCheckedChange={setGuestHasInjury} />
                  </div>
                  {guestHasInjury && (
                    <Textarea
                      rows={2}
                      value={guestInjuryDetails}
                      onChange={(e) => setGuestInjuryDetails(e.target.value)}
                      placeholder="Cuéntanos qué debemos saber (lesión, cirugía, embarazo, etc.)"
                      className="text-xs"
                    />
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">¿Practicó barre antes?</Label>
                    <Switch checked={guestPracticedBefore} onCheckedChange={setGuestPracticedBefore} />
                  </div>

                  <div className="flex items-start justify-between gap-2 border-t border-border pt-2">
                    <Label className="text-[11px] leading-relaxed">
                      Confirmo que mi acompañante leyó y aceptó los términos y riesgos de la clase.
                    </Label>
                    <Switch checked={guestWaiver} onCheckedChange={setGuestWaiver} />
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Se descuenta 1 clase de tu paquete de visitas. Si no tienes paquete activo, pídeselo en recepción.
                </p>
              </div>
            )}

            {!user && (
              <p className="text-xs text-muted-foreground text-center -mt-1">
                Necesitas iniciar sesión para reservar
              </p>
            )}
          </>
        )}

        {!done && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button
              onClick={handleBook}
              disabled={loading || classData.spots === 0 || bookingClosed || !canBook}
              style={{ background: accentColor, color: "#fff", border: "none" }}
              className="hover:opacity-90"
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin mr-2" />Reservando…</>
                : bookingClosed ? "Reservas cerradas"
                : !user ? "Iniciar sesión para reservar"
                : withGuest ? "Reservar para acompañante"
                : "Confirmar reserva"
              }
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BookingDialog;
