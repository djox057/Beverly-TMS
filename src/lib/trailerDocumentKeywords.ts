/**
 * Catalog of required trailer documents and the keywords attached to each.
 * Order matters: more specific entries come before generic ones so filename
 * auto-detection picks the right one.
 */
export interface TrailerDocumentType {
  /** Stable identifier stored as the primary keyword */
  id: string;
  /** Human label shown in the UI */
  label: string;
  /** Keywords stored on the file record */
  keywords: string[];
  /** Filename patterns used for auto-detection / backfill */
  patterns: RegExp[];
}

export const TRAILER_DOCUMENT_TYPES: TrailerDocumentType[] = [
  {
    id: "dot",
    label: "DOT",
    keywords: ["dot", "annual dot", "dot inspection", "annual inspection"],
    patterns: [
      /\bannual\b[\s_-]*(dot|inspection|insp)\b/i,
      /\bdot\b[\s_-]*(annual|inspection|insp)?\b/i,
      /\bannual\b/i,
      /\binspection\b/i,
    ],
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

/** Required document checklist shown per trailer (in the requested order). */
export const REQUIRED_TRAILER_DOCUMENT_IDS = ["dot", "registration"] as const;

export const getTrailerDocumentTypeById = (id: string): TrailerDocumentType | undefined =>
  TRAILER_DOCUMENT_TYPES.find((d) => d.id === id);

/** Document types shown in the picker, in checklist order. */
export const TRAILER_DOCUMENT_PICKER: TrailerDocumentType[] = REQUIRED_TRAILER_DOCUMENT_IDS
  .map((id) => getTrailerDocumentTypeById(id))
  .filter((d): d is TrailerDocumentType => !!d);

/** Detect the document type from a file name. */
export const detectTrailerDocumentType = (fileName: string): TrailerDocumentType | null => {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  for (const doc of TRAILER_DOCUMENT_TYPES) {
    if (doc.patterns.some((p) => p.test(base))) return doc;
  }
  return null;
};

/** Keywords to store for a file name (empty array when nothing matches). */
export const detectTrailerFileKeywords = (fileName: string): string[] => {
  const doc = detectTrailerDocumentType(fileName);
  return doc ? [doc.id, ...doc.keywords] : [];
};
