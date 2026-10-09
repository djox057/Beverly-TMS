import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Sidebar } from "@/components/Sidebar";
import { UPCOMING_DRIVERS_ROLES } from "@/lib/upcomingDriversAccess";
import UpcomingDrivers from "@/pages/UpcomingDrivers";

// This suite exercises routing/navigation permissions, independent of board queries.
vi.mock("@/pages/UpcomingDrivers", () => ({ default: () => <h1>Upcoming Drivers</h1> }));

const auth = vi.hoisted(() => ({
  primaryRole: null as string | null,
  signedIn: true,
  loading: false,
  isMobile: false,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({
    // No ID: sidebar scheduling effects must not perform network requests.
    user: auth.signedIn ? { email: "test@example.com" } : null,
    profile: null,
    loading: auth.loading,
    getPrimaryRole: () => auth.primaryRole,
    hasRole: (role: string) => {
      // Model broad inherited permissions to catch an accidental non-strict gate.
      if (["admin", "manager", "chicago_management", "accounting", "claims"].includes(auth.primaryRole ?? "")) {
        return role !== "driver";
      }
      if (["supervisor", "safety", "maintenance"].includes(auth.primaryRole ?? "") && role === "dispatch") return true;
      return auth.primaryRole === role;
    },
    signOut: vi.fn(),
  }),
}));
vi.mock("@/contexts/IndividualModeContext", () => ({
  useIndividualMode: () => ({ individualMode: false, canUseIndividualMode: false, setIndividualMode: vi.fn() }),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/hooks/usePretripMissingCount", () => ({ usePretripMissingCount: () => ({ data: 0 }) }));
vi.mock("@/hooks/useYardLoadsCount", () => ({ useYardLoadsCount: () => ({ data: 0 }) }));
vi.mock("@/hooks/useRecoveryLoadsCount", () => ({ useRecoveryLoadsCount: () => ({ data: { count: 0 } }) }));
vi.mock("@/hooks/useDispatchAlertCount", () => ({ useDispatchAlertCount: () => ({ data: 0 }) }));
vi.mock("@/hooks/useDailyReportPermissions", () => ({ useDailyReportPermissions: () => ({ canView: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/ui/sidebar", () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Sidebar: Container,
    SidebarContent: Container,
    SidebarGroup: Container,
    SidebarGroupContent: Container,
    SidebarGroupLabel: Container,
    SidebarMenu: Container,
    SidebarMenuButton: Container,
    SidebarMenuItem: Container,
    SidebarTrigger: () => null,
    useSidebar: () => ({ state: "expanded", isMobile: auth.isMobile, setOpen: vi.fn(), setOpenMobile: vi.fn() }),
  };
});

const allowed = ["admin", "manager", "supervisor", "safety", "recruiting", "chicago_management", "dispatch"];
const denied = ["afterhours", "driver", "accounting", "maintenance", "yard", "claims", "unknown", null];

beforeEach(() => {
  auth.primaryRole = null;
  auth.signedIn = true;
  auth.loading = false;
});
afterEach(cleanup);

// Navigation is hidden independently of the unchanged direct-route permissions.
const hiddenPaths = [
  "/trucks-map", "/upcoming-drivers", "/driver-expenses", "/stuff",
  "/transfer-list", "/roadside-inspection", "/truck-sales", "/repairs", "/fuel-reports",
];

for (const isMobile of [false, true]) {
  describe(`Hidden navigation (${isMobile ? "mobile" : "desktop"})`, () => {
    it.each([...allowed, ...denied])("hides all nine page families for %s", (role) => {
      auth.primaryRole = role;
      auth.isMobile = isMobile;
      render(<MemoryRouter><Sidebar /></MemoryRouter>);
      const links = screen.getAllByRole("link");
      for (const path of hiddenPaths) {
        expect(links.some(link => {
          const href = link.getAttribute("href");
          return href === path || href?.startsWith(`${path}/`);
        }), path).toBe(false);
      }
      // Guard against an empty sidebar making every absence assertion pass.
      expect(screen.getByRole("link", { name: "Info" })).toHaveAttribute("href", "/info");
    });
  });
}

const renderRoute = () => render(
  <MemoryRouter initialEntries={["/upcoming-drivers"]}>
    <Routes>
      <Route path="/upcoming-drivers" element={
        <ProtectedRoute strictAllowedRoles={UPCOMING_DRIVERS_ROLES}>
          <UpcomingDrivers />
        </ProtectedRoute>
      } />
      <Route path="/login" element={<h1>Login</h1>} />
    </Routes>
  </MemoryRouter>,
);

describe("Upcoming Drivers direct URL access", () => {
  it.each(allowed)("allows %s", (role) => {
    auth.primaryRole = role;
    renderRoute();
    expect(screen.getByRole("heading", { name: "Upcoming Drivers" })).toBeInTheDocument();
  });

  it.each(denied)("denies %s without rendering the page", (role) => {
    auth.primaryRole = role;
    renderRoute();
    expect(screen.getByRole("heading", { name: "Access Denied" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Upcoming Drivers" })).not.toBeInTheDocument();
  });

  it("redirects signed-out users to login", () => {
    auth.signedIn = false;
    renderRoute();
    expect(screen.getByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Upcoming Drivers" })).not.toBeInTheDocument();
  });

  it("does not render the page while authentication is loading", () => {
    auth.primaryRole = "admin";
    auth.loading = true;
    renderRoute();
    expect(screen.queryByRole("heading", { name: "Upcoming Drivers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Login" })).not.toBeInTheDocument();
  });
});
