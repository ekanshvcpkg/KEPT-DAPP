// Drives the dev build with adb to walk design/flows.md's happy paths (Phase 4.5).
//   node scripts/drive.mts [flowName…]
// Each step taps an element by its visible text or accessibility label (uiautomator), or types, then
// checks which screen is on top by a text that only that screen shows. Screens are checked by copy,
// so a wrong destination fails the step. Shots of every step go to artifacts/flows/<flow>/.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sdk = process.env.ANDROID_HOME ?? path.join(process.env.HOME!, "Library/Android/sdk");
const ADB = path.join(sdk, "platform-tools/adb");
const PKG = "app.kept.mobile";
const adb = (...a: string[]) => execFileSync(ADB, a, { encoding: "utf8", maxBuffer: 64 << 20 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Node { text: string; desc: string; cls: string; x: number; y: number }
function dump(): Node[] {
  // A failed dump ("could not get idle state": camera preview, looping FX) leaves the old file, so
  // delete it first and treat a missing file as nothing on screen yet.
  spawnSync(ADB, ["shell", "rm", "-f", "/sdcard/kept-ui.xml"]);
  spawnSync(ADB, ["shell", "uiautomator", "dump", "/sdcard/kept-ui.xml"], { timeout: 5000 });
  const r = spawnSync(ADB, ["shell", "cat", "/sdcard/kept-ui.xml"], { encoding: "utf8", maxBuffer: 64 << 20, timeout: 3000 });
  const xml = r.status === 0 ? r.stdout : "";
  const out: Node[] = [];
  for (const m of xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?class="([^"]*)"[^>]*?content-desc="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)) {
    const [, text, cls, desc, x1, y1, x2, y2] = m;
    out.push({ text: unescape(text!), desc: unescape(desc!), cls: cls!, x: (Number(x1) + Number(x2)) / 2, y: (Number(y1) + Number(y2)) / 2 });
  }
  return out;
}
const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#10;/g, "\n");
/** `field:` taps the first text field (EditText). */
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const matches = (n: Node, q: string) => (q === "field:" ? n.cls === "android.widget.EditText" : false) || n.text.split("\n").includes(q) || n.text === q || n.desc === q || n.desc.startsWith(`${q},`) || normalize(n.text).includes(normalize(q));

async function find(q: string, timeoutMs = 20000): Promise<Node> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    // Prefer a labelled (pressable) element over plain text with the same words (W3: title "Swap" vs button).
    let tree = dump();
    // React Native can keep the device busy with ambient Reanimated loops. A second dump often succeeds
    // after uiautomator's first idle-state wait times out, so retry once before waiting for the next poll.
    if (!tree.length) tree = dump();
    const nodes = tree.filter((n) => matches(n, q));
    const hit = nodes.find((n) => n.desc === q) ?? nodes[0];
    if (hit) return hit;
    if (Date.now() > end) throw new Error(`not found: "${q}"`);
    await sleep(500);
  }
}

type Step = { tapAt: [number, number] } | { tap: string } | { type: string } | { see: string; timeout?: number } | { back: true } | { link: string } | { wait: number } | { shell: string[] };
const tap = (q: string): Step => ({ tap: q });
const see = (q: string, timeout?: number): Step => (timeout ? { see: q, timeout } : { see: q });
const link = (url: string): Step => ({ link: url });

const DEV = (id: string, extra = "") => `kept://dev/open/${encodeURIComponent(id)}?demo=1&quiet=1&still=1${extra}`;

/**
 * The shutter, by position: a live camera preview never lets uiautomator go idle, so camera screens
 * can't be read (1080×2400 emulator; ProofCamera's shutter sits under the preview).
 */
const SHUTTER: Step = { tapAt: [540, 1702] };
const CAMERA_SETTLE: Step = { wait: 3500 };

