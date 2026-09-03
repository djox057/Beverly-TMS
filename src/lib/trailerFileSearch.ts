import { TRAILER_DOCUMENT_TYPES, getTrailerDocumentTypeById } from "./trailerDocumentKeywords";

/**
 * Concept-based search over trailer files.
 *
 * A query is resolved to document concepts through per-document alias phrases
 * (so "cab card" -> Registration, "annual inspection" -> DOT). Files are then
 * matched on their document type, their keywords, or their file name using AND
 * semantics on the query words.
 */

const DOC_ALIASES: Record<string, string[]> = {
  dot: ["dot", "annual dot", "annual inspection", "dot inspection", "annual", "inspection", "annual dot inspection"],
  registration: ["registration", "cab card", "cabcard", "vehicle registration", "trailer registration", "irp", "apportioned registration", "plate registration"],
};

/** Search-only concepts for useful files outside the required checklist. */
const FILE_CONCEPTS: Array<{ aliases: string[]; terms: string[] }> = [
  {
    aliases: ["insurance", "insurance card", "proof of insurance", "coi", "certificate of insurance"],
    terms: ["insurance", "insurance card", "proof of insurance", "coi", "liability insurance"],
  },
  {
    aliases: ["title", "trailer title", "mso"],
    terms: ["title", "trailer title", "mso"],
  },
  {
    aliases: ["lease", "lease agreement"],
    terms: ["lease", "lease agreement"],
  },
  {
    aliases: ["bill of sale", "purchase", "invoice", "purchase agreement"],
    terms: ["bill of sale", "purchase", "invoice", "purchase agreement"],
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
  const doc = getTrailerDocumentTypeById(docId);
  const phrases = [...(DOC_ALIASES[docId] || [])];
  if (doc) {
    phrases.push(doc.label, doc.id.replace(/_/g, " "), ...doc.keywords);
  }
  return phrases;
};

const similar = (a: string, b: string): boolean =>
  a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

const resolveDocIds = (queryTokens: string[]): Set<string> => {
  const ids = new Set<string>();
  TRAILER_DOCUMENT_TYPES.forEach((doc) => {
    const phrases = aliasPhrasesFor(doc.id).map((p) => tokenize(p));
    const matched = phrases.some((phraseTokens) =>
      queryTokens.every((q) => phraseTokens.some((p) => similar(p, q)))
    );
    if (matched) ids.add(doc.id);
  });
  return ids;
};

const resolveConceptTerms = (queryTokens: string[]): string[][] => {
  const concept = FILE_CONCEPTS.find(({ aliases }) =>
    aliases.some((alias) => {
      const aliasTokens = tokenize(alias);
      return queryTokens.every((q) => aliasTokens.some((token) => similar(token, q)));
    })
  );
  return concept ? concept.terms.map((term) => tokenize(term)) : [];
};

export interface SearchableTrailerFile {
  id: string;
  file_name: string;
  keywords: string[] | null;
  folder: string | null;
}

export interface TrailerFileSearchHit<T extends SearchableTrailerFile> {
  file: T;
  score: number;
}

export const searchTrailerFiles = <T extends SearchableTrailerFile>(
  files: T[],
  query: string
): TrailerFileSearchHit<T>[] => {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const docIds = resolveDocIds(queryTokens);
  const conceptTerms = resolveConceptTerms(queryTokens);
  const lowerQuery = query.trim().toLowerCase().replace(/\s+/g, " ");

  const hits: TrailerFileSearchHit<T>[] = [];

  files.forEach((file) => {
    const nameTokens = tokenize(file.file_name);
    const keywordTokens = (file.keywords || []).flatMap((k) => tokenize(k));
    const fileDocId = (file.keywords || []).find((k) => getTrailerDocumentTypeById(k));

    let score = 0;

    if (fileDocId && docIds.has(fileDocId)) score += 10;

    if (lowerQuery.length >= 3 && file.file_name.toLowerCase().includes(lowerQuery)) score += 8;

    const allInName = queryTokens.every((q) => nameTokens.some((n) => similar(n, q)));
    if (allInName) score += 6;

    const allInKeywords =
      keywordTokens.length > 0 && queryTokens.every((q) => keywordTokens.some((k) => similar(k, q)));
    if (allInKeywords) score += 5;

    const conceptMatch =
      conceptTerms.length > 0 &&
      conceptTerms.some((termTokens) =>
        termTokens.every((term) =>
          [...nameTokens, ...keywordTokens].some((candidate) => similar(candidate, term))
        )
      );
    if (conceptMatch) score += 10;

    if (score > 0) hits.push({ file, score });
  });

  return hits.sort((a, b) => b.score - a.score || a.file.file_name.localeCompare(b.file.file_name));
};
