// Choosing the object a habit's proof photo shows: six quick picks, then a search over the whole catalog.
// The pick is one of the program's eight objects (`OBJECTS`, the Oath's `object_id`); an alias resolves to one only when it
// is the same thing, and anything else in the catalog is listed as not available yet and can't be picked, so the
// screen never offers something Live proof can't check. Picking only reports the choice: the habit editor decides what to
// do with it and when it is saved.
import { useDeferredValue, useMemo, useState } from "react";
import { Keyboard, View } from "react-native";
import { OBJECTS } from "@kept/config";
import { t } from "@/copy";
import type { CopyKey } from "@/copy";
import { useToast } from "@/components/chrome";
import { Banner } from "@/components/content/Basics";
import { OptionGrid, SearchInput } from "@/components/content/Inputs";
import { RowList } from "@/components/content/Rows";
import type { RowProps } from "@/components/content/Rows";
import { Text } from "@/components/primitives";
import { color, metrics } from "@/theme";
import { CATALOG, QUICK_PICK_OBJECTS } from "@/features/objects/catalog";
import type { CatalogEntry } from "@/features/objects/catalog";
import { buildIndex, normalize, objectIndexOf, searchObjects } from "@/features/objects/search";
import { objectIcon, objectName } from "@/features/oaths/present";
import { haptic } from "@/lib/haptics";

const entryLabel = (key: string) => t(`additions.objects.entry.${key}` as CopyKey);
const categoryName = (c: CatalogEntry["category"]) => t(`additions.objects.cat.${c}` as CopyKey);
const QUICK = QUICK_PICK_OBJECTS.map((id) => OBJECTS.findIndex((o) => o.id === id));

export function ProofObjectPicker({ value, onPick, onActiveChange }: { value: number | null; onPick: (objectId: number, entry: string) => void; onActiveChange?: (active: boolean) => void }) {
  const toast = useToast();
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
    const i = objectIndexOf(entry);
    if (i === null) { toast(t("additions.objects.unavailableToast")); return; }
    haptic.light();
    onPick(i, entry.key);
    // Chosen: put the keyboard away and the search aside, so the choice and the Save button are in view.
    Keyboard.dismiss();
    setQuery("");
    report(false, "");
  };

  const row = (entry: CatalogEntry, term?: string): RowProps => {
    const i = objectIndexOf(entry);
    const available = i !== null;
    const selected = available && i === value;
    const label = entryLabel(entry.key);
    const object = available ? objectName(i) : "";
    const sub = !available ? t("additions.objects.unavailableIn", { category: categoryName(entry.category) })
      : term && normalize(term) !== normalize(label) ? t("additions.objects.matchedAs", { alias: term, object })
      : label !== object ? t("additions.objects.countsAs", { object })
      : categoryName(entry.category);
    return {
      title: label, sub,
      leading: { kind: "icon", icon: available ? objectIcon(i) : "lock-outline", ...(selected ? { bg: color.lime.base, fg: color.text.onLime } : {}) },
      ...(selected ? { value: t("additions.objects.selected"), valueColor: color.lime.base } : {}),
      ...(available ? {} : { titleColor: color.text.secondary }),
      a11yLabel: `${label}. ${available ? (selected ? t("additions.objects.selected") : sub) : t("additions.objects.unavailable")}`,
      selected, disabled: !available,
      onPress: () => pick(entry),
    };
  };

  return (
    <View style={{ gap: metrics.screen.gap }}>
      {active ? null : (
        <>
          <Text variant="monoLabel">{t("additions.objects.quickPicks")}</Text>
          <OptionGrid mode="tile" cols={3} value={value === null ? -1 : QUICK.indexOf(value)} onChange={(q) => { haptic.light(); onPick(QUICK[q]!, OBJECTS[QUICK[q]!]!.id); }}
            items={QUICK.map((i) => ({ title: objectName(i), icon: OBJECTS[i]!.icon }))} />
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
