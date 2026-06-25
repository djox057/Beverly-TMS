import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import { IndividualModeProvider } from "./contexts/IndividualModeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { supabase } from "./integrations/supabase/client";
import { useRealtimeTokenRefresh } from "./hooks/useRealtimeTokenRefresh";
import { useReportsRealtime } from "./hooks/useReportsRealtime";
import { useTruckSalesRealtime } from "./hooks/useTruckSalesRealtime";
import Index from "./pages/Index";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import AdminUsers from "./pages/AdminUsers";
import NewOrder from "./pages/NewOrder";
import EditOrder from "./pages/EditOrder";
import Orders from "./pages/Orders";
import BgLoads from "./pages/BgLoads";
import YardLoads from "./pages/YardLoads";
import Trucks from "./pages/Trucks";
import Trailers from "./pages/Trailers";
import Drivers from "./pages/Drivers";
import Brokers from "./pages/Brokers";
import Fleets from "./pages/Fleets";
import Reports from "./pages/Reports";
import YardArrivals from "./pages/YardArrivals";
import Analytics from "./pages/Analytics";
import DispatcherTier from "./pages/DispatcherTier";
import DispatcherTierDetail from "./pages/DispatcherTierDetail";
import Alerts from "./pages/Alerts";
import Trips from "./pages/Trips";
import BeverlyHeatmap from "./pages/BeverlyHeatmap";

import Repairs from "./pages/Repairs";
import FuelReports from "./pages/FuelReports";
import EfsRequests from "./pages/EfsRequests";
import Stuff from "./pages/Stuff";
import NotFound from "./pages/NotFound";
import Problems from "./pages/Problems";
import DailyReport from "./pages/DailyReport";
import Billboard from "./pages/Billboard";
// import TransferList from "./pages/TransferList";
import TurnoverList from "./pages/TurnoverList";
import RoadsideInspection from "./pages/RoadsideInspection";
import TruckSales from "./pages/TruckSales";
import Info from "./pages/Info";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000, // 10 minutes (increased to reduce Disk IO)
      gcTime: 15 * 60 * 1000, // 15 minutes
      refetchOnWindowFocus: false, // Disable refetch on window focus to reduce Disk IO
    },
  },
});

// Prefetch common data on app load
const prefetchData = async () => {
  const prefetchPromises = [
    // Note: trucks/trailers/drivers prefetches removed - their hooks use enriched queryFns
    // that don't match the simple select('*') used here, causing wasted double-fetches
    queryClient.prefetchQuery({
      queryKey: ['brokers'],
      queryFn: async () => {
        const { data } = await supabase
          .from('brokers')
          .select('*')
          .order('name');
        return data || [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ['companies'],
      queryFn: async () => {
        const { data } = await supabase
          .from('companies')
          .select('*')
          .order('name');
        return data || [];
      },
    }),
  ];

  await Promise.allSettled(prefetchPromises);
};

const AppContent = () => {
  useRealtimeTokenRefresh();
  useReportsRealtime();
  useTruckSalesRealtime();

  useEffect(() => {
    prefetchData();
  }, []);

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
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
        <Route path="/bg-loads" element={
          <ProtectedRoute>
            <Layout><BgLoads /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/yard-loads" element={
          <ProtectedRoute>
            <Layout><YardLoads /></Layout>
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
          <ProtectedRoute excludedRoles={['yard']}>
            <Layout><Reports /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/yard-arrivals" element={
          <ProtectedRoute>
            <Layout><YardArrivals /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/analytics" element={
          <ProtectedRoute excludedRoles={['accounting']}>
            <Layout><Analytics /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/dispatcher-tier" element={
          <ProtectedRoute allowedRoles={['admin', 'manager']}>
            <Layout><DispatcherTier /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/dispatcher-tier/:id" element={
          <ProtectedRoute allowedRoles={['admin', 'manager']}>
            <Layout><DispatcherTierDetail /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/beverly-heatmap" element={
          <ProtectedRoute allowedRoles={['manager', 'admin', 'chicago_management', 'dispatch']}>
            <Layout><BeverlyHeatmap /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/alerts" element={
          <ProtectedRoute>
            <Layout><Alerts /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/repairs" element={
          <ProtectedRoute>
            <Layout><Repairs /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/fuel-reports" element={
          <ProtectedRoute>
            <Layout><FuelReports /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/efs-requests" element={
          <ProtectedRoute>
            <Layout><EfsRequests /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/trips" element={
          <ProtectedRoute excludedRoles={['afterhours', 'driver']}>
            <Layout><Trips /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/stuff" element={
          <ProtectedRoute>
            <Layout><Stuff /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/stuff/:driverId" element={
          <ProtectedRoute>
            <Layout><Stuff /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/problems" element={
          <ProtectedRoute allowedRoles={['supervisor', 'manager', 'admin']}>
            <Layout><Problems /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/daily-report" element={
          <ProtectedRoute>
            <Layout><DailyReport /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/billboard" element={
          <ProtectedRoute>
            <Billboard />
          </ProtectedRoute>
        } />
        {/* <Route path="/transfer-list" element={
          <ProtectedRoute excludedRoles={['yard']}>
            <Layout><TransferList /></Layout>
          </ProtectedRoute>
        } /> */}
        <Route path="/turnover-list" element={
          <ProtectedRoute requiredRole="admin">
            <Layout><TurnoverList /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/roadside-inspection" element={
          <ProtectedRoute>
            <Layout><RoadsideInspection /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/truck-sales" element={
          <ProtectedRoute allowedRoles={['manager', 'admin', 'recruiting', 'chicago_management']}>
            <Layout><TruckSales /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/info" element={
          <ProtectedRoute>
            <Layout><Info /></Layout>
          </ProtectedRoute>
        } />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={
          <ProtectedRoute>
            <NotFound />
          </ProtectedRoute>
        } />
      </Routes>
    </TooltipProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <IndividualModeProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </IndividualModeProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
