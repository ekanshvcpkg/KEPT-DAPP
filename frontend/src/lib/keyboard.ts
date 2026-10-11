// The on-screen keyboard's height (0 when hidden). With edge-to-edge on Android the window doesn't
// resize for the keyboard, so screens lift their pinned actions by this much themselves.
import { useEffect, useState } from "react";
import { Dimensions, Keyboard } from "react-native";
import type { KeyboardMetrics } from "react-native";

/**
 * How much of the screen's bottom the keyboard covers. Android's `endCoordinates.height` leaves out the navigation /
 * gesture bar the keyboard sits above (24 dp on the emulator), so a lift by `height` alone left the pinned button
 * that much under the keys. The distance from the keyboard's top edge to the bottom of the screen is the whole of it.
 */
export function keyboardCover(e: Pick<KeyboardMetrics, "height" | "screenY">, screenHeight: number): number {
  return Math.max(e.height, Math.round(screenHeight - e.screenY));
}

export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => setH(keyboardCover(e.endCoordinates, Dimensions.get("screen").height)));
    const hide = Keyboard.addListener("keyboardDidHide", () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}
