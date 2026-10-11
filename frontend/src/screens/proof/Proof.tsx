// F · Daily proof (screens.md F1–F5). Two live photos a day, no gallery: F1/F4 shoot with the
// back camera, F2/F4·chk check, then pass / fail / unavailable / expired. Photo 1 is mocked on chain
// Oaths and photo 2 goes to POST /api/proof (DECISIONS D-23, BACKEND_GAPS P0-2).
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
import { gestureKey, gestureText, listNames, memberName, objectIcon, objectName, skrWhole } from "@/features/oaths/present";
import { nowSeconds } from "@/features/time";
import { useUi } from "@/state/ui";
import { haptic } from "@/lib/haptics";

const pinned = (n: number) => metrics.button.height * n + metrics.pinned.gap * (n - 1) + metrics.pinned.bottom;

/** The proof in progress: today's challenge per photo and the last shot (kept for a retry on F2b). */
type ProofFeedback = { objectPresent?: boolean; gestureMatches?: boolean };
const useProof = create<{ challenges: Record<string, Challenge>; feedback: Record<string, ProofFeedback>; image: string | null; imageUri: string | null; photo2At: Record<string, number>; set(p: Partial<{ challenges: Record<string, Challenge>; feedback: Record<string, ProofFeedback>; image: string | null; imageUri: string | null; photo2At: Record<string, number> }>): void }>()((set) => ({
  challenges: {}, feedback: {}, image: null, imageUri: null, photo2At: {}, set: (p) => set(p),
}));
const key = (id: string, photo: 1 | 2) => `${id}:${photo}`;
/** Tests: seed a challenge as if it was issued earlier. */
export const storeChallenge = (id: string, photo: 1 | 2, c: Challenge) => useProof.getState().set({ challenges: { ...useProof.getState().challenges, [key(id, photo)]: c } });
/** Today's challenge for a photo, if one was issued on this run (G2 sends photo 2's to the group). */
export const challengeFor = (id: string, photo: 1 | 2): Challenge | undefined => useProof.getState().challenges[key(id, photo)];

type P = { id: string; photo: string };
function useProofScreen() {
  const p = useParams<P>();
  const photo = (Number(p.photo) === 2 ? 2 : 1) as 1 | 2;
  const { view } = useOath(p.id);
  return { id: p.id ?? "", photo, view };
}
const navTitle = (v: OathView | null, photo: 1 | 2) => (v ? t(photo === 2 ? "screens.F4.nav.title" : "screens.F1.nav.title", { name: v.facts.name, n: photo }) : "");
const challengeLabel = (c: Challenge | undefined) => (c ? t("screens.F1.b0.label", { object: objectName(c.objectId), gesture: gestureText(c.gesture) }) : "");

/** Loads (or reuses) today's challenge for this photo; a new one once it has expired. */
function useChallenge(v: OathView | null, photo: 1 | 2, fresh = false) {
  const stored = useProof((s) => (v ? s.challenges[key(v.facts.id, photo)] : undefined));
  // An expired stored challenge (photo 1 this morning, photo 2 tonight) is replaced, not shown: Shoot
  // sends an expired one to F2c, which is for a challenge that ran out while shooting.
  const [c, setC] = useState<Challenge | undefined>(() => (!fresh && stored && stored.expiresAt > nowSeconds() ? stored : undefined));
  const { replace } = useGo();
  // F2c "Take a new photo" lands back on a Shoot that was never unmounted (history.ts goes back to it, same key), still
  // holding the challenge that ran out. The fresh one F2c stored takes its place, or Shoot would bounce straight to F2c again.
  const usable = (x: Challenge | undefined) => (x && x.expiresAt > nowSeconds() ? x : undefined);
  const cur = usable(c) ?? (fresh ? undefined : usable(stored)) ?? c;
  useEffect(() => {
    if (!v || v.dayIndex === null) return;
    if (cur && cur.dayIndex === v.dayIndex && cur.expiresAt > nowSeconds()) return;
    const avoid = photo === 2 ? useProof.getState().challenges[key(v.facts.id, 1)]?.gesture : undefined;
    void getApi().proof.challenge(v.facts, photo, v.dayIndex, avoid).then((n) => {
      useProof.getState().set({ challenges: { ...useProof.getState().challenges, [key(v.facts.id, photo)]: n } });
      if (n.waitUntil) {
        useProof.getState().set({ photo2At: { ...useProof.getState().photo2At, [v.facts.id]: n.waitUntil } });
        replace("F3", { id: v.facts.id });
        return;
      }
      setC(n);
    }, (e: unknown) => replace(isApiError(e) && e.code === "OFFLINE" ? "M2" : "F2b", { id: v.facts.id, photo }));
  }, [v, photo, cur, replace]);
  return cur;
}

