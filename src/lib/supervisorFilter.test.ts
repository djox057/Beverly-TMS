import { describe, expect, it } from "vitest";
import { matchesSupervisorFilter } from "./supervisorFilter";

const assignments = { dispatcherA: "alex", dispatcherB: "lucy", dispatcherC: "enzo", alex: "lucy" };
describe("Analytics supervisor team membership", () => {
  it("keeps all dispatchers and unresolved historical users when selection is empty", () => {
    for (const id of ["alex", "dispatcherA", "former", undefined, null, ""]) {
      expect(matchesSupervisorFilter(id, [], assignments)).toBe(true);
    }
  });
  it("matches the previous single-supervisor rule", () => {
    for (const supervisor of ["alex", "lucy", "enzo"]) {
      for (const id of ["alex", "lucy", "dispatcherA", "dispatcherB", "dispatcherC", "former", ""]) {
        expect(matchesSupervisorFilter(id, [supervisor], assignments))
          .toBe(id === supervisor || assignments[id] === supervisor);
      }
    }
  });
  it("includes both selected teams, excludes other teams and unresolved users", () => {
    expect(["alex", "lucy", "dispatcherA", "dispatcherB", "dispatcherC", "former"]
      .filter(id => matchesSupervisorFilter(id, ["alex", "lucy"], assignments)))
      .toEqual(["alex", "lucy", "dispatcherA", "dispatcherB"]);
    expect(matchesSupervisorFilter(undefined, ["alex"], assignments)).toBe(false);
  });
  it("counts a supervisor who also belongs to another selected team only once", () => {
    const orders = [{ dispatcherId: "alex", freight: 100 }, { dispatcherId: "dispatcherA", freight: 200 },
      { dispatcherId: "dispatcherB", freight: 300 }, { dispatcherId: "dispatcherC", freight: 400 }];
    const selectedOrders = orders.filter(order => matchesSupervisorFilter(order.dispatcherId, ["alex", "lucy"], assignments));
    expect(selectedOrders).toHaveLength(3);
    expect(selectedOrders.reduce((total, order) => total + order.freight, 0)).toBe(600);
  });
});
