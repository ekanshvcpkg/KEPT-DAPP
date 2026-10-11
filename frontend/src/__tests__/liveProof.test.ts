// Live proof, below the screens: the backend's challenge as the app reads it, and what the shutter hands on.
import { analyzeDevicePhoto } from "kept-gesture";
import type { DevicePhotoVerdict } from "kept-gesture";
import { httpProof } from "@/api/http/oaths";
import { createHttpClient } from "@/api/http/client";
import type { OathFacts } from "@/features/oaths/model";
import { capture, photoToUse } from "@/screens/proof/Proof";
import type { CameraView } from "expo-camera";

const oath = { id: "Oath1111111111111111111111111111111111111111", objectId: 3, bountyId: undefined } as unknown as OathFacts;
const reply = (body: unknown) => (() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))) as unknown as typeof fetch;

describe("challenge from the backend", () => {
  // backend/src/v4/challenges.ts › challengeJson: ISO timestamps, five minutes apart.
  it("keeps its expiry as unix seconds, in the future (a second conversion made every challenge expire on arrival)", async () => {
    const issued = Date.now();
    const body = { phase: "start", photo: 1, gesture: "Thumb_Up", issuedAt: new Date(issued).toISOString(), expiresAt: new Date(issued + 300_000).toISOString() };
    const c = await httpProof(createHttpClient(() => "t", "http://api", reply(body))).challenge(oath, 1, 0);
    expect(c.expiresAt).toBe(Math.floor((issued + 300_000) / 1000));
    expect(c.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(c).toMatchObject({ photo: 1, dayIndex: 0, objectId: 3, gesture: "thumbs_up" });
  });

  it("says when the end photo opens, in real dates, as a wait (F3) rather than an error", async () => {
    const opens = Date.now() + 600_000;
    const body = { phase: "wait", photo: 2, waitSeconds: 600, startedAt: new Date().toISOString(), endAllowedAt: new Date(opens).toISOString(), startGesture: "Victory" };
    const c = await httpProof(createHttpClient(() => "t", "http://api", reply(body))).challenge(oath, 2, 0);
    expect(c.waitUntil).toBe(Math.floor(opens / 1000));
    expect(c).toMatchObject({ photo: 2, dayIndex: 0, gesture: "victory" });
  });
});

describe("checking a photo", () => {
  const verdict = (over: Partial<DevicePhotoVerdict> = {}): DevicePhotoVerdict => ({
    proofHash: "b".repeat(64), objectPresent: true, objectConfidence: 0.9, gestureSeen: "Thumb_Up", gestureMatches: true,
    looksLikeScreenOrPrintout: false, reason: "ok", model: "test", ms: 12, inconclusive: false, ...over,
  });
  const challenge = { photo: 1 as const, dayIndex: 2, objectId: 0, gesture: "thumbs_up" as const, expiresAt: 0 };
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

  it("sends the verdict and the photo's hash, never the photo", async () => {
    (analyzeDevicePhoto as jest.Mock).mockResolvedValueOnce(verdict());
    const { calls, proof } = backend({ "/proof/verify": { pass: true, verificationId: "v1" }, "/api/proof/start": { endAllowedAt: new Date(Date.now() + 600_000).toISOString() } });
    const base64 = "QUJD".repeat(50);
    const r = await proof.submit(oath, challenge, base64, "file:///cache/photo.jpg");
    expect(r).toMatchObject({ status: "pass", endAllowedAt: expect.any(Number) });
    expect(analyzeDevicePhoto).toHaveBeenLastCalledWith("file:///cache/photo.jpg", "dumbbell", "thumbs up");
    expect(calls.map((c) => c.path)).toEqual(["/proof/verify", "/api/proof/start"]);
    expect(Object.keys(calls[0]!.body).sort()).toEqual([
      "dayIndex", "expectedGesture", "expectedObject", "gestureMatches", "gestureSeen", "looksLikeScreenOrPrintout",
      "ms", "model", "objectConfidence", "objectPresent", "oath", "proofHash", "reason",
    ].sort());
    for (const c of calls) {
      expect(JSON.stringify(c.body)).not.toContain(base64);
      expect(JSON.stringify(c.body)).not.toContain("photo.jpg");
    }
    expect(calls[1]!.body).toEqual({ oath: oath.id, dayIndex: 2, verificationId: "v1" });
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
    await expect(proof.submit(oath, challenge, "x", "file:///p.jpg")).resolves.toEqual({ status: "fail", attempts: 2 });
    await expect(proof.submit(oath, challenge, "x")).resolves.toEqual({ status: "unavailable" });
    (analyzeDevicePhoto as jest.Mock).mockRejectedValueOnce(new Error("model failed to load"));
    await expect(proof.submit(oath, challenge, "x", "file:///p.jpg")).rejects.toThrow("model failed to load");
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
