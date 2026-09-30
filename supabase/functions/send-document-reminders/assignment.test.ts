import { test } from "node:test";
import { strict as assert } from "node:assert";
import { assignedTruckContext } from "./assignment.ts";

const drivers = new Map([
  ["driver-1", { id: "driver-1", name: "First Driver", dispatcher_id: "dispatch-1" }],
  ["driver-2", { id: "driver-2", name: "Second Driver", dispatcher_id: "dispatch-2" }],
]);

test("a dispatcher without a driver does not receive a truck reminder", () => {
  assert.equal(assignedTruckContext({ driver1_id: null, driver2_id: null, dispatcher_id: "dispatch-1" }, drivers), null);
});

test("a driver without a dispatcher does not receive a truck reminder", () => {
  const unassigned = new Map([["driver-1", { id: "driver-1", name: "First Driver", dispatcher_id: null }]]);
  assert.equal(assignedTruckContext({ driver1_id: "driver-1", driver2_id: null, dispatcher_id: null }, unassigned), null);
});

test("an active team driver and assigned dispatcher keep the reminder", () => {
  assert.deepEqual(assignedTruckContext({ driver1_id: "inactive-driver", driver2_id: "driver-2", dispatcher_id: null }, drivers), {
    driverName: "Second Driver", dispatcherId: "dispatch-2",
  });
  assert.deepEqual(assignedTruckContext({ driver1_id: "driver-1", driver2_id: "driver-2", dispatcher_id: "dispatch-3" }, drivers), {
    driverName: "First Driver", dispatcherId: "dispatch-1",
  });
});

test("truck dispatcher can supply the assignment when the active driver's dispatcher is empty", () => {
  const unassigned = new Map([["driver-1", { id: "driver-1", name: "First Driver", dispatcher_id: null }]]);
  assert.deepEqual(assignedTruckContext({ driver1_id: "driver-1", driver2_id: null, dispatcher_id: "dispatch-3" }, unassigned), {
    driverName: "First Driver", dispatcherId: "dispatch-3",
  });
});
