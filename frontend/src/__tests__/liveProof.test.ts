// Live proof, below the screens: the backend's challenge as the app reads it, and what the shutter hands on. One photo proves
// one habit, of that habit's own object (DECISIONS D-98).
import { analyzeDevicePhoto } from "kept-gesture";
import type { DevicePhotoVerdict } from "kept-gesture";
import { httpProof } from "@/api/http/oaths";
import { gestureText } from "@/features/oaths/present";
import { createHttpClient } from "@/api/http/client";
import type { Challenge } from "@/api";
import type { OathFacts } from "@/features/oaths/model";
import { useDeviceOaths } from "@/features/oaths/device";
import { capture, photoToUse } from "@/screens/proof/Proof";
import type { CameraView } from "expo-camera";

const oath = { id: "Oath1111111111111111111111111111111111111111", objectId: 3, bountyId: undefined } as unknown as OathFacts;
const reply = (body: unknown) => (() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))) as unknown as typeof fetch;
/** backend/src/routes/v4.ts › POST /api/proof/challenge with a habit: ISO timestamps, five minutes apart. */
const habitChallenge = (over: Record<string, unknown> = {}) => ({
  phase: "habit", habit: 0, object: "dumbbell", gesture: "Thumb_Up", issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(), done: [], habits: 2, ...over,
});

beforeEach(() => { useDeviceOaths.setState(useDeviceOaths.getInitialState(), true); });

describe("challenge from the backend", () => {
  it("keeps its expiry as unix seconds, in the future (a second conversion made every challenge expire on arrival)", async () => {
    const issued = Date.now();
    const body = habitChallenge({ issuedAt: new Date(issued).toISOString(), expiresAt: new Date(issued + 300_000).toISOString() });
    const c = await httpProof(createHttpClient(() => "t", "http://api", reply(body))).challenge(oath, 0, 0);
    expect(c.expiresAt).toBe(Math.floor((issued + 300_000) / 1000));
    expect(c.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(c).toMatchObject({ habit: 0, dayIndex: 0, object: "dumbbell", gesture: "thumbs_up" });
  });

  it("asks for one habit, and gets that habit's own object, however many habits the Oath has", async () => {
    const calls: Record<string, unknown>[] = [];
    const f = (async (_url: string, init?: RequestInit) => { calls.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify(habitChallenge({ habit: 1, object: "book", gesture: "Victory", done: [0] })), { status: 200 }); }) as unknown as typeof fetch;
    const c = await httpProof(createHttpClient(() => "t", "http://api", f)).challenge(oath, 1, 4);
    expect(calls).toEqual([{ oath: oath.id, dayIndex: 4, habit: 1 }]);
    expect(c).toMatchObject({ habit: 1, dayIndex: 4, object: "book", gesture: "victory" });
  });

  it("remembers which habits the server says are proven today, for Today's progress", async () => {
    await httpProof(createHttpClient(() => "t", "http://api", reply(habitChallenge({ habit: 1, done: [0] })))).challenge(oath, 1, 3);
    expect(useDeviceOaths.getState().habitsDone[oath.id]).toEqual([3, [0]]);
  });
});

describe("checking a photo", () => {
  const verdict = (over: Partial<DevicePhotoVerdict> = {}): DevicePhotoVerdict => ({
    proofHash: "b".repeat(64), objectPresent: true, objectConfidence: 0.9, gestureSeen: "Thumb_Up", gestureMatches: true,
    looksLikeScreenOrPrintout: false, reason: "ok", model: "test", ms: 12, inconclusive: false, ...over,
  });
  const challenge: Challenge = { habit: 0, dayIndex: 2, object: "dumbbell", gesture: "thumbs_up", expiresAt: 0 };
  /** Records every request; answers by path. */
  function backend(replies: Record<string, unknown>) {
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      calls.push({ path, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify(replies[path] ?? {}), { status: 200 });
    }) as unknown as typeof fetch;
    return { calls, proof: httpProof(createHttpClient(() => "t", "http://api", f)) };
  }

  it("sends the verdict and the photo's hash, never the photo, and one habit's proof ends the check", async () => {
    (analyzeDevicePhoto as jest.Mock).mockResolvedValueOnce(verdict());
    const { calls, proof } = backend({ "/proof/verify": { pass: true, verificationId: "v1" }, "/api/proof/habit": { habit: 0, done: [0], dayKept: false } });
    const base64 = "QUJD".repeat(50);
    const r = await proof.submit(oath, challenge, base64, "file:///cache/photo.jpg");
    expect(r).toEqual({ status: "pass", dayKept: false });
    expect(analyzeDevicePhoto).toHaveBeenLastCalledWith("file:///cache/photo.jpg", "dumbbell", "thumbs up");
    expect(calls.map((c) => c.path)).toEqual(["/proof/verify", "/api/proof/habit"]);
    expect(Object.keys(calls[0]!.body).sort()).toEqual([
      "dayIndex", "expectedGesture", "expectedObject", "gestureMatches", "gestureSeen", "habit", "looksLikeScreenOrPrintout",
      "ms", "model", "objectConfidence", "objectPresent", "oath", "proofHash", "reason",
    ].sort());
    for (const c of calls) {
      expect(JSON.stringify(c.body)).not.toContain(base64);
      expect(JSON.stringify(c.body)).not.toContain("photo.jpg");
    }
    expect(calls[1]!.body).toEqual({ oath: oath.id, dayIndex: 2, habit: 0, verificationId: "v1" });
    expect(useDeviceOaths.getState().habitsDone[oath.id]).toEqual([2, [0]]);
  });

  it("the last habit of the day says the day is kept", async () => {
    (analyzeDevicePhoto as jest.Mock).mockResolvedValueOnce(verdict());
    const { proof } = backend({ "/proof/verify": { pass: true, verificationId: "v1" }, "/api/proof/habit": { habit: 1, done: [0, 1], dayKept: true, signature: "s" } });
    await expect(proof.submit(oath, { ...challenge, habit: 1, object: "book" }, "x", "file:///p.jpg")).resolves.toEqual({ status: "pass", dayKept: true });
  });

  it("a model that gave no usable answer is a retry (F2b), not a failed photo, and sends nothing", async () => {
    (analyzeDevicePhoto as jest.Mock).mockResolvedValueOnce(verdict({ inconclusive: true, objectPresent: false }));
    const { calls, proof } = backend({});
    await expect(proof.submit(oath, challenge, "x", "file:///p.jpg")).resolves.toEqual({ status: "unavailable" });
    expect(calls).toEqual([]);
  });

  it("a rejected verdict counts as a failed try; a missing photo file or a native error is unavailable or thrown", async () => {
    (analyzeDevicePhoto as jest.Mock).mockResolvedValueOnce(verdict({ gestureMatches: false }));
    const { proof } = backend({ "/proof/verify": { pass: false, verificationId: null, failedChecks: 2 } });
    await expect(proof.submit(oath, challenge, "x", "file:///p.jpg")).resolves.toEqual({ status: "fail", attempts: 2, objectPresent: true, gestureMatches: false });
    await expect(proof.submit(oath, challenge, "x")).resolves.toEqual({ status: "unavailable" });
    (analyzeDevicePhoto as jest.Mock).mockRejectedValueOnce(new Error("model failed to load"));
    await expect(proof.submit(oath, challenge, "x", "file:///p.jpg")).rejects.toThrow("model failed to load");
  });
});

