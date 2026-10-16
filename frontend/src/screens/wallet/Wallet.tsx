// W · Wallet (screens.md W1–W4). Balances and the faucet are real in Live; the swap and its quote are
// Demo only (hidden in Live, DECISIONS D-21, BACKEND_GAPS P1-17).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Share, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SKR_UNIT } from "@kept/config";
import { keeperLines, t } from "@/copy";
import type { CopyKey } from "@/copy";
import { Button, ButtonRow } from "@/components/actions";
import { BottomSheet, NavBar, useToast } from "@/components/chrome";
import { Breakdown, Note, Skeleton, Title } from "@/components/content/Basics";
import { MoneyMoment, OptionGrid, QRCard } from "@/components/content/Inputs";
import { OathCard } from "@/components/content/Oath";
import { RowList } from "@/components/content/Rows";
import { SignStatus } from "@/components/content/Status";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen } from "@/components/layout/Screen";
import { color, metrics } from "@/theme";
import { isApiError, useApi } from "@/api";
import { qk, useBalances } from "@/api/queries";
import { env } from "@/config/env";
import { formatSol, formatUsd } from "@/lib/format";
import { useGo, useParams, useSheetRoute } from "@/app/nav";
import { useOathList } from "@/features/oaths/hooks";
import type { OathView } from "@/features/oaths/model";
import { shortWallet } from "@/features/oaths/names";
import { oathIcon, skrWhole, weekday } from "@/features/oaths/present";
import { useActivity, walletActions } from "@/features/queries";
import { useSession } from "@/state/session";
import { useUi } from "@/state/ui";
import { SigningScreen } from "../shared/Signing";
import { useFeature } from "@/features/availability";

const pinned = (n: number) => metrics.button.height * n + metrics.pinned.gap * (n - 1) + metrics.pinned.bottom;
const LAMPORTS = 1_000_000_000n;
/** W3's amounts, in lamports (0.1, 0.25, 0.5, 1 SOL). */
const SWAP_AMOUNTS = [LAMPORTS / 10n, LAMPORTS / 4n, LAMPORTS / 2n, LAMPORTS] as const;
const endOf = (v: OathView) => (v.facts.day1StartsAt ?? v.facts.createdAt) + v.facts.numDays * v.facts.daySeconds;
const LOCKED: OathView["life"][] = ["open", "waiting", "active", "over"];

function usePrice() {
  const api = useApi();
  return useQuery({ queryKey: qk.price, queryFn: () => api.wallet.price(), retry: false });
}

// ── W1 Wallet ──
export function W1() {
  const { back, go } = useGo();
  const balances = useBalances();
  const price = usePrice();
  const { views } = useOathList();
  const activity = useActivity();
  const claim = views.find((v) => v.claimable > 0n);
  const mineIn = (v: OathView) => (v.me >= 0 ? v.members[v.me]!.inPlay : 0n);
  const sum = (vs: OathView[]) => vs.reduce((a, v) => a + mineIn(v), 0n);
  const locked = views.filter((v) => LOCKED.includes(v.life) && !v.facts.rematchOf && v.facts.stake > 0n);
  const rematch = views.filter((v) => LOCKED.includes(v.life) && v.facts.rematchOf);
  const recent = (activity.data ?? []).filter((a) => a.kind === "money").slice(0, 2);
  const k = claim ? keeperLines("W1")[0] : undefined;
  const b = balances.data;
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.W1.nav.title")} />}>
      {k ? <ScreenKeeper id="W1" lines={[k]} /> : null}
      {b ? (
        <MoneyMoment value={skrWhole(b.skr)} caption={price.data ? t("screens.W1.b1.caption", { usd: formatUsd(b.skr, price.data.usdPerSkr) }) : t("additions.wallet.available")} />
      ) : <Skeleton height={120} />}
      <ButtonRow>
        <Button kind="l" size="row" icon="plus" label={t("screens.W1.b2.btn.0")} onPress={() => go("W2")} />
        <Button kind="s" size="row" icon="qrcode" label={t("screens.W1.b2.btn.1")} onPress={() => go("W4")} />
      </ButtonRow>
      {claim ? (
        <OathCard variant="lime" icon={oathIcon(claim.facts)} name={t("screens.W1.b3.name", { amount: skrWhole(claim.claimable) })}
          meta={t("screens.W1.b3.meta", { name: claim.facts.name, when: weekday(endOf(claim)) })} onPress={() => go("J1", { id: claim.facts.id })}
          button={{ kind: "l", label: t("screens.W1.b3.btn"), onPress: () => go("J1", { id: claim.facts.id }) }} />
      ) : null}
      {b ? (
        <View>
          <Breakdown label={t("screens.W1.b4.label")} rows={[
            { label: t("screens.W1.b4.row0.l"), value: t("screens.W1.b4.row0.v", { amount: skrWhole(b.skr) }) },
            { label: t("screens.W1.b4.row1.l"), value: locked.length === 1 ? t("additions.wallet.lockedOne", { amount: skrWhole(sum(locked)) }) : t("screens.W1.b4.row1.v", { amount: skrWhole(sum(locked)), n: locked.length }) },
            ...(rematch.length ? [{ label: t("screens.W1.b4.row2.l"), value: t("screens.W1.b4.row2.v", { amount: skrWhole(sum(rematch)) }) }] : []),
            { label: t("screens.W1.b4.row3.l"), value: t("screens.W1.b4.row3.v", { sol: formatSol(b.sol) }) },
          ]} />
        </View>
      ) : null}
      <RowList label={t("screens.W1.b5.label")} rows={[
        ...recent.map((a) => ({
          title: a.title, sub: a.sub, ...(a.amount ? { value: a.amount, valueColor: a.amount.startsWith("−") ? color.red.base : color.lime.base } : {}),
          leading: { kind: "icon" as const, icon: "sack" as const },
        })),
        { title: t("screens.W1.b5.r2.t"), leading: { kind: "icon", icon: "history" }, chevron: true, onPress: () => go("I5") },
      ]} />
    </Screen>
  );
}

