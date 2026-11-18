import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";
import { lazyPage } from "./lazyPage";

vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({
    user: { id: "dispatcher" },
    loading: false,
    hasRole: (role: string) => role === "dispatch",
    getPrimaryRole: () => "dispatch",
  }),
}));

afterEach(() => vi.restoreAllMocks());

it("keeps navigation usable during a slow download and reuses the loaded page on return", async () => {
  const module = { default: () => <p>Report rows</p> };
  let finish!: (value: typeof module) => void;
  const load = vi.fn(() => new Promise<typeof module>(resolve => { finish = resolve; }));
  const Reports = lazyPage(load);
  render(
    <MemoryRouter initialEntries={["/reports"]}>
      <nav><Link to="/">Home</Link><Link to="/reports">Reports</Link></nav>
      <Routes>
        <Route path="/" element={<p>Dashboard</p>} />
        <Route path="/reports" element={<Reports />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading page");
  fireEvent.click(screen.getByRole("link", { name: "Home" }));
  await act(async () => { finish(module); });
  expect(screen.getByText("Dashboard")).toBeVisible();
  expect(screen.queryByText("Report rows")).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "Reports" }));
  expect(await screen.findByText("Report rows")).toBeVisible();
  expect(load).toHaveBeenCalledTimes(1);
});

it("checks access before requesting a protected page", () => {
  const load = vi.fn(async () => ({ default: () => <p>User management</p> }));
  const AdminUsers = lazyPage(load);
  render(<ProtectedRoute requiredRole="admin"><AdminUsers /></ProtectedRoute>);
  expect(screen.getByText("Access Denied")).toBeVisible();
  expect(load).not.toHaveBeenCalled();
});

it("offers an explicit reload when the page download fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const Page = lazyPage(async () => { throw new TypeError("Failed to fetch dynamically imported module"); });
  render(<Page />);
  expect(await screen.findByRole("alert")).toHaveTextContent("This page couldn’t load");
  expect(screen.getByRole("button", { name: "Reload page" })).toBeEnabled();
});
