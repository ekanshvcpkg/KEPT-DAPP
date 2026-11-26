// Live proof, below the screens: the backend's challenge as the app reads it, and what the shutter hands on. One photo proves
// one habit, of that habit's own object (DECISIONS D-98).
import { analyzeDevicePhoto } from "kept-gesture";
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

describe("checking a photo: the Keeper judges on the server", () => {
  const challenge: Challenge = { habit: 0, dayIndex: 2, object: "dumbbell", gesture: "thumbs_up", expiresAt: 0 };
  /** Records every request; answers by path (a number answers with that HTTP status). */
  function backend(replies: Record<string, unknown>) {
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      calls.push({ path, body: JSON.parse(String(init?.body ?? "{}")) });
      const reply = replies[path];
      if (typeof reply === "number") return new Response(JSON.stringify({ error: "check_unavailable", retryable: true }), { status: reply });
      return new Response(JSON.stringify(reply ?? {}), { status: 200 });
    }) as unknown as typeof fetch;
    return { calls, proof: httpProof(createHttpClient(() => "t", "http://api", f)) };
  }

  it("uploads the photo with what it must show, sends no verdict of its own, and one habit's proof ends the check", async () => {
    const { calls, proof } = backend({ "/proof/verify": { pass: true, verificationId: "v1", receiptHash: "r".repeat(64) }, "/api/proof/habit": { habit: 0, done: [0], dayKept: false } });
    const base64 = "QUJD".repeat(50);
    const r = await proof.submit(oath, challenge, base64, "file:///cache/photo.jpg");
    expect(r).toEqual({ status: "pass", dayKept: false });
    expect(analyzeDevicePhoto).not.toHaveBeenCalled();
    expect(calls.map((c) => c.path)).toEqual(["/proof/verify", "/api/proof/habit"]);
    expect(calls[0]!.body).toEqual({ photo: base64, expectedObject: "dumbbell", expectedGesture: "thumbs up", oath: oath.id, dayIndex: 2, habit: 0 });
    expect(calls[1]!.body).toEqual({ oath: oath.id, dayIndex: 2, habit: 0, verificationId: "v1" });
    expect(useDeviceOaths.getState().habitsDone[oath.id]).toEqual([2, [0]]);
  });

  it("the last habit of the day says the day is kept", async () => {
    const { proof } = backend({ "/proof/verify": { pass: true, verificationId: "v1" }, "/api/proof/habit": { habit: 1, done: [0, 1], dayKept: true, signature: "s" } });
    await expect(proof.submit(oath, { ...challenge, habit: 1, object: "book" }, "x")).resolves.toEqual({ status: "pass", dayKept: true });
  });

  it("the Keeper being unavailable (503) is a retry (F2b), not a failed photo", async () => {
    const { calls, proof } = backend({ "/proof/verify": 503 });
    await expect(proof.submit(oath, challenge, "x")).resolves.toEqual({ status: "unavailable" });
    expect(calls.map((c) => c.path)).toEqual(["/proof/verify"]);
  });

  it("a rejected photo counts as a failed try, with the Keeper's own reasons; no photo is unavailable", async () => {
    const { calls, proof } = backend({ "/proof/verify": { pass: false, verificationId: null, failedChecks: 2, objectPresent: true, gestureMatches: false } });
    await expect(proof.submit(oath, challenge, "x")).resolves.toEqual({ status: "fail", attempts: 2, objectPresent: true, gestureMatches: false });
    await expect(proof.submit(oath, challenge, "")).resolves.toEqual({ status: "unavailable" });
    expect(calls).toHaveLength(1);
  });

  it("other server errors are thrown to the screen (F2b / M2), not swallowed", async () => {
    const { proof } = backend({ "/proof/verify": 500 });
    await expect(proof.submit(oath, challenge, "x")).rejects.toMatchObject({ status: 500 });
  });
});