// ── F1·perm Camera permission ──
export function F1perm() {
  const { back, replace, close } = useGo();
  const { id, photo } = useProofScreen();
  const [perm, request, getPerm] = useCameraPermissions();
  const shoot = useCallback(() => replace(photo === 2 ? "F4" : "F1", { id, photo }), [replace, photo, id]);
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
function Shoot({ photo }: { photo: 1 | 2 }) {
  const { go, replace, close } = useGo();
  const toast = useToast();
  const { id, view } = useProofScreen();
  // Only a mock Oath (Demo) takes a stand-in photo: its proof goes to the mock, which never reads the image.
  const mock = view?.facts.source === "mock";
  const [perm] = useCameraPermissions();
  // The camera runs only while this screen is in front: checking, a failed check or anything else on top releases it.
  const focused = useScreenFocused();
  const c = useChallenge(view, photo);
  const cam = useRef<CameraView>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(nowSeconds);
  useEffect(() => { const i = setInterval(() => setNow(nowSeconds()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { if (perm && !perm.granted) replace("F1·perm", { id, photo }); }, [perm, replace, id, photo]);
  useEffect(() => { if (c && c.expiresAt <= now) replace("F2c", { id, photo }); }, [c, now, replace, id, photo]);
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
      go(photo === 2 ? "F4·chk" : "F2", { id, photo });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={navTitle(view, photo)} />} scroll={false}>
      <ProofCamera photo={photo} state="idle" object={view ? objectIcon(view.facts.objectId) : "camera"} label={challengeLabel(c)} {...(c && gestureKey(c.gesture) ? { gesture: gestureKey(c.gesture)! } : {})}>
        {perm?.granted && focused ? <CameraView ref={cam} style={{ flex: 1 }} facing={facing} /> : undefined}
      </ProofCamera>
      <ChipRow justify="center">
        <Chip text={t("screens.F1.b1.chip.0", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })} tone={left < 60 ? "red" : "grey"} icon="timer-outline" />
        {photo === 2 ? <Chip text={t("screens.F4.b1.chip.0")} icon="hand-back-right" /> : null}
      </ChipRow>
      <Shutter onShutter={() => { void shoot(); }} onFlip={() => setFacing((f) => (f === "back" ? "front" : "back"))} disabled={!c || busy || !perm?.granted} />
    </Screen>
  );
}
export const F1 = () => <Shoot photo={1} />;
export const F4 = () => <Shoot photo={2} />;

// ── F2 / F4·chk Checking ── submits once, then replaces itself with the outcome.
function Check({ photo }: { photo: 1 | 2 }) {
  const { back, replace } = useGo();
  const { id, view } = useProofScreen();
  const c = useProof((s) => s.challenges[key(id, photo)]);
  const started = useRef(false);
  const k = keeperLines(photo === 2 ? "F4·chk" : "F2")[0]!;
  useEffect(() => {
    if (!view || !c || started.current) return;
    started.current = true;
    const { image, imageUri } = useProof.getState();
    void getApi().proof.submit(view.facts, c, image ?? "", imageUri ?? undefined).then(
      (r) => {
        if (r.status === "fail") useProof.getState().set({ feedback: { ...useProof.getState().feedback, [key(id, photo)]: { objectPresent: r.objectPresent, gestureMatches: r.gestureMatches } } });
        if (r.status === "pass" && photo === 1 && r.endAllowedAt) useProof.getState().set({ photo2At: { ...useProof.getState().photo2At, [id]: r.endAllowedAt } });
        void refreshOaths(); if (r.status === "pass" && photo === 1) haptic.success(); replace(next(r, view, photo), { id, photo });
      },
      (e: unknown) => replace(isApiError(e) && e.code === "OFFLINE" ? "M2" : "F2b", { id, photo }),
    );
  }, [view, c, replace, id, photo]);
  return (
    <Screen bar={<NavBar onBack={back} title={navTitle(view, photo)} />}>
      <ProofCamera photo={photo} state="check" object={view ? objectIcon(view.facts.objectId) : "camera"} label={t("screens.F2.b0.label")} {...(c && gestureKey(c.gesture) ? { gesture: gestureKey(c.gesture)! } : {})} />
      <ScreenKeeper id={photo === 2 ? "F4·chk" : "F2"} lines={[k]} />
    </Screen>
  );
}
function next(r: ProofOutcome, v: OathView, photo: 1 | 2): DesignId {
  switch (r.status) {
    case "pass": return photo === 2 ? "F5" : "F3";
    case "unavailable": return "F2b";
    case "expired": return "F2c";
    case "fail":
      if (photo === 2 && r.attempts >= 3) return v.facts.reviewMode === "ai_group" && !v.facts.isSolo ? "F4a·g" : "F4a";
      return "F2a";
  }
}
export const F2 = () => <Check photo={1} />;
export const F4chk = () => <Check photo={2} />;

// ── F2a Failed ──
export function F2a() {
  const { replace, close } = useGo();
  const { id, photo, view } = useProofScreen();
  const c = useProof((s) => s.challenges[key(id, photo)]);
  const feedback = useProof((s) => s.feedback[key(id, photo)]);
  const k = keeperLines("F2a")[0]!;
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={navTitle(view, photo)} />} bottomInset={pinned(1)}
      pinned={<Button kind="p" icon="camera-retake-outline" label={t("screens.F2a.pin.0")} onPress={() => replace(photo === 2 ? "F4" : "F1", { id, photo })} />}>
      <ProofCamera photo={photo} state="fail" object={view ? objectIcon(view.facts.objectId) : "camera"} label={c ? t("screens.F2a.b0.label", { gesture: gestureText(c.gesture) }) : ""} {...(c && gestureKey(c.gesture) ? { gesture: gestureKey(c.gesture)! } : {})} />
      <ScreenKeeper id="F2a" lines={[k]} />
      {feedback?.objectPresent && feedback.gestureMatches === false && c && <Note text={t("additions.core.proofFeedback.objectOnly", { object: objectName(c.objectId), gesture: gestureText(c.gesture) })} />}
    </Screen>
  );
}