// ── W2 Add SKR (sheet over W1) ──
export function W2() {
  const { back, replace } = useGo();
  const swap = useFeature("swap");
  const toast = useToast();
  const genesis = useSession((s) => s.genesis);
  const insets = useSafeAreaInsets();
  const sheet = useSheetRoute();
  const faucet = async () => {
    try { const amount = await walletActions.faucet(); toast(t("toasts.21", { amount: skrWhole(amount) })); back(); }
    catch (e) {
      toast(isApiError(e) && e.code === "FAUCET_USED" ? t("additions.wallet.faucetUsed")
        : isApiError(e) && e.code === "NOT_ELIGIBLE" ? t("additions.wallet.faucetGenesisRequired")
          : t("screens.C7·fail.b2.title"));
    }
  };
  return (
    <View style={{ flex: 1 }}>
      <BottomSheet {...sheet} bottomInset={insets.bottom}>
        <Title heading={t("screens.W2.b0.title")} sub={t("screens.W2.b0.sub")} pt={0} fs={26} />
        <RowList rows={[
          // Swap is a Devnet mock (D-21): Live leaves it out.
          ...(swap ? [{ title: t("screens.W2.b1.r0.t"), sub: t("screens.W2.b1.r0.s"), leading: { kind: "icon" as const, icon: "swap-horizontal" as const, bg: color.lime.base, fg: color.text.onLime }, chevron: true, onPress: () => replace("W3") }] : []),
          { title: t("screens.W2.b1.r1.t"), sub: t("screens.W2.b1.r1.s"), leading: { kind: "icon", icon: "qrcode" }, chevron: true, onPress: () => replace("W4") },
          ...(env.cluster === "devnet" ? [{
            title: t("screens.W2.b1.r2.t"), sub: genesis ? t("screens.W2.b1.r2.s") : t("additions.wallet.faucetGenesisRequired"),
            ...(genesis ? { value: t("screens.W2.b1.r2.r"), valueColor: color.lime.base, onPress: () => { void faucet(); } } : { disabled: true }),
            leading: { kind: "icon" as const, icon: "water-outline" as const },
          }] : []),
        ]} />
        <Note text={t("screens.W2.b2.text")} icon="flask-outline" />
        <ButtonRow><Button kind="s" label={t("screens.W2.b3.btn.0")} onPress={back} /></ButtonRow>
      </BottomSheet>
    </View>
  );
}

