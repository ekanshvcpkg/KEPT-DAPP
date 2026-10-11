// F · Daily proof (screens.md F1–F5, with the one-photo-per-habit rule, DECISIONS D-98). Each habit of an Oath is proven
// each day with one live photo, no gallery, of that habit's own object and the gesture the server picks: F1 shoots with
// the back camera, F2 checks, then pass / fail / unavailable / expired. A pass opens F3 (the habits still to do) or, for
// the last habit of the day, F5. F4 and F4·chk are the same screens as F1 and F2 (the design's photo 2 no longer exists).
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { create } from "zustand";
import { keeperLines, t } from "@/copy";
import { Button } from "@/components/actions";
import { NavBar, useToast } from "@/components/chrome";
import { BrandStamp } from "@/components/brand/Brand";
import { Breakdown, Chip, ChipRow, Note, Title } from "@/components/content/Basics";
import { ProofCamera, Shutter } from "@/components/content/Camera";
import { MoneyMoment } from "@/components/content/Inputs";
import { RowList } from "@/components/content/Rows";
import { DayStrip, SignStatus } from "@/components/content/Status";
import { objectIconOfText, objectNameOfText } from "@/features/objects/proof";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen } from "@/components/layout/Screen";
import { clock as hms } from "@/lib/format";
import { useScreenFocused } from "@/lib/focus";
import { color, metrics } from "@/theme";
import { getApi, isApiError } from "@/api";
import type { Challenge, ProofOutcome } from "@/api";
import { useGo, useParams } from "@/app/nav";
import type { DesignId } from "@/app/routes";
import { oathActions, refreshOaths, useOath } from "@/features/oaths/hooks";
import type { OathView } from "@/features/oaths/model";
import { gestureKey, gestureText, listNames, memberName, skrWhole } from "@/features/oaths/present";
import { nowSeconds } from "@/features/time";
import { useUi } from "@/state/ui";
import { haptic } from "@/lib/haptics";

/** "lift for 20 minutes" → "Lift for 20 minutes" (a habit starts a sentence on F3). */
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pinned = (n: number) => metrics.button.height * n + metrics.pinned.gap * (n - 1) + metrics.pinned.bottom;

/** The proof in progress: today's challenge per habit and the last shot (kept for a retry on F2b). */
type ProofFeedback = { objectPresent?: boolean; gestureMatches?: boolean };
const useProof = create<{ challenges: Record<string, Challenge>; feedback: Record<string, ProofFeedback>; image: string | null; imageUri: string | null; set(p: Partial<{ challenges: Record<string, Challenge>; feedback: Record<string, ProofFeedback>; image: string | null; imageUri: string | null }>): void }>((set) => ({
  challenges: {}, feedback: {}, image: null, imageUri: null, set: (p) => set(p),
}));
const key = (id: string, habit: number) => `${id}:${habit}`;
/** Tests: seed a challenge as if it was issued earlier. */
export const storeChallenge = (id: string, habit: number, c: Challenge) => useProof.getState().set({ challenges: { ...useProof.getState().challenges, [key(id, habit)]: c } });
/** The challenge issued last on this run for the Oath (or for one habit of it); G2 sends its gesture to the group. */
export const challengeFor = (id: string, habit?: number): Challenge | undefined => {
  const all = useProof.getState().challenges;
  if (habit !== undefined) return all[key(id, habit)];
  const mine = Object.entries(all).filter(([k]) => k.startsWith(`${id}:`)).map(([, c]) => c);
  return mine[mine.length - 1];
};

