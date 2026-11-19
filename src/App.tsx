import { roadReaders } from "@/lib/roadsides";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "./contexts/AuthContext";
import { ChatbotProvider } from "./contexts/ChatbotContext";
import { ChatbotPanel } from "./components/ChatbotPanel";
import { IndividualModeProvider } from "./contexts/IndividualModeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { PageTitle } from "./components/PageTitle";
import { lazyPage } from "./components/lazyPage";
import { useRealtimeTokenRefresh } from "./hooks/useRealtimeTokenRefresh";
import { useReportsRealtime } from "./hooks/useReportsRealtime";
import { useTruckSalesRealtime } from "./hooks/useTruckSalesRealtime";
import Login from "./pages/Login";
import { UPCOMING_DRIVERS_ROLES } from "./lib/upcomingDriversAccess";
import { DRIVER_EXPENSES_ROLES } from "./lib/driverExpensesAccess";
import { YARD_REPAIR_VIEW_ROLES } from "@/hooks/useMandatoryYardRepairs";
import { HOLIDAYS_ROLES } from "./lib/holidays";

const Index = lazyPage(() => import("./pages/Index"));
const ResetPassword = lazyPage(() => import("./pages/ResetPassword"));
const AdminUsers = lazyPage(() => import("./pages/AdminUsers"));
const NewOrder = lazyPage(() => import("./pages/NewOrder"));
const EditOrder = lazyPage(() => import("./pages/EditOrder"));
const Orders = lazyPage(() => import("./pages/Orders"));
const BgLoads = lazyPage(() => import("./pages/BgLoads"));
const LaleLoads = lazyPage(() => import("./pages/LaleLoads"));
const UesLoads = lazyPage(() => import("./pages/UesLoads"));
const ApsLoads = lazyPage(() => import("./pages/ApsLoads"));
const YardLoads = lazyPage(() => import("./pages/YardLoads"));
const Trucks = lazyPage(() => import("./pages/Trucks"));
const Trailers = lazyPage(() => import("./pages/Trailers"));
const Drivers = lazyPage(() => import("./pages/Drivers"));
const UpcomingDrivers = lazyPage(() => import("./pages/UpcomingDrivers"));
const DriverExpenses = lazyPage(() => import("./pages/DriverExpenses"));
const Brokers = lazyPage(() => import("./pages/Brokers"));
const Fleets = lazyPage(() => import("./pages/Fleets"));
const Reports = lazyPage(() => import("./pages/Reports"));
const RecoveryLoads = lazyPage(() => import("./pages/RecoveryLoads"));
const YardArrivals = lazyPage(() => import("./pages/YardArrivals"));
const Analytics = lazyPage(() => import("./pages/Analytics"));
const DispatcherTier = lazyPage(() => import("./pages/DispatcherTier"));
const DispatcherTierDetail = lazyPage(() => import("./pages/DispatcherTierDetail"));
const DriversComplaints = lazyPage(() => import("./pages/DriversComplaints"));
const Alerts = lazyPage(() => import("./pages/Alerts"));
const Trips = lazyPage(() => import("./pages/Trips"));
const TrucksMap = lazyPage(() => import("./pages/TrucksMap"));
const BeverlyHeatmap = lazyPage(() => import("./pages/BeverlyHeatmap"));
const Repairs = lazyPage(() => import("./pages/Repairs"));
const MandatoryYardRepair = lazyPage(() => import("./pages/MandatoryYardRepair"));
const FuelReports = lazyPage(() => import("./pages/FuelReports"));
const EfsRequests = lazyPage(() => import("./pages/EfsRequests"));
const Stuff = lazyPage(() => import("./pages/Stuff"));
const NotFound = lazyPage(() => import("./pages/NotFound"));
const Problems = lazyPage(() => import("./pages/Problems"));
const DailyReport = lazyPage(() => import("./pages/DailyReport"));
const Christmas = lazyPage(() => import("./pages/Christmas"));
const Holidays = lazyPage(() => import("./pages/Holidays"));
const Billboard = lazyPage(() => import("./pages/Billboard"));
const TransferList = lazyPage(() => import("./pages/TransferList"));
const TurnoverList = lazyPage(() => import("./pages/TurnoverList"));
const Roadsides = lazyPage(() => import("./pages/Roadsides"));
const RoadsideInspection = lazyPage(() => import("./pages/RoadsideInspection"));
const LiveOilChange = lazyPage(() => import("./pages/LiveOilChange"));
const Eld = lazyPage(() => import("./pages/Eld"));
const TruckServiceLog = lazyPage(() => import("./pages/TruckServiceLog"));
const PreTripInspection = lazyPage(() => import("./pages/PreTripInspection"));
const TruckSales = lazyPage(() => import("./pages/TruckSales"));
const Info = lazyPage(() => import("./pages/Info"));
const OAuthConsent = lazyPage(() => import("./pages/OAuthConsent"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000, // 10 minutes (increased to reduce Disk IO)
      gcTime: 15 * 60 * 1000, // 15 minutes
      refetchOnWindowFocus: false, // Disable refetch on window focus to reduce Disk IO
    },
  },
});

