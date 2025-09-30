import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { DriverLayout } from "./components/DriverLayout";
import Index from "./pages/Index";
import Login from "./pages/Login";
import DriverDashboard from "./pages/driver/DriverDashboard";
import DriverOrders from "./pages/driver/DriverOrders";
import DriverInfo from "./pages/driver/DriverInfo";
import AdminUsers from "./pages/AdminUsers";
import NewOrder from "./pages/NewOrder";
import EditOrder from "./pages/EditOrder";
import Orders from "./pages/Orders";
import Trucks from "./pages/Trucks";
import Trailers from "./pages/Trailers";
import Drivers from "./pages/Drivers";
import Brokers from "./pages/Brokers";
import Fleets from "./pages/Fleets";
import Reports from "./pages/Reports";
import WeeklyReport from "./pages/WeeklyReport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrowserRouter>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin/users" element={
              <ProtectedRoute requiredRole="admin">
                <Layout><AdminUsers /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/" element={
              <ProtectedRoute requiredRole="dispatch">
                <Layout><Index /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/new-order" element={
              <ProtectedRoute requiredRole="dispatch">
                <Layout><NewOrder /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/edit-order/:id" element={
              <ProtectedRoute requiredRole="dispatch">
                <Layout><EditOrder /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/orders" element={
              <ProtectedRoute requiredRole="dispatch">
                <Layout><Orders /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/trucks" element={
              <ProtectedRoute requiredRole="dispatch">
                <Layout><Trucks /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/trailers" element={
              <ProtectedRoute requiredRole="dispatch">
                <Layout><Trailers /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/drivers" element={
              <ProtectedRoute requiredRole="dispatch">
                <Layout><Drivers /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/brokers" element={
              <ProtectedRoute requiredRole="dispatch">
                <Layout><Brokers /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/fleets" element={
              <ProtectedRoute requiredRole="dispatch">
                <Layout><Fleets /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/reports" element={
              <ProtectedRoute requiredRole="dispatch">
                <Layout><Reports /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/weekly-report" element={
              <ProtectedRoute requiredRole="admin">
                <Layout><WeeklyReport /></Layout>
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
            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </BrowserRouter>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
