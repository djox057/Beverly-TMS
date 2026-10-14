import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVinAutofill } from "./useVinAutofill";
import { decodeVin } from "@/lib/vinDecoder";
vi.mock("@/lib/vinDecoder", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/vinDecoder")>(), decodeVin: vi.fn() }));
const specs = { make: "FREIGHTLINER", model: "Cascadia", year: "2012", engine: "DD15" };
function useSetup() {
  const [form, setForm] = useState({ vin: "", make: "", model: "", year: "", engine: "" });
  const [active, setActive] = useState(true);
  const status = useVinAutofill(form, setForm, active, true);
  return { form, setForm, status, setActive };
}
afterEach(() => vi.clearAllMocks());
describe("VIN autofill", () => {
  it("fills empty fields while preserving manual entries", async () => {
    vi.mocked(decodeVin).mockResolvedValue(specs);
    const { result } = renderHook(useSetup);
    act(() => result.current.setForm(f => ({ ...f, vin: "1FUJGLDRXCLBP7955", engine: "Custom engine" })));
    await waitFor(() => expect(result.current.form.make).toBe("FREIGHTLINER"));
    expect(result.current.form.engine).toBe("Custom engine");
    act(() => result.current.setForm(f => ({ ...f, vin: "" })));
    await waitFor(() => expect(result.current.form.make).toBe(""));
    expect(result.current.form.engine).toBe("Custom engine");
  });
  it("ignores a late result after VIN changes or dialog closes", async () => {
    let resolve!: (value: typeof specs) => void;
    vi.mocked(decodeVin).mockImplementation(() => new Promise(r => { resolve = r; }));
    const { result } = renderHook(useSetup);
    act(() => result.current.setForm(f => ({ ...f, vin: "1FUJGLDRXCLBP7955" })));
    await waitFor(() => expect(decodeVin).toHaveBeenCalled());
    act(() => result.current.setActive(false));
    await act(async () => resolve(specs));
    expect(result.current.form.make).toBe("");
  });
  it("does not request partial VINs and preserves fields on failure", async () => {
    vi.mocked(decodeVin).mockRejectedValue(new Error("Unavailable"));
    const { result } = renderHook(useSetup);
    act(() => result.current.setForm(f => ({ ...f, vin: "123", make: "Manual" })));
    expect(decodeVin).not.toHaveBeenCalled();
    act(() => result.current.setForm(f => ({ ...f, vin: "1FUJGLDRXCLBP7955" })));
    await waitFor(() => expect(result.current.status).toBe("Unavailable"));
    expect(result.current.form.make).toBe("Manual");
  });
});
