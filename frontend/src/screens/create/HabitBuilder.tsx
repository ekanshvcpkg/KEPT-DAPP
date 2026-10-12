// C2: the Oath's daily habits. Saved habits are tappable cards (the habit and its proof object); a card or "Add a habit"
// opens the editor, where the name and the proof object are chosen together and only Save commits them. Cancel (or back)
// leaves the draft exactly as it was. The habits are never inline text fields, and the proof object is never picked apart
// from the habit it belongs to.
//
// Every habit has its own proof object (the gym with a dumbbell, reading with a book): one photo of that object, with
// the gesture the server picks, proves the habit each day.
//
// The same list editor builds a Bounty's daily tasks (K1·t, D-99) with its own copy: `HabitListEditor` edits any
// parallel habit fields (features/oaths/habits) and hands each change back as a patch.
import { useEffect, useState } from "react";
import { BackHandler, View } from "react-native";
import { GOAL_MAX, HABIT_COUNT_MAX } from "@kept/config";
import { t } from "@/copy";
import type { CopyKey } from "@/copy";
import { Button, ButtonRow } from "@/components/actions";
import { NavBar } from "@/components/chrome";
import { Banner, Title } from "@/components/content/Basics";
import { SentenceInput } from "@/components/content/Inputs";
import { Icon, PressScale, Text } from "@/components/primitives";
import { Screen } from "@/components/layout/Screen";
import { color, metrics, space } from "@/theme";
import { useGo } from "@/app/nav";
import { habitEntries, habitProblem, removeHabit, saveHabit } from "@/features/oaths/habits";
import type { HabitEntry } from "@/features/oaths/habits";
import type { OathDraft } from "@/state/drafts";
import { entryIcon, entryLabel } from "@/features/objects/proof";
import { useKeyboardHeight } from "@/lib/keyboard";
import { useDraft } from "@/state/drafts";
import { ProofObjectPicker } from "./ProofObjectPicker";

const STEPS = 6;
const pinnedOne = metrics.button.height + metrics.pinned.bottom;

/** What the editor holds while it is open: a copy of the habit (or a blank one). Nothing here touches the draft until Save. */
interface Editor { index: number | null; name: string; entry: string | null }

/** The parallel habit fields a list edits (an Oath draft's, or a Bounty draft's tasks). */
export type HabitFields = Pick<OathDraft, "habits" | "habitObjectIds" | "habitObjectEntries">;

/** The strings a list shows. `count` takes {n} {max}, `remove` {n}, `cardA11y` {name} {proof}. */
export interface HabitListCopy {
  title: CopyKey; sub: CopyKey; add: CopyKey; full: CopyKey; count: CopyKey; emptyTitle: CopyKey; emptySub: CopyKey;
  newTitle: CopyKey; editTitle: CopyKey; editorSub: CopyKey; name: CopyKey; placeholder: CopyKey; save: CopyKey; remove: CopyKey;
  cardA11y: CopyKey; unfinishedTitle: CopyKey; unfinishedSub: CopyKey; footer: CopyKey;
}

const HABIT_COPY: HabitListCopy = {
  title: "additions.oathCreate.habitsTitle", sub: "additions.oathCreate.habitsSub", add: "additions.oathCreate.addHabit",
  full: "additions.oathCreate.stackFull", count: "additions.oathCreate.stackCount", emptyTitle: "additions.oathCreate.emptyTitle",
  emptySub: "additions.oathCreate.emptySub", newTitle: "additions.oathCreate.newHabitTitle", editTitle: "additions.oathCreate.editHabitTitle",
  editorSub: "additions.oathCreate.editorSub", name: "additions.oathCreate.habitName", placeholder: "additions.oathCreate.habitPlaceholder",
  save: "additions.oathCreate.saveHabit", remove: "additions.oathCreate.removeHabit", cardA11y: "additions.oathCreate.cardA11y",
  unfinishedTitle: "additions.oathCreate.unfinishedTitle", unfinishedSub: "additions.oathCreate.unfinishedSub", footer: "additions.oathCreate.oneProofNote",
};

function HabitCard({ n, habit, onPress, a11y }: { n: number; habit: HabitEntry; onPress: () => void; a11y: CopyKey }) {
  const proof = habit.entry === null ? t("additions.oathCreate.cardNoProof") : t("additions.oathCreate.proofForHabit", { object: entryLabel(habit.entry) });
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={t(a11y, { name: habit.name, proof })}>
      <View style={{ minHeight: metrics.minTouch + metrics.row.tile, flexDirection: "row", alignItems: "center", gap: space[10], padding: metrics.card.pad, borderRadius: metrics.card.radius, backgroundColor: color.surface[1], boxShadow: `inset 0 0 0 1px ${habit.entry === null ? color.orange.base : color.extra.hairline07}` }}>
        <View style={{ width: metrics.row.tile, height: metrics.row.tile, borderRadius: metrics.row.tileRadius, alignItems: "center", justifyContent: "center", backgroundColor: color.lime.base }}>
          <Text variant="monoValue" color={color.text.onLime}>{String(n).padStart(2, "0")}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: space[4] }}>
          <Text variant="rowTitle" numberOfLines={2}>{habit.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[6] }}>
            <Icon name={habit.entry === null ? "alert-circle-outline" : entryIcon(habit.entry)} size={metrics.row.chevron} color={habit.entry === null ? color.orange.base : color.lime.base} />
            <Text variant="caption" color={habit.entry === null ? color.orange.base : color.text.secondary} numberOfLines={1} style={{ flexShrink: 1 }}>{proof}</Text>
          </View>
        </View>
        <Icon name="chevron-right" size={metrics.row.chevron} color={color.text.secondary} />
      </View>
    </PressScale>
  );
}

