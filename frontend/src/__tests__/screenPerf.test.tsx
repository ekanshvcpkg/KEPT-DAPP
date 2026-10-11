// D-83 / D-84: what keeps screen changes and idle screens cheap.
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import type { ParamListBase } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { t } from "@/copy";
import { Screen, ScreenList } from "@/components/layout/Screen";
import { LOOP_BUDGET_MS, loopCycles } from "@/components/primitives";
import { setScreenDeferral } from "@/lib/screenReady";
import { cheapShadow, metrics } from "@/theme";

const safe = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const Stack = createNativeStackNavigator();
const nav = createNavigationContainerRef<ParamListBase>();
const Home = () => <Screen><Text>home</Text></Screen>;
const Pushed = () => <Screen><Text>pushed content</Text></Screen>;

describe("screen skeleton (D-83)", () => {
  beforeEach(() => { jest.useFakeTimers(); setScreenDeferral(true); });
  afterEach(() => { setScreenDeferral(false); jest.useRealTimers(); });

  it("a pushed screen commits a skeleton first, then its content, then the skeleton fades away", async () => {
    await render(
      <SafeAreaProvider initialMetrics={safe}>
        <NavigationContainer ref={nav}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={Home} />
            <Stack.Screen name="Pushed" component={Pushed} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>,
    );
    // The first screen of a stack (the splash) never waits.
    expect(screen.getByText("home")).toBeTruthy();
    await act(async () => { nav.navigate("Pushed"); });
    expect(screen.queryByText("pushed content")).toBeNull();
    expect(screen.getAllByLabelText(t("additions.a11y.loading")).length).toBeGreaterThan(0);
    // No transitionEnd under Jest: the cap mounts it.
    await act(async () => { jest.advanceTimersByTime(700); });
    expect(screen.getByText("pushed content")).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(metrics.skeleton.fadeMs + 150); });
    expect(screen.queryAllByLabelText(t("additions.a11y.loading"))).toHaveLength(0);
  });
});

describe("cheap frames (D-84)", () => {
  it("drops only black blurred outer shadows", () => {
    expect(cheapShadow("inset 0 0 0 1px rgba(255,255,255,0.08), 0 24px 40px rgba(0,0,0,0.45)")).toBe("inset 0 0 0 1px rgba(255,255,255,0.08)");
    expect(cheapShadow("0 8px 20px rgba(0,0,0,0.40)")).toBe("");
    // Insets, rings without blur and coloured glows stay.
    const lime = "inset 0 1.5px 0 rgba(255,255,255,0.65), inset 0 -3px 0 rgba(0,0,0,0.16), 0 12px 30px rgba(197,242,92,0.22)";
    expect(cheapShadow(lime)).toBe(lime);
    expect(cheapShadow("0 0 0 4px #1C1C1C, 0 12px 24px rgba(0,0,0,0.4)")).toBe("0 0 0 4px #1C1C1C");
    expect(cheapShadow("inset 0 0 0 3px rgba(255,255,255,0.25), 0 3px 0 #5E7A14")).toBe("inset 0 0 0 3px rgba(255,255,255,0.25), 0 3px 0 #5E7A14");
  });
  it("ambient loops play for about LOOP_BUDGET_MS, in whole cycles", () => {
    expect(loopCycles(2600) * 2600).toBeLessThanOrEqual(LOOP_BUDGET_MS + 2600 / 2);
    expect(loopCycles(60_000)).toBe(1);
  });
});

describe("long lists (motion rework)", () => {
  it("a ScreenList as a screen's last block mounts only the rows near the screen, under the blocks above it", async () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ key: `r${i}`, gapBefore: 8, render: () => <Text>{`row ${i}`}</Text> }));
    await render(
      <SafeAreaProvider initialMetrics={safe}>
        <Screen><Text>header block</Text><ScreenList items={items} /></Screen>
      </SafeAreaProvider>,
    );
    expect(screen.getByText("header block")).toBeTruthy();
    expect(screen.getByText("row 0")).toBeTruthy();
    expect(screen.queryAllByText(/^row \d+$/).length).toBeLessThan(60);
    expect(screen.queryByText("row 199")).toBeNull();
  });
});
