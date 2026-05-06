import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Auth pages
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";

// Client pages
import Dashboard from "./pages/client/Dashboard";
import BookClasses from "./pages/client/BookClasses";
import BookClassConfirm from "./pages/client/BookClassConfirm";
import MyBookings from "./pages/client/MyBookings";
import Checkout from "./pages/client/Checkout";
import Orders from "./pages/client/Orders";
import OrderDetail from "./pages/client/OrderDetail";
import Wallet from "./pages/client/Wallet";
import WalletHistory from "./pages/client/WalletHistory";
import WalletRewards from "./pages/client/WalletRewards";
import Profile from "./pages/client/Profile";
import ProfileEdit from "./pages/client/ProfileEdit";
import ProfileMembership from "./pages/client/ProfileMembership";
import ProfilePreferences from "./pages/client/ProfilePreferences";
import ReferFriends from "./pages/client/ReferFriends";
import VideoLibrary from "./pages/client/VideoLibrary";
import VideoPlayer from "./pages/client/VideoPlayer";
import Notifications from "./pages/client/Notifications";
import Events from "./pages/client/Events";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import PlansList from "./pages/admin/plans/PlansList";
import MembershipsList from "./pages/admin/memberships/MembershipsList";
import ClientsList from "./pages/admin/clients/ClientsList";
import ClientDetail from "./pages/admin/clients/ClientDetail";
import ClassesCalendar from "./pages/admin/classes/ClassesCalendar";
import ClassTypesList from "./pages/admin/classes/ClassTypesList";
import GenerateClasses from "./pages/admin/classes/GenerateClasses";
import BookingsList from "./pages/admin/bookings/BookingsList";
import Waitlist from "./pages/admin/bookings/Waitlist";
import PaymentsPage from "./pages/admin/payments/PaymentsPage";
import OrdersVerification from "./pages/admin/orders/OrdersVerification";
import POSPage from "./pages/admin/pos/POSPage";
import DiscountCodes from "./pages/admin/discount-codes/DiscountCodes";
import LoyaltyPage from "./pages/admin/loyalty/LoyaltyPage";
import Referrals from "./pages/admin/referrals/Referrals";
import VideoList from "./pages/admin/videos/VideoList";
import VideoUpload from "./pages/admin/videos/VideoUpload";
import VideoSalesVerification from "./pages/admin/videos/VideoSalesVerification";
import ReportsPage from "./pages/admin/reports/ReportsPage";
import AdminReviewsDashboard from "./pages/admin/reviews/AdminReviewsDashboard";
import SettingsPage from "./pages/admin/settings/SettingsPage";
import EventsManager from "./pages/admin/events/EventsManager";

// Legal pages
import Privacidad from "./pages/legal/Privacidad";
import Terminos from "./pages/legal/Terminos";
import Cancelacion from "./pages/legal/Cancelacion";

const queryClient = new QueryClient();

// checkAuth on mount
const AppInit = () => {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  useEffect(() => { checkAuth(); }, []);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppInit />
        <Routes>
          {/* Public landing */}
          <Route path="/" element={<Index />} />

          {/* Legal pages */}
          <Route path="/legal/privacidad" element={<Privacidad />} />
          <Route path="/legal/terminos" element={<Terminos />} />
          <Route path="/legal/cancelacion" element={<Cancelacion />} />

          {/* Auth */}
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/register" element={<Register />} />
          <Route path="/auth/forgot-password" element={<ForgotPassword />} />
          <Route path="/auth/reset-password" element={<ResetPassword />} />
          {/* Legacy /auth → new login */}
          <Route path="/auth" element={<Navigate to="/auth/login" replace />} />

          {/* Client portal */}
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/classes" element={<BookClasses />} />
          <Route path="/app/classes/:classId" element={<BookClassConfirm />} />
          <Route path="/app/bookings" element={<MyBookings />} />
          <Route path="/app/checkout" element={<Checkout />} />
          <Route path="/app/orders" element={<Orders />} />
          <Route path="/app/orders/:orderId" element={<OrderDetail />} />
          <Route path="/app/wallet" element={<Wallet />} />
          <Route path="/app/wallet/history" element={<WalletHistory />} />
          <Route path="/app/wallet/rewards" element={<WalletRewards />} />
          <Route path="/app/videos" element={<VideoLibrary />} />
          <Route path="/app/videos/:videoId" element={<VideoPlayer />} />
          <Route path="/app/events" element={<Events />} />
          <Route path="/app/profile" element={<Profile />} />
          <Route path="/app/profile/edit" element={<ProfileEdit />} />
          <Route path="/app/profile/membership" element={<ProfileMembership />} />
          <Route path="/app/profile/preferences" element={<ProfilePreferences />} />
          <Route path="/app/profile/refer" element={<ReferFriends />} />
          <Route path="/app/notifications" element={<Notifications />} />

          {/* Admin panel */}
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/plans" element={<PlansList />} />
          <Route path="/admin/memberships" element={<MembershipsList />} />
          <Route path="/admin/clients" element={<ClientsList />} />
          <Route path="/admin/clients/:id" element={<ClientDetail />} />
          <Route path="/admin/classes" element={<ClassesCalendar />} />
          <Route path="/admin/classes/types" element={<ClassTypesList />} />
          <Route path="/admin/classes/generate" element={<GenerateClasses />} />
          <Route path="/admin/schedules" element={<Navigate to="/admin/classes" replace />} />
          <Route path="/admin/bookings" element={<BookingsList />} />
          <Route path="/admin/bookings/waitlist" element={<Waitlist />} />
          <Route path="/admin/staff" element={<Navigate to="/admin/classes" replace />} />
          <Route path="/admin/payments" element={<PaymentsPage />} />
          <Route path="/admin/orders" element={<OrdersVerification />} />
          <Route path="/admin/pos" element={<POSPage />} />
          <Route path="/admin/discount-codes" element={<DiscountCodes />} />
          <Route path="/admin/loyalty" element={<LoyaltyPage />} />
          <Route path="/admin/referrals" element={<Referrals />} />
          <Route path="/admin/videos" element={<VideoList />} />
          <Route path="/admin/videos/upload" element={<VideoUpload />} />
          <Route path="/admin/videos/ventas" element={<VideoSalesVerification />} />
          <Route path="/admin/reports" element={<ReportsPage />} />
          <Route path="/admin/reviews" element={<AdminReviewsDashboard />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
          <Route path="/admin/events" element={<EventsManager />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
