import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RecoveryLoadsStats } from "./RecoveryLoadsStats";
afterEach(cleanup);
it("splits totals and actual successful counts between recovery and prebook", () => {
  const row = { canceled: false, freightAmount: 1000, bookedByCompany: "BF Prime", prebook: false, recovered: false, covered: false, completed: false };
  render(<RecoveryLoadsStats rows={[
    { ...row, recovered: true }, row,
    { ...row, prebook: true, covered: true },
    { ...row, prebook: true, completed: true },
    { ...row, prebook: true, canceled: true },
    { ...row, prebook: true },
  ]} />);
  expect(screen.getByText("Total Loads").parentElement?.parentElement).toHaveTextContent(/Recovery2Prebook4/);
  expect(screen.getByText("Recovered / Covered").parentElement?.parentElement).toHaveTextContent(/Recovery1Prebook2/);
  expect(screen.getByText("% Recovered / Covered").parentElement?.parentElement).toHaveTextContent(/Recovery50.0%Prebook50.0%/);
});
