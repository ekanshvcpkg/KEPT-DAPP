// A live rep set (push-ups, squats): the camera counts on the phone (kept-gesture RepCounterView: CameraX + MediaPipe
// Pose), the shared engine (@kept/engine reps) turns pose samples into reps, the Keeper counts aloud, and at a random
// rep it calls "Freeze!" for a liveness photo showing the challenge gesture. The whole pose trace goes to the backend,
// which recounts it with the same engine (docs/notes/REP_COUNTER_CONTRACT.md); the phone's number is only a display.
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { RepCounterView } from "kept-gesture";
import type { RepCounterHandle } from "kept-gesture";
import { RepCounter } from "@kept/engine";
import type { Exercise, RepEvent, Trace } from "@kept/engine";
import type { RepEvidence } from "@/api";
import { t } from "@/copy";
import { Button } from "@/components/actions";
import { Chip, ChipRow } from "@/components/content/Basics";
import { Icon, Text, loopCycles, useAnimationLifecycle } from "@/components/primitives";
import { color, duration, metrics, radius, type as typeStyles } from "@/theme";
import { haptic } from "@/lib/haptics";
import { repSetHype, sayCount, sayLine, stopHype } from "@/features/keeper/countVoice";
import type { HypeCoach } from "@/features/keeper/hypeCoach";

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

export function RepSet({ exercise, target, gesture, freezeAfter, secondsLeft, onCounting, onNoTime, onDone, onAbort }: {
  exercise: Exercise; target: number; gesture: string;
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
  const lastLog = useRef(-1e9);
  const rawLog = useRef<{ t: number[]; p: number[] }>({ t: [], p: [] });
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
  // The Keeper's hype lines between the counts (features/keeper/hypeCoach.ts): one coach per attempt, on the attempt's
  // timers; a line plays only while counting (never in the Freeze), the done line also as the screen closes.
  const hype = useRef<HypeCoach | null>(null);
  const coach = useCallback(() => (hype.current ??= repSetHype(target, {
    schedule: (ms, fn, keep) => { if (keep) setTimeout(fn, ms); else later(ms, fn); },
    canSpeak: (s) => phaseRef.current === "counting" || (s === "done" && phaseRef.current === "done"),
  })), [target, later]);
  useEffect(() => () => { if (phaseRef.current !== "done") stopHype(); }, []);
  // The counter's "setup" right after the Freeze is the freeze's own (its end already got the "after the photo" line);
  // any other "setup" is a camera stall, which gets a welcome back at the next "ready".
  const freezeEnded = useRef(false);
  const startT = useRef<number | null>(null);
  const pauseOpen = useRef<[number, number] | null>(null);
  const [count, setCount] = useState(0);
  // During a set: false until the counter sees the start position (then "Go!"), back to false after a camera stall.
  const [inPosition, setInPosition] = useState(false);
  const [hint, setHint] = useState<string | null>(t("additions.reps.frameHint"));
  const tilted = useRef(false);
  // Start waits for a level phone: the first onPose with |tilt| <= TILT_MAX (and none tilted since).
  const [level, setLevel] = useState(false);

  /** Throws the set away and goes back to setup, saying why (the server would refuse it). */
  const restart = useCallback((why: Parameters<typeof t>[0]) => {
    if (__DEV__) console.warn("[kept] rep set restart", why);
    attempt.current++;
    hype.current = null; stopHype(); freezeEnded.current = false;
    counter.current = null;
    samples.current = { t: [], p: [] };
    pauses.current = []; reps.current = []; pauseOpen.current = null;
    freeze.current = null; freezeJpeg.current = null;
    startT.current = null; lastT.current = -1;
    setCount(0);
    setInPosition(false);
    setPhase("setup");
    setHint(t(why));
    haptic.light();
  }, [setPhase]);

  const finish = useCallback(async (endT: number) => {
    setPhase("done"); // no sample after the one that completed the set enters the trace
    if (!coach().done()) sayLine("done");
    const shot = await cam.current?.capture().catch(() => null);
    const trace: Trace = { v: 1, engine: "reps@1", exercise, aspect: aspect.current, t: samples.current.t, p: samples.current.p, pauses: pauses.current };
    onDone({ trace, reps: reps.current, phoneCount: reps.current.length, freeze: freeze.current,
      keyframes: shot ? [{ kind: "final", t: shot.t || endT, jpeg: shot.jpeg, sha256: shot.sha256 }] : [] }, freezeJpeg.current);
  }, [exercise, onDone, setPhase, coach]);

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
      freezeEnded.current = true;
      coach().resume();
    });
  }, [gesture, setPhase, later, restart, coach]);

  const onEvent = useCallback((e: RepEvent) => {
    // Dev builds: every counter event goes to the Metro log, to tune the rules against real sets.
    if (__DEV__) console.warn("[kept] rep event", JSON.stringify(e));
    if (e.type === "lost") coach().lost();
    if (e.type === "rep") {
      reps.current.push({ startT: e.startT, bottomT: e.bottomT, endT: e.endT });
      setCount(e.n);
      sayCount(e.n);
      coach().rep(e.n, e.endT - e.startT);
      haptic.light();
      setHint((h) => (h === t("additions.reps.holdTop") ? null : h));
      if (e.n >= target) void finish(e.endT);
      else if (e.n === freezeAt && !freeze.current) startFreeze(e.endT, e.n);
    } else if (e.type === "ready") {
      setHint(null);
      setInPosition(true);
      freezeEnded.current = false;
      coach().ready();
    } else if ((e.type === "half_rep" || e.type === "lost") && e.t - lastJab.current > 8000) {
      lastJab.current = e.t;
      // A half rep gets a shaming hype line when one is due, else the plain "go lower".
      if (e.type === "lost" || !coach().halfRep()) sayLine(e.type === "half_rep" ? "halfRep" : "lost");
      setHint(t(e.type === "half_rep" ? "additions.reps.halfRep" : "additions.reps.lost"));
    } else if (e.type === "fault") {
      setHint(t("additions.reps.formHint"));
      coach().fault();
    } else if (e.type === "setup") {
      // After a camera stall the counter resumes on a short hold at the top.
      setHint(t("additions.reps.holdTop"));
      setInPosition(false);
      if (freezeEnded.current) freezeEnded.current = false;
      else coach().lost();
    }
  }, [target, finish, startFreeze, freezeAt, coach]);

  const onPose = useCallback((ev: { nativeEvent: { t: number; w: number; h: number; tilt?: number; p: number[] } }) => {
    const { t: ts, w, h, p } = ev.nativeEvent;
    gotPose.current = true;
    if (__DEV__ && ts - lastLog.current > 2000) {
      lastLog.current = ts;
      // Per joint (11..28 as in JOINTS) its visibility 0..100: what the pose model sees right now.
      const vis = p.length === 36 ? Array.from({ length: 12 }, (_, j) => p[j * 3 + 2]) : [];
      console.warn("[kept] pose", JSON.stringify({ w, h, rot: (ev.nativeEvent as { rot?: number }).rot, tilt: ev.nativeEvent.tilt, phase: phaseRef.current, vis }));
    }
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
    if (__DEV__) {
      // Dev builds: the raw samples go to the Metro log in 2 s chunks, to tune the rules on real sets.
      rawLog.current.t.push(ts); rawLog.current.p.push(...(p.length === 36 ? p : EMPTY));
      if (rawLog.current.t.length >= 40) { console.warn("[kept] samples " + JSON.stringify({ aspect: aspect.current, ...rawLog.current })); rawLog.current = { t: [], p: [] }; }
    }
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
          {phase === "counting" ? (
            <Text style={[typeStyles.titleXl, { color: inPosition ? color.lime.base : color.text.primary, textAlign: "center" }]} accessibilityLiveRegion="polite">
              {inPosition ? t("additions.reps.statusGo") : t(exercise === "pushup" ? "additions.reps.statusPositionPushup" : "additions.reps.statusPositionSquat")}
            </Text>
          ) : null}
        </View>
        {phase === "freeze" ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: metrics.screen.gap, alignItems: "center" }}>
            {/* Read from 2 m away: the move to make, large and moving. */}
            <RaiseHandCue size={metrics.screen.gap * 7} />
            <Text style={[typeStyles.displayLg, { color: color.text.primary, textAlign: "center" }]}>{t("additions.reps.freezeHand")}</Text>
          </View>
        ) : null}
      </View>
      {hint ? <ChipRow justify="center"><Chip text={hint} icon="information-outline" tone="grey" /></ChipRow> : null}
      {/* Before the set: how to place the phone and where to stand, step by step. The freeze move is shown only when it happens. */}
      {phase === "setup" ? <SetupSteps exercise={exercise} /> : null}
      {phase === "setup" ? <Button kind="l" icon="arm-flex" label={t("additions.reps.start", { target, label })} onPress={start} disabled={!level} /> : null}
      {phase === "counting" || phase === "freeze" ? <Button kind="t" label={t("additions.reps.stop")} onPress={onAbort} /> : null}
    </View>
  );
}

