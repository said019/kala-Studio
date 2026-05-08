import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LayoutDashboard, Package, CreditCard, Users, CalendarDays,
  BookOpen, DollarSign, ShoppingBag,
  ShoppingCart, Tag, Gift, Video, BarChart2, MessageCircle,
  Settings, ChevronLeft, ChevronRight, ChevronDown, LogOut, Globe, Menu, Ticket, X,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Principal",
    collapsible: false,
    accentColor: "#76214D",
    items: [
      { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
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
      { path: "/admin/orders", label: "Órdenes", icon: ShoppingBag },
      { path: "/admin/pos", label: "POS", icon: ShoppingCart },
      { path: "/admin/discount-codes", label: "Descuentos", icon: Tag },
      { path: "/admin/loyalty", label: "Lealtad", icon: Gift },
      { path: "/admin/campaigns", label: "Campañas WA", icon: MessageCircle },
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

  return (
    <div className="kala-admin flex min-h-screen">
      {mobileOpen && (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-[#1e1b19]/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 shrink-0",
          "border-r",
          "w-[88vw] max-w-[280px] -translate-x-full lg:translate-x-0 lg:static",
          mobileOpen && "translate-x-0",
          collapsed ? "lg:w-[72px]" : "lg:w-[260px]",
        )}
        style={{
          backgroundColor: "var(--kal-surface)",
          borderRightColor: "var(--kal-outline-variant)",
        }}
      >
        {/* Brand block — KALA wordmark + tagline (matches mock) */}
        <div
          className={cn(
            "flex items-center shrink-0",
            isCompact ? "justify-center px-3 pt-7 pb-6" : "justify-between px-6 pt-8 pb-7",
          )}
        >
          {!isCompact && (
            <div className="flex flex-col items-center w-full">
              <h1
                className="font-headline font-bold tracking-[0.18em]"
                style={{ color: "var(--kal-primary)", fontSize: "1.75rem", lineHeight: "1.1" }}
              >
                KALA
              </h1>
              <p
                className="admin-label-caps mt-1"
                style={{ color: "var(--kal-on-surface-variant)", letterSpacing: "0.2em" }}
              >
                BARRE STUDIO
              </p>
            </div>
          )}

          <button
            onClick={() => setMobileOpen(false)}
            className="flex lg:hidden items-center justify-center w-8 h-8 rounded-lg transition-colors"
            style={{ color: "var(--kal-on-surface-variant)" }}
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>

          {!isCompact && (
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="hidden lg:flex absolute top-9 right-3 items-center justify-center w-7 h-7 rounded-lg transition-all"
              style={{ color: "var(--kal-on-surface-variant)" }}
              aria-label="Contraer menú"
            >
              <ChevronLeft size={15} />
            </button>
          )}
          {isCompact && (
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition-all"
              style={{ color: "var(--kal-on-surface-variant)" }}
              aria-label="Expandir menú"
            >
              <Menu size={15} />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto pr-0 scrollbar-thin">
          {NAV_GROUPS.map((group) => {
            const isGroupActive = activeGroup?.label === group.label;
            const isOpen = group.collapsible ? (openGroups[group.label] ?? isGroupActive) : true;

            return (
              <div key={group.label} className="mb-5">
                {!isCompact && (
                  group.collapsible ? (
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between pl-8 pr-6 py-1.5"
                    >
                      <span
                        className="admin-label-caps transition-colors"
                        style={{ color: "var(--kal-outline)" }}
                      >
                        {group.label}
                      </span>
                      <ChevronDown
                        size={12}
                        className={cn("transition-all duration-200", isOpen ? "rotate-0" : "-rotate-90")}
                        style={{ color: "var(--kal-outline)" }}
                      />
                    </button>
                  ) : (
                    <p
                      className="admin-label-caps pl-8 pr-6 py-1.5"
                      style={{ color: "var(--kal-outline)" }}
                    >
                      {group.label}
                    </p>
                  )
                )}

                {(isCompact || isOpen) && group.items.map(({ path, label, icon: Icon }) => {
                  const active = location.pathname === path || location.pathname.startsWith(path + "/");
                  return (
                    <Link
                      key={path}
                      to={path}
                      title={isCompact ? label : undefined}
                      className={cn(
                        "flex items-center gap-3 transition-all duration-200 no-underline",
                        // M3 nav-item shape: rail style — full pill on the right edge
                        "rounded-r-full mr-4",
                        isCompact ? "px-0 justify-center py-2.5 mx-2 rounded-full" : "pl-6 pr-4 py-2.5",
                      )}
                      style={active ? {
                        backgroundColor: "var(--kal-secondary-fixed)",
                        color: "var(--kal-primary)",
                        fontWeight: 600,
                      } : {
                        color: "var(--kal-on-surface-variant)",
                        fontWeight: 500,
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.backgroundColor = "var(--kal-surface-container-low)";
                          e.currentTarget.style.color = "var(--kal-primary)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.color = "var(--kal-on-surface-variant)";
                        }
                      }}
                    >
                      <Icon
                        size={20}
                        className="shrink-0 transition-colors"
                        style={{
                          fontVariationSettings: active ? "'FILL' 1" : undefined,
                        }}
                      />
                      {!isCompact && (
                        <span className="text-[14px] leading-tight truncate">{label}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="px-6 pt-2 pb-6 shrink-0">
          <Link
            to="/"
            title={isCompact ? "Ver sitio" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-r-full px-2 py-2.5 no-underline transition-all -ml-6",
              isCompact && "justify-center px-0 mx-0 rounded-full",
            )}
            style={{ color: "var(--kal-on-surface-variant)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--kal-surface-container-low)";
              e.currentTarget.style.color = "var(--kal-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--kal-on-surface-variant)";
            }}
          >
            <Globe size={18} className="shrink-0 ml-6" />
            {!isCompact && <span className="text-[13px]">Ver sitio</span>}
          </Link>
          <button
            onClick={handleLogout}
            title={isCompact ? "Salir" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-r-full px-2 py-2.5 transition-all w-full -ml-6 text-left",
              isCompact && "justify-center px-0 mx-0 rounded-full",
            )}
            style={{ color: "var(--kal-on-surface-variant)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--kal-error-container)";
              e.currentTarget.style.color = "var(--kal-error)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--kal-on-surface-variant)";
            }}
          >
            <LogOut size={14} className="shrink-0" />
            {!isCompact && <span className="text-xs">Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        <header
          className="shrink-0 h-20 flex items-center justify-between px-4 sm:px-6 lg:px-10 border-b backdrop-blur-md sticky top-0 z-30"
          style={{
            backgroundColor: "color-mix(in srgb, var(--kal-background) 80%, transparent)",
            borderBottomColor: "color-mix(in srgb, var(--kal-outline-variant) 40%, transparent)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--kal-on-surface-variant)" }}
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu size={18} />
            </button>
            <span className="text-[14px] font-medium" style={{ color: "var(--kal-on-surface-variant)" }}>
              ADMIN
            </span>
            {currentItem && (
              <>
                <ChevronRight size={16} style={{ color: "var(--kal-on-surface-variant)" }} className="shrink-0" />
                <span className="text-[14px] font-medium truncate" style={{ color: "var(--kal-on-surface)" }}>
                  {currentItem.label}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <span
              className="hidden sm:flex items-center gap-2 text-[14px]"
              style={{ color: "var(--kal-on-surface-variant)" }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--kal-success, #4a8a4f)" }} />
              En línea
            </span>
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-bold"
                style={{
                  backgroundColor: "var(--kal-surface-tint)",
                  color: "var(--kal-on-primary)",
                }}
              >
                {user?.displayName?.[0]?.toUpperCase() ?? user?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "A"}
              </div>
              {!isCompact && (
                <span
                  className="text-[14px] font-medium hidden md:block truncate max-w-[180px]"
                  style={{ color: "var(--kal-on-surface)" }}
                >
                  {user?.displayName ?? user?.display_name ?? user?.email ?? "Admin"}
                </span>
              )}
            </div>
          </div>
        </header>

        <main
          className="admin-mobile-main flex-1 overflow-auto pb-[88px] lg:pb-0"
          style={{ backgroundColor: "var(--kal-background)" }}
        >
          {children}
        </main>

        {isMobile && (
          <nav
            className="fixed inset-x-2 bottom-2 z-40 rounded-2xl border p-1 pb-safe backdrop-blur-xl shadow-lg lg:hidden"
            style={{
              backgroundColor: "color-mix(in srgb, var(--kal-background) 95%, transparent)",
              borderColor: "var(--kal-outline-variant)",
            }}
          >
            <ul className="grid grid-cols-5 gap-1">
              {MOBILE_QUICK_NAV.map((item) => {
                const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className="flex h-12 min-h-[44px] flex-col items-center justify-center rounded-xl text-[11px] font-semibold transition-colors"
                      style={active ? {
                        backgroundColor: "var(--kal-secondary-fixed)",
                        color: "var(--kal-primary)",
                      } : {
                        color: "var(--kal-on-surface-variant)",
                      }}
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