type P = { id: string; habit?: string | number };
/** Which habit a proof screen is for comes in the route: every screen that opens one passes it. */
function useProofScreen() {
  const p = useParams<P>();
  const habit = Number.isInteger(Number(p.habit)) && p.habit !== undefined && p.habit !== "" ? Number(p.habit) : 0;
  const { view } = useOath(p.id);
  return { id: p.id ?? "", habit, total: view?.habits.length ?? 1, view, h: view?.habits[habit] };
}
const navTitle = (v: OathView | null, habit: number) => (v ? (v.habits.length > 1 ? t("additions.proof.navHabit", { name: v.facts.name, n: habit + 1, total: v.habits.length }) : v.facts.name) : "");
const challengeLabel = (c: Challenge | undefined) => (c ? t("screens.F1.b0.label", { object: objectNameOfText(c.object), gesture: gestureText(c.gesture) }) : "");
/** "Habit 1 of 2" on the camera (nothing for an Oath with one habit). */
const pillOf = (total: number, habit: number) => (total > 1 ? { pill: t("additions.proof.pill", { n: habit + 1, total }) } : {});

/** Loads (or reuses) today's challenge for this habit; a new one once it has expired. */
function useChallenge(v: OathView | null, habit: number, fresh = false) {
  const stored = useProof((s) => (v ? s.challenges[key(v.facts.id, habit)] : undefined));
  // An expired stored challenge is replaced, not shown: Shoot sends an expired one to F2c, which is for a challenge that ran out while shooting.
  const [c, setC] = useState<Challenge | undefined>(() => (!fresh && stored && stored.expiresAt > nowSeconds() ? stored : undefined));
  const { replace } = useGo();
  // F2c "Take a new photo" lands back on a Shoot that was never unmounted (history.ts goes back to it, same key), still
  // holding the challenge that ran out. The fresh one F2c stored takes its place, or Shoot would bounce straight to F2c again.
  const usable = (x: Challenge | undefined) => (x && x.expiresAt > nowSeconds() ? x : undefined);
  const cur = usable(c) ?? (fresh ? undefined : usable(stored)) ?? c;
  useEffect(() => {
    if (!v || v.dayIndex === null) return;
    if (cur && cur.dayIndex === v.dayIndex && cur.habit === habit && cur.expiresAt > nowSeconds()) return;
    void getApi().proof.challenge(v.facts, habit, v.dayIndex, cur?.gesture).then((n) => {
      useProof.getState().set({ challenges: { ...useProof.getState().challenges, [key(v.facts.id, habit)]: n } });
      setC(n);
    }, (e: unknown) => replace(isApiError(e) && e.code === "OFFLINE" ? "M2" : "F2b", { id: v.facts.id, habit }));
  }, [v, habit, cur, replace]);
  return cur;
}

// ── F1·perm Camera permission ──
export function F1perm() {
  const { back, replace, close } = useGo();
  const { id, habit } = useProofScreen();
  const [perm, request, getPerm] = useCameraPermissions();
  const shoot = useCallback(() => replace("F1", { id, habit }), [replace, habit, id]);
  // Back from Settings with the camera allowed: on to the camera.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") void getPerm().then((r) => { if (r.granted) shoot(); }); });
    return () => sub.remove();
  }, [getPerm, shoot]);
  // Android won't ask again once access is denied for good: the way to allow it is Settings (D-91).
  const blocked = !!perm && !perm.granted && !perm.canAskAgain;
  return (
    <Screen bar={<NavBar onBack={() => close()} close />} bottomInset={pinned(2)} pinned={<>
      {blocked
        ? <Button kind="p" icon="cog-outline" label={t("additions.camera.openSettings")} onPress={() => { void Linking.openSettings(); }} />
        : <Button kind="p" icon="camera" label={t("screens.F1·perm.pin.0")} onPress={() => { void request().then((r) => { if (r.granted) shoot(); }); }} />}
      <Button kind="t" label={t("screens.F1·perm.pin.1")} onPress={back} />
    </>}>
      <ProofCamera state="off" object="camera-off-outline" label={t("screens.F1·perm.b1.label")} height={260} />
      <Title heading={t("screens.F1·perm.b2.title")} sub={t("screens.F1·perm.b2.sub")} align="center" />
    </Screen>
  );
}

