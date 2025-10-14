import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { DriverLayout } from "./components/DriverLayout";
import { supabase } from "./integrations/supabase/client";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

// Lazy load heavy pages for code splitting
const Orders = lazy(() => import("./pages/Orders"));
const NewOrder = lazy(() => import("./pages/NewOrder"));
const EditOrder = lazy(() => import("./pages/EditOrder"));
const Reports = lazy(() => import("./pages/Reports"));
const Analytics = lazy(() => import("./pages/Analytics"));
const SamsaraDebug = lazy(() => import("./pages/SamsaraDebug"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const Trucks = lazy(() => import("./pages/Trucks"));
const Trailers = lazy(() => import("./pages/Trailers"));
const Drivers = lazy(() => import("./pages/Drivers"));
const Brokers = lazy(() => import("./pages/Brokers"));
const Fleets = lazy(() => import("./pages/Fleets"));
const Alerts = lazy(() => import("./pages/Alerts"));
const DriverDashboard = lazy(() => import("./pages/driver/DriverDashboard"));
const DriverOrders = lazy(() => import("./pages/driver/DriverOrders"));
const DriverInfo = lazy(() => import("./pages/driver/DriverInfo"));

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});

const AppContent = () => {
  // Removed aggressive prefetching - let queries load on demand with caching

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin/users" element={
            <ProtectedRoute requiredRole="admin">
              <Layout><AdminUsers /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/" element={
            <ProtectedRoute>
              <Layout><Index /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/new-order" element={
            <ProtectedRoute>
              <Layout><NewOrder /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/edit-order/:id" element={
            <ProtectedRoute>
              <Layout><EditOrder /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/orders" element={
            <ProtectedRoute>
              <Layout><Orders /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/trucks" element={
            <ProtectedRoute>
              <Layout><Trucks /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/trailers" element={
            <ProtectedRoute>
              <Layout><Trailers /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/drivers" element={
            <ProtectedRoute>
              <Layout><Drivers /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/brokers" element={
            <ProtectedRoute>
              <Layout><Brokers /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/fleets" element={
            <ProtectedRoute>
              <Layout><Fleets /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute>
              <Layout><Reports /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/analytics" element={
            <ProtectedRoute excludedRoles={['accounting']}>
              <Layout><Analytics /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/samsara-debug" element={
            <ProtectedRoute requiredRole="admin">
              <Layout><SamsaraDebug /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/alerts" element={
            <ProtectedRoute>
              <Layout><Alerts /></Layout>
            </ProtectedRoute>
          } />
          {/* Driver Portal Routes */}
          <Route path="/driver" element={
            <ProtectedRoute requiredRole="driver">
              <DriverLayout><DriverDashboard /></DriverLayout>
            </ProtectedRoute>
          } />
          <Route path="/driver/orders" element={
            <ProtectedRoute requiredRole="driver">
              <DriverLayout><DriverOrders /></DriverLayout>
            </ProtectedRoute>
          } />
          <Route path="/driver/info" element={
            <ProtectedRoute requiredRole="driver">
              <DriverLayout><DriverInfo /></DriverLayout>
            </ProtectedRoute>
          } />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={
            <ProtectedRoute>
              <NotFound />
            </ProtectedRoute>
          } />
        </Routes>
      </Suspense>
    </TooltipProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
