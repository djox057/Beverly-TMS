import { describe, it, expect } from "vitest";
import { transformOrders, reverseTransformOrders } from "./ordersTransform";

describe("ordersTransform load_company_code mapping", () => {
  it("maps load_company_code to loadCompanyCode", () => {
    const [order] = transformOrders([
      { id: "1", internal_load_number: "25653", load_company_code: "AP" },
    ]);
    expect(order.internalLoadNumber).toBe("25653");
    expect((order as any).loadCompanyCode).toBe("AP");
  });

  it("defaults to null for legacy rows without the column", () => {
    const [order] = transformOrders([{ id: "2", internal_load_number: "25653-AP" }]);
    expect((order as any).loadCompanyCode).toBeNull();
  });

  it("round-trips back to snake_case", () => {
    const transformed = transformOrders([
      { id: "3", internal_load_number: "25654", load_company_code: "BF" },
    ]);
    const [reversed] = reverseTransformOrders(transformed);
    expect(reversed.load_company_code).toBe("BF");
    expect(reversed.internal_load_number).toBe("25654");
  });
});
