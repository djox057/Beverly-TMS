import { describe, expect, it } from "vitest";
import { isCompleteVin, mapVinSpecs } from "./vinDecoder";

describe("VIN specifications", () => {
  it("normalizes complete VINs and rejects partial/forbidden characters", () => {
    expect(isCompleteVin(" 1fujgldrxclbp7955 ")).toBe(true);
    expect(isCompleteVin("1FUJGLDRXCLBP795")).toBe(false);
    expect(isCompleteVin("1FUJGLDRICLBP7955")).toBe(false);
  });
  it("maps the verified Freightliner payload without inventing engine details", () => {
    const row = { Make: "FREIGHTLINER", Model: "Cascadia", ModelYear: "2012", EngineModel: "Detroit Diesel DD15", ErrorCode: "0" };
    expect(mapVinSpecs(row, true)).toEqual({ make: "FREIGHTLINER", model: "Cascadia", year: "2012", engine: "Detroit Diesel DD15" });
    expect(mapVinSpecs({ ...row, EngineModel: "" }, true).engine).toBe("");
    expect(mapVinSpecs(row, false)).not.toHaveProperty("engine");
  });
  it("rejects check-digit errors, malformed years, and empty results", () => {
    expect(() => mapVinSpecs({ Make: "FREIGHTLINER", ErrorCode: "1" }, true)).toThrow();
    expect(mapVinSpecs({ Make: "WABASH", ModelYear: "unknown", ErrorCode: "0" }, false).year).toBe("");
    expect(() => mapVinSpecs({}, false)).toThrow();
  });
});
