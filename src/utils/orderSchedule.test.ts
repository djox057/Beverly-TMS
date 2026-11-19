import { describe, expect, it } from "vitest";
import { formOrderSchedule, orderSchedule } from "./orderSchedule";
import { transformOrders } from "./ordersTransform";

describe("order pickup and delivery schedule", () => {
  it("uses dated appointments regardless of list order and preserves original time strings", () => {
    const stops = [
      {type: "pickup", datetime: "2026-11-30T11:00:00Z"},
      {type: "delivery", datetime: "2026-11-30T23:00:00Z"},
      {type: "pickup", datetime: "2026-11-30T10:00:00+01:00"},
      {type: "delivery", datetime: null},
      {type: "delivery", datetime: "2026-12-01 01:00:00"},
    ];
    const expected = {pickupDatetime: stops[2].datetime, deliveryDatetime: stops[4].datetime};
    expect(orderSchedule(stops)).toEqual(expected);
    expect(orderSchedule([...stops].reverse())).toEqual(expected);
    const [order] = transformOrders([{ pickup_drops: stops }]);
    expect([order.pickupDate, order.deliveryDate]).toEqual([expected.pickupDatetime, expected.deliveryDatetime]);
  });

  it("ignores empty form rows and an undated stop", () => {
    const day = {from: new Date(2026,10,30)};
    const rows = [
      {type:"pickup", address:"A", dateRange:day, startTime:"11:00"},
      {type:"delivery", address:"B", dateRange:day, startTime:"18:00"},
      {type:"pickup", address:"C", dateRange:day, startTime:"09:00"},
      {type:"delivery", address:"D", dateRange:day, startTime:"20:00"},
      {type:"delivery", address:" ", dateRange:day, startTime:"23:00"},
      {type:"delivery", address:"E", dateRange:day, startTime:""},
    ];
    expect(formOrderSchedule(rows)).toEqual({pickupDatetime:"2026-11-30 09:00:00", deliveryDatetime:"2026-11-30 20:00:00"});
    expect(formOrderSchedule([])).toEqual({pickupDatetime:null, deliveryDatetime:null});
  });
});
