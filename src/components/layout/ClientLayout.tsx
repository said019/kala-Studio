import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import {
  LayoutDashboard, Calendar, ClipboardList, CreditCard, Package,
  Wallet, Play, User, Bell, LogOut, Menu, X, Settings,
  ChevronRight, Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import opheliaLogo from "@/assets/ophelia-logo-full.webp";

/* ── Navigation groups ─────────────────────────────────────────────── */
const NAV_GROUPS = [
  {
    label: "Principal",
    labelColor: "#76214D",
    items: [
      { to: "/app", label: "Inicio", icon: LayoutDashboard, activeColor: "#F58A24" },
      { to: "/app/classes", label: "Reservar clase", icon: Calendar, activeColor: "#76214D" },
      { to: "/app/bookings", label: "Mis reservas", icon: ClipboardList, activeColor: "#E9745F" },
      { to: "/app/events", label: "Eventos", icon: Ticket, activeColor: "#F58A24" },
    ],
  },
  {
    label: "Cuenta",
    labelColor: "#E9745F",
    items: [
      { to: "/app/checkout", label: "Membresía", icon: CreditCard, activeColor: "#76214D" },
      { to: "/app/wallet", label: "Club & Wallet", icon: Wallet, activeColor: "#F58A24" },
      { to: "/app/orders", label: "Mis órdenes", icon: Package, activeColor: "#E9745F" },
    ],
  },
  {
    label: "Contenido",
    labelColor: "#F58A24",
    items: [
      { to: "/app/videos", label: "Videos", icon: Play, activeColor: "#F58A24" },
    ],
  },
];

/* ── Single nav item ───────────────────────────────────────────────── */
const NavItem = ({
  to, label, icon: Icon, onClick, collapsed, activeColor = "#76214D",
}: {
  to: string; label: string; icon: any; onClick?: () => void; collapsed?: boolean; activeColor?: string;
}) => {
  const { pathname } = useLocation();
  const active = pathname === to || (to !== "/app" && pathname.startsWith(to));

  return (
    <Link
      to={to}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.82rem] font-medium transition-all duration-200 no-underline",
        active
          ? "text-foreground border"
          : "text-muted-foreground hover:bg-primary/5 hover:text-foreground border border-transparent",
        collapsed && "justify-center px-2"
      )}
      style={active ? {
        background: `linear-gradient(to right, ${activeColor}20, ${activeColor}08)`,
        borderColor: `${activeColor}30`,
      } : {}}
    >
      {/* Active left bar */}
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full"
          style={{ backgroundColor: activeColor }}
        />
      )}

      {/* Icon */}
      <span
        className={cn("flex-shrink-0 transition-all", !active && "group-hover:text-[#E9745F]")}
        style={active ? { color: activeColor } : {}}
      >
        <Icon size={17} />
      </span>

      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && active && (
        <ChevronRight size={13} style={{ color: activeColor }} className="opacity-70" />
      )}
    </Link>
  );
};

