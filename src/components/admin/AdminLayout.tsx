import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LayoutDashboard, Package, CreditCard, Users, CalendarDays,
  BookOpen, DollarSign, ShoppingBag,
  ShoppingCart, Tag, Gift, Video, BarChart2, MessageCircle, GraduationCap, Bell,
  Settings, ChevronLeft, ChevronRight, ChevronDown, LogOut, Globe, Menu, Ticket, X,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Principal",
    collapsible: false,
    accentColor: "#76214D",
    items: [
      { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { path: "/admin/notifications", label: "Bandeja", icon: Bell },
      { path: "/admin/clients", label: "Clientes", icon: Users },
      { path: "/admin/payments", label: "Pagos", icon: DollarSign },
      { path: "/admin/bookings", label: "Reservas", icon: BookOpen },
    ],
  },
  {
    label: "Gestión",
    collapsible: true,
    accentColor: "#E9745F",
    items: [
      { path: "/admin/plans", label: "Planes", icon: Package },
      { path: "/admin/memberships", label: "Membresías", icon: CreditCard },
      { path: "/admin/classes", label: "Clases", icon: CalendarDays },
      { path: "/admin/staff", label: "Instructoras", icon: GraduationCap },
      { path: "/admin/orders", label: "Órdenes", icon: ShoppingBag },
      { path: "/admin/pos", label: "POS", icon: ShoppingCart },
      { path: "/admin/discount-codes", label: "Descuentos", icon: Tag },
      { path: "/admin/loyalty", label: "Lealtad", icon: Gift },
      { path: "/admin/whatsapp-templates", label: "Templates WA", icon: MessageCircle },
      { path: "/admin/videos", label: "Videos", icon: Video },
      { path: "/admin/events", label: "Eventos", icon: Ticket },
    ],
  },
  {
    label: "Sistema",
    collapsible: false,
    accentColor: "#76214D",
    items: [
      { path: "/admin/reports", label: "Reportes", icon: BarChart2 },
      { path: "/admin/settings", label: "Configuración", icon: Settings },
    ],
  },
];

