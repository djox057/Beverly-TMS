import { describe, it, expect } from "vitest";
import {
  normalizeControllableStatus,
  canControl,
  isValidRequestedStatus,
  maskCardNumber,
  maskForLog,
  buildSetCardPayload,
  resolveTruckCard,
  selectChangedCards,
  backoffDelayMs,
  isRetryableFault,
  isInvalidClientId,
  UNCONTROLLABLE_MESSAGE,
  type CardResolution,
} from "./cardStatus";

describe("status normalization", () => {
  it("accepts an Active response", () => {
    expect(normalizeControllableStatus("Active")).toBe("Active");
    expect(canControl("active")).toBe(true);
  });

  it("accepts a Hold response", () => {
    expect(normalizeControllableStatus("HOLD")).toBe("Hold");
    expect(canControl("Hold")).toBe(true);
  });

  it("treats Inactive, Deleted, Fraud and unknown values as uncontrollable", () => {
    for (const raw of ["Inactive", "Deleted", "Fraud", "Weird", "", null, undefined]) {
      expect(normalizeControllableStatus(raw as string)).toBeNull();
      expect(canControl(raw as string)).toBe(false);
    }
  });

  it("rejects Inactive or arbitrary requested statuses", () => {
    expect(isValidRequestedStatus("Active")).toBe(true);
    expect(isValidRequestedStatus("Hold")).toBe(true);
    for (const bad of ["Inactive", "Deleted", "active ", "hold", 1, null, {}]) {
      expect(isValidRequestedStatus(bad)).toBe(false);
    }
  });
});

describe("masking", () => {
  it("never exposes a full card number", () => {
    expect(maskCardNumber("7083350000012341234")).toBe("****1234");
    expect(maskCardNumber("12")).toBeNull();
    expect(maskCardNumber(null)).toBeNull();
  });

  it("masks card numbers and credentials in logs", () => {
    const out = maskForLog("<password>hunter2</password> card 7083350000012341234 <clientId>abc</clientId>");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("7083350000012341234");
    expect(out).not.toContain(">abc<");
    expect(out).toContain("****1234");
  });
});

const fullCard = {
  cardNumber: "7083350000012341234",
  status: "Active",
  header: { name: "UNIT 1042", unit: "1042", driverId: "77" },
  prompts: [{ id: "ODOM", required: true }],
  limits: [{ product: "DSL", limit: 150 }],
  locationGroups: ["GRP1", "GRP2"],
  blockedLocations: ["LOC9"],
  timeRestrictions: [{ day: "MON", from: "0000", to: "2359" }],
  refreshingLimits: [{ product: "DSL", amount: 500, period: "WEEK" }],
  someFutureField: { nested: [1, 2, 3] },
};

describe("buildSetCardPayload", () => {
  it("changes Active to Hold and preserves every existing field", () => {
    const payload = buildSetCardPayload(fullCard, "Hold");
    expect(payload.status).toBe("Hold");
    for (const key of Object.keys(fullCard)) {
      if (key === "status") continue;
      expect(payload[key]).toEqual((fullCard as Record<string, unknown>)[key]);
    }
    expect(Object.keys(payload).sort()).toEqual(Object.keys(fullCard).sort());
  });

  it("changes Hold to Active", () => {
    const payload = buildSetCardPayload({ ...fullCard, status: "Hold" }, "Active");
    expect(payload.status).toBe("Active");
    expect(payload.limits).toEqual(fullCard.limits);
  });

  it("does not mutate the source configuration", () => {
    buildSetCardPayload(fullCard, "Hold");
    expect(fullCard.status).toBe("Active");
  });

  it("refuses to change an uncontrollable card", () => {
    expect(() => buildSetCardPayload({ ...fullCard, status: "Deleted" }, "Hold")).toThrow(UNCONTROLLABLE_MESSAGE);
  });

  it("refuses an unsupported requested status", () => {
    expect(() => buildSetCardPayload(fullCard, "Inactive" as never)).toThrow(/unsupported status/i);
  });
});

describe("truck to card resolution", () => {
  it("reports a missing card mapping", () => {
    const res: CardResolution = resolveTruckCard([]);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toBe("missing");
  });

  it("refuses to guess when multiple cards match one truck", () => {
    const res: CardResolution = resolveTruckCard([{ id: "a" }, { id: "b" }]);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toBe("ambiguous");
    expect(res.ok === false ? res.message : "").toMatch(/configuration error/i);
  });

  it("resolves a single mapped card", () => {
    const res = resolveTruckCard([{ id: "a", cardLastFour: "1234" }]);
    expect(res.ok).toBe(true);
  });
});

describe("bulk sync diffing", () => {
  it("returns only cards whose status actually changed", () => {
    const incoming = [
      { truckId: "t1", rawStatus: "Active" },
      { truckId: "t2", rawStatus: "Hold" },
      { truckId: "t3", rawStatus: "Deleted" },
    ];
    const changed = selectChangedCards(incoming, { t1: "Active", t2: "Active", t3: undefined });
    expect(changed.map((c) => c.truckId)).toEqual(["t2", "t3"]);
  });

  it("ignores case and padding so unchanged cards create no writes or audit noise", () => {
    const changed = selectChangedCards([{ truckId: "t1", rawStatus: " active " }], { t1: "Active" });
    expect(changed).toHaveLength(0);
  });
});

describe("retry policy", () => {
  it("is bounded", () => {
    expect(backoffDelayMs(0)).toBeGreaterThan(0);
    expect(backoffDelayMs(2)).toBeGreaterThan(0);
    expect(backoffDelayMs(3)).toBeNull();
    expect(backoffDelayMs(99)).toBeNull();
  });

  it("retries transient faults and session expiry only", () => {
    expect(isRetryableFault("InvalidClientId")).toBe(true);
    expect(isRetryableFault("Timeout")).toBe(true);
    expect(isRetryableFault(null, 503)).toBe(true);
    expect(isRetryableFault("InvalidCardStatus")).toBe(false);
    expect(isRetryableFault("ValidationError", 400)).toBe(false);
  });

  it("detects session expiry faults", () => {
    expect(isInvalidClientId("soap:Server", "InvalidClientId: session expired")).toBe(true);
    expect(isInvalidClientId("soap:Server", "card not found")).toBe(false);
  });
});
