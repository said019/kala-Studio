import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Tag,
  EmptyState,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import { Lock, ShoppingBag, Play, Search, Film } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

const VideoLibrary = () => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [lockedModal, setLockedModal] = useState<{ video: any; state: string } | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const { data: catsData } = useQuery({
    queryKey: ["video-categories"],
    queryFn: async () => (await api.get("/videos/categories")).data,
  });

  const { data: videosData, isLoading } = useQuery({
    queryKey: ["videos", debouncedSearch, category],
    queryFn: async () =>
      (await api.get(`/videos?search=${encodeURIComponent(debouncedSearch)}&category=${category}`)).data,
  });

  const { data: vaData } = useQuery({
    queryKey: ["me-video-access"],
    queryFn: async () => (await api.get("/me/video-access")).data,
    staleTime: 30_000,
  });
  const access = vaData?.data; // { state, planName?, offers? }

  const categories: any[] = Array.isArray(catsData?.data) ? catsData.data : Array.isArray(catsData) ? catsData : [];
  const videos: any[] = Array.isArray(videosData?.data) ? videosData.data : Array.isArray(videosData) ? videosData : [];

  const isVideoLocked = (v: any) => {
    if (v.is_trial) return false;
    if (v.access_type === "gratuito") return false;
    if (v.has_access) return false;
    return access?.state !== "unlocked";
  };

  const offerNames = Array.isArray(access?.offers)
    ? access.offers.map((o: any) => o?.name).filter(Boolean).join(" o ")
    : "";

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Videos"
          title={<>Tu biblioteca</>}
          titleAccent="del estudio."
          subtitle="Clases grabadas, técnica y rutinas para practicar en casa."
        />

        {access?.state === "locked_no_plan" && Array.isArray(access?.offers) && access.offers.length > 0 && (
          <Section>
            <div
              className="rounded-2xl p-4"
              style={{
                backgroundColor: KALA.blush,
                border: `1px solid ${KALA.berry}33`,
              }}
            >
              <p className="text-[0.92rem] font-medium" style={{ color: KALA.ink }}>
                Adquiere {offerNames} para ver toda la biblioteca.
              </p>
              <Link
                to="/app/checkout"
                className="mt-2 inline-block text-[0.82rem] no-underline"
                style={{ color: KALA.berry, fontWeight: 600 }}
              >
                Ver paquetes →
              </Link>
            </div>
          </Section>
        )}

        <Section>
          <div className="relative">
            <Search
              size={15}
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: KALA.ink, opacity: 0.5 }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, coach, disciplina"
              className="w-full rounded-2xl px-4 py-3.5 pl-11 text-[0.95rem] outline-none transition-colors"
              style={{
                backgroundColor: KALA.cream,
                color: KALA.ink,
                border: `1px solid ${KALA.border}`,
              }}
            />
          </div>

          {categories.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategory("")}
                className="rounded-full px-3.5 py-1.5 text-[0.74rem] font-medium uppercase tracking-[0.16em] cursor-pointer transition-colors"
                style={{
                  backgroundColor: category === "" ? KALA.berry : "transparent",
                  color: category === "" ? KALA.cream : KALA.ink,
                  border: `1px solid ${category === "" ? KALA.berry : KALA.border}`,
                }}
              >
                Todos
              </button>
              {categories.map((c: any) => {
                const sel = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className="rounded-full px-3.5 py-1.5 text-[0.74rem] font-medium uppercase tracking-[0.16em] cursor-pointer transition-colors"
                    style={{
                      backgroundColor: sel ? KALA.berry : "transparent",
                      color: sel ? KALA.cream : KALA.ink,
                      border: `1px solid ${sel ? KALA.berry : KALA.border}`,
                    }}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        <Section>
          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonRow key={i} height={220} />)}
            </div>
          ) : videos.length === 0 ? (
            <EmptyState
              icon={<Film size={20} />}
              title={debouncedSearch || category ? "Sin resultados." : "Aún no hay videos."}
              description={
                debouncedSearch || category
                  ? "Prueba con otro nombre o limpia los filtros."
                  : "Cuando subamos contenido, aparece aquí."
              }
            />
          ) : (
            <ul className="grid grid-cols-2 lg:grid-cols-3 gap-4 list-none m-0 p-0">
              {videos.map((v: any, idx: number) => {
                const aspect = idx % 5 === 0 ? "aspect-[4/5]" : "aspect-[5/6]";
                const locked = isVideoLocked(v);
                const isPaid = v.sales_unlocks_video && !v.has_access;
                const minutes = Math.floor((v.duration_seconds ?? 0) / 60);

                const cardInner = (
                  <>
                    <div
                      className={"relative overflow-hidden rounded-2xl " + aspect}
                      style={{ backgroundColor: KALA.blush }}
                    >
                      {v.thumbnail_url ? (
                        <img
                          src={v.thumbnail_url}
                          alt={v.title}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                          style={locked ? { opacity: 0.55, filter: "saturate(0.85)" } : undefined}
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center" style={{ color: KALA.berry }}>
                          <Play size={32} />
                        </div>
                      )}
                      <div
                        className="absolute inset-0"
                        style={{ background: "linear-gradient(180deg, transparent 50%, rgba(46,32,28,0.55) 100%)" }}
                      />

                      {/* Lock overlay (centered) */}
                      {locked && (
                        <div className="absolute inset-0 grid place-items-center">
                          <span
                            className="grid h-12 w-12 place-items-center rounded-full"
                            style={{
                              backgroundColor: `${KALA.cream}f0`,
                              color: KALA.berry,
                              boxShadow: "0 6px 18px rgba(46,32,28,0.18)",
                            }}
                          >
                            <Lock size={18} strokeWidth={2.2} />
                          </span>
                        </div>
                      )}

                      {/* Top badges */}
                      <div className="absolute top-3 left-3 right-3 flex justify-between gap-2">
                        {v.is_trial ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.6rem] uppercase tracking-[0.16em]"
                            style={{ backgroundColor: KALA.orange, color: KALA.cream, fontWeight: 600 }}
                          >
                            Muestra
                          </span>
                        ) : locked ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.6rem] uppercase tracking-[0.16em]"
                            style={{ backgroundColor: KALA.cream, color: KALA.ink, opacity: 0.9 }}
                          >
                            <Lock size={10} /> Miembros
                          </span>
                        ) : (
                          <span aria-hidden="true" />
                        )}
                        {isPaid && v.sales_price_mxn && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.6rem] uppercase tracking-[0.16em]"
                            style={{ backgroundColor: KALA.orange, color: KALA.cream }}
                          >
                            <ShoppingBag size={10} /> ${v.sales_price_mxn}
                          </span>
                        )}
                      </div>

                      {/* Bottom meta */}
                      <div className="absolute inset-x-0 bottom-0 p-3 flex items-end justify-between">
                        <span
                          className="font-bebas leading-tight pr-3"
                          style={{ color: KALA.cream, fontSize: "1.1rem" }}
                        >
                          {minutes ? `${minutes} min` : ""}
                        </span>
                        <span
                          className="grid h-9 w-9 place-items-center rounded-full transition-transform group-hover:scale-110"
                          style={{ backgroundColor: KALA.cream, color: KALA.berry }}
                        >
                          {locked ? <Lock size={13} /> : <Play size={14} />}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-baseline justify-between gap-3">
                      <h3
                        className="text-[0.92rem] font-medium leading-tight line-clamp-2"
                        style={{ color: KALA.ink }}
                      >
                        {v.title}
                      </h3>
                      {v.level && (
                        <span
                          className="text-[0.66rem] uppercase tracking-[0.18em] shrink-0"
                          style={{ color: KALA.ink, opacity: 0.5 }}
                        >
                          {v.level}
                        </span>
                      )}
                    </div>
                    {v.category_name && (
                      <p className="mt-1 text-[0.74rem]" style={{ color: KALA.ink, opacity: 0.55 }}>
                        {v.category_name}
                        {v.instructor_name ? ` · ${v.instructor_name}` : ""}
                      </p>
                    )}
                  </>
                );

                const purchasable = v.access_state?.state === "locked_purchasable";

                return (
                  <li key={v.id}>
                    {locked && !purchasable ? (
                      <button
                        type="button"
                        onClick={() => setLockedModal({ video: v, state: access?.state ?? "locked_no_plan" })}
                        className="group block w-full text-left bg-transparent p-0 border-0 cursor-pointer"
                      >
                        {cardInner}
                      </button>
                    ) : (
                      <Link to={`/app/videos/${v.id}`} className="group block no-underline">
                        {cardInner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {lockedModal && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ backgroundColor: "rgba(46,32,28,0.55)" }}
            onClick={() => setLockedModal(null)}
          >
            <div
              className="w-full max-w-sm rounded-3xl p-6"
              style={{
                backgroundColor: KALA.cream,
                border: `1px solid ${KALA.border}`,
                boxShadow: "0 24px 60px rgba(46,32,28,0.25)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="grid h-10 w-10 place-items-center rounded-2xl"
                  style={{ backgroundColor: KALA.blush, color: KALA.berry }}
                >
                  <Lock size={16} />
                </span>
                <h3
                  className="font-bebas leading-tight"
                  style={{ color: KALA.ink, fontSize: "1.35rem" }}
                >
                  {lockedModal.video.title}
                </h3>
              </div>
              <>
                <p className="text-[0.92rem]" style={{ color: KALA.ink, opacity: 0.78 }}>
                  {offerNames
                    ? `Adquiere ${offerNames} para ver esta clase y toda la biblioteca.`
                    : "Adquiere un paquete que incluya videos para ver esta clase."}
                </p>
                <Link
                  to="/app/checkout"
                  onClick={() => setLockedModal(null)}
                  className="mt-4 block w-full rounded-full py-2.5 text-center text-[0.92rem] no-underline"
                  style={{ backgroundColor: KALA.berry, color: KALA.cream, fontWeight: 600 }}
                >
                  Ver paquetes
                </Link>
              </>
              <button
                type="button"
                onClick={() => setLockedModal(null)}
                className="mt-3 block w-full rounded-full py-2 text-center text-[0.82rem] cursor-pointer"
                style={{ backgroundColor: "transparent", border: 0, color: KALA.ink, opacity: 0.6 }}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default VideoLibrary;
