// Choosing the object a habit's proof photo shows: six quick picks, then a search over the whole catalog. Every entry can
// be picked: the local model is asked for the object by name, so it isn't limited to a fixed list. Picking only reports the
// choice (the entry's key): the habit editor decides what to do with it and when it is saved.
import { useDeferredValue, useMemo, useState } from "react";
import { Keyboard, View } from "react-native";
import { t } from "@/copy";
import type { CopyKey } from "@/copy";
import { Banner } from "@/components/content/Basics";
import { OptionGrid, SearchInput } from "@/components/content/Inputs";
import { RowList } from "@/components/content/Rows";
import type { RowProps } from "@/components/content/Rows";
import { Text } from "@/components/primitives";
import { color, metrics } from "@/theme";
import { CATALOG, QUICK_PICK_OBJECTS } from "@/features/objects/catalog";
import type { CatalogEntry } from "@/features/objects/catalog";
import { buildIndex, normalize, searchObjects } from "@/features/objects/search";
import { entryIcon, entryLabel } from "@/features/objects/proof";
import { haptic } from "@/lib/haptics";

const categoryName = (c: CatalogEntry["category"]) => t(`additions.objects.cat.${c}` as CopyKey);

export function ProofObjectPicker({ value, onPick, onActiveChange }: { value: string | null; onPick: (entry: string) => void; onActiveChange?: (active: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const index = useMemo(() => buildIndex(entryLabel), []);
  // Typing stays responsive: the rows follow the field a beat behind (up to 80 rows can match one letter).
  const shown = useDeferredValue(query);
  const searching = normalize(shown) !== "";
  const matches = useMemo(() => searchObjects(index, shown), [index, shown]);
  const active = focused || normalize(query) !== "";
  const report = (focus: boolean, q: string) => onActiveChange?.(focus || normalize(q) !== "");

  const pick = (entry: CatalogEntry) => {
    haptic.light();
    onPick(entry.key);
    // Chosen: put the keyboard away and the search aside, so the choice and the Save button are in view.
    Keyboard.dismiss();
    setQuery("");
    report(false, "");
  };

  const row = (entry: CatalogEntry, term?: string): RowProps => {
    const selected = entry.key === value;
    const label = entryLabel(entry.key);
    const sub = term && normalize(term) !== normalize(label) ? t("additions.objects.matchedAs", { alias: term, object: label }) : categoryName(entry.category);
    return {
      title: label, sub,
      leading: { kind: "icon", icon: entryIcon(entry.key), ...(selected ? { bg: color.lime.base, fg: color.text.onLime } : {}) },
      ...(selected ? { value: t("additions.objects.selected"), valueColor: color.lime.base } : {}),
      a11yLabel: `${label}. ${selected ? t("additions.objects.selected") : sub}`,
      selected,
      onPress: () => pick(entry),
    };
  };

  return (
    <View style={{ gap: metrics.screen.gap }}>
      {active ? null : (
        <>
          <Text variant="monoLabel">{t("additions.objects.quickPicks")}</Text>
          <OptionGrid mode="tile" cols={3} value={value === null ? -1 : QUICK_PICK_OBJECTS.indexOf(value as (typeof QUICK_PICK_OBJECTS)[number])} onChange={(q) => { haptic.light(); onPick(QUICK_PICK_OBJECTS[q]!); }}
            items={QUICK_PICK_OBJECTS.map((key) => ({ title: entryLabel(key), icon: entryIcon(key) }))} />
        </>
      )}
      <SearchInput value={query} onChange={(q) => { setQuery(q); report(focused, q); }} onFocusChange={(f) => { setFocused(f); report(f, query); }}
        label={t("additions.objects.searchLabel")} placeholder={t("additions.objects.searchPlaceholder")} clearLabel={t("additions.objects.clear")} />
      {searching ? (
        matches.length ? (
          <View style={{ gap: metrics.screen.gap }}>
            <Text variant="monoLabel" accessibilityLiveRegion="polite" accessibilityLabel={t("additions.objects.resultsA11y", { n: matches.length })}>{t("additions.objects.results", { n: matches.length })}</Text>
            <RowList rows={matches.map((m) => row(m.entry, m.term))} />
          </View>
        ) : (
          <View accessibilityLiveRegion="polite">
            <Banner tone="grey" icon="magnify" title={t("additions.objects.noResults", { query: shown.trim() })} sub={t("additions.objects.noResultsSub")} />
          </View>
        )
      ) : active ? (
        <Text variant="caption" color={color.text.secondary}>{t("additions.objects.searchHint", { n: CATALOG.length })}</Text>
      ) : (
        <Text variant="caption" color={color.text.secondary}>{t("additions.objects.searchMore")}</Text>
      )}
    </View>
  );
}
