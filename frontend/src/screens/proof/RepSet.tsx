// A live rep set (push-ups, squats): the camera counts on the phone (kept-gesture RepCounterView: CameraX + MediaPipe
// Pose), the shared engine (@kept/engine reps) turns pose samples into reps, the Keeper counts aloud, and at a random
// rep it calls "Freeze!" for a liveness photo showing the challenge gesture. The whole pose trace goes to the backend,
// which recounts it with the same engine (docs/notes/REP_COUNTER_CONTRACT.md); the phone's number is only a display.
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { RepCounterView } from "kept-gesture";
import type { RepCounterHandle } from "kept-gesture";
import { RepCounter } from "@kept/engine";
import type { Exercise, RepEvent, Trace } from "@kept/engine";
import type { RepEvidence } from "@/api";
import { t } from "@/copy";
import { Button } from "@/components/actions";
import { Chip, ChipRow, Title } from "@/components/content/Basics";
import { Text } from "@/components/primitives";
import { color, metrics, radius, type as typeStyles } from "@/theme";
import { haptic } from "@/lib/haptics";
import { sayCount, sayLine } from "@/features/keeper/countVoice";

type Phase = "setup" | "counting" | "freeze" | "done";
const EMPTY = Array.from({ length: 36 }, () => 0);
// The engine's incline checks need image-down = gravity-down. The camera reports per sample how far the phone is rolled off
// its 90° bucket (`tilt`): above TILT_MAX the set doesn't start, and mid-set the samples go into the trace and the counter
// as empty poses (occlusion: a rep in progress is dropped after the engine's LOST_MS, and the server's recount sees the
// same zeros). Not a pause window: the server accepts exactly one pause, the freeze. Counting resumes below TILT_RESUME.
const TILT_MAX = 20;
const TILT_RESUME = 16;
// What the server's recount refuses (backend/src/v4/repProof.ts): a sample gap over 2 s or a set over 240 s. The phone
// stops such a set at once (with a little margin) instead of letting the user finish it for nothing.
const MAX_GAP_MS = 1_900;
const MAX_SET_MS = 235_000;
/** Seconds a set may need, so it isn't started on a challenge about to expire (~3 s a rep plus the freeze). */
export const repSetSeconds = (target: number) => target * 3 + 20;

