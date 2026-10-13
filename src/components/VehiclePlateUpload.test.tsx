import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TruckFilesManager } from "@/components/TruckFilesManager";
import { TrailerFilesManager } from "@/components/TrailerFilesManager";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), upload: vi.fn(), insert: vi.fn(), update: vi.fn(), toast: vi.fn(),
  updateSingle: vi.fn(), plate: "AB0012",
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ profile: { email: "tester@example.com" }, hasRole: () => true }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    let updating = false;
    const query = {
      select: () => query, eq: () => query, is: () => query,
      order: async () => ({ data: [], error: null }),
      single: async () => updating ? mocks.updateSingle() : ({ data: { plate: mocks.plate, vin: null }, error: null }),
      update: (value: unknown) => { updating = true; mocks.update(value); return query; },
      insert: mocks.insert,
    };
    return query;
  },
  functions: { invoke: mocks.invoke },
  storage: { from: () => ({ upload: mocks.upload }) },
} }));

const result = (status = "mismatch", canUpdatePlate = true) => ({ data: { data: {
  status, currentPlate: "AB0012", currentVin: null, detectedPlate: status === "match" ? "AB0012" : "ZZ987",
  detectedPlates: [status === "match" ? "AB0012" : "ZZ987"], documentVin: null, vinMatches: null, canUpdatePlate,
} }, error: null });

async function startUpload(type: "truck" | "trailer") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{type === "truck"
    ? <TruckFilesManager truckId="12345678-1234-1234-1234-123456789abc" truckNumber="1001" />
    : <TrailerFilesManager trailerId="12345678-1234-1234-1234-123456789abc" trailerNumber="2001" />}</QueryClientProvider>);
  fireEvent.change(document.getElementById(`${type}-file-input`)!, { target: { files: [new File(["test"], "registration.pdf", { type: "application/pdf" })] } });
  fireEvent.click(await screen.findByRole("button", { name: "Upload (1)" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.plate = "AB0012";
  mocks.invoke.mockResolvedValue(result());
  mocks.upload.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.updateSingle.mockImplementation(async () => {
    mocks.plate = "ZZ987";
    return { data: { id: "vehicle-id", plate: "ZZ987" }, error: null };
  });
});
afterEach(cleanup);

describe.each(["truck", "trailer"] as const)("%s file plate review", (type) => {
  it("checks the correct vehicle before storage and cancels without an upload", async () => {
    await startUpload(type);
    await screen.findByText("The document plate does not match the vehicle's plate in TMS.");
    const body = mocks.invoke.mock.calls[0][1].body as FormData;
    expect(body.get("vehicleType")).toBe(type);
    expect(body.get("vehicleId")).toBe("12345678-1234-1234-1234-123456789abc");
    expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload (1)" })).toBeEnabled());
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("lets the user correct the plate explicitly, then upload", async () => {
    await startUpload(type);
    fireEvent.click(await screen.findByRole("button", { name: "Use ZZ987" }));
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save plate" }));
    await screen.findByText("Plate matches this vehicle.");
    expect(mocks.update).toHaveBeenCalledWith({ plate: "ZZ987" });
    expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue upload" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
  });
  it("preserves the existing plate when uploading despite a warning", async () => {
    await startUpload(type);
    fireEvent.click(await screen.findByRole("button", { name: "Upload anyway — keep current plate" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("automatically uploads a matching document", async () => {
    mocks.invoke.mockResolvedValue(result("match"));
    await startUpload(type);
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Review vehicle plate")).not.toBeInTheDocument();
  });
  it("requires manual review when the provider fails", async () => {
    mocks.invoke.mockResolvedValue({ error: new Error("Timeout") });
    await startUpload(type);
    await screen.findByText(/AI checking was unavailable/);
    expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Upload anyway — keep current plate" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
  });
  it("hides correction from users without vehicle edit permission", async () => {
    mocks.invoke.mockResolvedValue(result("mismatch", false));
    await startUpload(type);
    await screen.findByText("A user with vehicle edit permission can correct the plate number.");
    expect(screen.queryByRole("button", { name: "Save plate" })).not.toBeInTheDocument();
  });
  it("keeps the review open if a plate save is denied or conflicts", async () => {
    mocks.updateSingle.mockResolvedValue({ data: null, error: new Error("Permission denied") });
    await startUpload(type);
    fireEvent.click(await screen.findByRole("button", { name: "Save plate" }));
    await screen.findByRole("alert");
    expect(screen.getByText("The document plate does not match the vehicle's plate in TMS.")).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
