import { readFileSync } from "fs";
import { join } from "path";
import { __lookup, __templates, interpolate, keeperLines, t } from "@/copy";
import type { CopyKey } from "@/copy";
import { angleToPoints, hpSegmentColor, splitShadow, type as typeStyles } from "@/theme";
import { clock, formatSkr, formatUsd, shortDuration } from "@/lib/format";

const root = join(__dirname, "..", "..");

describe("copy", () => {
  it("every template reproduces design/copy.json exactly with its sample values", () => {
    for (const [key, tpl] of Object.entries(__templates)) {
      if (key === "$meta" || !tpl) continue;
      expect(interpolate(tpl.template, tpl.sample)).toBe(__lookup(key));
    }
  });
  it("t() reads screen keys whose ids contain · and +", () => {
    expect(t("screens.C7·no.pin.0" as CopyKey)).toBeTruthy();
    expect(t("screens.D2.b1.text")).toBe("9h 18m left today · first miss −143 SKR");
    expect(t("screens.D2.b1.text", { timeLeft: "3h 2m", cost: "500" })).toBe("3h 2m left today · first miss −500 SKR");
  });
  it("interpolates placeholders that copy.json already has", () => {
    expect(t("common.hpOf", { hp: 70 })).toBe("70 / 100");
    expect(t("common.tabs.today")).toBe("Today");
    expect(t("common.lengths.1")).toBe("7 days");
  });
  it("owner-approved additions resolve", () => {
    expect(t("additions.waiting.startsTonight")).toBe("Starts tonight at midnight");
    expect(t("additions.rematch.winBackHalf")).toBe("Win back half of what you had left.");
  });
  it("throws on an unknown key in development", () => {
    expect(() => t("screens.ZZ.nope" as CopyKey)).toThrow("Missing copy key");
  });
  it("Keeper lines come from copy.keeper.byScreen", () => {
    expect(keeperLines("A1")[0]?.mood).toBe("smug");
  });
});

describe("theme", () => {
  it("tokens.gen.ts is up to date with design/tokens.json", () => {
    const { renderTokens } = require("../../scripts/gen-theme.js");
    const json = JSON.parse(readFileSync(join(root, "..", "design", "tokens.json"), "utf8"));
    expect(readFileSync(join(root, "src", "theme", "tokens.gen.ts"), "utf8")).toBe(renderTokens(json));
  });
  it("icons.gen.json has every icon the sources name (pnpm icons:gen also cuts the font)", () => {
    const { usedIcons } = require("../../scripts/gen-icons.js");
    expect(JSON.parse(readFileSync(join(root, "src", "components", "primitives", "icons.gen.json"), "utf8"))).toEqual(usedIcons());
  });
  it("maps type tokens to loaded fonts", () => {
    expect(typeStyles.title).toMatchObject({ fontFamily: "Geist_600SemiBold", fontSize: 30, lineHeight: 33, letterSpacing: -1.1 });
    expect(typeStyles.monoLabel).toMatchObject({ fontFamily: "GeistMono_600SemiBold", textTransform: "uppercase", color: "#808080" });
    expect(typeStyles.display.fontVariant).toEqual(["tabular-nums"]);
  });
  it("converts CSS gradient angles", () => {
    expect(angleToPoints(180)).toEqual({ start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } });
    expect(angleToPoints(90)).toEqual({ start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } });
  });
  it("splits shadows into outer and inset layers", () => {
    expect(splitShadow("inset 0 0 0 1px rgba(255,255,255,0.08), 0 24px 40px rgba(0,0,0,0.45)")).toEqual({
      inset: "inset 0 0 0 1px rgba(255,255,255,0.08)", outer: "0 24px 40px rgba(0,0,0,0.45)",
    });
  });
  it("colours HP segments per DESIGN.md §2.7", () => {
    expect(hpSegmentColor(0, 100, "#2E2E2E")).toBe("rgb(94,234,212)");
    expect(hpSegmentColor(19, 100, "#2E2E2E")).toBe("rgb(197,242,92)");
    expect(hpSegmentColor(0, 40, "#2E2E2E")).toBe("#FB923C");
    expect(hpSegmentColor(0, 20, "#2E2E2E")).toBe("#F87171");
    expect(hpSegmentColor(18, 90, "#2E2E2E")).toBe("#2E2E2E");
  });
});

describe("format", () => {
  it("formats SKR at the edge", () => {
    expect(formatSkr(1_043_000_000n)).toBe("1,043");
    expect(formatSkr(779_166_667n)).toBe("779.17");
    expect(formatSkr(-1_000_000_000n)).toBe("−1,000");
    expect(formatSkr(186_000_000n, { sign: true })).toBe("+186");
    expect(formatSkr(1_468_750_000n, { dp: 0 })).toBe("1,469");
  });
  it("formats USD and time", () => {
    expect(formatUsd(1_000_000_000n, 0.01)).toBe("≈ $10");
    expect(clock(33522)).toBe("09:18:42");
    expect(shortDuration(33522)).toBe("9h 18m");
    expect(shortDuration(6 * 86400 + 23 * 3600 + 120)).toBe("6d 23h");
  });
  it("groups bigint amounts without Intl (Hermes' NumberFormat throws on BigInt)", () => {
    const real = Intl.NumberFormat;
    // Hermes behaviour: format(bigint) throws "Cannot convert BigInt to number".
    Intl.NumberFormat = function () { return { format: (v: unknown) => { if (typeof v === "bigint") throw new TypeError("Cannot convert BigInt to number"); return String(v); } }; } as unknown as typeof Intl.NumberFormat;
    try {
      jest.isolateModules(() => {
        const f = require("@/lib/format") as typeof import("@/lib/format");
        expect(f.formatSkr(1_234_567_000_000n)).toBe("1,234,567");
        expect(f.formatSkr(1_468_750_000n)).toBe("1,468.75");
      });
    } finally {
      Intl.NumberFormat = real;
    }
  });
});
