import { StyleSheet } from "react-native";
import { color } from "@/theme";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { t } from "@/copy";
import { Button } from "@/components/actions";
import { AppHeader, BalanceChip, Bell, BottomSheet, NavBar, TabBar, ToastHost, useToast } from "@/components/chrome";
import { useDeviceOaths, useLastSeenHp } from "@/features/oaths/device";
import { haptic } from "@/lib/haptics";
import { Banner, Segmented } from "@/components/content/Basics";
import { DayMemberGrid, HPPanel, OathCard, gridToday } from "@/components/content/Oath";
import { Toggle } from "@/components/content/Rows";
import { QRCard } from "@/components/content/Inputs";
import { CardDeck, dotWindow } from "@/components/content/Deck";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { useSettings } from "@/state/settings";
import { create as createQr } from "qrcode/lib/core/qrcode";
import { SignStatus } from "@/components/content/Status";
import { Gallery } from "@/dev/Gallery";
import { PressScale, Text } from "@/components/primitives";

const insets = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

describe("PressScale touch area", () => {
  it("a pressable sized by its content still reaches 48 dp (hit slop from its own layout)", async () => {
    await render(<PressScale onPress={() => undefined} accessibilityLabel="See all"><Text>See all</Text></PressScale>);
    const b = screen.getByRole("button", { name: "See all" });
    await act(async () => { fireEvent(b, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 42, height: 16 } } }); });
    expect(b.props.hitSlop).toEqual({ top: 16, bottom: 16, left: 3, right: 3 });
    await act(async () => { fireEvent(b, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 54 } } }); });
    expect(b.props.hitSlop).toBeUndefined();
  });
});

describe("Button", () => {
  it("fires onPress and exposes its label", async () => {
    const onPress = jest.fn();
    await render(<Button label="Take photo 2" onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button", { name: "Take photo 2" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it("does not fire when disabled or loading", async () => {
    const onPress = jest.fn();
    await render(<><Button label="A" onPress={onPress} disabled /><Button label="B" onPress={onPress} loading /></>);
    await fireEvent.press(screen.getByRole("button", { name: "A" }));
    await fireEvent.press(screen.getByRole("button", { name: "B" }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "B" })).toHaveProp("accessibilityState", expect.objectContaining({ busy: true }));
  });
});

describe("chrome", () => {
  it("AppHeader routes the balance chip, bell and Keeper mark", async () => {
    const onBalance = jest.fn(), onBell = jest.fn(), onKeeper = jest.fn();
    await render(<AppHeader title="Today" balance="1,043" unreadCount={3} keeper={{ hasNew: true, onPress: onKeeper }} onBalance={onBalance} onBell={onBell} />);
    await fireEvent.press(screen.getByLabelText(`${t("additions.a11y.wallet")}: 1,043 SKR`));
    await fireEvent.press(screen.getByLabelText(`${t("additions.a11y.inbox")}, ${t("additions.a11y.unread", { n: 3 })}`));
    await fireEvent.press(screen.getByLabelText(t("additions.a11y.keeper")));
    expect([onBalance, onBell, onKeeper].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    expect(screen.getByText("3")).toBeTruthy();
  });
  it("Bell hides the badge at 0", async () => {
    await render(<Bell count={0} />);
    expect(screen.queryByText("0")).toBeNull();
  });
  it("NavBar shows k/n for steps and a close button for modal flows", async () => {
    const onBack = jest.fn();
    await render(<NavBar onBack={onBack} steps={[2, 6]} close />);
    expect(screen.getByText("2/6")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t("additions.a11y.close")));
    expect(onBack).toHaveBeenCalled();
  });
  it("TabBar selects tabs and opens the + menu", async () => {
    const onTab = jest.fn(), onPlus = jest.fn();
    await render(<TabBar active="today" onTab={onTab} onPlus={onPlus} />);
    expect(screen.getByText(t("common.tabs.today"))).toBeTruthy();
    expect(screen.queryByText(t("common.tabs.oaths"))).toBeNull();
    await fireEvent.press(screen.getByRole("tab", { name: t("common.tabs.oaths") }));
    await fireEvent.press(screen.getByLabelText(t("additions.a11y.newMenu")));
    expect(onTab).toHaveBeenCalledWith("oaths");
    expect(onPlus).toHaveBeenCalled();
  });
  it("BottomSheet renders only while visible and closes from the scrim", async () => {
    const onClose = jest.fn();
    const { rerender } = await render(<BottomSheet visible={false} onClose={onClose}><Text>inside</Text></BottomSheet>);
    expect(screen.queryByText("inside")).toBeNull();
    await rerender(<BottomSheet visible onClose={onClose}><Text>inside</Text></BottomSheet>);
    expect(screen.getByText("inside")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(t("additions.a11y.close")));
    expect(onClose).toHaveBeenCalled();
  });
  it("Toast shows and hides itself after the hold time", async () => {
    jest.useFakeTimers();
    function Trigger() { const toast = useToast(); return <Button label="go" onPress={() => toast(t("toasts.0"))} />; }
    await render(<ToastHost><Trigger /></ToastHost>);
    await fireEvent.press(screen.getByRole("button", { name: "go" }));
    expect(screen.getByText(t("toasts.0"))).toBeTruthy();
    await act(() => { jest.advanceTimersByTime(2000); });
    expect(screen.queryByText(t("toasts.0"))).toBeNull();
    jest.useRealTimers();
  });
});

