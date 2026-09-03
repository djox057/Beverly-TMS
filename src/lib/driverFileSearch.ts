import { DRIVER_DOCUMENT_TYPES, getDocumentTypeById } from "./driverDocumentKeywords";

/**
 * Lightweight "vector-like" search over driver files.
 * Each file is turned into a bag of terms (file name + stored keywords +
 * document label + synonym expansions) and scored against the query terms
 * with cosine-style overlap plus prefix/substring fallbacks. This lets a
 * query such as "cab card" surface the registration document.
 */

/** Synonyms: query term -> extra terms that should also match. */
const SYNONYMS: Record<string, string[]> = {
  "cab": ["cab card", "registration", "reg", "truck registration"],
  "cab card": ["registration", "reg"],
  "card": ["cab card", "registration", "medical card", "med card"],
  "registration": ["cab card", "reg", "plate"],
  "reg": ["registration", "cab card"],
  "licence": ["license", "cdl", "driver license"],
  "license": ["cdl", "driver license", "licence"],
  "dl": ["cdl", "driver license"],
  "cdl": ["driver license", "license", "commercial driver license"],
  "physical": ["medical card", "dot physical", "med card", "medical"],
  "dot": ["medical card", "dot physical", "fmcsa"],
  "med": ["medical card", "medical", "med card"],
  "medical": ["medical card", "med card", "dot physical"],
  "social": ["ssn", "social security"],
  "ss": ["ssn", "social security"],
  "ssn": ["social security", "social security card"],
  "drug": ["drug test", "pre employment drug test", "ccf", "drug and alcohol"],
  "alcohol": ["drug and alcohol consent", "drug test"],
  "screen": ["drug test", "psp", "pre employment screening"],
  "custody": ["ccf", "chain of custody"],
  "ccf": ["chain of custody", "drug test"],
  "psp": ["pre employment screening", "safety history"],
  "mvr": ["motor vehicle record", "driving record"],
  "driving": ["mvr", "motor vehicle record"],
  "record": ["mvr", "motor vehicle record"],
  "clearinghouse": ["fmcsa clearinghouse", "drug and alcohol clearinghouse"],
  "registry": ["fmcsa", "national registry"],
  "fmcsa": ["national registry", "clearinghouse"],
  "consent": ["release", "authorization", "auth"],
  "release": ["consent", "authorization"],
  "authorization": ["consent", "legal authorization", "work authorization"],
  "legal": ["legal authorization", "work authorization", "work permit"],
  "permit": ["legal authorization", "work authorization"],
  "visa": ["legal authorization", "work authorization"],
  "policy": ["safe policy", "safety policy"],
  "safety": ["safe policy", "safety policy"],
  "agreement": ["contractor agreement", "equipment agreement", "lease", "contract"],
  "contract": ["contractor agreement", "agreement"],
  "equipment": ["equipment agreement"],
  "lease": ["small lease", "lease agreement"],
  "rules": ["company rules", "policy"],
  "arbitration": ["arbitrate"],
  "arbitrate": ["arbitration"],
  "app": ["application", "driver application"],
  "application": ["app", "driver application"],
  "front": ["front side", "f"],
  "back": ["back side", "rear", "b"],
};

const STOP_WORDS = new Set(["the", "a", "of", "and", "for", "to", "file", "files", "pdf", "doc", "docx", "jpg", "jpeg", "png"]);

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

const expand = (terms: string[]): Set<string> => {
  const out = new Set<string>();
  terms.forEach((t) => {
    out.add(t);
    (SYNONYMS[t] || []).forEach((s) => tokenize(s).forEach((x) => out.add(x)));
  });
  return out;
};

export interface SearchableDriverFile {
  id: string;
  file_name: string;
  keywords: string[] | null;
  folder: string | null;
}

/** Terms describing a file: name tokens + keyword tokens + doc label + synonyms. */
const fileTerms = (file: SearchableDriverFile): Set<string> => {
  const base: string[] = [...tokenize(file.file_name)];
  (file.keywords || []).forEach((k) => {
    base.push(...tokenize(k));
    const doc = getDocumentTypeById(k);
    if (doc) {
      base.push(...tokenize(doc.label));
      doc.keywords.forEach((kw) => base.push(...tokenize(kw)));
    }
  });
  if (file.folder) base.push(...tokenize(file.folder));
  return expand(base);
};

/** Document ids whose label/keywords match the query (used to boost typed files). */
const matchingDocIds = (queryTerms: Set<string>): Set<string> => {
  const ids = new Set<string>();
  DRIVER_DOCUMENT_TYPES.forEach((doc) => {
    const terms = expand([...tokenize(doc.label), ...doc.keywords.flatMap((k) => tokenize(k)), ...tokenize(doc.id)]);
    let hits = 0;
    queryTerms.forEach((q) => {
      if (terms.has(q)) hits++;
    });
    if (hits > 0) ids.add(doc.id);
  });
  return ids;
};

export interface DriverFileSearchHit<T extends SearchableDriverFile> {
  file: T;
  score: number;
}

export const searchDriverFiles = <T extends SearchableDriverFile>(
  files: T[],
  query: string
): DriverFileSearchHit<T>[] => {
  const rawTerms = tokenize(query);
  if (rawTerms.length === 0) return [];
  const queryTerms = expand(rawTerms);
  const docIds = matchingDocIds(queryTerms);
  const lowerQuery = query.trim().toLowerCase();

  const hits: DriverFileSearchHit<T>[] = [];

  files.forEach((file) => {
    const terms = fileTerms(file);
    let score = 0;

    // exact term overlap (weighted higher for the user's literal terms)
    rawTerms.forEach((t) => {
      if (terms.has(t)) score += 3;
      else if ([...terms].some((x) => x.startsWith(t) || t.startsWith(x))) score += 1.5;
    });

    // synonym-expanded overlap
    queryTerms.forEach((t) => {
      if (terms.has(t)) score += 1;
    });

    // document type match
    (file.keywords || []).forEach((k) => {
      if (docIds.has(k)) score += 4;
    });

    // literal substring in the file name
    if (file.file_name.toLowerCase().includes(lowerQuery)) score += 5;

    if (score > 0) {
      hits.push({ file, score: score / (rawTerms.length + 1) });
    }
  });

  return hits.sort((a, b) => b.score - a.score || a.file.file_name.localeCompare(b.file.file_name));
};