describe("what the phone checks: the habit's own object and the server's gesture", () => {
  const verdict = (): DevicePhotoVerdict => ({
    proofHash: "c".repeat(64), objectPresent: true, objectConfidence: 0.9, gestureSeen: "Victory", gestureMatches: true,
    looksLikeScreenOrPrintout: false, reason: "ok", model: "test", ms: 9, inconclusive: false,
  });
  function backend() {
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      calls.push({ path, body: JSON.parse(String(init?.body ?? "{}")) });
      const body = path === "/proof/verify" ? { pass: true, verificationId: "v1" } : { habit: 0, done: [0], dayKept: false };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    return { calls, proof: httpProof(createHttpClient(() => "t", "http://api", f)) };
  }

  // Any object the catalog has, not just the program's eight: the model is asked for it by name and the backend compares the same text.
  it.each(["dumbbell", "book", "water bottle", "running shoes", "kettlebell", "sheet music", "notebook"])("%s: the model is asked for it and /proof/verify is sent it", async (object) => {
    (analyzeDevicePhoto as jest.Mock).mockResolvedValueOnce(verdict());
    const { calls, proof } = backend();
    await proof.submit(oath, { habit: 0, dayIndex: 1, object, gesture: "victory", expiresAt: 0 }, "x", "file:///p.jpg");
    expect(analyzeDevicePhoto).toHaveBeenLastCalledWith("file:///p.jpg", object, expect.any(String));
    expect(calls.find((x) => x.path === "/proof/verify")!.body.expectedObject).toBe(object);
  });

  it("a challenge without an object is never checked (unavailable, not some other object)", async () => {
    const { calls, proof } = backend();
    await expect(proof.submit(oath, { habit: 0, dayIndex: 1, object: "", gesture: "victory", expiresAt: 0 }, "x", "file:///p.jpg")).resolves.toEqual({ status: "unavailable" });
    expect(calls).toEqual([]);
  });

  it.each([["thumbs_up"], ["victory"], ["open_palm"]] as const)("the server's %s is shown, and the same gesture goes to MediaPipe and /proof/verify", async (gesture) => {
    (analyzeDevicePhoto as jest.Mock).mockResolvedValueOnce(verdict());
    const random = jest.spyOn(Math, "random");
    try {
      const { calls, proof } = backend();
      expect(gestureText(gesture)).toEqual(expect.any(String)); // what F1 shows the user
      await proof.submit(oath, { habit: 0, dayIndex: 1, object: "book", gesture, expiresAt: 0 }, "x", "file:///p.jpg");
      const [, , expected] = (analyzeDevicePhoto as jest.Mock).mock.calls.at(-1)!;
      expect(expected).toBe(calls.find((x) => x.path === "/proof/verify")!.body.expectedGesture);
      expect(random).not.toHaveBeenCalled(); // no gesture is drawn on the phone
    } finally { random.mockRestore(); }
  });
});

describe("shutter", () => {
  const camera = (takePictureAsync: () => Promise<{ base64?: string; uri?: string }>) => ({ takePictureAsync }) as unknown as CameraView;

  it("returns the photo the camera took", async () => {
    await expect(capture(camera(async () => ({ base64: "abc", uri: "file:///abc.jpg" })), 1000)).resolves.toBe("abc");
  });
  it("gives up on a camera that never answers, and on one that throws, instead of waiting forever", async () => {
    jest.useFakeTimers();
    try {
      const hung = capture(camera(() => new Promise(() => {})), 1000);
      await jest.advanceTimersByTimeAsync(1000);
      await expect(hung).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
    await expect(capture(camera(() => Promise.reject(new Error("camera busy"))), 1000)).resolves.toBeNull();
    await expect(capture(null, 1000)).resolves.toBeNull();
  });
  it("a chain Oath never gets a made-up photo; a mock Oath does, so a camera-less emulator still runs Demo", () => {
    expect(photoToUse("real", false)).toBe("real");
    expect(photoToUse("real", true)).toBe("real");
    expect(photoToUse(null, false)).toBeNull();
    expect(photoToUse(null, true)).toEqual(expect.any(String));
  });
});
