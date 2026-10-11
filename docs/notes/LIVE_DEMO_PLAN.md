# Live and Demo modes: audit and plan

Merge phase, app side only (2026-10-10). Goal: one release APK where the user picks **Live** (real wallet,
backend and chain, no mock data) or **Demo** (no wallet, no network, a curated sample account for judges) at
first launch.

Read with: docs/ARCHITECTURE.md §6 (API modes), docs/BACKEND_GAPS.md, docs/API.md.

---

## 1. Data audit: where every value comes from today

### 1.1 How a slice is picked today
- `config/env.ts › apiMode` (build-time `EXPO_PUBLIC_API_MODE`: `mock` | `hybrid` | `http`, default `hybrid`)
  → `state/dev.ts › defaultFlags()` → per-slice `http` | `mock`, overridable in the Dev menu (persisted in
  `kept.dev`, **in release builds too**: the store is not gated by `__DEV__`).
- `hybrid` uses http where `api/types.ts › BACKEND_HAS` is true: auth, oaths, proof, wallet, invites, notify.
  Everything else is mock.
- Wallet: `chain/index.ts › getWallet()` is MWA unless `useDev.mockWallet` (default on only in `mock` builds).
- TxService: `getTx(source)` per Oath: `chain` → program, `mock` → mock store.

### 1.2 Places where live and mock data are mixed (all must go in Live)
| # | Where | What leaks |
|---|---|---|
| X1 | `api/http/oaths.ts` imports `features/oaths/mockStore` | `list()` appends `mockOaths.list(wallet, { seeded: false })`; `get()` serves `mock-*` ids from the mock store. |
| X2 | `api/http/oaths.ts › httpProof` | Takes the mock ProofApi: mock Oaths go to the mock; **photo 1 always "passes" on the device** (`passPhoto1`), and its gesture comes from the mock challenge. |
| X3 | `api/http/oaths.ts › httpProof.submit` (photo 2) | Sends `POST /api/proof` with a **made-up detection** at 0.99 confidence (the old dev-force path, `LegacyProofResponse`). The current backend rejects it (it now needs a `verificationId` from `POST /proof/verify`), so live proof is broken today. |
| X4 | `api/http/oaths.ts` imports `../mock/clock` | The virtual clock (equals real time unless the Dev menu moved it). `features/time.ts`, `features/*/mockStore.ts` and `dev/*` use it too. |
| X5 | `features/oaths/hooks.ts` | `createSource()`: in hybrid a **solo Oath is created on the mock** (D-30); `oathActions.leave` only works on mock Oaths. |
| X6 | `features/queries.ts` (was `phase4.ts`) | `bountyActions.create` and `rematchActions.join` always call `getTx("mock")` (fund / rematch have no program support). |
| X7 | `chain/mock.ts` imports `api/mock/slices › MOCK_WALLET` and `features/oaths/mockStore` | Fine for Demo; must not be reachable from Live. |
| X8 | `api/types.ts` imports **types** from `features/bounties/mockStore` (`BountyFacts`) and `features/reviews/mockStore` (`ReviewFacts`) | The API contract lives in mock files. |
| X9 | Screens importing from mock stores | `Today.tsx` (`BountyFacts` type), `Bounties.tsx` (`CATEGORIES`, `BountyFacts`, `Category`), `CreateBounty.tsx` (`bountyFunding`, the fee maths), `Review.tsx` (`ReviewFacts` type), `features/queries.ts` (was `phase4.ts`) (`ReviewFacts`). |
| X10 | `screens/oaths/Oaths.tsx › D5` | History rows come straight from `copy.json › sampleData.history`, with a literal icon map by sample name (`"Hydra 14": "trophy-outline"`, …). **Shows sample history in every mode.** |
| X11 | `state/dev.ts › BACKEND_HAS` + `defaultFlags` | Decides http vs mock at build time; `hybrid` is the release default. |
| X12 | `api/http/slices.ts › httpWallet.swap/quote` | Throws "no backend route" (swap is a mock on Devnet, D-21); W3 only works on the mock. |
| X13 | Device-only facts on chain Oaths (`features/oaths/device.ts`) | Oath name (P1-7), review mode, invite code, photo 1 pass, photo 2 failures, last-seen HP. Not mock data, but not server truth either. |
| X14 | `session.avatar` / `useSettings` | Avatar, banner, socials, privacy and notification switches live on the device (no profile route, P1-9). |

