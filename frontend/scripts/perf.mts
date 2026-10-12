// Release-build performance numbers (fidelity pass): cold start, and frame stats for tab switches,
// a list scroll and a push/pop transition.
//   node scripts/perf.mts <app-release.apk> [--out artifacts/perf/<name>.json]
// Any release APK: the run picks Demo on A1 (D-80), so it reaches the tabs without a wallet app or network:
//   ./gradlew assembleRelease   (in frontend/android)
// Uses `am start -W` (TotalTime) and `dumpsys gfxinfo` (janky frames, frame-time percentiles).
// Also watches logcat for the whole run (audit P-6): Reanimated's "synchronouslyUpdateUIProps failed"
// lines (an animated-props update for a view that isn't mounted, logged with a stack trace on the UI
// thread), Skia's per-frame "updateAndRelease() failed" line (removed by D-92's patch; it comes back if
// the patch stops applying) and ANRs. The run fails when there's an ANR, more sync failures than
// --max-sync-failures (50) or more Skia lines than --max-skia-lines (0).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sdk = process.env.ANDROID_HOME ?? path.join(process.env.HOME!, "Library/Android/sdk");
const ADB = path.join(sdk, "platform-tools/adb");
const PKG = "app.kept.mobile";
const adb = (...a: string[]) => execFileSync(ADB, a, { encoding: "utf8", maxBuffer: 64 << 20 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const apk = process.argv[2]?.endsWith(".apk") ? process.argv[2] : undefined;
const outArg = process.argv.indexOf("--out");
const out = outArg > 0 ? path.resolve(process.argv[outArg + 1]!) : path.join(root, "artifacts/perf/run.json");
const maxArg = process.argv.indexOf("--max-sync-failures");
const MAX_SYNC_FAILURES = maxArg > 0 ? Number(process.argv[maxArg + 1]) : 50;
const skiaArg = process.argv.indexOf("--max-skia-lines");
const MAX_SKIA_LINES = skiaArg > 0 ? Number(process.argv[skiaArg + 1]) : 0;

/** Streams logcat (the ring buffer overflows at these volumes) and counts P-6 failures, Skia's line and ANRs. */
function watchLogcat() {
  spawnSync(ADB, ["logcat", "-c"]);
  const counts = { syncFailures: 0, skiaLines: 0, anrs: 0 };
  const proc = spawn(ADB, ["logcat", "-v", "brief", "Reanimated:W", "RNSkia:I", "ActivityManager:E", "*:S"]);
  let rest = "";
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk: string) => {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop() ?? "";
    for (const l of lines) {
      if (l.includes("synchronouslyUpdateUIProps failed")) counts.syncFailures++;
      else if (l.includes("updateAndRelease() failed")) counts.skiaLines++;
      else if (l.includes(`ANR in ${PKG}`)) counts.anrs++;
    }
  });
  return { counts, stop: () => proc.kill() };
}

interface Node { text: string; desc: string; x: number; y: number }
function dump(): Node[] {
  spawnSync(ADB, ["shell", "rm", "-f", "/sdcard/kept-ui.xml"]);
  spawnSync(ADB, ["shell", "uiautomator", "dump", "/sdcard/kept-ui.xml"]);
  const xml = spawnSync(ADB, ["shell", "cat", "/sdcard/kept-ui.xml"], { encoding: "utf8", maxBuffer: 64 << 20 }).stdout ?? "";
  return [...xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)]
    .map(([, text, desc, x1, y1, x2, y2]) => ({ text: text!, desc: desc!, x: (Number(x1) + Number(x2)) / 2, y: (Number(y1) + Number(y2)) / 2 }));
}
/**
 * Tap by text; release builds run ambient loops, so uiautomator often never goes idle and finds nothing.
 * `at` is the position on the 1080×2400 emulator (px); when given it's tapped directly.
 */
/** KEPT is the app in front. Taps and Back go through `input`, so a missed tap never lands on the launcher. */
const appOnTop = () => /(topResumedActivity|mResumedActivity)[^\n]*app\.kept\.mobile/.test(adb("shell", "dumpsys", "activity", "activities"));
class NotInFront extends Error {}
function input(...a: string[]) {
  if (!appOnTop()) throw new NotInFront("KEPT is not in front: stopping instead of tapping another app");
  adb("shell", "input", ...a);
}

/**
 * Where a control is on screen, by its text or label (top-anchored controls move with the status bar height).
 * One uiautomator dump waits ~10 s for an idle that never comes while loops play, so allow several.
 */
async function locate(q: string, timeoutMs = 45000): Promise<[number, number]> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const n = dump().find((d) => d.text === q || d.desc === q || d.desc.startsWith(`${q},`));
    if (n) return [Math.round(n.x), Math.round(n.y)];
    if (Date.now() > end) throw new NotInFront(`not found on screen: ${q}`);
    await sleep(500);
  }
}

