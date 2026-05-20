import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

const ADMIN_ROLES = ["admin", "super_admin", "reception", "instructor"];

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRoles?: string[];
}

export const AuthGuard = ({ children, requiredRoles = ADMIN_ROLES }: AuthGuardProps) => {
  const { user, isAuthenticated, checkAuth } = useAuthStore();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isAuthenticated) {
        await checkAuth();
      }
      setChecked(true);
    })();
  }, []);

  if (!checked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-foreground">
        Cargando...
      </div>
    );
  }

  // Redirección declarativa con <Navigate>: idempotente, no apila history y
  // no dispara navigation throttling de Chrome aunque el componente re-renderice.
  if (!isAuthenticated || !user) {
    return <Navigate to={`/auth/login?returnUrl=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (!requiredRoles.includes(user.role)) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
};
