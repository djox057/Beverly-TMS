import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { PretripPhotosCell } from "./PretripPhotosCell";

const { sign } = vi.hoisted(() => ({ sign: vi.fn(async (paths: string[]) => ({ data: paths.map(path => ({ path, signedUrl: `https://example.com/${path}` })), error: null })) }));
beforeEach(() => vi.clearAllMocks());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ createSignedUrls: sign }) } } }));

it("prioritizes the selected photo, defers thumbnails, and reuses URLs when reopened", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><PretripPhotosCell truckId="truck" date="2026-10-07" photos={[
    { id: "one", truck_id: "truck", file_path: "one.jpg", file_name: "Front", photo_category: "Truck front" },
    { id: "two", truck_id: "truck", file_path: "two.jpg", file_name: "Side", photo_category: "Truck side" },
  ]} /></QueryClientProvider>);
  expect(sign).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Pictures (2)" }));
  const main = await screen.findByAltText("Truck front");
  expect(document.querySelectorAll("img")).toHaveLength(1);
  expect(main).toHaveAttribute("fetchpriority", "high");
  fireEvent.load(main);
  await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(3));
  fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
  expect(screen.getByAltText("Truck side")).toHaveAttribute("src", "https://example.com/two.jpg");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Pictures (2)" }));
  await screen.findByAltText("Truck front");
  expect(sign).toHaveBeenCalledTimes(1);
});

it("warns on a reused photo and clears the banner when navigating to a fresh photo", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><PretripPhotosCell truckId="truck" date="2026-10-12" photos={[
    { id: "reused", truck_id: "truck", file_path: "new-file.jpg", file_name: "Front", content_sha256: "hash",
      reuse: { photo_id: "reused", previous_photo_id: "old", previous_inspection_date: "2026-10-05", previous_driver_name: "Alex Driver", previous_truck_number: "0042" } },
    { id: "fresh", truck_id: "truck", file_path: "fresh.jpg", file_name: "Side", content_sha256: "fresh-hash" },
  ]} /></QueryClientProvider>);
  expect(screen.getByRole("img", { name: "Reused photo warning" })).toHaveAttribute("title", "Same photo submitted on 10/05/2026 · Unit 0042 · Alex Driver");
  fireEvent.click(screen.getByRole("button", { name: "Pictures (2)" }));
  await screen.findByAltText("Front");
  expect(screen.getByRole("alert")).toHaveTextContent("Photo reused from an earlier week");
  expect(screen.getByRole("alert")).toHaveTextContent("10/05/2026");
  fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps a warning with its form rather than marking the other form", () => {
  const queryClient = new QueryClient();
  render(<QueryClientProvider client={queryClient}><PretripPhotosCell truckId="truck" date="2026-10-12"
    submissions={[{ id: "form-one", driver_name: "Alex", submitted_at: "2026-10-12" }, { id: "form-two", driver_name: "Sam", submitted_at: "2026-10-13" }]}
    photos={[
      { id: "old", truck_id: "truck", file_path: "old", file_name: "Front", form_submission_id: "form-one",
        reuse: { photo_id: "old", previous_photo_id: "previous", previous_inspection_date: "2026-10-05", previous_driver_name: "Alex", previous_truck_number: "42" } },
      { id: "fresh", truck_id: "truck", file_path: "fresh", file_name: "Side", form_submission_id: "form-two", content_sha256: "fresh" },
    ]} /></QueryClientProvider>);
  expect(screen.getByRole("button", { name: "Form 1 (1)" }).parentElement).toContainElement(screen.getByRole("img", { name: "Reused photo warning" }));
  expect(screen.getByRole("button", { name: "Form 2 (1)" }).parentElement?.querySelector('[role="img"]')).toBeNull();
});

it("shows an unavailable comparison instead of claiming the photo is fresh", async () => {
  const queryClient = new QueryClient();
  render(<QueryClientProvider client={queryClient}><PretripPhotosCell truckId="truck" date="2026-10-12"
    photos={[{ id: "one", truck_id: "truck", file_path: "one.jpg", file_name: "Front", content_sha256: "hash", reuse_check_failed: true }]} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Pictures (1)" }));
  await screen.findByAltText("Front");
  expect(screen.getByRole("status")).toHaveTextContent("Photo reuse check unavailable");
});