### 1.3 Per screen
Legend: **H** http (backend or RPC), **M** mock slice, **D** device storage, **E** engine computed from H/M
facts, **C** copy.json / additions.json, **L** a literal in a screen or component.

| Screens | Values and their source today (hybrid build) |
|---|---|
| A0–A4 | Session **D**; sign-in **H** (`/api/auth/*`, `/api/me`) + MWA; Genesis result **H**; avatar **D**. Mock wallet in `mock` builds. |
| B1–B4, B5 (Today) | Oath list **H** (RPC member index + `/details` goal) **+ M** (X1) → views **E**; Bounty card **M**; streak / kept-rate chips **M** (`profile.stats`); "resets in" **E** on the virtual clock (X4); recap sheet **E**. |
| Tab header (all tabs) | Balance chip **H** (RPC balances); bell count **M** (inbox). |
| C1–C8, C7·* | Draft **D**; stake presets **C**/config; create **H** (program) for group, **M** for solo (X5); invite code **H**. |
| D0–D5, R·act | Oath list / one Oath **H+M** → HP, grid, costs, balances **E** (design rules, not the program's, D-14); names **D**; nudge **H**; leave **M** only; D5 history **L** from sampleData (X10). |
| E1–E3·* | Invite resolve **H**; join **H** (program); balances **H**. |
| F1–F5 | Challenge: photo 1 **M** gesture, photo 2 `dailyTarget` **L**-ish (X2); submit: photo 1 **D**, photo 2 **H** with a fake detection (X3, broken). |
| G1–G3·no | Group review **M** (`reviews` slice). |
| H1–H7, L5 | Bounties **M** (list, detail, mine, join); categories **L** (`CATEGORIES` in the mock store); eligibility **M** stats. |
| I1–I9 | Profile, stats, activity, creator pages **M**; settings **D**; following **D**. |
| J1–J1·f, L1–L4·b | One Oath **H/M** → payout **E** / on-chain payout **H** for J1 (D-14); claim **H** (program) or **M**; "seen once" **D**. |
| K1–K5·ok | Draft local state; funding fee maths from `features/bounties/mockStore › bountyFunding` (X9); fund **M** (X6); publish **M**. |
| M1–M4 | M1 inbox **M**; M2 offline from any failed call; M3/M4 from TxService classification. |
| N1 | Inbox **M**; avatars **M** (`profile.get`). |
| R1–R4·lost, L6 | Rematch offer / join **M** (X6); R·act is D2 on a mock Oath. |
| W1–W4 | Balances **H** (RPC); price **H**; activity **M**; faucet **H**; swap / quote **M** only (X12). |
| Sheets (+, D1·x, M3, M4) | No data beyond the above. |

### 1.4 Literals that look like data
- Copy strings shown untemplated that hold numbers: `toasts.17` / `toasts.21` "+5,000 test SKR" (the backend's
  faucet really sends 5,000: fine, but it should come from the faucet response), `common.version`
  "v0.9 · DEVNET · SEEKER" (should come from the app version and `env.cluster`). Everything else with data in
  it goes through `copy/templates.json` (D-17).
- D5 history icon map (X10). `screens/M2.tsx › STILL_OFFLINE = 18` is a timing constant, not data.

---

## 2. Backend audit (backend as of `b8711fa`)

**Two findings change the plan; see §4 Questions Q1 and Q2.**

1. **Proof moved to an on-device model.** `POST /proof/verify` registers a verdict the *app* computed
   (MediaPipe Gesture Recognizer + Gemma 4 E2B via LiteRT-LM, a ~2.59 GB download on first use). Every proof
   route (`/api/proof/start`, `/api/proof`, `/bounty/:id/*`) now requires a `verificationId` from it. The app
   has no on-device model. It cannot honestly produce a verdict, and I won't fabricate one.
2. **The program has new economics ("rules v2")**: an entry fee on top of the stake, one 50 % slash for any
   member who missed, a buyable freeze per member, settlement one day after the end, no HP. **Not active on
   Devnet yet**: the Config account is 139 bytes, with no economics region (read 2026-10-10), so new Oaths still
   settle under rules v1 (all-or-nothing, 10 % fee on missed stakes). Neither matches the design's HP / 1.5^k /
   daily distribution rules that `packages/engine` implements.

The app's IDL copy (`packages/chain/idl/kept_test.json`) lacks `configure_economics`, `buy_freeze`,
`use_freeze` and `sweep_carryover`, but the accounts of `create_oath` / `join_oath` / `claim` are unchanged,
so create, join, start, cancel and claim still work. The Oath account grew (terms appended after byte 316);
Anchor decoding ignores the extra bytes, and the app's `getProgramAccounts` has no size filter, so reads still work.

### Per KeptApi slice
| Slice | Routes that exist now | What they return | What the app expects | Mismatch / plan |
|---|---|---|---|---|
| **auth** | `POST /api/auth/nonce`, `POST /api/auth/verify`, `GET /api/me` | `{message}`, `{token, wallet}`, `{wallet, genesis, mocked, genesisMint}` (409 with the same shape + `error` if the Genesis token belongs to another wallet) | Same | None. Map the 409 to A3·no with a toast. |
| **oaths** | RPC (program accounts), `POST /api/oaths/details`, `GET /api/oaths/:oath/details`, `GET /api/oaths/:oath/invite`, `POST /api/oaths/watch`, `GET /api/economics` | `/details` (GET) now returns `{goalText, minMinutes, dayIndex, members[{wallet, …nudge target, identity, reputation}], economics{rulesVersion, stakeAmount, feeBps, feeAmount, totalDue, freezePrice, settleAt, settlement, members[{missedDays, frozenDays, onTrack, fullyKept, estimatedPayout, …}], viewer}}` | `GoalResponse {goalText}` only | The app reads only `goalText`. Live should also use `members[].reputation.keptRate` (member kept rates) and `economics` (chain-true payouts), which raises Q2. No "my Oaths" route: keep the RPC member index (P0-10). `minMinutes` is new: the wait between photo 1 and photo 2 (design has no wait; Q1). |
| **proof** | `POST /proof/verify`, `POST /api/proof/challenge`, `POST /api/proof/start`, `POST /api/proof` | challenge: `{phase: start|wait|end, photo, gesture: "Thumb_Up"|"Victory"|"Open_Palm", issuedAt, expiresAt}` or `{phase: "wait", waitSeconds, endAllowedAt}`; start → wait; proof → `{signature, proofHash, …}` / `202 PENDING_REVIEW` | Mock-shaped `Challenge {photo, gesture: thumbs_up|…}`, `ProofOutcome` | Gesture names map 1:1. **Blocked by Q1** (verdict). The new wait phase has no design screen. |
| **reviews** | `GET /api/oaths/:oath/reviews`, `POST /api/reviews/:id`; a review is created by `POST /api/proof {review:true, photo}` after 3 failed verifies of the end photo | `{reviews[{id:number, wallet, dayIndex, object, gesture, detected, approvals, rejections, reviewers, myVote, canReview, image (data URL)}]}`; vote → `{status}` | `ReviewFacts` (mock) | Shapes are mappable; **blocked by Q1** (needs failed verifies). Review ids are numbers. |
| **rematch** | none | — | offer / join | Hide the Rematch entry points in Live (P1-2). |
| **bounties** | `GET /bounty/current`, `POST /bounty/:id/join`, `GET /bounty/:id/recently-out`, `POST /bounty/:id/{challenge,start,proof}`, admin create | One bounty at a time: `{bounty{id:number, title, objectId, numDays, daySeconds, minMinutes, startTs, endTs, joinClosesAt, joinOpen, currentDay, status UPCOMING|ACTIVE|PAYING|PAID, poolAmount, entrants, stillIn, estimatedShare, …}, me{daysKept, out, outDay, payoutAmount, …}}` | A list with creators, categories, eligibility rules, user-created and funded Bounties | Live: the list is `[current]`, no creator page, no create / fund (hide K), no categories filter. Proof **blocked by Q1**. Pool split is equal among survivors: matches the design. |
| **inbox** | `GET /api/inbox`, `PUT /api/inbox/:id` | `{items[{id, type: string, actor, title, body, createdAt, needsAction, done, ref{oath?,code?,bounty?,review?}}], unread}` | Same, but `type` is a strict enum and `markDone(ids[])` | Parse unknown `type` by dropping the item; mark done one PUT per id. **Nothing in the backend writes inbox rows yet**, so Live shows N1's empty state. |
| **profile** | `GET /identity/:wallet`, `GET /reputation/:wallet` | identity `{verifiedSeeker, method, …}`; reputation `{kept, missed, oathsKept, oathsBroken, keptRate{percentage 0–100 \| null, keptDays, missedDays, sampleSize}, streak{current, best}, bounties{joined, completed, out}}` | `Profile` (name, avatar, banner, bio, socials), `MyStats`, activity, creator | Stats map from reputation (`keptRate = percentage/100`, `rateDays = sampleSize`). **Kept rate is a plain ratio**, the design's is recency-weighted with "New" under 10 days (rules.md §7): display-only, see Q4. No profile fields, activity or creator routes: name / avatar stay on the device; I5 activity and I3 show empty / unavailable. |
| **wallet** | `GET /api/price`, `POST /api/faucet`; balances from RPC | price `{usdPerSkr, skrForUsd10, devnet, label}`; faucet `{signature, amount:"5000", mint}` | Same | Swap / quote: no route (D-21). Hide W3 in Live. |
| **invites** | `POST /api/invites`, `GET /api/invites/:code`, `GET /api/oaths/:oath/invite` | as documented | Same | Use `/api/oaths/:oath/invite` to recover a lost code instead of the device copy. |
| **notify** | `POST /api/push-token`, `POST /api/nudges` | 204, `{ok:true}` | Same | None. The app never registers a push token (no expo-notifications yet). |

Also new and unused: `GET /api/economics`, `GET /bounty/:id/recently-out` (H6 "recently out"),
`/admin/*`.

---

## 3. Bloat audit (frontend, packages/*)

Tool: `knip@5` per workspace, plus reference greps. Sizes from the release mock APK at `8ca2b28`:
**APK 131.2 MB, JS bundle 6.3 MB** (Hermes bytecode).

| Item | Size | Status | Action |
|---|---|---|---|
| Keeper PNG fallbacks (`assets/keeper`, 111 files) | 4.8 MB in the repo; bundled into the APK because `components/keeper/assets.ts` requires them statically. No screen passes `png`. | Used only behind the unused `png` prop | **Ask first** (Q5) |
| `assets/objects`, `assets/gestures`, `assets/money`, `assets/brand/kept-mark-dark*` | 0.6 MB, not bundled (never required) | Unreferenced; copied from design by `scripts/sync-assets.mjs` | **Ask first** (Q5): the sync script would bring them back |
| `legacy/` | 1.3 MB, not built | Reference only (CLAUDE.md) | **Ask first** (Q5) |
| `dev/Gallery.tsx` (314 lines) + every component state it imports | in the release bundle: `RootNavigator` imports it statically, `__DEV__` only hides the route | Dev tool **not** excluded from release | Phase 6: lazy `require` behind `__DEV__` like `devLink` |
| `dev/DevMenu.tsx`, `state/dev.ts` overrides | in the release bundle | Dev tools | Phase 2 gates them to `__DEV__` |
| `screens/Placeholder.tsx` (47 lines) | — | Every design id is built; it's only a fallback in `RootNavigator` | Remove in Phase 6 (and make `BUILT` total) |
| Unused exports (knip) | small | `toFacts`, `WALLET_SCENARIOS`, `MOCK_SKR_PER_SOL`, `BACKEND_GESTURES/OBJECTS`, `noteOffline` (export only), `pinnedInset`, avatar `SKIN/OUTFIT/BACKGROUND/mix`, `RoundButton`, `Toast`, `Row`, `RadialGlow`, `keeperIsInline`, `trs`, `enterDelay`, `useCountUp`, `useCountUpText`, `openDevLink`, `seed`, `skr`, `useEligibility`, `resultScreen`, `failureOutcome`, `TAB_BAR_SPACE`, `EMPTY_DRAFT`, `FONT_MAP`, `size`, `tabular` (27) | Phase 6: remove the dead ones, un-export the ones used in their own file |
| Unused exported types (knip) | — | 29, mostly props types | Leave (harmless) unless the file is touched |
| Copy | — | `additions.avatarBuilder.options.*` (35) look unused but are read with a computed key; 15 templates (R4 rows, B2.b3.r1.s, C8.b1.link, F4.b0.label, L2.b2.caption, H3.b3.r1.r) need a per-key check | Phase 6, per key |
| Dependencies | — | knip flags `buffer` and `expo-constants`: both used (polyfill, Expo peer). `expo-updates` / `expo-system-ui` named in app.json but not installed (config only) | None |
| Stale docs | — | `docs/notes/SESSION_HANDOFF.md` (superseded by FIDELITY_AUDIT); ARCHITECTURE §6 and the BUILD_PLAN table describe `hybrid`; CLAUDE.md says proof photos are "checked by AI on the server" (now on the device); BACKEND_GAPS P0-1 / P0-2 / P0-3 / P1-1 / P1-11 predate the new routes | Update in Phase 5; ask before deleting SESSION_HANDOFF |
| Native size | ~98 MB of the APK | 4 ABIs, R8 off (see the size note from the previous session) | Not in scope unless you want it (Q7) |

---

## 4. Questions for you

**Q1 (resolved 2026-10-11).** The actual mobile app now includes the Android MediaPipe + LiteRT-LM module from
the example app, asks before its one-time model download, and blocks Live wallet entry until the models are
installed. Captured Live photos are analyzed locally, then their verdict and hash go to the existing
verification routes; the image is not uploaded for AI analysis. Photo 2 remains disabled until the backend's
`endAllowedAt`. Demo remains independent. Physical Seeker validation is still required; Android emulators are
unsupported by this model runtime.

**Q2 (stop: money and HP in Live).** On chain, Oaths settle under rules v1 (all-or-nothing, 10 % of missed
stakes), and rules v2 (fee on top, 50 % slash, freezes) is coded but not active. The design's HP,
cost-per-miss and daily distribution are not what the program pays. In Live, should Oath screens:
- (a) keep the design numbers from the engine, labelled as estimates (today's D-14 rule), with J1 showing the
  on-chain payout; or
- (b) show the chain's numbers from `GET /api/oaths/:oath/details › economics` (estimated payout, missed days,
  on track), and hide HP and cost-per-miss; or
- (c) something else?

  And when rules v2 is switched on: create and join will take stake + fee. C5 / E2 would have to show the
  fee and check the balance for it. Do you want that now?

**Q3 (Bounties in Live).** The backend runs one admin-created Bounty at a time. Proposal: H1 lists only
that one, no creator page (I3 unavailable), K (create / fund) hidden in Live. Its proof is blocked by Q1. OK?
**Answered 2026-10-10: yes.** Done (`api/http/bounties.ts`): list, detail, join and my entry from `/bounty/current`; its proof ends on F2b until Q1.

**Q4 (kept rate).** The backend's kept rate is plain kept / (kept + missed) over all days. The design's is
recency-weighted and shows "New" under 10 days. In Live, show the backend's number as is (and "New" under
10 days), or hide it until the backend matches?
**Answered 2026-10-10: show the backend's number, "New" under 10 days.** Done (`liveKeptRate` in `api/http/slices.ts`): my stats and profiles. Other members' rates on Oath screens still show "New" in Live: the Oath route doesn't carry them and fetching each member's reputation is not built.

