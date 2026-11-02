import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DispatcherLoadBadges } from "./DispatcherLoadBadges";

afterEach(cleanup);
it("shows separate blue prebook and red recovery counts, including zero", () => {
  render(<DispatcherLoadBadges data={{ prebookCount: 3, recoveryCount: 0, truckIds: [], orderIds: [] }} isError={false} isFetching={false} />);
  expect(screen.getByLabelText(/^Prebook: 3/)).toHaveClass("bg-blue-600");
  expect(screen.getByLabelText(/^Recovery: 0/)).toHaveClass("bg-red-600");
  expect(screen.getByLabelText(/^Recovery: 0/)).toHaveTextContent("0");
});
it("distinguishes loading and failed refreshes from zero matches", () => {
  const { rerender } = render(<DispatcherLoadBadges isError={false} isFetching={true} />);
  expect(screen.getByLabelText("Loading prebook opportunities")).toHaveTextContent("…");
  rerender(<DispatcherLoadBadges data={{ prebookCount: 9, recoveryCount: 4, truckIds: [], orderIds: [] }} isError={true} isFetching={false} />);
  expect(screen.getByLabelText(/Prebook count unavailable/)).toHaveTextContent("—");
  expect(screen.queryByText("9")).not.toBeInTheDocument();
});