const MOBILE_QUICK_NAV = [
  { path: "/admin/dashboard", label: "Inicio", icon: LayoutDashboard },
  { path: "/admin/classes", label: "Clases", icon: CalendarDays },
  { path: "/admin/bookings", label: "Reservas", icon: BookOpen },
  { path: "/admin/clients", label: "Clientes", icon: Users },
  { path: "/admin/payments", label: "Pagos", icon: DollarSign },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Gestión: true,
  });

  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user as any);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    logout();
    navigate("/auth/login");
  };

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const currentItem = allItems.find(
    (i) => location.pathname === i.path || location.pathname.startsWith(i.path + "/"),
  );

  const activeGroup = NAV_GROUPS.find((g) =>
    g.items.some((i) => location.pathname === i.path || location.pathname.startsWith(i.path + "/")),
  );

  const isCompact = collapsed && !mobileOpen;

  // Unread count para badge en sidebar item 'Bandeja'
  const { data: unreadData } = useQuery<{ data: { unread_count: number } }>({
    queryKey: ["admin-notifications-unread-count"],
    queryFn: async () => (await api.get("/admin/notifications/unread-count")).data,
    refetchInterval: 60_000,
    enabled: !!user?.id,
  });
  const unreadCount = unreadData?.data?.unread_count ?? 0;

  // Pending video access count para badge en sidebar item 'Clientes'
  const { data: vaPending } = useQuery<{ data: any[] }>({
    queryKey: ["video-access-pending"],
    queryFn: async () => (await api.get("/admin/video-access/pending")).data,
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: !!user?.id,
  });
  const vaPendingCount = Array.isArray(vaPending?.data) ? vaPending.data.length : 0;

  return (
    <div className="kala-admin flex min-h-screen bg-[#FFF7F2] text-[#2E201C]">
      {mobileOpen && (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-[#2E201C]/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 shrink-0",
          "border-r border-[#E8CAC1]",
          "bg-gradient-to-b from-[#FCE6E1] via-[#FFF7F2] to-[#FFF7F2]",
          "w-[88vw] max-w-[300px] -translate-x-full lg:translate-x-0 lg:static",
          mobileOpen && "translate-x-0",
          collapsed ? "lg:w-[72px]" : "lg:w-[240px]",
        )}
      >
        <div
          className={cn(
            "flex items-center border-b border-[#E8CAC1] shrink-0",
            isCompact ? "justify-center px-3 py-5" : "justify-between px-5 py-5",
          )}
        >
          {!isCompact && (
            <div className="flex flex-col">
              <img
                src="/wallet-logo@2x.png"
                alt="Kala Barre Studio"
                className="h-9 w-auto object-contain"
              />
              <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.32em] text-[#76214D]/60">
                Barre Studio
              </span>
            </div>
          )}

          <button
            onClick={() => setMobileOpen(false)}
            className="flex lg:hidden items-center justify-center w-8 h-8 rounded-lg text-[#2E201C]/55 hover:text-[#76214D] hover:bg-[#76214D]/8"
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>

          <button
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition-all",
              "text-[#E9745F]/70 hover:text-[#E9745F] hover:bg-[#E9745F]/10",
            )}
            aria-label="Contraer menú"
          >
            {collapsed ? <Menu size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {NAV_GROUPS.map((group) => {
            const isGroupActive = activeGroup?.label === group.label;
            const isOpen = group.collapsible ? (openGroups[group.label] ?? isGroupActive) : true;

            return (
              <div key={group.label} className="mb-1">
                {!isCompact && (
                  group.collapsible ? (
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between px-5 py-1.5 group"
                    >
                      <span
                        className="text-[10px] font-semibold tracking-widest uppercase transition-colors"
                        style={{ color: isGroupActive ? group.accentColor : `${group.accentColor}50` }}
                      >
                        {group.label}
                      </span>
                      <ChevronDown
                        size={11}
                        className={cn("transition-all duration-200", isOpen ? "rotate-0" : "-rotate-90")}
                        style={{ color: `${group.accentColor}50` }}
                      />
                    </button>
                  ) : (
                    <p
                      className="px-5 py-1.5 text-[10px] font-semibold tracking-widest uppercase"
                      style={{ color: `${group.accentColor}50` }}
                    >
                      {group.label}
                    </p>
                  )
                )}

                {(isCompact || isOpen) && group.items.map(({ path, label, icon: Icon }) => {
                  const active = location.pathname === path || location.pathname.startsWith(path + "/");
                  const accent = group.accentColor;
                  return (
                    <Link
                      key={path}
                      to={path}
                      data-press
                      title={isCompact ? label : undefined}
                      className={cn(
                        "flex items-center gap-3 mx-2 my-0.5 rounded-xl transition-all duration-200 no-underline group",
                        isCompact ? "px-0 justify-center py-2.5" : "px-3 py-2.5",
                        active
                          ? "font-semibold"
                          : "text-[#2E201C]/65 hover:text-[#2E201C] hover:bg-[#76214D]/6 border border-transparent",
                      )}
                      style={active ? {
                        background: `linear-gradient(to right, ${accent}1f, ${accent}0a)`,
                        border: `1px solid ${accent}40`,
                        color: accent,
                      } : {}}
                    >
                      <span className="relative shrink-0 inline-flex">
                        <Icon
                          size={15}
                          className="transition-colors"
                          style={{ color: active ? accent : "#2E201C" }}
                        />
                        {/* Badge: unread count para 'Bandeja' nav item */}
                        {path === "/admin/notifications" && unreadCount > 0 && (
                          <span
                            className="absolute -top-1.5 -right-2 grid place-items-center rounded-full text-[8px] font-bold leading-none px-1 min-w-[14px] h-[14px]"
                            style={{ backgroundColor: "#76214D", color: "#FFF7F2" }}
                          >
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                        {/* Badge: pending video access count para 'Clientes' nav item */}
                        {path === "/admin/clients" && vaPendingCount > 0 && (
                          <span
                            className="absolute -top-1.5 -right-2 grid place-items-center rounded-full text-[8px] font-bold leading-none px-1 min-w-[14px] h-[14px]"
                            style={{ backgroundColor: "#F59E0B", color: "#FFF7F2" }}
                            title={`${vaPendingCount} alumna${vaPendingCount === 1 ? "" : "s"} pendiente${vaPendingCount === 1 ? "" : "s"} de acceso a videos`}
                          >
                            {vaPendingCount > 9 ? "9+" : vaPendingCount}
                          </span>
                        )}
                      </span>
                      {!isCompact && (
                        <span className="text-[13px] leading-none truncate">{label}</span>
                      )}
                      {active && !isCompact && (
                        <span
                          className="ml-auto w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: accent, boxShadow: `0 0 6px ${accent}40` }}
                        />
                      )}
                    </Link>
                  );
                })}

                {isCompact && <div className="mx-3 my-1 h-px bg-[#E8CAC1]/60" />}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-[#E8CAC1] pb-3 pt-2 shrink-0">
          <Link
            to="/"
            title={isCompact ? "Ver sitio" : undefined}
            className={cn(
              "flex items-center gap-3 mx-2 rounded-xl px-3 py-2 no-underline transition-all",
              "text-[#2E201C]/55 hover:text-[#F58A24] hover:bg-[#F58A24]/8 border border-transparent",
              isCompact && "justify-center px-0",
            )}
          >
            <Globe size={14} className="shrink-0" />
            {!isCompact && <span className="text-xs">Ver sitio</span>}
          </Link>
          <button
            onClick={handleLogout}
            title={isCompact ? "Salir" : undefined}
            className={cn(
              "flex items-center gap-3 mx-2 rounded-xl px-3 py-2 w-[calc(100%-16px)] transition-all",
              "text-[#2E201C]/55 hover:text-[#B23A48] hover:bg-[#B23A48]/8 border border-transparent",
              isCompact && "justify-center px-0",
            )}
          >
            <LogOut size={14} className="shrink-0" />
            {!isCompact && <span className="text-xs">Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        <header className="shrink-0 h-14 flex items-center justify-between px-3 sm:px-4 lg:px-6 border-b border-[#E8CAC1] bg-[#FFF7F2]/90 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <button
              className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#2E201C]/60 hover:text-[#76214D] hover:bg-[#76214D]/8"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={16} />
            </button>
            <span className="text-[#2E201C]/45 text-[11px] sm:text-xs font-medium tracking-wider uppercase">Admin</span>
            {currentItem && (
              <>
                <ChevronRight size={12} className="text-[#2E201C]/35 shrink-0" />
                <span className="text-[#2E201C] text-xs sm:text-sm font-semibold truncate">{currentItem.label}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#778455] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#778455] shadow-[0_0_6px_rgba(119,132,85,0.4)] animate-pulse" />
              En línea
            </span>
            <div className="w-px h-4 bg-[#E8CAC1] hidden sm:block" />
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#76214D] to-[#E9745F] flex items-center justify-center text-[11px] font-bold text-[#FFF7F2] shadow-[0_0_10px_rgba(118,33,77,0.25)]">
                {user?.displayName?.[0]?.toUpperCase() ?? user?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "A"}
              </div>
              {!isCompact && (
                <span className="text-xs text-[#2E201C]/65 hidden md:block truncate max-w-[180px]">
                  {user?.displayName ?? user?.display_name ?? user?.email ?? "Admin"}
                </span>
              )}
            </div>
          </div>
        </header>

        <main className="admin-mobile-main flex-1 overflow-auto pb-[88px] lg:pb-0 bg-[#FFF7F2]">{children}</main>

        {isMobile && (
          <nav className="fixed inset-x-2 bottom-2 z-40 rounded-2xl border border-[#E8CAC1] bg-[#FFF7F2]/95 p-1 pb-safe backdrop-blur-xl shadow-lg lg:hidden">
            <ul className="grid grid-cols-5 gap-1">
              {MOBILE_QUICK_NAV.map((item) => {
                const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      data-press
                      className={cn(
                        "flex h-12 min-h-[44px] flex-col items-center justify-center rounded-xl text-[11px] font-semibold transition-colors",
                        active
                          ? "bg-gradient-to-r from-[#76214D] to-[#E9745F] text-[#FFF7F2] shadow-[0_0_14px_rgba(118,33,77,0.20)]"
                          : "text-[#2E201C]/60 hover:bg-[#76214D]/6 hover:text-[#76214D]",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <item.icon size={14} />
                      <span className="mt-0.5 leading-none">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
};

export default AdminLayout;
