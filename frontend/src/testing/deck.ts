// Test helper: the test renderer runs no layout, and CardDeck appears only once it knows its width and
// every card's height (D-85). This gives it both.
import { act, fireEvent, screen } from "@testing-library/react-native";

export async function layOutDeck(width = 360, height = 300) {
  const layout = (h: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height: h } } });
  await act(async () => { fireEvent(await screen.findByTestId("deck"), "layout", layout(0)); });
  for (const el of screen.queryAllByTestId(/^deck-measure-/, { includeHiddenElements: true })) {
    await act(async () => { fireEvent(el, "layout", layout(height)); });
  }
}