/** A real capture takes well under a second; this only bounds one that never answers. */
const CAPTURE_TIMEOUT_MS = 10_000;
/** Mock Oaths only: a camera-less emulator still gets through the mock flow, so its wait is short. */
const DEMO_CAPTURE_TIMEOUT_MS = 1_500;
/** Stands in for the photo of a mock Oath when the camera can't deliver (the mock never reads it). Never used on chain. */
const DEMO_PHOTO = "data:image/jpeg;base64,mock";

/** What to submit for a shot: the photo; for a mock Oath alone a stand-in when the camera gave none; otherwise null (retake). */
export const photoToUse = (shot: string | null, mock: boolean): string | null => shot ?? (mock ? DEMO_PHOTO : null);

/** The shot as base64, or null if the camera failed or didn't answer in time. */
export async function capture(cam: CameraView | null, timeoutMs: number): Promise<string | null> {
  return (await captureShot(cam, timeoutMs))?.base64 ?? null;
}
async function captureShot(cam: CameraView | null, timeoutMs: number): Promise<{ base64: string; uri: string } | null> {
  if (!cam) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pic = await Promise.race([
      cam.takePictureAsync({ base64: true, quality: 0.5, skipProcessing: true }),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    return pic?.base64 && pic.uri ? { base64: pic.base64, uri: pic.uri } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── F1 / F4 Shoot ──
function Shoot() {
  const { go, replace, close } = useGo();
  const toast = useToast();
  const { id, habit, total, view, h } = useProofScreen();
  // Only a mock Oath (Demo) takes a stand-in photo: its proof goes to the mock, which never reads the image.
  const mock = view?.facts.source === "mock";
  const [perm] = useCameraPermissions();
  // The camera runs only while this screen is in front: checking, a failed check or anything else on top releases it.
  const focused = useScreenFocused();
  const c = useChallenge(view, habit);
  const cam = useRef<CameraView>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(nowSeconds);
  useEffect(() => { const i = setInterval(() => setNow(nowSeconds()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { if (perm && !perm.granted) replace("F1·perm", { id, habit }); }, [perm, replace, id, habit]);
  useEffect(() => { if (c && c.expiresAt <= now) replace("F2c", { id, habit }); }, [c, now, replace, id, habit]);
  const left = c ? Math.max(0, c.expiresAt - now) : 0;
  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // A chain Oath never gets an invented photo: if the camera fails the user retakes it (the timer keeps running).
      const shot = await captureShot(cam.current, mock ? DEMO_CAPTURE_TIMEOUT_MS : CAPTURE_TIMEOUT_MS);
      const image = photoToUse(shot?.base64 ?? null, mock);
      if (!image) { toast(t("additions.camera.failed")); return; }
      useProof.getState().set({ image, imageUri: shot?.uri ?? null });
      go("F2", { id, habit });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={navTitle(view, habit)} />} scroll={false}>
      <ProofCamera {...pillOf(total, habit)} state="idle" object={h ? objectIconOfText(h.object) : "camera"} label={challengeLabel(c)} {...(c && gestureKey(c.gesture) ? { gesture: gestureKey(c.gesture)! } : {})}>
        {perm?.granted && focused ? <CameraView ref={cam} style={{ flex: 1 }} facing={facing} /> : undefined}
      </ProofCamera>
      <ChipRow justify="center">
        <Chip text={t("screens.F1.b1.chip.0", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })} tone={left < 60 ? "red" : "grey"} icon="timer-outline" />
      </ChipRow>
      <Shutter onShutter={() => { void shoot(); }} onFlip={() => setFacing((f) => (f === "back" ? "front" : "back"))} disabled={!c || busy || !perm?.granted} />
    </Screen>
  );
}
export const F1 = () => <Shoot />;
/** The design's photo 2: the same screen, there is no second photo. */
export const F4 = F1;

// ── F2 Checking ── submits once, then replaces itself with the outcome.
function Check() {
  const { back, replace } = useGo();
  const { id, habit, view, h } = useProofScreen();
  const c = useProof((s) => s.challenges[key(id, habit)]);
  const started = useRef(false);
  const k = keeperLines("F2")[0]!;
  useEffect(() => {
    if (!view || !c || started.current) return;
    started.current = true;
    const { image, imageUri } = useProof.getState();
    void getApi().proof.submit(view.facts, c, image ?? "", imageUri ?? undefined).then(
      (r) => {
        if (r.status === "fail") useProof.getState().set({ feedback: { ...useProof.getState().feedback, [key(id, habit)]: { objectPresent: r.objectPresent, gestureMatches: r.gestureMatches } } });
        void refreshOaths(); if (r.status === "pass") haptic.success(); replace(next(r, view), { id, habit });
      },
      (e: unknown) => replace(isApiError(e) && e.code === "OFFLINE" ? "M2" : "F2b", { id, habit }),
    );
  }, [view, c, replace, id, habit]);
  return (
    <Screen bar={<NavBar onBack={back} title={navTitle(view, habit)} />}>
      <ProofCamera {...pillOf(view?.habits.length ?? 1, habit)} state="check" object={h ? objectIconOfText(h.object) : "camera"} label={t("screens.F2.b0.label")} {...(c && gestureKey(c.gesture) ? { gesture: gestureKey(c.gesture)! } : {})} />
      <ScreenKeeper id="F2" lines={[k]} />
    </Screen>
  );
}
function next(r: ProofOutcome, v: OathView): DesignId {
  switch (r.status) {
    case "pass": return r.dayKept ? "F5" : "F3";
    case "unavailable": return "F2b";
    case "expired": return "F2c";
    case "fail":
      // Group review of a habit's photo is a Demo feature until the backend has it (BACKEND_GAPS P1-27).
      if (r.attempts >= 3) return v.facts.reviewMode === "ai_group" && !v.facts.isSolo && v.facts.source === "mock" ? "F4a·g" : "F4a";
      return "F2a";
  }
}
export const F2 = () => <Check />;
export const F4chk = F2;

// ── F2a Failed ──
export function F2a() {
  const { replace, close } = useGo();
  const { id, habit, total, view, h } = useProofScreen();
  const c = useProof((s) => s.challenges[key(id, habit)]);
  const feedback = useProof((s) => s.feedback[key(id, habit)]);
  const k = keeperLines("F2a")[0]!;
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={navTitle(view, habit)} />} bottomInset={pinned(1)}
      pinned={<Button kind="p" icon="camera-retake-outline" label={t("screens.F2a.pin.0")} onPress={() => replace("F1", { id, habit })} />}>
      <ProofCamera {...pillOf(total, habit)} state="fail" object={h ? objectIconOfText(h.object) : "camera"} label={c ? t("screens.F2a.b0.label", { gesture: gestureText(c.gesture) }) : ""} {...(c && gestureKey(c.gesture) ? { gesture: gestureKey(c.gesture)! } : {})} />
      <ScreenKeeper id="F2a" lines={[k]} />
      {feedback?.objectPresent && feedback.gestureMatches === false && c && <Note text={t("additions.core.proofFeedback.objectOnly", { object: objectNameOfText(c.object), gesture: gestureText(c.gesture) })} />}
    </Screen>
  );
}

// ── F2b Check unavailable ── the photo is kept; Retry re-submits it.
export function F2b() {
  const { replace, close } = useGo();
  const { id, habit, view } = useProofScreen();
  const k = keeperLines("F2b")[0]!;
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={view ? t("screens.F2b.nav.title", { name: view.facts.name }) : ""} />} bottomInset={pinned(1)}
      pinned={<Button kind="p" icon="refresh" label={t("screens.F2b.pin.0")} onPress={() => replace("F2", { id, habit })} />}>
      <ScreenKeeper id="F2b" lines={[k]} />
      <Title heading={t("screens.F2b.b2.title")} sub={t("screens.F2b.b2.sub")} align="center" />
      <MoneyMoment value={t("screens.F2b.b3.value", { time: hms(view?.secondsToReset ?? 0) })} caption={t("screens.F2b.b3.caption")} fs={44} />
    </Screen>
  );
}

