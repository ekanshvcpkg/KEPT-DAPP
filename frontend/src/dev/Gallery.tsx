// Dev-only Gallery (BUILD_PLAN Phase 1): every component in design/components.md, in every state, on the
// device. Section labels are component names (developer-facing), so they are the only literals here;
// everything a user would read comes from copy.json via t().
import { useState } from "react";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OBJECTS } from "@kept/config";
import { keeperLines, sampleData, t } from "@/copy";
import type { CopyKey } from "@/copy";
import { color, metrics, space } from "@/theme";
import { Avatar } from "@/components/avatar/Avatar";
import { Button, ButtonRow, RowButton } from "@/components/actions";
import { BrandLockup, BrandSplash, BrandStamp, BrandWord } from "@/components/brand/Brand";
import {
  AppHeader, BalanceChip, BottomSheet, DevnetBadge, FxLayer, NavBar, StepBar, TabBar, useToast,
} from "@/components/chrome";
import type { FxKind, TabKey } from "@/components/chrome";
import { Banner, BodyText, Breakdown, Chip, ChipRow, Note, OddsChip, SearchBar, Segmented, Skeleton, Tag, Title, UploadBox } from "@/components/content/Basics";
import { ProofCamera, Shutter } from "@/components/content/Camera";
import type { CameraState } from "@/components/content/Camera";
import { MoneyMoment, OptionGrid, QRCard, SeatSlots, SentenceInput } from "@/components/content/Inputs";
import { CardDeck } from "@/components/content/Deck";
import { DayMemberGrid, HPBar, HPPanel, OathCard } from "@/components/content/Oath";
import type { GridMember } from "@/components/content/Oath";
import { RowList, Toggle } from "@/components/content/Rows";
import { AvatarBuilder, BountyCover, HScroller, InboxList, ProfileCard } from "@/components/content/Social";
import { BarChart, DayStrip, IdentityRow, KeptRateRing, SignStatus } from "@/components/content/Status";
import type { SignState } from "@/components/content/Status";
import { KeeperMark, KeeperNote, KeeperPlacement } from "@/components/keeper/KeeperUI";
import { Text } from "@/components/primitives";

const k = (key: string) => t(key as CopyKey);
const noop = () => undefined;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[12], paddingTop: space[24] }}>
      <Text variant="monoLabel" color={color.lime.base}>{title}</Text>
      {children}
    </View>
  );
}
const Label = ({ text }: { text: string }) => <Text variant="monoMicro" color={color.text.tertiary}>{text}</Text>;

const MEMBERS = (cells: [string, string, string, string]): GridMember[] => [
  { key: "you", name: k("screens.D2.b6.r0.t"), initial: "Y", color: color.member.you, cells: cells[0] },
  { key: "riya", name: k("screens.D2.b6.r1.t"), initial: "R", color: color.member.riya, cells: cells[1] },
  { key: "arjun", name: k("screens.D2.b6.r2.t"), initial: "A", color: color.member.arjun, cells: cells[2] },
  { key: "dev", name: k("screens.D2.b6.r3.t"), initial: "D", color: color.member.dev, cells: cells[3] },
];
const CAMERA_STATES: CameraState[] = ["idle", "check", "fail", "review", "scan", "off"];
const SIGN_STATES: SignState[] = ["pending", "success", "fail", "warn"];

