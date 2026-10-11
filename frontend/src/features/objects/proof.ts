// What a habit's proof photo is checked for. The local model (Gemma, on the phone) is open-vocabulary: it is
// asked "is a real <object> visible?", so any catalog entry can be a proof object, not just the program's eight.
// The identity of a proof object everywhere past C2 is its *text* (what the model is asked, and what the backend
// stores per habit and compares at /proof/verify): a dumbbell, running shoes, a kettlebell.
import { OBJECTS } from "@kept/config";
import { t } from "@/copy";
import type { CopyKey } from "@/copy";
import type { IconName } from "@/components/primitives";
import { CATALOG } from "./catalog";
import type { CatalogEntry, ObjectCategory } from "./catalog";

const BY_KEY = new Map<string, CatalogEntry>(CATALOG.map((e) => [e.key, e]));
export const catalogEntry = (key: string): CatalogEntry | undefined => BY_KEY.get(key);
export const validEntry = (key: unknown): key is string => typeof key === "string" && BY_KEY.has(key);

/** The entry's name as shown: "Kettlebell", "Running shoe". */
export const entryLabel = (key: string): string => t(`additions.objects.entry.${key}` as CopyKey);

/** What the model is asked to look for (and the backend stores): the program's text for its eight, else the label in lower case. */
export function proofTextOf(key: string): string | null {
  const e = BY_KEY.get(key);
  if (!e) return null;
  if (e.object !== null) return OBJECTS.find((o) => o.id === e.object)?.text ?? null;
  return entryLabel(key).trim().toLowerCase();
}

let byText: Map<string, string> | null = null;
/** The catalog entry whose proof text is `text`, if any (a habit stored by another client may name something else). */
export function entryKeyOfText(text: string): string | undefined {
  byText ??= new Map(CATALOG.flatMap((e) => { const p = proofTextOf(e.key); return p ? [[p, e.key] as [string, string]] : []; }));
  return byText.get(text.trim().toLowerCase());
}

/** The name to show for a stored proof text: the entry's label, or the text itself with a capital. */
export function objectNameOfText(text: string): string {
  const key = entryKeyOfText(text);
  return key ? entryLabel(key) : text.charAt(0).toUpperCase() + text.slice(1);
}

const CATEGORY_ICON: Record<ObjectCategory, IconName> = {
  strength: "dumbbell", cardio: "shoe-sneaker", sport: "target", mind_body: "yoga", reading: "book-open-variant", study: "pencil-outline",
  music: "guitar-acoustic", health: "bottle-soda-outline", plants: "sprout", home: "iron", creative: "palette", kitchen: "cup",
  outdoors: "water-outline", sleep: "weather-night", tech: "phone",
};
/** The icon for an entry: the program's own icon for its eight, else its category's. */
export function entryIcon(key: string): IconName {
  const e = BY_KEY.get(key);
  if (!e) return "camera";
  const o = e.object !== null ? OBJECTS.find((x) => x.id === e.object) : undefined;
  return (o?.icon ?? CATEGORY_ICON[e.category]) as IconName;
}
export function objectIconOfText(text: string): IconName {
  const key = entryKeyOfText(text);
  return key ? entryIcon(key) : "camera";
}
