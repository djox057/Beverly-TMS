import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoadRecord } from "@/lib/roadsides";
import Roadsides from "./Roadsides";

const mock = vi.hoisted(() => ({ role: "safety", update: vi.fn(), records: [] as RoadRecord[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ user: { id: "u" }, getPrimaryRole: () => mock.role }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query, order: () => query, limit: () => query,
      eq: (key: string, value: string) => { filters[key] = value; return query; },
      update: (payload: unknown) => { mock.update(payload); return query; },
      maybeSingle: () => ({ data: { id: filters.id }, error: null }),
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
    <MemoryRouter initialEntries={[path]}><Roadsides /></MemoryRouter>
  </QueryClientProvider>);
}

beforeEach(() => {
  mock.update.mockClear();
  mock.role = "safety";
  mock.records = [base, { ...base, id: "l1", sheet: "Lawyers", fields: { driver: "Case Driver", court: "Continued to March", extra: "Extra cell" } }];
});

describe("Roadsides workbook", () => {
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
