// The route table in design/flows.md plus the app's amendments (routes.amend.json, D-80), checked edge by
// edge against the app's route registry (routes.gen.json, which the navigator and the dev links are
// built from).
import { readFileSync } from "fs";
import path from "path";
import { ROUTES, presentation, routeName } from "@/app/routes";
import { target } from "@/app/nav";
import amend from "@/app/routes.amend.json";

interface Row { id: string; goesTo: string[]; enteredFrom: string[]; events: boolean }

const ids = new Set(ROUTES.map((r) => r.id as string));

function readTable(): Row[] {
  const md = readFileSync(path.join(__dirname, "../../../design/flows.md"), "utf8").split("\n");
  const start = md.findIndex((l) => l.startsWith("| Screen | Name | Goes to | Entered from |"));
  const rows: Row[] = [];
  for (const line of md.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    const [id, , goes, from] = line.split("|").slice(1, -1).map((c) => c.trim());
    const list = (c: string) => (c === "—" ? [] : c.split(",").map((x) => x.trim()));
    const fromList = list(from!).map((x) => x.split(" ")[0]!);
    rows.push({ id: id!, goesTo: list(goes!), enteredFrom: fromList.filter((x) => ids.has(x)), events: fromList.some((x) => !ids.has(x)) });
  }
  // App-only screens and edges (D-80).
  const edges = amend.edges as Record<string, string[]>;
  for (const r of rows) r.goesTo.push(...(edges[r.id] ?? []));
  for (const a of amend.screens) rows.push({ id: a.id, goesTo: a.to, enteredFrom: Object.keys(edges).filter((k) => edges[k]!.includes(a.id)), events: false });
  return rows;
}

const table = readTable();
const byId = new Map(table.map((r) => [r.id, r]));

describe("flows.md route table", () => {
  it("lists every design id (and app-only id) once", () => {
    expect(table.map((r) => r.id).sort()).toEqual([...ids].sort());
  });

  it.each(table.map((r) => [r.id, r] as const))("%s: every “Goes to” is wired", (id, row) => {
    const app = ROUTES.find((r) => r.id === id)!;
    expect([...app.to].sort()).toEqual([...row.goesTo].sort());
    for (const to of row.goesTo) {
      expect(ids.has(to)).toBe(true);
      // Resolves to a navigator route (tabs live inside "Tabs").
      const [name] = target(to as never);
      expect(name).toBe(presentation(to) === "tab" ? "Tabs" : routeName(to));
    }
  });

  it("every screen is reachable from launch or from the event that opens it", () => {
    const roots = table.filter((r) => r.events || r.enteredFrom.length === 0).map((r) => r.id);
    const seen = new Set(roots);
    const queue = [...roots];
    while (queue.length) {
      for (const to of byId.get(queue.shift()!)?.goesTo ?? []) if (!seen.has(to)) { seen.add(to); queue.push(to); }
    }
    expect([...ids].filter((id) => !seen.has(id))).toEqual([]);
  });

  it("A1·m (D-80) is a sheet over A1: Demo goes to A4, Live to A2", () => {
    expect(presentation("A1·m")).toBe("sheet");
    expect(byId.get("A1")!.goesTo).toEqual(expect.arrayContaining(["A2", "A1·m"]));
    expect([...byId.get("A1·m")!.goesTo].sort()).toEqual(["A2", "A4"]);
  });

  it("E1 is a choice (D-91): its steps E1·scan and E1·code reach E2 and every E3 state, and E3's ways back reach them", () => {
    expect(byId.get("E1")!.goesTo).toEqual(expect.arrayContaining(["E1·scan", "E1·code"]));
    const outcomes = ["E2", "E3·code", "E3·late", "E3·in", "E3·elig", "E3·skr"];
    for (const step of ["E1·scan", "E1·code"]) {
      expect(presentation(step)).toBe("flow");
      expect(byId.get(step)!.goesTo).toEqual(expect.arrayContaining(outcomes));
    }
    expect(byId.get("E1·scan")!.goesTo).toContain("E1·code");
    for (const e3 of ["E3·code", "E3·late", "E3·in", "E3·elig"]) expect(byId.get(e3)!.goesTo).toEqual(expect.arrayContaining(["E1·scan", "E1·code"]));
  });

  it("signing screens are transient: none lists itself or another signing screen as a way back", () => {
    for (const r of table.filter((x) => presentation(x.id) === "signing")) {
      expect(r.goesTo.filter((to) => presentation(to) === "signing" && to !== r.id)).toEqual([]);
    }
  });
});
