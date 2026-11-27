// A pose sample turned upright. RepCounterView rotates its analysis frame to the nearest 90° of the phone's roll (its
// gravity bucket), so image-down is gravity-down only to within the residual roll it reports per sample as `tilt`
// (signed degrees, positive = the phone turned further clockwise than its bucket, seen from the screen; the contract's
// "gravity / tilt" section). The engine's posture checks and the vertical reading assume image-down = gravity-down, and
// a phone propped 14–19° off lost up to ~30% of honest reps (contract, limit 10). RepSet turns every sample back by the
// tilt before the counter AND the trace, so the server's recount sees the same numbers.
//
// Sign (RepCounterView.kt: roll = atan2(-gx, gy) from the gravity sensor, tilt = roll − bucket): turning the phone
// clockwise by t turns the camera about its axis. The front camera faces the user and its analysis frame is not
// mirrored, so the scene turns clockwise in the frame: gravity-down lands at (−sin t, cos t) (x right, y down, in
// pixel proportions). Rotating every point by −t about the frame's centre brings it back to (0, 1). The back camera
// looks the other way, so its scene turns counterclockwise and the fix is +t.
import { SAMPLE_INTS } from "@kept/engine";

/**
 * `p` (36 ints: x‰, y‰, visibility% per joint, as RepCounterView sends them) rotated by the tilt about the frame centre,
 * aspect-corrected (x is scaled to pixel proportions before rotating and back after), rounded and clamped to 0..1000,
 * visibility untouched. No tilt, no pose (`[]`) or an empty pose (36 zeros) come back as they are.
 */
export function uprightPose(p: number[], tiltDeg: number, aspect: number, facing: "front" | "back" = "front"): number[] {
  if (p.length !== SAMPLE_INTS || !tiltDeg || !Number.isFinite(tiltDeg) || !(aspect > 0) || p.every((v) => v === 0)) return p;
  const a = ((facing === "front" ? -tiltDeg : tiltDeg) * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const out = p.slice();
  for (let j = 0; j < SAMPLE_INTS; j += 3) {
    const x = (p[j]! - 500) * aspect, y = p[j + 1]! - 500;
    out[j] = clamp(Math.round(500 + (x * cos - y * sin) / aspect));
    out[j + 1] = clamp(Math.round(500 + x * sin + y * cos));
  }
  return out;
}

const clamp = (v: number) => (v <= 0 ? 0 : v > 1000 ? 1000 : v); // <= so a rounded -0 is a plain 0
