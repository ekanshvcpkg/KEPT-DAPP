// Plain-words lines for the transaction the wallet is about to sign (state/txExplain.ts), shown on the signing screen.
import type { DecodedInstruction } from "@kept/chain";
import { t } from "@/copy";
import { formatSol } from "@/lib/format";
import type { TxExplanation } from "@/state/txExplain";

export type ExplainRow = { title: string; sub?: string; warn?: boolean; value?: string };

const short = (a: string | null) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "—");
const dayLen = (s: number) => (s >= 86_400 ? t("additions.keeper.dayLen24h") : t("additions.keeper.dayLenMin", { n: Math.round(s / 60) }));

function line(d: DecodedInstruction): ExplainRow {
  if (!d.known) return { title: t("additions.keeper.explainUnknown"), sub: t("additions.keeper.explainUnknownSub", { program: short(d.program) }), warn: true };
  const oath = short(d.oath);
  switch (d.name) {
    case "create_oath_sol":
      return {
        title: t("additions.keeper.explainCreate", { amount: formatSol(BigInt(String(d.args.stake_amount))), kind: d.args.is_solo ? t("additions.keeper.kindSolo") : t("additions.keeper.kindGroup") }),
        sub: t("additions.keeper.explainCreateSub", { days: Number(d.args.num_days), len: dayLen(Number(d.args.day_seconds)), oath }),
      };
    case "join_oath_sol": case "join_oath": return { title: t("additions.keeper.explainJoin", { oath }) };
    case "start_oath": return { title: t("additions.keeper.explainStart", { oath }) };
    case "cancel_oath": return { title: t("additions.keeper.explainCancel", { oath }) };
    case "settle_oath_sol": case "settle_oath": return { title: t("additions.keeper.explainSettle", { oath }) };
    case "claim_sol": case "claim": return { title: t("additions.keeper.explainClaim", { oath }) };
    default: return { title: t("additions.keeper.explainOther", { name: d.name, oath }) };
  }
}

export function explainRows(e: TxExplanation): ExplainRow[] {
  const rows = e.instructions.map(line);
  if (e.walletChange !== null) rows.push({ title: t("additions.keeper.explainWallet"), sub: t("additions.keeper.explainWalletSub"), value: `${e.walletChange > 0n ? "+" : ""}${formatSol(e.walletChange)} SOL` });
  return rows;
}
