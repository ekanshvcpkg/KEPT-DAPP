// Accessibility audit over every design screen (CLAUDE.md › Mobile code rules: labels, 48 dp targets).
// Each screen opens through the dev link the screenshot script uses, on the mock. On each one:
// - every button has a name TalkBack can read (its label, or its text);
// - every button with a fixed size reaches 48 × 48 dp with its hit slop.
// Buttons sized by their content can't be measured here; the device pass (scripts/a11y.mts) covers them.
import { act, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastHost } from "@/components/chrome";
import { queryClient } from "@/api/queries";
import { RootNavigator } from "@/app/RootNavigator";
import { navigationRef } from "@/app/nav";
import { ROUTES, routeName } from "@/app/routes";
import { openDevLinkWhenReady } from "@/dev/devLink";
import { metrics } from "@/theme";

const safe = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const MIN = metrics.minTouch;
/** What the queries return (RNTL 14 has its own instance type). */
interface ReactTestInstance { props: object; children: readonly (ReactTestInstance | string)[] }

function textOf(n: ReactTestInstance | string): string {
  if (typeof n === "string") return n;
  return n.children.map(textOf).join("");
}
function nameOf(n: ReactTestInstance): string {
  const p = n.props as { accessibilityLabel?: string; "aria-label"?: string };
  return (p.accessibilityLabel ?? p["aria-label"] ?? textOf(n)).trim();
}
/** Width and height after hit slop, when the button's own style fixes them. */
function reach(n: ReactTestInstance): { w?: number; h?: number } {
  const p = n.props as { style?: unknown; hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number } };
  const s = StyleSheet.flatten(p.style as never) as { width?: unknown; height?: unknown } | undefined;
  const slop = typeof p.hitSlop === "number" ? { top: p.hitSlop, bottom: p.hitSlop, left: p.hitSlop, right: p.hitSlop } : p.hitSlop ?? {};
  return {
    ...(typeof s?.width === "number" ? { w: s.width + (slop.left ?? 0) + (slop.right ?? 0) } : {}),
    ...(typeof s?.height === "number" ? { h: s.height + (slop.top ?? 0) + (slop.bottom ?? 0) } : {}),
  };
}

jest.setTimeout(240_000);

describe("accessibility on every screen", () => {
  it("buttons have names and 48 dp targets", async () => {
    await render(
      <SafeAreaProvider initialMetrics={safe}>
        <QueryClientProvider client={queryClient}>
          <ToastHost><RootNavigator /></ToastHost>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    const problems: string[] = [];
    const reached: string[] = [];
    let buttons = 0;
    for (const { id } of ROUTES) {
      await act(async () => { openDevLinkWhenReady(`kept://dev/open/${encodeURIComponent(routeName(id))}?mode=mock&quiet=1&hold=1`); });
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
      expect(navigationRef.isReady()).toBe(true);
      if (navigationRef.getCurrentRoute()?.name === routeName(id)) reached.push(id);
      buttons += screen.queryAllByRole("button").length;
      for (const b of screen.queryAllByRole("button")) {
        if (!nameOf(b)) problems.push(`${id}: a button with no name`);
        const { w, h } = reach(b);
        if ((w !== undefined && w < MIN) || (h !== undefined && h < MIN)) problems.push(`${id}: "${nameOf(b)}" reaches ${w ?? "?"}×${h ?? "?"} dp`);
      }
    }
    // The walk really opened the screens (Today's B2–B4 are the B1 tab) and found their buttons.
    expect(reached.length).toBeGreaterThan(ROUTES.length - 8);
    // Some design screens intentionally have one or no actions; all reachable buttons are audited
    // below, so require a broad sample without assuming three buttons on every screen.
    expect(buttons).toBeGreaterThan(ROUTES.length * 2);
    expect([...new Set(problems)]).toEqual([]);
  });
});
