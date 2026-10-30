// Operating carriers only: never offer these as the entity booking a load.
const operatingOnlyCompanies = new Set([
  "gd trucking solutions llc",
  "hart freight solutions llc",
]);

export const canBookLoads = (companyName: string) =>
  !operatingOnlyCompanies.has(companyName.trim().toLowerCase());
