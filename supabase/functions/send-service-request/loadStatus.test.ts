import { test } from "node:test";
import { strict as assert } from "node:assert";
import { getLoadOption, summarizeLoads, type Load } from "./loadStatus.ts";

const driverId = "driver-1";
const base = (): Load => ({
  id: "order-1", status: "pending", canceled: false, notes: null,
  driver1_id: driverId, driver2_id: null, original_driver1_id: null, original_driver2_id: null,
  delivery_datetime: "2026-10-01 10:00:00",
  bol_force_complete: false, pod_force_complete: false, order_files: [], order_transfers: [],
  pickup_drops: [
    { type: "pickup", sequence_number: 1, checked_out_at: null },
    { type: "delivery", sequence_number: 2, datetime: "2026-10-01 10:00:00", city: "Chicago", state: "IL", checked_out_at: null },
  ],
});

test("booked load before pickup is not under load even when appointment passed", () => {
  const load = base();
  load.delivery_datetime = "2026-09-01 10:00:00";
  assert.equal(getLoadOption(load, driverId)?.underLoad, false);
});

test("picked up freight is under load and fills delivery", () => {
  const load = base();
  load.pickup_drops[0].checked_out_at = "2026-09-29T09:00:00Z";
  assert.deepEqual(getLoadOption(load, driverId), {
    orderId: "order-1", underLoad: true,
    deliveryTime: "2026-10-01 10:00:00", deliveryLocation: "Chicago, IL",
  });
});

test("BOL proves pickup; partial POD does not finish a two stop delivery", () => {
  const load = base();
  load.pickup_drops.push({ type: "delivery", sequence_number: 3, city: "Detroit", state: "MI", datetime: "2026-10-02 11:00:00" });
  load.order_files = [{ file_category: "BOL" }, { file_category: "POD" }];
  load.pickup_drops[1].checked_out_at = "2026-10-01T12:00:00Z";
  assert.equal(getLoadOption(load, driverId)?.deliveryLocation, "Detroit, MI");
  assert.equal(getLoadOption(load, driverId)?.underLoad, true);
  load.order_files.push({ file_category: "POD" });
  assert.equal(getLoadOption(load, driverId), null);
});

test("delivered load and canceled load are excluded", () => {
  const load = base();
  load.status = "delivered";
  assert.equal(getLoadOption(load, driverId), null);
  load.status = "pending";
  load.canceled = true;
  assert.equal(getLoadOption(load, driverId), null);
});

test("transfer requires manual confirmation and shows the driver's handoff", () => {
  const load = base();
  load.original_driver1_id = driverId;
  load.order_files = [{ file_category: "BOL" }];
  load.order_transfers = [{ sequence_number: 0, transfer_city: "Gary", transfer_state: "IN", transfer_datetime: "2026-09-30 08:00:00" }];
  assert.deepEqual(getLoadOption(load, driverId), {
    orderId: "order-1", underLoad: null,
    deliveryTime: "2026-09-30 08:00:00", deliveryLocation: "Gary, IN",
  });
});

test("a single picked-up load suggests Yes and its delivery details", () => {
  const load = base();
  load.pickup_drops[0].checked_out_at = "2026-09-29T09:00:00Z";
  assert.deepEqual(summarizeLoads([getLoadOption(load, driverId)!]), {
    suggestedUnderLoad: true,
    deliveryTime: "2026-10-01 10:00:00",
    deliveryLocation: "Chicago, IL",
  });
});

test("a booked load suggests No, but supplies details if dispatcher chooses Yes", () => {
  assert.equal(summarizeLoads([getLoadOption(base(), driverId)!]).suggestedUnderLoad, false);
  assert.equal(summarizeLoads([getLoadOption(base(), driverId)!]).deliveryLocation, "Chicago, IL");
});

test("two picked-up loads do not guess a destination", () => {
  const first = base();
  const second = base();
  first.pickup_drops[0].checked_out_at = "2026-09-29T09:00:00Z";
  second.pickup_drops[0].checked_out_at = "2026-09-29T09:00:00Z";
  second.id = "order-2";
  assert.deepEqual(summarizeLoads([getLoadOption(first, driverId)!, getLoadOption(second, driverId)!]), {
    suggestedUnderLoad: null, deliveryTime: "", deliveryLocation: "",
  });
});
