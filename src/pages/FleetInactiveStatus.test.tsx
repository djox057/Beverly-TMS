import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Trucks from "./Trucks";
import Trailers from "./Trailers";

const mocks = vi.hoisted(() => ({
  units: [] as any[], updates: vi.fn(), inserts: vi.fn(), failDetach: false,
  refetch: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/hooks/useTrucks", () => ({ useTrucks: () => ({ data: mocks.units, refetch: mocks.refetch }) }));
vi.mock("@/hooks/useTrailers", () => ({ useTrailers: () => ({ data: mocks.units, refetch: mocks.refetch }) }));
vi.mock("@/hooks/useDrivers", () => ({ useDrivers: () => ({ data: [] }) }));
vi.mock("@/hooks/useCompanies", () => ({ useCompanies: () => ({ data: [] }) }));
vi.mock("@/hooks/useFleetManagement", () => ({ useFleetManagement: () => ({ allDispatchers: [] }) }));
vi.mock("@/hooks/useChangedTrucks", () => ({ useChangedTrucks: () => ({ data: new Set() }) }));
vi.mock("@/hooks/useChangedTrailers", () => ({ useChangedTrailers: () => ({ data: new Set() }) }));
vi.mock("@/hooks/useVinAutofill", () => ({ useVinAutofill: () => "" }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "admin1" } }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ hasRole: (role: string) => role === "admin" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }), toast: mocks.toast }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/TruckFilesManager", () => ({ TruckFilesManager: () => null }));
vi.mock("@/components/TrailerFilesManager", () => ({ TrailerFilesManager: () => null }));
vi.mock("@/components/AssignmentHistoryDialog", () => ({ AssignmentHistoryDialog: () => null }));
vi.mock("@/components/AssignmentReasonDialog", () => ({ AssignmentReasonDialog: () => null }));
vi.mock("@/components/TruckSourceSelect", () => ({ TruckSourceSelect: () => null }));
vi.mock("@/components/ui/combobox", () => ({ Combobox: ({ options, value, onValueChange, placeholder }: any) => <select aria-label={placeholder} value={value} onChange={e => onValueChange(e.target.value)}><option value="" />{options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const query: any = { select: () => query, eq: () => query, order: () => query,
    then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
    insert: (value: any) => { mocks.inserts(table, value); return query; },
    delete: () => query,
    update: (value: any) => { mocks.updates(table, value); return {
      eq: () => Promise.resolve({ error: table === "trucks" && value.trailer_id === null && mocks.failDetach ? { message: "Detach failed" } : null })
    }; },
  }; return query;
} } }));

const unit = (id: string, is_active: boolean, is_temporary_inactive = false) => ({ id, truck_number: id, trailer_number: id, is_active, is_temporary_inactive });
const mount = (Component: typeof Trucks) => render(<QueryClientProvider client={new QueryClient()}><Component /></QueryClientProvider>);
const filter = (value: string) => {
  const control = screen.getAllByRole("combobox").find(el => within(el).queryByRole("option", { name: "All Status" }));
  fireEvent.change(control!, { target: { value } });
};
const edit = async (id: string) => {
  const row = screen.getByText(id, { selector: "td" }).closest("tr")!;
  fireEvent.click(within(row).getAllByRole("button")[0]);
  await screen.findByRole("button", { name: /^Update (Truck|Trailer)$/ });
};
const saveNote = async () => {
  const save = screen.getByRole("button", { name: /^Save & Mark/ });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "" }), { target: { value: "Waiting for repair" } });
  fireEvent.click(save);
};
beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => { mocks.units = [unit("100", true), unit("200", false, true), unit("300", false)]; mocks.updates.mockClear(); mocks.inserts.mockClear(); mocks.failDetach = false; });
afterEach(cleanup);

for (const [kind, Component] of [["truck", Trucks], ["trailer", Trailers]] as const) {
  describe(`${kind} inactivity workflow`, () => {
    it("keeps active, temporarily inactive and inactive filters separate", () => {
      mount(Component);
      expect(screen.getByText("100", { selector: "td" })).toBeInTheDocument();
      expect(screen.queryByText("200", { selector: "td" })).toBeNull();
      filter("temporary_inactive");
      expect(screen.getByText("200", { selector: "td" })).toBeInTheDocument();
      expect(screen.queryByText("300", { selector: "td" })).toBeNull();
      filter("inactive");
      expect(screen.getByText("300", { selector: "td" })).toBeInTheDocument();
      expect(screen.queryByText("200", { selector: "td" })).toBeNull();
      filter("all");
      for (const id of ["100", "200", "300"]) expect(screen.getByText(id, { selector: "td" })).toBeInTheDocument();
    });
    it.each(["temporary_inactive", "inactive"] as const)("marks an active unit %s and clears assignments", async status => {
      mount(Component); await edit("100");
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      const actions = within(screen.getByRole("alertdialog")).getAllByRole("button");
      expect(actions.map(b => b.textContent)).toEqual(["Cancel", "Temporary inactive", "Inactive"]);
      fireEvent.click(screen.getByRole("button", { name: status === "temporary_inactive" ? "Temporary inactive" : "Inactive" }));
      await saveNote();
      await waitFor(() => expect(mocks.updates).toHaveBeenCalledWith(`${kind}s`, expect.objectContaining({ is_active: false, is_temporary_inactive: status === "temporary_inactive", termination_date: expect.any(String) })));
      if (kind === "truck") expect(mocks.updates).toHaveBeenCalledWith("trucks", expect.objectContaining({ driver1_id: null, driver2_id: null, trailer_id: null }));
      else expect(mocks.updates.mock.calls[0]).toEqual(["trucks", { trailer_id: null }]);
      expect(mocks.inserts).toHaveBeenCalledWith(`${kind}_termination_notes`, expect.objectContaining({ note: "Waiting for repair" }));
    });
    it("resumes temporarily inactive equipment without restoring old assignments", async () => {
      mount(Component); filter("temporary_inactive"); await edit("200");
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
      await waitFor(() => expect(mocks.updates).toHaveBeenCalledWith(`${kind}s`, { is_active: true, is_temporary_inactive: false, termination_date: null }));
    });
    it("converts temporary inactivity to inactive", async () => {
      mount(Component); filter("temporary_inactive"); await edit("200");
      fireEvent.click(screen.getByRole("button", { name: "Mark inactive" }));
      expect(screen.queryByRole("button", { name: "Temporary inactive" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
      await saveNote();
      await waitFor(() => expect(mocks.updates).toHaveBeenCalledWith(`${kind}s`, expect.objectContaining({ is_active: false, is_temporary_inactive: false })));
    });
    it("keeps Start available for ordinary inactive equipment", async () => {
      mount(Component); filter("inactive"); await edit("300");
      expect(screen.queryByRole("button", { name: "Mark inactive" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Start" }));
      await waitFor(() => expect(mocks.updates).toHaveBeenCalledWith(`${kind}s`, { is_active: true, is_temporary_inactive: false, termination_date: null }));
    });
  });
}

it("does not mark a trailer inactive when detaching it from a truck fails", async () => {
  mocks.failDetach = true;
  mount(Trailers); await edit("100");
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  fireEvent.click(screen.getByRole("button", { name: "Temporary inactive" }));
  await saveNote();
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Detach failed", variant: "destructive" })));
  expect(mocks.updates).not.toHaveBeenCalledWith("trailers", expect.anything());
});
