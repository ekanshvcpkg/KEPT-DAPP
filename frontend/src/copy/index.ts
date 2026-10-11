// Typed access to every user-facing string. Source: design/copy.json (read-only) + owner-approved
// additions (additions.json). Data-bearing keys are interpolated through templates.json.
import copyJson from "../../../design/copy.json";
import additionsJson from "./additions.json";
import amendmentsJson from "./amendments.json";
import templatesJson from "./templates.json";

type Copy = typeof copyJson;
type Additions = typeof additionsJson;
export type ScreenId = keyof Copy["screens"];
type ScreenKeys<S extends ScreenId> = Exclude<keyof Copy["screens"][S], "_name"> & string;

/** Dot paths to string leaves of a nested object (arrays indexed by number). */
type Leaves<T, P extends string = ""> = T extends string
  ? P
  : T extends readonly (infer U)[]
    ? Leaves<U, `${P}.${number}`>
    : { [K in keyof T & string]: K extends "$meta" | "$source" ? never : Leaves<T[K], P extends "" ? K : `${P}.${K}`> }[keyof T & string];

export type ScreenCopyKey = { [S in ScreenId]: `screens.${S}.${ScreenKeys<S>}` }[ScreenId];
export type CopyKey =
  | ScreenCopyKey
  | `common.${Leaves<Copy["common"]>}`
  | `brandStamps.${keyof Copy["brandStamps"] & string}`
  | `toasts.${number}`
  | `additions.${Leaves<Additions>}`;

type Vars = Record<string, string | number>;

const SCREEN_IDS = Object.keys(copyJson.screens).sort((a, b) => b.length - a.length);
const TEMPLATES = templatesJson as unknown as Record<string, { template: string; sample: Record<string, string> } | undefined>;

/** Owner amendments to design strings (D-93); a key here wins over design/copy.json. */
const AMENDMENTS = amendmentsJson as Record<string, string>;

function lookup(key: string): string | undefined {
  const amended = AMENDMENTS[key];
  if (key !== "$meta" && typeof amended === "string") return amended;
  if (key.startsWith("screens.")) {
    const rest = key.slice("screens.".length);
    const id = SCREEN_IDS.find((s) => rest.startsWith(`${s}.`));
    if (!id) return undefined;
    const screen = (copyJson.screens as Record<string, Record<string, string>>)[id];
    return screen?.[rest.slice(id.length + 1)];
  }
  const [root, ...path] = key.split(".");
  const base: unknown = root === "additions" ? additionsJson : (copyJson as Record<string, unknown>)[root ?? ""];
  const v = path.reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), base);
  return typeof v === "string" ? v : undefined;
}

export function interpolate(s: string, vars: Vars): string {
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/**
 * Returns the string for `key`. With `vars`, a templated key (templates.json) is interpolated; keys whose
 * copy already contains `{placeholders}` (e.g. common.hpOf) are interpolated directly.
 * Throws in development for an unknown key (the type system should make that impossible).
 */
export function t(key: CopyKey, vars?: Vars): string {
  const raw = lookup(key);
  if (raw === undefined) {
    if (__DEV__) throw new Error(`Missing copy key: ${key}`);
    return "";
  }
  if (!vars) return raw;
  const tpl = TEMPLATES[key];
  return interpolate(tpl ? tpl.template : raw, vars);
}

/** The Keeper's lines for a screen (copy.keeper.byScreen). */
export type KeeperMood = "neutral" | "smug" | "happy" | "wink" | "stern" | "soft" | "bored" | "side" | "shocked" | "shades";
export interface KeeperLine { mood: KeeperMood; line: string }
export function keeperLines(screen: ScreenId): KeeperLine[] {
  return ((copyJson.keeper.byScreen as Record<string, KeeperLine[] | undefined>)[screen] ?? []).slice();
}
export function keeperIdle(tab: keyof Copy["keeper"]["idle"]): KeeperLine {
  return copyJson.keeper.idle[tab] as KeeperLine;
}

/** Sample data from copy.json › sampleData (used by the mock API and the Gallery). */
export const sampleData = copyJson.sampleData;

/** Internal: exposed for the drift test. */
export const __templates = TEMPLATES;
export const __lookup = lookup;
export const __amendments = AMENDMENTS;
