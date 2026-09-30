import { test } from "node:test";
import { strict as assert } from "node:assert";
import { getTruckRequirementError } from "./truckRequirement.ts";

const driverId = "b99f616c-5539-4c65-bc9f-ebbc72782dbf";

test("recovery drivers can submit a request without a truck", async () => {
  const lookedUp: string[] = [];
  assert.equal(await getTruckRequirementError("", driverId, async id => {
    lookedUp.push(id);
    return true;
  }), null);
  assert.deepEqual(lookedUp, [driverId]);
  assert.equal(await getTruckRequirementError("   ", driverId, async () => true), null);
});

test("regular drivers require a truck even when the requester has recovery access", async () => {
  assert.match((await getTruckRequirementError("", driverId, async () => false))!, /Truck number is required/);
});

test("missing, invalid, or unknown drivers cannot use the exception", async () => {
  for (const id of [undefined, null, "", "invalid", { is_recovery: true }]) {
    assert.match((await getTruckRequirementError("", id, async () => { throw new Error("Must not query an invalid ID"); }))!, /Truck number is required/);
  }
  assert.match((await getTruckRequirementError("", driverId, async () => false))!, /Truck number is required/);
});

test("requests with truck numbers work as before without a recovery lookup", async () => {
  assert.equal(await getTruckRequirementError("2895", undefined, async () => { throw new Error("Must not query"); }), null);
});

test("database failures stop validation instead of permitting a truckless request", async () => {
  await assert.rejects(getTruckRequirementError("", driverId, async () => { throw new Error("Database unavailable"); }), /Database unavailable/);
});

test("only boolean true grants the exception", async () => {
  assert.match((await getTruckRequirementError("", driverId, async () => "true" as any))!, /Truck number is required/);
});
