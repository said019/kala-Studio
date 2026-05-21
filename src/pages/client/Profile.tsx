import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  Tag,
  KALA,
} from "@/components/app/AppShell";
import {
  UserRound,
  CreditCard,
  Bell,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  LogOut,
  MessageCircle,
  FileText,
} from "lucide-react";

const Profile = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const fullName = user?.displayName ?? user?.display_name ?? user?.email?.split("@")[0] ?? "Alumna";
  const firstName = fullName.split(" ")[0];
  const email = user?.email ?? "";
  const phone = user?.phone ?? "";
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const roleLabel =
    user?.role === "client"
      ? user?.gender === "male"
        ? "Alumno"
        : user?.gender === "other"
          ? "Comunidad"
          : "Alumna"
      : (user?.role ?? "Cliente");

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Tu cuenta"
          title="Perfil."
        />

        {/* ── Header card ── */}
        <div
          className="rounded-3xl p-5 sm:p-7 flex items-center gap-5"
          style={{ backgroundColor: KALA.blush }}
        >
          <div
            className="relative grid h-20 w-20 sm:h-24 sm:w-24 place-items-center rounded-full overflow-hidden text-[1.2rem] font-bold shrink-0"
            style={{ backgroundColor: KALA.berry, color: KALA.cream }}
          >
            {(user?.photoUrl ?? user?.photo_url) ? (
              <img
                src={(user?.photoUrl ?? user?.photo_url)!}
                alt={fullName}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              className="font-bebas leading-tight truncate"
              style={{ color: KALA.ink, fontSize: "clamp(1.55rem, 2.6vw, 2.1rem)" }}
            >
              {fullName}
            </h2>
            {email && (
              <p className="text-[0.86rem] mt-1 truncate" style={{ color: KALA.ink, opacity: 0.65 }}>
                {email}
              </p>
            )}
            {phone && (
              <p className="text-[0.82rem] mt-0.5 truncate" style={{ color: KALA.ink, opacity: 0.55 }}>
                {phone}
              </p>
            )}
            <div className="mt-3">
              <Tag tint="berry">{roleLabel}</Tag>
            </div>
          </div>
        </div>

        {/* ── Cuenta ── */}
        <Section title="Cuenta">
          <ListGroup>
            <ListRow
              to="/app/profile/edit"
              icon={<UserRound size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Editar perfil"
              description="Nombre, foto, contacto"
            />
            <ListRow
              to="/app/profile/membership"
              icon={<CreditCard size={17} strokeWidth={1.7} />}
              iconTint="olive"
              title="Mi membresía"
              description="Plan, vigencia, clases por usar"
            />
            <ListRow
              to="/app/orders"
              icon={<FileText size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Mis órdenes"
              description="Historial de compras"
            />
            <ListRow
              to="/app/profile/refer"
              icon={<Sparkles size={17} strokeWidth={1.7} />}
              iconTint="coral"
              title="Invita a una amiga"
              description="Las dos ganan una recompensa"
            />
            <ListRow
              to="/app/profile/security"
              icon={<ShieldCheck size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Seguridad"
              description="Cambia tu contraseña"
            />
          </ListGroup>
        </Section>

        {/* ── Preferencias ── */}
        <Section title="Preferencias">
          <ListGroup>
            <ListRow
              to="/app/profile/preferences"
              icon={<Bell size={17} strokeWidth={1.7} />}
              iconTint="orange"
              title="Notificaciones"
              description="Recordatorios y novedades"
            />
            <ListRow
              to="/legal/privacidad"
              icon={<ShieldCheck size={17} strokeWidth={1.7} />}
              iconTint="olive"
              title="Privacidad"
              description="Cómo cuidamos tus datos"
            />
          </ListGroup>
        </Section>

        {/* ── Soporte ── */}
        <Section title="Soporte">
          <ListGroup>
            <ListRow
              onClick={() => window.open("https://wa.me/524443073266", "_blank", "noopener")}
              asButton
              icon={<MessageCircle size={17} strokeWidth={1.7} />}
              iconTint="olive"
              title="Escríbenos por WhatsApp"
              description="Respondemos rápido"
            />
            <ListRow
              to="/legal/terminos"
              icon={<HelpCircle size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Términos y condiciones"
            />
          </ListGroup>
        </Section>

        {/* ── Sesión ── */}
        <Section title="Sesión">
          <ListGroup>
            <ListRow
              onClick={handleLogout}
              asButton
              icon={<LogOut size={17} strokeWidth={1.7} />}
              destructive
              title="Cerrar sesión"
              description={`Salir de la cuenta de ${firstName}`}
            />
          </ListGroup>
        </Section>

        <p className="mt-12 text-[0.7rem] uppercase tracking-[0.18em]" style={{ color: KALA.ink, opacity: 0.4 }}>
          Versión Kala · {new Date().getFullYear()}
        </p>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Profile;
