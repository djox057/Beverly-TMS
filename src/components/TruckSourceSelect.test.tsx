import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TruckSourceSelect } from "./TruckSourceSelect";
import { normalizeTruckSource } from "@/lib/truckSources";

beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterEach(cleanup);

describe("TruckSourceSelect", () => {
  it("only offers current source names and saves the chosen option", async () => {
    const onChange = vi.fn();
    render(<TruckSourceSelect value="BF TRUCK" onChange={onChange} ariaLabel="Truck source" />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    expect((await screen.findAllByRole("option")).map(option => option.textContent)).toEqual(["Not set", "BF TRUCK", "M&K", "Ryder", "TEL"]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "TEL" }));
    expect(onChange).toHaveBeenCalledWith("TEL");
  });

  it("allows an existing source to be cleared to null", async () => {
    const onChange = vi.fn();
    render(<TruckSourceSelect value="Ryder" onChange={onChange} ariaLabel="Truck source" />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Not set" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("keeps disabled source controls uneditable", () => {
    render(<TruckSourceSelect value="M&K" onChange={vi.fn()} ariaLabel="Truck source" disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("combobox")).toHaveTextContent("M&K");
  });

  it("rejects free-text sources before saving and preserves empty values", () => {
    expect(() => normalizeTruckSource("New source")).toThrow("Select a truck source");
    expect(() => normalizeTruckSource("ryder")).toThrow("Select a truck source");
    expect(normalizeTruckSource("  ")).toBeNull();
    expect(normalizeTruckSource(null)).toBeNull();
    expect(normalizeTruckSource(" TEL ")).toBe("TEL");
  });
});
