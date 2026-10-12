// K · Create a Bounty (screens.md K1–K5·ok, plus K1·t daily tasks, D-99). Funding has no program support yet, so it
// signs on the mock TxService and publishes to the mock store (BACKEND_GAPS P1-10, P1-28).
import { useCallback, useMemo } from "react";
import { Share } from "react-native";
import { create } from "zustand";
import { LENGTHS, SKR_UNIT } from "@kept/config";
import { t } from "@/copy";
import type { CopyKey } from "@/copy";
import { Button, ButtonRow } from "@/components/actions";
import { NavBar, useToast } from "@/components/chrome";
import { BodyText, Breakdown, Segmented, Title, UploadBox } from "@/components/content/Basics";
import { MoneyMoment, OptionGrid, SentenceInput } from "@/components/content/Inputs";
import { RowList } from "@/components/content/Rows";
import { BountyCover } from "@/components/content/Social";
import { SignStatus } from "@/components/content/Status";
import { Screen } from "@/components/layout/Screen";
import { color, metrics, tokens } from "@/theme";
import { useGo, useParams } from "@/app/nav";
import { bountyFunding } from "@kept/engine";
import { skrWhole } from "@/features/oaths/present";
import { savedHabits } from "@/features/oaths/habits";
import { entryIcon, entryLabel, proofTextOf } from "@/features/objects/proof";
import { bountyActions, useBounty } from "@/features/queries";
import { SigningScreen } from "../shared/Signing";
import { HabitListEditor } from "../create/HabitBuilder";
import type { HabitListCopy } from "../create/HabitBuilder";

const STEPS = 6;
const POOLS = [10_000, 25_000, 50_000, 100_000] as const;
const WINDOWS = [12, 24, 48, null] as const; // null = "Day 1 ends"
const RATES = [0.6, 0.7, 0.8, 0.9] as const;
const pinnedOne = metrics.button.height + metrics.pinned.bottom;

interface BountyDraft {
  name: string; numDays: 3 | 7 | 14; window: number; poolIndex: number; message: string; link: string;
  minRateOn: boolean; rateIndex: number; tokenOn: boolean;
  /** The daily tasks as parallel habit fields (features/oaths/habits), so K1·t reuses the habit list editor. */
  habits: string[]; habitObjectIds?: number[]; habitObjectEntries?: string[];
  /** The program's object tag that follows the tasks (habitPatch); icons only. */
  objectId: number; objectEntry?: string;
}
const EMPTY: BountyDraft = {
  name: "", numDays: 14, window: 1, poolIndex: 2, message: "", link: "", minRateOn: true, rateIndex: 1, tokenOn: false,
  habits: [], habitObjectIds: [], habitObjectEntries: [], objectId: 0,
};
export const useBountyDraft = create<{ d: BountyDraft; set(p: Partial<BountyDraft>): void; reset(): void }>()((set) => ({
  d: EMPTY, set: (p) => set((s) => ({ d: { ...s.d, ...p } })), reset: () => set({ d: EMPTY }),
}));
const poolOf = (d: BountyDraft) => BigInt(POOLS[d.poolIndex]!) * SKR_UNIT;
/** The saved tasks, each with the text its photo is checked for. */
const tasksOf = (d: BountyDraft) => savedHabits(d).map((h) => ({ name: h.name, entry: h.entry, object: proofTextOf(h.entry) ?? h.entry }));
const coverIcon = (d: BountyDraft) => { const first = savedHabits(d)[0]; return first ? entryIcon(first.entry) : "trophy-outline" as const; };

const TASK_COPY: HabitListCopy = {
  title: "additions.bountyTasks.title", sub: "additions.bountyTasks.sub", add: "additions.bountyTasks.add", full: "additions.bountyTasks.full",
  count: "additions.bountyTasks.count", emptyTitle: "additions.bountyTasks.emptyTitle", emptySub: "additions.bountyTasks.emptySub",
  newTitle: "additions.bountyTasks.newTitle", editTitle: "additions.bountyTasks.editTitle", editorSub: "additions.bountyTasks.editorSub",
  name: "additions.bountyTasks.name", placeholder: "additions.bountyTasks.placeholder", save: "additions.bountyTasks.save",
  remove: "additions.bountyTasks.remove", cardA11y: "additions.bountyTasks.cardA11y", unfinishedTitle: "additions.bountyTasks.unfinishedTitle",
  unfinishedSub: "additions.bountyTasks.unfinishedSub", footer: "additions.bountyTasks.footer",
};
const windowText = (d: BountyDraft) => (WINDOWS[d.window] === null ? t("screens.K1.b5.seg.3") : t("screens.K5.b2.row2.v", { hours: WINDOWS[d.window]! }));

function Step({ n, children, next, label, disabled, close }: { n: number; children: React.ReactNode; next: () => void; label?: string; disabled?: boolean; close?: boolean }) {
  const { back } = useGo();
  return (
    <Screen bar={<NavBar onBack={back} steps={[n, STEPS]} {...(close ? { close: true } : {})} />} bottomInset={pinnedOne}
      pinned={<Button kind={n === STEPS ? "l" : "p"} {...(n === STEPS ? { icon: "draw-pen" as const } : {})} label={label ?? t("screens.K1.pin.0")} onPress={next} {...(disabled ? { disabled: true } : {})} />}>
      {children}
    </Screen>
  );
}

