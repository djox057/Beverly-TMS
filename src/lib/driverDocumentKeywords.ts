/**
 * Catalog of required driver documents and the keywords attached to each.
 * Order matters: more specific entries (e.g. "MVR consent") must come before
 * the generic ones (e.g. "MVR") so filename auto-detection picks the right one.
 */
export interface DriverDocumentType {
  /** Stable identifier stored as the primary keyword */
  id: string;
  /** Human label shown in the UI */
  label: string;
  /** Keywords stored on the file record */
  keywords: string[];
  /** Filename patterns used for auto-detection / backfill */
  patterns: RegExp[];
}

export const DRIVER_DOCUMENT_TYPES: DriverDocumentType[] = [
  {
    id: "app_updated",
    label: "APP updated",
    keywords: ["app updated", "application", "updated application"],
    patterns: [/\bapp(lication)?\b[\s_-]*(updated|update|rev(ised)?|new)\b/i, /\b(updated|revised)\b[\s_-]*app(lication)?\b/i],
  },
  {
    id: "app",
    label: "APP",
    keywords: ["app", "application", "driver application"],
    patterns: [/\bapp\b/i, /\bapplication\b/i],
  },
  {
    id: "cdl_front",
    label: "CDL front side",
    keywords: ["cdl", "driver license", "cdl front", "license front"],
    patterns: [/\bcdl\b[\s_-]*(front|f)\b/i, /(front)[\s_-]*\b(cdl|lic(ense|ence)?)\b/i, /\b(driver'?s?[\s_-]*lic(ense|ence)?)\b[\s_-]*front/i],
  },
  {
    id: "cdl_back",
    label: "CDL back side",
    keywords: ["cdl", "driver license", "cdl back", "license back"],
    patterns: [/\bcdl\b[\s_-]*(back|rear|b)\b/i, /(back|rear)[\s_-]*\b(cdl|lic(ense|ence)?)\b/i, /\b(driver'?s?[\s_-]*lic(ense|ence)?)\b[\s_-]*back/i],
  },
  {
    id: "cdl",
    label: "CDL",
    keywords: ["cdl", "driver license"],
    patterns: [/\bcdl\b/i, /\bdriver'?s?[\s_-]*lic(ense|ence)\b/i],
  },
  {
    id: "ssn",
    label: "SSN",
    keywords: ["ssn", "social security", "social security card"],
    patterns: [/\bssn\b/i, /\bsocial[\s_-]*sec(urity)?\b/i],
  },
  {
    id: "medical_card",
    label: "Medical card",
    keywords: ["medical card", "med card", "dot physical", "medical certificate"],
    patterns: [/\bmed(ical)?[\s_-]*(card|cert(ificate)?|exam)\b/i, /\bdot[\s_-]*physical\b/i, /\bmedcard\b/i],
  },
  {
    id: "ccf",
    label: "CCF",
    keywords: ["ccf", "chain of custody", "custody control form"],
    patterns: [/\bccf\b/i, /\bchain[\s_-]*of[\s_-]*custody\b/i, /\bcustody[\s_-]*control\b/i],
  },
  {
    id: "pre_emp_drug_test",
    label: "Pre emp drug test",
    keywords: ["pre employment drug test", "drug test", "pre emp"],
    patterns: [/\bpre[\s_-]*(emp|employ(ment)?)\b/i, /\bdrug[\s_-]*(test|screen)\b/i],
  },
  {
    id: "fmcsa_national_registry",
    label: "FMCSA National Registry",
    keywords: ["fmcsa", "national registry", "fmcsa national registry"],
    patterns: [/\bfmcsa\b/i, /\bnat(ional)?[\s_-]*reg(istry)?\b/i],
  },
  {
    id: "psp_consent",
    label: "PSP consent",
    keywords: ["psp consent", "psp", "consent"],
    patterns: [/\bpsp\b[\s_-]*(consent|auth(orization)?|release)\b/i, /\b(consent|release)[\s_-]*psp\b/i],
  },
  {
    id: "psp",
    label: "PSP",
    keywords: ["psp", "pre employment screening"],
    patterns: [/\bpsp\b/i, /\bpre[\s_-]*employment[\s_-]*screening\b/i],
  },
  {
    id: "mvr_consent",
    label: "MVR consent",
    keywords: ["mvr consent", "mvr", "consent"],
    patterns: [/\bmvr\b[\s_-]*(consent|auth(orization)?|release)\b/i, /\b(consent|release)[\s_-]*mvr\b/i],
  },
  {
    id: "mvr",
    label: "MVR",
    keywords: ["mvr", "motor vehicle record"],
    patterns: [/\bmvr\b/i, /\bmotor[\s_-]*vehicle[\s_-]*record\b/i],
  },
  {
    id: "clearinghouse_consent",
    label: "Clearinghouse consent",
    keywords: ["clearinghouse consent", "clearinghouse", "consent"],
    patterns: [/\bclearing[\s_-]*ho(use|se|us)\w*\b[\s_-]*(consent|auth(orization)?|release)\b/i, /\b(consent|release)[\s_-]*clearing[\s_-]*ho\w*\b/i],
  },
  {
    id: "clearinghouse",
    label: "Clearinghouse",
    keywords: ["clearinghouse", "fmcsa clearinghouse"],
    patterns: [/\bclearing[\s_-]*ho(use|se|us)\w*\b/i],
  },
  {
    id: "drug_alcohol_consent",
    label: "Drug and alcohol consent",
    keywords: ["drug and alcohol consent", "drug alcohol", "consent"],
    patterns: [/\bdrug\b[\s_-]*(and|&)?[\s_-]*alcohol\b/i, /\balcohol[\s_-]*consent\b/i],
  },
  {
    id: "driver_consent",
    label: "Driver consent",
    keywords: ["driver consent", "consent"],
    patterns: [/\bdriver\b[\s_-]*consent\b/i],
  },
  {
    id: "legal_authorization",
    label: "Legal Authorization",
    keywords: ["legal authorization", "work authorization", "legal"],
    patterns: [/\blegal[\s_-]*auth(orization)?\b/i, /\bwork[\s_-]*auth(orization)?\b/i],
  },
  {
    id: "safe_policy",
    label: "Safe policy",
    keywords: ["safe policy", "safety policy", "policy"],
    patterns: [/\bsafe(ty)?[\s_-]*polic(y|ies)\b/i],
  },
  {
    id: "contractor_agreement",
    label: "Contractor Agreement",
    keywords: ["contractor agreement", "agreement", "contract"],
    patterns: [/\bcontract(or)?[\s_-]*agree?ment\b/i, /\bindependent[\s_-]*contractor\b/i],
  },
  {
    id: "equipment_agreement",
    label: "Equipment Agreement",
    keywords: ["equipment agreement", "agreement", "equipment"],
    patterns: [/\bequip(ment)?[\s_-]*agree?ment\b/i],
  },
  {
    id: "small_lease",
    label: "Small Lease",
    keywords: ["small lease", "lease", "lease agreement"],
    patterns: [/\bsmall[\s_-]*lease\b/i, /\blease\b/i],
  },
  {
    id: "rules",
    label: "Rules",
    keywords: ["rules", "company rules"],
    patterns: [/\brules?\b/i],
  },
  {
    id: "arbitrate",
    label: "Arbitrate",
    keywords: ["arbitrate", "arbitration"],
    patterns: [/\barbitrat\w*\b/i],
  },
];

/** Required document checklist shown per driver (in the requested order). */
export const REQUIRED_DRIVER_DOCUMENT_IDS = [
  "cdl_front",
  "cdl_back",
  "ssn",
  "medical_card",
  "ccf",
  "pre_emp_drug_test",
  "fmcsa_national_registry",
  "psp",
  "mvr",
  "clearinghouse",
  "driver_consent",
  "legal_authorization",
  "safe_policy",
  "contractor_agreement",
  "equipment_agreement",
  "rules",
  "arbitrate",
  "small_lease",
  "mvr_consent",
  "psp_consent",
  "clearinghouse_consent",
  "drug_alcohol_consent",
  "app",
  "app_updated",
] as const;

export const getDocumentTypeById = (id: string): DriverDocumentType | undefined =>
  DRIVER_DOCUMENT_TYPES.find((d) => d.id === id);

/** Document types shown in the picker, in checklist order. */
export const DRIVER_DOCUMENT_PICKER: DriverDocumentType[] = REQUIRED_DRIVER_DOCUMENT_IDS
  .map((id) => getDocumentTypeById(id))
  .filter((d): d is DriverDocumentType => !!d);

/**
 * Detect the document type from a file name.
 * Returns the first matching catalog entry (specific entries come first).
 */
export const detectDriverDocumentType = (fileName: string): DriverDocumentType | null => {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  for (const doc of DRIVER_DOCUMENT_TYPES) {
    if (doc.patterns.some((p) => p.test(base))) return doc;
  }
  return null;
};

/** Keywords to store for a file name (empty array when nothing matches). */
export const detectDriverFileKeywords = (fileName: string): string[] => {
  const doc = detectDriverDocumentType(fileName);
  return doc ? [doc.id, ...doc.keywords] : [];
};
