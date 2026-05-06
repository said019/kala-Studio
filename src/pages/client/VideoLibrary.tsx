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

  const categories: any[] = Array.isArray(catsData?.data) ? catsData.data : Array.isArray(catsData) ? catsData : [];
  const videos: any[] = Array.isArray(videosData?.data) ? videosData.data : Array.isArray(videosData) ? videosData : [];

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Videos"
          title={<>Tu biblioteca</>}
          titleAccent="del estudio."
          subtitle="Clases grabadas, técnica y rutinas para practicar en casa."
        />

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
                const isLocked = v.access_type === "miembros" && !v.has_access;
                const isPaid = v.sales_unlocks_video && !v.has_access;
                const minutes = Math.floor((v.duration_seconds ?? 0) / 60);
                return (
                  <li key={v.id}>
                    <Link to={`/app/videos/${v.id}`} className="group block no-underline">
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

                        {/* Top badges */}
                        <div className="absolute top-3 left-3 right-3 flex justify-between gap-2">
                          {isLocked && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.6rem] uppercase tracking-[0.16em]"
                              style={{ backgroundColor: KALA.cream, color: KALA.ink, opacity: 0.85 }}
                            >
                              <Lock size={10} /> Miembros
                            </span>
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
                            <Play size={14} />
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
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default VideoLibrary;