/** design/flows.md › Happy paths, each step checked by copy unique to the screen it should land on. */
export const FLOWS: Record<string, Step[]> = {
  firstLaunch: [link(DEV("A1", "&scenario=fresh")), see("Bet your friends\nyou'll do it."), tap("Get started"), see("How do you want to start?"), tap("Try the demo"),
    see("Pick a look."), tap("Looks like me"), see("Put something on the line.", 10000)],
  createGroup: [link(DEV("B3", "&scenario=fresh")), tap("Start an Oath"), see("Name your Oath"), tap("Next"), see("Add your habits"), tap("lift for 20 minutes"), see("Edit habit and proof"), tap("Dumbbell"), tap("Save habit"),
    see("Add your habits"), tap("Next"), see("How long?"), tap("Next"), see("Who's in, and\nwhat's on it?"), tap("Group"), tap("Next"), see("If the AI says no?"), tap("Next"), see("Read it like\na contract."),
    tap("Sign & stake"), { wait: 6000 }, { tapAt: [540, 1940] }, see("Bring your people."), see("Everyone stakes 0.05 SOL"), tap("Copy link"), see("Link copied")],
  createSolo: [link(DEV("C4")), tap("Solo"), tap("Next"), see("Read it like\na contract."), tap("Sign & stake"), see("Solo? Go to the Oath", 15000), tap("Solo? Go to the Oath"), see("Starts tonight at midnight")],
  join: [link(DEV("B3", "&scenario=fresh")), tap("New"), tap("Join with code"), see("Got an invite?"), tap("Enter an invite code"), tap("field:"), { type: "IRON-7K2Q" }, tap("Find Oath"),
    see("RIYA INVITED YOU"), tap("Join & stake 0.05 SOL"), see("Riya starts it", 15000)],
  joinBadCode: [link(DEV("E1", "&scenario=fresh")), tap("Enter an invite code"), tap("field:"), { type: "NOPE" }, tap("Find Oath"), see("That code doesn't exist.")],
  dailyProof: [link(DEV("B1", "&scenario=activeGroup")), tap("Prove next"), CAMERA_SETTLE, SHUTTER, see("Lift for 20 minutes is in.", 20000),
    tap("Prove next habit"), CAMERA_SETTLE, SHUTTER, see("Day 3 kept.", 20000), tap("Done"), see("Today", 8000)],
  proofFromPhoto1: [link(DEV("B4", "&scenario=deadlineClose")), tap("Prove now"), CAMERA_SETTLE, SHUTTER, see("Photo 1 is in.", 20000), tap("Take photo 2"), CAMERA_SETTLE,
    SHUTTER, see("Day 3 kept.", 20000)],
  reviewSomeone: [link(DEV("N1")), tap("Review photo"), see("Dev wants your vote."), tap("Approve"), see("OATH HP", 10000)],
  oathEnds: [link(DEV("L1", "&scenario=settledKept")), see("Iron Week, kept."), tap("Claim 1,107 SKR"), see("SKR ready to claim"), tap("Sign & claim"), see("Claimed.", 15000), tap("Done"), see("Today")],
  oathBreaks: [link(DEV("D3", "&scenario=broken")), see("The Oath is broken."), tap("Rematch · win back 716"), see("Win back 716 SKR."), tap("Join Rematch"), see("Stake again"),
    see("Anyone can start once 2 or more have joined.", 15000)],
  bounty: [link(DEV("H1")), see("CLOSING SOON"), tap("Northbound Run Club\n120,000 SKR · 7 days · free"), see("Run 5k every day\nfor 14 days."), tap("Join free"), see("You're in.", 15000)],
  createBounty: [link(DEV("K1")), tap("Next"), see("Fund the pool."), tap("Next"), see("Make it yours."), tap("Next"), see("Who can join?"), tap("Next"), see("Review and fund."),
    tap("Sign & fund"), see("Dawn Pages is live.", 15000), tap("Open stats"), see("Stats start after day 1.")],
  moneyIn: [link(DEV("B1")), tap("Wallet: 4,280 SKR"), see("SKR available · ≈ $42.80"), tap("Add SKR"), see("Add SKR."), tap("Swap SOL for SKR"), see("Swap SOL for SKR."), tap("Swap"),
    see("SKR added.", 15000), tap("Back to wallet"), see("BALANCES"), tap("Receive"), see("Your address.")],
  tabsAndChrome: [link(DEV("B1")), tap("Oaths"), see("ACTIVE · 2"), tap("Bounties"), see("Discover"), tap("Profile"), see("sam.skr"), tap("Settings"), see("NOTIFICATIONS"), { back: true },
    tap("Today"), tap("Inbox"), see("NEEDS YOU · 3"), { back: true }, tap("New"), see("Put something on the line."), tap("Close"), see("Today")],
};

async function run(name: string, steps: Step[]) {
  const dir = path.join(root, "artifacts/flows", name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let i = 0;
  for (const s of steps) {
    i++;
    const label = JSON.stringify(s);
    try {
      if ("link" in s) { adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `'${s.link}'`, PKG); await sleep(2500); }
      else if ("tapAt" in s) { adb("shell", "input", "tap", String(s.tapAt[0]), String(s.tapAt[1])); await sleep(900); }
      else if ("tap" in s) { const n = await find(s.tap); adb("shell", "input", "tap", String(n.x), String(n.y)); await sleep(900); }
      else if ("type" in s) { adb("shell", "input", "text", s.type); await sleep(500); }
      else if ("see" in s) await find(s.see, s.timeout);
      else if ("back" in s) { adb("shell", "input", "keyevent", "KEYCODE_BACK"); await sleep(900); }
      else if ("wait" in s) await sleep(s.wait);
      else if ("shell" in s) adb("shell", ...s.shell);
    } catch (e) {
      writeFileSync(path.join(dir, `${String(i).padStart(2, "0")}-FAIL.png`), execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 }));
      const seen = (() => { try { return dump().map((n) => n.desc || n.text).filter(Boolean); } catch { return []; } })();
      writeFileSync(path.join(dir, `${String(i).padStart(2, "0")}-FAIL.txt`), seen.join("\n"));
      console.log(`✗ ${name} step ${i} ${label}: ${(e as Error).message}`);
      return false;
    }
    if ("see" in s) writeFileSync(path.join(dir, `${String(i).padStart(2, "0")}.png`), execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 << 20 }));
  }
  console.log(`✓ ${name} (${steps.length} steps)`);
  return true;
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FLOWS);
let failed = 0;
for (const n of names) if (!(await run(n, FLOWS[n]!))) failed++;
console.log(`\n${names.length - failed}/${names.length} flows passed`);
process.exitCode = failed ? 1 : 0;
