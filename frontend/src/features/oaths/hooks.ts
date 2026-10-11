// Oath queries and actions for screens. Lists and single Oaths come from the `oaths` API slice and are
// turned into views with the engine; actions run the TxService for the Oath's source and then the
// backend follow-ups, then refresh the queries.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getApi, useApi } from "@/api";
import { queryClient } from "@/api/queries";
import { getTx } from "@/chain";
import { SKR_UNIT } from "@kept/config";
import { flags, useDev } from "@/state/dev";
import { useSession } from "@/state/session";
import type { OathDraft } from "@/state/drafts";
import { useNow } from "../time";
import { useDeviceOaths } from "./device";
import { oathView } from "./model";
import type { OathFacts, OathSource } from "./model";
import { oathName } from "./names";
import { mockOaths } from "./mockStore";

const oathKeys = {
  all: ["oaths"] as const,
  list: (wallet: string | null) => ["oaths", "list", wallet] as const,
  one: (id: string) => ["oaths", "one", id] as const,
};

/** Refresh while a day is running so others' proofs and the day roll-over show up. */
const REFRESH_MS = 30_000;

export function useOathList() {
  const api = useApi();
  const wallet = useSession((s) => s.wallet);
  const scenario = useDev((s) => s.scenario);
  const q = useQuery({ queryKey: [...oathKeys.list(wallet), scenario], queryFn: () => api.oaths.list(wallet!), enabled: !!wallet, refetchInterval: REFRESH_MS });
  const now = useNow(1000);
  const names = useDeviceOaths((s) => s.names);
  const avatar = useSession((s) => s.avatar);
  const views = useMemo(() => (q.data ?? []).map((f) => oathView(withName(f, names, { wallet, avatar }), now, wallet)), [q.data, now, wallet, names, avatar]);
  return { ...q, views };
}

export function useOath(id: string | undefined) {
  const api = useApi();
  const wallet = useSession((s) => s.wallet);
  const scenario = useDev((s) => s.scenario);
  const q = useQuery({ queryKey: [...oathKeys.one(id ?? ""), scenario], queryFn: () => api.oaths.get(id!), enabled: !!id, refetchInterval: REFRESH_MS });
  const now = useNow(1000);
  const names = useDeviceOaths((s) => s.names);
  const avatar = useSession((s) => s.avatar);
  const view = useMemo(() => (q.data ? oathView(withName(q.data, names, { wallet, avatar }), now, wallet) : null), [q.data, now, wallet, names, avatar]);
  return { ...q, view };
}

/** Device-side facts: a local name (P1-7), and my avatar from this device (D-40) when the data has none. */
function withName(f: OathFacts, names: Record<string, string>, me?: { wallet: string | null; avatar: string | null }): OathFacts {
  const named = names[f.id] ? { ...f, name: names[f.id]! } : f;
  if (!me?.wallet || !me.avatar || !named.members.some((m) => m.wallet === me.wallet && !m.avatar)) return named;
  return { ...named, members: named.members.map((m) => (m.wallet === me.wallet && !m.avatar ? { ...m, avatar: me.avatar } : m)) };
}

export const refreshOaths = () => queryClient.invalidateQueries({ queryKey: oathKeys.all });

/**
 * Where a new Oath is created: the mock in Demo, the program in Live (a development build's Dev menu can
 * point the oaths slice at either). On chain a solo Oath has no stake (D-30, BACKEND_GAPS P0-7).
 */
function createSource(): OathSource {
  return flags().oaths === "mock" ? "mock" : "chain";
}

const tzOffset = () => -new Date().getTimezoneOffset();

export const oathActions = {
  async create(d: OathDraft): Promise<{ id: string; code: string | null }> {
    const source = createSource();
    const goal = d.goal.trim();
    const { oath, started } = await getTx(source).createOath({
      objectId: d.objectId, numDays: d.numDays, stake: BigInt(d.stakeSkr) * SKR_UNIT, goalText: goal, tzOffsetMinutes: tzOffset(), isSolo: d.isSolo, reviewMode: d.reviewMode,
    });
    // flows.md: a solo Oath goes C7·ok → D2, with no Start step. On chain it already started in the create
    // transaction; the mock starts it here.
    if (d.isSolo && !started) await getTx(source).startOath(oath);
    useDeviceOaths.getState().remember(oath, { name: oathName(d.objectId, d.numDays), reviewMode: d.reviewMode, goal });
    const api = getApi();
    const facts = await api.oaths.get(oath);
    const code = await api.oaths.register(facts, goal).catch(() => facts.inviteCode);
    await refreshOaths();
    return { id: oath, code };
  },
  async join(o: OathFacts) {
    await getTx(o.source).joinOath(o.id);
    await getApi().oaths.watch(o).catch(() => undefined);
    await refreshOaths();
  },
  /** Leaving before Start has no program instruction (BACKEND_GAPS P1-3); mock Oaths only. */
  async leave(o: OathFacts) {
    if (o.source !== "mock") throw new Error("Leaving needs program support (BACKEND_GAPS P1-3)");
    mockOaths.leave(o.id, useSession.getState().wallet ?? "");
    await refreshOaths();
  },
  async nudge(o: OathFacts, recipients: string[], dayIndex: number) {
    const api = getApi();
    if (o.source === "chain") await Promise.all(recipients.map((recipient) => api.notify.nudge({ oath: o.id, recipient, dayIndex })));
  },
  async start(o: OathFacts) { await getTx(o.source).startOath(o.id); await refreshOaths(); },
  async cancel(o: OathFacts) { await getTx(o.source).cancelOath(o.id); await refreshOaths(); },
  async settle(o: OathFacts) { await getTx(o.source).settle(o.id); await refreshOaths(); },
  async claim(o: OathFacts): Promise<bigint> {
    const { amount } = await getTx(o.source).claim(o.id);
    await refreshOaths();
    await queryClient.invalidateQueries({ queryKey: ["wallet"] });
    return amount;
  },
};