// ── K1 Basics ──
export function K1() {
  const { go } = useGo();
  const { d, set } = useBountyDraft();
  return (
    <Step n={1} close next={() => go("K1·t")} disabled={!d.name.trim()}>
      <Title heading={t("screens.K1.b0.title")} sub={t("screens.K1.b0.sub")} />
      <SentenceInput label={t("screens.K1.b1.label")} value={d.name} onChange={(name) => set({ name })} max={24} suggestions={[0, 1, 2].map((i) => t(`screens.K1.b1.sug.${i}` as CopyKey))} />
      <OptionGrid mode="big" small value={LENGTHS.indexOf(d.numDays)} onChange={(i) => set({ numDays: LENGTHS[i]! })} items={[0, 1, 2].map((i) => ({ title: t(`screens.K1.b3.o${i}.t` as CopyKey), sub: t(`screens.K1.b3.o${i}.s` as CopyKey) }))} />
      <BodyText mono text={t("screens.K1.b4.text")} />
      <Segmented items={[0, 1, 2, 3].map((i) => t(`screens.K1.b5.seg.${i}` as CopyKey))} value={d.window} onChange={(window) => set({ window })} />
    </Step>
  );
}

// ── K1·t Daily tasks ── one to eight tasks, each with its own proof object (D-99); the Oath habit editor.
export function K1t() {
  const { back, go } = useGo();
  const { d, set } = useBountyDraft();
  return <HabitListEditor fields={d} onChange={set} steps={[2, STEPS]} onBack={back} onNext={() => go("K2")} copy={TASK_COPY} />;
}

// ── K2 Pool ──
export function K2() {
  const { go } = useGo();
  const { d, set } = useBountyDraft();
  const f = bountyFunding(poolOf(d));
  return (
    <Step n={3} next={() => go("K3")}>
      <Title heading={t("screens.K2.b0.title")} sub={t("screens.K2.b0.sub")} />
      <MoneyMoment value={t("screens.K2.b1.value", { amount: skrWhole(f.pool) })} caption={t("screens.K2.b1.caption")} tone="lime" />
      <OptionGrid mode="chip" value={d.poolIndex} onChange={(poolIndex) => set({ poolIndex })} items={[0, 1, 2, 3].map((i) => ({ title: t(`screens.K2.b2.o${i}.t` as CopyKey) }))} />
      <Breakdown rows={[
        { label: t("screens.K2.b3.row0.l"), value: t("screens.K2.b3.row0.v", { amount: skrWhole(f.pool) }) },
        { label: t("screens.K2.b3.row1.l"), value: t("screens.K2.b3.row1.v", { amount: skrWhole(f.fee) }) },
        { label: t("screens.K2.b3.row2.l"), value: t("screens.K2.b3.row2.v", { amount: skrWhole(f.total) }), total: true },
      ]} />
    </Step>
  );
}

// ── K3 Branding ── the cover upload needs storage on the backend (P1-10); the brand gradient stands in.
export function K3() {
  const { go } = useGo();
  const toast = useToast();
  const { d, set } = useBountyDraft();
  return (
    <Step n={4} next={() => go("K4")}>
      <Title heading={t("screens.K3.b0.title")} sub={t("screens.K3.b0.sub")} />
      <UploadBox title={t("screens.K3.b1.title")} sub={t("screens.K3.b1.sub")} onPress={() => toast(t("additions.bounty.coverLater"))} />
      <SentenceInput label={t("screens.K3.b2.label")} value={d.message} onChange={(message) => set({ message })} max={60} suggestions={[0, 1].map((i) => t(`screens.K3.b2.sug.${i}` as CopyKey))} />
      <SentenceInput label={t("screens.K3.b3.label")} value={d.link} onChange={(link) => set({ link })} max={60} placeholder={t("screens.K3.b3.sug.0")} />
    </Step>
  );
}

// ── K4 Requirements ── "token held" is checked client-side on the mock (D-27).
export function K4() {
  const { go } = useGo();
  const { d, set } = useBountyDraft();
  return (
    <Step n={5} next={() => go("K5")}>
      <Title heading={t("screens.K4.b0.title")} sub={t("screens.K4.b0.sub")} />
      <RowList rows={[{ title: t("screens.K4.b1.r0.t"), sub: t("screens.K4.b1.r0.s"), leading: { kind: "icon", icon: "shield-check-outline", fg: color.text.primary }, toggle: { on: d.minRateOn, onChange: (minRateOn) => set({ minRateOn }) } }]} />
      {d.minRateOn ? <OptionGrid mode="chip" value={d.rateIndex} onChange={(rateIndex) => set({ rateIndex })} items={[0, 1, 2, 3].map((i) => ({ title: t(`screens.K4.b2.o${i}.t` as CopyKey) }))} /> : null}
      <RowList rows={[{ title: t("screens.K4.b3.r0.t"), sub: t("screens.K4.b3.r0.s"), leading: { kind: "icon", icon: "key-variant", fg: color.text.primary }, toggle: { on: d.tokenOn, onChange: (tokenOn) => set({ tokenOn }) } }]} />
    </Step>
  );
}

