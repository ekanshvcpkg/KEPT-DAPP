// What the native module returns, turned into the verdict the app sends. Kept free of native imports so Jest
// covers it: the Kotlin side only runs the models and hands back raw strings (the model's text, MediaPipe's label).

export type DevicePhotoVerdict = {
  proofHash: string;
  objectPresent: boolean;
  objectConfidence: number;
  gestureSeen: string;
  gestureMatches: boolean;
  looksLikeScreenOrPrintout: boolean;
  reason: string;
  model: string;
  ms: number;
  /** The model answered with nothing usable. Not a failed photo: the app asks for a retry instead of sending it. */
  inconclusive: boolean;
};

/** What `analyze` resolves with on the native side. */
export type RawDeviceAnalysis = { proofHash: string; gestureSeen: string; modelText: string; model: string; ms: number };

const REASON_MAX = 200;
export const UNREADABLE_REASON = "Could not read the model's answer";

/** MediaPipe says `Closed_Fist`, the app says `closed_fist` or "closed fist": compare letters and digits only. */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The gesture a label or phrase means, in one spelling; null for something that isn't a gesture we ask for. */
export function canonicalGesture(label: string): string | null {
  const s = squash(label);
  if (s.startsWith("thumbsup") || s.startsWith("thumbup")) return "thumbs_up";
  if (s.startsWith("victory")) return "victory";
  if (s.startsWith("openpalm")) return "open_palm";
  if (s.startsWith("closedfist")) return "closed_fist";
  if (s.startsWith("pointingup")) return "pointing_up";
  return null;
}

export function gestureMatches(seen: string, expected: string): boolean {
  const want = canonicalGesture(expected);
  return want !== null && want === canonicalGesture(seen);
}

export type ModelAnswer = { objectPresent: boolean; objectConfidence: number; looksLikeScreenOrPrintout: boolean; reason: string };

/**
 * The JSON object in the model's text, however it is wrapped (fenced, with chatter around it), or null when
 * the text has none or it is not what we asked for. Never throws: empty text and freeform text are answers too.
 */
export function parseModelAnswer(text: string | null | undefined): ModelAnswer | null {
  if (typeof text !== "string") return null;
  const open = text.indexOf("{");
  if (open < 0) return null;
  let parsed: unknown;
  // The outermost braces first; a stray "}" in the chatter after the object shortens the slice until it parses.
  for (let close = text.lastIndexOf("}"); close > open; close = text.lastIndexOf("}", close - 1)) {
    try { parsed = JSON.parse(text.slice(open, close + 1)); break; } catch { /* try a shorter slice */ }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.objectPresent !== "boolean") return null;
  const confidence = typeof o.objectConfidence === "number" && Number.isFinite(o.objectConfidence) ? o.objectConfidence : 0;
  return {
    objectPresent: o.objectPresent,
    objectConfidence: Math.min(1, Math.max(0, confidence)),
    // Missing means we can't say it isn't a screen: assume it is.
    looksLikeScreenOrPrintout: typeof o.looksLikeScreenOrPrintout === "boolean" ? o.looksLikeScreenOrPrintout : true,
    reason: (typeof o.reason === "string" && o.reason.trim() ? o.reason : "No reason given").slice(0, REASON_MAX),
  };
}

export function buildVerdict(raw: RawDeviceAnalysis, expectedGesture: string): DevicePhotoVerdict {
  const answer = parseModelAnswer(raw.modelText);
  return {
    proofHash: raw.proofHash,
    gestureSeen: raw.gestureSeen,
    gestureMatches: gestureMatches(raw.gestureSeen, expectedGesture),
    objectPresent: answer?.objectPresent ?? false,
    objectConfidence: answer?.objectConfidence ?? 0,
    looksLikeScreenOrPrintout: answer?.looksLikeScreenOrPrintout ?? true,
    reason: answer?.reason ?? UNREADABLE_REASON,
    model: raw.model,
    ms: raw.ms,
    inconclusive: answer === null,
  };
}
