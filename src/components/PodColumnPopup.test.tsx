import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PodColumnPopup } from "./PodColumnPopup";
const mocks = vi.hoisted(() => ({ roles: ["accounting"], invoke: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuthContext: () => ({ hasRole: (role: string) => mocks.roles.includes(role) }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
const files = [
  { id: "pod1", file_name: "first.jpg", content_type: "image/jpeg", url: "https://example.test/first.jpg" },
  { id: "pod2", file_name: "second.pdf", content_type: "application/pdf", url: "https://example.test/second.pdf" },
];
const preview = (pods = files) => ({ loadNumber: "LOAD-123", files: pods,
  recipients: { bookerName: "Booker", to: "booker@example.test", replyTo: ["sender@example.test", "manager@example.test"] }, recipientError: null });
const open = async () => {
  render(<PodColumnPopup loadId="load1" />);
  expect(mocks.invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Preview PODs for load load1" }));
  await screen.findByText("Load LOAD-123");
};
beforeEach(() => {
  mocks.roles = ["accounting"]; mocks.invoke.mockReset(); mocks.success.mockReset(); mocks.error.mockReset();
  mocks.invoke.mockResolvedValue({ data: preview(), error: null });
});
afterEach(cleanup);
describe("POD preview and message", () => {
  it.each(["dispatch", "safety", "maintenance", "supervisor", "claims"])("hides the popup from %s", role => {
    mocks.roles = [role]; render(<PodColumnPopup loadId="load1" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument(); expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it.each(["accounting", "manager", "admin"])("allows %s to open the popup", async role => {
    mocks.roles = [role]; await open(); expect(screen.getByText(/booker@example.test/)).toBeInTheDocument();
  });
  it("auto-selects a sole POD and sends its ID with the message", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: preview([files[0]]), error: null });
    await open();
    expect(screen.getByRole("checkbox")).toBeChecked(); expect(screen.getByRole("checkbox")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason / message"), { target: { value: "Please check the signature." } });
    mocks.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Reject PODs & send" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.invoke.mock.calls[1][1].body).toMatchObject({ action: "send", orderId: "load1", message: "Please check the signature.", selectedFileIds: ["pod1"] });
  });
  it("keeps selection while browsing images and PDFs and attaches only selected PODs", async () => {
    await open(); expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("Reason / message"), { target: { value: "Review this POD." } });
    expect(screen.getByRole("button", { name: "Reject PODs & send" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Next POD" }));
    expect(screen.getByTitle("POD PDF preview")).toBeInTheDocument(); expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Previous POD" }));
    expect(screen.getByRole("checkbox")).toBeChecked(); expect(screen.getByRole("img")).toHaveAttribute("src", files[0].url);
    mocks.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Reject PODs & send" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.invoke.mock.calls[1][1].body.selectedFileIds).toEqual(["pod1"]);
  });
  it("preserves the draft and reuses the request ID after an uncertain email failure", async () => {
    await open(); fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Reason / message"), { target: { value: "Please review." } });
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: "Network error" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject PODs & send" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Network error"));
    expect(screen.getByLabelText("Reason / message")).toHaveValue("Please review.");
    mocks.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Reject PODs & send" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.invoke.mock.calls[2][1].body.requestId).toBe(mocks.invoke.mock.calls[1][1].body.requestId);
  });
  it("blocks sending when the booking user's manager is unresolved", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { ...preview(), recipients: null, recipientError: "No manager assigned." }, error: null });
    await open(); fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Reason / message"), { target: { value: "Review." } });
    expect(screen.getByRole("alert")).toHaveTextContent("No manager assigned.");
    expect(screen.getByRole("button", { name: "Reject PODs & send" })).toBeDisabled();
  });
  it("shows an empty state and blocks sending for a load without PODs", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: preview([]), error: null }); await open();
    expect(screen.getByText("No PODs uploaded for this load.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject PODs & send" })).toBeDisabled();
  });
});
