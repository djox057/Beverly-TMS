import { describe, it, expect } from "vitest";
import {
  formatInternalLoadNumber,
  getCompanyNameFromSuffix,
  resolveLoadCompanyName,
  resolveLoadCompanyCode,
  parseInternalLoadNumber,
  getCompanySuffix,
} from "./formatInternalLoadNumber";


describe("formatInternalLoadNumber", () => {
  it("passes through legacy suffixed numbers", () => {
    expect(formatInternalLoadNumber("25653-AP")).toBe("25653-AP");
  });

  it("passes through new plain numbers", () => {
    expect(formatInternalLoadNumber("25653")).toBe("25653");
    expect(formatInternalLoadNumber(25653)).toBe("25653");
  });

  it("renders a dash when missing", () => {
    expect(formatInternalLoadNumber(null)).toBe("—");
    expect(formatInternalLoadNumber(undefined)).toBe("—");
  });

  it("never appends a suffix (company lives in its own column)", () => {
    expect(formatInternalLoadNumber("25653", "AP Silver Trans LLC")).toBe("25653");
    expect(formatInternalLoadNumber("25653-AP", "BF Prime LLC")).toBe("25653-AP");
  });

  it("resolves the truck company code for display", () => {
    expect(resolveLoadCompanyCode("25653-AP", null, null)).toBe("AP");
    expect(resolveLoadCompanyCode("25653", "ap", null)).toBe("AP");
    expect(resolveLoadCompanyCode("25653", null, "United Enterprise Solutions Inc")).toBe("UE");
    expect(resolveLoadCompanyCode("25653", null, null)).toBe("");
  });

});

describe("getCompanyNameFromSuffix", () => {
  it("maps every known suffix", () => {
    expect(getCompanyNameFromSuffix("1-BF")).toBe("Beverly Freight Inc");
    expect(getCompanyNameFromSuffix("1-BFP")).toBe("BF Prime LLC");
    expect(getCompanyNameFromSuffix("1-BFU")).toBe("BF Prime United LLC");
    expect(getCompanyNameFromSuffix("1-UE")).toBe("United Enterprise Solutions Inc");
    expect(getCompanyNameFromSuffix("1-BG")).toBe("BG Prime Inc");
    expect(getCompanyNameFromSuffix("1-AP")).toBe("AP Silver Trans LLC");
  });

  it("returns null for plain numbers and unknown suffixes", () => {
    expect(getCompanyNameFromSuffix("25653")).toBeNull();
    expect(getCompanyNameFromSuffix("25653-ZZ")).toBeNull();
    expect(getCompanyNameFromSuffix(null)).toBeNull();
  });
});

describe("resolveLoadCompanyName", () => {
  it("prefers the legacy suffix (old loads)", () => {
    expect(resolveLoadCompanyName("25653-AP", "BF")).toBe("AP Silver Trans LLC");
  });

  it("falls back to load_company_code (new loads)", () => {
    expect(resolveLoadCompanyName("25653", "AP")).toBe("AP Silver Trans LLC");
    expect(resolveLoadCompanyName(25653, "ue")).toBe("United Enterprise Solutions Inc");
  });

  it("returns null when neither resolves", () => {
    expect(resolveLoadCompanyName("25653", null)).toBeNull();
    expect(resolveLoadCompanyName(null, undefined)).toBeNull();
    expect(resolveLoadCompanyName("25653", "ZZ")).toBeNull();
  });
});

describe("getCompanySuffix / parseInternalLoadNumber", () => {
  it("derives the suffix from a company name", () => {
    expect(getCompanySuffix("AP Silver Trans LLC")).toBe("AP");
    expect(getCompanySuffix("BF Prime United LLC")).toBe("BFU");
    expect(getCompanySuffix("BF Prime LLC")).toBe("BFP");
    expect(getCompanySuffix("Beverly Freight Inc")).toBe("BF");
    expect(getCompanySuffix(null)).toBe("");
  });

  it("parses numeric part of both formats", () => {
    expect(parseInternalLoadNumber("25653-AP")).toBe(25653);
    expect(parseInternalLoadNumber("25653")).toBe(25653);
    expect(parseInternalLoadNumber("abc")).toBeNull();
  });
});
