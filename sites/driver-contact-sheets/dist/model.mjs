// Pure mapping and print validation. No TMS data or credentials are stored here.
export const DEFAULT_CONTACTS = {
  office: "(847) 857-6129", dispatch: "(574) 544-5447",
  weekend: "(847) 847-4360", fax: "(847) 752-9520"
};
const brand = (key, wordmark, subtitle, accent, domain, extra = {}) => ({
  key, wordmark, subtitle, accent, domain, maintenanceExt: "11",
  office: DEFAULT_CONTACTS.office, dispatch: DEFAULT_CONTACTS.dispatch,
  weekend: DEFAULT_CONTACTS.weekend, fax: DEFAULT_CONTACTS.fax, ...extra
});
export const BRANDS = {
  "bf prime llc": brand("bf-prime", "BF PRIME", "LLC", "#f66c1b", "bfprime.net", {ink: "#071b38"}),
  "beverly freight inc": brand("beverly-freight", "BEVERLY", "FREIGHT INC", "#f3d51d", "beverlyfreight.net", {ink: "#17191b"}),
  "beverly group": brand("beverly-group", "BEVERLY", "GROUP", "#f3d51d", "beverlygroupllc.net", {ink: "#0a2454", office: "(872) 314-1188", maintenanceExt: "7", eld: "EXT 11", mc: "1557618", dot: "4089329"}),
  "bf prime united llc": brand("bf-prime-united", "UNITED", "BF PRIME", "#afcc26", "bfprimeunited.net", {ink: "#333431", mc: "1691807", dot: "4332597", maintenanceExt: "7"}),
  "bg prime inc": brand("bg-prime", "BG PRIME", "INC", "#afd334", "bgprime.net", {ink: "#151819", kyu: "742874", office: "(312) 995-9909"}),
  "ap silver trans llc": brand("ap-silver", "AP SILVER TRANS", "LLC", "#64b943", "apsilvertrans.net", {ink: "#17211b"}),
  "united enterprise solutions inc": brand("ues", "UNITED ENTERPRISE", "SOLUTIONS INC", "#9f248f", "unitedenterprisesolutions.net", {ink: "#16191c"}),
  "lale transport llc": brand("lale", "LALE", "TRANSPORT LLC", "#fa3239", "laletransport.com", {ink: "#20262a"}),
  "hart freight solutions llc": brand("hart", "HART", "FREIGHT SOLUTIONS LLC", "#65b943", "hartfreight.net", {ink: "#185648"}),
  "jones freight lines llc": brand("jones", "JONES", "FREIGHT LINES LLC", "#f66c1b", "jonesfreight.net", {ink: "#17191b"}),
  "gd trucking solutions llc": brand("gd", "GD TRUCKING", "SOLUTIONS LLC", "#48a594", "gdtrucking.net", {ink: "#12352f"})
};
export const normalize = value => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
export const displayName = fullName => {
  const full = String(fullName ?? "").trim();
  // TMS names such as "Filip Petrovic-Kane" use a dispatch alias after the hyphen.
  const alias = full.split(/\s*[-–—]\s*/).filter(Boolean).at(-1);
  return alias || full;
};
export function companySheet(company, info) {
  const base = BRANDS[normalize(company?.name)] || brand("custom", company?.name || "Company", "", "#e9cb38", "", {ink: "#142238"});
  return {
    ...base, name: company?.name || "", companyId: company?.id || "",
    // MC is a string: preserve leading zeros, and strip only a presentation prefix.
    mc: String(info?.mc || base.mc || "").replace(/^MC\s*#?\s*/i, ""),
    dot: String(info?.dot || base.dot || "").replace(/^(US\s*)?DOT\s*#?\s*/i, ""),
    office: info?.phone || base.office, address: info?.address || "",
    detailsSource: info ? "TMS" : "Reference template",
    dispatchEmail: base.domain ? "dispatch@" + base.domain : "",
    safetyEmail: base.domain ? "safety@" + base.domain : "",
    accountingEmail: base.domain ? "accounting@" + base.domain : ""
  };
}
export function driverSheet(driver, companies, profiles, links, trucks, infoRows) {
  const company = companies.find(c => c.id === driver.company_id);
  const info = infoRows.find(c => normalize(c.company_name) === normalize(company?.name));
  const primary = profiles.find(p => p.user_id === driver.dispatcher_id);
  const contacts = [];
  const seen = new Set();
  const add = (profile, role) => {
    if (!profile || seen.has(profile.user_id)) return;
    seen.add(profile.user_id);
    contacts.push({id: profile.user_id, name: displayName(profile.full_name), fullName: profile.full_name || "", ext: profile.ext || "", phone: profile.phone_number || "", role});
  };
  add(primary, "Assigned dispatcher");
  for (const link of links.filter(l => l.dispatcher_id === driver.dispatcher_id)) {
    add(profiles.find(p => p.user_id === link.supervisor_id), "Supervisor");
  }
  const assignedTrucks = trucks.filter(t => t.driver1_id === driver.id || t.driver2_id === driver.id);
  const warnings = [];
  if (!company) warnings.push("This driver has no visible company record.");
  if (!primary) warnings.push("This driver has no visible dispatcher contact.");
  if (assignedTrucks.some(t => t.dispatcher_id && t.dispatcher_id !== driver.dispatcher_id)) warnings.push("Driver and truck dispatcher assignments differ in TMS. The driver assignment is used.");
  if (assignedTrucks.some(t => t.company_id && t.company_id !== driver.company_id)) warnings.push("Driver and truck companies differ in TMS. The driver company is used.");
  if (!info) warnings.push("TMS has no company contact profile for this company. Review the reference-template details.");
  return {driver, company: companySheet(company, info), contacts, truck: assignedTrucks.map(t => t.truck_number).join(", "), warnings};
}
export function departments(sheet) {
  return [
    ["Accounting", "EXT 1"], ["Dispatch", "EXT 2"], ["Safety", "EXT 3"],
    ["Recruiting", "EXT 4"], ["ELD", sheet.eld || "(224) 526-5333, ext 15"],
    ["Claims", "EXT 6"], ["Maintenance", "EXT " + sheet.maintenanceExt],
    ["Recruiting Manager", "(847) 305-3966"]
  ];
}
export function validateSheet(model) {
  if (!model) return ["Select a driver."];
  const errors = [];
  if (!model.company.companyId) errors.push("Company is missing.");
  if (!model.company.mc || !model.company.dot) errors.push("MC and US DOT numbers are required.");
  if (!model.contacts.length) errors.push("Add at least one dispatch contact.");
  if (model.contacts.length > 7) errors.push("Use no more than seven dispatch contacts for a single-page sheet.");
  model.contacts.forEach(c => {
    if (!c.name.trim()) errors.push("A dispatch contact is missing a name.");
    if (!c.ext.trim() && !c.phone.trim()) errors.push((c.name || "A contact") + " needs an extension or phone number.");
  });
  return errors;
}