const requirementText = (d: BountyDraft) => (d.minRateOn ? t("screens.K5.b2.row3.v", { pct: Math.round(RATES[d.rateIndex]! * 100) }) : t("additions.bounty.noRequirements"));

// ── K5 Review & fund ──
export function K5() {
  const { go } = useGo();
  const { d } = useBountyDraft();
  const f = bountyFunding(poolOf(d));
  const c = tokens.color.banner[0];
  const tasks = tasksOf(d);
  return (
    <Step n={STEPS} next={() => go("K5·p")} label={t("screens.K5.pin.0")}>
      <Title heading={t("screens.K5.b0.title")} />
      <BountyCover brand={t("screens.K5.b1.brand")} logo="Y" verified={false} colors={[c[0]!, c[1]!]} icon={coverIcon(d)} message={t("screens.K5.b1.msg", { name: d.name.trim(), message: d.message.trim() })} />
      <RowList label={t("additions.bountyTasks.label", { n: tasks.length })} rows={tasks.map((x) => ({
        title: x.name, sub: t("additions.bountyTasks.proof", { object: entryLabel(x.entry) }), leading: { kind: "icon" as const, icon: entryIcon(x.entry), fg: color.lime.base },
      }))} />
      <Breakdown rows={[
        { label: t("additions.bountyTasks.row"), value: tasks.length === 1 ? t("additions.bountyTasks.countOne") : t("additions.bountyTasks.countMany", { n: tasks.length }) },
        { label: t("screens.K5.b2.row1.l"), value: t(`common.lengths.${LENGTHS.indexOf(d.numDays)}` as CopyKey) },
        { label: t("screens.K5.b2.row2.l"), value: windowText(d) },
        { label: t("screens.K5.b2.row3.l"), value: requirementText(d) },
        { label: t("screens.K5.b2.row4.l"), value: t("screens.K5.b2.row4.v", { amount: skrWhole(f.pool) }), color: color.lime.base },
        { label: t("screens.K5.b2.row5.l"), value: t("screens.K5.b2.row5.v", { amount: skrWhole(f.fee) }) },
        { label: t("screens.K5.b2.row6.l"), value: t("screens.K5.b2.row6.v", { amount: skrWhole(f.total) }), total: true },
      ]} />
    </Step>
  );
}

// ── K5·p Fund · signing ──
export function K5p() {
  const { d } = useBountyDraft();
  const f = bountyFunding(poolOf(d));
  const task = useCallback(() => bountyActions.create({
    name: d.name.trim(), objectId: d.objectId, tasks: tasksOf(d).map(({ name, object }) => ({ name, object })), numDays: d.numDays, pool: f.pool, joinWindowHours: WINDOWS[d.window] ?? null,
    message: d.message.trim(), link: d.link.trim() || null, minKeptRate: d.minRateOn ? RATES[d.rateIndex]! : null, tokenHeld: null,
  }), [d, f.pool]);
  const onDone = useCallback((id: string) => ({ to: "K5·ok" as const, params: { id } }), []);
  const fail = useMemo(() => ({ retry: "K5·p" as const, edit: "K5" as const, params: { need: skrWhole(f.total) } }), [f.total]);
  return <SigningScreen title={t("screens.K5·p.b2.title", { name: d.name.trim() })} sub={t("screens.K5·p.b2.sub", { amount: skrWhole(f.total) })} task={task} onDone={onDone} fail={fail} />;
}

// ── K5·ok Bounty live ──
export function K5ok() {
  const { replace } = useGo();
  const { id } = useParams<{ id: string }>();
  const { data: b } = useBounty(id);
  const { d, reset } = useBountyDraft();
  const hours = WINDOWS[d.window];
  return (
    <Screen bar={<NavBar onBack={() => { reset(); replace("H1·c"); }} close />} bottomInset={pinnedOne}
      pinned={<Button kind="p" label={t("screens.K5·ok.pin.0")} onPress={() => { reset(); replace("H6", { id: id! }); }} />}>
      <SignStatus state="success" chip={t("screens.K5·ok.b1.chip", { amount: b ? skrWhole(b.pool) : "" })} />
      <Title heading={t("screens.K5·ok.b2.title", { name: b?.name ?? "" })} sub={hours === null ? t("additions.bounty.liveUntilDay1") : t("screens.K5·ok.b2.sub", { hours: hours ?? 24 })} align="center" />
      <ButtonRow><Button kind="s" size="row" icon="share-variant" label={t("screens.K5·ok.b3.btn.0")} onPress={() => { void Share.share({ message: b?.name ?? "" }); }} /></ButtonRow>
    </Screen>
  );
}