export function RepSet({ exercise, target, gesture, gestureLabel, freezeAfter, secondsLeft, onCounting, onNoTime, onDone, onAbort }: {
  exercise: Exercise; target: number; gesture: string; gestureLabel: string;
  /** The server's pick of the rep after which "Freeze!" comes (the challenge's freezeAfter); a local pick without it (Demo). */
  freezeAfter?: number;
  /** Seconds left on the challenge, and what to do when a set wouldn't fit in them. */
  secondsLeft: () => number; onNoTime: () => void;
  /** True while a set is running (the proof screen doesn't expire the challenge under a running set). */
  onCounting?: (counting: boolean) => void;
  onDone: (evidence: RepEvidence, freezeJpeg: string | null) => void; onAbort: () => void;
}) {
  const cam = useRef<RepCounterHandle>(null);
  const counter = useRef<RepCounter | null>(null);
  const samples = useRef<{ t: number[]; p: number[] }>({ t: [], p: [] });
  const pauses = useRef<[number, number][]>([]);
  const reps = useRef<RepEvidence["reps"]>([]);
  const aspect = useRef(0.75);
  const lastT = useRef(-1);
  const lastJab = useRef(-1e9);
  const freeze = useRef<RepEvidence["freeze"]>(null);
  const freezeJpeg = useRef<string | null>(null);
  // The freeze comes at the server's pick (30–70% of the set, from the challenge), so a recorded set can't be replayed.
  const [localFreezeAt] = useState(() => Math.max(1, Math.min(target - 1, Math.ceil(target * (0.3 + Math.random() * 0.4)))));
  const freezeAt = freezeAfter && freezeAfter >= 1 && freezeAfter < target ? freezeAfter : localFreezeAt;
  // Every timer of a set is tied to its attempt: a restarted set or a closed screen ignores the old set's timers.
  const attempt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, fn: () => void) => {
    const mine = attempt.current;
    timers.current.push(setTimeout(() => { if (attempt.current === mine) fn(); }, ms));
  }, []);
  useEffect(() => () => { attempt.current++; timers.current.forEach(clearTimeout); }, []);
  const [phase, setPhaseState] = useState<Phase>("setup");
  // What a pose sample does is decided synchronously from this ref, so the trace and the live counter see the same samples.
  const phaseRef = useRef<Phase>("setup");
  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next; setPhaseState(next);
    onCounting?.(next === "counting" || next === "freeze");
  }, [onCounting]);
  const startT = useRef<number | null>(null);
  const pauseOpen = useRef<[number, number] | null>(null);
  const [count, setCount] = useState(0);
  const [hint, setHint] = useState<string | null>(t("additions.reps.frameHint"));
  const tilted = useRef(false);
  // Start waits for a level phone: the first onPose with |tilt| <= TILT_MAX (and none tilted since).
  const [level, setLevel] = useState(false);

  /** Throws the set away and goes back to setup, saying why (the server would refuse it). */
  const restart = useCallback((why: Parameters<typeof t>[0]) => {
    attempt.current++;
    counter.current = null;
    samples.current = { t: [], p: [] };
    pauses.current = []; reps.current = []; pauseOpen.current = null;
    freeze.current = null; freezeJpeg.current = null;
    startT.current = null; lastT.current = -1;
    setCount(0);
    setPhase("setup");
    setHint(t(why));
    haptic.light();
  }, [setPhase]);

  const finish = useCallback(async (endT: number) => {
    setPhase("done"); // no sample after the one that completed the set enters the trace
    sayLine("done");
    const shot = await cam.current?.capture().catch(() => null);
    const trace: Trace = { v: 1, engine: "reps@1", exercise, aspect: aspect.current, t: samples.current.t, p: samples.current.p, pauses: pauses.current };
    onDone({ trace, reps: reps.current, phoneCount: reps.current.length, freeze: freeze.current,
      keyframes: shot ? [{ kind: "final", t: shot.t || endT, jpeg: shot.jpeg, sha256: shot.sha256 }] : [] }, freezeJpeg.current);
  }, [exercise, onDone, setPhase]);

  const startFreeze = useCallback((repT: number, n: number) => {
    setPhase("freeze");
    sayLine("freeze");
    // Samples during the freeze go into the trace but not the counter; their exact [first, last] t becomes a pause
    // window, which the server's recount skips the same way.
    // The photo is taken 1.5 s in (time to raise the hand), with one retry if the camera had no frame.
    const shoot = (retry: boolean) => void cam.current?.capture().then((shot) => {
      freezeJpeg.current = shot.jpeg;
      freeze.current = { afterRep: n, promptT: repT, t: shot.t, gesture, sha256: shot.sha256 };
    }).catch(() => { if (retry) later(700, () => shoot(false)); });
    later(1500, () => shoot(true));
    later(3500, () => {
      if (phaseRef.current !== "freeze") return;
      // No freeze photo, no proof: the set starts again now, not after the last rep.
      if (!freeze.current) { restart("additions.reps.noFreeze"); return; }
      setPhase("counting"); setHint(null);
    });
  }, [gesture, setPhase, later, restart]);

  const onEvent = useCallback((e: RepEvent) => {
    if (e.type === "rep") {
      reps.current.push({ startT: e.startT, bottomT: e.bottomT, endT: e.endT });
      setCount(e.n);
      sayCount(e.n);
      haptic.light();
      setHint((h) => (h === t("additions.reps.holdTop") ? null : h));
      if (e.n >= target) void finish(e.endT);
      else if (e.n === freezeAt && !freeze.current) startFreeze(e.endT, e.n);
    } else if (e.type === "ready") {
      setHint(null);
    } else if ((e.type === "half_rep" || e.type === "lost") && e.t - lastJab.current > 8000) {
      lastJab.current = e.t;
      sayLine(e.type === "half_rep" ? "halfRep" : "lost");
      setHint(t(e.type === "half_rep" ? "additions.reps.halfRep" : "additions.reps.lost"));
    } else if (e.type === "fault") {
      setHint(t("additions.reps.formHint"));
    } else if (e.type === "setup") {
      // After a camera stall the counter resumes on a short hold at the top.
      setHint(t("additions.reps.holdTop"));
    }
  }, [target, finish, startFreeze, freezeAt]);

  const onPose = useCallback((ev: { nativeEvent: { t: number; w: number; h: number; tilt?: number; p: number[] } }) => {
    const { t: ts, w, h, p } = ev.nativeEvent;
    gotPose.current = true;
    const ph = phaseRef.current;
    if (ph === "done") return;
    const wasTilted = tilted.current;
    tilted.current = Math.abs(ev.nativeEvent.tilt ?? 0) > (wasTilted ? TILT_RESUME : TILT_MAX);
    setLevel(!tilted.current);
    if (tilted.current) setHint(t("additions.reps.level"));
    else if (wasTilted) setHint(ph === "setup" ? t("additions.reps.frameHint") : null);
    if (ph === "setup") return; // the trace runs from Start to the rep that completes the set
    if (startT.current === null) { startT.current = ts; if (w > 0 && h > 0) aspect.current = w / h; }
    if (ts <= lastT.current) return; // strictly increasing, as the server requires
    // The engine's angles depend on the frame's shape: turning the phone mid-set changes it, so the set starts again.
    if (w > 0 && h > 0 && Math.abs(w / h - aspect.current) > 0.01) { restart("additions.reps.keepStill"); return; }
    // A camera stall over 2 s or an overlong set would be refused by the server's recount: start again now.
    if (lastT.current >= 0 && ts - lastT.current > MAX_GAP_MS) { restart("additions.reps.restart"); return; }
    if (ts - startT.current > MAX_SET_MS) { restart("additions.reps.tooLong"); return; }
    lastT.current = ts;
    // A tilted phone's pose can't be trusted (image-down isn't gravity-down): it is recorded and counted as no pose.
    const sample = p.length === 36 && !tilted.current ? p : EMPTY;
    samples.current.t.push(ts);
    samples.current.p.push(...sample);
    if (ph === "freeze") {
      pauseOpen.current = pauseOpen.current ? [pauseOpen.current[0], ts] : [ts, ts];
      return;
    }
    if (pauseOpen.current) { pauses.current.push(pauseOpen.current); pauseOpen.current = null; }
    counter.current ??= new RepCounter(exercise, aspect.current);
    for (const e of counter.current.push({ t: ts, p: sample })) {
      // While tilted the "level" hint stays up: no "lost you" / form jabs for the masked samples (reps still go through).
      if (tilted.current && (e.type === "lost" || e.type === "half_rep" || e.type === "fault")) continue;
      onEvent(e);
    }
  }, [exercise, onEvent, restart]);

  // No frame within a few seconds (no camera, permission or model): say so instead of a silent, disabled Start.
  const gotPose = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => { if (!gotPose.current) setHint(t("additions.reps.cameraError")); }, 6000);
    return () => clearTimeout(timer);
  }, []);
  const onReady = useCallback(() => setHint((h) => (h === t("additions.reps.cameraError") ? t("additions.reps.frameHint") : h)), []);

  const start = () => {
    if (!level || tilted.current) return;
    if (secondsLeft() < repSetSeconds(target)) { onNoTime(); return; }
    setPhase("counting"); sayLine("go");
  };
  const label = exercise === "pushup" ? t("additions.reps.pushups") : t("additions.reps.squats");
  return (
    <View style={{ flex: 1, gap: metrics.screen.gap }}>
      <View style={{ flex: 1, borderRadius: radius.cam, overflow: "hidden", backgroundColor: color.surface[1] }}>
        <RepCounterView ref={cam} style={{ flex: 1 }} active={phase !== "done"} facing="front" sampleIntervalMs={50}
          onPose={onPose} onReady={onReady} onError={() => setHint(t("additions.reps.cameraError"))} />
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: metrics.screen.gap, alignItems: "center" }}>
          <Text style={[typeStyles.displayLg, { color: color.text.primary }]} accessibilityLiveRegion="polite">{String(count)}</Text>
          <Text style={[typeStyles.monoLabel, { color: color.text.secondary }]}>{t("additions.reps.ofTarget", { target, label })}</Text>
        </View>
        {phase === "freeze" ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: metrics.screen.gap, alignItems: "center" }}>
            <Title heading={t("additions.reps.freeze", { gesture: gestureLabel })} align="center" />
          </View>
        ) : null}
      </View>
      {hint ? <ChipRow justify="center"><Chip text={hint} icon="information-outline" tone="grey" /></ChipRow> : null}
      {phase === "setup" ? <Button kind="l" icon="arm-flex" label={t("additions.reps.start", { target, label })} onPress={start} disabled={!level} /> : null}
      {phase === "counting" || phase === "freeze" ? <Button kind="t" label={t("additions.reps.stop")} onPress={onAbort} /> : null}
    </View>
  );
}
