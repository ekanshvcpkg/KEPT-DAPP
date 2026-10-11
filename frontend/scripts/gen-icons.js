// Generates the app's icon set: the Material Design Icons the code names (DESIGN.md §8), out of ~7,000.
// - src/components/primitives/icons.gen.json: name → codepoint, for every quoted string in the app's sources
//   (src, packages/config, design/copy.json) that is an MDI name. Extra matches are harmless.
// - assets/fonts/kept-icons.ttf: MaterialCommunityIcons.ttf cut to those glyphs (needs fontTools: pip install fonttools).
// Run after using a new icon: pnpm --filter @kept/mobile icons:gen
// IconName is typed from the JSON, so tsc rejects a name that isn't in it; foundation.test.ts fails if the JSON is stale.
const { execFileSync } = require("child_process");
const { readdirSync, readFileSync, statSync, writeFileSync } = require("fs");
const { join } = require("path");

const app = join(__dirname, "..");
const vendor = join(require.resolve("@expo/vector-icons/package.json"), "..", "build", "vendor", "react-native-vector-icons");
const OUT_JSON = join(app, "src", "components", "primitives", "icons.gen.json");
const OUT_FONT = join(app, "assets", "fonts", "kept-icons.ttf");
const SOURCES = [join(app, "src"), join(app, "..", "packages", "config", "src"), join(app, "..", "design", "copy.json")];

function files(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((f) => (f === "__tests__" || f === "icons.gen.json" ? [] : files(join(path, f))));
}

/**
 * What counts as source for icon names. The object picker's search data is words, not icon references: its aliases and
 * labels ("scale", "bed", "tent") would pull dozens of glyphs into the font that nothing draws.
 */
function text(f) {
  const raw = readFileSync(f, "utf8");
  if (f.endsWith(join("features", "objects", "catalog.ts"))) return "";
  if (f.endsWith(join("copy", "additions.json"))) {
    const { objects: _search, ...rest } = JSON.parse(raw);
    return JSON.stringify(rest);
  }
  return raw;
}

/** Every MDI name quoted in the sources, sorted, with its codepoint. */
function usedIcons() {
  const all = JSON.parse(readFileSync(join(vendor, "glyphmaps", "MaterialCommunityIcons.json"), "utf8"));
  const names = new Set();
  for (const f of SOURCES.flatMap(files).filter((f) => /\.(tsx?|json)$/.test(f))) {
    for (const m of text(f).matchAll(/["'`]([a-z0-9]+(?:-[a-z0-9]+)*)["'`]/g)) if (Object.hasOwn(all, m[1])) names.add(m[1]);
  }
  return Object.fromEntries([...names].sort().map((n) => [n, all[n]]));
}

if (require.main === module) {
  const icons = usedIcons();
  writeFileSync(OUT_JSON, JSON.stringify(icons, null, 2) + "\n");
  const unicodes = [...new Set(Object.values(icons))].map((c) => c.toString(16)).join(",");
  execFileSync("python3", ["-m", "fontTools.subset", join(vendor, "Fonts", "MaterialCommunityIcons.ttf"), `--unicodes=${unicodes}`, `--output-file=${OUT_FONT}`, "--no-hinting", "--desubroutinize"], { stdio: "inherit" });
  console.log(`${Object.keys(icons).length} icons → ${OUT_FONT} (${statSync(OUT_FONT).size} bytes)`);
}

module.exports = { usedIcons };
