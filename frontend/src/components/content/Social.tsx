import type { ListItem } from "../layout/list";
import { ScrollView, View } from "react-native";
import { t } from "@/copy";
import { banner, cheapShadow, color, fontFamily, heroCard, linear, metrics, space } from "@/theme";
import type { HeroPaletteName, PaletteName } from "@/theme";
import { tile as tileFor } from "@/theme";
import { Avatar } from "../avatar/Avatar";
import { AVATAR_TABS, parseAvatar } from "../avatar/palette";
import { Button, RowButton, Shine } from "../actions";
import type { ButtonKind } from "../actions";
import { Keeper } from "../keeper/Keeper";
import type { KeeperMood } from "@/copy";
import { Gradient, Icon, Pop, PressScale, Surface, Text } from "../primitives";
import type { IconName } from "../primitives";
import { Segmented } from "./Basics";

// ── BountyCover (`cover`) ── brand gradient (creator data), giant faint icon, brand pill, tags, message, shine.
export function BountyCover({ brand, logo, verified, colors, icon, message, tags = [], height = metrics.cover.height, onPress }: {
  brand: string; logo: string; verified?: boolean; colors: readonly [string, string]; icon: IconName; message: string; tags?: { text: string; icon: IconName }[]; height?: number; onPress?: () => void;
}) {
  const c = metrics.cover;
  const body = (
    <Surface radius={c.radius} gradient={linear(135, colors)} shadow={"0 20px 40px rgba(0,0,0,0.40)"} clip style={{ height }}>
      <View style={{ height }}>
        <View style={{ position: "absolute", right: -24, bottom: -46, transform: [{ rotate: "-12deg" }] }}>
          <Icon name={icon} size={c.bigIcon} color={color.extra.decoWhite16} />
        </View>
        {/* Brand pill left, tags right, in one row: on a narrow phone the brand name truncates instead of
            running under the tags. */}
        <View style={{ position: "absolute", left: c.inset, right: c.inset, top: c.inset, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[5] }}>
        <View style={{ flexShrink: 1, minWidth: 0, height: c.pill, paddingLeft: 4, paddingRight: 11, borderRadius: c.pill / 2, backgroundColor: color.extra.onCover28, flexDirection: "row", alignItems: "center", gap: 7 }}>
          <View style={{ width: c.logo, height: c.logo, borderRadius: c.logoRadius, backgroundColor: color.text.primary, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: fontFamily("sans", 800), fontSize: 12, color: color.text.onLime }}>{logo}</Text>
          </View>
          <Text variant="chipMd" numberOfLines={1} style={{ flexShrink: 1 }}>{brand}</Text>
          {verified !== false ? <Icon name="check-decagram" size={14} color={color.lime.base} /> : null}
        </View>
        <View style={{ flexDirection: "row", gap: space[5], flexShrink: 0 }}>
          {tags.map((tg) => (
            <View key={tg.text} style={{ height: c.tagH, paddingLeft: 7, paddingRight: 9, borderRadius: c.tagH / 2, backgroundColor: color.extra.onCover28, flexDirection: "row", alignItems: "center", gap: space[4] }}>
              <Icon name={tg.icon} size={13} />
              <Text variant="chip" style={{ fontSize: 11 }}>{tg.text}</Text>
            </View>
          ))}
        </View>
        </View>
        <Text variant="coverMsg" style={{ position: "absolute", left: 16, right: 16, bottom: 16 }}>{message}</Text>
        <Shine period={5000} delay={1200} widthPct={0.35} />
      </View>
    </Surface>
  );
  return onPress ? <PressScale onPress={onPress} accessibilityLabel={message}>{body}</PressScale> : body;
}

