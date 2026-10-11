// The object catalog behind C2's search. The program supports eight objects; the catalog is a search index over them
// and over things that are NOT supported, which must stay unavailable rather than turn into one of the eight.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OBJECTS } from "@kept/config";
import { t } from "@/copy";
import type { CopyKey } from "@/copy";
import { CATALOG, CATEGORIES } from "@/features/objects/catalog";
import { buildIndex, entriesIn, normalize, objectIndexOf, searchObjects } from "@/features/objects/search";

const label = (key: string) => t(`additions.objects.entry.${key}` as CopyKey);
const index = buildIndex(label);
const top = (q: string) => searchObjects(index, q)[0];
const objectOf = (q: string) => { const m = top(q); return m ? objectIndexOf(m.entry) : undefined; };

describe("the eight objects the program supports", () => {
  const backend = readFileSync(join(__dirname, "..", "..", "..", "backend", "src", "v4", "rules.ts"), "utf8");

  it("are in the program's order, with the exact text the backend requires (drift check against backend/src/v4/rules.ts)", () => {
    const ids = [...(/OBJECT_IDS = \[([^\]]+)\]/.exec(backend)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(OBJECTS.map((o) => o.id)).toEqual(ids);
    expect(ids).toHaveLength(8);
    const text = /OBJECT_TEXT: Record<string, string> = \{([^}]+)\}/.exec(backend)?.[1] ?? "";
    for (const o of OBJECTS) expect(text).toContain(`${o.id}: "${o.text}"`);
  });

  it("each canonical entry is its own object id, in that order", () => {
    OBJECTS.forEach((o, i) => {
      const entry = CATALOG.find((c) => c.key === o.id)!;
      expect(entry.object).toBe(o.id);
      expect(objectIndexOf(entry)).toBe(i);
    });
  });
});

describe("the catalog", () => {
  it("is large and organized: every entry has a label and a category, and every category has entries", () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(90);
    expect(CATALOG.reduce((n, c) => n + c.aliases.length, 0)).toBeGreaterThanOrEqual(600);
    for (const c of CATALOG) {
      expect(label(c.key)).toMatch(/\S/);
      expect(CATEGORIES).toContain(c.category);
    }
    for (const cat of CATEGORIES) {
      expect(t(`additions.objects.cat.${cat}` as CopyKey)).toMatch(/\S/);
      expect(entriesIn(cat).length).toBeGreaterThan(0);
    }
  });

  it("never offers an object outside the eight, and no word means two things", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const c of CATALOG) {
      expect(c.object === null || OBJECTS.some((o) => o.id === c.object)).toBe(true);
      for (const term of [label(c.key), ...c.aliases].map(normalize)) {
        const owner = seen.get(term);
        if (owner !== undefined && owner !== c.key) clashes.push(`"${term}" is under both ${owner} and ${c.key}`);
        seen.set(term, c.key);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("only the eight real objects are available; the rest wait for the program (BACKEND_GAPS › Proof objects)", () => {
    expect(CATALOG.filter((c) => c.object !== null)).toHaveLength(8);
    expect(CATALOG.filter((c) => c.object === null).length).toBeGreaterThanOrEqual(80);
  });

  it("lists a category's available objects first", () => {
    expect(entriesIn("cardio").map((c) => c.key).slice(0, 2).sort()).toEqual(["running_shoe", "skipping_rope"]);
  });
});

describe("alias matching resolves to the canonical object only when it means the same thing", () => {
  it.each([
    ["dumbbells", 0], ["dumb bell", 0], ["hand weights", 0], ["free weights", 0],
    ["novel", 1], ["paperback", 1], ["textbook", 1], ["reading", 1],
    ["hydration", 2], ["bottle", 2], ["reusable bottle", 2], ["drink water", 2],
    ["acoustic guitar", 3], ["electric guitar", 3],
    ["sneakers", 4], ["trainers", 4], ["Runners", 4], ["jogging shoes", 4],
    ["houseplant", 5], ["succulent", 5], ["potted plant", 5],
    ["jump rope", 6], ["skip rope", 6], ["jumping rope", 6],
    ["pilates mat", 7], ["exercise mat", 7], ["yoga", 7],
  ])("%s → object %i", (query, id) => {
    expect(objectOf(query as string)).toBe(id);
  });

  it.each([
    ["kettlebell", "kettlebell"], ["barbell", "barbell"], ["notebook", "notebook"], ["kindle", "e_reader"], ["bass guitar", "bass_guitar"],
    ["ukulele", "ukulele"], ["piano", "piano"], ["flowers", "flowers"], ["thermos", "thermos"], ["laptop", "laptop"], ["bicycle", "bicycle"],
    ["hiking boots", "hiking_boots"], ["protein shaker", "shaker_bottle"], ["resistance band", "resistance_band"],
  ])("%s is its own, unavailable entry (not one of the eight)", (query, key) => {
    const m = top(query)!;
    expect(m.entry.key).toBe(key);
    expect(m.entry.object).toBeNull();
    expect(objectIndexOf(m.entry)).toBeNull();
  });

  it("ignores case, accents, punctuation and plurals", () => {
    expect(normalize("  Dumb-Bells! ")).toBe("dumb bell");
    expect(objectOf("SNEAKERS")).toBe(4);
    expect(objectOf("yöga  mat")).toBe(7);
    expect(normalize("Sandwiches")).toBe("sandwich");
  });

  it("finds partial words and survives a typo", () => {
    expect(objectOf("dumb")).toBe(0);
    expect(objectOf("water bot")).toBe(2);
    expect(objectOf("skip")).toBe(6);
    expect(objectOf("dumbell")).toBe(0);
    expect(objectOf("guitr")).toBe(3);
  });

  it("returns nothing for a blank query or a word that is not in the catalog, and ranks exact above partial", () => {
    expect(searchObjects(index, "")).toEqual([]);
    expect(searchObjects(index, "   ")).toEqual([]);
    expect(searchObjects(index, "zzzzzz")).toEqual([]);
    const m = searchObjects(index, "book");
    expect(m[0]!.entry.key).toBe("book");
    expect(m[0]!.score).toBe(100);
  });

  it("reports which word matched, so the row can say why", () => {
    expect(top("sneakers")!.term).toBe("sneakers");
    expect(top("Running shoe")!.term).toBe("Running shoe");
  });
});
