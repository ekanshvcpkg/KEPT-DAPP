// The Keeper speaks only in Live, signed in, with the setting on; the backend holds the ElevenLabs key.
import { createAudioPlayer } from "expo-audio";
import { keeperSay } from "@/features/keeper/voice";
import { useMode } from "@/state/mode";
import { useSession } from "@/state/session";
import { useSettings } from "@/state/settings";

const player = (jest.requireMock("expo-audio") as { __player: { play: jest.Mock; replace: jest.Mock } }).__player;
beforeEach(() => { jest.clearAllMocks(); useMode.setState({ mode: "live" }); useSession.setState({ token: "tok" }); useSettings.getState().set({ keeperVoice: true }); });

it("streams the line from the backend with the session token", () => {
  keeperSay("Kept. Barely.");
  const src = (createAudioPlayer as jest.Mock).mock.calls[0]?.[0] ?? player.replace.mock.calls[0]?.[0];
  expect(src.uri).toMatch(/\/api\/keeper\/say\?text=Kept\.%20Barely\.$/);
  expect(src.headers).toEqual({ authorization: "Bearer tok" });
  expect(player.play).toHaveBeenCalled();
});

it("stays silent in Demo, signed out, with the setting off, or with nothing to say", () => {
  useSettings.getState().set({ keeperVoice: false }); keeperSay("x");
  useSettings.getState().set({ keeperVoice: true }); useMode.setState({ mode: "demo" }); keeperSay("x");
  useMode.setState({ mode: "live" }); useSession.setState({ token: null }); keeperSay("x");
  useSession.setState({ token: "tok" }); keeperSay("   ");
  expect(player.play).not.toHaveBeenCalled();
});
