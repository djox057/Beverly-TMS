import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { PretripPhotosCell } from "./PretripPhotosCell";

const { sign } = vi.hoisted(() => ({ sign: vi.fn(async (paths: string[]) => ({ data: paths.map(path => ({ path, signedUrl: `https://example.com/${path}` })), error: null })) }));
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
