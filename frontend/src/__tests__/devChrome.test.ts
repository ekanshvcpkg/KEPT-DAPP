// The Join code step in Demo, found on the Android emulator: the keyboard covered "Find Oath", the placeholder was nearly
// invisible, and the dev client's floating tools button sat on the header controls.
import { keyboardCover } from "@/lib/keyboard";
import { color } from "@/theme";

const { setFabDefault, KEY } = require("../../plugins/withDevMenuNoFab") as { setFabDefault(m: unknown, show?: boolean): any; KEY: string };

/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("keyboard cover", () => {
  it("counts the navigation bar the keyboard sits above (Android's height leaves it out)", () => {
    // Pixel-class emulator, measured: height 311.6, top edge at 587.8 of a 923.4 dp screen.
    expect(keyboardCover({ height: 311.6, screenY: 587.8 }, 923.4)).toBe(336);
  });
  it("is the reported height where the two agree, and never less than it", () => {
    expect(keyboardCover({ height: 300, screenY: 500 }, 800)).toBe(300);
    expect(keyboardCover({ height: 300, screenY: 520 }, 800)).toBe(300);
  });
});

describe("invite code placeholder", () => {
  it("is readable on the field (AA), and still dimmer than the typed text", () => {
    expect(contrast(color.text.secondary, color.surface[1])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.text.ghost, color.surface[1])).toBeLessThan(3);
    expect(contrast(color.text.primary, color.surface[1])).toBeGreaterThan(contrast(color.text.secondary, color.surface[1]));
  });
});

describe("dev client tools button", () => {
  it("is turned off by default through the manifest flag the dev menu reads", () => {
    const manifest = { manifest: { application: [{ $: { "android:name": ".MainApplication" } }] } };
    setFabDefault(manifest);
    const meta = manifest.manifest.application[0] as { "meta-data"?: { $: Record<string, string> }[] };
    expect(meta["meta-data"]).toContainEqual({ $: { "android:name": KEY, "android:value": "false" } });
    // Running it twice doesn't add a second entry.
    setFabDefault(manifest);
    expect(meta["meta-data"]!.filter((m) => m.$["android:name"] === KEY)).toHaveLength(1);
  });
});
