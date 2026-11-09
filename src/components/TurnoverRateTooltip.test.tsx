import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TurnoverRateTooltip } from "./TurnoverRateTooltip";

describe("Turnover rate tooltip", () => {
  it("shows a readable month and value with light/dark theme colors", () => {
    render(<TurnoverRateTooltip active label="2026-09" payload={[{ value: 31.35 }]} />);
    expect(screen.getByText("September 2026").parentElement).toHaveClass("bg-popover", "text-popover-foreground");
    expect(screen.getByText("31.35%")).toHaveClass("text-blue-700", "dark:text-blue-300");
  });

  it("displays a real zero rate and hides inactive tooltips", () => {
    const { rerender } = render(<TurnoverRateTooltip active label="2026-09" payload={[{ value: 0 }]} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    rerender(<TurnoverRateTooltip active={false} label="2026-09" payload={[{ value: 0 }]} />);
    expect(screen.queryByText("0%")).toBeNull();
  });
});