export function Gallery() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>("today");
  const [seg, setSeg] = useState(0);
  const [opt, setOpt] = useState(1);
  const [len, setLen] = useState(1);
  const [text, setText] = useState("");
  const [on, setOn] = useState(true);
  const [avatar, setAvatar] = useState("31205140");
  const [avTab, setAvTab] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [note, setNote] = useState(false);
  const [fx, setFx] = useState<{ kind: FxKind; n: number } | null>(null);
  const [step, setStep] = useState(2);
  const line = keeperLines("D2")[0] ?? keeperLines("A1")[0]!;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg.app }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space[8], paddingBottom: insets.bottom + 200, paddingHorizontal: metrics.pinned.x }}>
        <DevnetBadge />

        <Section title="AppHeader">
          <AppHeader title={k("screens.B1.header.title")} balance="1,043" unreadCount={3} keeper={{ hasNew: true, onPress: () => setNote(true) }} onBell={noop} onBalance={noop} />
          <AppHeader title={k("screens.I1.header.title")} balance="0" unreadCount={0} keeper={{ hasNew: false, onPress: () => setNote(true) }} extra={{ icon: "cog-outline", label: t("additions.a11y.settings"), onPress: noop }} />
          <Label text="BalanceChip" />
          <BalanceChip amount="1,043" />
        </Section>

        <Section title="NavBar + StepBar">
          <NavBar onBack={noop} title={k("screens.D2.nav.title")} right="Day 3/7" />
          <NavBar onBack={() => setStep((s) => Math.max(1, s - 1))} steps={[step, 6]} />
          <NavBar onBack={noop} close title={k("screens.E1.nav.title")} keeper={{ hasNew: true, onPress: () => setNote(true) }} />
          <Button kind="s" size="row" label={`${k("screens.C3.pin.0")} (${step}/6)`} onPress={() => setStep((s) => (s % 6) + 1)} />
          <View style={{ height: metrics.nav.step.h }}><StepBar current={6} total={6} /></View>
        </Section>

        <Section title="TabBar + PlusButton">
          <View style={{ height: metrics.tabBar.height + metrics.tabBar.bottom + space[8], marginHorizontal: -metrics.pinned.x }}>
            <TabBar active={tab} onTab={setTab} onPlus={() => setSheet(true)} />
          </View>
        </Section>

        <Section title="Keeper">
          <KeeperPlacement mood={line.mood} line={line.line} />
          <KeeperPlacement mood="smug" side="r" lines={keeperLines("A1").map((l) => l.line)} chips={[{ text: k("screens.D2.b4.chip.0"), icon: "cards-playing-outline", x: 10, y: 20, tilt: -3 }]} />
          <KeeperPlacement mood="shocked" side="c" prop="none" anim="jump" line={keeperLines("D3")[0]?.line ?? line.line} />
          <View style={{ flexDirection: "row", gap: space[12], alignItems: "center" }}>
            <KeeperMark hasNew onPress={() => setNote(true)} />
            <KeeperMark />
            <Button kind="s" size="row" label={t("common.keeperNoteEyebrow")} onPress={() => setNote(true)} />
          </View>
        </Section>

        <Section title="Button">
          <Button kind="p" label={k("screens.D2.pin.0")} icon="camera" onPress={noop} />
          <Button kind="l" label={k("screens.L1.pin.0")} icon="sack" onPress={noop} />
          <Button kind="s" label={k("screens.D2.pin.1")} onPress={noop} />
          <Button kind="t" label={k("screens.+.b3.btn.0")} onPress={noop} />
          <Button kind="d" label={k("screens.D1·x.b1.btn.0")} onPress={noop} />
          <Label text="disabled · loading" />
          <Button kind="p" label={k("screens.D2.pin.0")} disabled />
          <Button kind="l" label={t("common.signing")} loading />
          <ButtonRow>
            <Button kind="s" size="row" label={k("screens.G1.pin.1")} />
            <Button kind="p" size="row" label={k("screens.G1.pin.0")} />
          </ButtonRow>
          <View style={{ flexDirection: "row", gap: space[8] }}>
            <RowButton label={k("screens.F5.b4.r0.r")} />
            <RowButton kind="l" label={k("screens.B1.b4.btn")} />
          </View>
        </Section>

        <Section title="Title · BodyText · Note · Banner">
          <Title heading={k("screens.C3.b0.title")} sub={k("screens.C3.b0.sub")} />
          <Title heading={k("screens.L1.b1.title")} fs={40} align="center" />
          <BodyText text={k("screens.B1.b0.text").replace("09:18:42", "<m>09:18:42</m>")} />
          <BodyText mono text={k("screens.D2.b6.label")} />
          <Note text={k("screens.C3.b2.sub")} />
          <Banner tone="lime" icon="sack" title={k("screens.B1.b1.title")} sub={k("screens.B1.b1.sub")} onPress={noop} />
          <Banner tone="vio" icon="eye-outline" title={k("screens.D2.b5.title")} sub={k("screens.D2.b5.sub")} />
          <Banner tone="red" icon="fire" title={k("screens.D2.b7.title")} sub={k("screens.D2.b7.sub")} />
          <Banner tone="ora" icon="alert-outline" title={k("screens.M3.b1.title")} />
          <Banner tone="grey" icon="information-outline" title={k("screens.E1.b0.sub")} />
        </Section>

        <Section title="Chip · Tag · OddsChip">
          <ChipRow>
            {(["lime", "red", "vio", "ora", "grey", "g", "dark", "white"] as const).map((tone, i) => <Chip key={tone} tone={tone} icon="check-bold" text={k(`screens.F5.b3.chip.${i % 3}`)} tilt={i % 2 ? 2 : -2} />)}
          </ChipRow>
          <ChipRow>
            <Tag text={k("screens.B1.b3.tag.0")} icon="sack" tone="lime" />
            <Tag text={k("screens.B1.b3.tag.1")} icon="timer-sand" />
            <Tag text={k("screens.B1.b3.tag.2")} icon="check-bold" tone="g" />
          </ChipRow>
          <ChipRow>
            <OddsChip likely="keep" text={k("screens.D2.b4.chip.0")} />
            <OddsChip likely="miss" text={k("screens.D2.b4.chip.1")} />
            <OddsChip likely="review" text={k("screens.D2.b4.chip.2")} />
          </ChipRow>
        </Section>

        <Section title="CardDeck (D-85)">
          <CardDeck cards={[
            { key: "a", node: <OathCard icon="dumbbell" name={k("screens.B1.b3.name")} meta={k("screens.B1.b3.meta")} hp={90} button={{ label: k("screens.B1.b3.btn"), kind: "p", icon: "camera" }} onPress={noop} /> },
            { key: "b", node: <OathCard icon="bottle-soda-outline" name={k("screens.B1.b4.name")} meta={k("screens.B1.b4.meta")} variant="sm" /> },
            { key: "c", node: <OathCard icon="book-open-variant" name={k("screens.B1.b5.r0.t")} meta={k("screens.B1.b5.r0.s")} variant="sm" /> },
          ]} />
        </Section>
        <Section title="OathCard">
          <OathCard icon="dumbbell" name={k("screens.B1.b3.name")} meta={k("screens.B1.b3.meta")} line={k("screens.B1.b3.line")} hp={90}
            tags={[{ text: k("screens.B1.b3.tag.0"), icon: "sack", tone: "lime" }, { text: k("screens.B1.b3.tag.1"), icon: "timer-sand" }]}
            float={{ text: k("screens.B1.b3.float"), initial: "R", bg: color.member.riya }} button={{ label: k("screens.B1.b3.btn"), kind: "p", icon: "camera" }} onPress={noop} />
          <OathCard icon="bottle-soda-outline" name={k("screens.B1.b4.name")} meta={k("screens.B1.b4.meta")} variant="lime"
            tags={[{ text: k("screens.B1.b4.tag.0"), icon: "account-group" }]} button={{ label: k("screens.B1.b4.btn"), kind: "l" }} />
          <OathCard icon="dumbbell" name={k("screens.B1.b3.name")} meta={k("screens.B1.b3.meta")} hp={20} warn={k("screens.D2.b1.text")} tilt={-1} />
          <OathCard icon="book-open-variant" name={k("screens.B1.b5.r0.t")} meta={k("screens.B1.b5.r0.s")} variant="sm" />
          <OathCard icon="guitar-acoustic" name={sampleData.history[2]!.name} meta={sampleData.history[2]!.sub} variant="sm" dim />
        </Section>

        <Section title="HPBar · HPPanel (100 / 40 / 20)">
          <HPBar hp={100} /><HPBar hp={40} /><HPBar hp={20} />
          <HPPanel hp={100} note={k("screens.D2.b0.note")} />
          <HPPanel hp={40} lostToday={20} />
          <HPPanel hp={20} lostToday={35} warn={k("screens.D2.b7.title")} />
        </Section>

        <Section title="DayMemberGrid (7 · 14 days)">
          <DayMemberGrid days={7} today={3} members={MEMBERS(["kkhffff", "kkpffff", "kmrffff", "kkrffff"])} />
          <DayMemberGrid days={14} today={9} members={MEMBERS(["kkkkkkkkhfffff", "kkkkkkkkkfffff", "kmkkmkxfffffff", "kkkkkkkkpfffff"])} />
        </Section>

        <Section title="MoneyMoment">
          <MoneyMoment value={k("screens.L1.b2.value")} caption={k("screens.L1.b2.caption")} tone="lime" />
          <MoneyMoment value="1,000" caption={t("common.currency")} />
          <MoneyMoment value={sampleData.history[2]!.delta} caption={sampleData.history[2]!.sub} tone="red" />
        </Section>

        <Section title="ProofCamera + Shutter">
          {CAMERA_STATES.map((s) => (
            <View key={s} style={{ gap: space[6] }}>
              <Label text={s} />
              <ProofCamera state={s} pill={t("additions.proof.pill", { n: s === "idle" ? 1 : 2, total: 2 })} object="dumbbell" gesture="palm" label={t("additions.proof.pill", { n: s === "idle" ? 1 : 2, total: 2 })} height={260} />
            </View>
          ))}
          <Shutter onShutter={() => toast(t("toasts.0"))} onFlip={noop} />
          <Shutter onShutter={noop} disabled />
        </Section>

        <Section title="OptionGrid · Segmented · SentenceInput">
          <OptionGrid mode="big" value={len} onChange={setLen} items={[0, 1, 2].map((i) => ({ title: k(`screens.C3.b1.o${i}.t`), sub: k(`screens.C3.b1.o${i}.s`) }))} />
          <OptionGrid mode="tile" cols={4} value={opt} onChange={setOpt} items={OBJECTS.map((o) => ({ title: t(`common.objects.${o.icon}` as CopyKey), icon: o.icon }))} />
          <OptionGrid mode="chip" value={opt % 3} onChange={setOpt} items={[0, 1, 2].map((i) => ({ title: t(`common.stakes.${i}` as CopyKey) }))} />
          <OptionGrid mode="row2" value={opt % 3} onChange={setOpt} items={[0, 1, 2].map((i) => ({ title: k(`screens.+.b1.r${i}.t`), sub: k(`screens.+.b1.r${i}.s`), icon: "plus" }))} />
          <Segmented items={[0, 1, 2].map((i) => k(`screens.H1.b0.seg.${i}`))} value={seg} onChange={setSeg} />
          <SentenceInput label={k("screens.E1.b2.label")} value={text} onChange={setText} mono max={9} suggestions={[k("screens.E1.b2.sug.0")]} />
          <SentenceInput label={k("screens.E1.b2.label")} value="IRON-XXXX" onChange={noop} mono error={k("screens.M4.b0.sub")} />
        </Section>

        <Section title="RowList · Toggle · Breakdown">
          <RowList label={k("screens.D2.b6.label")} rows={[0, 1, 2, 3].map((i) => ({
            title: k(`screens.D2.b6.r${i}.t`), sub: k(`screens.D2.b6.r${i}.s`), value: k(`screens.D2.b6.r${i}.r`), valueSub: k(`screens.D2.b6.r${i}.rs`),
            leading: { kind: "initial" as const, initial: k(`screens.D2.b6.r${i}.t`).slice(0, 1), bg: Object.values(color.member)[i]! },
            ...(i === 2 ? { valueColor: color.red.base } : {}),
          }))} />
          <RowList rows={[
            { title: k("screens.I1.b5.r0.t"), sub: k("screens.I1.b5.r0.s"), leading: { kind: "icon", icon: "eye-outline" }, chevron: true, onPress: noop },
            { title: k("screens.I1.b4.r0.t"), sub: k("screens.I1.b4.r0.s"), leading: { kind: "mark" }, toggle: { on, onChange: setOn } },
            { title: k("screens.I1.b4.r1.t"), sub: k("screens.I1.b4.r1.s"), leading: { kind: "avatar", config: avatar }, value: k("screens.I1.b4.r1.r") },
          ]} />
          <Toggle on={!on} onChange={(v) => setOn(!v)} label={k("screens.I1.b4.r0.t")} />
          <Breakdown rows={[0, 1, 2, 3].map((i) => ({ label: k(`screens.L1.b3.row${i}.l`), value: k(`screens.L1.b3.row${i}.v`), total: i === 3, ...(i === 2 ? { color: color.lime.base } : {}) }))} />
        </Section>

        <Section title="SeatSlots · QRCard">
          <SeatSlots seats={[
            { kind: "member", name: k("screens.D2.b6.r0.t"), avatar: avatar, color: color.member.you, status: k("screens.D2.b6.r0.r") },
            { kind: "member", name: k("screens.D2.b6.r1.t"), initial: "R", color: color.member.riya },
            { kind: "member", name: k("screens.D2.b6.r2.t"), initial: "A", color: color.member.arjun, red: true, dim: true },
            { kind: "open" },
          ]} />
          <SeatSlots seats={[{ kind: "member", name: k("screens.D2.b6.r0.t"), initial: "Y", color: color.member.you }, { kind: "open" }, { kind: "open" }, { kind: "overflow", count: 37 }]} />
          <QRCard code={k("screens.E1.b2.sug.0")} link="kept://join/IRON-7K2Q" />
        </Section>

        <Section title="BountyCover · HScroller · SearchBar · UploadBox">
          <SearchBar placeholder={k("screens.H1.b1.placeholder")} filter onPress={noop} />
          <BountyCover brand={k("screens.H1.b3.brand")} logo="D" verified colors={[color.sky.base, color.violet.base]} icon="bottle-soda-outline" message={k("screens.H1.b3.msg")}
            tags={[{ text: k("screens.H1.b3.tag.0"), icon: "star" }, { text: k("screens.H1.b3.tag.1"), icon: "timer-sand" }]} onPress={noop} />
          <HScroller chips={[0, 1, 2, 3, 4, 5, 6].map((i) => k(`screens.H1.b2.i${i}.t`))} chipValue={seg} onChip={setSeg} />
          <HScroller label={k("screens.H1.b4.label")} onSeeAll={noop} cards={[0, 1, 2, 3].map((i) => ({
            title: k(`screens.H1.b4.i${i}.t`), value: k(`screens.H1.b4.i${i}.v`), sub: k(`screens.H1.b4.i${i}.s`), icon: "trophy-outline",
            palette: (["lime", "vio", "sky", "pink"] as const)[i]!, onPress: noop,
          }))} />
          <UploadBox title={k("screens.G1.b1.label")} sub={t("common.photoOf", { n: 1 })} onPress={noop} />
        </Section>

        <Section title="InboxList">
          <InboxList label={t("additions.a11y.inbox")} action={{ label: t("common.seeAll"), onPress: noop }} items={sampleData.inbox.slice(0, 5).map((n, i) => ({
            id: n.id, title: n.title, sub: n.body, time: n.time, unread: i < 2, needsAction: n.actions.length > 0, done: i === 4,
            lead: i === 1 ? { kind: "keeper" as const, mood: "stern" as const } : i === 2 ? { kind: "icon" as const, icon: "sack" as const, palette: "lime" as const } : { kind: "avatar" as const, config: String(31205140 + i * 1111) },
            ...(i === 0 ? { badge: { icon: "email-outline" as const, palette: "vio" as const } } : {}),
            actions: n.actions.map((label, j) => ({ label, kind: j === 0 ? ("p" as const) : ("s" as const), onPress: noop })),
          }))} />
        </Section>

        <Section title="ProfileCard · KeptRateRing · IdentityRow">
          <ProfileCard name={k("screens.I1.b1.name")} handle={k("screens.I1.b1.handle")} avatar={avatar} bio={k("screens.I1.b1.bio")} verified
            socials={[{ icon: "alpha-x", text: k("screens.I1.b1.social.0"), onPress: noop }]}
            actions={[{ label: k("screens.I1.b1.act.0"), icon: "pencil-outline", onPress: noop }, { label: k("screens.I1.b1.act.1"), icon: "share-variant-outline", onPress: noop }]} />
          <KeptRateRing percent={91} line={k("screens.I1.b2.line")} />
          <KeptRateRing percent={null} isNew line={t("common.keptRateNote")} />
          <IdentityRow initial="R" bg={color.member.riya} name={k("screens.D2.b6.r1.t")} handle={k("screens.I1.b1.handle")} chips={[{ text: k("screens.D2.b6.r1.s"), icon: "check-decagram" }]} />
        </Section>

        <Section title="Avatar · AvatarBuilder">
          <View style={{ flexDirection: "row", gap: space[8] }}>
            {["00000000", "12121212", "31205140", "76543210", "45012367"].map((c) => <Avatar key={c} config={c} size={56} />)}
          </View>
          <AvatarBuilder config={avatar} onChange={setAvatar} tab={avTab} onTab={setAvTab} onShuffle={() => setAvatar(String(Math.floor(Math.random() * 1e8)).padStart(8, "0"))} onBuild={noop} onUsePhoto={noop} />
          <AvatarBuilder config={avatar} onChange={setAvatar} variant="edit" />
        </Section>

        <Section title="DayStrip · BarChart">
          <DayStrip n={7} done={2} today={3} labels={["M", "T", "W", "T", "F", "S", "S"]} />
          <BarChart label={k("screens.I1.b4.r0.t")} bars={["M", "T", "W", "T", "F", "S", "S"].map((label, i) => ({ label, value: [3, 5, 2, 6, 4, 1, 5][i]! }))} />
        </Section>

        <Section title="SignStatus">
          {SIGN_STATES.map((s) => <SignStatus key={s} state={s} chip={k("screens.C7·ok.b1.chip")} />)}
        </Section>

        <Section title="Brand blocks">
          <BrandSplash />
          <BrandWord />
          <BrandStamp text={k("screens.F5.brand.stamp")} />
          <BrandLockup />
        </Section>

        <Section title="Skeleton">
          <Skeleton height={140} />
          <Skeleton height={60} radiusPx={metrics.row.radius} />
        </Section>

        <Section title="Overlays · FX">
          <Button kind="s" label={k("screens.+._name")} onPress={() => setSheet(true)} />
          <Button kind="s" label={t("toasts.0")} onPress={() => toast(t("toasts.0"))} />
          <ButtonRow>
            <Button kind="d" size="row" label="embers" onPress={() => setFx((f) => ({ kind: "embers", n: (f?.n ?? 0) + 1 }))} />
          </ButtonRow>
          <Button kind="t" label={k("screens.+.b3.btn.0")} onPress={() => setFx(null)} />
        </Section>
      </ScrollView>

      {fx ? <FxLayer key={fx.n} kind={fx.kind} /> : null}
      {note ? <KeeperNote mood={line.mood} line={line.line} onClose={() => setNote(false)} top={insets.top + metrics.keeperNote.topHeader - metrics.header.top} /> : null}
      <BottomSheet visible={sheet} onClose={() => setSheet(false)} bottomInset={insets.bottom}>
        <Title heading={k("screens.+.b0.title")} pt={space[4]} fs={26} />
        <RowList rows={[0, 1, 2].map((i) => ({
          title: k(`screens.+.b1.r${i}.t`), sub: k(`screens.+.b1.r${i}.s`), chevron: true, onPress: () => setSheet(false),
          leading: { kind: "icon" as const, icon: (["fire", "link-variant", "trophy-outline"] as const)[i]! },
        }))} />
        <Note text={k("screens.+.b2.text")} />
        <Button kind="t" label={k("screens.+.b3.btn.0")} onPress={() => setSheet(false)} />
      </BottomSheet>
    </View>
  );
}
