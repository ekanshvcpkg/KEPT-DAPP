// Ask the Keeper: the question goes with this device's Oath names, so the Keeper uses the names the user sees.
import { createHttpClient } from "@/api/http/client";
import { askKeeper } from "@/features/keeper/ask";
import { useDeviceOaths } from "@/features/oaths/device";

test("askKeeper posts the recording and the device's Oath names, and reads the answer", async () => {
  useDeviceOaths.getState().remember("Oath1111111111111111111111111111111111111111", { name: "Excercise" });
  let sent: Record<string, unknown> | null = null;
  const f = (async (_url: string, init?: RequestInit) => {
    sent = JSON.parse(String(init!.body));
    return new Response(JSON.stringify({ question: "what's left today?", answer: "Ten squats, and two hours to do them." }), { status: 200 });
  }) as unknown as typeof fetch;
  const a = await askKeeper("QUJD", "audio/mp4", createHttpClient(() => "t", "http://api", f));
  expect(a.answer).toBe("Ten squats, and two hours to do them.");
  expect(sent).toMatchObject({ audio: "QUJD", mime: "audio/mp4", names: { Oath1111111111111111111111111111111111111111: "Excercise" } });
});