describe("content", () => {
  /** Lays the deck out: its width, then every card's natural height (the test renderer runs no layout). */
  const layDeck = async (heights: Record<string, number>, width = 360) => {
    await fireEvent(screen.getByTestId("deck"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } } });
    for (const [key, height] of Object.entries(heights)) {
      await fireEvent(screen.getByTestId(`deck-measure-${key}`, { includeHiddenElements: true }), "layout", { nativeEvent: { layout: { x: 0, y: 0, width, height } } });
    }
  };
  const position = (k: number, n: number) => screen.getByRole("adjustable", { name: t("additions.deck.positionA11y", { k, n }) });

  it("CardDeck: dots only; screen readers step both ways through the stack's actions (D-85)", async () => {
    useSettings.setState({ deckHintSeen: false });
    const cards = ["Iron Week", "Hydrate Week", "Read 20 pages"].map((name) => ({ key: name, node: <Text>{name}</Text> }));
    await render(<CardDeck cards={cards} />);
    // Nothing shows until every card is measured.
    expect(screen.queryByRole("adjustable")).toBeNull();
    await layDeck({ "Iron Week": 300, "Hydrate Week": 240, "Read 20 pages": 180 });
    expect(position(1, 3)).toBeTruthy();
    // No arrows, number or hint text: dots alone.
    expect(screen.queryByRole("button", { name: t("additions.deck.next") })).toBeNull();
    expect(screen.queryByText("1 / 3")).toBeNull();
    // The top three are drawn (the ones behind are hidden from screen readers).
    expect(screen.getAllByText("Hydrate Week", { includeHiddenElements: true }).length).toBeGreaterThan(0);
    await fireEvent(position(1, 3), "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(position(2, 3)).toBeTruthy();
    expect(useSettings.getState().deckHintSeen).toBe(true);
    await fireEvent(position(2, 3), "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    await fireEvent(position(1, 3), "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(position(3, 3)).toBeTruthy();
  });

  it("CardDeck: every card takes the tallest card's height, counting cards that aren't mounted", async () => {
    const cards = ["a", "b", "c", "d", "e"].map((key) => ({ key, node: <Text>{key}</Text> }));
    await render(<CardDeck cards={cards} />);
    // "e" is fifth, so never one of the three drawn, and it's the tallest.
    await layDeck({ a: 200, b: 150, c: 260, d: 180, e: 420 });
    expect(screen.getByTestId("deck")).toHaveStyle({ height: 420 });
    for (const depth of [0, 1, 2]) expect(screen.getByTestId(`deck-slot-${depth}`, { includeHiddenElements: true })).toHaveStyle({ height: 420 });
  });

  it("CardDeck: swipe left goes to the next card, swipe right back to the previous one", async () => {
    const cards = ["a", "b", "c", "d"].map((key) => ({ key, node: <Text>{key}</Text> }));
    await render(<CardDeck cards={cards} />);
    await layDeck({ a: 200, b: 200, c: 200, d: 200 });
    const swipe = async (dx: number) => {
      await act(async () => {
        fireGestureHandler(getByGestureTestId("deck-pan-0"), [
          { state: State.BEGAN, translationX: 0, velocityX: 0 },
          { state: State.ACTIVE, translationX: dx / 2, velocityX: 0 },
          { state: State.ACTIVE, translationX: dx, velocityX: 0 },
          { state: State.END, translationX: dx, velocityX: 0 },
        ]);
      });
    };
    await swipe(-250);
    expect(position(2, 4)).toBeTruthy();
    await swipe(-250);
    expect(position(3, 4)).toBeTruthy();
    await swipe(250);
    expect(position(2, 4)).toBeTruthy();
    await swipe(250);
    await swipe(250);
    expect(position(4, 4)).toBeTruthy();
    // A short drag springs back.
    await swipe(-60);
    expect(position(4, 4)).toBeTruthy();
  });

  it("CardDeck dots: up to 5; a longer stack shows a window of 5 whose edge dots shrink", () => {
    const show = (i: number, n: number) => dotWindow(i, n).map((d) => `${d.index}${d.on ? "*" : ""}${d.small ? "s" : ""}`).join(" ");
    expect(show(1, 2)).toBe("0 1*");
    expect(show(4, 5)).toBe("0 1 2 3 4*");
    expect(show(0, 8)).toBe("0* 1 2 3 4s");
    expect(show(4, 8)).toBe("2s 3 4* 5 6s");
    expect(show(7, 8)).toBe("3s 4 5 6 7*");
    for (let n = 1; n <= 12; n++) for (let i = 0; i < n; i++) expect(dotWindow(i, n).length).toBe(Math.min(n, 5));
  });
  it("CardDeck: one card is just the card", async () => {
    await render(<CardDeck cards={[{ key: "a", node: <Text>Solo</Text> }]} />);
    expect(screen.getByText("Solo")).toBeTruthy();
    expect(screen.queryByRole("adjustable")).toBeNull();
  });
  it("QRCard draws exactly the encoder's modules", async () => {
    const link = "kept://join/H4R9-K2";
    await render(<QRCard code="H4R9-K2" link={link} />);
    type Node = { props?: { d?: unknown }; children?: (Node | string)[] | null };
    const find = (n: Node | string | null): string | undefined => (n && typeof n === "object" ? (typeof n.props?.d === "string" ? n.props.d : (n.children ?? []).map(find).find(Boolean)) : undefined);
    const d = find(screen.toJSON() as Node)!;
    const { size, data } = createQr(link, { errorCorrectionLevel: "M" }).modules;
    const drawn = new Uint8Array(size * size);
    for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) for (let i = 0; i < +w!; i++) drawn[+y! * size + +x! + i] = 1;
    expect([...drawn]).toEqual([...data].map((v) => (v ? 1 : 0)));
  });
  it("QRCard shows the invite link on one line without its scheme, cut in the middle if it is long", async () => {
    await render(<QRCard code="IRON-7K2Q" link="https://keptdapp.vercel.app/o/IRON-7K2Q" />);
    const shown = screen.getByText("keptdapp.vercel.app/o/IRON-7K2Q");
    expect(shown.props.numberOfLines).toBe(1);
    expect(shown.props.ellipsizeMode).toBe("middle");
    expect(screen.queryByText(/^https:/)).toBeNull();
  });
  it("OathCard shows its tags and button", async () => {
    const onBtn = jest.fn();
    await render(<OathCard icon="dumbbell" name="Iron Week" meta="Day 3/7" tags={[{ text: "1,043 SKR" }]} hp={90} button={{ label: "Take photo 2", onPress: onBtn }} />);
    expect(screen.getByText("1,043 SKR")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Take photo 2" }));
    expect(onBtn).toHaveBeenCalled();
  });
  it("HPPanel shows the HP number", async () => {
    await render(<HPPanel hp={40} lostToday={20} />);
    expect(screen.getByText(/40/)).toBeTruthy();
  });
  it("DayMemberGrid renders a row per member", async () => {
    await render(<DayMemberGrid days={7} today={3} members={[{ key: "a", name: "Arjun", initial: "A", color: "#FDE68A", cells: "kmpffff" }, { key: "r", name: "Riya", initial: "R", color: "#F9A8D4", cells: "kkkffff" }]} />);
    expect(screen.getByText("Arjun")).toBeTruthy();
    expect(screen.getByText("Riya")).toBeTruthy();
  });
  it("DayMemberGrid highlights today's day number (engine dayIndex is 0-based)", async () => {
    // Day 3 of the Oath is dayIndex 2 (audit S5: D2 lit day 2 on day 3).
    expect(gridToday(2)).toBe(3);
    expect(gridToday(null)).toBe(-1);
    await render(<DayMemberGrid days={7} today={gridToday(2)} members={[{ key: "a", name: "Arjun", initial: "A", color: "#FDE68A", cells: "kkpffff" }]} />);
    const colourOf = (n: string) => StyleSheet.flatten(screen.getByText(n).props.style).color;
    expect(colourOf("3")).toBe(color.text.primary);
    expect(colourOf("2")).not.toBe(color.text.primary);
  });
  it("Segmented and Toggle report changes", async () => {
    const onSeg = jest.fn(), onToggle = jest.fn();
    await render(<><Segmented items={["Discover", "Joined"]} value={0} onChange={onSeg} /><Toggle on={false} onChange={onToggle} label="Push" /></>);
    await fireEvent.press(screen.getByRole("tab", { name: "Joined" }));
    await fireEvent.press(screen.getByLabelText("Push"));
    expect(onSeg).toHaveBeenCalledWith(1);
    expect(onToggle).toHaveBeenCalledWith(true);
  });
  it("Banner is pressable only with onPress", async () => {
    const onPress = jest.fn();
    await render(<Banner tone="lime" icon="sack" title="Claim" onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button", { name: "Claim" }));
    expect(onPress).toHaveBeenCalled();
  });
  it("SignStatus renders every state", async () => {
    await render(<>{(["pending", "success", "fail", "warn"] as const).map((s) => <SignStatus key={s} state={s} chip="1,000 SKR staked" />)}</>);
    expect(screen.getAllByText("1,000 SKR staked").length).toBeGreaterThan(0);
  });
});

describe("Gallery", () => {
  it("renders every section without a missing copy key", async () => {
    await render(<SafeAreaProvider initialMetrics={insets}><ToastHost><Gallery /></ToastHost></SafeAreaProvider>);
    for (const s of ["AppHeader", "TabBar + PlusButton", "OathCard", "ProofCamera + Shutter", "SignStatus", "Overlays · FX"]) {
      expect(screen.getByText(s)).toBeTruthy();
    }
  });
});

describe("unseen HP change and balance (S20)", () => {
  beforeEach(() => { useDeviceOaths.setState({ seenHp: {} }); });

  it("HPPanel plays damage from the seen value (warning haptic) and heal (light haptic)", async () => {
    const warning = jest.spyOn(haptic, "warning").mockImplementation(() => undefined);
    const light = jest.spyOn(haptic, "light").mockImplementation(() => undefined);
    const dmg = await render(<HPPanel hp={70} from={90} />);
    expect(screen.getByText("70")).toBeTruthy();
    expect(warning).toHaveBeenCalledTimes(1);
    await dmg.unmount();
    const heal = await render(<HPPanel hp={80} from={70} />);
    expect(screen.getByText("80")).toBeTruthy();
    await heal.unmount();
    expect(light).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
    light.mockRestore();
  });

  it("BalanceChip shows a new balance", async () => {
    const r = await render(<BalanceChip amount="–" />);
    await r.rerender(<BalanceChip amount="4,280" />);
    expect(screen.getByText("4,280")).toBeTruthy();
    await r.rerender(<BalanceChip amount="4,323" />);
    expect(screen.getByText("4,323")).toBeTruthy();
  });
  it("useLastSeenHp: nothing on a first visit, the last shown HP after a change, then records the new one", async () => {
    let seen: number | undefined = -1;
    function Probe({ hp }: { hp: number }) { seen = useLastSeenHp("o1", hp); return null; }
    const first = await render(<Probe hp={90} />);
    expect(seen).toBeUndefined();
    expect(useDeviceOaths.getState().seenHp.o1).toBe(90);
    await first.unmount();
    await render(<Probe hp={70} />);
    expect(seen).toBe(90);
    expect(useDeviceOaths.getState().seenHp.o1).toBe(70);
  });
});
