// What "back" goes to (D-86). Every forward navigation goes through planStack, which rewrites the root
// stack so back never walks into a finished flow:
// - Passing screens (signing, checking, outcomes, moments, sheets) are never left behind the next screen.
// - When a flow reaches an outcome, its steps go too: after "Oath created", back is not C6 … C1.
//   Outcomes that offer "try again" (rejected, failed, invalid code…) keep the steps, so the retry is there.
// - Flows that make something new (create, join, Rematch, a Bounty) land on home, not on where they started
//   (a broken Oath, an error, someone's profile): that context is stale once the new thing exists.
// - A screen that's already in the stack (same route, same id) is gone back to, not opened twice.
// Tab destinations (B1–B4, D0, H1, I1) are handled by the caller: back to the existing home, nothing above.
import type { Params } from "./nav";
import { designIdOf, presentation, routeName } from "./routes";
import type { DesignId } from "./routes";

export interface StackRoute { name: string; key?: string; params?: object | undefined; state?: unknown }

/** Wizard and flow steps: dropped once their flow reaches an outcome. */
const STEPS = new Set<string>([
  "C1", "C2", "C3", "C4", "C5", "C6", "E1", "E1·scan", "E1·code", "E2", "F1·perm", "F1", "F4", "R1", "J1",
  "K1", "K2", "K3", "K4", "K5", "W3", "D1", "D1·m", "R3", "H2", "G1",
]);
/** Never kept behind the next screen (besides signing, sheets and moments, see routes.ts). */
const PASSING = new Set<string>([
  "F2", "F4·chk", "G2", "C8",
  "A2·e", "C7·no", "C7·fail", "J1·f", "F2a", "F2b", "F2c", "F3", "F4a", "F4a·g", "G3", "G3·no", "W3·ok",
  "E3·code", "E3·late", "E3·in", "E3·elig", "E3·skr", "R4", "R4·lost",
]);
/** Outcomes that keep their flow's steps: the user tries again from them. */
const RETRY = new Set<string>([
  "A2·e", "C7·no", "C7·fail", "J1·f", "F2a", "F2b", "F2c", "M2", "M3", "M4",
  "E3·code", "E3·late", "E3·in", "E3·elig", "E3·skr",
]);
/** Signing screens whose success makes something new: their outcome lands on home. */
const FRESH = new Set<string>(["C7", "R2", "E2·s", "K5·p"]);

const idOf = (r: StackRoute) => designIdOf(r.name);
export function isPassing(id: string | undefined): boolean {
  if (!id) return false;
  const p = presentation(id);
  return PASSING.has(id) || p === "signing" || p === "sheet" || p === "moment";
}
const sameScreen = (r: StackRoute, name: string, params: Params | undefined) => {
  if (r.name !== name) return false;
  const want = params?.id;
  const have = (r.params as Params | undefined)?.id;
  return want === undefined || want === have;
};

/**
 * The root stack after going to `dest` from the top of `routes`. `replace` drops the current screen
 * whatever it is (a done action on a normal screen: joined a Bounty from H2). Routes kept keep their key
 * and nested state, so those screens stay mounted.
 */
export function planStack(routes: StackRoute[], dest: DesignId, params: Params | undefined, replace = false): StackRoute[] {
  const out = [...routes];
  const top = out.length ? idOf(out[out.length - 1]!) : undefined;
  const leaving = replace || isPassing(top);
  const retry = RETRY.has(dest) || presentation(dest) === "sheet" || presentation(dest) === "signing";
  const name = routeName(dest);
  const existing = (list: StackRoute[]) => list.map((x, i) => (sameScreen(x, name, params) ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
  if (leaving) {
    let freshStart = false;
    while (out.length > 1) {
      const id = idOf(out[out.length - 1]!);
      const first = out.length === routes.length;
      // Back to a step that's still there ("Back to terms" from a rejection) keeps the steps before it.
      if (!first && existing(out) >= 0) break;
      const drop = first || isPassing(id) || (!retry && !!id && STEPS.has(id));
      if (!drop) break;
      if (id && FRESH.has(id)) freshStart = true;
      out.pop();
    }
    // Something new was made: what's under it (the broken Oath, an error, a profile) is stale; home stays.
    if (freshStart && !retry) out.splice(out.findIndex((r) => r.name === "Tabs") + 1 || 1);
  }
  const at = existing(out);
  if (at >= 0) {
    const r = out[at]!;
    return [...out.slice(0, at), { ...r, params: { ...(r.params ?? {}), ...(params ?? {}) } }];
  }
  return [...out, { name, params }];
}
