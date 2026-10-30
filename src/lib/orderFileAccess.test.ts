import { describe, expect, it } from "vitest";
import { isMaintenanceFileViewer } from "./orderFileAccess";

describe("maintenance order file access", () => {
  it("uses view-only access for maintenance without a file editor role", () => {
    expect(isMaintenanceFileViewer(["maintenance"])).toBe(true);
    expect(isMaintenanceFileViewer(["maintenance", "chicago_management"])).toBe(true);
    expect(isMaintenanceFileViewer([])).toBe(false);
  });
  it.each(["admin", "accounting", "manager", "supervisor", "dispatch", "afterhours", "safety"])(
    "preserves existing %s permissions for users with multiple roles", role => {
      expect(isMaintenanceFileViewer(["maintenance", role])).toBe(false);
    });
});
