import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SearchableSelect } from "./SearchableSelect";

describe("SearchableSelect", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    }
  });

  it("filters options by typed text and returns the selected value", async () => {
    const onValueChange = vi.fn();
    render(
      <SearchableSelect
        value="all"
        onValueChange={onValueChange}
        placeholder="All offices"
        searchPlaceholder="Search offices..."
        options={[
          { value: "all", label: "All offices" },
          { value: "chi", label: "Chicago" },
          { value: "cch", label: "Cleveland" },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByPlaceholderText("Search offices..."), { target: { value: "clev" } });
    expect(screen.getByText("Cleveland")).toBeInTheDocument();
    expect(screen.queryByText("Chicago")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Cleveland"));
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("cch"));
  });
});
