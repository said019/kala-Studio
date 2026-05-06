import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import Schedule from "@/components/Schedule";
import { KALA_RING_COLORS, RingsTriple, type KalaRing } from "@/components/kala/RingsTriple";
import { Dumbbell, Music, Waves, Flame, Zap, Heart, Activity, Sparkles, Flower2, type LucideIcon, ChevronLeft, ChevronRight, ArrowUpRight, Play, ArrowRight } from "lucide-react";
import kalaHeroClass from "@/assets/kala/kala-hero-class.jpg";
import kalaClassEnergy from "@/assets/kala/kala-class-energy.jpg";
import kalaBarreLine from "@/assets/kala/kala-barre-line.jpg";
import kalaDetailAnkleWeights from "@/assets/kala/kala-detail-ankle-weights.jpg";
import kalaGallery01 from "@/assets/kala/kala-gallery-01.jpg";
import kalaGallery02 from "@/assets/kala/kala-gallery-02.jpg";
import kalaGallery03 from "@/assets/kala/kala-gallery-03.jpg";
import kalaGallery04 from "@/assets/kala/kala-gallery-04.jpg";
import kalaGallery05 from "@/assets/kala/kala-gallery-05.jpg";
import kalaGallery06 from "@/assets/kala/kala-gallery-06.jpg";
import kalaGallery07 from "@/assets/kala/kala-gallery-07.jpg";
import kalaGallery08 from "@/assets/kala/kala-gallery-08.jpg";
import kalaInstagram01 from "@/assets/kala/instagram/kala-instagram-01.jpg";
import kalaInstagram02 from "@/assets/kala/instagram/kala-instagram-02.jpg";
import kalaInstagram03 from "@/assets/kala/instagram/kala-instagram-03.jpg";
import kalaInstagramGradient from "@/assets/kala/instagram/kala-instagram-04.jpg";
import opheliaLogo from "@/assets/ophelia-logo-full.webp";
import imgPilates from "@/assets/pilates_2320695.png";
import imgYoga from "@/assets/pose-de-yoga.png";

/* ───── Types ───── */
type ClassTypeRow = {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  category: "barre" | "jumping" | "pilates" | "mixto";
  intensity: "ligera" | "media" | "pesada" | "todas";
  color: string;
  emoji: string;
  level: string;
  duration_min: number;
  capacity: number;
  is_active: boolean;
  sort_order: number;
};

type PackageRow = {
  id: string;
  name: string;
  num_classes: string;
  price: number;
  category: "barre" | "jumping" | "pilates" | "mixtos";
  validity_days: number;
  is_active: boolean;
  sort_order: number;
};

type TrialPlanRow = {
  id: string;
  name: string;
  classCategory: "barre" | "jumping" | "pilates";
  price: number;
  durationDays: number;
  classLimit: number;
  isNonTransferable: boolean;
  isNonRepeatable: boolean;
};

/* ───── Fallbacks ───── */
const FALLBACK_CLASS_TYPES: ClassTypeRow[] = [
  { id: "c1", name: "Barre", subtitle: "Energia, fuerza y postura", description: "Clase cercana, personalizada y apta para todos los niveles. Cada sesion cambia para trabajar fuerza, control, movilidad y compromiso con tu bienestar.", category: "barre", intensity: "media", color: "#76214D", emoji: "sparkles", level: "Todos los niveles", duration_min: 50, capacity: 5, is_active: true, sort_order: 1 },
];

const FALLBACK_PACKAGES: PackageRow[] = [
  { id: "p1", name: "2 Clases al mes",     num_classes: "2",  price: 230,  category: "barre", validity_days: 30, is_active: true, sort_order: 1 },
  { id: "p2", name: "3 Clases al mes",     num_classes: "3",  price: 355,  category: "barre", validity_days: 30, is_active: true, sort_order: 2 },
  { id: "p3", name: "4 Clases al mes",     num_classes: "4",  price: 470,  category: "barre", validity_days: 30, is_active: true, sort_order: 3 },
  { id: "p4", name: "5 Clases al mes",     num_classes: "5",  price: 585,  category: "barre", validity_days: 30, is_active: true, sort_order: 4 },
  { id: "p5", name: "2 Clases por semana", num_classes: "8",  price: 880,  category: "barre", validity_days: 30, is_active: true, sort_order: 5 },
  { id: "p6", name: "3 Clases por semana", num_classes: "12", price: 1080, category: "barre", validity_days: 30, is_active: true, sort_order: 6 },
  { id: "p7", name: "4 Clases por semana", num_classes: "16", price: 1200, category: "barre", validity_days: 30, is_active: true, sort_order: 7 },
  { id: "p8", name: "5 Clases por semana", num_classes: "20", price: 1300, category: "barre", validity_days: 30, is_active: true, sort_order: 8 },
  { id: "p9", name: "Clase suelta",        num_classes: "1",  price: 125,  category: "barre", validity_days: 30, is_active: true, sort_order: 9 },
];

const FALLBACK_TRIAL_PLANS: TrialPlanRow[] = [
  { id: "trial-barre", name: "Clase muestra Barre", classCategory: "barre", price: 50, durationDays: 7, classLimit: 1, isNonTransferable: true, isNonRepeatable: true },
];

const GALLERY_IMAGES = [
  kalaClassEnergy,
  kalaBarreLine,
  kalaGallery01,
  kalaGallery02,
  kalaGallery03,
  kalaGallery04,
  kalaGallery05,
  kalaGallery06,
  kalaGallery07,
  kalaGallery08,
  kalaDetailAnkleWeights,
  kalaInstagram03,
  kalaInstagram02,
  kalaInstagram01,
];

/* ── Mapa de imagen promocional por nombre de clase ── */
const CLASS_IMAGE_MAP: Record<string, string> = {
  "jumping fitness": kalaClassEnergy,
  "strong jump": kalaBarreLine,
  "jump & tone": kalaDetailAnkleWeights,
  "jump dance": kalaClassEnergy,
  "pilates mat": kalaBarreLine,
  "flow pilates · sculpt": kalaHeroClass,
  "flow pilates": kalaHeroClass,
  "hot pilates · barralates": kalaClassEnergy,
  "hot pilates": kalaClassEnergy,
  "barre": kalaHeroClass,
  "yoga": kalaBarreLine,
};
function getClassImage(name: string): string | undefined {
  return CLASS_IMAGE_MAP[name.toLowerCase()];
}

/* ───── Helpers ───── */
const ICON_MAP: Record<string, LucideIcon> = {
  dumbbell: Dumbbell, music: Music, waves: Waves, flame: Flame,
  zap: Zap, heart: Heart, activity: Activity, sparkles: Sparkles,
  flower2: Flower2,
  /* actual emoji chars from DB */
  "🏋️": Dumbbell, "🏋": Dumbbell, "💃": Music, "🧘": Waves,
  "🔥": Flame, "⚡": Zap, "❤️": Heart, "💪": Activity, "✨": Sparkles,
  "🎬": Activity, "🌸": Flower2, "🧘‍♀️": Waves,
};
function getCardIcon(emoji?: string, title?: string): LucideIcon {
  if (emoji && ICON_MAP[emoji]) return ICON_MAP[emoji];
  const t = (title || "").toLowerCase();
  if (t.includes("yoga") || t.includes("mindful") || t.includes("meditation")) return Flower2;
  if (t.includes("fitness") || t.includes("tone") || t.includes("strong")) return Dumbbell;
  if (t.includes("dance") || t.includes("music")) return Music;
  if (t.includes("pilates") || t.includes("flow")) return Waves;
  if (t.includes("hot") || t.includes("burn")) return Flame;
  if (t.includes("jump") || t.includes("cardio")) return Zap;
  return Activity;
}

function normalizeVideoUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/api/drive/video/")) return url;
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)\/preview/);
  if (m) return `/api/drive/video/${m[1]}`;
  return url;
}