// ── F2c Challenge expired ── a fresh challenge replaces the old one.
export function F2c() {
  const { replace, close } = useGo();
  const { id, habit, view, h } = useProofScreen();
  const c = useChallenge(view, habit, true);
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={view ? t("screens.F2b.nav.title", { name: view.facts.name }) : ""} />} bottomInset={pinned(1)}
      pinned={<Button kind="p" icon="refresh" label={t("screens.F2c.pin.0")} disabled={!c} onPress={() => replace("F1", { id, habit })} />}>
      <Title heading={t("screens.F2c.b0.title")} sub={t("screens.F2c.b0.sub")} />
      <ProofCamera {...pillOf(view?.habits.length ?? 1, habit)} state="idle" object={h ? objectIconOfText(h.object) : "camera"} height={300}
        label={c ? t("screens.F2c.b1.label", { object: objectNameOfText(c.object).toLowerCase(), gesture: gestureText(c.gesture) }) : ""} {...(c && gestureKey(c.gesture) ? { gesture: gestureKey(c.gesture)! } : {})} />
    </Screen>
  );
}

// ── F3 Habit proven ── what is still to do today; the day is kept once every habit is in.
export function F3() {
  const { replace, go, close } = useGo();
  const { id, habit, view } = useProofScreen();
  const left = view ? view.habits.filter((x) => !x.done) : [];
  const upNext = left[0];
  const proven = view?.habits[habit];
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={view?.facts.name ?? ""} />} bottomInset={pinned(2)} pinned={<>
      <Button kind="p" icon="camera" label={t("screens.F3.pin.0")} disabled={!upNext} onPress={() => { if (upNext) replace("F1", { id, habit: upNext.index }); }} />
      <Button kind="t" label={t("screens.F3.pin.1")} onPress={() => go("B1")} />
    </>}>
      <SignStatus state="success" chip={t("screens.F3.b1.chip")} />
      <Title heading={t("screens.F3.b2.title", { habit: capitalise(proven?.name ?? "") })} sub={left.length === 1 ? t("additions.proof.f3SubOne") : t("additions.proof.f3SubMany", { left: left.length })} align="center" />
      {view ? <RowList rows={view.habits.map((x) => ({
        title: x.name, sub: objectNameOfText(x.object),
        leading: { kind: "icon" as const, icon: x.done ? "check-bold" as const : objectIconOfText(x.object), ...(x.done ? { bg: color.lime.base, fg: color.text.onLime } : {}) },
        ...(x.done ? { value: t("additions.proof.done"), valueColor: color.lime.base } : x.index === upNext?.index ? { value: t("additions.proof.next"), valueColor: color.text.primary } : {}),
        ...(x.done || !upNext ? {} : { chevron: true, onPress: () => replace("F1", { id, habit: x.index }) }),
      }))} /> : null}
      <Note text={t("screens.F3.b4.text")} />
    </Screen>
  );
}

