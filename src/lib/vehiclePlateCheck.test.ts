import { describe, expect, it } from "vitest";
import { compareVehicleDocument, needsPlateReview } from "../../supabase/functions/_shared/vehiclePlateCheck";

const vin = "1FUJGLDR0CLBT123"; // intentionally incomplete: not accepted as a full VIN
const validVin = "1FUJGLDR0CLBT1234";
const otherVin = "1FUJGLDR0CLBT5432";
const reading = (plate: unknown, vin: unknown = null, confidence = 0.99) => ({ plate, vin, confidence });
const check = (vehicles: unknown[], plate: string | null = "AB-0012", vehicleVin: string | null = null) =>
  compareVehicleDocument({ vehicles }, plate, vehicleVin);

describe("vehicle document identity checks", () => {
  it("ignores formatting but preserves leading zeros and ambiguous characters", () => {
    expect(check([reading("ab 0012")]).status).toBe("match");
    expect(check([reading("ABO012")]).status).toBe("mismatch");
    expect(check([reading("AB12")]).status).toBe("mismatch");
  });
  it("warns when the document has a different plate or the vehicle has none", () => {
    expect(check([reading("ZZ987")]).status).toBe("mismatch");
    expect(check([reading("ZZ987")], null).status).toBe("missing_plate");
  });
  it("requires review for no readable plate or a low-confidence reading", () => {
    expect(needsPlateReview(check([]))).toBe(true);
    expect(check([reading("AB0012", null, 0.7)]).status).toBe("unreadable");
    expect(check([reading(null, vin)]).documentVin).toBeNull();
  });
  it("rejects malformed responses and nonsensical confidence values", () => {
    expect(() => compareVehicleDocument({}, "AB0012", null)).toThrow();
    expect(check([reading("AB0012", null, 2)]).status).toBe("unreadable");
    expect(check([reading("unknown / maybe")]).status).toBe("unreadable");
  });
  it("warns for a different full VIN even when its plate matches", () => {
    const result = check([reading("AB0012", otherVin)], "AB0012", validVin);
    expect(result.status).toBe("wrong_vehicle");
    expect(result.vinMatches).toBe(false);
  });
  it("uses the matching VIN's row in a multi-vehicle schedule", () => {
    const result = check([reading("ZZ987", otherVin), reading("AB0012", validVin)], "AB0012", validVin);
    expect(result.status).toBe("match");
    expect(result.detectedPlates).toEqual(["AB0012"]);
    expect(result.vinMatches).toBe(true);
  });
  it("does not use another row's matching plate when this vehicle's VIN row has a different plate", () => {
    const result = check([reading("AB0012", otherVin), reading("ZZ987", validVin)], "AB0012", validVin);
    expect(result.status).toBe("mismatch");
    expect(result.detectedPlate).toBe("ZZ987");
  });
  it("does not pick a suggested plate from several unmatched plates", () => {
    const result = check([reading("ZZ987"), reading("YY987")]);
    expect(result.status).toBe("ambiguous");
    expect(result.detectedPlate).toBeNull();
  });
  it("deduplicates formatted copies of one plate", () => {
    expect(check([reading("ZZ-987"), reading("zz 987")]).status).toBe("mismatch");
    expect(check([reading("ZZ-987"), reading("zz 987")]).detectedPlates).toHaveLength(1);
  });
});
