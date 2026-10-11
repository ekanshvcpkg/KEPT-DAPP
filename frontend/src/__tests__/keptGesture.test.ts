// kept-gesture, below the native bridge: reading the model's answer and matching the gesture. Both used to live
// in Kotlin, where an empty or freeform answer threw inside the bridge and "closed fist" never matched Closed_Fist.
import { buildVerdict, canonicalGesture, gestureMatches, parseModelAnswer, UNREADABLE_REASON } from "kept-gesture/src/verdict";

const GOOD = '{"objectPresent":true,"objectConfidence":0.82,"looksLikeScreenOrPrintout":false,"reason":"dumbbell visible"}';
const raw = (modelText: string, gestureSeen = "Thumb_Up") => ({ proofHash: "a".repeat(64), gestureSeen, modelText, model: "m", ms: 5 });

describe("gesture matching", () => {
  it.each([
    ["Thumb_Up", "thumbs up"],
    ["Victory", "victory sign (index and middle finger in a V)"],
    ["Open_Palm", "open palm facing the camera"],
    ["Closed_Fist", "closed fist"],
    ["Pointing_Up", "pointing up"],
    // the app's own labels, underscored, against MediaPipe's
    ["Closed_Fist", "closed_fist"],
    ["Pointing_Up", "pointing_up"],
    ["thumbs_up", "Thumb_Up"],
  ])("%s matches %s", (seen, expected) => {
    expect(gestureMatches(seen, expected)).toBe(true);
  });

  it("does not match a different gesture, nothing seen, or a label it doesn't know", () => {
    expect(gestureMatches("Victory", "closed fist")).toBe(false);
    expect(gestureMatches("Closed_Fist", "pointing up")).toBe(false);
    expect(gestureMatches("None", "thumbs up")).toBe(false);
    expect(gestureMatches("", "")).toBe(false);
    expect(gestureMatches("Waving", "Waving")).toBe(false);
    expect(canonicalGesture("ILoveYou")).toBeNull();
  });
});

describe("reading the model's answer", () => {
  it("reads plain JSON", () => {
    expect(parseModelAnswer(GOOD)).toEqual({ objectPresent: true, objectConfidence: 0.82, looksLikeScreenOrPrintout: false, reason: "dumbbell visible" });
  });
  it("reads fenced JSON, and JSON with chatter around it", () => {
    expect(parseModelAnswer("```json\n" + GOOD + "\n```")?.objectPresent).toBe(true);
    expect(parseModelAnswer("Sure! Here is the result: " + GOOD + " Hope that helps {not json}")?.objectConfidence).toBe(0.82);
  });
  it("returns null, never throws, for empty, missing, freeform and broken text", () => {
    for (const text of ["", "   ", null, undefined, "I can see a dumbbell.", "}{", "{", '{"objectPresent": tru', "[]", '{"unrelated":1}', '{"objectPresent":"yes"}']) {
      expect(parseModelAnswer(text as string)).toBeNull();
    }
  });
  it("keeps numbers and text in range, and doubts a photo it was not told was live", () => {
    const a = parseModelAnswer('{"objectPresent":true,"objectConfidence":7,"reason":"' + "x".repeat(500) + '"}')!;
    expect(a.objectConfidence).toBe(1);
    expect(a.reason).toHaveLength(200);
    expect(a.looksLikeScreenOrPrintout).toBe(true);
    expect(parseModelAnswer('{"objectPresent":false,"objectConfidence":-3}')!.objectConfidence).toBe(0);
  });
});

describe("the verdict", () => {
  it("combines the model's answer and MediaPipe's label", () => {
    expect(buildVerdict(raw(GOOD), "thumbs up")).toMatchObject({ objectPresent: true, gestureMatches: true, gestureSeen: "Thumb_Up", inconclusive: false, looksLikeScreenOrPrintout: false });
    expect(buildVerdict(raw(GOOD, "Victory"), "thumbs up").gestureMatches).toBe(false);
  });
  it.each(["", "I think it is a book", "```\n```"])("a safe failure for %p, flagged inconclusive instead of crashing", (text) => {
    const v = buildVerdict(raw(text), "thumbs up");
    expect(v).toMatchObject({ objectPresent: false, objectConfidence: 0, looksLikeScreenOrPrintout: true, reason: UNREADABLE_REASON, inconclusive: true });
    expect(v.proofHash).toHaveLength(64);
  });
});
