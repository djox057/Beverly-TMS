import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { roadReaders, type RoadRecord } from "@/lib/roadsides";
import Roadsides from "./Roadsides";

const mock = vi.hoisted(() => ({ role: "maintenance", update: vi.fn(), conflict: false, records: [] as RoadRecord[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ user: { id: "u" }, getPrimaryRole: () => mock.role }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => {
    const filters: Record<string, string> = {};
    let patch: Partial<RoadRecord>;
    const query = {
      select: () => query, order: () => query, limit: () => query,
      eq: (key: string, value: string) => { filters[key] = value; return query; },
      update: (payload: Partial<RoadRecord>) => { patch = payload; mock.update(payload); return query; },
      maybeSingle: () => {
        const row = mock.records.find(r => r.id === filters.id && r.updated_at === filters.updated_at);
        if (!row || mock.conflict) return { data: null, error: null };
        const saved = { ...row, ...patch, updated_at: "t2" };
        mock.records = mock.records.map(r => r.id === row.id ? saved : r);
        return { data: saved, error: null };
      },
      abortSignal: () => ({ data: mock.records.filter(r => r.sheet === filters.sheet), error: null }),
    };
    return query;
  } },
}));

const base: RoadRecord = {
  id: "i1", source_row: 2, sheet: "ALL", fields: { driver: "Test Driver", truck: "0012", inspection_date: "2026-11-18", oos: "historic value" },
  links: { truck: "https://example.com/inspection" }, notes: { truck: "Copy requested" }, highlights: {}, created_at: "t1", updated_at: "t1",
};

function show(path = "/roadsides") {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><ProtectedRoute strictAllowedRoles={roadReaders}><Roadsides /></ProtectedRoute></MemoryRouter>
  </QueryClientProvider>);
}

beforeEach(() => {
  mock.update.mockClear();
  mock.conflict = false;
  mock.role = "maintenance";
  mock.records = [{ ...base }, { ...base, id: "l1", sheet: "Lawyers", fields: { driver: "Case Driver", court: "Continued to March", extra: "Extra cell" } }];
});

describe("Roadsides workbook", () => {
  it.each(["chicago_management", "dispatch", "supervisor", "accounting", "afterhours", "claims", "yard", "recruiting", "driver"])(
    "denies direct Roadsides access to %s", role => {
      mock.role = role;
      show("/roadsides?tab=lawyers");
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: "Lawyers" })).toBeNull();
    },
  );

  it.each([
    ["/roadsides", "Add inspection", "Driver name · 0012"],
    ["/roadsides?tab=lawyers", "Add case", "Driver name · Case Driver"],
  ])("allows Safety to open, add and edit records on %s", async (path, add, label) => {
    mock.role = "safety";
    show(path);
    expect(await screen.findByRole("button", { name: add })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Edit " + label }));
    const cell = screen.getByRole("textbox", { name: label });
    fireEvent.change(cell, { target: { value: "Updated driver" } });
    fireEvent.keyDown(cell, { key: "Enter" });
    await waitFor(() => expect(mock.update).toHaveBeenCalledWith({
      fields: expect.objectContaining({ driver: "Updated driver" }),
    }));
  });

  it("allows an admin to add inspections", async () => {
    mock.role = "admin";
    show();
    expect(await screen.findByRole("button", { name: "Add inspection" })).toBeInTheDocument();
  });

  it.each([
    ["/roadsides", "Edit Driver name · 0012"],
    ["/roadsides?tab=lawyers", "Edit Driver name · Case Driver"],
  ])("drags the worksheet horizontally while keeping click-to-edit on %s", async (path, label) => {
    show(path);
    const cell = await screen.findByRole("button", { name: label });
    const surface = screen.getByRole("table").parentElement!;
    fireEvent.mouseDown(cell, { button: 0, clientX: 150 });
    fireEvent.mouseMove(window, { clientX: 90 });
    fireEvent.mouseUp(cell);
    fireEvent.click(cell, { detail: 1 });
    expect(surface.scrollLeft).toBe(60);
    expect(cell).toBeInTheDocument();

    fireEvent.mouseDown(cell, { button: 0, clientX: 90 });
    fireEvent.mouseUp(cell);
    fireEvent.click(cell, { detail: 1 });
    const input = screen.getByRole("textbox", { name: label.slice(5) });
    fireEvent.mouseDown(input, { button: 0, clientX: 90 });
    fireEvent.mouseMove(window, { clientX: 50 });
    fireEvent.mouseUp(input);
    expect(surface.scrollLeft).toBe(60);
  });

  it("preserves truck links, date display and searchable cell notes", async () => {
    show();
    expect(await screen.findByRole("link", { name: "0012" })).toHaveAttribute("href", "https://example.com/inspection");
    expect(screen.getByText("11/18/2026")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search records"), { target: { value: "copy requested" } });
    expect(screen.getByText("Test Driver")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search records"), { target: { value: "missing" } });
    expect(screen.getByText("No matching records.")).toBeInTheDocument();
  });

  it("opens the Lawyers tab directly and gives management read-only access", async () => {
    mock.role = "manager";
    show("/roadsides?tab=lawyers");
    expect(await screen.findByText("Case Driver")).toBeInTheDocument();
    expect(screen.getByText("Extra cell")).toBeInTheDocument();
    expect(screen.queryByText("Test Driver")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add case" })).toBeNull();
  });

  it("edits a workbook dropdown in place and keeps all other fields and links", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Edit OOS · 0012" }));
    const cell = screen.getByRole("combobox", { name: "OOS · 0012" });
    expect(cell).toHaveValue("historic value");
    fireEvent.change(cell, { target: { value: "NO" } });
    fireEvent.keyDown(cell, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit OOS · 0012" })).toHaveTextContent("NO"));
    expect(mock.update).toHaveBeenCalledWith({ fields: { ...base.fields, oos: "NO" } });
    expect(screen.getByRole("link", { name: "0012" })).toHaveAttribute("href", base.links.truck);
  });

  it("cancels a Lawyers cell with Escape and reports conflicting saves", async () => {
    show("/roadsides?tab=lawyers");
    const edit = await screen.findByRole("button", { name: "Edit Court date · Case Driver" });
    fireEvent.click(edit);
    const input = screen.getByLabelText("Court date · Case Driver");
    fireEvent.change(input, { target: { value: "Next month" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mock.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit Court date · Case Driver" }));
    const retry = screen.getByLabelText("Court date · Case Driver");
    expect(retry).toHaveValue("Continued to March");
    mock.conflict = true;
    fireEvent.change(retry, { target: { value: "Next month" } });
    fireEvent.blur(retry);
    expect(await screen.findByRole("alert")).toHaveTextContent("Row changed");
  });

  it("retains legacy dropdown values and document links when another field changes", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Test Driver" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText("OOS")).toHaveValue("historic value");
    fireEvent.change(dialog.getByLabelText("Comment"), { target: { value: "Updated" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Add inspection" });
    expect(mock.update).toHaveBeenCalledWith({ fields: { ...base.fields, comment: "Updated" }, links: base.links, highlights: {} });
  });
});