const AppContent = () => {
  useRealtimeTokenRefresh();
  useReportsRealtime();
  useTruckSalesRealtime();

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/oauth/consent" element={<OAuthConsent />} />
        <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
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
        <Route path="/lale-loads" element={
          <ProtectedRoute>
            <Layout><LaleLoads /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/ues-loads" element={
          <ProtectedRoute>
            <Layout><UesLoads /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/aps-loads" element={
          <ProtectedRoute>
            <Layout><ApsLoads /></Layout>
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
        <Route path="/upcoming-drivers" element={
          <ProtectedRoute strictAllowedRoles={UPCOMING_DRIVERS_ROLES}>
            <Layout><UpcomingDrivers /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/driver-expenses" element={
          <ProtectedRoute strictAllowedRoles={DRIVER_EXPENSES_ROLES}>
            <Layout><DriverExpenses /></Layout>
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
        <Route path="/recovery-loads" element={
          <ProtectedRoute strictAllowedRoles={['dispatch', 'supervisor', 'manager', 'admin']}>
            <Layout><RecoveryLoads /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/analytics" element={
          <ProtectedRoute excludedRoles={['accounting', 'claims']}>
            <Layout><Analytics /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/dispatcher-tier" element={
          <ProtectedRoute strictAllowedRoles={['admin', 'manager', 'chicago_management']}>
            <Layout><DispatcherTier /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/dispatcher-tier/:id" element={
          <ProtectedRoute strictAllowedRoles={['admin', 'manager', 'chicago_management']}>
            <Layout><DispatcherTierDetail /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/drivers-complaints" element={
          <ProtectedRoute strictAllowedRoles={['admin', 'manager', 'dispatch', 'supervisor', 'chicago_management', 'yard']} allowedEmails={['joey@bfprime.net']}>
            <Layout><DriversComplaints /></Layout>
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
        <Route path="/mandatory-yard-repair" element={
          <ProtectedRoute strictAllowedRoles={[...YARD_REPAIR_VIEW_ROLES]}>
            <Layout><MandatoryYardRepair /></Layout>
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
        <Route path="/trucks-map" element={
          <ProtectedRoute>
            <Layout><TrucksMap /></Layout>
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
          <ProtectedRoute allowedRoles={['manager', 'admin']}>
            <Layout><Problems /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/christmas" element={<ProtectedRoute strictAllowedRoles={['admin']}><Layout><Christmas /></Layout></ProtectedRoute>} />
        {['/holidays', '/holidays/:year', '/holidays/:year/:holidaySlug'].map(path => (
          <Route key={path} path={path} element={
            <ProtectedRoute strictAllowedRoles={HOLIDAYS_ROLES}>
              <Layout><Holidays /></Layout>
            </ProtectedRoute>
          } />
        ))}
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
        <Route path="/transfer-list" element={
          <ProtectedRoute excludedRoles={['yard']}>
            <Layout><TransferList /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/turnover-list" element={
          <ProtectedRoute requiredRole="admin">
            <Layout><TurnoverList /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/roadsides" element={
          <ProtectedRoute strictAllowedRoles={roadReaders}>
            <Layout><Roadsides /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/roadside-inspection" element={
          <ProtectedRoute>
            <Layout><RoadsideInspection /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/eld" element={
          <ProtectedRoute strictAllowedRoles={['admin', 'maintenance', 'manager']}>
            <Layout><Eld /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/live-oil-change" element={
          <ProtectedRoute
            excludedRoles={['afterhours', 'accounting', 'safety', 'claims']}
            allowedEmails={['ella@bfprime.net']}
          >
            <Layout><LiveOilChange /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/live-oil-change/:truckId" element={
          <ProtectedRoute
            excludedRoles={['afterhours', 'accounting', 'safety', 'claims']}
            allowedEmails={['ella@bfprime.net']}
          >
            <Layout><TruckServiceLog /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/pretrip-inspection" element={
          <ProtectedRoute strictAllowedRoles={['admin', 'maintenance', 'manager', 'supervisor', 'dispatch', 'safety']}>
            <Layout><PreTripInspection /></Layout>
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
            <ChatbotProvider>
              <PageTitle />
              <AppContent />
              <ChatbotPanel />
            </ChatbotProvider>
          </BrowserRouter>
        </IndividualModeProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