**Q5 (deletions).** Delete (a) the Keeper PNG fallbacks (~4.8 MB repo, also shrinks the APK), (b) the
unused object, gesture, coin and mark PNGs plus their lines in `sync-assets.mjs`, (c) `legacy/`,
(d) `docs/notes/SESSION_HANDOFF.md`?
**Answered 2026-10-10: yes.** All four done; from `legacy/` only the old app code went (`harness-app/`, `v3/app/`), the backend reference stays.

**Q6 (demo fast-forward).** Cheap: the mock already has a virtual clock with "end the day", and it settles
with `packages/engine`. Proposal: in Demo, Profile › Settings gets one row, "Skip to tomorrow". It ends the
day, the mock settles (HP drops or heals, a miss is redistributed), and Today shows the result. The copy goes
in additions.json. About 1 hour of work. **Not built without your OK.**
**Answered 2026-10-10: yes.** Built (D-88): the clock moves 24 h, not to midnight, because the demo's days end at seeded times.

**Q7 (APK size).** Out of this task's scope: an arm64-only release and R8 shrinking would bring the APK from
131 MB to about 40 MB. Want it as a follow-up?
**Done 2026-10-10:** arm64-v8a only, R8 code and resource shrinking, compressed native libraries (expo-build-properties), plus JS and asset cuts (one font file per weight, a 169-icon cut of MDI, qrcode instead of react-native-qrcode-svg, zod locales stubbed). **APK 131.2 MB → 22.5 MB; Hermes bundle 6.6 MB → 5.5 MB.** Release perf on the emulator against the pre-cleanup build (same emulator, same session): no measurable change (cold start 1.2–1.6 s for both; scroll jank about 11 % for both; tabs and push/back under 2.1 %). Expo tree shaking would cut another ~0.3 MB of JS but is still flagged unstable, so it's off.

