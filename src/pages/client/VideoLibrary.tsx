import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, ShoppingBag, Play, Search } from "lucide-react";
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
      <ClientLayout>
        <div className="space-y-4">
          <h1 className="text-xl font-bold">Biblioteca de videos</h1>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar videos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Category pills */}
          {categories.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setCategory("")}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  category === "" ? "bg-primary text-primary-foreground border-primary" : "hover:border-primary"
                }`}
              >
                Todos
              </button>
              {categories.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    category === c.id ? "bg-primary text-primary-foreground border-primary" : "hover:border-primary"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Videos grid */}
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="aspect-video rounded-xl" />)}
            </div>
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se encontraron videos</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((v: any) => (
                <Link key={v.id} to={`/app/videos/${v.id}`}>
                  <div className="group rounded-xl overflow-hidden border hover:border-primary transition-all">
                    {/* Thumbnail */}
                    <div className="aspect-video bg-muted relative overflow-hidden">
                      {v.thumbnail_url ? (
                        <img src={v.thumbnail_url} className="object-cover w-full h-full group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Play size={32} className="text-muted-foreground" />
                        </div>
                      )}
                      {/* Overlay badges */}
                      <div className="absolute top-2 right-2 flex gap-1">
                        {v.access_type === "miembros" && (
                          <span className="flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">
                            <Lock size={10} />Miembros
                          </span>
                        )}
                        {v.sales_unlocks_video && v.sales_price_mxn && (
                          <span className="flex items-center gap-1 rounded-full bg-yellow-500/90 px-2 py-0.5 text-[10px] text-white">
                            <ShoppingBag size={10} />${v.sales_price_mxn}
                          </span>
                        )}
                      </div>
                      {/* Duration */}
                      <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                        {Math.floor((v.duration_seconds ?? 0) / 60)} min
                      </div>
                    </div>
                    <div className="p-3 space-y-1">
                      <p className="font-medium text-sm line-clamp-2">{v.title}</p>
                      <div className="flex items-center justify-between">
                        {v.category_name && (
                          <Badge variant="outline" className="text-[10px]">{v.category_name}</Badge>
                        )}
                        {v.level && <span className="text-xs text-muted-foreground">{v.level}</span>}
                      </div>
                      {v.sales_enabled && !v.sales_unlocks_video && v.sales_price_mxn && (
                        <p className="text-xs text-muted-foreground">Clases desde ${v.sales_price_mxn} MXN</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default VideoLibrary;
