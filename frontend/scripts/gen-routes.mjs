// Generates src/app/routes.gen.json from design/flows.md › Route table (plus src/app/routes.amend.json):
// every screen id, its name and the screens it goes to. The navigator registers every id from it, and
// routes.test.ts checks the edges against flows.md. Run after design/flows.md changes: pnpm --filter @kept/mobile routes:gen
import { readFileSync, writeFileSync } from "node:fs";

/** routes.amend.json: app-only screens and edges (DECISIONS D-80), applied after the design's table. */
export function amendRoutes(rows, amend) {
  const out = rows.map((r) => ({ ...r, to: [...r.to, ...(amend.edges?.[r.id] ?? [])] }));
  for (const { after, ...screen } of amend.screens ?? []) out.splice(out.findIndex((r) => r.id === after) + 1, 0, screen);
  return out;
}

export function parseRouteTable(md) {
  const table = md.split("## Route table")[1]?.split("\n## ")[0];
  if (!table) throw new Error("flows.md has no '## Route table'");
  const rows = table.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Screen") && !l.startsWith("|---"));
  return rows.map((l) => {
    const [id, name, to] = l.split("|").slice(1, 4).map((c) => c.trim());
    return { id, name, to: to === "—" ? [] : to.split(",").map((s) => s.trim()).filter(Boolean) };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const md = readFileSync(new URL("../../design/flows.md", import.meta.url), "utf8");
  const out = new URL("../src/app/routes.gen.json", import.meta.url);
  const amend = JSON.parse(readFileSync(new URL("../src/app/routes.amend.json", import.meta.url), "utf8"));
  writeFileSync(out, JSON.stringify(amendRoutes(parseRouteTable(md), amend), null, 1) + "\n");
  console.log(`wrote ${out.pathname}`);
}
