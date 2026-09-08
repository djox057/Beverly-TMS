import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AllProblemsDialog } from "./AllProblemsDialog";

const mocks = vi.hoisted(() => ({
  problems: vi.fn(),
  from: vi.fn(), select: vi.fn(), in: vi.fn(), abortSignal: vi.fn(),
}));
vi.mock("@/hooks/useDriverProblems", () => ({ useDriverProblems: mocks.problems }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({ roles: ["dispatch"], user: { id: "staff-a" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.problems.mockReturnValue({
    problems: [{ id: "p1", driver_id: "d1", reason: "Issue", created_at: "2026-09-08T12:00:00Z" }],
    isLoading: false,
    resolveProblem: { mutate: vi.fn(), isPending: false },
  });
  mocks.from.mockReturnValue(mocks);
  mocks.select.mockReturnValue(mocks);
  mocks.in.mockReturnValue(mocks);
  mocks.abortSignal.mockResolvedValue({ data: [{ id: "d1", name: "Ann" }], error: null });
});

it("keeps closed dialogs idle and only fetches names for problem drivers on open", async () => {
  const client = new QueryClient();
  const surface = (open: boolean) => <QueryClientProvider client={client}><AllProblemsDialog open={open} onOpenChange={vi.fn()} /></QueryClientProvider>;
  const { rerender } = render(surface(false));
  expect(mocks.problems).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
  rerender(surface(true));
  expect(await screen.findByText("Ann")).toBeInTheDocument();
  expect(mocks.from).toHaveBeenCalledTimes(1);
  expect(mocks.select).toHaveBeenCalledWith("id, name");
  expect(mocks.in).toHaveBeenCalledWith("id", ["d1"]);
  rerender(surface(false));
  expect(screen.queryByText("All Driver Problems")).not.toBeInTheDocument();
  client.clear();
});

