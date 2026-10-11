// Mock Oaths and proof, on the mock store (features/oaths/mockStore.ts).
import { mockOaths } from "@/features/oaths/mockStore";
import { useDeviceOaths } from "@/features/oaths/device";
import { habitsOf } from "@/features/oaths/model";
import { devWait } from "@/state/dev";
import { ApiError } from "../errors";
import type { GestureLabel, OathsApi, ProofApi } from "../types";
import { clock } from "@/lib/clock";
import type { MockContext } from "./slices";
import { MOCK_WALLET } from "./slices";

const CHALLENGE_SECONDS = 300;
/** The design's three gestures (rules.md §5). */
const DESIGN_GESTURES: GestureLabel[] = ["thumbs_up", "victory", "open_palm"];

async function delay(ctx: MockContext) {
  if (ctx.latencyMs) await new Promise((r) => setTimeout(r, ctx.latencyMs));
  if (ctx.scenario() === "offline") throw new ApiError("OFFLINE", "mock: offline scenario", 0, true);
}

export function mockOathsApi(ctx: MockContext): OathsApi {
  const wallet = () => ctx.wallet() ?? MOCK_WALLET;
  const seeded = () => mockOaths.ensureSeeded(ctx.scenario(), wallet());
  return {
    list: async (w) => { await delay(ctx); seeded(); return mockOaths.list(w); },
    get: async (id) => {
      await delay(ctx); seeded();
      const o = mockOaths.get(id);
      if (!o) throw new ApiError("NOT_FOUND", `mock: no Oath ${id}`, 404);
      return o;
    },
    byInvite: async (code) => {
      await delay(ctx); seeded();
      if (!/^[A-Z]+-[A-Z0-9]{4}$/i.test(code.trim())) throw new ApiError("INVITE_NOT_FOUND", "mock: unknown code", 404);
      const oath = mockOaths.inviteFor(code.trim(), wallet());
      return { oath, alreadyStarted: oath.status !== "open" };
    },
    register: async (oath) => { await delay(ctx); return oath.inviteCode; },
    watch: async () => { await delay(ctx); },
  };
}

export function mockProofApi(ctx: MockContext): ProofApi {
  const wallet = () => ctx.wallet() ?? MOCK_WALLET;
  return {
    challenge: async (oath, habit, dayIndex, avoid) => {
      await delay(ctx);
      const options = DESIGN_GESTURES.filter((g) => g !== avoid);
      const gesture = options[Math.floor(Math.random() * options.length)]!;
      const h = habitsOf(oath)[habit];
      if (!h) throw new ApiError("NOT_FOUND", `mock: no habit ${habit}`, 404);
      return { habit, dayIndex, object: h.object, gesture, expiresAt: Math.floor(clock.now() / 1000) + CHALLENGE_SECONDS };
    },
    submit: async (oath, ch) => {
      await delay(ctx);
      await devWait(0); // F2 / F4·chk held open by the dev deep link
      await new Promise((r) => setTimeout(r, ctx.latencyMs * 2)); // the checker takes a moment (F2 / F4·chk)
      if (Math.floor(clock.now() / 1000) > ch.expiresAt) return { status: "expired" };
      const s = ctx.scenario();
      if (s === "proofUnavailable") return { status: "unavailable" };
      if (s === "proofFail") {
        return { status: "fail", attempts: useDeviceOaths.getState().failHabit(oath.id, ch.habit, ch.dayIndex) };
      }
      return { status: "pass", dayKept: oath.source === "mock" ? mockOaths.proveHabit(oath.id, wallet(), ch.habit) : true };
    },
  };
}