describe("what the Keeper is asked: the habit's own object and the server's gesture", () => {
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

  // Any object the catalog has, not just the program's eight: the backend asks the model for the same text.
  it.each(["dumbbell", "book", "water bottle", "running shoes", "kettlebell", "sheet music", "notebook"])("%s is sent to /proof/verify by name", async (object) => {
    const { calls, proof } = backend();
    await proof.submit(oath, { habit: 0, dayIndex: 1, object, gesture: "victory", expiresAt: 0 }, "x");
    expect(calls.find((x) => x.path === "/proof/verify")!.body.expectedObject).toBe(object);
  });

  it("a challenge without an object is never sent (unavailable, not some other object)", async () => {
    const { calls, proof } = backend();
    await expect(proof.submit(oath, { habit: 0, dayIndex: 1, object: "", gesture: "victory", expiresAt: 0 }, "x")).resolves.toEqual({ status: "unavailable" });
    expect(calls).toEqual([]);
  });

  it.each([["thumbs_up"], ["victory"], ["open_palm"]] as const)("the server's %s is shown and is the gesture /proof/verify is asked about", async (gesture) => {
    const random = jest.spyOn(Math, "random");
    try {
      const { calls, proof } = backend();
      expect(gestureText(gesture)).toEqual(expect.any(String)); // what F1 shows the user
      await proof.submit(oath, { habit: 0, dayIndex: 1, object: "book", gesture, expiresAt: 0 }, "x");
      expect(calls.find((x) => x.path === "/proof/verify")!.body.expectedGesture).toEqual(expect.stringContaining(gesture === "thumbs_up" ? "thumbs up" : gesture === "victory" ? "victory" : "open palm"));
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

describe("habit details the server is missing (a solo Oath is Active as soon as it is created)", () => {
  const me = "Me11111111111111111111111111111111111111111";
  const solo = { ...oath, creator: me } as unknown as OathFacts;
  beforeEach(() => {
    const { useSession } = jest.requireActual("@/state/session") as typeof import("@/state/session");
    useSession.setState({ wallet: me });
    useDeviceOaths.getState().remember(solo.id, { goal: "Exercise · Read", habits: ["Exercise", "Read"], habitObjects: ["10 push-ups", "book"] });
  });

  it("re-sends the phone's details and asks again, so the challenge names the habit's own object", async () => {
    let saved: unknown = null;
    const calls: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      calls.push(`${init?.method ?? "GET"} ${path}`);
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      if (path.endsWith("/details") && (init?.method ?? "GET") === "GET") return json(saved ?? { goalText: null });
      if (path === "/api/oaths/details") { saved = { ...JSON.parse(String(init!.body)) }; return json({ oath: solo.id, ...(saved as object) }, 201); }
      if (path === "/api/proof/challenge") return json(habitChallenge({ object: saved ? "10 push-ups" : "dumbbell", freezeAfter: saved ? 4 : undefined }));
      return json({ error: "unexpected" }, 500);
    }) as unknown as typeof fetch;
    const c = await httpProof(createHttpClient(() => "t", "http://api", f)).challenge(solo, 0, 0);
    expect(c).toMatchObject({ object: "10 push-ups", freezeAfter: 4 });
    expect(saved).toMatchObject({ oath: solo.id, goalText: "Exercise · Read", habits: ["Exercise", "Read"], habitObjects: ["10 push-ups", "book"] });
    expect(calls).toEqual(["POST /api/proof/challenge", "GET /api/oaths/" + solo.id + "/details", "POST /api/oaths/details", "POST /api/proof/challenge"]);
  });

  it("takes the server's details when they differ (another member, or the server's copy is the saved one)", async () => {
    const f = (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (path.endsWith("/details")) return json({ goalText: "Exercise · Read", habits: ["Exercise", "Read"], habitObjects: ["20 squats", "book"] });
      if (path === "/api/proof/challenge") return json(habitChallenge({ object: "20 squats" }));
      return new Response("{}", { status: 500 });
    }) as unknown as typeof fetch;
    const other = "Oath2222222222222222222222222222222222222222";
    useDeviceOaths.getState().remember(other, { goal: "Exercise · Read", habits: ["Exercise", "Read"], habitObjects: ["10 push-ups", "book"] });
    const c = await httpProof(createHttpClient(() => "t", "http://api", f)).challenge({ ...solo, id: other } as OathFacts, 0, 0);
    expect(c.object).toBe("20 squats");
    expect(useDeviceOaths.getState().habitObjects[other]).toEqual(["20 squats", "book"]); // the phone now shows the server's
  });
});
