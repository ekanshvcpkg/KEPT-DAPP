// G · Group review (screens.md G1–G3·no). Mock only (BACKEND_GAPS P1-1): majority approves, a tie
// rejects; the photo is deleted after the vote (48 h at most).
import { useEffect, useRef, useState } from "react";
import { keeperLines, t } from "@/copy";
import { Button } from "@/components/actions";
import { NavBar, useToast } from "@/components/chrome";
import { Breakdown, Chip, ChipRow, Note, Skeleton, Title } from "@/components/content/Basics";
import { ProofCamera } from "@/components/content/Camera";
import { MoneyMoment, SeatSlots } from "@/components/content/Inputs";
import type { Seat } from "@/components/content/Inputs";
import { SignStatus } from "@/components/content/Status";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen } from "@/components/layout/Screen";
import { hoursLeft } from "@/lib/format";
import { metrics } from "@/theme";
import { useGo, useParams } from "@/app/nav";
import { useOath } from "@/features/oaths/hooks";
import type { OathView } from "@/features/oaths/model";
import { gestureKey, gestureText, listNames, memberColor, memberInitial, memberName, objectIcon, objectName, skrWhole } from "@/features/oaths/present";
import { reviewActions, useOpenReviews, useReview } from "@/features/queries";
import type { ReviewFacts } from "@/features/reviews/model";
import { useNow } from "@/features/time";
import { challengeFor } from "../proof/Proof";

const pinned = (n: number) => metrics.button.height * n + metrics.pinned.gap * (n - 1) + metrics.pinned.bottom;
const nameOf = (v: OathView, wallet: string) => { const m = v.members.find((x) => x.facts.wallet === wallet); return m ? memberName(m) : ""; };
const DESIGN_GESTURES: ReviewFacts["gesture"][] = ["thumbs_up", "victory", "open_palm"];

// ── G1 Review a photo ──
export function G1() {
  const { back, replace } = useGo();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const { view } = useOath(id);
  const open = useOpenReviews(id);
  const now = useNow(60_000);
  const [busy, setBusy] = useState(false);
  const r = open.data?.[0];
  // Nothing left to vote on (already voted, or decided): back to the Oath.
  useEffect(() => { if (open.isSuccess && !r && id) replace("D2", { id }); }, [open.isSuccess, r, id, replace]);
  if (!view || !r) return <Screen bar={<NavBar onBack={back} close title={t("screens.G1.nav.title")} />}><Skeleton height={260} /></Screen>;
  const who = nameOf(view, r.by);
  const approvers = Object.entries(r.votes).filter(([, yes]) => yes).map(([w]) => nameOf(view, w));
  const vote = async (approve: boolean) => {
    setBusy(true);
    await reviewActions.vote(r.id, view.facts.id, approve);
    toast(t(approve ? "toasts.7" : "toasts.8"));
    replace("D2", { id: view.facts.id });
  };
  const k = keeperLines("G1")[0]!;
  return (
    <Screen bar={<NavBar onBack={back} close title={t("screens.G1.nav.title")} />} bottomInset={pinned(2)} pinned={<>
      <Button kind="l" icon="check" label={t("screens.G1.pin.0")} disabled={busy} onPress={() => { void vote(true); }} />
      <Button kind="d" icon="close" label={t("screens.G1.pin.1")} disabled={busy} onPress={() => { void vote(false); }} />
    </>}>
      <Title heading={t("screens.G1.b0.title", { name: who })}
        sub={t("additions.proof.reviewSub", { oath: view.facts.name, day: r.dayIndex + 1, object: objectName(r.objectId).toLowerCase(), gesture: gestureText(r.gesture) })} fs={28} />
      {/* The photo itself needs the review route (P1-1); the frame shows the challenge until then. */}
      <ProofCamera state="review" object={objectIcon(r.objectId)} {...(gestureKey(r.gesture) ? { gesture: gestureKey(r.gesture)! } : {})} label={t("screens.G1.b1.label", { name: who })} height={300} />
      <ChipRow>
        <Chip text={t("screens.G1.b2.chip.0", { n: Object.keys(r.votes).length, total: r.voters.length })} icon="vote-outline" tilt={-2} />
        {approvers.length ? <Chip text={t("screens.G1.b2.chip.1", { name: listNames(approvers) })} icon="check" tone="lime" tilt={1} /> : null}
        <Chip text={t("screens.G1.b2.chip.2", { time: hoursLeft(Math.max(0, r.expiresAt - now)) })} icon="timer-outline" tone="ora" tilt={-1} />
      </ChipRow>
      <ScreenKeeper id="G1" lines={[k]} />
    </Screen>
  );
}

