import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "@/lib/api";
import type { User, LoginCredentials, RegisterData, AuthResponse } from "@/types/auth";

/* ── DEV-only bypass: alumna demo sin backend ──
   Activado solo en `import.meta.env.DEV`. En producción no existe.        */
const DEMO_EMAIL = "alumna@kala.test";
const DEMO_TOKEN_PREFIX = "dev-demo-";
const isDevDemoToken = (t: string | null) => Boolean(t && t.startsWith(DEMO_TOKEN_PREFIX));

const buildDemoUser = (): User => {
  const nowIso = new Date().toISOString();
  return {
    id: "dev-demo-alumna",
    email: DEMO_EMAIL,
    phone: "+524440000000",
    displayName: "Alumna Demo",
    display_name: "Alumna Demo",
    full_name: "Alumna Demo",
    gender: "female",
    photoUrl: null,
    photo_url: null,
    avatar_url: null,
    role: "client",
    emergencyContactName: null,
    emergency_contact_name: null,
    emergencyContactPhone: null,
    emergency_contact_phone: null,
    healthNotes: null,
    health_notes: null,
    acceptsCommunications: true,
    accepts_communications: true,
    dateOfBirth: null,
    date_of_birth: null,
    receiveReminders: true,
    receive_reminders: true,
    receivePromotions: false,
    receive_promotions: false,
    receiveWeeklySummary: true,
    receive_weekly_summary: true,
    createdAt: nowIso,
    created_at: nowIso,
    updatedAt: nowIso,
    updated_at: nowIso,
  };
};

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  updateUser: (user: User) => void;
  setAuth: (user: User, token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (credentials) => {
        set({ isLoading: true, error: null });

        // Dev-only demo bypass: alumna sin backend ni BD.
        if (import.meta.env.DEV && credentials.email.trim().toLowerCase() === DEMO_EMAIL) {
          const user = buildDemoUser();
          const token = `${DEMO_TOKEN_PREFIX}${Date.now()}`;
          localStorage.setItem("auth_token", token);
          await new Promise((r) => setTimeout(r, 250));
          set({ user, token, isAuthenticated: true, isLoading: false });
          return;
        }

        try {
          const res = await api.post<AuthResponse>("/auth/login", credentials);
          const { user, token } = res.data;
          localStorage.setItem("auth_token", token);
          set({ user, token, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          set({ error: err.response?.data?.message ?? "Error al iniciar sesión", isLoading: false });
          throw err;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const res = await api.post<AuthResponse>("/auth/register", data);
          const { user, token } = res.data;
          localStorage.setItem("auth_token", token);
          set({ user, token, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          set({ error: err.response?.data?.message ?? "Error al registrarse", isLoading: false });
          throw err;
        }
      },

      logout: () => {
        localStorage.removeItem("auth_token");
        set({ user: null, token: null, isAuthenticated: false });
      },

      checkAuth: async () => {
        const token = localStorage.getItem("auth_token");
        if (!token) { set({ isLoading: false }); return; }

        // Dev demo: mantener la sesión sintetizada sin pegarle al backend.
        if (import.meta.env.DEV && isDevDemoToken(token)) {
          set({ user: buildDemoUser(), token, isAuthenticated: true, isLoading: false });
          return;
        }

        set({ isLoading: true });
        try {
          const res = await api.get<{ user: User }>("/auth/me");
          set({ user: res.data.user, token, isAuthenticated: true, isLoading: false });
        } catch {
          localStorage.removeItem("auth_token");
          set({ user: null, token: null, isAuthenticated: false, isLoading: false });
        }
      },

      clearError: () => set({ error: null }),

      updateUser: (user) => set({ user }),

      setAuth: (user, token) => {
        localStorage.setItem("auth_token", token);
        set({ user, token, isAuthenticated: true });
      },
    }),
    { name: "auth-storage" }
  )
);