/**
 * The freeze move, shown as a figure raising one hand: it lifts and tilts in a loop (motion tokens; still under Reduce
 * Motion, and the loop stops within the app's loop budget).
 */
function RaiseHandCue({ size }: { size: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  const onLayout = useAnimationLifecycle([p], () => {
    if (reduce) return;
    p.set(withRepeat(withSequence(withTiming(1, { duration: duration.pop }), withTiming(0, { duration: duration.pop })), loopCycles(duration.pop * 2), false));
  }, [reduce]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: -size * 0.12 * p.value }, { rotate: `${-12 * p.value}deg` }, { scale: 1 + 0.08 * p.value }] }));
  return (
    <Animated.View onLayout={onLayout} style={a} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Icon name="human-greeting" size={size} color={color.lime.base} />
    </Animated.View>
  );
}

/** The setup steps for an exercise: phone placement, where to stand, how to begin. */
function SetupSteps({ exercise }: { exercise: Exercise }) {
  const keys = exercise === "pushup"
    ? (["additions.reps.stepPushup1", "additions.reps.stepPushup2", "additions.reps.stepPushup3"] as const)
    : (["additions.reps.stepSquat1", "additions.reps.stepSquat2", "additions.reps.stepSquat3"] as const);
  return (
    <View style={{ gap: metrics.screen.gap / 2 }} accessibilityRole="list">
      <Text style={[typeStyles.monoLabel, { color: color.text.secondary }]}>{t("additions.reps.stepsTitle")}</Text>
      {keys.map((k, i) => (
        <View key={k} style={{ flexDirection: "row", gap: metrics.screen.gap / 2, alignItems: "flex-start" }}>
          <Text style={[typeStyles.monoValue, { color: color.lime.base }]}>{String(i + 1)}</Text>
          <Text style={[typeStyles.body, { color: color.text.primary, flex: 1 }]}>{t(k)}</Text>
        </View>
      ))}
    </View>
  );
}