// ── G2 Waiting for review ── asks once, then polls; replaced by G3 / G3·no when decided.
export function G2() {
  const { back, replace } = useGo();
  const { id } = useParams<{ id: string }>();
  const { view } = useOath(id);
  const [reviewId, setReviewId] = useState<string | undefined>();
  const asked = useRef(false);
  const review = useReview(reviewId, true);
  useEffect(() => {
    if (!view || view.dayIndex === null || asked.current) return;
    asked.current = true;
    const g = challengeFor(view.facts.id, 2)?.gesture;
    const gesture = DESIGN_GESTURES.find((x) => x === g) ?? "open_palm";
    void reviewActions.request(view.facts, view.dayIndex, gesture).then((r) => setReviewId(r.id));
  }, [view]);
  const r = review.data;
  useEffect(() => {
    if (!r || !id) return;
    if (r.status === "approved") replace("G3", { id, review: r.id });
    else if (r.status === "rejected" || r.status === "expired") replace("G3·no", { id, review: r.id });
  }, [r, replace, id]);
  if (!view) return null;
  const seats: Seat[] = view.members.filter((m) => !m.isMe).map((m) => {
    const v = r?.votes[m.facts.wallet];
    return {
      kind: "member", name: memberName(m), initial: memberInitial(m), color: memberColor(m), ...(m.facts.avatar ? { avatar: m.facts.avatar } : {}),
      status: t(v === true ? "screens.G2.b3.seat0" : v === false ? "screens.G2.b3.seat1" : "screens.G2.b3.seat2"), dim: v === undefined,
    };
  });
  return (
    <Screen bar={<NavBar onBack={back} close title={t("screens.G2.nav.title")} />}>
      <MoneyMoment value={t("screens.G2.b1.value", { n: r ? Object.keys(r.votes).length : 0, total: r?.voters.length ?? seats.length })} caption={t("screens.G2.b1.caption")} />
      <Title heading={t("screens.G2.b2.title")} sub={t("screens.G2.b2.sub")} align="center" />
      <SeatSlots seats={seats} />
      <Note text={t("screens.G2.b4.text")} icon="shield-check-outline" />
    </Screen>
  );
}

function useDecided() {
  const { id, review } = useParams<{ id: string; review: string }>();
  const { view } = useOath(id);
  const r = useReview(review);
  const yes = r.data ? Object.values(r.data.votes).filter(Boolean).length : 0;
  const no = r.data ? Object.values(r.data.votes).length - yes : 0;
  return { id: id ?? "", view, r: r.data, yes, no };
}

// ── G3 Review approved ──
export function G3() {
  const { replace } = useGo();
  const { id, view, r, yes, no } = useDecided();
  if (!view || !r) return null;
  const backers = Object.entries(r.votes).filter(([, v]) => v).map(([w]) => nameOf(view, w));
  const me = view.me >= 0 ? view.members[view.me]! : null;
  return (
    <Screen bar={<NavBar onBack={() => replace("D2", { id })} close />} bottomInset={pinned(1)}
      pinned={<Button kind="p" label={t("screens.G3.pin.0", { name: view.facts.name })} onPress={() => replace("D2", { id })} />}>
      <SignStatus state="success" chip={t("screens.G3.b1.chip", { yes, no })} />
      <Title heading={t("screens.G3.b2.title", { day: r.dayIndex + 1 })} sub={t("screens.G3.b2.sub", { names: listNames(backers), amount: me ? skrWhole(me.balance) : "" })} align="center" />
    </Screen>
  );
}

// ── G3·no Review rejected ──
export function G3no() {
  const { replace } = useGo();
  const { id, view, r, yes, no } = useDecided();
  if (!view || !r) return null;
  const k = keeperLines("G3·no")[0]!;
  return (
    <Screen bar={<NavBar onBack={() => replace("D2", { id })} close />} bottomInset={pinned(1)}
      pinned={<Button kind="p" label={t("screens.G3·no.pin.0", { name: view.facts.name })} onPress={() => replace("D2", { id })} />}>
      <ScreenKeeper id="G3·no" lines={[k]} />
      <Title heading={t("screens.G3·no.b2.title", { yes, no, day: r.dayIndex + 1 })} align="center" />
      <Breakdown rows={[
        { label: t("screens.G3·no.b3.row0.l"), value: t("screens.G3·no.b3.row0.v", { cost: skrWhole(view.myMissCost) }) },
        { label: t("screens.G3·no.b3.row1.l"), value: t("screens.G3·no.b3.row1.v", { hp: view.facts.isSolo ? 35 : 20 }) },
      ]} />
    </Screen>
  );
}
