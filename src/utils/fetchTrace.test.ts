import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isFetchTraceEnabled, traceFetch } from "./fetchTrace";

describe("fetchTrace (development-only tracer)", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("is disabled by default", () => {
    expect(isFetchTraceEnabled()).toBe(false);
  });

  it("logs nothing while disabled", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    traceFetch("useOrdersProgressive", "mount", { queryKey: ["orders"], idCount: 3 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("only becomes enabled with the explicit flag", () => {
    localStorage.setItem("debugFetchTrace", "0");
    expect(isFetchTraceEnabled()).toBe(false);
    localStorage.setItem("debugFetchTrace", "1");
    expect(isFetchTraceEnabled()).toBe(true);
  });

  it("records no record contents or tokens when enabled", () => {
    localStorage.setItem("debugFetchTrace", "1");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    traceFetch("useOrdersProgressive", "realtime", { queryKey: ["orders", "active"], idCount: 12 });
    const dump = (window as any).__fetchTraceDump();
    const serialized = JSON.stringify(dump);
    expect(serialized).toContain("useOrdersProgressive");
    expect(serialized).not.toMatch(/token|jwt|password|email|Bearer/i);
    // meta is limited to counts, never payloads
    const last = dump.events[dump.events.length - 1];
    expect(Object.keys(last).sort()).toEqual(
      ["hook", "idCount", "queryKey", "route", "trigger", "ts"].sort()
    );
    expect(spy).toHaveBeenCalled();
  });
});