/**
 * Where the header's bell is, from the status bar height and screen density: its centre is 54 dp below the
 * status bar and 38 dp from the right edge (AppHeader: screen padding 20, bell 36). For when Today's
 * once-a-second countdown keeps uiautomator from ever finding the screen idle, so `locate` can't read it.
 */
function bellFromInsets(): [number, number] {
  const top = Number(adb("shell", "dumpsys", "window").match(/type=statusBars frame=\[0,0\]\[\d+,(\d+)\]/)?.[1] ?? 63);
  const dp = Number(adb("shell", "wm", "density").match(/(\d+)\s*$/m)?.[1] ?? 420) / 160;
  const w = Number(adb("shell", "wm", "size").match(/(\d+)x\d+/)![1]);
  return [Math.round(w - 38 * dp), Math.round(top + 54 * dp)];
}

async function tap(q: string, at?: [number, number], timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    // uiautomator dumps can block for many seconds in release (never idle): with a known spot, skip them.
    if (at) { input("tap", String(at[0]), String(at[1])); return; }
    const n = dump().find((d) => d.text === q || d.desc === q || d.desc.startsWith(`${q},`) || d.text.split("&#10;").includes(q));
    if (n) { input("tap", String(Math.round(n.x)), String(Math.round(n.y))); return; }
    if (Date.now() > end) throw new Error(`not found: ${q}`);
    await sleep(500);
  }
}

function frameStats() {
  const g = adb("shell", "dumpsys", "gfxinfo", PKG);
  const num = (re: RegExp) => Number(g.match(re)?.[1] ?? NaN);
  return {
    frames: num(/Total frames rendered: (\d+)/),
    janky: num(/Janky frames: (\d+)/),
    jankyPct: num(/Janky frames: \d+ \(([\d.]+)%\)/),
    p50: num(/50th percentile: (\d+)ms/),
    p90: num(/90th percentile: (\d+)ms/),
    p95: num(/95th percentile: (\d+)ms/),
    p99: num(/99th percentile: (\d+)ms/),
    // Why frames were late: the app's UI thread (layout, JS-driven mounts) vs drawing on the render thread / GPU.
    slowUi: num(/Number Slow UI thread: (\d+)/),
    slowDraw: num(/Number Slow issue draw commands: (\d+)/),
    slowUpload: num(/Number Slow bitmap uploads: (\d+)/),
  };
}

const TAB_NAMES = ["Today", "Oaths", "Bounties", "Profile"];
/** Centre of tab i while tab `active` is open: bar 20…(W−96) dp, padding 6, gap 2, active flex 1.7 (2.625 px/dp). */
function tabAt(i: number, active: number): [number, number] {
  const dp = 2.625, w = 1080 / dp, inner = w - 20 - 96 - 12 - 6, unit = inner / 4.7;
  let x = 20 + 6;
  for (let k = 0; k < i; k++) x += (k === active ? 1.7 : 1) * unit + 2;
  x += ((i === active ? 1.7 : 1) * unit) / 2;
  return [Math.round(x * dp), 2208];
}

let phaseCounts: { syncFailures: number } | null = null;
/** Sync-props failures since the last call (per phase). */
let lastSync = 0;
function syncSince(): number { const n = phaseCounts ? phaseCounts.syncFailures - lastSync : 0; lastSync += n; return n; }

/** A screen at rest for `ms`: frame stats plus frames per second (did it keep up with the display?). */
async function idle(name: string, ms = 6000) {
  const s = await measure(name, () => sleep(ms));
  const fps = Math.round((s.frames / (ms / 1000)) * 10) / 10;
  console.log("".padEnd(16), `fps ${fps}`);
  return { ...s, fps };
}

async function measure(name: string, act: () => Promise<void>) {
  adb("shell", "dumpsys", "gfxinfo", PKG, "reset");
  syncSince();
  await act();
  const s = { ...frameStats(), syncFailures: syncSince() };
  console.log(name.padEnd(16), JSON.stringify(s));
  return s;
}

