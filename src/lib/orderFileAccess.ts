export function isMaintenanceFileViewer(roles: readonly string[]) {
  return roles.includes("maintenance") && !roles.some(role =>
    ["admin", "accounting", "manager", "supervisor", "dispatch", "afterhours", "safety"].includes(role));
}