// ── HScroller (`hs`) ── hero cards (168×148) or category chips, bleeding to the screen edges.
export type HeroItem = { title: string; icon: IconName; value: string; sub: string; palette: HeroPaletteName; onPress?: () => void };
export function HScroller({ label, onSeeAll, cards, chips, chipValue, onChip }: {
  label?: string; onSeeAll?: () => void; cards?: HeroItem[]; chips?: string[]; chipValue?: number; onChip?: (i: number) => void;
}) {
  const h = metrics.hscroller;
  return (
    <View style={{ gap: space[10] }}>
      {label ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text variant="monoLabel">{label}</Text>
          {onSeeAll ? <PressScale onPress={onSeeAll} accessibilityLabel={t("common.seeAll")} hit={{ w: 40, h: 20 }}><Text variant="chipMd" color={color.lime.base}>{t("common.seeAll")}</Text></PressScale> : null}
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.screenX }} contentContainerStyle={{ paddingHorizontal: space.screenX, paddingTop: 2, paddingBottom: 8, gap: chips ? space[6] : space[10] }}>
        {cards?.map((c) => {
          const p = heroCard(c.palette);
          return (
            <PressScale key={c.title} onPress={c.onPress} accessibilityLabel={`${c.title}, ${c.value}, ${c.sub}`}>
              <Surface radius={h.radius} gradient={p.gradient} shadow={`inset 0 1.5px 0 ${color.extra.tileHi35}, 0 14px 28px rgba(0,0,0,0.4)`} clip style={{ width: h.cardW, height: h.cardH }}>
                <View style={{ flex: 1, padding: h.pad, justifyContent: "space-between" }}>
                  <View style={{ position: "absolute", right: -16, bottom: -24, transform: [{ rotate: "-12deg" }] }}><Icon name={c.icon} size={h.bigIcon} color={color.extra.decoWhite20} /></View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space[6] }}>
                    <Icon name={c.icon} size={16} color={p.fg} />
                    <Text variant="chipMd" color={p.fg} numberOfLines={1}>{c.title}</Text>
                  </View>
                  <View>
                    <Text variant="heroCardValue" color={p.fg}>{c.value}</Text>
                    <Text variant="micro" color={p.fg} style={{ opacity: 0.85, marginTop: space[2] }} numberOfLines={1}>{c.sub}</Text>
                  </View>
                </View>
              </Surface>
            </PressScale>
          );
        })}
        {chips?.map((label2, i) => {
          const on = chipValue === i;
          return (
            <PressScale key={label2} onPress={() => onChip?.(i)} accessibilityLabel={label2} accessibilityState={{ selected: on }}>
              <View style={{ height: h.chipH, paddingHorizontal: h.chipPadX, borderRadius: h.chipH / 2, justifyContent: "center", backgroundColor: on ? color.text.primary : color.surface[1], boxShadow: `inset 0 0 0 1px ${color.line.hairline3}` }}>
                <Text variant="chipMd" color={on ? color.text.onLime : color.text.soft}>{label2}</Text>
              </View>
            </PressScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── InboxList (`nt`) ──
export type InboxLead = { kind: "avatar"; config: string } | { kind: "keeper"; mood: KeeperMood } | { kind: "icon"; icon: IconName; palette: PaletteName };
export interface InboxItemView {
  id: string; title: string; sub?: string; time: string; lead: InboxLead;
  badge?: { icon: IconName; palette: PaletteName }; needsAction?: boolean; done?: boolean; unread?: boolean;
  actions?: { label: string; kind?: ButtonKind; onPress: () => void }[]; onPress?: () => void;
}
export function InboxList({ label, action, items }: { label?: string; action?: { label: string; onPress: () => void }; items: InboxItemView[] }) {
  return (
    <View style={{ gap: space[8] }}>
      {label ? <InboxLabel label={label} {...(action ? { action } : {})} /> : null}
      {items.map((it) => <InboxCard key={it.id} it={it} />)}
    </View>
  );
}

/** InboxList as ScreenList rows (layout/Screen): the same label and cards, spaced as InboxList spaces them. */
export function inboxListItems(key: string, { label, action, items }: { label?: string; action?: { label: string; onPress: () => void }; items: InboxItemView[] }, gapBefore = 0): ListItem[] {
  const out: ListItem[] = [];
  if (label) out.push({ key: `${key}:label`, gapBefore, render: () => <InboxLabel label={label} {...(action ? { action } : {})} /> });
  items.forEach((it, i) => out.push({ key: `${key}:${it.id}`, gapBefore: i === 0 && !label ? gapBefore : space[8], render: () => <InboxCard it={it} /> }));
  return out;
}

function InboxLabel({ label, action }: { label: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: space[2] }}>
      <Text variant="monoLabel">{label}</Text>
      {action ? <PressScale onPress={action.onPress} accessibilityLabel={action.label}><Text variant="chipMd" color={color.lime.base}>{action.label}</Text></PressScale> : null}
    </View>
  );
}

function InboxCard({ it }: { it: InboxItemView }) {
  const m = metrics.inbox;
  const tile = it.lead.kind === "icon" ? tileFor(it.lead.palette) : null;
  return (
    <PressScale onPress={it.onPress} accessibilityLabel={`${it.title}. ${it.sub ?? ""}`}>
      <View style={{ padding: m.pad, borderRadius: m.radius, backgroundColor: color.surface[1], boxShadow: `inset 0 0 0 1px ${it.needsAction && !it.done ? color.lime.glow22 : color.line.hairline}`, opacity: it.done ? metrics.card.dimOpacity : 1, flexDirection: "row", gap: m.gap }}>
        <View style={{ width: m.tile, height: m.tile }}>
          <View style={{ width: m.tile, height: m.tile, borderRadius: m.tileRadius, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: it.lead.kind === "keeper" ? color.surface[4] : color.extra.transparent, boxShadow: `inset 0 1.5px 0 ${color.extra.tileHi35}, inset 0 -2px 0 ${color.extra.tileShade20}` }}>
            {tile ? <Gradient g={tile.gradient} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
            {it.lead.kind === "avatar" ? <Avatar config={it.lead.config} size={m.tile} /> : null}
            {it.lead.kind === "keeper" ? <Keeper mood={it.lead.mood} bust size={m.tile} /> : null}
            {it.lead.kind === "icon" && tile ? <Icon name={it.lead.icon} size={22} color={tile.ink} /> : null}
          </View>
          {it.badge ? (
            <View style={{ position: "absolute", right: -5, bottom: -5, width: m.badge, height: m.badge, borderRadius: m.badge / 2, backgroundColor: color.tilePalette[it.badge.palette][1], boxShadow: `0 0 0 ${m.badgeRing}px ${color.surface[1]}`, alignItems: "center", justifyContent: "center" }}>
              <Icon name={it.badge.icon} size={13} color={color.text.onLime} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", gap: space[8], alignItems: "center" }}>
            <Text variant="rowTitle" style={{ flex: 1 }}>{it.title}</Text>
            {it.unread ? <View style={{ width: m.dot, height: m.dot, borderRadius: m.dot / 2, backgroundColor: color.lime.base }} /> : null}
            <Text variant="micro">{it.time}</Text>
          </View>
          {it.sub ? <Text variant="label" color={color.text.secondary} style={{ fontSize: 13, lineHeight: 18, marginTop: space[2] }}>{it.sub}</Text> : null}
          {it.actions?.length ? (
            <View style={{ flexDirection: "row", gap: space[6], marginTop: space[10] }}>
              {it.actions.map((a) => <RowButton key={a.label} label={a.label} {...(a.kind ? { kind: a.kind } : {})} onPress={a.onPress} />)}
            </View>
          ) : null}
        </View>
      </View>
    </PressScale>
  );
}

// ── ProfileCard (`prof`) ──
export function ProfileCard({ name, handle, avatar, bannerIndex = 0, bannerIcon = "cards-playing-outline", bio, verified, socials = [], actions = [] }: {
  name: string; handle: string; avatar: string; bannerIndex?: 0 | 1 | 2 | 3 | 4; bannerIcon?: IconName; bio?: string; verified?: boolean;
  socials?: { glyph?: string; icon?: IconName; text: string; onPress?: () => void }[]; actions?: { label: string; icon: IconName; onPress: () => void }[];
}) {
  const p = metrics.profile;
  return (
    <View style={{ borderRadius: p.radius, overflow: "hidden", backgroundColor: color.surface[1], boxShadow: `inset 0 0 0 1px ${color.line.hairline2}` }}>
      <Gradient g={banner(bannerIndex)} style={{ height: p.banner, overflow: "hidden" }}>
        <View style={{ position: "absolute", right: -10, top: -24, transform: [{ rotate: "-12deg" }] }}><Icon name={bannerIcon} size={p.bannerIcon} color={color.extra.decoWhite20} /></View>
      </Gradient>
      <View style={{ position: "absolute", left: 16, top: p.avatarTop, width: p.avatar, height: p.avatar, borderRadius: p.avatarRadius, overflow: "hidden", boxShadow: cheapShadow(`0 0 0 4px ${color.surface[1]}, 0 12px 24px rgba(0,0,0,0.4)`), transform: [{ rotate: "-3deg" }] }}>
        <Avatar config={avatar} size={p.avatar} accessibilityLabel={name} />
      </View>
      {actions.length ? (
        <View style={{ position: "absolute", right: 14, top: p.actionsTop, flexDirection: "row", gap: space[6] }}>
          {actions.map((a) => (
            <PressScale key={a.label} onPress={a.onPress} accessibilityLabel={a.label}>
              <View style={{ height: p.chipH, paddingHorizontal: 13, borderRadius: p.chipH / 2, backgroundColor: color.surface[3], boxShadow: `inset 0 0 0 1px ${color.line.strong}`, flexDirection: "row", alignItems: "center", gap: space[6] }}>
                <Icon name={a.icon} size={15} />
                <Text variant="chipMd">{a.label}</Text>
              </View>
            </PressScale>
          ))}
        </View>
      ) : null}
      <View style={{ paddingTop: p.bodyTop, paddingHorizontal: 16, paddingBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[6] }}>
          <Text variant="profileName">{name}</Text>
          {verified ? <Icon name="check-decagram" size={18} color={color.lime.base} /> : null}
        </View>
        <Text variant="monoValue" color={color.text.secondary} style={{ marginTop: space[2] }}>{handle}</Text>
        {bio ? <Text variant="label" color={color.text.soft} style={{ marginTop: space[10] }}>{bio}</Text> : null}
        {socials.length ? (
          <View style={{ marginTop: space[12], flexDirection: "row", flexWrap: "wrap", gap: space[6] }}>
            {socials.map((s) => (
              <PressScale key={s.text} {...(s.onPress ? { onPress: s.onPress } : {})} accessibilityLabel={s.text}>
                <View style={{ height: p.socialH, paddingLeft: 10, paddingRight: 12, borderRadius: p.socialH / 2, backgroundColor: color.surface[3], boxShadow: `inset 0 0 0 1px ${color.line.hairline3}`, flexDirection: "row", alignItems: "center", gap: space[6] }}>
                  {s.glyph ? <Text style={{ fontFamily: fontFamily("sans", 800), fontSize: 14, color: color.text.primary }}>{s.glyph}</Text> : null}
                  {s.icon ? <Icon name={s.icon} size={16} /> : null}
                  <Text variant="chipMd">{s.text}</Text>
                </View>
              </PressScale>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const OPTION_KEYS = ["base", "eyes", "hat", "fit", "extra", "back"] as const;

// ── AvatarBuilder (`avb`) ── full builder (I9 / A4), or the edit variant (I8).
export function AvatarBuilder({ config, onChange, variant = "full", tab = 0, onTab, onShuffle, onBuild, onUsePhoto, bannerIndex, onBanner }: {
  config: string; onChange: (c: string) => void; variant?: "full" | "edit" | "preview"; tab?: number; onTab?: (i: number) => void;
  onShuffle?: () => void; onBuild?: () => void; onUsePhoto?: () => void; bannerIndex?: number; onBanner?: (i: number) => void;
}) {
  const a = metrics.avatarBuilder;
  const d = parseAvatar(config);
  const T = AVATAR_TABS[tab] ?? AVATAR_TABS[0];
  const edit = variant === "edit";
  const ps = edit ? a.previewEdit : a.preview;
  const set = (digit: number, v: number) => { const nd = d.slice(); nd[digit] = v; onChange(nd.join("")); };
  return (
    <View style={{ gap: space[14] }}>
      <View style={{ flexDirection: edit ? "row" : "column", alignItems: "center", gap: space[16] }}>
        <Pop ms={500}>
          <View style={{ width: ps, height: ps, borderRadius: ps / 2, overflow: "hidden", transform: [{ rotate: "-2deg" }], boxShadow: cheapShadow("0 20px 44px rgba(0,0,0,0.5)") }}>
            <Avatar config={config} size={ps} />
          </View>
        </Pop>
        <View style={{ gap: space[8], ...(edit ? { flex: 1 } : { width: a.preview }) }}>
          {edit ? (
            <>
              <Button label={t("additions.avatarBuilder.build")} kind="l" icon="account-edit-outline" size="row" {...(onBuild ? { onPress: onBuild } : {})} />
              <Button label={t("additions.avatarBuilder.usePhoto")} kind="s" icon="image-outline" size="row" {...(onUsePhoto ? { onPress: onUsePhoto } : {})} />
            </>
          ) : onShuffle ? (
            <Button label={t("additions.avatarBuilder.shuffle")} kind="s" icon="shuffle-variant" size="row" onPress={onShuffle} />
          ) : null}
        </View>
      </View>
      {edit && onBanner ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[8] }}>
          {/* reference › I8: the swatches carry a "Banner" label. */}
          <Text variant="caption" color={color.text.tertiary}>{t("additions.avatarBuilder.banner")}</Text>
          {([0, 1, 2, 3, 4] as const).map((i) => (
            <PressScale key={i} onPress={() => onBanner(i)} accessibilityState={{ selected: bannerIndex === i }} accessibilityLabel={t("additions.a11y.banner", { n: i + 1 })}>
              <Gradient g={banner(i)} style={{ width: a.bannerSwatch[0], height: a.bannerSwatch[1], borderRadius: 9, ...(bannerIndex === i ? { boxShadow: `0 0 0 2px ${color.bg.app}, 0 0 0 4px ${color.text.primary}` } : {}) }} />
            </PressScale>
          ))}
        </View>
      ) : null}
      {variant === "full" ? (
        <>
          <Segmented items={[0, 1, 2, 3, 4, 5].map((i) => t(`common.avatarTabs.${i}`))} value={tab} onChange={(i) => onTab?.(i)} />
          {"swatches" in T ? (
            // One row at any width (8 × 32 dp needs 326 dp with the design's 10 dp gaps; a 360 dp phone has 320).
            <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%", maxWidth: T.swatches.length * (a.swatch + space[10]), alignSelf: "center" }}>
              {T.swatches.map((c, i) => (
                <PressScale key={c} onPress={() => set(T.swatchDigit, i)} accessibilityState={{ selected: d[T.swatchDigit] === i }} accessibilityLabel={t("additions.a11y.colour", { n: i + 1 })} scale={0.92}>
                  <View style={{ width: a.swatch, height: a.swatch, borderRadius: a.swatch / 2, backgroundColor: c, boxShadow: d[T.swatchDigit] === i ? `0 0 0 3px ${color.bg.app}, 0 0 0 5px ${color.text.primary}` : `inset 0 0 0 1px ${color.extra.swatchRing}` }} />
                </PressScale>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[8] }}>
            {Array.from({ length: T.count }, (_, i) => {
              const nd = d.slice(); nd[T.digit] = i;
              const on = d[T.digit] === i;
              const label = t(`additions.avatarBuilder.options.${OPTION_KEYS[tab] ?? "base"}.${i}`);
              return (
                <PressScale key={i} onPress={() => set(T.digit, i)} accessibilityLabel={label} accessibilityState={{ selected: on }} style={{ width: "31.5%" }}>
                  <View style={{ height: a.optionH, borderRadius: 22, backgroundColor: on ? color.surface[3] : color.surface[1], boxShadow: on ? `inset 0 0 0 2.5px ${color.text.primary}` : `inset 0 0 0 1px ${color.extra.hairline07}`, alignItems: "center", justifyContent: "center", gap: space[6] }}>
                    <View style={{ width: a.optionAvatar, height: a.optionAvatar, borderRadius: a.optionAvatar / 2, overflow: "hidden" }}>
                      <Avatar config={nd.join("")} size={a.optionAvatar} />
                    </View>
                    <Text variant="chip" color={color.text.muted}>{label}</Text>
                  </View>
                </PressScale>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}
