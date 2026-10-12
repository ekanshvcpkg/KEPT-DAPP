// Searching the object catalog. Pure: the caller supplies the entries' labels (copy), so tests need no copy and the
// catalog stays data. A match is ranked by how directly the query names a term of the entry (its label or an alias):
// the same word, a start of it, a start of one of its words, a part of it, then a one-letter typo of a whole word.
import { OBJECTS } from "@kept/config";
import { CATALOG } from "./catalog";
import type { CatalogEntry, ObjectCategory } from "./catalog";

/** Lower case, no accents or punctuation, single spaces, and a plural stripped from each word ("dumbbells" → "dumbbell"). */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(singular)
    .join(" ");
}

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

/** Edit distance, capped: anything over `max` returns max + 1. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return Math.min(prev[b.length]!, max + 1);
}

export interface ObjectMatch {
  entry: CatalogEntry;
  /** The term (label or alias) the query matched, as written in the catalog or copy. */
  term: string;
  /** Higher is closer. */
  score: number;
}

type Indexed = { entry: CatalogEntry; terms: { raw: string; norm: string; words: string[] }[] };

/** Index of the catalog for these labels. Build it once per label set (see `useObjectIndex`). */
export function buildIndex(labelOf: (key: string) => string, entries: readonly CatalogEntry[] = CATALOG): Indexed[] {
  return entries.map((entry) => ({
    entry,
    terms: [labelOf(entry.key), ...entry.aliases].map((raw) => { const norm = normalize(raw); return { raw, norm, words: norm.split(" ") }; }),
  }));
}

function scoreTerm(query: string, qWords: string[], term: { norm: string; words: string[] }): number {
  if (term.norm === query) return 100;
  if (term.norm.startsWith(query)) return 80;
  // Every word typed starts a different word of the term ("water bot" → "water bottle").
  if (qWords.every((q) => term.words.some((w) => w.startsWith(q)))) return 60;
  // A part of a word only counts from three letters: one or two would match half the catalog.
  if (query.length >= 3 && term.norm.includes(query)) return 40;
  // One typo in a whole word ("dumbell", "yoga matt"): every query word is a word of the term, give or take a letter.
  if (qWords.every((q) => q.length >= 4 && term.words.some((w) => distance(q, w, 1) <= 1))) return 30;
  return 0;
}

/** Entries matching `query`, best first; the objects available today come before unavailable ones on a tie. Empty for a blank query. */
export function searchObjects(index: Indexed[], query: string): ObjectMatch[] {
  const q = normalize(query);
  if (!q) return [];
  const qWords = q.split(" ");
  const out: ObjectMatch[] = [];
  for (const { entry, terms } of index) {
    let best: ObjectMatch | null = null;
    for (const term of terms) {
      const score = scoreTerm(q, qWords, term);
      if (score > (best?.score ?? 0)) best = { entry, term: term.raw, score };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score || Number(b.entry.object !== null) - Number(a.entry.object !== null) || a.entry.key.localeCompare(b.entry.key));
}

export function entriesIn(category: ObjectCategory, entries: readonly CatalogEntry[] = CATALOG): CatalogEntry[] {
  return entries.filter((e) => e.category === category).sort((a, b) => Number(b.object !== null) - Number(a.object !== null));
}

/** The program's `object_id` for a catalog entry, or null when it isn't one of the eight. */
export const objectIndexOf = (entry: Pick<CatalogEntry, "object">): number | null =>
  entry.object === null ? null : OBJECTS.findIndex((o) => o.id === entry.object);
