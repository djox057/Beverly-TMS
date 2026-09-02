import { describe, it, expect } from "vitest";
import { normalizeBadgeRow } from "./useRecoveryLoadsCount";
import { affectedTrailerIdsFromTruckEvent } from "./useTrailersRealtime";

describe("normalizeBadgeRow (recovery badge RPC payload)", () => {
  it("reads a single-row array", () => {
    expect(normalizeBadgeRow([{ total: 7, has_mine: true }])).toEqual({ count: 7, hasMine: true });
  });

  it("reads a bare object", () => {
    expect(normalizeBadgeRow({ total: 3, has_mine: false })).toEqual({ count: 3, hasMine: false });
  });

  it("defaults to zero / false for null, empty and partial payloads", () => {
    expect(normalizeBadgeRow(null)).toEqual({ count: 0, hasMine: false });
    expect(normalizeBadgeRow([])).toEqual({ count: 0, hasMine: false });
    expect(normalizeBadgeRow([{ total: null, has_mine: null }])).toEqual({
      count: 0,
      hasMine: false,
    });
    expect(normalizeBadgeRow([{ total: 5 }])).toEqual({ count: 5, hasMine: false });
  });
});

describe("affectedTrailerIdsFromTruckEvent (trailer realtime filter)", () => {
  it("ignores truck updates that do not change trailer_id", () => {
    const payload = {
      eventType: "UPDATE" as const,
      old: { id: "t1", trailer_id: "A", miles: 100, latitude: 1 },
      new: { id: "t1", trailer_id: "A", miles: 200, latitude: 2 },
    };
    expect(affectedTrailerIdsFromTruckEvent(payload)).toEqual([]);
  });

  it("returns both trailers on a reassignment", () => {
    const ids = affectedTrailerIdsFromTruckEvent({
      eventType: "UPDATE",
      old: { id: "t1", trailer_id: "A", miles: 1 },
      new: { id: "t1", trailer_id: "B", miles: 1 },
    });
    expect(ids.sort()).toEqual(["A", "B"]);
  });

  it("returns the new trailer on assignment from none", () => {
    expect(
      affectedTrailerIdsFromTruckEvent({
        eventType: "UPDATE",
        old: { id: "t1", trailer_id: null, miles: 1 },
        new: { id: "t1", trailer_id: "B", miles: 1 },
      })
    ).toEqual(["B"]);
  });

  it("returns the old trailer on unassignment", () => {
    expect(
      affectedTrailerIdsFromTruckEvent({
        eventType: "UPDATE",
        old: { id: "t1", trailer_id: "A", miles: 1 },
        new: { id: "t1", trailer_id: null, miles: 1 },
      })
    ).toEqual(["A"]);
  });

  it("fails open when old is unusable (no REPLICA IDENTITY payload)", () => {
    expect(
      affectedTrailerIdsFromTruckEvent({
        eventType: "UPDATE",
        old: { id: "t1" },
        new: { id: "t1", trailer_id: "A" },
      })
    ).toEqual(["A"]);
  });

  it("handles INSERT and DELETE", () => {
    expect(
      affectedTrailerIdsFromTruckEvent({ eventType: "INSERT", new: { id: "t1", trailer_id: "A" } })
    ).toEqual(["A"]);
    expect(
      affectedTrailerIdsFromTruckEvent({ eventType: "DELETE", old: { id: "t1", trailer_id: "A" } })
    ).toEqual(["A"]);
  });

  it("returns nothing when no trailer is involved at all", () => {
    expect(
      affectedTrailerIdsFromTruckEvent({
        eventType: "UPDATE",
        old: { id: "t1", trailer_id: null, miles: 1 },
        new: { id: "t1", trailer_id: null, miles: 2 },
      })
    ).toEqual([]);
  });
});