/* ── Main layout ───────────────────────────────────────────────────── */
const ClientLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  const initials = (user?.displayName ?? user?.display_name)
    ? (user?.displayName ?? user?.display_name ?? "").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email
      ? user.email[0].toUpperCase()
      : "U";

  const firstName = (user?.displayName ?? user?.display_name)?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "Tú";

  /* ── mobile bottom nav items ── */
  const BOTTOM_NAV = [
    { to: "/app", icon: LayoutDashboard, label: "Inicio", color: "#F58A24" },
    { to: "/app/classes", icon: Calendar, label: "Clases", color: "#76214D" },
    { to: "/app/bookings", icon: ClipboardList, label: "Reservas", color: "#E9745F" },
    { to: "/app/events", icon: Ticket, label: "Eventos", color: "#F58A24" },
    { to: "/app/profile", icon: User, label: "Perfil", color: "#76214D" },
  ];

  return (
    <div className="flex min-h-screen bg-background">

      {/* ── Mobile overlay ─────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── SIDEBAR ────────────────────────────────────────────────── */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col transition-transform duration-300 lg:static lg:translate-x-0",
        "border-r border-primary/10 bg-white",
        open ? "translate-x-0" : "-translate-x-full"
      )}>

        {/* Ambient top glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[200px] bg-gradient-to-b from-[#FCE6E1]/80 to-transparent" />
        <div className="pointer-events-none absolute left-[-40px] top-[-40px] h-[180px] w-[180px] rounded-full bg-[#E9745F]/[0.10] blur-[60px]" />

        {/* ── Logo / Brand ── */}
        <div className="relative flex h-24 items-center justify-between px-5 border-b border-primary/10">
          <Link to="/" className="flex items-center no-underline">
            <img
              src={opheliaLogo}
              alt="Ophelia Studio"
              className="w-[170px] max-w-full object-contain drop-shadow-[0_0_20px_rgba(233,116,95,0.14)]"
            />
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        {/* ── User card ── */}
        <Link
          to="/app/profile"
          onClick={() => setOpen(false)}
          className={cn(
            "relative mx-3 mt-4 mb-2 flex items-center gap-3 rounded-2xl p-3.5 no-underline transition-all duration-200",
            "bg-gradient-to-br from-[#FCE6E1]/60 to-[#FFF7F2]",
            "border border-[#76214D]/10 hover:border-[#76214D]/30",
            pathname.startsWith("/app/profile") && "border-[#76214D]/30"
          )}
        >
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white",
              "bg-gradient-to-br from-[#76214D] to-[#E9745F] shadow-md shadow-[#76214D]/30"
            )}>
              {(user?.photoUrl ?? user?.photo_url)
                ? <img src={(user?.photoUrl ?? user?.photo_url)!} className="h-10 w-10 rounded-full object-cover" alt="" />
                : initials}
            </div>
            {/* Online dot */}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#778455] border-2 border-white" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.83rem] font-semibold text-foreground leading-tight">
              {firstName}
            </p>
            <p className="truncate text-[0.72rem] text-muted-foreground leading-tight mt-0.5">
              {user?.email}
            </p>
          </div>

          <ChevronRight size={14} className="flex-shrink-0 text-muted-foreground/50" />
        </Link>

        {/* ── Nav groups ── */}
        <nav className="flex-1 overflow-y-auto px-3 pb-2 space-y-5 mt-2
          [&::-webkit-scrollbar]:w-[3px]
          [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:bg-primary/10
          [&::-webkit-scrollbar-thumb:hover]:bg-[#76214D]/40">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p
                className="px-3 mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
                style={{ color: `${group.labelColor}70` }}
              >
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItem
                    key={item.to}
                    {...item}
                    onClick={() => setOpen(false)}
                    activeColor={item.activeColor}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Bottom actions ── */}
        <div className="border-t border-primary/10 p-3 space-y-1">
          <Link
            to="/app/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.82rem] font-medium text-muted-foreground hover:bg-primary/5 hover:text-foreground transition-all"
          >
            <Bell size={17} />
            <span>Notificaciones</span>
          </Link>
          <Link
            to="/app/profile/preferences"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.82rem] font-medium text-muted-foreground hover:bg-primary/5 hover:text-foreground transition-all"
          >
            <Settings size={17} />
            <span>Configuración</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.82rem] font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-all"
          >
            <LogOut size={17} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ───────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Mobile topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-primary/10 bg-background/80 backdrop-blur-md px-4 lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-xl p-2 text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-colors"
          >
            <Menu size={20} />
          </button>

          <Link to="/">
            <img
              src={opheliaLogo}
              alt="Ophelia Studio"
              className="w-[138px] max-w-full object-contain drop-shadow-[0_0_18px_rgba(233,116,95,0.14)]"
            />
          </Link>

          <Link to="/app/notifications" className="rounded-xl p-2 text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-colors">
            <Bell size={20} />
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 pb-24 lg:p-6 lg:pb-6">
          {children}
        </main>

        {/* ── Mobile bottom navigation ── */}
        <nav className="fixed bottom-0 inset-x-0 z-30 flex lg:hidden
          border-t border-primary/10 bg-white/95 backdrop-blur-md
          pb-safe">
          {BOTTOM_NAV.map(({ to, icon: Icon, label, color }) => {
            const active = pathname === to || (to !== "/app" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className="flex flex-1 flex-col items-center justify-center gap-1 py-3 transition-all"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-xl transition-all",
                    !active && "text-muted-foreground"
                  )}
                  style={active ? {
                    background: `linear-gradient(135deg, ${color}25, ${color}10)`,
                    color: color,
                  } : {}}
                >
                  <Icon size={18} />
                </span>
                <span
                  className={cn(
                    "text-[0.62rem] font-medium leading-none",
                    !active && "text-muted-foreground/60"
                  )}
                  style={active ? { color } : {}}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

      </div>
    </div>
  );
};

export default ClientLayout;
