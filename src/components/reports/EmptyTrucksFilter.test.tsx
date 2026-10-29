import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyTrucksFilter } from "./EmptyTrucksFilter";

const today = new Date(2026, 9, 29);
const props = () => ({ active: false, today, date: today, onSelect: vi.fn(), onClear: vi.fn() });

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("EmptyTrucksFilter", () => {
  it("keeps the original label and toggles on an ordinary click", () => {
    const callbacks = props();
    const view = render(<EmptyTrucksFilter {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "Empty trucks" }));
    expect(callbacks.onSelect).toHaveBeenCalledWith(today);
    expect(screen.queryByText("Empty for what day?")).toBeNull();
    view.rerender(<EmptyTrucksFilter {...callbacks} active />);
    fireEvent.click(screen.getByRole("button", { name: "Empty trucks" }));
    expect(callbacks.onClear).toHaveBeenCalledOnce();
  });

  it("opens after holding and does not toggle the filter on release", () => {
    vi.useFakeTimers();
    const callbacks = props();
    render(<EmptyTrucksFilter {...callbacks} />);
    const button = screen.getByRole("button", { name: "Empty trucks" });
    fireEvent.pointerDown(button);
    act(() => { vi.advanceTimersByTime(499); });
    expect(screen.queryByText("Empty for what day?")).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByText("Empty for what day?")).toBeTruthy();
    fireEvent.pointerUp(button);
    fireEvent.click(button);
    expect(callbacks.onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
    expect(callbacks.onSelect).toHaveBeenCalledWith(new Date(2026, 9, 30));
  });

  it("cancels a hold when the pointer leaves early", () => {
    vi.useFakeTimers();
    render(<EmptyTrucksFilter {...props()} />);
    const button = screen.getByRole("button", { name: "Empty trucks" });
    fireEvent.pointerDown(button);
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.pointerLeave(button);
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.queryByText("Empty for what day?")).toBeNull();
  });

  it("opens on a sustained mouse hover without activating the filter", () => {
    vi.useFakeTimers();
    const callbacks = props();
    render(<EmptyTrucksFilter {...callbacks} />);
    const button = screen.getByRole("button", { name: "Empty trucks" });
    const hover = new Event("pointerover", { bubbles: true });
    Object.defineProperty(hover, "pointerType", { value: "mouse" });
    fireEvent(button, hover);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText("Empty for what day?")).toBeTruthy();
    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });
});
