import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ApsLoads from "./ApsLoads";

const fixture = vi.hoisted(() => ({
  companies: [] as Array<{ id: string; name: string }>,
  isPending: false,
  isError: false,
  loads: vi.fn(),
}));

vi.mock("@/hooks/useCompanies", () => ({
  useCompanies: () => ({ data: fixture.companies, isPending: fixture.isPending, isError: fixture.isError, refetch: vi.fn() }),
}));
vi.mock("./BgLoads", () => ({
  CompanyLoads: (props: unknown) => { fixture.loads(props); return <div>Company loads</div>; },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); fixture.isPending = false; fixture.isError = false; fixture.companies = []; });

it("scopes the shared loads page to the booking company rather than an operating carrier", () => {
  fixture.companies = [{ id: "bf", name: "BF Prime LLC" }, { id: "aps", name: "AP Silver Trans LLC" }];
  render(<ApsLoads />);
  expect(fixture.loads).toHaveBeenCalledWith({ companyId: "aps", companyName: "AP Silver Trans LLC", title: "APS Loads", storagePrefix: "apsLoads" });
});

it("does not run loads queries before the company is resolved", () => {
  fixture.isPending = true;
  render(<ApsLoads />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading APS Loads");
  expect(fixture.loads).not.toHaveBeenCalled();
});

it.each([false, true])("does not fall back to unfiltered loads when company resolution fails (error=%s)", (isError) => {
  fixture.isError = isError;
  render(<ApsLoads />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(fixture.loads).not.toHaveBeenCalled();
});