---

## 5. Plan

Order: the Demo half doesn't depend on Q1–Q4, so Phases 2–4 go first. Phase 5 does everything that isn't
blocked, then stops for Q1–Q3. Phase 6 does the removals that need no approval.

### Phase 2: app mode
1. `state/mode.ts`: persisted `kept.mode` = `"demo" | "live" | null`. It replaces `env.apiMode` as the
   release switch. `env.apiMode` remains only as the default for development builds' Dev menu.
2. Mode-scoped storage: `state/storage.ts` prefixes every persisted key with the mode
   (`kept.demo.session`, `kept.live.session`, …): session, settings, drafts, device Oath facts (names, codes,
   last-seen HP, photo state). `setMode()` rehydrates every store under the new prefix and clears the query
   cache. `exitDemo()` removes every `kept.demo.*` key, resets the mock backend (new `createMockApi`, mock
   stores reseeded) and the virtual clock.
3. `api/index.ts`: Demo → the mock KeptApi; Live → `createLiveApi()` (http for every slice, slices without a
   backend return a typed `UNAVAILABLE` error). Dev-menu slice overrides and scenarios apply only when
   `__DEV__`. Wallet: Demo → mock wallet; Live → MWA. TxService: Demo → mock; Live → program.
4. `DemoBadge` next to `DevnetBadge` on every screen. Signing screens (A2·s is skipped in Demo; C7, D1·go,
   D1·xs, E2·s, J1·p, K5·p, R2, W3·s) show a note: "Demo: the approval is simulated." (additions.json).