// ── F2b Check unavailable ── the photo is kept; Retry re-submits it.
export function F2b() {
  const { replace, close } = useGo();
  const { id, photo, view } = useProofScreen();
  const k = keeperLines("F2b")[0]!;
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={view ? t("screens.F2b.nav.title", { name: view.facts.name }) : ""} />} bottomInset={pinned(1)}
      pinned={<Button kind="p" icon="refresh" label={t("screens.F2b.pin.0")} onPress={() => replace(photo === 2 ? "F4·chk" : "F2", { id, photo })} />}>
      <ScreenKeeper id="F2b" lines={[k]} />
      <Title heading={t("screens.F2b.b2.title")} sub={t("screens.F2b.b2.sub")} align="center" />
      <MoneyMoment value={t("screens.F2b.b3.value", { time: hms(view?.secondsToReset ?? 0) })} caption={t("screens.F2b.b3.caption")} fs={44} />
    </Screen>
  );
}

// ── F2c Challenge expired ── a fresh challenge replaces the old one.
export function F2c() {
  const { replace, close } = useGo();
  const { id, photo, view } = useProofScreen();
  const c = useChallenge(view, photo, true);
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={view ? t("screens.F2b.nav.title", { name: view.facts.name }) : ""} />} bottomInset={pinned(1)}
      pinned={<Button kind="p" icon="refresh" label={t("screens.F2c.pin.0")} disabled={!c} onPress={() => replace(photo === 2 ? "F4" : "F1", { id, photo })} />}>
      <Title heading={t("screens.F2c.b0.title")} sub={t("screens.F2c.b0.sub")} />
      <ProofCamera photo={photo} state="idle" object={view ? objectIcon(view.facts.objectId) : "camera"} height={300}
        label={c ? t("screens.F2c.b1.label", { object: objectName(c.objectId).toLowerCase(), gesture: gestureText(c.gesture) }) : ""} {...(c && gestureKey(c.gesture) ? { gesture: gestureKey(c.gesture)! } : {})} />
    </Screen>
  );
}

// ── F3 Photo 1 done ──
export function F3() {
  const { replace, go, close } = useGo();
  const { id, view } = useProofScreen();
  const photo2At = useProof((s) => s.photo2At[id] ?? 0);
  const [now, setNow] = useState(nowSeconds);
  useEffect(() => { const i = setInterval(() => setNow(nowSeconds()), 1000); return () => clearInterval(i); }, []);
  const canTakeEnd = now >= photo2At;
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={view?.facts.name ?? ""} />} bottomInset={pinned(2)} pinned={<>
      <Button kind="p" icon="camera" label={t("screens.F3.pin.0")} disabled={!canTakeEnd} onPress={() => replace("F4", { id, photo: 2 })} />
      <Button kind="t" label={t("screens.F3.pin.1")} onPress={() => go("B1")} />
    </>}>
      <SignStatus state="success" chip={t("screens.F3.b1.chip")} />
      <Title heading={t("screens.F3.b2.title")} sub={t("screens.F3.b2.sub", { task: t("additions.core.it") })} align="center" />
      <DayStrip n={2} done={1} today={2} labels={[t("screens.F3.b3.day.0"), t("screens.F3.b3.day.1")]} />
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
  const { id, view } = useProofScreen();
  const others = view ? view.members.filter((m) => !m.isMe).map(memberName) : [];
  const c = useProof((s) => s.challenges[key(id, 2)]);
  const gk = c ? gestureKey(c.gesture) : undefined;
  return (
    <Screen bar={<NavBar onBack={() => close()} close title={view?.facts.name ?? ""} />} bottomInset={pinned(2)} pinned={<>
      <Button kind="p" icon="account-group-outline" label={t("screens.F4a·g.pin.0")} onPress={() => replace("G2", { id })} />
      <Button kind="t" label={t("screens.F4a·g.pin.1")} onPress={() => go("B1")} />
    </>}>
      <ProofCamera photo={2} state="fail" object={view ? objectIcon(view.facts.objectId) : "camera"} {...(gk ? { gesture: gk } : {})} label={t("screens.F4a·g.b0.label")} height={260} />
      <Title heading={t("screens.F4a·g.b1.title")} sub={t("screens.F4a·g.b1.sub", { names: listNames(others) })} fs={28} />
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