async function main() {
  if (apk) adb("install", "-r", "-d", apk);
  const log = watchLogcat();
  phaseCounts = log.counts;
  const W = Number(adb("shell", "wm", "size").match(/(\d+)x(\d+)/)![1]);
  const H = Number(adb("shell", "wm", "size").match(/(\d+)x(\d+)/)![2]);
  for (const k of ["window_animation_scale", "transition_animation_scale", "animator_duration_scale"]) adb("shell", "settings", "put", "global", k, "1");
  // Cold start ×3 on a cleared app.
  adb("shell", "pm", "clear", PKG);
  const cold: number[] = [];
  for (let i = 0; i < 3; i++) {
    adb("shell", "am", "force-stop", PKG);
    await sleep(1500);
    const r = adb("shell", "am", "start", "-W", "-n", `${PKG}/.MainActivity`);
    cold.push(Number(r.match(/TotalTime: (\d+)/)?.[1] ?? NaN));
    await sleep(3500);
  }
  console.log("cold start (ms)", cold, "sync-props failures", syncSince());
  // The splash (A0): the Check-K draws in over the first ~1.1 s of a launch.
  adb("shell", "am", "force-stop", PKG);
  await sleep(1500);
  adb("shell", "am", "start", "-W", "-n", `${PKG}/.MainActivity`); // returns at the first frame (A0)
  const splash = await measure("splash", () => sleep(1600));
  // A1 while its ambient loops play (beam, orbs, floating chips: the first ~10 s, D-84), then at rest:
  // the difference is what the loops cost.
  await sleep(1400);
  const a1Entering = await idle("A1 entering", 5000);
  // A1 at rest: the Keeper's idle (the ambient loops have run out by now, D-84).
  await sleep(5000);
  const a1Idle = await idle("A1 at rest");
  // Onboard in Demo: A1 → A1·m (Try the demo) → A4 → Today.
  await tap("Get started", [540, 2046]);
  await sleep(2500);
  await tap("Try the demo");
  await sleep(2500);
  await tap("Looks like me", [540, 2081]);
  await sleep(1500);
  console.log("onboarding       sync-props failures", syncSince());
  // Today while its loops play (orbs, the + glow, card breath: the first ~10 s after focus), then at rest.
  const todayEntering = await idle("Today entering", 5000);
  await sleep(4000);
  const todayIdle = await idle("Today at rest");
  let active = 0;
  const tab = async (i: number) => { await tap(TAB_NAMES[i]!, tabAt(i, active)); active = i; };
  const tabs = await measure("tab switches", async () => {
    for (const i of [1, 2, 3, 0, 1, 2, 3, 0]) { await tab(i); await sleep(900); }
  });
  await tab(2);
  await sleep(2500);
  const scroll = await measure("Bounties scroll", async () => {
    for (let i = 0; i < 4; i++) { input("swipe", String(W / 2), String(H * 0.8), String(W / 2), String(H * 0.3), "250"); await sleep(700); }
    for (let i = 0; i < 4; i++) { input("swipe", String(W / 2), String(H * 0.3), String(W / 2), String(H * 0.8), "250"); await sleep(700); }
  });
  await tab(0);
  await sleep(2000);
  // The bell, found by its label: Inbox always opens over Today, so the Back after it can't leave the app.
  const bell = await locate("Inbox", 15000).catch(() => bellFromInsets());
  const push = await measure("push / back ×4", async () => {
    for (let i = 0; i < 4; i++) {
      input("tap", String(bell[0]), String(bell[1]));
      await sleep(1500);
      input("keyevent", "KEYCODE_BACK");
      await sleep(1500);
    }
  });
  // Embers: D3 (a broken Oath, Guitar Days in the Oaths tab) plays them on entry.
  await tab(1);
  await sleep(2500);
  const guitar = await locate("Guitar Days");
  input("tap", String(guitar[0]), String(guitar[1]));
  await sleep(600);
  const embers = await idle("embers (D3)", 5000);
  input("keyevent", "KEYCODE_BACK");
  await sleep(1500);
  log.stop();
  const { syncFailures, skiaLines, anrs } = log.counts;
  console.log("sync-props failures", syncFailures, "Skia log lines", skiaLines, "ANRs", anrs);
  const refreshHz = Number(adb("shell", "dumpsys", "display").match(/renderFrameRate ([\d.]+)/)?.[1] ?? NaN);
  const device = adb("shell", "getprop", "ro.product.model").trim();
  const res = { apk, device, refreshHz, date: new Date().toISOString(), coldStartMs: cold, splash, a1Entering, a1Idle, todayEntering, todayIdle, tabs, scroll, push, embers, syncFailures, skiaLines, anrs };
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(`wrote ${out}`);
  if (anrs > 0 || syncFailures > MAX_SYNC_FAILURES || skiaLines > MAX_SKIA_LINES) {
    console.error(`FAIL: ${anrs} ANR(s), ${syncFailures} sync-props failures (max ${MAX_SYNC_FAILURES}; FIDELITY_AUDIT.md › P-6), ${skiaLines} Skia log lines (max ${MAX_SKIA_LINES}; D-92)`);
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error(`FAIL: ${e instanceof Error ? e.message : String(e)}`);
  // What was on screen when it stopped, for the report.
  try {
    const shot = out.replace(/\.json$/, "-fail.png");
    writeFileSync(shot, execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 }));
    console.error(`  screen: ${shot}`);
    console.error(`  front: ${adb("shell", "dumpsys", "activity", "activities").match(/topResumedActivity=[^\n]*/)?.[0] ?? "?"}`);
  } catch { /* the report is best effort */ }
  process.exit(1);
});
