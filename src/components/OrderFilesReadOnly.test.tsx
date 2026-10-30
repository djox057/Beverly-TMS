import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OrderFilesReadOnly } from "./OrderFilesReadOnly";
const { signedUrl } = vi.hoisted(() => ({ signedUrl: vi.fn() }));
vi.mock("@/utils/orderFileSignedUrl", () => ({ getOrderFileSignedUrl: signedUrl }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({
  data: ["RC", "BOL", "POD", "ADDITIONAL"].map(category => ({
    id: category, file_category: category, file_name: `${category}.pdf`, file_path: category,
  })), isLoading: false, error: null,
}) }));
describe("read-only order files", () => {
  it("shows every requested category with viewing controls only", async () => {
    const viewer = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(viewer as unknown as Window);
    signedUrl.mockResolvedValue({ signedUrl: "https://example.com/rc.pdf" });
    render(<OrderFilesReadOnly orderId="load" onBack={vi.fn()} />);
    for (const category of ["RC", "BOL", "POD", "ADDITIONAL"]) {
      expect(screen.getByRole("button", { name: `${category}.pdf` })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /upload|delete|enhance|save/i })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "RC.pdf" }));
    await waitFor(() => expect(viewer.location.href).toBe("https://example.com/rc.pdf"));
  });
});
