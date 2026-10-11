// C2: the Oath's daily habits. Saved habits are tappable cards (the habit and its proof object); a card or "Add a habit"
// opens the editor, where the name and the proof object are chosen together and only Save commits them. Cancel (or back)
// leaves the draft exactly as it was. The habits are never inline text fields, and the proof object is never picked apart
// from the habit it belongs to.
//
// Every habit has its own proof object (the gym with a dumbbell, reading with a book): one photo of that object, with
// the gesture the server picks, proves the habit each day.
import { useEffect, useState } from "react";
import { BackHandler, View } from "react-native";
import { GOAL_MAX, HABIT_COUNT_MAX } from "@kept/config";
import { t } from "@/copy";
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
import { entryIcon, entryLabel } from "@/features/objects/proof";
import { useKeyboardHeight } from "@/lib/keyboard";
import { useDraft } from "@/state/drafts";
import { ProofObjectPicker } from "./ProofObjectPicker";

const STEPS = 6;
const pinnedOne = metrics.button.height + metrics.pinned.bottom;

/** What the editor holds while it is open: a copy of the habit (or a blank one). Nothing here touches the draft until Save. */
interface Editor { index: number | null; name: string; entry: string | null }

function HabitCard({ n, habit, onPress }: { n: number; habit: HabitEntry; onPress: () => void }) {
  const proof = habit.entry === null ? t("additions.oathCreate.cardNoProof") : t("additions.oathCreate.proofForHabit", { object: entryLabel(habit.entry) });
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={t("additions.oathCreate.cardA11y", { name: habit.name, proof })}>
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
  const [editor, setEditor] = useState<Editor | null>(null);
  const [searching, setSearching] = useState(false);
  const typing = useKeyboardHeight() > 0;
  const entries = habitEntries(draft);
  const problem = habitProblem(draft);

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
      <Screen bar={<NavBar onBack={back} steps={[2, STEPS]} />} bottomInset={pinnedOne}
        pinned={<Button kind="p" label={t("screens.C1.pin.0")} onPress={() => go("C3")} disabled={problem !== null} />}>
        <Title heading={t("additions.oathCreate.habitsTitle")} sub={t("additions.oathCreate.habitsSub")} />
        {entries.length === 0 ? (
          <Banner tone="grey" icon="calendar-check" title={t("additions.oathCreate.emptyTitle")} sub={t("additions.oathCreate.emptySub")} />
        ) : (
          <View style={{ gap: space[8] }} accessibilityLabel={t("additions.oathCreate.stackCount", { n: entries.length, max: HABIT_COUNT_MAX })}>
            {entries.map((h, i) => <HabitCard key={`${i}-${h.name}`} n={i + 1} habit={h} onPress={() => open(i)} />)}
          </View>
        )}
        {entries.length < HABIT_COUNT_MAX ? <Button kind="s" size="card" icon="plus" label={t("additions.oathCreate.addHabit")} onPress={() => open(null)} /> : <Text variant="caption" align="center">{t("additions.oathCreate.stackFull")}</Text>}
        {problem === "unfinished" ? <Banner tone="ora" icon="alert-circle-outline" title={t("additions.oathCreate.unfinishedTitle")} sub={t("additions.oathCreate.unfinishedSub")} />
          : <Text variant="caption" align="center">{t("additions.oathCreate.oneProofNote")}</Text>}
      </Screen>
    );
  }

  const named = editor.name.trim().length > 0;
  const canSave = named && editor.entry !== null;
  const commit = () => {
    if (editor.entry === null || !named) return;
    set(saveHabit(draft, editor.index, { name: editor.name, entry: editor.entry }));
    close();
  };
  const hideActions = searching && typing;

  return (
    <Screen bar={<NavBar onBack={close} close title={t(editor.index === null ? "additions.oathCreate.newHabitTitle" : "additions.oathCreate.editHabitTitle")} />}
      bottomInset={hideActions ? 0 : pinnedOne}
      {...(hideActions ? {} : { pinned: (
        <ButtonRow>
          <Button kind="s" size="row" label={t("additions.oathCreate.cancelHabit")} onPress={close} />
          <Button kind="l" size="row" label={t("additions.oathCreate.saveHabit")} onPress={commit} disabled={!canSave} />
        </ButtonRow>
      ) })}>
      {searching ? null : (
        <>
          <Title heading={t(editor.index === null ? "additions.oathCreate.newHabitTitle" : "additions.oathCreate.editHabitTitle")} sub={t("additions.oathCreate.editorSub")} />
          <SentenceInput label={t("additions.oathCreate.habitName")} value={editor.name} onChange={(name) => setEditor({ ...editor, name })} max={GOAL_MAX} placeholder={t("additions.oathCreate.habitPlaceholder")} />
          {editor.entry === null
            ? <Banner tone="grey" icon="image-outline" title={t("additions.oathCreate.noProof")} sub={t("additions.oathCreate.noProofSub")} />
            : <Banner tone="lime" icon={entryIcon(editor.entry)} title={t("additions.oathCreate.proofSummary", { object: entryLabel(editor.entry) })} sub={t("additions.oathCreate.proofSummarySub")} />}
        </>
      )}
      <ProofObjectPicker key="proof-picker" value={editor.entry} onPick={(entry) => setEditor({ ...editor, entry })} onActiveChange={setSearching} />
      {searching || editor.index === null ? null : (
        <Button kind="d" label={t("additions.oathCreate.removeHabit", { n: editor.index + 1 })} onPress={() => { set(removeHabit(draft, editor.index!)); close(); }} />
      )}
    </Screen>
  );
}