### Phase 3: onboarding
1. New sheet route `A1·m` (mode picker) using `BottomSheet` + `RowList` rows: "Try the demo" / "Use my
   wallet", one line each (additions.json). DECISIONS entry. `routes.test.ts` and the flows table get the new edges.
2. Demo: A1 → A1·m → A4 → Tabs (no A2, A2·s, A3); the mock session is created on pick.
   Live: A1 → A1·m → A2 → … as today.
3. "I have an invite" and `kept://join/<code>` set Live and skip the sheet.
4. Profile › Settings: Demo shows "Exit demo" (wipe, back to A1) and "Restart demo" (reseed); Live sign-out
   returns to A1 where the mode is picked again.

### Phase 4: demo content
1. A `judges` scenario (the Demo default), seeded so that from Today within two minutes:
   - Iron Week: group, Day 3/7, HP 90, photo 1 done, photo 2 due now, Arjun's miss on day 2 redistributed
     (D2's day note);
   - a finished Oath with a payout to claim (J1);
   - a broken Oath with a Rematch offer (D3 → R1);
   - a joined Bounty plus the Bounties list;
   - unread inbox items, a funded wallet, a profile with a kept rate and streak.
2. The demo clock: on seeding, the virtual clock is set so it is 15:00 local "today". The proof window stays
   open for 9 h of real use whatever the real time is.
3. Proof uses the real camera; the mock never reads the image; nothing is uploaded.
4. A test that runs the Demo flows with `global.fetch` and `WebSocket` replaced by spies that fail the test,
   and asserts no `Connection` is created.

### Phase 5: live mode (the parts Q1–Q3 don't block)
1. Move contract types and constants out of mock files: `BountyFacts`, `Category`, `CATEGORIES`,
   `bountyFunding` → `features/bounties/model.ts`; `ReviewFacts` → `features/reviews/model.ts`; the clock →
   `lib/clock.ts` (Live: real time, Demo: virtual).
2. `api/http/*` imports nothing from mock: X1–X5 removed; proof gets its own http implementation (Q1).
3. Live slices: auth, oaths (RPC + `/details` goal + member reputation), invites (+ `/oaths/:oath/invite`),
   notify, wallet (price, faucet, RPC balances), inbox (GET/PUT), profile stats (reputation). Every response
   parsed with zod schemas in `packages/shared` (new: `OathDetailsResponse`, `ReputationResponse`,
   `InboxResponseLive`, `BountyCurrentResponse`, `ReviewsResponse`, `ChallengeResponseLive`).
4. Live without a backend: hide Rematch (D3 / L3 / N1 actions), K (create Bounty), W3 (swap), I3, "leave
   before Start"; lists show their empty states (I5 activity, D5 history). Each one recorded in
   BACKEND_GAPS with the shape the app coded against.
5. D5: history from finished Oaths (engine) in both modes; the sampleData read goes away.
6. Literals: `common.version` from the app version and cluster; faucet toast amount from the response.
7. Release guard: in a release build, Live with an API URL on localhost / 127.0.0.1 shows a blocking error on
   A1·m ("This build has no server address") instead of starting.
8. Tests: the Live API composes no mock slice (every slice is the http object; no import path from
   `api/http` reaches `api/mock` or `mockStore`), the localhost guard, each new zod schema against the
   backend's own fixtures.

**Stop here for Q1–Q3**, then: proof (Q1), Oath money views (Q2), Bounties (Q3), group review (after Q1).

### Phase 6: bloat
- Without asking: Placeholder, the dead exports above, Gallery and DevMenu out of the release bundle, unused
  templates / additions after a per-key check. Each verified by typecheck, tests and a release build.
- After your answer to Q5: the PNGs, legacy, SESSION_HANDOFF.
- Report APK and JS bundle size before / after.

### Done checks
typecheck, lint, tests; all 116 screens shoot (Demo); `perf.mts` on a release build; Demo in airplane mode
on a release build; Live sign-in against a local backend if one can be started (Postgres + `.env`); a list
of what was not verified end to end.

---

## Status at the end of this session (2026-10-10)

| Phase | Done | Not done / waiting |
|---|---|---|
| 1 Audit and plan | This file | — |
| 2 App mode | `state/mode.ts`, scoped storage (`kept.demo.*` / `kept.live.*`), API / wallet / TxService by mode, Dev menu dev-only, DEMO badge, "approval is simulated" on signing screens, tests (`mode.test.ts`) | — |
| 3 Onboarding | A1·m sheet (route amendment, D-80), Demo path A1 → A1·m → A4 → Tabs, invite links and "I have an invite" force Live, Restart / Exit demo, Live sign-out to A1, localhost guard, navigation tests | D-80 copy to confirm |
| 4 Demo content | `judges` scenario (default; the only one in release Demo), calm first Today, `demoOffline.test.tsx` (no fetch / XHR / WebSocket); Q6 "Skip to tomorrow" (D-88) | — |
| 5 Live mode | No mock in `api/http` (import-graph test) or the Live API (test); real challenge; inbox; reputation stats and kept rates; profiles from the device + reputation; Rematch / create Bounty / swap / creator pages hidden; empty Bounty list and reviews; D5 from real Oaths; literals (version, faucet toast, D0, M1, B3) from data | Blocked on Q1 (proof check), Q2 (money and HP numbers). Q3 (Bounties) and Q4 (kept rate) done 2026-10-10 |
| 6 Bloat | Placeholder gone (B2–B4 now open the Today tab), Dev menu and Gallery out of release bundles, dead exports, `proofTarget`, unused templates; Q5 deletions and Q7 APK size (done) | — |

**Sizes** (release, Demo): APK 131,163,530 → 131,160,260 bytes; JS bundle 6,612,168 → 6,608,976 bytes (at `8ca2b28` vs `ced5a41`, with all the new mode code in). The APK is 98 MB native libraries for four ABIs; see Q7.

**Verified**
- typecheck, lint, 234 tests; all 117 ids (116 + A1·m) shoot with 0 errors at 1080×2400 and at 360×720 dp.
- Demo on a release build with airplane mode on (emulator): A1 → A1·m → A4 → Today (judges account, DEMO badge), Oaths tab.
- Live sign-in against a locally running backend (Postgres in Docker, `backend` started unchanged): the app's own `signIn` and Live slices, with a test keypair signing like a wallet: nonce → verify → `/api/me`, reputation stats, profile, Bounty list. That run found that a non-Seeker gets 403 on `/api/inbox` (now an empty inbox).

**Perf** (release, emulator only, `perf.mts` now onboards through Demo): 0 sync-props failures, 0 ANRs. Jank was much higher than last session (tab switches 7.3 %, push/back 20.7 %, scroll 0.8 %), but last session's own APK and script, run on the same emulator right after, gave 16.8 % / 22.6 % / 0.4 %: the emulator (up 17 h, Docker had been running) is slower today, not the app. Re-measure on a fresh emulator or a phone.

**Not verified end to end**
- Live with a real wallet (MWA) on a phone: the emulator has no wallet app.
- Live create / join / start / claim on Devnet after this session's changes (the chain code didn't change).
- Live proof: by design it ends on F2b until Q1.
- Any number on a physical phone (perf, small screens): emulator only.