// ── W3 Swap SOL → SKR ──
export function W3() {
  const { back, go } = useGo();
  const api = useApi();
  const balances = useBalances();
  const [i, setI] = useState(2);
  const lamports = SWAP_AMOUNTS[i]!;
  const quote = useQuery({ queryKey: ["wallet", "quote", lamports.toString()], queryFn: () => api.wallet.quote(lamports), retry: false });
  const q = quote.data;
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.W3.nav.title")} />} bottomInset={pinned(1)}
      pinned={<Button kind="l" icon="swap-horizontal" label={t("screens.W3.pin.0")} disabled={!q} onPress={() => go("W3·s", { lamports: lamports.toString() })} />}>
      <Title heading={t("screens.W3.b0.title")} sub={t("screens.W3.b0.sub")} />
      <OptionGrid mode="tile" cols={4} small value={i} onChange={setI} items={[0, 1, 2, 3].map((n) => ({ title: t(`screens.W3.b1.o${n}.t` as CopyKey), sub: t(`screens.W3.b1.o${n}.s` as CopyKey) }))} />
      {q ? <MoneyMoment value={t("screens.W3.b2.value", { amount: skrWhole(q.skr) })} caption={t("screens.W3.b2.caption")} tone="lime" /> : <Skeleton height={120} />}
      <Breakdown rows={[
        { label: t("screens.W3.b3.row0.l"), value: t("screens.W3.b3.row0.v", { sol: formatSol(lamports) }) },
        ...(q ? [
          { label: t("screens.W3.b3.row1.l"), value: t("screens.W3.b3.row1.v", { rate: skrWhole(BigInt(q.skrPerSol) * SKR_UNIT) }) },
          { label: t("screens.W3.b3.row2.l"), value: t("screens.W3.b3.row2.v", { sol: formatSol(q.feeLamports) }) },
        ] : []),
        ...(balances.data ? [{ label: t("screens.W3.b3.row3.l"), value: t("screens.W3.b3.row3.v", { sol: formatSol(balances.data.sol) }) }] : []),
      ]} />
      <Note text={t("screens.W3.b4.text")} />
    </Screen>
  );
}

// ── W3·s Swap · signing ──
export function W3s() {
  const { lamports = "0" } = useParams<{ lamports: string }>();
  const task = useCallback(() => walletActions.swap(BigInt(lamports)), [lamports]);
  const onDone = useCallback(() => ({ to: "W3·ok" as const }), []);
  const fail = useMemo(() => ({ retry: "W3·s" as const, edit: "W3" as const, params: { lamports } }), [lamports]);
  return <SigningScreen title={t("screens.W3·s.b2.title")} sub={t("screens.W3·s.b2.sub")} task={task} onDone={onDone} fail={fail} />;
}

// ── W3·ok Swap done ──
export function W3ok() {
  const { replace } = useGo();
  const balances = useBalances();
  const playFx = useUi((s) => s.playFx);
  useEffect(() => { playFx(undefined, "payout"); }, [playFx]);
  return (
    <Screen bar={<NavBar onBack={() => replace("W1")} close />} bottomInset={pinned(2)} pinned={<>
      <Button kind="p" label={t("screens.W3·ok.pin.0")} onPress={() => replace("W1")} />
      <Button kind="t" label={t("screens.W3·ok.pin.1")} onPress={() => replace("C1")} />
    </>}>
      <SignStatus state="success" chip={t("screens.W3·ok.b1.chip")} />
      <Title heading={t("screens.W3·ok.b2.title")} sub={balances.data ? t("screens.W3·ok.b2.sub", { amount: skrWhole(balances.data.skr) }) : undefined} align="center" />
    </Screen>
  );
}

// ── W4 Receive ──
export function W4() {
  const { back } = useGo();
  const toast = useToast();
  const wallet = useSession((s) => s.wallet) ?? "";
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.W4.nav.title")} />}>
      <Title heading={t("screens.W4.b0.title")} sub={t("screens.W4.b0.sub")} />
      {wallet ? <QRCard code={shortWallet(wallet)} link={wallet} /> : <Skeleton height={160} />}
      <ButtonRow>
        <Button kind="p" size="row" icon="content-copy" label={t("screens.W4.b2.btn.0")} onPress={() => { void Clipboard.setStringAsync(wallet).then(() => toast(t("toasts.22"))); }} />
        <Button kind="s" size="row" icon="share-variant" label={t("screens.W4.b2.btn.1")} onPress={() => { void Share.share({ message: wallet }); }} />
      </ButtonRow>
      <Note text={t("screens.W4.b3.text")} icon="alert-outline" />
    </Screen>
  );
}
