/**
 * InstallAppPrompt — Modal con instrucciones para instalar la app
 * Se muestra una sola vez después del primer login (localStorage flag)
 */

import { useState, useEffect } from "react";
import { X, Share, MoreVertical, Plus, Download, Smartphone } from "lucide-react";
const STORAGE_KEY = "kala_install_prompt_shown";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function getDevice(): "ios" | "android" | "desktop" {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

interface InstallAppPromptProps {
  /** Force show (bypass localStorage check) */
  force?: boolean;
  onClose?: () => void;
}

export function InstallAppPrompt({ force, onClose }: InstallAppPromptProps) {
  const [visible, setVisible] = useState(false);
  const [device] = useState(getDevice);

  useEffect(() => {
    // Only show on mobile devices
    if (device === "desktop") return;

    // Don't show if already installed as PWA
    if (isStandalone()) return;

    // Don't show if already dismissed (unless forced)
    if (!force && localStorage.getItem(STORAGE_KEY)) return;

    // Small delay for smoother UX
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, [force, device]);

  const handleClose = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "1");
    onClose?.();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 mb-4 sm:mb-0 bg-card border border-border rounded-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-400">
        {/* Header gradient */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-b from-primary/10 to-transparent">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-background border border-border flex items-center justify-center overflow-hidden shadow-lg">
              <img src="/icon-192.png" alt="Kala" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <h3 className="font-bebas text-2xl text-foreground leading-none tracking-wide">
                INSTALA LA APP
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Acceso directo desde tu pantalla
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {/* Benefits */}
          <div className="flex gap-3 mb-5 py-3 border-y border-border/50">
            {[
              { icon: Smartphone, label: "Acceso rápido" },
              { icon: Download, label: "Sin descargar" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon size={13} className="text-primary" />
                {label}
              </div>
            ))}
          </div>

          {/* Device-specific instructions */}
          {device === "ios" ? (
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-widest text-primary font-medium">
                iPhone / iPad
              </p>
              <div className="space-y-3">
                <Step
                  number={1}
                  icon={<Share size={14} className="text-blue-400" />}
                  text={
                    <>
                      Toca el botón <strong className="text-foreground">Compartir</strong>{" "}
                      <Share size={12} className="inline text-blue-400" /> en la barra de Safari
                    </>
                  }
                />
                <Step
                  number={2}
                  icon={<Plus size={14} className="text-foreground" />}
                  text={
                    <>
                      Selecciona{" "}
                      <strong className="text-foreground">Agregar a pantalla de inicio</strong>{" "}
                      <Plus size={12} className="inline text-foreground border border-muted-foreground/30 rounded-sm" />
                    </>
                  }
                />
                <Step
                  number={3}
                  icon={<span className="text-xs font-bold text-primary">OK</span>}
                  text={
                    <>
                      Toca <strong className="text-foreground">Agregar</strong> y listo
                    </>
                  }
                />
              </div>
            </div>
          ) : device === "android" ? (
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-widest text-primary font-medium">
                Android
              </p>
              <div className="space-y-3">
                <Step
                  number={1}
                  icon={<MoreVertical size={14} className="text-foreground" />}
                  text={
                    <>
                      Toca el menú{" "}
                      <strong className="text-foreground">
                        <MoreVertical size={12} className="inline" /> (tres puntos)
                      </strong>{" "}
                      en Chrome
                    </>
                  }
                />
                <Step
                  number={2}
                  icon={<Download size={14} className="text-primary" />}
                  text={
                    <>
                      Selecciona{" "}
                      <strong className="text-foreground">Instalar aplicación</strong> o{" "}
                      <strong className="text-foreground">Agregar a pantalla de inicio</strong>
                    </>
                  }
                />
                <Step
                  number={3}
                  icon={<span className="text-xs font-bold text-primary">OK</span>}
                  text={
                    <>
                      Confirma tocando <strong className="text-foreground">Instalar</strong>
                    </>
                  }
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-widest text-primary font-medium">
                Instalar en tu dispositivo
              </p>
              <div className="space-y-3">
                <Step
                  number={1}
                  icon={<Smartphone size={14} className="text-primary" />}
                  text={
                    <>
                      Abre{" "}
                      <strong className="text-foreground">kala-barre-studio.com.mx</strong> desde tu celular
                    </>
                  }
                />
                <Step
                  number={2}
                  icon={<Share size={14} className="text-blue-400" />}
                  text={
                    <>
                      En <strong className="text-foreground">iPhone</strong>: toca Compartir → Agregar a pantalla de inicio
                    </>
                  }
                />
                <Step
                  number={3}
                  icon={<MoreVertical size={14} className="text-foreground" />}
                  text={
                    <>
                      En <strong className="text-foreground">Android</strong>: menú (tres puntos) → Instalar aplicación
                    </>
                  }
                />
              </div>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={handleClose}
            className="mt-6 w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium tracking-wider uppercase hover:-translate-y-[1px] hover:shadow-[0_8px_24px_hsl(var(--primary)/0.3)] transition-all"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  icon,
  text,
}: {
  number: number;
  icon: React.ReactNode;
  text: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center text-[11px] font-bold text-primary">
        {number}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <span className="shrink-0">{icon}</span>
        <p className="text-sm text-muted-foreground leading-snug">{text}</p>
      </div>
    </div>
  );
}

export default InstallAppPrompt;
