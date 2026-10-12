import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RejectedPodsDialog } from "./RejectedPodsDialog";
const mocks = vi.hoisted(() => ({ roles: ["accounting"], read: vi.fn(), eq: vi.fn(), or: vi.fn(), signed: vi.fn(), response: { data: [] as Record<string, unknown>[], count: 0, error: null as { message: string } | null } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ hasRole: (role: string) => mocks.roles.includes(role) }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => { const query = { select: () => query, order: () => query,
    eq: (...args: unknown[]) => { mocks.eq(...args); return query; },
    or: (...args: unknown[]) => { mocks.or(...args); return query; },
    range: async (...args: unknown[]) => { mocks.read(...args); return mocks.response; },
  }; return query; }, storage: { from: () => ({ createSignedUrl: mocks.signed }) },
} }));
const report = { id: "report1", order_id: "order1", broker_load_number: "BROKER-432", reason: "Signature is missing.\nPlease resend.", reporter_name: "Jane Accounting", created_at: "2026-10-12T19:00:00Z", notification_status: "sent",
  pods: [{ id: "file1", file_name: "rejected.jpg", file_path: "order1/rejected.jpg" }] };
const open = () => fireEvent.click(screen.getByRole("button", { name: "Rejected PODs" }));
beforeEach(() => { mocks.roles = ["accounting"]; mocks.read.mockClear(); mocks.eq.mockClear(); mocks.or.mockClear(); mocks.signed.mockReset(); mocks.response = { data: [report], count: 1, error: null }; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("rejected POD history", () => {
  it("loads only after opening and shows the broker number, reason, reporter, and documents", async () => {
    render(<RejectedPodsDialog />); expect(mocks.read).not.toHaveBeenCalled(); open();
    expect(await screen.findByText("BROKER-432")).toBeInTheDocument();
    expect(screen.getByText(/Signature is missing/)).toBeInTheDocument(); expect(screen.getByText("Jane Accounting")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "rejected.jpg" })).toBeInTheDocument(); expect(mocks.read).toHaveBeenCalledWith(0, 49);
  });
  it.each(["dispatch", "maintenance", "safety", "supervisor", "claims"])("hides history from %s", role => {
    mocks.roles = [role]; render(<RejectedPodsDialog />); expect(screen.queryByRole("button")).not.toBeInTheDocument(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("filters BG, LALE, and UES histories by the page company", async () => {
    render(<RejectedPodsDialog companyId="ues-company" />); open(); await screen.findByText("BROKER-432");
    expect(mocks.eq).toHaveBeenCalledWith("booked_by_company_id", "ues-company"); expect(mocks.or).not.toHaveBeenCalled();
  });
  it("keeps separately listed companies out of main Loads and includes unassigned company records", async () => {
    render(<RejectedPodsDialog excludedCompanyIds="bg,lale,ues" />); open(); await screen.findByText("BROKER-432");
    expect(mocks.or).toHaveBeenCalledWith("booked_by_company_id.is.null,booked_by_company_id.not.in.(bg,lale,ues)");
  });
  it("paginates beyond the first 50 reports and indicates unconfirmed emails", async () => {
    mocks.response = { data: [{ ...report, notification_status: "failed" }], count: 51, error: null };
    render(<RejectedPodsDialog />); open(); await screen.findByText("BROKER-432");
    expect(screen.getByText("Email not confirmed")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith(50, 99)); expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });
  it("shows query failures and refreshes successfully without claiming the list is empty", async () => {
    mocks.response = { data: [], count: 0, error: { message: "Access denied" } };
    render(<RejectedPodsDialog />); open(); expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
    expect(screen.queryByText("No rejected PODs for this load page.")).not.toBeInTheDocument();
    mocks.response = { data: [report], count: 1, error: null }; fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("BROKER-432")).toBeInTheDocument();
  });
  it("opens the recorded rejected POD using a fresh signed URL", async () => {
    const target = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(target as unknown as Window);
    mocks.signed.mockResolvedValue({ data: { signedUrl: "https://storage.test/rejected.jpg" }, error: null });
    render(<RejectedPodsDialog />); open(); await screen.findByText("BROKER-432"); fireEvent.click(screen.getByRole("button", { name: "rejected.jpg" }));
    await waitFor(() => expect(target.location.href).toBe("https://storage.test/rejected.jpg")); expect(target.opener).toBeNull();
    expect(mocks.signed).toHaveBeenCalledWith("order1/rejected.jpg", 3600);
  });
});
