// Screenshots every design screen from the running dev build (Phase 4.5).
//   node scripts/shoot.mts [--ids A0,B1,C7·no] [--settle 2200] [--out ../artifacts/screens] [--dump]
// --dump also saves each screen's accessibility tree (<id>.xml, uiautomator) for scripts/a11y.mts; turn the
// device's animations off first (Settings › Accessibility › Remove animations) or the dump can hang.
// Needs an emulator or phone on adb with the dev build installed and Metro running. For each id it
// opens kept://dev/open/<route>?…, waits for the screen to settle, saves <id>.png and records the
// logcat errors (JS console.error, red boxes, native crashes) in report.json next to them.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../..");
const arg = (name: string, d: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1]! : d; };
const out = path.resolve(arg("out", path.join(root, "artifacts/screens")));
const settle = Number(arg("settle", "3500"));
const PKG = "app.kept.mobile";
const DEV_CLIENT = "exp+kept://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082";
const sdk = process.env.ANDROID_HOME ?? path.join(process.env.HOME!, "Library/Android/sdk");
const ADB = path.join(sdk, "platform-tools/adb");

const routes: { id: string }[] = JSON.parse(readFileSync(path.join(here, "../src/app/routes.gen.json"), "utf8"));
const only = arg("ids", "");
const ids = only ? only.split(",") : routes.map((r) => r.id);
const routeName = (id: string) => (id === "+" ? "Plus" : id.replace(/·/g, "_"));

/** Pending screens: the mock never finishes their signature or check while held. */
const HOLD = new Set(["A0", "A2·s", "C7", "D1·go", "D1·xs", "E2·s", "R2", "J1·p", "K5·p", "W3·s", "F2", "F4·chk"]);

const adb = (...a: string[]) => execFileSync(ADB, a, { encoding: "utf8", maxBuffer: 64 << 20 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pidOf = () => spawnSync(ADB, ["shell", "pidof", PKG], { encoding: "utf8" }).stdout.trim();
/** The app (not the dev client's launcher) is on top. */
const appOnTop = () => /topResumedActivity=.*app\.kept\.mobile\/\.MainActivity/.test(adb("shell", "dumpsys", "activity", "activities"));

function errorsSince(): string[] {
  const log = adb("logcat", "-d", "-v", "brief", "ReactNativeJS:E", "ReactNative:E", "AndroidRuntime:E", "*:S");
  return log.split("\n").filter((l) => /^[EF]\//.test(l)).map((l) => l.trim());
}

async function main() {
  mkdirSync(out, { recursive: true });
  const report: Record<string, { errors: string[]; crashed: boolean }> = {};
  for (const id of ids) {
    // Camera permission: revoked for F1·perm, granted for everything else (either kills the app).
    const perm = id === "F1·perm" ? "revoke" : "grant";
    spawnSync(ADB, ["shell", "pm", perm, PKG, "android.permission.CAMERA"]);
    if (!pidOf() || !appOnTop()) {
      // The dev client needs the bundle URL first; a kept:// link alone opens its launcher.
      adb("reverse", "tcp:8082", "tcp:8082");
      adb("reverse", "tcp:3000", "tcp:3000");
      adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `'${DEV_CLIENT}'`, PKG);
      await sleep(12000);
    }
    adb("logcat", "-c");
    const url = `kept://dev/open/${encodeURIComponent(routeName(id))}?mode=mock&quiet=1${HOLD.has(id) ? "&hold=1" : ""}`;
    adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `'${url}'`, PKG);
    await sleep(settle);
    const png = execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 });
    writeFileSync(path.join(out, `${id}.png`), png);
    if (process.argv.includes("--dump")) {
      spawnSync(ADB, ["shell", "rm", "-f", "/sdcard/kept-a11y.xml"]); // a failed dump must not leave the last screen's
      spawnSync(ADB, ["shell", "uiautomator", "dump", "/sdcard/kept-a11y.xml"], { timeout: 20000 });
      const xml = spawnSync(ADB, ["exec-out", "cat", "/sdcard/kept-a11y.xml"], { encoding: "utf8", maxBuffer: 64 << 20 }).stdout;
      writeFileSync(path.join(out, `${id}.xml`), xml);
    }
    const errors = errorsSince();
    const crashed = !pidOf();
    report[id] = { errors, crashed };
    console.log(`${id.padEnd(8)} ${crashed ? "CRASHED " : ""}${errors.length ? `${errors.length} error(s)` : "ok"}`);
  }
  const file = path.join(out, "report.json");
  const prev = (() => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return {}; } })();
  writeFileSync(file, JSON.stringify({ ...prev, ...report }, null, 1));
  const bad = Object.entries(report).filter(([, r]) => r.errors.length || r.crashed);
  console.log(`\n${ids.length} screens, ${bad.length} with errors${bad.length ? `: ${bad.map(([k]) => k).join(" ")}` : ""}`);
}

void main();