// ── F4a 3 fails · AI only ──
export function F4a() {
  const { go, close } = useGo();
  const { view } = useProofScreen();
  const k = keeperLines("F4a")[0]!;
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={view?.facts.name ?? ""} />} bottomInset={pinned(1)}
      pinned={<Button kind="p" label={t("screens.F4a.pin.0")} onPress={() => go("B1")} />}>
      <ScreenKeeper id="F4a" lines={[k]} />
      <Title heading={t("screens.F4a.b2.title")} sub={view ? t("screens.F4a.b2.sub", { name: view.facts.name }) : ""} align="center" />
      <Breakdown rows={[
        { label: t("screens.F4a.b3.row0.l"), value: t("screens.F4a.b3.row0.v", { cost: skrWhole(view?.myMissCost ?? 0n) }), color: color.red.base },
        { label: t("screens.F4a.b3.row1.l"), value: t("screens.F4a.b3.row1.v", { hp: view?.facts.isSolo ? 35 : 20 }), color: color.red.base },
        { label: t("screens.F4a.b3.row2.l"), value: t("screens.F4a.b3.row2.v") },
      ]} />
    </Screen>
  );
}

// ── F4a·g 3 fails · group review ── the vote itself is G2 (screens/review).
export function F4ag() {
  const { replace, go, close } = useGo();
  const { id, habit, view, h } = useProofScreen();
  const others = view ? view.members.filter((m) => !m.isMe).map(memberName) : [];
  const c = useProof((s) => s.challenges[key(id, habit)]);
  const gk = c ? gestureKey(c.gesture) : undefined;
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={view?.facts.name ?? ""} />} bottomInset={pinned(2)} pinned={<>
      <Button kind="p" icon="account-group-outline" label={t("screens.F4a·g.pin.0")} onPress={() => replace("G2", { id, habit })} />
      <Button kind="t" label={t("screens.F4a·g.pin.1")} onPress={() => go("B1")} />
    </>}>
      <ProofCamera state="fail" object={h ? objectIconOfText(h.object) : "camera"} {...(gk ? { gesture: gk } : {})} label={t("screens.F4a·g.b0.label")} height={260} />
      <Title heading={t("screens.F4a·g.b1.title")} sub={t("additions.proof.groupSub", { names: listNames(others) })} fs={28} />
    </Screen>
  );
}

