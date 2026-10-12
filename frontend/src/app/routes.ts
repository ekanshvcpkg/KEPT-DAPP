// Every screen id from design/flows.md (plus routes.amend.json, D-80), how it is presented, and its ASCII route name
// (docs/ARCHITECTURE.md §5: "C7·no" → "C7_no", "+" → "Plus").
import table from "./routes.gen.json";

export type DesignId = (typeof table)[number]["id"];
export interface RouteInfo { id: DesignId; name: string; to: DesignId[] }

export const ROUTES = table as unknown as RouteInfo[];

/** "C7·no" → "C7_no", "R·act" → "R_act", "+" → "Plus". */
export const routeName = (id: string): string => (id === "+" ? "Plus" : id.replace(/·/g, "_"));
const byName = new Map(ROUTES.map((r) => [routeName(r.id), r.id]));
export const designIdOf = (name: string): DesignId | undefined => byName.get(name);

export type Presentation = "tab" | "onboarding" | "sheet" | "moment" | "signing" | "modal" | "flow";

const TABS = ["B1", "D0", "H1", "I1"];
/** Today's other states are B1 itself (screens.md › B): going to one opens the Today tab. */
export const TAB_STATES: Partial<Record<string, string>> = { B2: "B1", B3: "B1", B4: "B1" };
const ONBOARDING = ["A0", "A1·i", "A1", "A2", "A2·s", "A2·e", "A3", "A3·no", "A4"];
/** A1·m is the app's mode picker (D-80, not in the design). */
const SHEETS = ["+", "B5", "D1·x", "M3", "M4", "W2", "A1·m"];
/** flows.md: fade, no back gesture until settled. */
const MOMENTS = ["L1", "L2", "L3", "L4", "L4·m", "L4·b", "L5", "L6", "J1·ok", "C7·ok", "K5·ok", "F5"];
/** Transient: replaced by their result screen, never left in the back stack. */
const SIGNING = ["A2·s", "C7", "D1·go", "D1·xs", "E2·s", "R2", "J1·p", "K5·p", "W3·s"];
/** Full-screen with a close button. */
const MODALS = ["M2", "M1"];

export function presentation(id: string): Presentation {
  if (TABS.includes(id) || TAB_STATES[id]) return "tab";
  if (SIGNING.includes(id)) return "signing";
  if (ONBOARDING.includes(id)) return "onboarding";
  if (SHEETS.includes(id)) return "sheet";
  if (MOMENTS.includes(id)) return "moment";
  if (MODALS.includes(id)) return "modal";
  return "flow";
}
