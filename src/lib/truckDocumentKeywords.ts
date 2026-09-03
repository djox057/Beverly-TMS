/**
 * Catalog of required truck documents and the keywords attached to each.
 * Order matters: more specific entries (e.g. "Registration Affirmation") must
 * come before the generic ones (e.g. "Registration") so filename
 * auto-detection picks the right one.
 */
export interface TruckDocumentType {
  /** Stable identifier stored as the primary keyword */
  id: string;
  /** Human label shown in the UI */
  label: string;
  /** Keywords stored on the file record */
  keywords: string[];
  /** Filename patterns used for auto-detection / backfill */
  patterns: RegExp[];
}

export const TRUCK_DOCUMENT_TYPES: TruckDocumentType[] = [
  {
    id: "registration_affirmation",
    label: "Registration Affirmation",
    keywords: ["registration affirmation", "affirmation", "registration"],
    patterns: [
      /\breg(istration)?\b[\s_-]*affirm\w*\b/i,
      /\baffirm\w*\b[\s_-]*reg(istration)?\b/i,
      /\baffirmation\b/i,
    ],
  },
  {
    id: "annual_dot",
    label: "Annual DOT",
    keywords: ["annual dot", "annual inspection", "dot inspection", "annual dot inspection"],
    patterns: [
      /\bannual\b[\s_-]*(dot|inspection|insp)\b/i,
      /\bdot\b[\s_-]*(annual|inspection|insp)\b/i,
      /\bannual\b/i,
    ],
  },
  {
    id: "lease_agreement",
    label: "Lease Agreement",
    keywords: ["lease agreement", "lease", "agreement"],
    patterns: [/\blease\b[\s_-]*agree?ment\b/i, /\blease\b/i],
  },
  {
    id: "ky_permit",
    label: "KY Permit",
    keywords: ["ky permit", "kentucky permit", "kyu", "permit"],
    patterns: [/\bky\w*\b[\s_-]*(permit|number|no)?\b/i, /\bkentucky\b/i, /\bkyu\b/i],
  },
  {
    id: "ny_permit",
    label: "NY Permit",
    keywords: ["ny permit", "new york permit", "hut", "permit"],
    patterns: [/\bny\b[\s_-]*(permit|hut|number|no)?\b/i, /\bnew[\s_-]*york\b/i, /\bhut\b/i],
  },
  {
    id: "nm_permit",
    label: "NM Permit",
    keywords: ["nm permit", "new mexico permit", "permit"],
    patterns: [/\bnm\b[\s_-]*(permit|number|no)?\b/i, /\bnew[\s_-]*mexico\b/i],
  },
  {
    id: "ifta_licence",
    label: "IFTA Licence",
    keywords: ["ifta", "ifta licence", "ifta license", "fuel tax licence"],
    patterns: [/\bifta\b/i, /\bfuel[\s_-]*tax\b/i],
  },
  {
    id: "registration",
    label: "Registration",
    keywords: ["registration", "cab card", "vehicle registration", "irp"],
    patterns: [
      /\bcab[\s_-]*card\b/i,
      /\bcabcard\b/i,
      /\breg(istration)?\b/i,
      /\birp\b/i,
      /\bapportioned\b/i,
    ],
  },
];

/** Required document checklist shown per truck (in the requested order). */
export const REQUIRED_TRUCK_DOCUMENT_IDS = [
  "annual_dot",
  "lease_agreement",
  "registration_affirmation",
  "ky_permit",
  "ny_permit",
  "nm_permit",
  "registration",
  "ifta_licence",
] as const;

export const getTruckDocumentTypeById = (id: string): TruckDocumentType | undefined =>
  TRUCK_DOCUMENT_TYPES.find((d) => d.id === id);

/** Document types shown in the picker, in checklist order. */
export const TRUCK_DOCUMENT_PICKER: TruckDocumentType[] = REQUIRED_TRUCK_DOCUMENT_IDS
  .map((id) => getTruckDocumentTypeById(id))
  .filter((d): d is TruckDocumentType => !!d);

/**
 * Detect the document type from a file name.
 * Returns the first matching catalog entry (specific entries come first).
 */
export const detectTruckDocumentType = (fileName: string): TruckDocumentType | null => {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  for (const doc of TRUCK_DOCUMENT_TYPES) {
    if (doc.patterns.some((p) => p.test(base))) return doc;
  }
  return null;
};

/** Keywords to store for a file name (empty array when nothing matches). */
export const detectTruckFileKeywords = (fileName: string): string[] => {
  const doc = detectTruckDocumentType(fileName);
  return doc ? [doc.id, ...doc.keywords] : [];
};