// ── F5 Day kept ──
export function F5() {
  const { go, close } = useGo();
  const toast = useToast();
  const { view } = useProofScreen();
  const playFx = useUi((s) => s.playFx);
  const k = keeperLines("F5")[0]!;
  const me = view && view.me >= 0 ? view.members[view.me]! : null;
  // Someone in group review has done their part (D-47): not "hasn't proved today".
  const pending = view ? view.members.filter((m) => !m.isMe && m.pendingToday && m.facts.proofToday !== "review") : [];
  const day = view?.dayNumber ?? 1;
  useEffect(() => { playFx(undefined, "kept"); }, [playFx, day]);
  const time = new Date().toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
  return (
    <Screen bar={<NavBar onBack={() => close()} close />} bottomInset={pinned(1)}
      pinned={<><Button kind="p" label={t("screens.F5.pin.0")} onPress={() => go("B1")} /></>}>
      <ScreenKeeper id="F5" lines={[k]} />
      <Title heading={t("screens.F5.b1.title", { day })} align="center" fs={40} />
      {view ? <DayStrip n={view.facts.numDays} done={day} today={day} labels={Array.from({ length: view.facts.numDays }, (_, i) => t("additions.core.dayShort", { n: i + 1 }))} /> : null}
      <ChipRow justify="center">
        {view ? <Chip text={t("screens.F5.b3.chip.0", { hp: view.hp })} icon="heart-pulse" tone="lime" tilt={-2} /> : null}
        {me ? <Chip text={t("screens.F5.b3.chip.1", { amount: skrWhole(me.inPlay) })} icon="sack" tone="lime" tilt={2} /> : null}
      </ChipRow>
      {pending.length && view ? <RowList label={t("screens.F5.b4.label")} rows={pending.map((m) => ({
        title: memberName(m), sub: t("screens.F5.b4.r0.s"), value: t("screens.F5.b4.r0.r"),
        onPress: () => { void oathActions.nudge(view.facts, [m.facts.wallet], view.dayIndex ?? 0).catch(() => undefined).then(() => toast(t("toasts.3", { name: memberName(m) }))); },
      }))} /> : null}
      <BrandStamp text={t("screens.F5.brand.stamp", { day, time })} />
    </Screen>
  );
}
