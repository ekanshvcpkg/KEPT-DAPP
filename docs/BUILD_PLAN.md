# KEPT: Phased build plan

Each phase ends with: `pnpm typecheck && pnpm lint && pnpm test` green, exact steps to run it on your phone, a **real vs. mocked** table, and an updated `BACKEND_GAPS.md`. Screens are built in the order from CLAUDE.md and compared with `design/reference/` before moving on.

**Your machine (checked):** Node 26.7, pnpm 12.6, Java 17, Android SDK + `adb`, Docker. **Not installed:** Rust / Solana CLI / Anchor (DECISIONS D-24), Postgres (I'll use Docker), Maestro (needed in Phase 5).

**How the phone reaches the dev servers (all phases):** USB debugging on, then `adb reverse tcp:8082 tcp:8082` (mobile Metro; kept separate from the legacy app's 8081) and `adb reverse tcp:3000 tcp:3000` (API), so the app uses `http://localhost:3000` with no LAN setup.

---

## Phase 0: Commit, restructure, backend green
1. `git add` + **initial commit of the current state** (adds a root `.gitignore` first so `.DS_Store` stays out; I checked that there are no secrets in the tree).
2. Restructure with `git mv` per ARCHITECTURE §1; add the root `package.json`, `pnpm-workspace.yaml`, `.npmrc`. Second commit.
3. `backend`: pnpm install, `prisma generate`, `tsc` build, the existing 3 tests passing. Add `docker-compose.yml` (Postgres 16) for local dev and `docs/API.md` describing the **existing** routes. No behavior changes.
4. `onchain`: moved intact; tests run only if you approve the toolchain install (D-24).
5. `legacy/harness-app` is not built.

**Phone milestone:** none yet (no new app). You can still run the old harness from `legacy/harness-app` against `backend` to confirm the move didn't break the backend (I'll give the commands).
**Exit check:** `pnpm --filter @kept/api test` and `build` pass; `git log --follow` shows history on moved files.

## Phase 1: Packages, scaffold, theme, components, Gallery
**Status: done** (2026-10-09). Typecheck, lint and tests green for every package except `onchain`, whose tests need a built program (`pnpm program:build`, Rust/Solana/Anchor toolchain). The Android bundle builds (`expo export`). Not yet run on a physical device.

- `packages/config` (objects in on-chain order, gestures, stakes, lengths, `GOAL_MAX = 60`, fee bps, HP constants, tsconfig/eslint presets).
- `packages/engine`: `missCost`, `simulateOath(days pattern) → per-day ledger {hp, lost, fee, shares, burned, broken}`, `settlement`, `rematchRecovery`, `keptRate`, `odds`. **Worked-example test** (1,468.75 / 779.17 / 1,468.75 / 166.67, fee 116.67) plus edge cases (cap, solo, all-miss day, break day, 14 days) exported to `test-vectors/*.json`.
- `packages/shared` (zod schemas for every existing route + the proposed routes in BACKEND_GAPS (marked proposed), `ApiErrorCode` enum) and `packages/chain` (IDL from the harness JSON, PDAs, IDL-coder decoder tested against a fixture account, instruction builders).
- `frontend`: Expo SDK 57 dev build, `app.kept.mobile`, fonts, `theme:gen` from tokens.json, `t()` + templates with the exact-match test, ESLint rules banning raw colors/numbers/strings.
- **Every component in components.md** with tests, plus the dev-only **Gallery** showing every state (Keeper uses the PNG fallback, D-33).

**Phone milestone:** install the dev build; the app opens straight into the **Gallery**. Scroll every component and state on the device: buttons, OathCard, HPPanel at 100/40/20, DayMemberGrid 7 and 14 days, ProofCamera states, SignStatus, sheets, toasts, KeeperNote.

## Phase 2: Navigation shell, mock API, real sign-in
**Status: done** (2026-10-09). Typecheck, lint and tests green (mobile: 56 tests, including an onboarding run through the real navigator on mocks). Android bundle builds. Real sign-in is coded against the backend but not yet tried on a device with a wallet.

- React Navigation tree per flows.md: Tabs with the custom TabBar, PlusButton → `+` sheet, Bell → N1 stub, BalanceChip → W1 stub, KeeperMark → KeeperNote host, Toast/FX/Offline hosts, the `kept://join/<code>` deep link, `useSigningFlow` replace semantics. Every route ID registered (unbuilt screens render a labelled placeholder).
- `KeptApi` with `http` and `mock` slices, flags, Dev menu (long-press DEVNET), scenarios and the virtual clock.
- `TxService` interface with the mock implementation, and the real MWA session.
- **A0–A4 real:** MWA connect → `/api/auth/nonce` → sign → `/api/auth/verify` → `/api/me` (Genesis via your `SGT_MOCK_ALLOWLIST`) → A3 or A3·no → A4.

**Phone milestone:** cold start → Splash → Welcome → **connect your real wallet and sign in against the local API** → A3 (allowlisted) or A3·no (not) → tabs. Tap every tab, `+`, bell, balance chip and Keeper mark. Open `kept://join/abc123` from `adb shell am start -d` and land on E1. Switch scenarios in the Dev menu.

## Phase 3: Core loop (A, B, F, C, D, E, J, L)
**Status: done** (2026-10-09). Typecheck, lint and tests green (mobile: 70 tests, including end-to-end runs for onboarding, create, join, proof and results on the mock). Android bundle builds. The real-program path (create → join → start → proof → settle → claim on Devnet) is wired but hasn't been run on phones yet. R1 / G2 / H2 / I2 / I4 / W2 are still placeholders (Phase 4).

Real where the backend and program support it, mock elsewhere. (History: `hybrid` was the build-time API mode of the time; since D-80 the app has two runtime modes, Live (http only) and Demo (mock only).)

| Feature | Mode in `hybrid` | Notes |
|---|---|---|
| Sign-in, Genesis | **real** | |
| Create group Oath (C1–C8) | **real** chain + `/api/oaths/details` + `/api/invites` + `/api/oaths/watch` | reviewMode, name: local/mock until P1-1 / P1-7 |
| Create solo Oath | **mock** (stake) / real with stake 0 in `http` | D-30 |
| Join by code / QR / link (E1–E3) | **real** | error states mapped by status (P1-14) |
| Start, Cancel (D1·go, D1·x) | **real** | cancel refund claim: D-31 |
| Today list, Oaths list, D2 view, recap | Oath accounts **real** from RPC, details from `/api/oaths/:oath/details`; HP, grid and balances **computed in the app** with the engine; Oath index and proof status **mock** until the backend adds them | P0-10 |
| Daily proof F1–F5 | photo 1 **mock**, photo 2 **real** `/api/proof` (dev force, D-23) | F2b/F2c from mock |
| HP / break (D2·low, D3, L3) | engine estimate from real bitmasks; break is display-only on real Oaths | P0-5 |
| Settle | **real** (scheduler, or permissionless app fallback) | P0-9 |
| Claim (J1) | **real** `claim`; numbers per D-14 | |
| Nudge | **real** | |
| Results L1–L4 | real trigger from settled state, once per device | |

**Phone milestone:** with two phones (or two wallets): create a 3-day group Oath for 1,000 SKR → invite by QR → join on the second phone → start → take photo 1 and photo 2 → see the grid and HP update → (with a short-day Devnet build, or the mock clock) reach settlement → L screen → claim → SKR back in the wallet. Every failure screen reachable from the Dev menu scenarios.

## Phase 4: R, G, H, K, I, N, W, M (mostly mock)
Rematch, group review, Bounties (feed, detail, join, eliminated, ended, my Bounty), Create a Bounty, Profiles + Settings + avatar builder, Inbox, Wallet (W2 faucet real, swap mock), system screens M2–M4 wired globally. Real where available: faucet, price, push registration, balances. Each gap recorded.

**Status: done** (2026-10-09). Typecheck, lint and tests green (mobile: 82 tests, with end-to-end runs for Rematch, group review from the inbox, Bounty join and swap, plus a pass that opens every Phase 4 screen). Android bundle builds. All 116 design ids now have a screen. Not yet run on a phone.

| Feature | Mode in `hybrid` | Notes |
|---|---|---|
| Rematch R1–R4·lost, L6 | **mock** (offer, join, recovery); D3 / L3 / L4·b open R1 | P1-2, D-53 |
| Group review G1–G3·no | **mock**; F4a·g → G2, inbox → G1 | P1-1, D-54 |
| Bounties H1–H7, L5 | **mock** feed, detail, join, elimination, results, my Bounty stats | P1-10 |
| Create a Bounty K1–K5·ok | **mock** funding transaction + publish | P1-10, D-27, D-61 |
| Profiles, settings I1–I9 | **mock** profile, stats, activity, creator; settings on the device | P1-8, P1-9, P1-16, D-61 |
| Inbox N1, M1 | **mock** inbox; every item opens its screen | P1-11, D-56 |
| Wallet W1–W4 | balances **real** (RPC), faucet **real**, price **real**; swap **mock** | P1-12, D-59 |
| M2–M4 | global: offline → M2, not enough SOL → M3, not enough SKR → M4 (from the wallet or an API code) | P1-14 |

**Phone milestone:** walk all 116 screens on the device in mock mode via scenarios; real faucet top-up from W2; real push for a nudge and the 2 h reminder (if FCM is configured).

## Phase 4.5: Device shakedown
**Status: done, partly** (2026-10-09). First run on a device since Phase 1 (Pixel 8 emulator, API 34). Details, every fix and what's left: `docs/notes/SHAKEDOWN.md`.

- Dev-only deep link `kept://dev/open/<screen>?scenario=…` (dropped from release bundles), screenshot scripts for the app and the prototype, `artifacts/compare/index.html` (gitignored).
- 116 / 116 screens with no logcat errors or crashes; 14 / 14 flows.md happy paths pass with adb taps (`scripts/drive.mts`).
- Fixed: Hermes BigInt formatting crash (every amount), React dev perf-track crash, option tiles and Bounty cards collapsing, expired-challenge jump to F2c, keyboard covering pinned buttons, solo Oaths needing Start, wrong Rematch numbers and window, and the design's atmosphere, offsets, buttons, chips and Keeper placement.
- Typecheck, lint and tests green (mobile: 84 tests).
- **Not done:** real wallet / chain flow (needs the Seeker wallet or fakewallet, and the Devnet verifier/faucet key), back button, join link, offline and toast checked one by one on the emulator, and moving the Avatar's colours into theme tokens.

## Phase 5: Motion, haptics, Keeper, accessibility, performance, E2E
Signature animations from motion.md (HP damage/heal, money, day kept, broken, payout, Rematch) with haptics; the parametric Keeper in `react-native-svg`; Reduce Motion fallbacks; labels and 48 dp targets audited; list virtualization and a startup-time pass; Maestro smoke flows (onboarding, create, join, proof, claim) on mock scenarios.

**Mostly replaced by the fidelity pass (docs/notes/FIDELITY_PASS.md, checklist in docs/notes/FIDELITY_AUDIT.md):** the parametric Keeper (rig.ts + KeeperSvg), the per-screen KeeperMark/KeeperNote host, screen-enter choreography, the motion primitives (Pop, Enter, Bubble, NoteDrop, Knock, Shake, Tilt, Loop, CountText), the splash sequence, sheet close, haptics per motion.md and route / KeeperNote tests are done there. What stays in Phase 5: HP damage / heal on an unseen change and the BalanceChip count (S20), the accessibility audit, Maestro flows.

**Phone milestone:** the full app with motion; `maestro test .maestro/` runs green against your connected phone (Maestro install needed).
