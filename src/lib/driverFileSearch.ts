import { DRIVER_DOCUMENT_TYPES, getDocumentTypeById } from "./driverDocumentKeywords";

/**
 * Concept-based search over driver files.
 *
 * A query is resolved to document concepts through per-document alias phrases
 * (so "driving record" -> MVR, "physical" -> Medical card). Files are then
 * matched on their document type, their keywords, or their file name using AND
 * semantics on the query words. A query that resolves to nothing and does not
 * appear in any file name returns no results instead of loose noise.
 */

/** Extra phrases (beyond label/keywords) that should resolve to a document type. */
const DOC_ALIASES: Record<string, string[]> = {
  cdl: ["cdl", "driver license", "drivers license", "driver licence", "commercial driver license", "dl"],
  cdl_front: ["cdl front", "license front", "front of cdl", "cdl f"],
  cdl_back: ["cdl back", "license back", "back of cdl", "cdl rear"],
  ssn: ["ssn", "social security", "social security card", "social"],
  medical_card: ["medical card", "med card", "medical certificate", "dot physical", "physical", "dot card", "medical exam", "med cert"],
  ccf: ["ccf", "chain of custody", "custody control form", "custody form"],
  pre_emp_drug_test: ["pre employment drug test", "drug test", "drug screen", "pre emp drug", "urine test"],
  fmcsa_national_registry: ["fmcsa", "national registry", "fmcsa national registry", "medical examiner registry"],
  psp: ["psp", "pre employment screening", "pre employment screening program", "safety history"],
  psp_consent: ["psp consent", "psp release", "psp authorization"],
  mvr: ["mvr", "motor vehicle record", "driving record", "driving history", "driver record"],
  mvr_consent: ["mvr consent", "mvr release", "mvr authorization"],
  clearinghouse: ["clearinghouse", "fmcsa clearinghouse", "drug and alcohol clearinghouse"],
  clearinghouse_consent: ["clearinghouse consent", "clearinghouse release", "clearinghouse authorization"],
  drug_alcohol_consent: ["drug and alcohol consent", "drug alcohol policy consent", "alcohol consent"],
  driver_consent: ["driver consent", "consent form", "consent"],
  legal_authorization: ["legal authorization", "work authorization", "work permit", "green card", "ead", "visa", "employment authorization"],
  safe_policy: ["safe policy", "safety policy", "company safety policy"],
  contractor_agreement: ["contractor agreement", "independent contractor agreement", "contract", "owner operator agreement"],
  equipment_agreement: ["equipment agreement", "equipment lease", "equipment form"],
  small_lease: ["small lease", "lease agreement", "lease"],
  rules: ["rules", "company rules", "driver rules"],
  arbitrate: ["arbitrate", "arbitration", "arbitration agreement"],
  app: ["app", "application", "driver application", "employment application"],
  app_updated: ["app updated", "updated application", "revised application"],
};

/** Search-only concepts for useful files outside the required-driver checklist. */
const FILE_CONCEPTS: Array<{ aliases: string[]; terms: string[] }> = [
  {
    aliases: ["cab card", "cabcard", "registration", "vehicle registration", "truck registration", "irp", "apportioned registration"],
    terms: ["cab card", "cabcard", "registration", "vehicle registration", "truck registration", "irp", "apportioned"],
  },
  {
    aliases: ["insurance", "insurance card", "proof of insurance"],
    terms: ["insurance", "insurance card", "proof of insurance", "liability insurance"],
  },
];

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "and", "for", "to", "file", "files", "form", "copy", "scan", "scanned",
  "pdf", "doc", "docx", "jpg", "jpeg", "png", "side", "new",
]);

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));

const aliasPhrasesFor = (docId: string): string[] => {
  const doc = getDocumentTypeById(docId);
  const phrases = [...(DOC_ALIASES[docId] || [])];
  if (doc) {
    phrases.push(doc.label, doc.id.replace(/_/g, " "), ...doc.keywords);
  }
  return phrases;
};

const similar = (a: string, b: string): boolean =>
  a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

/**
 * Resolve a query to document ids. A concept matches only when every
 * meaningful query word is covered by one of its alias phrases.
 */
const resolveDocIds = (queryTokens: string[]): Set<string> => {
  const ids = new Set<string>();
  DRIVER_DOCUMENT_TYPES.forEach((doc) => {
    const phrases = aliasPhrasesFor(doc.id).map((p) => tokenize(p));
    const matched = phrases.some((phraseTokens) =>
      queryTokens.every((q) => phraseTokens.some((p) => similar(p, q)))
    );
    if (matched) ids.add(doc.id);
  });
  return ids;
};

const resolveConceptTerms = (queryTokens: string[]): string[] => {
  const concept = FILE_CONCEPTS.find(({ aliases }) =>
    aliases.some((alias) => {
      const aliasTokens = tokenize(alias);
      return queryTokens.every((q) => aliasTokens.some((token) => similar(token, q)));
    })
  );
  return concept ? concept.terms.flatMap((term) => tokenize(term)) : [];
};

export interface SearchableDriverFile {
  id: string;
  file_name: string;
  keywords: string[] | null;
  folder: string | null;
}

export interface DriverFileSearchHit<T extends SearchableDriverFile> {
  file: T;
  score: number;
}

export const searchDriverFiles = <T extends SearchableDriverFile>(
  files: T[],
  query: string
): DriverFileSearchHit<T>[] => {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const docIds = resolveDocIds(queryTokens);
  const conceptTerms = resolveConceptTerms(queryTokens);
  const lowerQuery = query.trim().toLowerCase().replace(/\s+/g, " ");

  const hits: DriverFileSearchHit<T>[] = [];

  files.forEach((file) => {
    const nameTokens = tokenize(file.file_name);
    const keywordTokens = (file.keywords || []).flatMap((k) => tokenize(k));
    const fileDocId = (file.keywords || []).find((k) => getDocumentTypeById(k));

    let score = 0;

    // 1. document-concept match (the main path: "cab card", "physical", "driving record")
    if (fileDocId && docIds.has(fileDocId)) score += 10;

    // 2. literal phrase inside the file name
    if (lowerQuery.length >= 3 && file.file_name.toLowerCase().includes(lowerQuery)) score += 8;

    // 3. every query word appears in the file name (AND semantics)
    const allInName = queryTokens.every((q) => nameTokens.some((n) => similar(n, q)));
    if (allInName) score += 6;

    // 4. every query word appears in stored keywords
    const allInKeywords =
      keywordTokens.length > 0 && queryTokens.every((q) => keywordTokens.some((k) => similar(k, q)));
    if (allInKeywords) score += 5;

    // 5. search-only concept match, e.g. "cab card" -> "registration" / "IRP"
    const conceptMatch =
      conceptTerms.length > 0 &&
      conceptTerms.some((term) =>
        [...nameTokens, ...keywordTokens].some((candidate) => similar(candidate, term))
      );
    if (conceptMatch) score += 10;

    if (score > 0) hits.push({ file, score });
  });

  return hits.sort((a, b) => b.score - a.score || a.file.file_name.localeCompare(b.file.file_name));
};
