// Test fixtures: a recorded set whose Freeze is held longer. The golden vectors froze for ~3.5 s (the old RepSet
// freeze); RepSet's freeze now waits for the rep's spoken number, says "Freeze! One hand up. Hold it.", takes the photo
// 0.8 s later and holds 2 s more (about 4.6–5.4 s). A real person holds still until counting resumes; this does the
// same to a recording: the last sample at `holdFrom` is repeated every 50 ms for `extraMs`, later samples move later.
export function stretchFreeze(trace: { t: number[]; p: number[] }, holdFrom: number, extraMs: number): { t: number[]; p: number[] } {
  const i0 = trace.t.indexOf(holdFrom);
  if (i0 < 0) throw new Error(`no sample at t=${holdFrom}`);
  const t: number[] = [], p: number[] = [];
  for (let i = 0; i < trace.t.length; i++) {
    t.push(trace.t[i]! + (i > i0 ? extraMs : 0)); p.push(...trace.p.slice(i * 36, i * 36 + 36));
    if (i === i0) for (let x = holdFrom + 50; x <= holdFrom + extraMs; x += 50) { t.push(x); p.push(...trace.p.slice(i0 * 36, i0 * 36 + 36)); }
  }
  return { t, p };
}

/** The freeze-resume vector's freeze ends at this sample (its pause window [7050, 10500]). */
export const FREEZE_RESUME_HOLD_END = 10_500;
/** How much longer than recorded the tests hold the Freeze. */
export const FREEZE_EXTRA_MS = 3_000;