function clampFocus(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const LandingProgressSphere = ({ onStart }: { onStart: () => void }) => {
  const ringMetrics: KalaRing[] = [
    {
      key: "constancia",
      label: "Constancia",
      value: "2/3",
      goalLabel: "clases asistidas",
      progress: 67,
      ...KALA_RING_COLORS.constancia,
    },
    {
      key: "esfuerzo",
      label: "Esfuerzo",
      value: "1/2",
      goalLabel: "retos o clases intensas",
      progress: 50,
      ...KALA_RING_COLORS.esfuerzo,
    },
    {
      key: "conexion",
      label: "Conexión",
      value: "6/10",
      goalLabel: "puntos de comunidad",
      progress: 60,
      ...KALA_RING_COLORS.conexion,
    },
  ];

  const ringExplanations = [
    {
      label: "Constancia",
      value: "Asistir",
      note: "Cada check-in suma una clase tomada.",
      color: KALA_RING_COLORS.constancia.color,
      bg: "rgba(118,33,77,0.09)",
    },
    {
      label: "Esfuerzo",
      value: "Retarte",
      note: "Las clases intensas y retos empujan este anillo.",
      color: KALA_RING_COLORS.esfuerzo.color,
      bg: "rgba(119,132,85,0.12)",
    },
    {
      label: "Conexión",
      value: "Conectar",
      note: "Eventos, invitadas y comunidad suman puntos.",
      color: KALA_RING_COLORS.conexion.color,
      bg: "rgba(245,138,36,0.13)",
    },
  ];

  const planGoals = [
    { plan: "Clase suelta", constancia: "1", esfuerzo: "1", conexion: "3" },
    { plan: "8 clases al mes", constancia: "2", esfuerzo: "2", conexion: "10" },
    { plan: "12 clases al mes", constancia: "3", esfuerzo: "2", conexion: "10" },
    { plan: "20 clases al mes", constancia: "5", esfuerzo: "3", conexion: "10" },
  ];

  const flowSteps = [
    "Compras un plan",
    "Reservas y tomas clase",
    "Recepción marca check-in",
    "Tus anillos suben solos",
  ];

  return (
    <section id="progreso" className="relative overflow-hidden px-5 py-20 sm:px-6 lg:px-[60px] lg:py-28">
      <div className="pointer-events-none absolute inset-x-0 top-10 h-[1px] bg-gradient-to-r from-transparent via-[#76214D]/18 to-transparent" />
      <div className="reveal mx-auto max-w-[1220px] opacity-0 translate-y-10 transition-all duration-700">
        <div className="grid gap-8 lg:grid-cols-[0.88fr_1.18fr] lg:items-stretch">
          <div className="flex flex-col justify-between rounded-[2rem] border border-[#E8CAC1] bg-[#FFF7F2] p-6 shadow-[0_22px_70px_rgba(118,33,77,0.08)] sm:p-8 lg:min-h-[640px]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-primary">
                Anillos de progreso
              </div>
              <h2 className="mt-5 font-bebas text-[clamp(2.65rem,5vw,5.55rem)] leading-[0.9] text-foreground">
                TU META<br />
                NO SE CONFIGURA,<br />
                <span className="text-primary">SE GANA</span>
              </h2>
              <p className="mt-6 max-w-[520px] text-[1rem] leading-[1.85] text-muted-foreground">
                Kala define las metas desde tu plan. Tu solo reservas, asistes y participas; el sistema convierte ese ritmo en tres anillos semanales.
              </p>
            </div>

            <div className="mt-8 space-y-3">
              {flowSteps.map((step, index) => (
                <div key={step} className="grid grid-cols-[42px_1fr] items-center gap-4 border-t border-[#E8CAC1]/80 py-4 first:border-t-0">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2E201C] text-[0.78rem] font-semibold tabular-nums text-[#FFF7F2]">
                    {index + 1}
                  </span>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[0.94rem] font-semibold text-[#2E201C]">{step}</p>
                    {index < flowSteps.length - 1 && <ArrowRight size={16} className="shrink-0 text-primary/55" />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2.35rem] border border-[#E8CAC1] bg-[#FFF0E4] p-2 shadow-[0_30px_90px_rgba(118,33,77,0.10)]">
            <div
              className="relative min-h-[640px] overflow-hidden rounded-[1.9rem] border border-[#FCE6E1] bg-[#FCE6E1] p-5 sm:p-7 lg:p-8"
              style={{
                backgroundImage: `linear-gradient(135deg, rgba(255,247,242,0.98) 0%, rgba(252,230,225,0.94) 48%, rgba(118,33,77,0.58) 100%), url(${kalaInstagramGradient})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,247,242,0.92)_0%,rgba(255,247,242,0.62)_46%,rgba(118,33,77,0.14)_100%)]" />
              <div className="absolute bottom-8 right-8 hidden h-40 w-40 rounded-full border border-[#FFF7F2]/45 bg-[#76214D]/8 sm:block" />

              <div className="relative grid min-h-[580px] gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                <div className="flex flex-col items-center justify-center">
                  <div className="rounded-full bg-[#2E201C] p-3 shadow-[0_26px_70px_rgba(46,32,28,0.26)]">
                    <RingsTriple
                      rings={ringMetrics}
                      centerLabel="semana actual"
                      centerValue="1/3"
                      centerSub="anillo cerrado, recompensa en progreso"
                      shellClassName="border-[#FCE6E1]/20 shadow-none"
                    />
                  </div>
                  <div className="mt-5 flex items-center gap-2 rounded-full border border-[#E8CAC1] bg-[#FFF7F2] px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#76214D] shadow-[0_12px_30px_rgba(118,33,77,0.08)]">
                    <span className="h-2 w-2 rounded-full bg-[#F58A24]" />
                    Se actualiza con cada visita
                  </div>
                </div>

                <div className="space-y-4">
                  {ringExplanations.map((item) => (
                    <div key={item.label} className="rounded-[1.35rem] border border-[#E8CAC1] bg-[#FFF7F2] p-4 shadow-[0_16px_40px_rgba(118,33,77,0.07)]">
                      <div className="flex items-start gap-4">
                        <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: item.bg }}>
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        </span>
                        <div>
                          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.17em] text-[#76214D]">{item.label}</p>
                          <p className="mt-1 text-[1.18rem] font-bold leading-tight text-[#2E201C]">{item.value}</p>
                          <p className="mt-1 text-[0.86rem] leading-[1.55] text-[#5F463F]">{item.note}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-[1.5rem] border border-[#E8CAC1] bg-[#FFF7F2]">
            <div className="grid grid-cols-[1.2fr_repeat(3,0.72fr)] border-b border-[#E8CAC1] bg-[#FCE6E1]/65 px-4 py-3 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-[#7B5B52] sm:px-5">
              <span>Plan</span>
              <span className="text-center">Constancia</span>
              <span className="text-center">Esfuerzo</span>
              <span className="text-center">Conexión</span>
            </div>
            {planGoals.map((row) => (
              <div key={row.plan} className="grid grid-cols-[1.2fr_repeat(3,0.72fr)] items-center border-b border-[#E8CAC1]/70 px-4 py-4 text-[0.82rem] last:border-b-0 sm:px-5">
                <span className="font-semibold text-[#2E201C]">{row.plan}</span>
                <span className="text-center font-semibold tabular-nums text-[#76214D]">{row.constancia}</span>
                <span className="text-center font-semibold tabular-nums text-[#778455]">{row.esfuerzo}</span>
                <span className="text-center font-semibold tabular-nums text-[#F58A24]">{row.conexion}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col justify-between rounded-[1.5rem] border border-primary/20 bg-primary p-5 text-[#FFF7F2]">
            <div>
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#FCE6E1]/80">Recompensa</p>
              <h3 className="mt-3 font-bebas text-[clamp(1.9rem,3vw,3.1rem)] leading-[0.92]">
                CIERRA LOS 3<br />Y DESBLOQUEA ALGO
              </h3>
              <p className="mt-4 text-[0.9rem] leading-[1.7] text-[#FCE6E1]/82">
                Clase extra, descuento, merch o premio interno. Kala decide la recompensa por plan.
              </p>
            </div>
            <button
              onClick={onStart}
              className="group mt-6 inline-flex w-fit items-center gap-3 rounded-full bg-[#FFF7F2] px-6 py-3 text-[0.76rem] font-semibold uppercase tracking-[0.13em] text-primary transition-transform duration-300 active:scale-[0.98]"
            >
              Ver paquetes
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 transition-transform duration-300 group-hover:translate-x-1">
                <ArrowUpRight size={14} />
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════
   INDEX — Redesign based on owner feedback
   ═══════════════════════════════════════════════════════════ */
const Index = () => {
  const [navScrolled, setNavScrolled] = useState(false);
  const [classTypes, setClassTypes] = useState<ClassTypeRow[]>(FALLBACK_CLASS_TYPES);
  const [packages, setPackages] = useState<PackageRow[]>(FALLBACK_PACKAGES);
  const [activePkgTab, setActivePkgTab] = useState<"barre" | "jumping" | "pilates" | "mixtos">("barre");
  const [playingVideoId, setPlayingVideoId] = useState<number | null>(null);
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const isAdminRole = ["admin", "super_admin", "instructor", "reception"].includes(user?.role ?? "");
  const membershipCtaPath = isAuthenticated
    ? (isAdminRole ? "/admin/dashboard" : "/app/checkout")
    : "/auth/register";

  const [instructors, setInstructors] = useState<{
    id: string;
    displayName: string;
    bio?: string;
    specialties?: string | string[];
    photoUrl?: string;
    photoFocusX?: number;
    photoFocusY?: number;
  }[]>([]);

  /* ── Queries ── */
  const { data: videoCardsData } = useQuery<{ data: { id: number; title: string; description: string; emoji: string; video_url?: string | null; thumbnail_url?: string | null }[] }>({
    queryKey: ["homepage-video-cards"],
    queryFn: async () => (await api.get("/homepage-video-cards")).data,
    staleTime: 1000 * 60 * 5,
  });
  const videoCards = videoCardsData?.data?.length
    ? videoCardsData.data
    : [
        { id: 1, title: "Barre Flow", description: "Movimiento, fuerza y postura en una clase cercana para todos los niveles.", emoji: "sparkles", video_url: null, thumbnail_url: null },
        { id: 2, title: "Barre Energy", description: "Una experiencia distinta cada clase para salir con energia y foco.", emoji: "activity", video_url: null, thumbnail_url: null },
        { id: 3, title: "Comunidad KALA", description: "Atencion personalizada, grupos pequenos y seguimiento real a tu avance.", emoji: "heart", video_url: null, thumbnail_url: null },
      ];

  const { data: plansData } = useQuery<{ data: any[] }>({
    queryKey: ["plans-public"],
    queryFn: async () => (await api.get("/plans")).data,
    staleTime: 1000 * 60 * 5,
  });
  const trialPlans: TrialPlanRow[] = (() => {
    const rows = Array.isArray(plansData?.data) ? plansData.data : [];
    const byCategory = new Map<"barre" | "jumping" | "pilates", TrialPlanRow>();
    for (const row of rows) {
      const isActive = (row?.isActive ?? row?.is_active) !== false;
      if (!isActive) continue;
      const category = String(row?.classCategory ?? row?.class_category ?? "").toLowerCase();
      const normalizedCategory = category === "all" ? "barre" : category;
      if (normalizedCategory !== "barre" && normalizedCategory !== "jumping" && normalizedCategory !== "pilates") continue;
      const repeatKey = String(row?.repeatKey ?? row?.repeat_key ?? "");
      const classLimit = Number(row?.classLimit ?? row?.class_limit ?? 0);
      const price = Number(row?.price ?? 0);
      const looksLikeTrial = repeatKey.startsWith("trial_single_session") || (classLimit === 1 && price <= 65);
      if (!looksLikeTrial || byCategory.has(normalizedCategory)) continue;
      byCategory.set(normalizedCategory, {
        id: String(row?.id ?? normalizedCategory + "-trial"),
        name: String(row?.name ?? "Clase muestra Barre"),
        classCategory: normalizedCategory,
        price,
        durationDays: Number(row?.durationDays ?? row?.duration_days ?? 7) || 7,
        classLimit: classLimit || 1,
        isNonTransferable: Boolean(row?.isNonTransferable ?? row?.is_non_transferable),
        isNonRepeatable: Boolean(row?.isNonRepeatable ?? row?.is_non_repeatable),
      });
    }
    const ordered = ["barre"].map((cat) => byCategory.get(cat as "barre")).filter(Boolean) as TrialPlanRow[];
    return ordered.length > 0 ? ordered : FALLBACK_TRIAL_PLANS;
  })();

  /* ── Effects ── */
  useEffect(() => {
    const handleScroll = () => setNavScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    api.get<{ data: ClassTypeRow[] }>("/admin/class-types").then(({ data }) => {
      const rows = Array.isArray(data?.data) ? data.data.filter((c) => c.is_active) : [];
      if (rows.length > 0) setClassTypes(rows);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get<{ data: PackageRow[] }>("/packages").then(({ data }) => {
      const rows = Array.isArray(data?.data) ? data.data : [];
      if (rows.length > 0) setPackages(rows);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/public/instructors").then(({ data }) => {
      const rows = Array.isArray(data?.data) ? data.data : [];
      if (rows.length > 0) setInstructors(rows);
    }).catch(() => {});
  }, []);

  // Gallery auto-rotate
  useEffect(() => {
    const timer = setInterval(() => {
      setGalleryIdx((prev) => (prev + 1) % GALLERY_IMAGES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Scroll reveal
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("opacity-100", "translate-y-0");
            entry.target.classList.remove("opacity-0", "translate-y-10");
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── NAV — Logo más grande ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-4 sm:px-6 lg:px-[60px] py-4 sm:py-5 transition-all duration-400 ${
          navScrolled
            ? "bg-background/92 backdrop-blur-[20px]"
            : "bg-gradient-to-b from-background/95 to-transparent"
        }`}
      >
        <a href="#" className="flex items-center">
          <img
            src={opheliaLogo}
            alt="Kala Barre Studio"
            className="w-[180px] sm:w-[220px] lg:w-[280px] max-w-full object-contain drop-shadow-[0_0_24px_rgba(118,33,77,0.18)]"
          />
        </a>
        <ul className="hidden lg:flex gap-8 list-none">
          {[
            { label: "Clases", id: "clases" },
            { label: "Horario", id: "horario" },
            { label: "Progreso", id: "progreso" },
            { label: "Paquetes", id: "membresias" },
            { label: "Coaches", id: "instructoras" },
            { label: "Galería", id: "galeria" },
            { label: "Contacto", id: "contacto" },
          ].map((item) => (
            <li key={item.id}>
              <button
                onClick={() => scrollTo(item.id)}
                className="text-muted-foreground text-[0.82rem] font-normal tracking-widest uppercase hover:text-foreground transition-colors bg-transparent border-none cursor-pointer"
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        {isAuthenticated && user ? (
          <button
            onClick={() => navigate(["admin","super_admin","instructor","reception"].includes(user.role) ? "/admin/dashboard" : "/app")}
            className="flex items-center gap-2 bg-primary/15 border border-primary/40 text-primary px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-[0.75rem] sm:text-[0.82rem] font-medium tracking-wide hover:bg-primary/25 transition-all max-w-[190px]"
          >
            <span className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[0.75rem] font-bold uppercase">
              {user.displayName?.[0] ?? user.email?.[0] ?? "U"}
            </span>
            <span className="truncate">
              {["admin","super_admin"].includes(user.role) ? "Admin" : user.displayName?.split(" ")[0] ?? "Mi cuenta"}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => navigate("/auth/login")}
              className="hidden sm:block text-muted-foreground text-[0.82rem] font-alilato tracking-widest uppercase hover:text-foreground transition-colors bg-transparent border-none cursor-pointer px-2"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => navigate("/auth/register")}
              className="bg-primary text-primary-foreground font-alilato px-4 sm:px-7 py-2.5 sm:py-3 rounded-full text-[0.75rem] sm:text-[0.82rem] font-medium tracking-wider uppercase hover:scale-[1.04] hover:shadow-[0_0_30px_hsl(var(--pink-glow)/0.35)] transition-all"
            >
              Unirse
            </button>
          </div>
        )}
      </nav>

      {/* ── HERO — Full-width photo, "Where Focus Goes, Energy Flows" ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={kalaHeroClass} alt="Alumnas en clase de barre en Kala Barre Studio" className="w-full h-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#2E201C]/45 via-[#2E201C]/25 to-background" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#2E201C]/65 via-[#2E201C]/25 to-transparent" />
        </div>
        <div className="relative z-10 text-center px-6 lg:px-[60px] pt-[140px] pb-20 max-w-[900px] mx-auto">
          <p className="font-alilato italic text-[clamp(1.1rem,2.2vw,1.6rem)] text-[#FFF7F2]/80 mb-6 animate-fade-up delay-200 tracking-wide">
            &ldquo;Where Focus Goes, Energy Flows&rdquo;
          </p>
          <h1 className="font-bebas text-[clamp(2.85rem,6.8vw,6.2rem)] leading-[0.9] tracking-tight text-[#FFF7F2] animate-fade-up delay-400 mb-12">
            LIBERA TU ENERGÍA<br />
            <span className="text-primary">Y DESCUBRE</span><br />
            <span style={{ WebkitTextStroke: "2px rgba(255,246,230,0.5)", color: "transparent" }}>LO FUERTE QUE ERES</span>
          </h1>
          <div className="flex gap-4 justify-center items-center flex-wrap animate-fade-up delay-800">
            <button
              onClick={() => navigate("/auth/register")}
              className="bg-primary text-primary-foreground px-10 py-[18px] rounded-full text-[0.9rem] font-medium tracking-wider uppercase inline-flex items-center gap-[10px] hover:-translate-y-[3px] hover:scale-[1.02] hover:shadow-[0_20px_50px_hsl(var(--primary)/0.4)] transition-all"
            >
              Comenzar hoy
              <span className="w-[22px] h-[22px] bg-primary-foreground/20 rounded-full flex items-center justify-center"><ArrowUpRight size={12} /></span>
            </button>
            <button
              onClick={() => scrollTo("clases")}
              className="text-[#FFF7F2] text-[0.85rem] font-normal tracking-wider uppercase flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer"
            >
              <span className="w-[42px] h-[42px] border border-[#FFF7F2]/30 rounded-full flex items-center justify-center"><Play size={14} /></span>
              Ver clases
            </button>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-pulse-dot z-10">
          <div className="w-[1px] h-10 bg-gradient-to-b from-transparent to-[#FFF7F2]/40" />
          <span className="text-[0.6rem] tracking-[0.2em] uppercase text-[#FFF7F2]/40">Scroll</span>
        </div>
      </section>

      {/* ── EXPERIENCIA — BARRE · COMUNIDAD · BIENESTAR ── */}
      <div className="bg-secondary border-t border-b border-border">
        <div className="grid grid-cols-3 text-center">
          <div className="py-8 sm:py-10 px-3 sm:px-5 border-r border-border hover:bg-[hsl(var(--primary)/0.03)] transition-colors group cursor-default">
            <div className="flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: "#76214D20", border: "1px solid #76214D40" }}>
                <img src={imgPilates} alt="Barre" className="h-8 w-8 sm:h-9 sm:w-9 object-contain" style={{ filter: "brightness(0) invert(1)", opacity: 0.9 }} />
              </div>
            </div>
            <div className="font-bebas text-[1.4rem] sm:text-[2rem] leading-none mb-1 sm:mb-2" style={{ color: "#76214D" }}>BARRE</div>
            <div className="text-[0.65rem] sm:text-[0.78rem] text-muted-foreground tracking-wide">Fuerza, postura y control</div>
          </div>
          <div className="py-8 sm:py-10 px-3 sm:px-5 border-r border-border hover:bg-[hsl(var(--primary)/0.03)] transition-colors group cursor-default">
            <div className="flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: "#77845520", border: "1px solid #77845540" }}>
                <img src={imgPilates} alt="Pilates" className="h-8 w-8 sm:h-9 sm:w-9 object-contain" style={{ filter: "brightness(0) invert(1)", opacity: 0.9 }} />
              </div>
            </div>
            <div className="font-bebas text-[1.4rem] sm:text-[2rem] leading-none mb-1 sm:mb-2" style={{ color: "#E9745F" }}>COMUNIDAD</div>
            <div className="text-[0.65rem] sm:text-[0.78rem] text-muted-foreground tracking-wide">Cercana, casual y personalizada</div>
          </div>
          <div className="py-8 sm:py-10 px-3 sm:px-5 hover:bg-[hsl(var(--primary)/0.03)] transition-colors group cursor-default">
            <div className="flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: "#F58A2420", border: "1px solid #F58A2440" }}>
                <img src={imgYoga} alt="Yoga" className="h-8 w-8 sm:h-9 sm:w-9 object-contain" style={{ filter: "brightness(0) invert(1)", opacity: 0.9 }} />
              </div>
            </div>
            <div className="font-bebas text-[1.4rem] sm:text-[2rem] leading-none mb-1 sm:mb-2" style={{ color: "#F58A24" }}>BIENESTAR</div>
            <div className="text-[0.65rem] sm:text-[0.78rem] text-muted-foreground tracking-wide">Compromiso con tus objetivos</div>
          </div>
        </div>
      </div>

      {/* ── MANIFIESTO ── */}
      <section className="py-20 lg:py-28 px-6 lg:px-[60px] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.08)_0%,transparent_60%)] pointer-events-none" />
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700 relative z-10 max-w-[800px] mx-auto text-center">
          <h2 className="font-bebas text-[clamp(2.25rem,3.7vw,3.65rem)] leading-[0.95] text-foreground mb-8">
            MÁS QUE UN ESTUDIO,<br /><span className="text-primary">UN ESPACIO PARA TI</span>
          </h2>
          <p className="text-[1.05rem] text-muted-foreground leading-[1.9] mb-6">
            Kala Barre Studio es un espacio cercano, energetico y facil de entender.
            Cada clase esta pensada para que des un paso mas hacia tus objetivos,
            te sientas acompanada y hagas algo real por tu crecimiento.
          </p>
          <p className="text-[1rem] text-foreground/80 leading-[1.8] italic font-alilato">
            &ldquo;Bienestar, comunidad y compromiso en clases pequenas con atencion personalizada&rdquo;
          </p>
        </div>
      </section>

      <LandingProgressSphere onStart={() => navigate(membershipCtaPath)} />

      {/* ── CLASES — 8 clases, card flip ── */}
      <section id="clases" className="py-16 lg:py-24 px-6 lg:px-[60px]">
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700">
          <div className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-4 flex items-center gap-[10px]">
            <span className="w-[30px] h-[1px] bg-primary inline-block" />
            Nuestras modalidades
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-4">
            <h2 className="font-bebas text-[clamp(2.35rem,4.1vw,4rem)] leading-[0.95] text-foreground">NUESTRAS CLASES</h2>
            <p className="text-[0.88rem] text-muted-foreground max-w-[360px] leading-[1.7]">
              Toca una clase para descubrir de qué se trata. Cada semana cambian los tipos, no los horarios.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 mb-10 text-[0.72rem] tracking-wider uppercase">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#76214D]" /> Barre</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#778455]" /> 4 a 5 lugares</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#F58A24]" /> Cada clase es diferente</span>
          </div>
        </div>
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {classTypes.slice(0, 8).map((c) => {
            const catBorder: Record<string, string> = { barre: "#76214D", jumping: "#76214D", pilates: "#E9745F", mixto: "#F58A24" };
            const accent = catBorder[c.category] ?? "#76214D";
            const isFlipped = flippedCard === c.id;
            const Icon = getCardIcon(c.emoji, c.name);
            const classImg = getClassImage(c.name);
            return (
              <div key={c.id} className="cursor-pointer group" style={{ perspective: "1200px" }}
                onClick={() => setFlippedCard(isFlipped ? null : c.id)}>
                <div className="relative aspect-[3/4]" style={{ transformStyle: "preserve-3d", transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)", transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)" }}>
                  {/* Front — solo imagen */}
                  <div className="rounded-2xl overflow-hidden absolute inset-0"
                    style={{ backfaceVisibility: "hidden", border: "2px solid " + accent + "50" }}>
                    {classImg ? (
                      <img src={classImg} alt={c.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: accent + "10" }}>
                        <Icon size={48} style={{ color: accent, opacity: 0.4 }} />
                        <h3 className="font-gulfs text-lg text-foreground uppercase">{c.name}</h3>
                      </div>
                    )}
                  </div>
                  {/* Back — información */}
                  <div className="rounded-2xl p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center text-center gap-2 sm:gap-3 absolute inset-0 overflow-hidden"
                    style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", border: "2px solid " + accent, background: "linear-gradient(160deg, #FFFFFF 0%, " + accent + "12 100%)" }}>
                    <Icon size={22} className="sm:hidden" style={{ color: accent }} />
                    <Icon size={28} className="hidden sm:block" style={{ color: accent }} />
                    <h3 className="font-gulfs text-[1.1rem] sm:text-[1.5rem] lg:text-[1.8rem] text-foreground uppercase tracking-wide leading-tight">{c.name}</h3>
                    {c.subtitle && <p className="text-[0.72rem] sm:text-[0.85rem] font-medium -mt-0.5" style={{ color: accent }}>{c.subtitle}</p>}
                    <p className="text-[0.75rem] sm:text-[0.88rem] text-muted-foreground leading-[1.6] sm:leading-[1.75] line-clamp-4 sm:line-clamp-none">{c.description}</p>
                    <div className="flex gap-2 text-[0.65rem] sm:text-[0.75rem] text-muted-foreground mt-1">
                      <span>{c.duration_min} min</span><span>·</span><span>{c.level}</span>
                    </div>
                    <div className="flex items-center gap-3 pt-2 sm:pt-3 border-t w-full justify-center" style={{ borderColor: accent + "30" }}>
                      <span className="text-[0.65rem] sm:text-[0.75rem] font-medium tracking-wider" style={{ color: accent }}>{c.category.toUpperCase()}</span>
                      <span className="text-[0.65rem] sm:text-[0.75rem] text-muted-foreground">·</span>
                      <span className="text-[0.65rem] sm:text-[0.75rem] text-muted-foreground">Max. {c.capacity}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[0.72rem] text-muted-foreground text-center mt-8 tracking-wide">
          CADA SEMANA CAMBIAN LOS TIPOS DE CLASES, NO LOS HORARIOS · TOCA UNA TARJETA PARA VER MÁS
        </p>
      </section>

      {/* ── HORARIO ── */}
      <Schedule />

      {/* ── VIDEOS ── */}
      <section id="videos" className="py-16 lg:py-24 px-6 lg:px-[60px]">
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700">
          <div className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-4 flex items-center gap-[10px]">
            <span className="w-[30px] h-[1px] bg-primary inline-block" />
            Conoce la experiencia
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-10">
            <h2 className="font-bebas text-[clamp(2.35rem,4.1vw,4rem)] leading-[0.95] text-foreground">ARE U READY?</h2>
            <p className="text-[0.88rem] text-muted-foreground max-w-[360px] leading-[1.7]">
              Descubre la energia de cada clase. Fragmentos de lo que te espera en Kala.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {videoCards.map((v) => {
              const videoUrl = normalizeVideoUrl(v.video_url);
              const isPlaying = playingVideoId === v.id;
              const hasThumbnail = Boolean(v.thumbnail_url);
              const handlePlay = () => {
                if (!videoUrl) return;
                setPlayingVideoId(v.id);
                setTimeout(() => { const el = videoRefs.current[v.id]; if (el) el.play().catch(() => {}); }, 100);
              };
              return (
                <div key={v.id} className="group rounded-3xl overflow-hidden bg-secondary border border-border hover:border-primary/50 transition-all">
                  <div className="relative aspect-video bg-gradient-to-br from-white via-[#FFF0E4] to-[#FCE6E1] flex items-center justify-center overflow-hidden">
                    {videoUrl && isPlaying ? (
                      <video ref={(el) => { videoRefs.current[v.id] = el; }} src={videoUrl}
                        className="absolute inset-0 w-full h-full object-contain bg-black"
                        controls autoPlay playsInline title={v.title} onEnded={() => setPlayingVideoId(null)} />
                    ) : videoUrl ? (
                      <button onClick={handlePlay} className="absolute inset-0 w-full h-full cursor-pointer focus:outline-none" aria-label={"Reproducir " + v.title}>
                        {hasThumbnail ? (
                          <img src={v.thumbnail_url!} alt={v.title} className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <video src={videoUrl} className="absolute inset-0 w-full h-full object-contain bg-black pointer-events-none" preload="metadata" muted playsInline />
                        )}
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/80 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_40px_hsl(var(--primary)/0.4)]">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="text-white ml-1"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                          </div>
                        </div>
                      </button>
                    ) : (
                      <>
                        {hasThumbnail ? (
                          <img src={v.thumbnail_url!} alt={v.title} className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.15)_0%,transparent_65%)]" />
                        )}
                        <div className="relative flex flex-col items-center gap-3">
                          <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_40px_hsl(var(--primary)/0.3)]">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-primary ml-1"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                          </div>
                          <span className="text-[0.65rem] tracking-[0.15em] uppercase text-primary/60 font-medium">Video próximamente</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      {(() => { const Ic = getCardIcon(v.emoji, v.title); return <Ic size={20} className="text-primary flex-shrink-0" />; })()}
                      <h3 className="font-syne font-bold text-[1rem] text-foreground">{v.title}</h3>
                    </div>
                    <p className="text-[0.82rem] text-muted-foreground leading-[1.6]">{v.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PAQUETES ── */}
      <section id="membresias" className="py-20 lg:py-[120px] px-6 lg:px-[60px] bg-secondary">
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700">
          <div className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-4 flex items-center gap-[10px]">
            <span className="w-[30px] h-[1px] bg-primary inline-block" />
            Inversión
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-12">
            <h2 className="font-bebas text-[clamp(2.55rem,4.6vw,4.4rem)] leading-[0.95] text-foreground">ELIGE TU<br />PAQUETE</h2>
            <p className="text-[0.88rem] text-muted-foreground max-w-[360px] leading-[1.7]">
              Paquetes mensuales, mensualidades por semana y clase muestra de $50. Compra directo desde la app.
            </p>
          </div>
          {/* Clase muestra */}
          <div className="rounded-3xl border border-primary/30 bg-background mb-8 p-5 sm:p-7">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 mb-5">
              <div>
                <p className="text-[0.68rem] tracking-[0.15em] uppercase text-primary font-medium">Clase muestra</p>
                <h3 className="font-syne font-bold text-[1.4rem] text-foreground mt-1">Primera experiencia KALA</h3>
              </div>
              <p className="text-[0.8rem] text-muted-foreground lg:text-right">
                $50 por persona · no transferible · no repetible
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {trialPlans.map((plan) => {
                const accent = "#76214D";
                const icon = imgPilates;
                return (
                  <div key={plan.id} className="rounded-2xl border border-border bg-secondary p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl border flex items-center justify-center" style={{ borderColor: accent + "55", background: accent + "18" }}>
                        <img src={icon} alt="" className="h-8 w-8 object-contain" style={{ filter: "brightness(0) invert(1) sepia(1) saturate(0) hue-rotate(0deg) brightness(0.95)", opacity: 0.85 }} />
                      </div>
                      <div>
                        <p className="text-[0.7rem] tracking-[0.15em] uppercase" style={{ color: accent }}>Barre</p>
                        <h4 className="font-syne font-bold text-[1rem] text-foreground">{plan.name}</h4>
                      </div>
                    </div>
                    <div className="flex items-end gap-1">
                      <span className="font-alilato text-[2.8rem] leading-none text-primary">${plan.price.toLocaleString("es-MX")}</span>
                      <span className="text-[0.75rem] text-muted-foreground mb-1">MXN</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[0.67rem]">
                      <span className="px-2 py-1 rounded-full border border-primary/30 text-primary">{plan.classLimit} clase</span>
                      <span className="px-2 py-1 rounded-full border border-border text-muted-foreground">{plan.durationDays} días vigencia</span>
                      {plan.isNonTransferable && <span className="px-2 py-1 rounded-full border border-amber-300/25 text-amber-300">No transferible</span>}
                      {plan.isNonRepeatable && <span className="px-2 py-1 rounded-full border border-rose-300/25 text-rose-300">No repetible</span>}
                    </div>
                    <button onClick={() => navigate(membershipCtaPath)}
                      className="mt-2 w-full py-3 rounded-full text-[0.76rem] font-medium tracking-wider uppercase border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all">
                      Quiero mi clase muestra
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Clase suelta */}
          <div className="rounded-3xl border border-border bg-background mb-8 p-5 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-[0.68rem] tracking-[0.15em] uppercase text-primary font-medium">Clase suelta — Visita</p>
                <h3 className="font-syne font-bold text-[1.4rem] text-foreground mt-1">$125 MXN por clase</h3>
              </div>
              <p className="text-[0.8rem] text-muted-foreground">
                Sin paquete · Pago por sesion
              </p>
              <button onClick={() => navigate(membershipCtaPath)}
                className="mt-2 sm:mt-0 px-6 py-3 rounded-full text-[0.76rem] font-medium tracking-wider uppercase border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all whitespace-nowrap">
                Reservar visita
              </button>
            </div>
          </div>
          {/* Category tabs */}
          <div className="flex gap-2 mb-8 flex-wrap">
            {(["barre"] as const).map((cat) => {
              const tabColors: Record<string, string> = { barre: "#76214D", jumping: "#76214D", pilates: "#E9745F", mixtos: "#F58A24" };
              const tabColor = tabColors[cat] ?? "#76214D";
              const isActive = activePkgTab === cat;
              return (
                <button key={cat} onClick={() => setActivePkgTab(cat)}
                  className={"px-5 py-2 rounded-full text-[0.78rem] font-medium tracking-wide uppercase transition-all " + (
                    isActive
                      ? "text-black shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  )}
                  style={isActive ? { backgroundColor: tabColor, borderColor: tabColor } : { borderColor: tabColor + "40" }}>
                  {cat === "barre" ? "Barre" : cat}
                </button>
              );
            })}
          </div>
          {/* Package grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {packages
              .filter((p) => p.category === activePkgTab && p.is_active)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((p, i, arr) => {
                const isUnlimited = p.num_classes?.toString().toUpperCase() === "ILIMITADO";
                const isPopular = i === arr.length - 2 && !isUnlimited;
                const catColor: Record<string, string> = { barre: "#76214D", jumping: "#76214D", pilates: "#E9745F", mixtos: "#F58A24" };
                const pkgAccent = catColor[p.category] ?? "#76214D";
                const isDarkText = false;
                return (
                  <div key={p.id}
                    className={"relative rounded-3xl p-8 flex flex-col gap-4 transition-all hover:-translate-y-2 " + (
                      isUnlimited
                        ? "shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
                        : isPopular
                        ? "bg-background shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
                        : "bg-background border border-border"
                    )}
                    style={isUnlimited ? { backgroundColor: pkgAccent, border: "2px solid " + pkgAccent } : isPopular ? { border: "2px solid " + pkgAccent + "99" } : { borderColor: pkgAccent + "30" }}>
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[0.6rem] tracking-[0.15em] uppercase px-3 py-1 rounded-full font-medium whitespace-nowrap" style={{ backgroundColor: pkgAccent }}>Más popular</div>
                    )}
                    {isUnlimited && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[0.6rem] tracking-[0.15em] uppercase px-3 py-1 rounded-full font-medium whitespace-nowrap" style={{ backgroundColor: "#FFF7F2", color: pkgAccent }}>Mejor valor</div>
                    )}
                    <div className={"text-[0.7rem] tracking-[0.15em] uppercase font-medium " + (isUnlimited ? (isDarkText ? "text-black/60" : "text-white/70") : "text-muted-foreground")}>
                      {p.validity_days ?? 30} días de vigencia
                    </div>
                    <div className={"font-bebas text-[0.95rem] tracking-wide " + (isUnlimited ? (isDarkText ? "text-black" : "text-white") : "text-foreground")}>
                      {isUnlimited ? "ILIMITADO" : p.num_classes + " CLASES"}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={"font-alilato text-[3.5rem] leading-none " + (isUnlimited ? (isDarkText ? "text-black" : "text-white") : "")}
                        style={isUnlimited ? {} : { color: pkgAccent }}>
                        ${Number(p.price).toLocaleString()}
                      </span>
                      <span className={"text-[0.75rem] " + (isUnlimited ? (isDarkText ? "text-black/60" : "text-white/60") : "text-muted-foreground")}>MXN</span>
                    </div>
                    {!isUnlimited && Number(p.num_classes) > 0 && (
                      <div className={"text-[0.78rem] " + (isUnlimited ? (isDarkText ? "text-black/60" : "text-white/70") : "text-muted-foreground")}>
                        ${(Number(p.price) / Number(p.num_classes)).toFixed(0)}/clase
                      </div>
                    )}
                    <div className="mt-auto">
                      <button onClick={() => navigate(membershipCtaPath)}
                        className={"w-full py-3 rounded-full text-[0.78rem] font-medium tracking-wider uppercase transition-all"}
                        style={isUnlimited
                          ? { backgroundColor: "#FFF7F2", color: "#2E201C" }
                          : { border: "1px solid " + pkgAccent, color: pkgAccent }
                        }>
                        Elegir paquete
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
          <p className="text-xs text-muted-foreground mt-8 text-center">
            Vigencia desde la primera clase · Aplican términos y condiciones · Precios en MXN
          </p>
        </div>
      </section>

      {/* ── INSTRUCTORAS ── */}
      <section id="instructoras" className="py-16 lg:py-24 px-6 lg:px-[60px]">
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700">
          <div className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-4 flex items-center gap-[10px]">
            <span className="w-[30px] h-[1px] bg-primary inline-block" />
            El equipo
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-12">
            <h2 className="font-bebas text-[clamp(2.35rem,4.1vw,4rem)] leading-[0.95] text-foreground">COACHES</h2>
            <p className="text-[0.88rem] text-muted-foreground max-w-[360px] leading-[1.7]">
              Certificadas, apasionadas y dedicadas a que cada clase sea tu mejor versión.
            </p>
          </div>
          <div className={"grid grid-cols-1 " + ((instructors.length > 0 ? instructors.length : 2) === 1 ? "max-w-md mx-auto" : "sm:grid-cols-2") + " " + ((instructors.length > 0 ? instructors.length : 2) >= 3 ? "lg:grid-cols-3" : "") + " gap-6"}>
            {(() => {
              /* Known coach extra data — always shown regardless of API */
              const KNOWN_COACHES: Record<string, { coachTitle: string; disciplines: string; funFact: string }> = {
                karla: { coachTitle: "COACH KARLA", disciplines: "Barre", funFact: "Te recibe con energia cercana y una clase diferente cada dia" },
              };
              function matchCoach(name: string) {
                const n = name.toLowerCase().trim();
                for (const [key, val] of Object.entries(KNOWN_COACHES)) {
                  if (n.includes(key)) return val;
                }
                return null;
              }
              const items = instructors.length > 0
                ? instructors.map((inst) => {
                    const known = matchCoach(inst.displayName);
                    return {
                      key: inst.id,
                      label: inst.displayName,
                      coachTitle: known?.coachTitle ?? null,
                      sub: Array.isArray(inst.specialties)
                        ? (inst.specialties as unknown as string[]).join(" & ")
                        : typeof inst.specialties === "string" && inst.specialties ? inst.specialties : "Instructora",
                      disciplines: known?.disciplines ?? null,
                      bio: inst.bio || null,
                      funFact: known?.funFact ?? null,
                      photoUrl: inst.photoUrl || null,
                      photoFocusX: clampFocus(inst.photoFocusX),
                      photoFocusY: clampFocus(inst.photoFocusY),
                    };
                  })
                : [
                    { key: "karla", label: "Karla Cruz", coachTitle: "COACH KARLA",
                      sub: "Barre · Bienestar · Comunidad",
                      disciplines: "Barre",
                      bio: "Atencion cercana y personalizada para que cada alumna avance a su ritmo y disfrute el proceso.",
                      funFact: "Cada clase cambia para que tu dia tambien cambie",
                      photoUrl: null, photoFocusX: 50, photoFocusY: 50 },
                  ];
              return items.map((inst) => (
              <div key={inst.key} className="group rounded-3xl overflow-hidden bg-secondary border border-border hover:border-primary/50 hover:-translate-y-2 transition-all">
                <div className="aspect-square bg-gradient-to-br from-white via-[#FFF0E4] to-[#FCE6E1] flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,hsl(var(--primary)/0.18)_0%,transparent_65%)]" />
                  {inst.photoUrl ? (
                    <img src={inst.photoUrl} alt={inst.label}
                      className="absolute inset-0 w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700"
                      style={{ objectPosition: clampFocus(inst.photoFocusX) + "% " + clampFocus(inst.photoFocusY) + "%" }} />
                  ) : (
                    <div className="relative flex flex-col items-center gap-4">
                      <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-[#76214D]/25 to-[#E9745F]/15 border-2 border-[#76214D]/30 shadow-[0_0_60px_hsl(var(--primary)/0.2)]">
                        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-[#76214D]/50">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <span className="text-[0.65rem] tracking-[0.2em] uppercase text-[#76214D]/50 font-medium">Foto próximamente</span>
                    </div>
                  )}
                </div>
                <div className="p-7">
                  {inst.coachTitle && (
                    <div className="font-bebas text-[1.6rem] tracking-wide leading-none mb-1" style={{ color: "#F58A24" }}>
                      {inst.coachTitle}
                    </div>
                  )}
                  {inst.disciplines && (
                    <p className="text-[0.82rem] text-foreground mt-3">
                      <span className="text-muted-foreground">Disciplinas: </span>
                      <span className="font-medium">{inst.disciplines}</span>
                    </p>
                  )}
                  {inst.funFact && (
                    <p className="text-[0.82rem] text-foreground mt-1">
                      <span className="text-muted-foreground">Fun Fact: </span>
                      <span>{inst.funFact}</span>
                    </p>
                  )}
                </div>
              </div>
            ));
            })()}
          </div>
        </div>
      </section>

      {/* ── HISTORIA DE KALA ── */}
      <section className="py-20 lg:py-28 px-6 lg:px-[60px] bg-secondary relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,hsl(var(--primary)/0.06)_0%,transparent_50%)] pointer-events-none" />
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="relative">
              <div className="rounded-3xl overflow-hidden aspect-[4/5] relative">
                <img src={kalaClassEnergy} alt="Clase grupal en Kala Barre Studio" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#2E201C]/55 to-transparent" />
              </div>
              <div className="absolute -bottom-4 -right-4 lg:-right-8 bg-primary/90 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-[0_20px_60px_hsl(var(--primary)/0.3)]">
                <p className="font-alilato italic text-[1.1rem] text-primary-foreground leading-tight">
                  &ldquo;Ella era mi<br />lugar seguro&rdquo;
                </p>
              </div>
            </div>
            <div>
              <div className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-4 flex items-center gap-[10px]">
                <span className="w-[30px] h-[1px] bg-primary inline-block" />
                Nuestra historia
              </div>
              <h2 className="font-bebas text-[clamp(2.25rem,3.7vw,3.65rem)] leading-[0.95] text-foreground mb-8">
                ¿POR QUÉ<br /><span className="text-primary">&ldquo;KALA&rdquo;?</span>
              </h2>
              <div className="space-y-5 text-[0.95rem] text-muted-foreground leading-[1.85]">
                <p><span className="text-foreground font-medium">Kala</span> nace como un studio cercano, casual y lleno de energia para mujeres comprometidas con su salud y bienestar.</p>
                <p>La experiencia esta pensada para sentirse como si te recibiera una amiga en casa: clara, calida y personalizada.</p>
                <p>Cada reserva es un paso mas hacia tus objetivos, y cada clase cambia para mantener tu motivacion activa.</p>
                <p>Por eso Kala no es solo un studio de ejercicio.</p>
                <p className="font-alilato italic text-foreground text-[1.1rem]">
                  Es un lugar donde puedes venir a ser tú misma.</p>
              </div>
              <div className="mt-8 flex items-center gap-3">
                <div className="w-12 h-[1px] bg-primary" />
                <span className="text-[0.78rem] text-primary font-medium tracking-wide">Karla Cruz — Fundadora</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── POLÍTICAS ── */}
      <section id="politicas" className="py-16 lg:py-24 px-6 lg:px-[60px]">
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700">
          <div className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-4 flex items-center gap-[10px]">
            <span className="w-[30px] h-[1px] bg-primary inline-block" />
            Información importante
          </div>
          <h2 className="font-bebas text-[clamp(2.35rem,4.1vw,4rem)] leading-[0.95] text-foreground mb-10">POLÍTICAS DE CLASE</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { num: "01", title: "Primera vez", text: "Si eres nueva, llega 15 minutos antes para recibir indicaciones y prepararte sin prisa." },
              { num: "02", title: "Reservacion", text: "Todas las clases requieren reservacion previa. Cupo regular de 4 a 5 lugares; eventos especiales o privados pueden llegar a 6." },
              { num: "03", title: "Cancelaciones", text: "Alumnas nuevas cancelan de 4 a 5 horas antes. Comunidad KALA puede cancelar hasta 2 horas antes sin penalizacion." },
              { num: "04", title: "No-show", text: "Si no asistes o cancelas tarde, la clase se considera tomada y no se puede revalidar." },
              { num: "05", title: "Pagos", text: "Transferencia a BBVA · Karla Cruz · CLABE: 012 700 01539444488 8. Tambien se acepta pago fisico con tarjeta o efectivo." },
              { num: "06", title: "Vigencia", text: "Paquetes y mensualidades tienen vigencia de 1 mes a partir de la compra." },
              { num: "07", title: "Asistencia", text: "El check-in con QR ayuda a registrar asistencias, recompensas y seguimiento de progreso." },
              { num: "08", title: "Comunidad", text: "Los recordatorios, promociones y recompensas se comunican principalmente por WhatsApp." },
            ].map((p) => (
              <div key={p.num} className="rounded-2xl border border-border bg-secondary p-5 hover:border-primary/30 transition-all">
                <div className="font-bebas text-[2.5rem] text-foreground/[0.07] leading-none -mb-1">{p.num}</div>
                <h4 className="font-syne font-bold text-[0.92rem] text-foreground mb-2">{p.title}</h4>
                <p className="text-[0.8rem] text-muted-foreground leading-[1.65]">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIOS ── */}
      <section className="py-16 lg:py-24 px-6 lg:px-[60px] bg-secondary">
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700">
          <div className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-4 flex items-center gap-[10px]">
            <span className="w-[30px] h-[1px] bg-primary inline-block" />
            Lo que dicen nuestras alumnas
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-12">
            <h2 className="font-bebas text-[clamp(2.35rem,4.1vw,4rem)] leading-[0.95] text-foreground">EXPERIENCIAS<br />REALES</h2>
            <p className="text-[0.88rem] text-muted-foreground max-w-[360px] leading-[1.7]">
              Cada historia nos inspira a seguir creando un espacio único.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { name: "Ana Garcia", time: "Alumna frecuente", text: "Kala se siente cercano desde que entras. Las clases son pequenas y siempre me corrigen con mucha atencion.", stars: 5 },
              { name: "Laura Martinez", time: "Comunidad KALA", text: "Me gusta que cada clase es diferente. Salgo con energia y con la sensacion de que hice algo por mi.", stars: 5 },
              { name: "Sofia Hernandez", time: "Alumna desde 2025", text: "Reservar es facil y los recordatorios por WhatsApp me ayudan a no perder mis clases.", stars: 5 },
              { name: "Daniela Rios", time: "Clase muestra", text: "Fui por una clase muestra y me senti acompanada, aunque era mi primera vez.", stars: 5 },
              { name: "Mariana Lopez", time: "Paquete mensual", text: "La energia del studio cambia mi dia. Es casual, bonito y muy humano.", stars: 5 },
              { name: "Valeria Torres", time: "Comunidad KALA", text: "El seguimiento de asistencias y recompensas me motiva a seguir constante.", stars: 5 },
            ].map((t, i) => (
              <div key={i} className="rounded-2xl border border-border bg-background p-6 hover:border-primary/30 transition-all flex flex-col gap-4">
                <div className="flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, s) => (
                    <svg key={s} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[#F58A24]">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  ))}
                </div>
                <p className="text-[0.88rem] text-muted-foreground leading-[1.7] flex-1 italic">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div className="flex items-center gap-3 pt-3 border-t border-border">
                  <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-[0.8rem] font-bold text-primary">
                    {t.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <div className="text-[0.85rem] font-medium text-foreground">{t.name}</div>
                    <div className="text-[0.7rem] text-muted-foreground">{t.time}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GALERÍA ROTATIVA ── */}
      <section id="galeria" className="py-16 lg:py-24 px-6 lg:px-[60px]">
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700">
          <div className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-4 flex items-center gap-[10px]">
            <span className="w-[30px] h-[1px] bg-primary inline-block" />
            Galería
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-10">
            <h2 className="font-bebas text-[clamp(2.35rem,4.1vw,4rem)] leading-[0.95] text-foreground">
              VIVE LA<br />EXPERIENCIA
            </h2>
            <p className="text-[0.88rem] text-muted-foreground max-w-[360px] leading-[1.7]">
              Cada sesión es única. Capturamos los mejores momentos de nuestras alumnas.
            </p>
          </div>
          {/* Main carousel */}
          <div className="relative rounded-3xl overflow-hidden bg-black h-[400px] sm:h-[500px] lg:h-[600px] mb-5 group">
            {GALLERY_IMAGES.map((img, i) => (
              <img key={i} src={img} alt={"Kala Barre Studio momento " + (i + 1)}
                className={"absolute inset-0 w-full h-full object-contain transition-opacity duration-1000 " + (i === galleryIdx ? "opacity-100" : "opacity-0")} />
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            <button onClick={() => setGalleryIdx((prev) => (prev - 1 + GALLERY_IMAGES.length) % GALLERY_IMAGES.length)}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60">
              <ChevronLeft size={20} />
            </button>
            <button onClick={() => setGalleryIdx((prev) => (prev + 1) % GALLERY_IMAGES.length)}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60">
              <ChevronRight size={20} />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {GALLERY_IMAGES.map((_, i) => (
                <button key={i} onClick={() => setGalleryIdx(i)}
                  className={"w-2 h-2 rounded-full transition-all " + (i === galleryIdx ? "bg-primary w-6" : "bg-white/50 hover:bg-white/70")} />
              ))}
            </div>
          </div>
          {/* Thumbnails */}
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {GALLERY_IMAGES.map((img, i) => (
              <button key={i} onClick={() => setGalleryIdx(i)}
                className={"rounded-xl overflow-hidden aspect-square transition-all " + (i === galleryIdx ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[0.95]" : "opacity-50 hover:opacity-80")}>
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA — "¿Lista para vivir la experiencia Kala?" ── */}
      <section id="contacto" className="py-16 lg:py-24 px-6 lg:px-[60px] relative overflow-hidden bg-secondary">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.12)_0%,transparent_60%)] pointer-events-none" />
        <div className="reveal opacity-0 translate-y-10 transition-all duration-700 relative z-10">
          <div className="text-center mb-16">
            <div className="text-primary text-[0.8rem] tracking-[0.15em] uppercase mb-6">Tu momento es ahora</div>
            <h2 className="font-bebas text-[clamp(2.8rem,6.4vw,6rem)] leading-[0.9] text-foreground mb-8">
              ¿LISTA PARA VIVIR<br /><span className="text-primary">LA EXPERIENCIA</span><br />
              <span style={{ WebkitTextStroke: "2px hsl(53 74% 94% / 0.4)", color: "transparent" }}>KALA?</span>
            </h2>
            <p className="text-[1.1rem] text-muted-foreground max-w-[500px] mx-auto mb-10 leading-[1.7]">
              Descubre una forma cercana y energetica de entrenar barre en San Luis Potosi. Te esperamos.
            </p>
            <div className="flex gap-4 justify-center items-center flex-wrap">
              <button onClick={() => navigate(membershipCtaPath)}
                className="bg-primary text-primary-foreground px-10 py-[18px] rounded-full text-[0.9rem] font-medium tracking-wider uppercase inline-flex items-center gap-[10px] hover:-translate-y-[3px] hover:scale-[1.02] hover:shadow-[0_20px_50px_hsl(var(--primary)/0.4)] transition-all">
                Reservar clase muestra
                <span className="w-[22px] h-[22px] bg-primary-foreground/20 rounded-full flex items-center justify-center"><ArrowUpRight size={12} /></span>
              </button>
              <a href="https://wa.me/524443073266?text=Hola%2C%20me%20interesa%20conocer%20m%C3%A1s%20sobre%20Kala%20Barre%20Studio"
                target="_blank" rel="noopener noreferrer"
                className="border border-border text-foreground text-[0.85rem] font-normal tracking-wider uppercase flex items-center gap-3 px-8 py-[18px] rounded-full opacity-70 hover:opacity-100 hover:border-primary transition-all no-underline">
                WhatsApp
              </a>
            </div>
          </div>
          {/* Info + Map */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            <div className="rounded-3xl p-10 flex flex-col justify-between gap-8 bg-gradient-to-br from-white via-[#FFF0E4] to-[#FCE6E1] border border-[#76214D]/15 shadow-[0_24px_70px_rgba(118,33,77,0.12)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,#76214D_0%,transparent_65%)] opacity-[0.07] pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-[200px] h-[200px] rounded-full bg-[radial-gradient(circle,#E9745F_0%,transparent_65%)] opacity-[0.07] pointer-events-none" />
              <div className="relative z-10">
                <div className="text-[0.7rem] tracking-[0.18em] uppercase text-[#76214D] font-semibold mb-3">Encuéntranos</div>
                <h3 className="font-bebas text-[clamp(2.15rem,3.2vw,3.15rem)] leading-[0.95] text-foreground mb-8">VISÍTANOS<br />EN ESTUDIO</h3>
                <div className="flex flex-col gap-6">
                  {[
                    { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>, label: "Ubicacion", value: "Av. Nicolas Zapata #845 int. 4, Plaza San Martin, San Luis Potosi", accent: "#76214D" },
                    { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.86 11 19.79 19.79 0 0 1 1.77 2.38 2 2 0 0 1 3.74.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 7.91a16 16 0 0 0 6.08 6.08l1.28-1.28a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>, label: "Telefono", value: "444 307 3266", accent: "#E9745F" },
                    { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>, label: "Email", value: "info@kalabarre.mx", accent: "#76214D" },
                    { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>, label: "Horarios", value: "Lun-Vie 7am-3pm y 5pm-9pm · Sab 7am-9am", accent: "#F58A24" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: item.accent + "20", color: item.accent, border: "1px solid " + item.accent + "30" }}>{item.icon}</div>
                      <div>
                        <div className="text-[0.65rem] tracking-widest uppercase mb-0.5" style={{ color: item.accent }}>{item.label}</div>
                        <div className="text-[1rem] text-foreground font-medium leading-snug">{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative z-10 flex gap-3 pt-6 border-t border-[#778455]/20">
                {[
                  { label: "Instagram", href: "https://www.instagram.com/kalabarre_slp/", short: "ig" },
                  { label: "Facebook", href: "https://www.facebook.com/search/top?q=Kala%20Barre%20studio%20SLP", short: "fb" },
                ].map((s) => (
                  <a key={s.short} href={s.href} target="_blank" rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full border border-[#76214D]/30 flex items-center justify-center text-[0.8rem] text-[#76214D]/80 hover:bg-[#76214D]/15 hover:text-[#76214D] transition-all no-underline">{s.short}</a>
                ))}
              </div>
            </div>
            <div className="rounded-3xl overflow-hidden border border-border min-h-[480px] lg:min-h-0">
              <iframe
                src="https://www.google.com/maps?q=Av.%20Nicolas%20Zapata%20845%20Plaza%20San%20Martin%20San%20Luis%20Potosi&output=embed"
                width="100%" height="100%" style={{ border: 0, display: "block", minHeight: "480px" }}
                allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Kala Barre Studio ubicacion" />
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-background px-6 lg:px-[60px] pt-[60px] border-t border-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-10">
          <div>
            <div className="mb-3">
              <img
                src={opheliaLogo}
                alt="Kala Barre Studio"
                className="w-[180px] sm:w-[210px] max-w-full object-contain drop-shadow-[0_0_20px_rgba(118,33,77,0.14)]"
              />
            </div>
            <p className="text-[0.82rem] text-muted-foreground leading-[1.7] max-w-[200px]">
              Aquí no solo entrenas… aquí vuelves a ti. Salto a salto, respiración a respiración.
            </p>
            <div className="flex gap-3 mt-6">
              <a href="https://www.instagram.com/kalabarre_slp/" target="_blank" rel="noopener noreferrer" className="w-[38px] h-[38px] rounded-full border border-border flex items-center justify-center text-muted-foreground text-[0.85rem] hover:border-primary hover:text-primary transition-colors no-underline">ig</a>
              <a href="https://www.facebook.com/profile.php?id=61574872102085" target="_blank" rel="noopener noreferrer" className="w-[38px] h-[38px] rounded-full border border-border flex items-center justify-center text-muted-foreground text-[0.85rem] hover:border-primary hover:text-primary transition-colors no-underline">fb</a>
            </div>
          </div>
          <div>
            <div className="text-[0.72rem] tracking-widest uppercase text-muted-foreground mb-5">Estudio</div>
            <ul className="flex flex-col gap-[10px] list-none">
              {[["Clases","clases"],["Horario","horario"],["Paquetes","membresias"],["Coaches","instructoras"],["Galería","galeria"],["Políticas","politicas"]].map(([label, id]) => (
                <li key={id}><button onClick={() => scrollTo(id)} className="text-[0.85rem] text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer p-0">{label}</button></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[0.72rem] tracking-widest uppercase text-muted-foreground mb-5">Legal</div>
            <ul className="flex flex-col gap-[10px] list-none">
              {[
                { label: "Aviso de privacidad", path: "/legal/privacidad" },
                { label: "Términos y condiciones", path: "/legal/terminos" },
                { label: "Política de cancelación", path: "/legal/cancelacion" },
              ].map((l) => (
                <li key={l.path}><button onClick={() => navigate(l.path)} className="text-[0.85rem] text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer p-0">{l.label}</button></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[0.72rem] tracking-widest uppercase text-muted-foreground mb-5">Contacto</div>
            <ul className="flex flex-col gap-[10px] list-none">
              <li><span className="text-[0.85rem] text-muted-foreground">San Luis Potosi, SLP</span></li>
              <li><a href="mailto:info@kalabarre.mx" className="text-[0.85rem] text-muted-foreground hover:text-foreground transition-colors no-underline">info@kalabarre.mx</a></li>
              <li><a href="https://wa.me/524443073266" target="_blank" rel="noopener noreferrer" className="text-[0.85rem] text-muted-foreground hover:text-foreground transition-colors no-underline">WhatsApp</a></li>
              <li><button onClick={() => scrollTo("horario")} className="text-[0.85rem] text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer p-0">Horarios</button></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border py-5 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-[0.75rem] text-muted-foreground/50">© 2026 Kala Barre Studio. Todos los derechos reservados.</p>
          <p className="text-[0.75rem] text-muted-foreground/50 flex items-center gap-1">Hecho con pasion en San Luis Potosi <Heart size={12} className="text-primary/50" /></p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