export function C2() {
  const { back, go } = useGo();
  const { draft, set } = useDraft();
  return <HabitListEditor fields={draft} onChange={set} steps={[2, STEPS]} onBack={back} onNext={() => go("C3")} copy={HABIT_COPY} />;
}

/** Saved items as cards, "Add" opens the editor; Next is blocked until every item has a name and a proof object. */
export function HabitListEditor({ fields, onChange, steps, onBack, onNext, copy }: {
  fields: HabitFields; onChange: (patch: ReturnType<typeof saveHabit>) => void; steps: [number, number];
  onBack: () => void; onNext: () => void; copy: HabitListCopy;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [searching, setSearching] = useState(false);
  const typing = useKeyboardHeight() > 0;
  const entries = habitEntries(fields);
  const problem = habitProblem(fields);

  const close = () => { setEditor(null); setSearching(false); };
  // Android back while editing is Cancel, not "leave C2".
  useEffect(() => {
    if (!editor) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; });
    return () => sub.remove();
  }, [editor]);

  const open = (index: number | null) => {
    const habit = index === null ? undefined : entries[index];
    setEditor({ index, name: habit?.name ?? "", entry: habit?.entry ?? null });
  };

  if (!editor) {
    return (
      <Screen bar={<NavBar onBack={onBack} steps={steps} />} bottomInset={pinnedOne}
        pinned={<Button kind="p" label={t("screens.C1.pin.0")} onPress={onNext} disabled={problem !== null} />}>
        <Title heading={t(copy.title)} sub={t(copy.sub)} />
        {entries.length === 0 ? (
          <Banner tone="grey" icon="calendar-check" title={t(copy.emptyTitle)} sub={t(copy.emptySub)} />
        ) : (
          <View style={{ gap: space[8] }} accessibilityLabel={t(copy.count, { n: entries.length, max: HABIT_COUNT_MAX })}>
            {entries.map((h, i) => <HabitCard key={`${i}-${h.name}`} n={i + 1} habit={h} onPress={() => open(i)} a11y={copy.cardA11y} />)}
          </View>
        )}
        {entries.length < HABIT_COUNT_MAX ? <Button kind="s" size="card" icon="plus" label={t(copy.add)} onPress={() => open(null)} /> : <Text variant="caption" align="center">{t(copy.full)}</Text>}
        {problem === "unfinished" ? <Banner tone="ora" icon="alert-circle-outline" title={t(copy.unfinishedTitle)} sub={t(copy.unfinishedSub)} />
          : <Text variant="caption" align="center">{t(copy.footer)}</Text>}
      </Screen>
    );
  }

  const named = editor.name.trim().length > 0;
  const canSave = named && editor.entry !== null;
  const commit = () => {
    if (editor.entry === null || !named) return;
    onChange(saveHabit(fields, editor.index, { name: editor.name, entry: editor.entry }));
    close();
  };
  const hideActions = searching && typing;

  return (
    <Screen bar={<NavBar onBack={close} close title={t(editor.index === null ? copy.newTitle : copy.editTitle)} />}
      bottomInset={hideActions ? 0 : pinnedOne}
      {...(hideActions ? {} : { pinned: (
        <ButtonRow>
          <Button kind="s" size="row" label={t("additions.oathCreate.cancelHabit")} onPress={close} />
          <Button kind="l" size="row" label={t(copy.save)} onPress={commit} disabled={!canSave} />
        </ButtonRow>
      ) })}>
      {searching ? null : (
        <>
          <Title heading={t(editor.index === null ? copy.newTitle : copy.editTitle)} sub={t(copy.editorSub)} />
          <SentenceInput label={t(copy.name)} value={editor.name} onChange={(name) => setEditor({ ...editor, name })} max={GOAL_MAX} placeholder={t(copy.placeholder)} />
          {editor.entry === null
            ? <Banner tone="grey" icon="image-outline" title={t("additions.oathCreate.noProof")} sub={t("additions.oathCreate.noProofSub")} />
            : <Banner tone="lime" icon={entryIcon(editor.entry)} title={t("additions.oathCreate.proofSummary", { object: entryLabel(editor.entry) })} sub={t("additions.oathCreate.proofSummarySub")} />}
        </>
      )}
      <ProofObjectPicker key="proof-picker" value={editor.entry} onPick={(entry) => setEditor({ ...editor, entry })} onActiveChange={setSearching} />
      {searching || editor.index === null ? null : (
        <Button kind="d" label={t(copy.remove, { n: editor.index + 1 })} onPress={() => { onChange(removeHabit(fields, editor.index!)); close(); }} />
      )}
    </Screen>
  );
}
