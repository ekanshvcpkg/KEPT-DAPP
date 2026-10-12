// Touch targets and labels on a real device, from `node scripts/shoot.mts --dump` (uiautomator trees).
//   node scripts/a11y.mts [--in ../artifacts/a11y]
// Lists every clickable view under 48 × 48 dp and every clickable with nothing for TalkBack to read.
// uiautomator reports the view's own bounds, not React Native's hitSlop, so a small target is listed with
// its size; PressScale's `hit` extends it to 48 dp (src/components/primitives/motion.tsx), which the Jest
// audit (src/__tests__/a11y.test.tsx) checks.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name: string, d: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1]! : d; };
const dir = path.resolve(arg("in", path.join(here, "../../artifacts/a11y")));
const sdk = process.env.ANDROID_HOME ?? path.join(process.env.HOME!, "Library/Android/sdk");
const density = Number(execFileSync(path.join(sdk, "platform-tools/adb"), ["shell", "wm", "density"], { encoding: "utf8" }).match(/(\d+)\s*$/m)![1]) / 160;

const MIN = 48;
const rows: string[] = [];
let clickables = 0;
interface Node { a: Record<string, string>; kids: Node[] }
/** uiautomator XML → a tree (the format is flat enough for a tag scanner). */
function parse(xml: string): Node {
  const root: Node = { a: {}, kids: [] };
  const stack = [root];
  for (const m of xml.matchAll(/<(\/?)node\b([^>]*?)(\/?)>/g)) {
    if (m[1]) { stack.pop(); continue; }
    const n: Node = { a: Object.fromEntries([...m[2]!.matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1]!, x[2]!])), kids: [] };
    stack[stack.length - 1]!.kids.push(n);
    if (!m[3]) stack.push(n);
  }
  return root;
}
/** What TalkBack reads for a clickable: its label, or the text inside it. */
const spoken = (n: Node): string => n.a["content-desc"] || n.a.text || n.kids.map(spoken).join(" ").trim();

for (const f of readdirSync(dir).filter((x) => x.endsWith(".xml")).sort()) {
  const id = f.slice(0, -4);
  const walk = (n: Node) => {
    if (n.a.clickable === "true" && n.a.package === "app.kept.mobile") {
      clickables++;
      const [x1, y1, x2, y2] = (n.a.bounds ?? "").match(/\d+/g)!.map(Number);
      const w = Math.round((x2! - x1!) / density), h = Math.round((y2! - y1!) / density);
      const name = spoken(n);
      if (w < MIN || h < MIN) rows.push(`${id}\tsmall\t${w}×${h} dp\t${name}`);
      if (!name) rows.push(`${id}\tunnamed\t${w}×${h} dp\t(${n.a.class})`);
    }
    n.kids.forEach(walk);
  };
  walk(parse(readFileSync(path.join(dir, f), "utf8")));
}
const out = path.join(dir, "a11y-report.tsv");
writeFileSync(out, `screen\tissue\tsize\tname\n${rows.join("\n")}\n`);
console.log(`${clickables} clickables, ${rows.length} findings → ${out}`);
