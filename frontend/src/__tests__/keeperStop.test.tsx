// The Stop pill: shown only while the Keeper speaks; a tap stops the line.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "@/copy";
import { KeeperStopHost } from "@/components/keeper/KeeperStop";
import { useKeeperSpeaking } from "@/features/keeper/voice";

test("appears while the Keeper speaks and stops it on tap", async () => {
  await render(<KeeperStopHost />);
  expect(screen.queryByLabelText(t("additions.keeper.stopSpeaking"))).toBeNull();
  await act(async () => { useKeeperSpeaking.setState({ speaking: true }); });
  await fireEvent.press(screen.getByLabelText(t("additions.keeper.stopSpeaking")));
  expect(useKeeperSpeaking.getState().speaking).toBe(false);
  expect(screen.queryByLabelText(t("additions.keeper.stopSpeaking"))).toBeNull();
});
