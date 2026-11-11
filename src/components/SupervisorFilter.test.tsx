import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SupervisorFilter } from "./SupervisorFilter";

const supervisors = { alex: "Andrej Sretenovic-Alex", lucy: "Ana Djukic-Lucy", enzo: "Luka Cvetkovic-Enzo" };
function Filter() {
  const [selected, setSelected] = useState<string[]>([]);
  return <SupervisorFilter supervisors={supervisors} selected={selected} onChange={setSelected} />;
}

describe("Analytics supervisor dropdown", () => {
  it("searches names case-insensitively without clearing selected teams", () => {
    render(<Filter />);
    fireEvent.click(screen.getByRole("button", { name: "Supervisor filter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: supervisors.alex }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search supervisors" }), { target: { value: " LUCY " } });
    expect(screen.getByRole("checkbox", { name: supervisors.lucy })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: supervisors.alex })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: supervisors.lucy }));
    expect(screen.getByRole("button", { name: "Supervisor filter" })).toHaveTextContent("2 supervisors");
    fireEvent.change(screen.getByRole("textbox", { name: "Search supervisors" }), { target: { value: "" } });
    expect(screen.getByRole("checkbox", { name: supervisors.alex })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: supervisors.lucy })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: supervisors.enzo })).not.toBeChecked();
  });

  it("toggles the full label and clears all selected supervisors", () => {
    render(<Filter />);
    fireEvent.click(screen.getByRole("button", { name: "Supervisor filter" }));
    fireEvent.click(screen.getByText(supervisors.alex));
    expect(screen.getByRole("checkbox", { name: supervisors.alex })).toBeChecked();
    expect(screen.getByRole("button", { name: "Supervisor filter" })).toHaveTextContent(supervisors.alex);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByRole("checkbox", { name: supervisors.alex })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Supervisor filter" })).toHaveTextContent("All supervisors");
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeDisabled();
  });

  it("keeps selections on reopen and resets the search", () => {
    render(<Filter />);
    const trigger = screen.getByRole("button", { name: "Supervisor filter" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("checkbox", { name: supervisors.enzo }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search supervisors" }), { target: { value: "not a supervisor" } });
    expect(screen.getByText("No supervisors found.")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search supervisors" }), { key: "Escape" });
    fireEvent.click(trigger);
    expect(screen.getByRole("textbox", { name: "Search supervisors" })).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: supervisors.enzo })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: supervisors.enzo }));
    expect(trigger).toHaveTextContent("All supervisors");
  });
});
